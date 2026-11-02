// Minimal asar reader: list entries, or grep file contents for a pattern.
// usage: node _asar.mjs list <pathPrefix>
//        node _asar.mjs grep <regex> <pathPrefix>
import fs from 'node:fs';

const ASAR = 'C:/Users/zsh/AppData/Local/Programs/DeepSeek Harness/resources/app.asar';
const fd = fs.openSync(ASAR, 'r');

const head = Buffer.alloc(20);
fs.readSync(fd, head, 0, 20, 0);
// asar header = Pickle( [pickleSize][headerPickleSize] ) + Pickle( [payloadSize][stringLen][json] )
const headerPickleSize = head.readUInt32LE(4);
const jsonLen = head.readUInt32LE(12);
const baseOffset = 8 + headerPickleSize;
const json = Buffer.alloc(jsonLen);
fs.readSync(fd, json, 0, jsonLen, 16);
let header;
try {
  header = JSON.parse(json.toString('utf8'));
} catch (err) {
  console.error(`asar header parse failed: ${err.message}`);
  console.error(`  first bytes: ${json.subarray(0, 24).toString('hex')}`);
  process.exit(1);
}

const [mode, arg1, arg2] = process.argv.slice(2);

/** Flatten the tree into [{path, size, offset}]. */
function walk(node, prefix, out) {
  for (const [name, entry] of Object.entries(node.files ?? {})) {
    const p = prefix === '' ? name : `${prefix}/${name}`;
    if (entry.files) walk(entry, p, out);
    else out.push({ path: p, size: Number(entry.size), offset: Number(entry.offset), unpacked: entry.unpacked === true });
  }
  return out;
}
const files = walk(header, '', []);
console.log(`asar entries: ${files.length} files, baseOffset=${baseOffset}`);

if (mode === 'list') {
  const needle = arg1 ?? '';
  for (const f of files.filter((f) => f.path.includes(needle)).slice(0, 60)) {
    console.log(`  ${String(f.size).padStart(9)}  ${f.path}`);
  }
} else if (mode === 'cat') {
  const hit = files.find((f) => f.path.endsWith(arg1) && !f.unpacked && Number.isFinite(f.offset));
  if (!hit) {
    console.log(`(no packed entry ending with ${arg1})`);
  } else {
    const buf = Buffer.alloc(hit.size);
    fs.readSync(fd, buf, 0, hit.size, baseOffset + hit.offset);
    fs.writeFileSync(arg2, buf);
    console.log(`wrote ${hit.size} bytes -> ${arg2}`);
  }
} else if (mode === 'grep') {
  const re = new RegExp(arg1, 'g');
  const prefix = arg2 ?? '';
  let scanned = 0;
  const hits = new Map();
  for (const f of files) {
    if (!f.path.includes(prefix)) continue;
    if (!/\.(js|mjs|css|json|html)$/.test(f.path)) continue;
    if (f.size > 40 * 1024 * 1024) continue;
    if (f.unpacked || !Number.isFinite(f.offset)) continue;
    const buf = Buffer.alloc(f.size);
    fs.readSync(fd, buf, 0, f.size, baseOffset + f.offset);
    const text = buf.toString('utf8');
    scanned += 1;
    for (const m of text.matchAll(re)) {
      const key = m[0];
      if (!hits.has(key)) hits.set(key, new Set());
      hits.get(key).add(f.path);
    }
  }
  console.log(`scanned ${scanned} text files under "${prefix}"`);
  for (const [key, where] of [...hits].slice(0, 30)) {
    console.log(`  ${key}  <- ${[...where].slice(0, 3).join(', ')}${where.size > 3 ? ` (+${where.size - 3})` : ''}`);
  }
  if (hits.size === 0) console.log('  (no match)');
}
fs.closeSync(fd);
