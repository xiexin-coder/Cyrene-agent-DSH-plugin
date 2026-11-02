// Replace the dsh-cyrene-persona preset declaration blocks **in place** inside a
// profile's cordis.patch.yml, keeping every other row (and every row that sits
// AFTER the preset blocks) untouched.
//
// 为什么需要它（读我）：
//   dist/apply-preset-declarations.mjs 是 2026-10-07 写的，做法是「砍掉从 chat
//   头注释起的全部内容，再把新片段追加到文件末尾」。当时预设块就在文件末尾，
//   所以没问题。现在 profile 的 cordis.patch.yml 末尾还多出三行**别的插件的覆盖行**
//   （dream-skin disabled / ui-theme / ui-conversation）—— 用老脚本会把它们**整段删掉**，
//   而且是静默的（脚本只检查 preset-chat / preset-cyrene-work 在不在）。
//
// 用法：
//   node apply-preset-declarations-inplace.mjs <cordis.patch.yml> <preset-declarations.yml> [--check]
//
// --check 只报告会改动哪些行区间，不写文件。
import fs from 'node:fs';

const [patchPath, fragmentPath, ...flags] = process.argv.slice(2);
const checkOnly = flags.includes('--check');
if (!patchPath || !fragmentPath) {
  console.error('usage: node apply-preset-declarations-inplace.mjs <cordis.patch.yml> <preset-declarations.yml> [--check]');
  process.exit(2);
}

const lines = fs.readFileSync(patchPath, 'utf8').split('\n');
const fragment = fs.readFileSync(fragmentPath, 'utf8').replace(/\r\n/g, '\n').replace(/\s*$/, '\n');

/** 顶格（非缩进）、非空、非注释的行 —— 也就是 patch 数组里的真实条目行。 */
const isTopLevelEntry = (l) => l.length > 0 && !l.startsWith(' ') && !l.startsWith('#') && l.trim() !== '';

// 块起点：第一个声明了 preset-chat / preset-cyrene-work 的 `- insert:`，
// 连带它上面的那行 `# ── …（id: …）` 头注释。
let start = -1;
for (let i = 0; i < lines.length; i += 1) {
  if (/^- insert:$/.test(lines[i]) && lines.slice(i, i + 4).some((l) => /id: preset-(chat|cyrene-work)/.test(l))) {
    start = i;
    break;
  }
}
if (start === -1) {
  console.error('ERROR: 这个 patch 里找不到 dsh-cyrene-persona 的预设声明块（`- insert:` + preset-chat）。');
  process.exit(1);
}
while (start > 0 && lines[start - 1].startsWith('#')) start -= 1;
while (start > 0 && lines[start - 1].trim() === '') start -= 1;

// 块终点：起点之后第一条**顶格且不是 `- insert:`** 的条目行；再把紧贴着它的
// 注释行与空行留给它自己（它们是下一行的说明，不属于预设块）。
let end = -1;
for (let i = start + 1; i < lines.length; i += 1) {
  if (isTopLevelEntry(lines[i]) && !/^- insert:$/.test(lines[i])) { end = i; break; }
}
if (end === -1) end = lines.length;
while (end > start && (lines[end - 1].trim() === '' || lines[end - 1].startsWith('#'))) end -= 1;

const keptHead = lines.slice(0, start).join('\n').replace(/\s*$/, '\n');
const keptTail = lines.slice(end).join('\n').replace(/^\s*/, '\n');

// 断言：既有功能性行一个都不能少（这是老脚本缺的那道护栏）。
const required = ['preset-chat', 'preset-cyrene-work', 'cyrene-nickname', 'cyrene-memory', 'dsh-cyrene-persona/worldbook'];
const out = keptHead + '\n' + fragment + keptTail;
const missing = required.filter((needle) => !out.includes(needle));
const tailRows = lines.slice(end).filter(isTopLevelEntry).map((l) => l.trim());

console.log(`区域：第 ${start + 1} 行 ～ 第 ${end} 行（共 ${end - start} 行）将被替换为 ${fragment.split('\n').length - 1} 行`);
console.log(`保留的尾部条目（${tailRows.length}）：${tailRows.join(' | ') || '(无)'}`);
for (const [label, ok] of [
  ['preset-chat 仍在', !missing.includes('preset-chat')],
  ['preset-cyrene-work 仍在', !missing.includes('preset-cyrene-work')],
  ['cyrene-nickname / memory / worldbook 仍在', !missing.some((m) => m.startsWith('cyrene') || m.includes('worldbook'))],
  ['无残留的裸 dsh-cyrene/ 说明符', !/['"]dsh-cyrene\//.test(out)],
  ['新片段含新小节「语气与温度」', (fragment.match(/语气与温度/g) || []).length >= 2],
]) {
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${label}`);
}

if (checkOnly) {
  console.log('--check：没有写文件。');
} else {
  fs.writeFileSync(patchPath, out, 'utf8');
  console.log(`已改写：${patchPath}（${fs.statSync(patchPath).size} 字节，${out.split('\n').length} 行）`);
}
process.exitCode = missing.length === 0 ? 0 : 1;
