# 昔涟 · DSH 桌面版使用说明

给 DSH Web GUI 换上昔涟的外观（主题 + 首屏 + 壁纸 + 字体 + 背景音乐）与人设（角色预设）。
插件装在 profile `desktop`；素材都在 `C:\Users\zsh\.dsh\` 下，**换素材不用重打包**。

## 已安装插件

| 包 | 版本 | 作用 |
|---|---|---|
| `dsh-cyrene` | 0.4.1 | 珍珠白粉主题 + Live2D 桌宠 + 粒子/渐变背景 |
| `dsh-cyrene-hero` | 0.16.0 | 首屏英雄图与问候语、文字样式、背景壁纸、背景音乐、内置霞鹜文楷 |
| `dsh-cyrene-persona` | 0.3.3 | 人设：`chat`（纯文本对话）+ `cyrene-work`（昔涟工作模式），都带「语气与温度」 |
| `dsh-meme` | 0.1.44 | 表情包：`send_meme` / `learn_meme` + 输入框选图 + 图库 |
| `dsh-dream-skin` | 10.6.0 | 皮肤/壁纸包，**已停用**（不在 `dsh.profile.bundles` 里，不加载） |

## 怎么用

### 界面外观与字体

- 头像与问候语自动生效：换图 = 覆盖 `hero-assets\hero.png`，改文案/尺寸 = 改 `hero.json`，刷新即可。
- **设置 → 昔涟 · 文字样式**：界面字体 / 对话字号 / 行高 / 字间距，改完立即生效（不用刷新）。
- 字体列表里的 **「霞鹜文楷（内置，昔涟）」要手动选中**（另有「霞鹜文楷等宽（内置）」）；
  不用把字体装进系统 —— 4 个 ttf 由宿主 `/cyrene-fonts` 路由提供。
- 代码块始终保持等宽字体，不受字号 / 行高设置影响。

### 背景壁纸

- **设置 → 昔涟 · 背景壁纸**；文件放 `C:\Users\zsh\.dsh\wallpaper\`。
- 画法**只有「整窗统一」一种**：图片作为 `body` 自己的背景（一张连续底图，锚定窗口中心、永不移动）；
  视频走 `z-index:-1` 的满屏层。对话区、左侧栏、右侧栏同时透出同一张图，粒子在最上层。
- 三条滑杆：**主区不透明度**（默认 60%）、**侧栏不透明度**（默认 30%）、**画面焦点**（默认 55%）。
  「主区不透明度」拉到 100% 壁纸必然看不见，50%~70% 最好看。
- 「画面焦点」只在素材比例 ≠ 窗口比例、`cover` 需要裁边时起作用（0=画面顶部贴窗口顶部，100=底部）。
- **图片要成对用**：`base-*.jpg` 当底图，`overlay-*.jpg` 当「侧栏叠加图」；两张同构图、
  同一模糊档（`crisp` / `soft` / `haze` / `heavy`），否则侧栏会出现一块更清楚的接缝。
- 「模糊」滑杆**只对视频生效**；图片请用预先模糊好的文件（现有 `bg-soft-12` / `bg-haze-28` / `bg-heavy-55` 三档）。
- 面板底色默认珍珠粉 `#fff7fb`，所以开壁纸后界面仍是粉的；想纯白改成 `#ffffff`。

### 背景音乐

- 把音乐丢进 `C:\Users\zsh\.dsh\bgm\`：支持 `mp3 / m4a / aac / ogg / opus / wav / flac`。
- 页面加载时自动发现，**循环播放第一首**（按文件名排序）；有多首时在 **设置 → 昔涟 · 背景音乐** 里选。
- 面板有开关、音量、曲目、重新扫描、当前状态；开关状态存在浏览器 localStorage。
- 浏览器不许网页「没被点过就出声」：被拦时面板显示「等你点一下页面就会开始」，点一下即可。

### 人设

- 两个预设：**纯文本对话模式**（`chat`）与 **昔涟工作模式**（`cyrene-work`）；都带「语气与温度」，
  共享同一份世界书（61 条）与长期记忆。
- 预设只在**新建会话**时可选；已经开始的会话预设锁死。
- 预设正文内联在 `C:\Users\zsh\.dsh\profiles\desktop\cordis.patch.yml`，DSH 0.2.0 起不再扫描
  `.agent-presets` 目录。生效要求与改写方法见 [docs/排错.md](docs/排错.md)。

## 素材放哪里

| 路由 | 目录 | 放什么 |
|---|---|---|
| `/cyrene-hero/<file>` | `C:\Users\zsh\.dsh\hero-assets\` | 首屏头像 `hero.png` + 配置 `hero.json` |
| `/cyrene-wallpaper/<file>` | `C:\Users\zsh\.dsh\wallpaper\` | 壁纸：图片、视频、`base-*` / `overlay-*` 成对素材 |
| `/cyrene-bgm/<file>` | `C:\Users\zsh\.dsh\bgm\` | 背景音乐 |
| `/cyrene-fonts/<file>` | `C:\Users\zsh\.dsh\fonts\` | 霞鹜文楷 4 个 ttf（Light / Regular / Medium / Mono） |

宿主只有这四条路由，全部直接读上面的目录：换文件即可，不用重打包、不用改代码。

## 卸载 / 回滚

```powershell
$dsh = 'C:\Users\zsh\AppData\Local\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
& $dsh plugin --profile desktop remove dsh-cyrene-hero
# 同理：dsh-cyrene / dsh-cyrene-persona / dsh-meme
```

- 人设预设是 `cordis.patch.yml` 里的两段 `- insert:` 块（`@deepseek-ai/dsh-agent-preset`），
  只删插件不会删预设：要一并去掉就把这两段删掉，再**完全重启 DSH**。
- 素材目录不会被卸载动到，可自行保留或清理。
- 旧包都在 `E:\cyrene-agent\dist\`（`dsh-cyrene-hero-0.16.0.tgz`、`dsh-cyrene-persona-0.3.3.tgz` 等），
  装回去用 `dsh plugin --profile desktop add <tgz 路径>`。
- 语音朗读 / 音色克隆已在 0.16.0 移除，没有对应的设置项、路由或文件。

## 版本

| 项 | 版本 |
|---|---|
| DSH 桌面版 | 0.2.1-rc.1（profile `desktop`） |
| `dsh-cyrene` | 0.4.1 |
| `dsh-cyrene-hero` | 0.16.0 |
| `dsh-cyrene-persona` | 0.3.3 |
| `dsh-meme` | 0.1.44 |
