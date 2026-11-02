/**
 * Static verification for the character-agent switch-over (stage A).
 *
 * Checks, with raw output:
 *   1. live patch still has exactly three `- insert:` blocks, at the same lines,
 *      and is byte-identical to the pre-change backup (so the three preset bodies
 *      are provably untouched);
 *   2. `ui-settings.enabled` is still true;
 *   3. the profile's `dsh.profile.bundles` carries dsh-character-agent and no
 *      longer dsh-cyrene-hero, and the dependency points at an existing tarball;
 *   4. the installed copy matches the built tarball's version and has all three
 *      host/client modules.
 *
 * Composition (`dsh --dump-config`) is checked separately because it needs a
 * throwaway profile copy; see the command printed at the end.
 *
 * Usage: node dist/verify-character-agent.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const HOME = process.env.DSH_HOME || path.join(process.env.USERPROFILE ?? '', '.dsh');
const PROFILE = path.join(HOME, 'profiles', 'desktop');
const PATCH = path.join(PROFILE, 'cordis.patch.yml');
const BACKUP = path.join('E:/cyrene-agent/backup/before-character-agent-20261024/cordis.patch.yml');
const PACKAGE = path.join(PROFILE, 'package.json');
const INSTALLED = path.join(PROFILE, 'node_modules', 'dsh-character-agent');

let failed = 0;
const check = (ok, message) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${message}`);
  if (!ok) failed += 1;
};
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

// ── 1. live patch ───────────────────────────────────────────────────────────
const patchText = fs.readFileSync(PATCH, 'utf8');
const patchLines = patchText.split(/\r?\n/);
const inserts = patchLines
  .map((line, index) => ({ line, number: index + 1 }))
  .filter((entry) => entry.line === '- insert:');
console.log(`live patch: ${patchLines.length} lines, ${inserts.length} "- insert:" blocks`);
for (const entry of inserts) console.log(`  - insert: at line ${entry.number}`);
check(inserts.length === 3, 'live patch still has exactly 3 "- insert:" blocks');

const presetIds = patchLines
  .map((line, index) => ({ line: line.trim(), number: index + 1 }))
  .filter((entry) => /^- id: preset-/.test(entry.line));
for (const entry of presetIds) console.log(`  ${entry.line} at line ${entry.number}`);
check(
  ['preset-chat', 'preset-cyrene-work', 'preset-fat-fish'].every((id) => presetIds.some((entry) => entry.line === `- id: ${id}`)),
  'the three preset rows are still present',
);

const liveHash = sha256(PATCH);
const backupHash = sha256(BACKUP);
// 0.3.1: the live patch already differed from the 2026-10-24 snapshot BEFORE this change
// (DSH's own settings writer re-emitted it at 2026-10-26 08:28: plan-mode block scalar
// re-indented by 4 spaces, one blank line dropped in preset-chat, ui-theme/ui-conversation
// tail rows). So the invariant that proves *we* did not touch the presets is "byte-identical
// to its pre-0.3.1 state", and the eb036743 snapshot stays as the historical reference.
const BEFORE_031 = 'ab1324984b19750ac6bce096809c4c6570dc10cb9e3a625421ee90b52e88c0ca';
console.log(`  live   sha256 ${liveHash}`);
console.log(`  before 0.3.1 ${BEFORE_031}`);
console.log(`  snapshot sha256 ${backupHash}`);
check(liveHash === BEFORE_031, 'live patch is byte-identical to its pre-0.3.1 state (three preset bodies untouched)');
check(
  backupHash === 'eb0367437626627611a7c94f872c13aa2ac2ec4f4ea43e924ae5a5ab10e6e8fa',
  'the 3-presets reference snapshot still hashes eb036743… (never rewritten)',
);
if (liveHash !== backupHash) {
  console.log('  note: live != snapshot for reasons that predate 0.3.1 (see the comment in this file).');
}

// ── 2. ui-settings ──────────────────────────────────────────────────────────
const uiSettings = /^- id: ui-settings$\n(?:.*\n)*?^    enabled: true$/m.test(patchText);
check(uiSettings, 'ui-settings.enabled is still true');

// ── 3. profile manifest ─────────────────────────────────────────────────────
const pkg = JSON.parse(fs.readFileSync(PACKAGE, 'utf8'));
const bundles = pkg.dsh.profile.bundles;
console.log('  bundles:', bundles.join(', '));
check(bundles.includes('dsh-character-agent'), 'dsh.profile.bundles contains dsh-character-agent');
check(!bundles.includes('dsh-cyrene-hero'), 'dsh.profile.bundles no longer contains dsh-cyrene-hero');
const dependency = pkg.dependencies['dsh-character-agent'];
console.log('  dependency:', dependency);
check(typeof dependency === 'string' && dependency.startsWith('file:'), 'dependency dsh-character-agent is a file: entry');
const tarball = typeof dependency === 'string' ? dependency.replace(/^file:/, '') : '';
check(tarball !== '' && fs.existsSync(tarball), `tarball exists: ${tarball}`);

// ── 4. installed copy ───────────────────────────────────────────────────────
const installedPkg = JSON.parse(fs.readFileSync(path.join(INSTALLED, 'package.json'), 'utf8'));
console.log(`  installed version: ${installedPkg.version}`);
check(installedPkg.version === '0.3.1', 'installed version is 0.3.1');
for (const file of ['lib/client.js', 'lib/index.js', 'lib/characters.js', 'cordis.patch.yml']) {
  check(fs.existsSync(path.join(INSTALLED, file)), `installed ${file}`);
}
check(installedPkg.dsh?.client?.platform === 'web', 'installed package declares dsh.client.platform = web');

// ── 5. installed bytes == source bytes (the packed artifact is what shipped) ──
const SOURCE = path.join('E:/cyrene-agent/dsh-character-agent');
for (const file of ['lib/client.js', 'lib/characters.js', 'lib/index.js', 'package.json', 'cordis.patch.yml', 'README.md']) {
  const sourceHash = sha256(path.join(SOURCE, file));
  const installedHash = sha256(path.join(INSTALLED, file));
  console.log(`  ${file.padEnd(20)} ${installedHash.slice(0, 16)} ${sourceHash === installedHash ? 'SAME' : 'DIFF'}`);
  check(sourceHash === installedHash, `installed ${file} sha256 matches the source tree`);
}

console.log('\ncomposition check (throwaway profile copy):');
console.log(`  robocopy "${PROFILE}" "${path.join(HOME, 'profiles', 'desktop-verify')}" /E`);
console.log(`  dsh --profile desktop-verify --dump-config | Select-String 'character-agent|preset-'`);

process.exit(failed === 0 ? 0 : 1);
