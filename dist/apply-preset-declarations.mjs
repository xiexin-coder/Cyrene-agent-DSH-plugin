// Write the dsh-cyrene-persona preset declarations into a profile's cordis.patch.yml,
// replacing any previously written block (idempotent, byte-exact UTF-8).
import fs from 'node:fs';

const [patchPath, fragmentPath] = process.argv.slice(2);
if (!patchPath || !fragmentPath) {
  console.error('usage: node apply-preset-declarations.mjs <cordis.patch.yml> <preset-declarations.yml>');
  process.exit(2);
}

const lines = fs.readFileSync(patchPath, 'utf8').split('\n');

// Cut from the first header comment the generator writes for the chat preset.
let cut = lines.findIndex((l) => /^# ── .*id: chat/.test(l));
if (cut === -1) {
  // Defensive: locate the insert block that declares preset-chat.
  const insert = lines.findIndex((l, i) => /^- insert:$/.test(l) && lines.slice(i, i + 3).some((x) => x.includes('id: preset-chat')));
  cut = insert;
}
if (cut === -1) {
  console.log('note: no previous dsh-cyrene preset block found; appending only');
} else {
  while (cut > 0 && lines[cut - 1].trim() === '') cut -= 1;
}

const kept = (cut === -1 ? lines : lines.slice(0, cut)).join('\n').replace(/\s*$/, '\n');
const fragment = fs.readFileSync(fragmentPath, 'utf8');

// The old declarations pointed at the package name we just renamed away.
if (/['"]dsh-cyrene\//.test(fragment)) {
  console.error('ERROR: fragment still references the bare dsh-cyrene/ specifier; regenerate it from the renamed source');
  process.exit(1);
}

fs.writeFileSync(patchPath, kept + '\n' + fragment, 'utf8');

const text = fs.readFileSync(patchPath, 'utf8');
const checks = {
  'preset-chat present': text.includes('id: preset-chat'),
  'preset-cyrene-work present': text.includes('id: preset-cyrene-work'),
  'renamed modules present': text.includes('dsh-cyrene-persona/memory') && text.includes('dsh-cyrene-persona/worldbook'),
  'no stale bare specifier': !/['"]dsh-cyrene\//.test(text),
};
console.log(`patch rewritten: ${patchPath} (${fs.statSync(patchPath).size} bytes, ${text.split('\n').length} lines)`);
for (const [name, ok] of Object.entries(checks)) console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${name}`);
process.exitCode = Object.values(checks).every(Boolean) ? 0 : 1;
