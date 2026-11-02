#!/usr/bin/env node
/**
 * 修复「新建会话的模式选择器消失」。
 *
 * 根因（不是预设声明坏了）：
 *   DSH 客户端里那个「模式」选择器是 @deepseek-ai/dsh-client-ui-agent-preset 的
 *   AgentPresetSeat（new-session 屏幕上、标题 / 工作区选择器旁边的那颗 chip）。
 *   它的渲染条件在 lib/client.js：
 *       if (!main || !developerTools || !ready) return null;
 *   而 developerTools 来自 @deepseek-ai/dsh-client-ui-settings 的 Coding Tools 偏好
 *   `ui-settings.enabled`（lib/index.js：`enabled: z.boolean().default(true)`；
 *   命名空间常量 DEVELOPER_TOOLS_NAMESPACE = 'ui-settings'）。
 *   profile 的 cordis.patch.yml 里却写着：
 *       - id: ui-settings
 *         config:
 *           enabled: false      ← 等价于「设置 → 通用 → 显示代码工作视图」关掉
 *   于是 developerTools === false，选择器整颗被 return null 掉。
 *   @deepseek-ai/dsh-agent-preset 的 README 原话：
 *       "Coding Tools in General Settings decide whether a mode can be chosen at all:
 *        with them off the new-session picker disappears …"
 *
 * 本脚本只改这一处 `enabled: true`，其余字节一律不动；改完重跑结构断言。
 *
 * 用法：
 *   node apply-dev-tools-fix.mjs                    # 就地修 <DSH_HOME>/profiles/desktop/cordis.patch.yml
 *   node apply-dev-tools-fix.mjs --patch <path>     # 指定 patch 路径
 *   node apply-dev-tools-fix.mjs --out <path>       # 只输出修好的副本，不动原文件
 *   node apply-dev-tools-fix.mjs --check            # 只报告会改什么，不写文件
 *
 * 写 profile 目录需要完整文件权限（DSH 沙箱的 workspace-write 会拒绝）。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name, fallback) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
};

const DEFAULT_PATCH = path.join(os.homedir(), '.dsh', 'profiles', 'desktop', 'cordis.patch.yml');
const patchPath = path.resolve(value('--patch', DEFAULT_PATCH));
const outPath = value('--out', '');
const checkOnly = flag('--check');

if (!fs.existsSync(patchPath)) {
  console.error(`找不到 patch：${patchPath}`);
  process.exit(2);
}

const original = fs.readFileSync(patchPath, 'utf8');
const eol = original.includes('\r\n') ? 'CRLF' : 'LF';

/** 只认这一整个条目：`- id: ui-settings` + 它的 name + config.enabled。 */
const entryRe =
  /^(-\s*id:\s*ui-settings\r?\n\s*name:\s*["']@deepseek-ai\/dsh-client-ui-settings["']\r?\n\s*config:\r?\n\s*enabled:\s*)(false|true)\s*$/gm;

const hits = [...original.matchAll(entryRe)];
console.log(`patch：${patchPath}`);
console.log(`  字节 ${Buffer.byteLength(original, 'utf8')}，行 ${original.split('\n').length - 1}，行尾 ${eol}`);
console.log(`  命中 ui-settings 条目：${hits.length}`);

if (hits.length !== 1) {
  console.error(`ERROR: 期望恰好 1 个 "- id: ui-settings + config.enabled" 条目，实际 ${hits.length} 个。为安全起见不写文件。`);
  process.exit(1);
}

const currentValue = hits[0][2];
// 只替换值本身，值后面的空白（含行尾换行）原样保留 —— 保证只改 1 处字节。
const fixed = original.replace(entryRe, (m, head, old) => head + 'true' + m.slice(head.length + old.length));
const changed = fixed !== original;
console.log(`  当前 ui-settings.enabled = ${currentValue}`);
console.log(`  改动：${changed ? 'ui-settings.enabled: false -> true（仅此 1 行）' : '已经是 true，无需改动'}`);

// ── 结构断言（纯文本级；完整 YAML 解析另行验证）──────────────────────────────
const problems = [];
const need = (cond, label) => { if (!cond) problems.push(label); };
const count = (s, re) => (s.match(re) || []).length;

need(count(fixed, /^- /gm) === 9, '顶层条目应为 9 条（agent-default-model / ui-settings-account / ui-chat / ui-settings / 2×insert / dream-skin / ui-theme / ui-conversation）');
need(count(fixed, /^- insert:$/gm) === 2, '`- insert:` 块应为 2 个');
need(count(fixed, /^\s*- id: preset-chat\s*$/gm) === 1, 'preset-chat 声明应存在且唯一');
need(count(fixed, /^\s*- id: preset-cyrene-work\s*$/gm) === 1, 'preset-cyrene-work 声明应存在且唯一');
need(count(fixed, /^\s*plugins:\s*$/gm) >= 2, '两个预设都应带 plugins 列表');
need(count(fixed, /语气与温度/g) >= 2, '正文应仍含新小节「语气与温度」');
need(!/['"]dsh-cyrene\//.test(fixed), '不应出现裸 dsh-cyrene/ 说明符');
need(count(fixed, /@deepseek-ai\/dsh-agent-preset/g) === 2, '预设说明符应为 @deepseek-ai/dsh-agent-preset（2 处）');
for (const label of ['dsh-cyrene-persona/memory', 'dsh-cyrene-persona/nickname', 'dsh-cyrene-persona/worldbook']) {
  need(fixed.includes(label), `插件行 ${label} 应存在`);
}

for (const p of problems) console.log(`  FAIL ${p}`);
console.log(problems.length === 0 ? '  结构断言：全部通过' : `  结构断言：${problems.length} 项失败`);

if (checkOnly) {
  console.log('--check：没有写文件。');
  process.exit(problems.length === 0 ? 0 : 1);
}

if (outPath) {
  const dest = path.resolve(outPath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, fixed, 'utf8');
  console.log(`已写出修好的副本：${dest}（${fs.statSync(dest).size} 字节）`);
} else {
  // 备份：<patch>.before-fix（已存在则加时间戳，绝不覆盖旧备份）
  let backup = `${patchPath}.before-fix`;
  if (fs.existsSync(backup)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    backup = `${patchPath}.before-fix.${stamp}`;
    console.log(`  .before-fix 已存在，本次备份另存：${backup}`);
  }
  fs.copyFileSync(patchPath, backup);
  console.log(`备份：${backup}（${fs.statSync(backup).size} 字节）`);
  if (changed) {
    fs.writeFileSync(patchPath, fixed, 'utf8');
    console.log(`已改写：${patchPath}（${fs.statSync(patchPath).size} 字节）`);
  } else {
    console.log('原文件未改动。');
  }
}

process.exit(problems.length === 0 ? 0 : 1);
