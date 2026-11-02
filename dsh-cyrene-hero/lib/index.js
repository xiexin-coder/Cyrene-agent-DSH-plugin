/**
 * dsh-cyrene-hero — host half.
 *
 * Four static routes, all fed from folders you own (no repack to change content):
 *
 *   /cyrene-hero/<file>       ->  <DSH_HOME>/hero-assets/   the hero image
 *   /cyrene-bgm/<file>        ->  <DSH_HOME>/bgm/           background music
 *   /cyrene-wallpaper/<file>  ->  <DSH_HOME>/wallpaper/     image or video wallpaper
 *   /cyrene-fonts/<file>      ->  <DSH_HOME>/fonts/         the bundled 霞鹜文楷
 *   /cyrene-bgm/index.json, /cyrene-wallpaper/index.json    auto-generated file lists
 *
 * DSH_HOME defaults to ~/.dsh. Routes sit behind DSH's own authentication.
 * Everything is served with Range support (206), which <video>/<audio> expect.
 * @module dsh-cyrene-hero
 */
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { homedir } from 'node:os';

export const name = 'cyrene-hero';
export const inject = ['webServer'];

const HOME = process.env.DSH_HOME || join(homedir(), '.dsh');


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

/** Route table: prefix -> folder + which extensions the index lists. */
const FOLDERS = [
  { prefix: '/cyrene-hero', dir: join(HOME, 'hero-assets'), list: null },
  { prefix: '/cyrene-bgm', dir: join(HOME, 'bgm'), list: AUDIO_EXT },
  { prefix: '/cyrene-wallpaper', dir: join(HOME, 'wallpaper'), list: new Set([...IMAGE_EXT, ...VIDEO_EXT]) },
  { prefix: '/cyrene-fonts', dir: join(HOME, 'fonts'), list: null },
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

export function apply(ctx) {
  ctx?.logger?.info?.(
    `[dsh-cyrene-hero] folders: ${FOLDERS.map((f) => `${f.prefix} -> ${f.dir}`).join(' | ')}`,
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
              res.end('dsh-cyrene-hero: invalid path');
              return;
            }
            if (!existsSync(file)) {
              res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
              res.end(`dsh-cyrene-hero: not found — put the file at ${file}`);
              return;
            }
            serveFile(req, res, file);
          },
        }),
      `cyrene-hero: ${folder.prefix} route`,
    );
  }
}
