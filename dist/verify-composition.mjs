// Verify a dumped profile tree: which bundle layers applied, and whether every plugin
// row of every agent preset resolves to a real module on this machine.
// Run with Electron-as-Node so app.asar paths are readable.
import fs from 'node:fs';

const [dumpPath, profileDir = 'C:/Users/zsh/.dsh/profiles/desktop'] = process.argv.slice(2);
const APP =
  'C:/Users/zsh/AppData/Local/Programs/DeepSeek Harness/resources/app.asar/dsh/node_modules/@deepseek-ai';

const dump = fs.readFileSync(dumpPath, 'utf8');
const lines = dump.split('\n');

// Bundle layers that patched the tree.
const layers = [...new Set(lines.filter((l) => l.startsWith('# ==')).map((l) => l.replace(/^# == /, '').trim()))];
console.log('bundle layers in tree:');
for (const l of layers) console.log(`  - ${l}`);

// Split into top-level entries and collect each entry's plugin rows.
function rows(body) {
  const out = [];
  for (let i = 0; i < body.length - 1; i += 1) {
    const m = /^(\s*)- id: (.+?)\s*$/.exec(body[i]);
    if (!m) continue;
    const name = /^(\s*)name: '(.+)'\s*$/.exec(body[i + 1]);
    if (!name || name[1].length !== m[1].length + 2) continue;
    out.push({ id: m[2], module: name[2] });
  }
  return out;
}

const entries = [];
let current = null;
for (const line of lines) {
  const m = /^- id: (.+?)\s*$/.exec(line);
  if (m) {
    current = { id: m[1], body: [] };
    entries.push(current);
    continue;
  }
  if (current) current.body.push(line);
}
const ids = new Set(entries.map((e) => e.id));
console.log(`\ntop-level entries: ${entries.length}`);

/** Does a module specifier resolve? */
function resolves(spec) {
  if (spec.startsWith('@deepseek-ai/')) {
    const [scope, pkg, ...rest] = spec.split('/');
    const pkgDir = `${APP}/${pkg}`;
    if (!fs.existsSync(pkgDir)) return { ok: false, where: pkgDir };
    if (rest.length === 0) return { ok: true, where: pkgDir };
    const manifestPath = `${pkgDir}/package.json`;
    if (!fs.existsSync(manifestPath)) return { ok: false, where: manifestPath };
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const key = `./${rest.join('/')}`;
    const has = Object.keys(manifest.exports ?? {}).some((k) => k === key || k.replace(/\/\*$/, '') === key);
    return { ok: has, where: `${pkgDir} exports ${key}` };
  }
  const [name, ...rest] = spec.split('/');
  const base = `${profileDir}/node_modules/${name}`;
  if (!fs.existsSync(base)) return { ok: false, where: base };
  if (rest.length === 0) return { ok: true, where: base };
  const manifestPath = `${base}/package.json`;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const key = `./${rest.join('/')}`;
  const target = manifest.exports?.[key];
  if (typeof target === 'string') {
    const file = `${base}/${target.replace(/^\.\//, '')}`;
    return { ok: fs.existsSync(file), where: file };
  }
  return { ok: false, where: `${base} exports ${key}` };
}

// Check every agent-preset entry, plus the profile-level plugin rows of the plugins under test.
const presetEntries = entries.filter((e) => e.body.some((l) => l.includes("'@deepseek-ai/dsh-agent-preset'")));
console.log(`agent presets in tree: ${presetEntries.map((e) => e.id).join(', ')}`);

let problems = 0;
for (const preset of presetEntries) {
  const pluginRows = rows(preset.body).filter((r) => r.module !== '@deepseek-ai/dsh-agent-preset');
  const bad = [];
  for (const row of pluginRows) {
    const { ok, where } = resolves(row.module);
    if (!ok) {
      bad.push(`${row.id} -> ${row.module} (${where})`);
      problems += 1;
    }
  }
  const label = preset.id.startsWith('preset-chat') || preset.id.startsWith('preset-cyrene') ? '  <== ours' : '';
  console.log(`  ${preset.id}: ${pluginRows.length} rows, ${bad.length} unresolved${label}`);
  for (const b of bad) console.log(`      MISS ${b}`);
}

// The visual plugins must have inserted their own rows.
for (const wanted of ['dsh-cyrene-persona', 'dsh-meme', 'dsh-dream-skin', 'dsh-cyrene']) {
  console.log(`  bundle row ${wanted}: ${ids.has(wanted) ? 'present' : 'MISSING'}`);
}

console.log(problems === 0 ? '\nRESULT: every preset module row resolves' : `\nRESULT: ${problems} unresolved row(s)`);
process.exitCode = problems === 0 ? 0 : 1;
