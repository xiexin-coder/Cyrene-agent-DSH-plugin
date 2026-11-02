# dsh-character-agent 0.3.1

多角色外观框架：按**当前会话的 agent preset** 在 `昔涟` / `蓝色大肥鱼` 之间切换皮肤强调色、
首屏图与问候语、壁纸、BGM、字体、桌宠门控，外加 0.2.0 的**对话框 / 代码块不透明度**、
**大肥鱼星空底 + 星星粒子**，以及 0.3.1 的**让位（hand-over）**：大肥鱼整套外观交给皮肤中心的
`mid-autumn`（桂影月华），本插件在那套模式下一笔不画。

## 0.3.1 改了什么：切换要「全局都变干净」

用户原话：「切换皮肤时有时还会看到一些之前的底图，还有粉色，切换时全局都要变」。

根因是**只重画、不拆除**（不是画错了）：

| 残留源 | 证据 |
|---|---|
| `[data-cyrene-bands]` 只 `display:none`，上一套底图留在它的行内 `background-image` 里 | `lib/client.js` 0.2.0 `hideBands()` / `applyBands()` |
| 我们的 `!important` token 覆盖（`:root, html body, html body[data-cyrene-skin]`）从不清空，粉色 tint 一直压着 | `surfaceTokenRules()` / `chatSurfaceRules()` |
| dsh-cyrene 的 `body[data-cy-grad]` 全页渐变带 `!important`，压得过接手皮肤的非 important 背景 | `dsh-cyrene/lib/client.js:286-287` |
| dsh-cyrene 的 `.cyrene-bg-particles`（`position:fixed; inset:0; z-index:1`，粉色粒子）与 Live2D 桌宠（`z-index:2147483000`）继续画 | `dsh-cyrene/lib/client.js:291-293, 295, 623-626` |
| dsh-cyrene 的粉色规则（`:focus-visible`、`::-webkit-scrollbar-thumb`、`svg[class*="matrix"]`、logo、`[class*="turnStatus"]` 的 `--dsw-static-deepseek-*`）不在接手皮肤的 remap 范围内 | `dsh-cyrene/lib/client.js:259-280` |

### 三段式时序（`applyCharacter()`）

1. **先撤自己的层**：`clearOurPaint()` — 清空 `wall.css` / `stars.css` 文本，`remove()`（不是隐藏）
   `[data-cyrene-wallpaper]` / `[data-cyrene-bands]` / `[data-ca-starfield-canvas]`，清掉 `html`/`body`
   行内 `background-image`；同时安装独立的
   `<style data-plugin-css="dsh-character-agent/yield.css">` 压住正在淡出的 dsh-cyrene。
2. **再启用目标皮肤**：`handOverSkin()` 走皮肤中心自己的控制器（见下）。
3. **最后应用角色剩下的东西**：hero（可关）、字体、BGM、强调色。

任何一套只画不拆的实现都会在这三步之间露出中间态；顺序反过来（先换皮肤再拆旧层）会
在旧层之上短暂盖一层旧底图。

### `yield.css`（切回昔涟时整条 `remove()`）

全部规则都限定在让位角色上，且 `!important` + 特异性 ≥ 被压的规则：

```css
html[data-ca-character="fat-fish"] body[data-cy-grad]{background:none!important;…}
html[data-ca-character="fat-fish"] .cyrene-bg-particles{display:none!important;…}
html[data-ca-character="fat-fish"] [data-dsh-cyrene-pet]{display:none!important}
html[data-ca-character="fat-fish"] body[data-cyrene-skin] :focus-visible{outline-color:var(--dsw-alias-brand-primary,#E7B44E)!important}
…（`a` / `::-webkit-scrollbar-thumb` / `svg[class*="matrix"]` / logo svg / `[class*="turnStatus"]`）
```

没有一条规则碰皮肤中心自己的 `[data-dsh-skin-layer]` 或 `html[data-dsh-skin]`，
所以接手皮肤照常画；切回昔涟时这条 `<style>` 被删除，dsh-cyrene 的 token、渐变、粒子、桌宠
原样回来。

### 皮肤与模式联动

- **fat-fish → 启用 `mid-autumn`**：优先 `window.__skinRuntime.controller.switchTo(id, entry)`
  （皮肤中心 0.4.8 `lib/client.js:1724 / 1592`，这是它自己设置卡片走的同一条路径，commit + persist）；
  runtime 还没起来时回落到 `POST /api/skin-center/v2/active`（`{active:id}`）+ 广播
  `dsh-skin-applied` 事件（`lib/client.js:1764`），持久化文件仍是皮肤中心自己写的
  `<DSH_HOME>/skin-center-active.json`（host `lib/index.js:1635`）。**不需要手点。**
- **cyrene → 恢复切换前的皮肤**：切换前的 active id 记在 `localStorage`
  （`dsh-character-agent.v1.skinHold = {previous, skin, restore, applied}`，`previous: null` 表示
  stock 外观，也是可恢复的真实值）。切回时只恢复一次，然后清账；如果在让位期间用户自己换了
  别的皮肤，以用户为准，不覆盖。重载页面也能续上（债在 localStorage 里）。
- 皮肤中心没装/路由 404：让位层照撤，`skinHold` 保留，`设置 → 角色 · 模式外观` 的
  「最近一次皮肤切换」会显示 `failed: …`，此时才需要手动点皮肤。

### 配置（`<DSH_HOME>/character-agent/characters.json`）

```json
{
  "characters": {
    "fat-fish": {
      "yieldTo": { "skin": "mid-autumn", "keepHero": true, "restorePrevious": true }
    }
  }
}
```

- `yieldTo` 存在 = 让位（默认已是这样）。
- **退出让位**要写 `"yieldTo": { "skin": "" }`（空 id），不要写 `null`——`mergeDeep` 把 `null`
  当作「不覆盖」。
- `keepHero: false` 连首屏图与问候语也不画。
- 退出让位后把 `starfield.enabled` 改回 `true` 即可拿回 0.2.0 的星空底。

### 验证

```bash
node work/smoke-020.mjs      # 自绘引擎（bubble/code/星空），显式 opt-out 让位
node work/smoke-031.mjs      # 0.3.1：让位 / 恢复 / 连续来回 3 次 / 皮肤中心回落
node work/smoke-031.mjs --race        # 启动让位还没落地时会话就切到昔涟（串行化，不许回潮）
node work/smoke-031.mjs --installed   # 同一套断言，跑在已安装副本上
```

### 已知限制

- 运行中的 GUI 需要**刷新页面**（客户端半体）才能拿到 0.3.1；host 半体的注册表在启动时读，
  改了 `characters.js` 要重启 DSH。
- 启动的第一屏按注册表默认是**大肥鱼**，所以启动瞬间会先启用 `mid-autumn`，等会话投影到了
  再按实际 preset 切回并恢复原皮肤（与 0.2.0 启动时先铺大肥鱼壁纸再切昔涟是同一节奏）。

## 0.2.0 改了什么（历史）

| # | 改造 | 落点 |
|---|---|---|
| 1 | **对话框不透明度** + **代码块不透明度** 两个独立滑杆 | `lib/client.js` `chatSurfaceRules()`；设置 → 角色 · 背景壁纸（也列在 角色 · 模式外观） |
| 2 | 大肥鱼**星空底（深蓝渐变）+ 闪烁星星粒子**（单 canvas，~30fps，页面隐藏时暂停，`prefers-reduced-motion` 静止） | `lib/client.js` 星空引擎；开关在 设置 → 角色 · 模式外观 |
| 3 | 大肥鱼 **BGM 复用昔涟的占位曲**（同一条 `/cyrene-bgm` 路由，不复制文件） | `lib/characters.js` `fat-fish.bgm` |
| 4 | **新会话界面默认 = 大肥鱼** | `lib/characters.js` `DEFAULT_CHARACTER`；一次性种子标记 `dsh-character-agent.v1.seeded` |

### 1. 对话框 / 代码块不透明度

两个值都**按角色存在注册表的 `wallpaper` 里**（`bubble` / `code`），可被
`characters.json` 覆盖，切模式时跟着角色走：

| 角色 | `bubble`（对话框） | `code`（代码块） |
|---|---|---|
| cyrene | 0.60（= 主区不透明度，保证默认一致） | 0.85 |
| fat-fish | 0.72（= 它自己的主区不透明度） | 0.88 |

覆盖的真实 token / 选择器（都写在 `:root, html body, html body[data-cyrene-skin]` 上，
`!important`，所以压得过 `body{…}`、`body[data-cyrene-skin]`、`body[data-ds-dark-theme]`）：

- 对话框：`--dsw-specific-bubble`、`--dsw-specific-bubble-highlight`，
  外加 `html body [data-conversation-region="chat"] [class*="_bubble"]{background-color}`
- 代码块：`--dsw-alias-markdown-code-block`、`--dsw-alias-markdown-code-block-banner`、
  `--dsw-alias-markdown-inline-code`，外加 `html body .md-code-block` 与
  `html body .md-code-block [data-code-block-banner]`
- `pre` **故意不涂**：DSH 的 `pre` 自己没有底色，代码卡片的底色就在 `.md-code-block` 上，
  再涂一次会双重变暗。

证据行号见 `lib/client.js` 里 `chatSurfaceRules()` 的注释块。

### 2. 星空底 + 星星粒子

- 只在大肥鱼（`data-ca-character="fat-fish"`）下渲染；切到昔涟时 canvas **从 DOM 移除**。
- 一层 canvas 同时负责深蓝渐变（默认 `#0b1a33` → `#16264a`）和星星：
  `position:fixed; inset:0; pointer-events:none; z-index:-1`，作为 `<body>` 的最后一个子节点，
  所以画在**壁纸之上、所有面板之下**。
- 有壁纸时渐变按 `starfield.wash`（默认 0.52）半透明铺，壁纸仍透得出来；没有壁纸时满不透明，
  就是纯星空底。
- 性能：单 canvas + `requestAnimationFrame`，**~30fps**（每 33ms 才画一帧）；星星对象只在
  尺寸变化时重建，渐变对象缓存，**每帧不新建对象**；`document.hidden` 时整条循环停掉，
  `visibilitychange` 回来再续；`prefers-reduced-motion: reduce` 只画一帧静态星空。
- 星星数量/尺寸按屏幕面积自适应（约 70–320 颗，DPR 上限 2）。
- 开关：设置 → 角色 · 模式外观 → 「星星粒子（本模式）」，**按角色记住**（cyrene 默认关）。

### 3. 大肥鱼 BGM

```js
'fat-fish': { bgm: { enabled: true, volume: 0.35, track: 'cyrene-ambient-loop.wav' } }
```

走的是现成的 `/cyrene-bgm/<file>` 路由（`<DSH_HOME>/bgm/cyrene-ambient-loop.wav`），**没有复制文件**。

### 4. 新会话默认 = 大肥鱼

两半：

1. **外观**：注册表 `default: 'fat-fish'`，只显式映射了 `chat` / `cyrene-work` → 昔涟。
   DSH 新建会话用的是内建 `standard`，它**没有**被映射，所以落在 default 上 → 大肥鱼外观。
   无会话（新会话首屏）时也是大肥鱼。
2. **preset 本身**：DSH 把「新会话默认 preset」存在宿主 settings 命名空间
   `agent-preset-registry` 的 `selectedDefault` 字段里
   （证据：`@deepseek-ai/dsh-client-ui-agent-preset/lib/client.js:1082,1094-1096`；
   宿主字段 `selectedDefault: z.string().volatile()`，见
   `@deepseek-ai/dsh-agent-preset-registry/lib/index.js:443`）。
   该字段由 config-editor **落盘到 profile 的 `cordis.patch.yml`**
   （`@deepseek-ai/dsh-settings` README：*Changes persist through the active profile's Cordis patch*）。
   本插件首次启动只做一次**会话级**同步（`remote.agentPresets.select(blankSession, 'fat-fish')`，
   就是 hero 预设选择器用的那条路），**不自动改写那份 patch**；
   想真正改宿主默认，点设置面板里的
   「把「蓝色大肥鱼」设为 DSH 新会话默认」按钮（或到 DSH 自己的 **设置 → 预设 →「设为新任务默认」**）。
   一次性标记：`localStorage['dsh-character-agent.v1'].seeded`。

## 设置面板入口

| 面板 | 内容 |
|---|---|
| 设置 → 角色 · 模式外观 | 当前模式 / 鲸鱼娘开关 / **星星粒子开关** / **新会话默认模式** / 本模式外观 / 恢复本模式默认 |
| 设置 → 角色 · 文字样式 | 界面字体、对话字号、行高、字间距 |
| 设置 → 角色 · 背景壁纸 | 壁纸开关与底图/叠加图、主区不透明度、侧栏不透明度、**对话框不透明度**、**代码块不透明度**、焦点、模糊、面板底色 |
| 设置 → 角色 · 背景音乐 | 开关、音量、曲目 |

## 路由

| 路由 | 来源 | 说明 |
|---|---|---|
| `/cyrene-hero/<file>` | `<DSH_HOME>/hero-assets` | 与 dsh-cyrene-hero 一致 |
| `/cyrene-bgm/<file>` + `index.json` | `<DSH_HOME>/bgm` | 一致；大肥鱼复用这里的 `cyrene-ambient-loop.wav` |
| `/cyrene-wallpaper/<file>` + `index.json` | `<DSH_HOME>/wallpaper` | 一致 |
| `/cyrene-fonts/<file>` | `<DSH_HOME>/fonts` | 一致 |
| `/character-agent/registry.json` | `lib/characters.js` | 角色注册表（客户端启动时读） |
| `/character-agent/mode` | 内存 + `<DSH_HOME>/character-agent/state.json` | GET 上次上报；POST 客户端上报 |
| `/character-agent/fat-fish/<file>` + `index.json` | `<DSH_HOME>/character-agent/fat-fish` + `dsh-whale-girl` 包内 `assets/`（只读） | 大肥鱼的壁纸/立绘 |
| `/character-agent/diag` | 解析结果 | 排查「素材到底从哪读的」 |

## 配置覆盖

`<DSH_HOME>/character-agent/characters.json`（可选，深合并到默认注册表）：

```json
{
  "default": "fat-fish",
  "presets": { "my-preset": "cyrene" },
  "characters": {
    "fat-fish": {
      "wallpaper": { "bubble": 0.5, "code": 0.9 },
      "starfield": { "enabled": true, "top": "#081428", "bottom": "#1a2b55", "wash": 0.6, "density": 1.4 },
      "bgm": { "volume": 0.25 }
    },
    "cyrene": { "hero": { "greeting": "想和人家说悄悄话吗?" } }
  }
}
```

改完在浏览器里刷新页面（不用重启 DSH）即可重新读到注册表。

## 已知占位

- 大肥鱼**没有专属主题包**（`dsh-whale-girl` 的 patch 引用了 `@waynezhang/dsh-theme-skywhale`，
  但该包未安装）：现在用蓝调面板 token + 蓝色强调色 + 本插件自己的星空底。
- 首屏图用的是 `assets/whale-girl.png`（340×340 宠物立绘）。
