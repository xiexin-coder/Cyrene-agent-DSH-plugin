/**
 * dsh-character-agent — host half.
 *
 * Asset routes (unchanged from dsh-cyrene-hero, same paths and same folders, so
 * existing hero.json / wallpaper pairs / music keep working):
 *
 *   /cyrene-hero/<file>       ->  <DSH_HOME>/hero-assets/   the hero picture + hero.json
 *   /cyrene-bgm/<file>        ->  <DSH_HOME>/bgm/           background music
 *   /cyrene-wallpaper/<file>  ->  <DSH_HOME>/wallpaper/     image or video wallpaper
 *   /cyrene-fonts/<file>      ->  <DSH_HOME>/fonts/         the bundled 霞鹜文楷
 *   /cyrene-bgm/index.json, /cyrene-wallpaper/index.json    auto-generated file lists
 *
 * New character routes:
 *
 *   /character-agent/registry.json     the character registry (lib/characters.js)
 *   /character-agent/mode              GET: last reported mode; POST: client report
 *   /character-agent/fat-fish/<file>   the whale-girl package's assets/ (read-only)
 *   /character-agent/fat-fish/index.json
 *   /character-agent/diag              what resolved where (support / verification)
 *
 * DSH_HOME defaults to ~/.dsh. Routes sit behind DSH's own authentication.
 * Everything is served with Range support (206), which <video>/<audio> expect.
 * @module dsh-character-agent
 */
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildRegistry, characterForPreset, ROUTES } from './characters.js';

export const name = 'character-agent';
export const inject = ['webServer'];

const HOME = process.env.DSH_HOME || join(homedir(), '.dsh');
const HERE = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(HOME, 'character-agent');
const STATE_FILE = join(STATE_DIR, 'state.json');
const OVERRIDE_FILE = join(STATE_DIR, 'characters.json');

const MIME = {
  // images
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  // fonts
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.ttc': 'font/collection',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  // audio
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  // video
  '.mp4': 'video/mp4',
  '.m4v': 'video/x-m4v',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
};

const IMAGE_EXT = new Set(['.png', '.webp', '.jpg', '.jpeg', '.gif', '.avif']);
const AUDIO_EXT = new Set(['.mp3', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.wav', '.flac']);
const VIDEO_EXT = new Set(['.mp4', '.m4v', '.webm', '.mov', '.mkv']);
const MEDIA_EXT = new Set([...IMAGE_EXT, ...VIDEO_EXT, ...AUDIO_EXT]);

/** Route table: prefix -> folder + which extensions the index lists. */
const FOLDERS = [
  { prefix: ROUTES.hero, dir: join(HOME, 'hero-assets'), list: null },
  { prefix: ROUTES.bgm, dir: join(HOME, 'bgm'), list: AUDIO_EXT },
  { prefix: ROUTES.wallpaper, dir: join(HOME, 'wallpaper'), list: new Set([...IMAGE_EXT, ...VIDEO_EXT]) },
  { prefix: ROUTES.fonts, dir: join(HOME, 'fonts'), list: null },
];

/** Resolve a request path inside a root (traversal-proof). */
function resolveInside(root, rel) {
  if (rel.length === 0) return undefined;
  const candidate = resolve(join(root, rel));
  return candidate === root || candidate.startsWith(root + sep) ? candidate : undefined;
}

/** Serve one file, honouring a single Range request. */
function serveFile(req, res, file) {
  const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
  const size = statSync(file).size;
  const range = req.headers?.range;
  if (typeof range === 'string') {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m !== null) {
      const suffix = m[1] === '';
      let start = suffix ? size - Number(m[2]) : Number(m[1]);
      let end = suffix || m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
      if (!Number.isFinite(start) || start < 0) start = 0;
      if (end > size - 1) end = size - 1;
      if (start > end) {
        res.writeHead(416, { 'content-range': `bytes */${size}` });
        res.end();
        return;
      }
      res.writeHead(206, {
        'content-type': type,
        'content-length': end - start + 1,
        'content-range': `bytes ${start}-${end}/${size}`,
        'accept-ranges': 'bytes',
        'cache-control': 'no-store',
      });
      createReadStream(file, { start, end }).pipe(res);
      return;
    }
  }
  res.writeHead(200, {
    'content-type': type,
    'content-length': size,
    'accept-ranges': 'bytes',
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(res);
}

/** Folder contents for the client's pickers. */
function listFolder(dir, allowed) {
  let files = [];
  try {
    files = readdirSync(dir)
      .filter((f) => allowed === null || allowed.has(extname(f).toLowerCase()))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    files = [];
  }
  return { dir, files, tracks: files };
}

/**
 * Where the fat-fish materials come from. Every existing candidate contributes
 * files; earlier candidates win on a name clash. That matters because the packed
 * `dsh-whale-girl` tarball ships `whale-girl.png` + `poses/` + the two mp3s but
 * NOT `background.png`, so the wallpaper is seeded into
 * `<DSH_HOME>/character-agent/fat-fish/` while the pet sprites stay in the
 * package — and the package itself is only ever read.
 * @returns {{ dirs: { dir: string, files: string[] }[], files: string[], tried: string[] }}
 */
function resolveFatFishAssets() {
  const profileModules = resolve(join(HERE, '..', '..')); // <profile>/node_modules
  const tried = [
    process.env.CHARACTER_AGENT_FATFISH_ASSETS,
    join(STATE_DIR, 'fat-fish'),
    join(profileModules, 'dsh-whale-girl', 'assets'),
    join(HERE, '..', 'assets'),
  ].filter((value) => typeof value === 'string' && value.length > 0);
  const dirs = [];
  const files = new Set();
  for (const dir of tried) {
    try {
      if (!statSync(dir).isDirectory()) continue;
      const own = listFolder(dir, MEDIA_EXT).files;
      const poses = listFolder(join(dir, 'poses'), MEDIA_EXT).files.map((f) => `poses/${f}`);
      const all = [...own, ...poses];
      if (all.length === 0) continue;
      dirs.push({ dir, files: all });
      for (const file of all) files.add(file);
    } catch {
      /* try the next candidate */
    }
  }
  return { dirs, files: [...files].sort((a, b) => a.localeCompare(b)), tried };
}

/** Resolve one fat-fish file against the candidate dirs, in priority order. */
function resolveFatFishFile(assets, rel) {
  for (const entry of assets.dirs) {
    const candidate = resolveInside(entry.dir, rel);
    if (candidate !== undefined && existsSync(candidate)) return candidate;
  }
  return undefined;
}

/** Read `<DSH_HOME>/character-agent/characters.json` (optional). */
function readOverride() {
  try {
    const raw = readFileSync(OVERRIDE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** Last mode report, persisted so a restart can show it in diag before any session. */
function readState() {
  try {
    const parsed = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    return parsed !== null && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeState(state) {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch {
    /* the in-memory copy below is still authoritative for this process */
  }
}

function readJson(req, limit = 65536) {
  return new Promise((resolveBody) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        req.destroy();
        resolveBody(undefined);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolveBody(parsed !== null && typeof parsed === 'object' ? parsed : undefined);
      } catch {
        resolveBody(undefined);
      }
    });
    req.on('error', () => resolveBody(undefined));
  });
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

/**
 * Mount every route. All registrations go through `ctx.effect` so a reload of
 * this plugin unregisters exactly what it added.
 * @param ctx cordis host context carrying `webServer`.
 */
export function apply(ctx) {
  const assets = resolveFatFishAssets();
  const registry = buildRegistry({ override: readOverride(), fatFishAssets: assets });
  /** Last mode the browser reported (in-memory authority for this process). */
  let mode = { ...readState() };

  ctx?.logger?.info?.(
    `[dsh-character-agent] assets: ${FOLDERS.map((f) => `${f.prefix} -> ${f.dir}`).join(' | ')} | fat-fish -> ${assets.dirs.map((entry) => entry.dir).join(' + ') || '(not found)'}`,
  );

  for (const folder of FOLDERS) {
    ctx.effect(
      () =>
        ctx.webServer.register({
          kind: 'prefix',
          path: folder.prefix,
          handler: (req, res) => {
            const url = new URL(req.url ?? '/', 'http://localhost');
            const rel = decodeURIComponent(url.pathname.slice(folder.prefix.length + 1));
            if (folder.list !== null && rel === 'index.json') {
              res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
              res.end(JSON.stringify(listFolder(folder.dir, folder.list)));
              return;
            }
            const file = resolveInside(folder.dir, rel);
            if (file === undefined) {
              res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
              res.end('dsh-character-agent: invalid path');
              return;
            }
            if (!existsSync(file)) {
              res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
              res.end(`dsh-character-agent: not found — put the file at ${file}`);
              return;
            }
            serveFile(req, res, file);
          },
        }),
      `character-agent: ${folder.prefix} route`,
    );
  }

  // ── fat-fish materials (read-only view of dsh-whale-girl/assets) ──────────
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: ROUTES.fatFish,
        handler: (req, res) => {
          const url = new URL(req.url ?? '/', 'http://localhost');
          const rel = decodeURIComponent(url.pathname.slice(ROUTES.fatFish.length + 1));
          if (rel === 'index.json') {
            sendJson(res, 200, { dirs: assets.dirs.map((entry) => entry.dir), files: assets.files, tracks: assets.files });
            return;
          }
          const file = resolveFatFishFile(assets, rel);
          if (file === undefined) {
            res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
            res.end(`dsh-character-agent: fat-fish asset ${rel} not found (tried ${assets.dirs.map((e) => e.dir).join(' | ') || 'no dir'})`);
            return;
          }
          serveFile(req, res, file);
        },
      }),
    'character-agent: fat-fish route',
  );

  // ── registry ─────────────────────────────────────────────────────────────
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: `${ROUTES.api}/registry.json`,
        handler: (req, res) => {
          sendJson(res, 200, {
            ...registry,
            assets: {
              dirs: assets.dirs.map((entry) => entry.dir),
              files: assets.files,
              tried: assets.tried,
            },
          });
        },
      }),
    'character-agent: registry route',
  );

  // ── character / mode status ──────────────────────────────────────────────
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: `${ROUTES.api}/mode`,
        handler: async (req, res) => {
          if (req.method === 'POST') {
            const body = await readJson(req);
            if (body === undefined) {
              sendJson(res, 400, { ok: false, error: 'invalid json body' });
              return;
            }
            const presetId = typeof body.presetId === 'string' ? body.presetId : undefined;
            const character = characterForPreset(registry, presetId);
            mode = {
              presetId: presetId ?? null,
              character,
              sessionId: typeof body.sessionId === 'string' ? body.sessionId : null,
              source: typeof body.source === 'string' ? body.source : 'client',
              updatedAt: new Date().toISOString(),
            };
            writeState(mode);
            sendJson(res, 200, { ok: true, ...mode });
            return;
          }
          sendJson(res, 200, {
            ok: true,
            presetId: mode.presetId ?? null,
            character: mode.character ?? characterForPreset(registry, undefined),
            sessionId: mode.sessionId ?? null,
            source: mode.source ?? 'none',
            updatedAt: mode.updatedAt ?? null,
          });
        },
      }),
    'character-agent: mode route',
  );

  // ── diagnostics ──────────────────────────────────────────────────────────
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: `${ROUTES.api}/diag`,
        handler: (req, res) => {
          sendJson(res, 200, {
            ok: true,
            home: HOME,
            routes: FOLDERS.map((f) => ({ path: f.prefix, dir: f.dir, exists: existsSync(f.dir) })),
            fatFish: assets,
            registryFile: OVERRIDE_FILE,
            stateFile: STATE_FILE,
            mode,
            characters: Object.keys(registry.characters),
          });
        },
      }),
    'character-agent: diag route',
  );
}
