/**
 * dsh-character-agent — client half.
 *
 * One appearance engine, several characters. Everything below the four original
 * capabilities (hero picture, music, typography, wallpaper) is driven by the
 * character registry, and the registry entry is chosen from the *current
 * session's agent preset*:
 *
 *   preset `fat-fish`  -> character `fat-fish`  (blue fat fish, whale-girl allowed)
 *   any other preset   -> character `cyrene`    (default: standard/ptc/minimal/cordis/chat/cyrene-work)
 *
 * Where the preset comes from (see the A1 note in dist/README.md):
 * the browser's `ctx.sessions` service. `sessions.list` is an
 * `ObservableSnapshot<SessionListState>`; the session currently on screen is the
 * `byId` row with `retainedBy.mainView > 0`, and its
 * `projectionValues.agentPreset` is the preset id. Nothing about the preset is
 * exposed as a DOM `data-*` attribute by DSH itself, so this store (plus a 2 s
 * local re-read as a safety net) is the detection path.
 *
 * 1. Hero image + greeting on the new-session page.
 * 2. Looping background music from <DSH_HOME>/bgm/.
 * 3. Conversation typography (interface font, chat size, line height, spacing).
 * 4. Hazy wallpaper: an image or video from <DSH_HOME>/wallpaper/ behind a
 *    translucent UI, blurred live by CSS (so the haze is tunable with sliders).
 * 5. Per-character skin accent, and the whale-girl gate: the dsh-whale-girl pet
 *    is mounted for every session by that package, so it is hidden with CSS
 *    (`html[data-ca-character]`, `html[data-ca-whale]`) and never modified.
 * 6. Hand-over (0.3.1): a character may declare `yieldTo` in the registry (fat-fish
 *    does) and then this plugin paints NOTHING of its own — it removes its wallpaper,
 *    side bands, token overrides and starfield, installs `yield.css` to suppress the
 *    fading dsh-cyrene gradient/particles/pet/pink rules, and enables the target
 *    skin-center skin (`mid-autumn`). Switching back restores the previous skin and
 *    deletes `yield.css`. See the 让位 section below `applyStars()`.
 *
 * Hash-agnostic by design: DSH's CSS-module class names carry a build-time
 * prefix, so hero rules match the stable suffix `[class*="_composerHero"]`,
 * text rules use `[data-conversation-region="chat"]`, and background
 * transparency is done by overriding `--dsw-alias-bg-base` (the token 20
 * shipped packages use for their surfaces).
 *
 * Hero DOM (dsh-client-ui-conversation):
 *   div[class*="_composerStack"][class*="_composerHero"]
 *     ├─ div[class*="_root"]            <- HeroShell (headline block)
 *     │    └─ div[class*="_titleGroup"]
 *     │         ├─ span                 <- t("hero.headline")
 *     │         └─ span[class*="_previewBadge"]
 *     ├─ hero workspace row
 *     └─ input bar
 *
 * Configured from files you own (no repack):
 *   <DSH_HOME>/hero-assets/hero.json   every default below
 *   <DSH_HOME>/hero-assets/hero.png    the hero picture
 *   <DSH_HOME>/bgm/*.mp3               the music
 *   <DSH_HOME>/wallpaper/*.mp4|*.png   the wallpaper
 */
window.__ModuleLoader__.load({
  id: 'dsh-character-agent',
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    const React = require('react');
    const h = React.createElement;

    /** Defaults; hero.json overrides any key. */
    const DEFAULTS = {
      // hero
      image: '/cyrene-hero/hero.png',
      width: 130,
      aspect: '1 / 1',
      tuck: -12,
      glow: 'rgba(255, 91, 138, .30)',
      hideBuiltinMark: true,
      greeting: '想和人家说悄悄话吗?',
      subtitle: 'Want to share a little secret with me? ›',
      // background music
      bgm: true,
      bgmVolume: 0.45,
      // typography
      fontId: 'default',
      fontCustom: '',
      chatFontSize: 0,
      chatLineHeight: 0,
      chatLetterSpacing: 0,
      // wallpaper
      wall: true, // on when a wallpaper file exists
      wallFile: '', // base picture: fixed, never moves
      wallOverlay: '', // optional complete picture: its side bands fill the sidebars
      wallMode: 'panel', // 'panel' = paint it on the chat region (robust) | 'layer' = full-window layer with live blur
      wallBlur: 28,
      wallBrightness: 0.94,
      wallSaturation: 1.05,
      wallPanel: 0.72, // main-area panel opacity: how much wallpaper shows through
      wallSidebar: 0.35, // sidebar opacity: lower = more transparent, wallpaper-led
      // 0.2.0: the two surfaces that the panel token never reached. `bubble` falls
      // back to the main-area opacity (so the default is "whatever 主区 is"), and
      // `code` is deliberately more solid so code stays readable over the wallpaper.
      wallBubble: 0.6,
      wallCode: 0.85,
      wallTint: '#fff7fb', // panel base colour (pearl pink): keeps the pink over the wallpaper
      wallTintDark: '#1a1424',
      wallWash: 0.28, // white/dark haze over the wallpaper
      wallFocus: 50, // vertical focus for object-position: center <focus>%
    };

    const FONT_PRESETS = [
      { id: 'default', label: 'DSH 默认', stack: '' },
      {
        id: 'system',
        label: '系统无衬线',
        stack: 'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
      },
      { id: 'yahei', label: '微软雅黑', stack: '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif' },
      {
        id: 'source-han',
        label: '思源黑体 / Noto Sans SC',
        stack: '"Source Han Sans SC", "Noto Sans SC", "Microsoft YaHei", sans-serif',
      },
      {
        id: 'lxgw',
        label: '霞鹜文楷（内置，昔涟）',
        stack: '"LXGW WenKai", "霞鹜文楷", "Kaiti SC", serif',
      },
      { id: 'lxgw-mono', label: '霞鹜文楷等宽（内置）', stack: '"LXGW WenKai Mono", "LXGW WenKai", monospace' },
      { id: 'kaiti', label: '楷体', stack: 'KaiTi, "Kaiti SC", "STKaiti", serif' },
      { id: 'songti', label: '宋体', stack: 'SimSun, "Songti SC", "STSong", serif' },
      { id: 'custom', label: '自定义…', stack: null },
    ];

    // ─────────────────────── shared: tiny store + UI ────────────────────

    /** localStorage-backed preference bag that re-renders every open panel. */
    function makeStore(key, initial) {
      const state = { ...initial };
      const listeners = new Set();
      let touched = false;
      let emitting = false;
      try {
        const raw = localStorage.getItem(key);
        if (raw !== null) {
          touched = true;
          Object.assign(state, JSON.parse(raw));
        }
      } catch {
        /* private mode: defaults stand */
      }
      return {
        state,
        get touched() {
          return touched;
        },
        set(patch) {
          touched = true;
          Object.assign(state, patch);
          try {
            localStorage.setItem(key, JSON.stringify(state));
          } catch {
            /* still applies for this page */
          }
          for (const l of listeners) l();
        },
        subscribe(l) {
          listeners.add(l);
          return () => listeners.delete(l);
        },
        /**
         * Re-entrancy guard. An applier (applyWallpaper / applyAudio) listens to its
         * own store *and* calls emit() so the open panel refreshes — without this
         * guard that is infinite recursion, which blew the stack on every slider
         * drag and aborted boot() before the file lists were scanned.
         */
        emit() {
          if (emitting) return;
          emitting = true;
          try {
            for (const l of listeners) l();
          } finally {
            emitting = false;
          }
        },
      };
    }

    function useStore(store) {
      const [, force] = React.useState(0);
      React.useEffect(() => store.subscribe(() => force((n) => n + 1)), [store]);
      return store.state;
    }

    const label = (extra) => ({
      fontSize: '13px',
      lineHeight: '20px',
      color: 'var(--dsw-alias-label-caption, #8a8a8e)',
      ...extra,
    });

    const primary = { color: 'var(--dsw-alias-label-primary, inherit)', fontSize: '14px' };

    /** 0.6 -> '60%'; used by the two new opacity read-outs. */
    const pctText = (value) => {
      const n = Number(value);
      return Number.isFinite(n) ? `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%` : '—';
    };

    const inputStyle = {
      border: '1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12))',
      background: 'transparent',
      color: 'var(--dsw-alias-label-primary, inherit)',
      borderRadius: '8px',
      padding: '5px 8px',
      fontSize: '13px',
      minWidth: '260px',
    };

    function button(text, onClick) {
      return h(
        'button',
        {
          type: 'button',
          onClick,
          style: {
            border: '1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12))',
            background: 'transparent',
            color: 'var(--dsw-alias-label-primary, inherit)',
            borderRadius: '8px',
            padding: '5px 12px',
            fontSize: '13px',
            cursor: 'pointer',
          },
        },
        text,
      );
    }

    function Switch({ on, onToggle, labelText }) {
      return h(
        'button',
        {
          type: 'button',
          role: 'switch',
          'aria-checked': on,
          'aria-label': labelText,
          onClick: onToggle,
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            border: 'none',
            background: 'transparent',
            padding: 0,
            cursor: 'pointer',
            ...primary,
          },
        },
        h(
          'span',
          {
            style: {
              width: '42px',
              height: '24px',
              borderRadius: '12px',
              background: on ? 'var(--ca-accent, #ff5b8a)' : 'var(--dsw-alias-interactive-bg-hover, #d8d8dd)',
              position: 'relative',
              transition: 'background .18s ease',
              flex: 'none',
            },
          },
          h('span', {
            style: {
              position: 'absolute',
              top: '3px',
              left: on ? '21px' : '3px',
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              background: '#fff',
              boxShadow: '0 1px 3px rgba(0,0,0,.25)',
              transition: 'left .18s ease',
            },
          }),
        ),
        on ? '开' : '关',
      );
    }

    function Row({ title, hint, children }) {
      return h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
        h('span', { style: primary }, title),
        children,
        hint ? h('span', { style: label() }, hint) : null,
      );
    }

    function SliderRow({ title, hint, value, min, max, step, onChange, format }) {
      return h(
        Row,
        { title, hint },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
          h('input', {
            type: 'range',
            min,
            max,
            step,
            value,
            onChange: (e) => onChange(Number(e.target.value)),
            style: { width: '220px', accentColor: 'var(--ca-accent, #ff5b8a)' },
          }),
          h('span', { style: label() }, format(value)),
        ),
      );
    }

    function setTag(tagId, css) {
      let tag = document.querySelector(`style[data-plugin-css=${JSON.stringify(tagId)}]`);
      if (tag === null) {
        tag = document.createElement('style');
        tag.dataset.plugin = 'dsh-character-agent';
        tag.dataset.pluginCss = tagId;
        document.head.appendChild(tag);
      }
      tag.textContent = css;
    }

    // ─────────────────────────────── hero ───────────────────────────────

    const heroTagId = 'dsh-character-agent/hero.css';
    let heroObserverStarted = false;

    function heroCss(c) {
      return [
        `[class*="_composerHero"]::before{`,
        `content:"";order:0;flex:none;align-self:center;`,
        `width:${c.width}px;aspect-ratio:${c.aspect};margin:0 0 ${c.tuck}px;`,
        `pointer-events:none;user-select:none;-webkit-user-drag:none;`,
        `background:url("${c.image}") center bottom/contain no-repeat;`,
        `filter:drop-shadow(0 10px 22px ${c.glow})}`,
        c.hideBuiltinMark ? '[class*="_fishHitbox"]{display:none}' : '',
        c.subtitle === ''
          ? ''
          : '[class*="_previewBadge"]{background:transparent!important;color:var(--dsw-alias-label-caption)!important;padding:0!important;font-size:13px!important;line-height:20px!important;border:none!important}',
      ]
        .filter(Boolean)
        .join('');
    }

    function patchHeroText(c) {
      // `null` means the live character handed the look over and asked us not to draw the
      // hero either (`yieldTo.keepHero: false`): the observer must stop restoring text.
      if (c === null) return;
      const stack = document.querySelector('[class*="_composerHero"]');
      if (stack === null) return;
      const group = stack.querySelector('[class*="_titleGroup"]');
      if (group === null) return;
      const spans = group.querySelectorAll('span');
      if (c.greeting !== '' && spans.length > 0 && spans[0].textContent !== c.greeting) {
        spans[0].textContent = c.greeting;
      }
      const badge = group.querySelector('[class*="_previewBadge"]');
      if (badge !== null && c.subtitle !== '' && badge.textContent !== c.subtitle) {
        badge.textContent = c.subtitle;
      }
    }

    /**
     * The hero config currently on screen. The mutation observer below must read
     * this variable rather than its creation argument: on a character switch the
     * observer is already running, and a captured `c` would keep restoring the
     * previous character's greeting every time the DOM mutates.
     */
    let heroCfg = DEFAULTS;

    function applyHero(c) {
      if (typeof document === 'undefined') return;
      heroCfg = c;
      setTag(heroTagId, heroCss(c));
      patchHeroText(c);
      if (heroObserverStarted) return;
      heroObserverStarted = true;
      new MutationObserver(() => patchHeroText(heroCfg)).observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }

    // ─────────────────────── typography ─────────────────────────────────

    const typeTagId = 'dsh-character-agent/type.css';
    const CHAT = '[data-conversation-region="chat"]';

    const type = makeStore('dsh-cyrene-hero.type', {
      fontId: DEFAULTS.fontId,
      fontCustom: DEFAULTS.fontCustom,
      chatFontSize: DEFAULTS.chatFontSize,
      chatLineHeight: DEFAULTS.chatLineHeight,
      chatLetterSpacing: DEFAULTS.chatLetterSpacing,
    });

    function fontStackFor(t) {
      if (t.fontId === 'custom') return String(t.fontCustom || '').trim();
      const preset = FONT_PRESETS.find((p) => p.id === t.fontId);
      return preset === undefined ? '' : (preset.stack ?? '');
    }

    function typeCss(t) {
      const rules = [];
      const body = [];
      if (t.chatFontSize > 0) body.push(`font-size:${t.chatFontSize}px!important`);
      if (t.chatLineHeight > 0) body.push(`line-height:${t.chatLineHeight}!important`);
      if (Math.abs(t.chatLetterSpacing) > 0.001) body.push(`letter-spacing:${t.chatLetterSpacing}px!important`);
      if (body.length > 0) {
        const decl = body.join(';');
        rules.push(`${CHAT}{${decl}}`);
        rules.push(`${CHAT} [class*="_body"]{${decl}}`);
        rules.push(`${CHAT} :where(p,li,td,th,blockquote,dd,dt){${decl}}`);
      }
      rules.push(
        `${CHAT} :where(pre,code,kbd,samp){font-family:var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)!important}`,
      );
      return rules.join('');
    }

    /**
     * The bundled 霞鹜文楷 (LXGW WenKai) files live in <DSH_HOME>/fonts and are served by
     * the host under /cyrene-fonts, so the font works without installing it system-wide.
     */
    const FONT_FACE_CSS = [
      "@font-face{font-family:'LXGW WenKai';font-style:normal;font-weight:300;font-display:swap;src:url('/cyrene-fonts/LXGWWenKai-Light.ttf') format('truetype')}",
      "@font-face{font-family:'LXGW WenKai';font-style:normal;font-weight:400;font-display:swap;src:url('/cyrene-fonts/LXGWWenKai-Regular.ttf') format('truetype')}",
      "@font-face{font-family:'LXGW WenKai';font-style:normal;font-weight:500;font-display:swap;src:url('/cyrene-fonts/LXGWWenKai-Medium.ttf') format('truetype')}",
      "@font-face{font-family:'LXGW WenKai Mono';font-style:normal;font-weight:400;font-display:swap;src:url('/cyrene-fonts/LXGWWenKaiMono-Regular.ttf') format('truetype')}",
    ].join('');

    function applyTypography(t) {
      if (typeof document === 'undefined') return;
      const stack = fontStackFor(t);
      const root = document.documentElement;
      if (stack === '') root.style.removeProperty('--dsw-font-family');
      // DSH's theme plugins set this inline; declaring it important here wins.
      else root.style.setProperty('--dsw-font-family', stack, 'important');
      setTag(typeTagId, FONT_FACE_CSS + typeCss(t));
    }

    // ─────────────────────────── wallpaper ──────────────────────────────

    const wallTagId = 'dsh-character-agent/wall.css';
    const wall = makeStore('dsh-cyrene-hero.wall', {
      enabled: DEFAULTS.wall,
      file: DEFAULTS.wallFile,
      overlay: DEFAULTS.wallOverlay,
      mode: DEFAULTS.wallMode,
      blur: DEFAULTS.wallBlur,
      brightness: DEFAULTS.wallBrightness,
      saturation: DEFAULTS.wallSaturation,
      panel: DEFAULTS.wallPanel,
      sidebar: DEFAULTS.wallSidebar,
      bubble: DEFAULTS.wallBubble,
      code: DEFAULTS.wallCode,
      tint: DEFAULTS.wallTint,
      tintDark: DEFAULTS.wallTintDark,
      wash: DEFAULTS.wallWash,
      focus: DEFAULTS.wallFocus,
    });

    let wallInfo = { dir: '', files: [] };
    let wallHost = null;
    let wallMedia = null;
    let wallMounted = '';
    let wallDiag = '';

    const isVideo = (file) => /\.(mp4|m4v|webm|mov|mkv)$/i.test(file);

    /** '#fff7fb' -> '255,247,251' (falls back to the pearl pink). */
    function hexToRgbTriple(hex) {
      const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
      if (m === null) return '255,247,251';
      const n = parseInt(m[1], 16);
      return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
    }

    /**
     * A wallpaper value is either a bare file name from <DSH_HOME>/wallpaper or an
     * absolute route path (`/character-agent/fat-fish/background.png`). The
     * absolute form lets a character keep its materials outside that folder.
     */
    function wallUrl(file) {
      if (typeof file !== 'string' || file === '') return '';
      return file.startsWith('/') ? file : `/cyrene-wallpaper/${encodeURIComponent(file)}`;
    }

    function currentWallFile() {
      const s = wall.state;
      if (typeof s.file === 'string' && s.file.startsWith('/')) return s.file;
      if (s.file !== '' && wallInfo.files.includes(s.file)) return s.file;
      return wallInfo.files[0] ?? '';
    }

    // ── composition: a FIXED base picture + side bands of the "complete" picture ──
    // The base picture is anchored to the window centre and never moves, whatever the
    // (user-resizable) sidebars do. An optional second picture — same framing, with the
    // extra elements painted into its side areas — is drawn with *identical* geometry and
    // clipped to each sidebar's rectangle, so opening a sidebar reveals exactly those
    // elements, aligned to the pixel, as if they had been painted onto the base.
    let artSize = null; // natural size of the base picture
    let artFile = ''; // the file that size belongs to
    let bandsHooked = false;
    let bandHost = null;
    let bandLeft = null;
    let bandRight = null;

    /** Re-apply whenever a sidebar is toggled/resized or the window changes size. */
    function startBandObservers() {
      if (bandsHooked || typeof window === 'undefined' || typeof ResizeObserver === 'undefined') return;
      bandsHooked = true;
      let timer = 0;
      const kick = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (wall.state.enabled) applyWallpaper();
        }, 90);
      };
      try {
        const observer = new ResizeObserver(kick);
        const left = document.querySelector('[class*="_sidebarCol"]');
        const right = document.querySelector('[class*="_rightbarCol"]');
        for (const el of [left, right]) if (el !== null) observer.observe(el);
        const frame = left === null ? null : left.parentElement;
        if (frame !== null) {
          new MutationObserver(kick).observe(frame, {
            attributes: true,
            attributeFilter: ['data-sidebar-collapsed', 'data-rightbar-collapsed', 'style'],
          });
        }
      } catch {
        /* observers unavailable: the window-resize hook still applies */
      }
      window.addEventListener('resize', kick);
    }

    /** Learn the base picture's natural size, so the maths can stay exact in pixels. */
    function loadArtSize(file) {
      if (typeof Image === 'undefined' || isVideo(file)) {
        artSize = null;
        return;
      }
      const probe = new Image();
      probe.onload = () => {
        artSize = { w: probe.naturalWidth, h: probe.naturalHeight };
        applyWallpaper();
      };
      probe.onerror = () => {
        artSize = null;
      };
      probe.src = wallUrl(file);
    }

    /**
     * Uniform cover size, anchored to the window centre, so the base picture NEVER moves.
     * focus 0% = picture top at the window top; 100% = picture bottom at the window bottom.
     */
    function windowBackgroundGeometry(focusPercent) {
      const vw = (typeof window === 'undefined' ? 1920 : window.innerWidth) || 1920;
      const vh = (typeof window === 'undefined' ? 1080 : window.innerHeight) || 1080;
      if (artSize === null) return { raw: false, posX: 0, posY: 0 }; // fall back to `cover`
      const scale = Math.max(vw / artSize.w, vh / artSize.h);
      const width = Math.round(artSize.w * scale);
      const height = Math.round(artSize.h * scale);
      const posX = Math.round((vw - width) / 2);
      const posY = Math.round((vh - height) * (focusPercent / 100));
      return { raw: true, width, height, posX, posY };
    }

    /** The clipping rectangles the side bands are painted into (null = closed). */
    function sidebarRects() {
      if (typeof document === 'undefined') return { left: null, right: null };
      const rect = (selector) => {
        const el = document.querySelector(selector);
        if (el === null) return null;
        const r = el.getBoundingClientRect();
        return r.width < 40 ? null : r;
      };
      return { left: rect('[class*="_sidebarCol"]'), right: rect('[class*="_rightbarCol"]') };
    }

    function ensureBandHost() {
      if (bandHost !== null) return bandHost;
      bandHost = document.createElement('div');
      bandHost.setAttribute('data-cyrene-bands', '');
      for (const side of ['left', 'right']) {
        const el = document.createElement('div');
        el.setAttribute('data-cyrene-band', side);
        bandHost.appendChild(el);
      }
      document.body.prepend(bandHost);
      bandLeft = bandHost.querySelector('[data-cyrene-band="left"]');
      bandRight = bandHost.querySelector('[data-cyrene-band="right"]');
      return bandHost;
    }

    function hideBands() {
      if (bandHost !== null) bandHost.style.display = 'none';
    }

    /**
     * Paint the complete picture's side bands inside the sidebar rectangles, with the very
     * same background geometry as the base (both `fixed`), so they line up pixel for pixel.
     */
    function applyBands(overlayFile, geometry, veil) {
      if (typeof document === 'undefined') return;
      if (overlayFile === '' || geometry.raw !== true) {
        hideBands();
        return;
      }
      const host = ensureBandHost();
      host.style.display = '';
      const rects = sidebarRects();
      const url = `url("${wallUrl(overlayFile)}")`;
      const paint = (el, rect) => {
        if (el === null) return;
        if (rect === null) {
          el.style.display = 'none';
          return;
        }
        // NOTE: must be an explicit value — `display = ''` would drop the inline
        // declaration and fall back to the stylesheet's `display:none`, leaving the
        // band invisible even though it was painted.
        el.style.display = 'block';
        el.style.left = `${Math.round(rect.left)}px`;
        el.style.width = `${Math.round(rect.width)}px`;
        el.style.backgroundImage = `linear-gradient(${veil},${veil}),${url}`;
        el.style.backgroundSize = `${geometry.width}px ${geometry.height}px`;
        el.style.backgroundPosition = `${geometry.posX}px ${geometry.posY}px`;
        el.style.backgroundRepeat = 'no-repeat';
        el.style.backgroundAttachment = 'fixed';
      };
      paint(bandLeft, rects.left);
      paint(bandRight, rects.right);
    }

    /**
     * Blur bleeds past the element edges, so the media is scaled up just enough
     * to push the soft border out of the viewport (bigger blur → bigger scale).
     */
    function coverScale(blur) {
      const w = typeof window === 'undefined' ? 1920 : window.innerWidth || 1920;
      const h = typeof window === 'undefined' ? 1080 : window.innerHeight || 1080;
      return (1 + (2 * Math.max(0, blur)) / Math.max(320, Math.min(w, h)) + 0.02).toFixed(4);
    }

    /** Shared: make every surface token translucent so the background shows through. */
    function surfaceTokenRules(s) {
      const panel = Math.max(0.05, Math.min(1, s.panel));
      const at = (delta) => Math.max(0.05, Math.min(1, panel + delta)).toFixed(3);
      const lightRgb = hexToRgbTriple(s.tint);
      const darkRgb = hexToRgbTriple(s.tintDark);
      const light = (alpha) => `rgba(${lightRgb},${alpha})`;
      const dark = (alpha) => `rgba(${darkRgb},${alpha})`;
      const surfaces = [
        ['--dsw-alias-bg-base', panel.toFixed(3)],
        ['--dsw-alias-bg-layer-1', at(0.06)],
        ['--dsw-alias-bg-layer-2', at(0.12)],
        ['--dsw-alias-bg-layer-3', at(0.18)],
        ['--dsw-alias-bg-module-platform', at(0.05)],
        ['--dsw-alias-bg-skeleton', at(-0.12)],
        ['--dsw-alias-bg-multi-select', at(0.08)],
      ];
      // IMPORTANT: the Cyrene theme declares these tokens on `body[data-cyrene-skin]`.
      // A declaration on the element itself always beats an inherited one, so setting
      // them only on :root (html) left every panel opaque and hid the wallpaper.
      // Hence emit on :root, on body, and on the theme's own body selector with a
      // specificity that wins (html body[data-cyrene-skin] = 0-1-2 > 0-1-1).
      const onBody = ':root,html body,html body[data-cyrene-skin]';
      const onBodyDark = '[data-ds-dark-theme],html body[data-cyrene-skin][data-ds-dark-theme]';
      const rules = [];
      for (const [token, alpha] of surfaces) {
        rules.push(`${onBody}{${token}:${light(alpha)}!important}`);
        rules.push(`${onBodyDark}{${token}:${dark(alpha)}!important}`);
      }
      // Overlays keep a readable scrim; document panes stay nearly solid.
      rules.push(`${onBody}{--dsw-alias-bg-overlay:${light(0.55)}!important}`);
      rules.push(`${onBodyDark}{--dsw-alias-bg-overlay:${dark(0.6)}!important}`);
      rules.push(`${onBody}{--dsw-alias-bg-document-preview:${light(0.92)}!important}`);
      rules.push(`${onBodyDark}{--dsw-alias-bg-document-preview:${dark(0.92)}!important}`);
      rules.push(`${onBody}{--dsw-alias-bg-document-selection:${light(0.28)}!important}`);
      rules.push(`${onBodyDark}{--dsw-alias-bg-document-selection:${dark(0.3)}!important}`);
      // The LEFT sidebar does not use the alias tokens at all — the layout paints it with
      // `--dsw-specific-sidebar-fill`, which is why it stayed opaque no matter what we did
      // to the panel tokens. Give it its own (usually lower) opacity so both sidebars read
      // as glass over the one shared picture.
      const side = Math.max(0.05, Math.min(1, Number(s.sidebar) || 0.35)).toFixed(3);
      rules.push(`${onBody}{--dsw-specific-sidebar-fill:${light(side)}!important}`);
      rules.push(`${onBodyDark}{--dsw-specific-sidebar-fill:${dark(side)}!important}`);
      rules.push(`html [class*="_sidebarCol"],html [class*="_leadingSeat"]{background-color:${light(side)}!important}`);
      rules.push(
        `html [data-ds-dark-theme] [class*="_sidebarCol"],html [data-ds-dark-theme] [class*="_leadingSeat"]{background-color:${dark(side)}!important}`,
      );
      rules.push(chatSurfaceRules(s, light, dark));
      return rules.join('');
    }

    /**
     * 0.2.0 — 对话框（消息气泡）与代码块的不透明度。
     *
     * Evidence, grepped out of the shipped bundles inside app.asar (0.2.1-rc.2):
     *
     *   消息气泡
     *     @deepseek-ai/dsh-client-ui-chat/lib/client.js:4272
     *       .cJsG2q_bubble{background:var(--dsw-specific-bubble);border-radius:var(--dsw-radius-xl);…}
     *     @deepseek-ai/dsh-client-ui-goal/lib/client.js:435
     *       .-ja1rG_bubble{…background:var(--dsw-specific-bubble);…}
     *     @deepseek-ai/dsh-client-ui-user-questions/lib/client.js:1405
     *       .v1fjQa_bubble{…background:var(--dsw-specific-bubble);…}
     *     @deepseek-ai/dsh-client-ui-theme/lib/client.js:1413  (the token's own home)
     *       body{--dsw-specific-bubble:var(--dsw-static-deepseek-50);…}
     *       body[data-ds-dark-theme]{--dsw-specific-bubble:var(--dsw-static-neutral-bluish-850);…}
     *     → the bubble has no background of its own; it is 100% the token. Overriding
     *       the token is therefore the *only* thing needed, and it cannot leak into
     *       the tooltip (which uses `--dsw-alias-tooltip-bg`, not this one).
     *
     *   代码块
     *     dsh-web-frontend/dist/assets/index-BxpfOGf3.css (code block card module)
     *       ._card_1pq26_1{…background:var(--dsw-alias-markdown-code-block);…}
     *       ._header_1pq26_10{…background:var(--dsl-code-block-background, var(--dsw-alias-markdown-code-block));…}
     *       ._block_8z71b_1 / ._copyButton_8z71b_132 / ._block_1u3n2_1 (terminal + search)
     *         …background:var(--dsw-alias-markdown-code-block)…
     *       index-CN7NIWNw.js:165  the fenced-code wrapper always carries the *literal*
     *         class `md-code-block` (className: de(Mn.block, "md-code-block", …)) and its
     *         banner carries `data-code-block-banner`.
     *     @deepseek-ai/dsh-client-ui-theme/lib/client.js:1413,1428
     *       body{--dsw-alias-markdown-code-block:var(--dsw-static-neutral-bluish-50);
     *            --dsw-alias-markdown-code-block-banner:var(--dsw-static-neutral-bluish-50);
     *            --dsw-alias-markdown-inline-code:…}
     *       --shiki-background:var(--dsw-alias-markdown-code-block)
     *     → `pre` itself has NO background (`._markdown_1ypvv_5 pre{margin:16px 0;…}`
     *       frontend CSS line 312), so painting `pre` would double-darken the card.
     *       The token plus the literal `.md-code-block` class is the real surface.
     *
     * Both numbers are per-character (registry `wallpaper.bubble` / `wallpaper.code`,
     * overridable from characters.json) and are emitted on the same
     * `:root, html body, html body[data-cyrene-skin]` selector list, `!important`, so
     * they beat `body{…}` (0-0-1), `body[data-cyrene-skin]` (0-1-1) and the dark
     * block `body[data-ds-dark-theme]` (0-1-1) that the themes declare.
     *
     * @param s wallpaper store snapshot.
     * @param light `(alpha) => rgba(...)` for the character's light tint.
     * @param dark `(alpha) => rgba(...)` for the character's dark tint.
     * @returns CSS text.
     */
    function chatSurfaceRules(s, light, dark) {
      const clamp = (value, fallback) => {
        const n = Number(value);
        return Number.isFinite(n) ? Math.max(0.03, Math.min(1, n)) : fallback;
      };
      // 默认跟随主区不透明度；代码块默认比对话框略实。
      const bubble = clamp(s.bubble ?? s.panel, DEFAULTS.wallBubble);
      const code = clamp(s.code, DEFAULTS.wallCode);
      const up = (value, delta) => Math.max(0.03, Math.min(1, value + delta)).toFixed(3);
      const b = bubble.toFixed(3);
      const c = code.toFixed(3);
      const onBody = ':root,html body,html body[data-cyrene-skin]';
      const onBodyDark = '[data-ds-dark-theme],html body[data-cyrene-skin][data-ds-dark-theme]';
      const rules = [];
      // ── 对话框 / 消息气泡 ──────────────────────────────────────────────
      rules.push(`${onBody}{--dsw-specific-bubble:${light(b)}!important}`);
      rules.push(`${onBodyDark}{--dsw-specific-bubble:${dark(b)}!important}`);
      rules.push(`${onBody}{--dsw-specific-bubble-highlight:${light(up(bubble, 0.1))}!important}`);
      rules.push(`${onBodyDark}{--dsw-specific-bubble-highlight:${dark(up(bubble, 0.1))}!important}`);
      // Belt and braces: same colour straight on the bubble class, scoped to the chat
      // region so the fixed-position tooltip (also `[class*="_bubble"]`) is untouched.
      rules.push(
        `html body [data-conversation-region="chat"] [class*="_bubble"]{background-color:${light(b)}!important}`,
      );
      rules.push(
        `html [data-ds-dark-theme] [data-conversation-region="chat"] [class*="_bubble"]{background-color:${dark(b)}!important}`,
      );
      // ── 代码块 ────────────────────────────────────────────────────────
      rules.push(`${onBody}{--dsw-alias-markdown-code-block:${light(c)}!important}`);
      rules.push(`${onBodyDark}{--dsw-alias-markdown-code-block:${dark(c)}!important}`);
      rules.push(`${onBody}{--dsw-alias-markdown-code-block-banner:${light(up(code, 0.04))}!important}`);
      rules.push(`${onBodyDark}{--dsw-alias-markdown-code-block-banner:${dark(up(code, 0.04))}!important}`);
      rules.push(`${onBody}{--dsw-alias-markdown-inline-code:${light(up(code, 0.07))}!important}`);
      rules.push(`${onBodyDark}{--dsw-alias-markdown-inline-code:${dark(up(code, 0.07))}!important}`);
      // The literal class every fenced block carries (frontend index-CN7NIWNw.js:165),
      // plus its `data-code-block-banner` header. `pre` is left alone on purpose: it has
      // no background of its own, so painting it would darken the card twice.
      rules.push(`html body .md-code-block{background-color:${light(c)}!important}`);
      rules.push(`html body .md-code-block [data-code-block-banner]{background-color:${light(up(code, 0.04))}!important}`);
      rules.push(`html [data-ds-dark-theme] .md-code-block{background-color:${dark(c)}!important}`);
      rules.push(
        `html [data-ds-dark-theme] .md-code-block [data-code-block-banner]{background-color:${dark(up(code, 0.04))}!important}`,
      );
      return rules.join('');
    }

    /** The light veil laid over the picture (kept identical on base and side bands). */
    const VEIL_ALPHA = 0.18;
    const veilOf = (rgb) => `rgba(${rgb},${VEIL_ALPHA})`;

    /**
     * The base picture is the body's own background (one continuous image) and every
     * surface is made translucent, so the chat area and both sidebars reveal it. The
     * side bands of the optional complete picture are painted by `applyBands` with the
     * exact same geometry, which is what makes them line up as if painted on the base.
     */
    function windowModeCss(s, file) {
      const focus = Math.max(0, Math.min(100, Number(s.focus) || 50));
      const url = `url("${wallUrl(file)}")`;
      const veil = veilOf;
      // Uniform cover size, window-anchored: the base picture never moves.
      const size = windowBackgroundGeometry(focus);
      const sizeCss = size.raw
        ? `background-size:${size.width}px ${size.height}px,${size.width}px ${size.height}px!important;background-position:${size.posX}px ${size.posY}px,${size.posX}px ${size.posY}px!important`
        : `background-size:cover,cover!important;background-position:center ${focus}%,center ${focus}%!important`;
      const backgroundFor = (rgb) =>
        [
          `background-image:linear-gradient(${veil(rgb)},${veil(rgb)}),${url}!important`,
          sizeCss,
          'background-repeat:no-repeat,no-repeat!important',
          'background-attachment:fixed,fixed!important',
          'background-color:transparent!important',
        ].join(';');
      return [
        surfaceTokenRules(s),
        '[data-cyrene-wallpaper]{display:none!important}',
        'html body [id=root]{background:transparent!important}',
        // The side-band layer: above the body background, below everything the app paints.
        '[data-cyrene-bands]{position:fixed;top:0;left:0;right:0;bottom:0;z-index:-1;pointer-events:none;overflow:hidden}',
        '[data-cyrene-band]{position:absolute;top:0;bottom:0;display:none;background-color:transparent}',
        `html body,html body[data-cy-grad]{${backgroundFor(hexToRgbTriple(s.tint))}}`,
        `[data-ds-dark-theme],html body[data-cy-grad][data-ds-dark-theme]{${backgroundFor(hexToRgbTriple(s.tintDark))}}`,
      ].join('');
    }

    function wallCss(s) {
      const washLight = `rgba(255,255,255,${s.wash})`;
      const washLight2 = `rgba(255,255,255,${Math.min(1, s.wash + 0.22)})`;
      const washDark = `rgba(14,10,22,${s.wash})`;
      const washDark2 = `rgba(14,10,22,${Math.min(1, s.wash + 0.22)})`;
      return [
        // Let the wallpaper through: the app paints its surfaces with these tokens.
        'html body{background:transparent!important}',
        'html body[data-cy-grad]{background:transparent!important}',
        'html body [id=root]{background:transparent!important}',
        surfaceTokenRules(s),
        // The layer itself: fixed to the viewport, first child of body, full bleed.
        // z-index:-1 keeps it *behind* everything the app paints — including the
        // theme's particle canvas (z-index:1) and the pink gradient — while still
        // covering the whole window. No opaque fallback colour: if the media fails
        // to load, the pink theme shows through instead of a flat panel.
        '[data-cyrene-wallpaper]{position:fixed;top:0;left:0;right:0;bottom:0;width:100vw;height:100vh;z-index:-1;pointer-events:none;overflow:hidden;background:transparent}',
        // object-fit:cover fills the window at any aspect ratio; the scale hides the blur bleed.
        `[data-cyrene-wallpaper-media]{position:absolute;top:0;left:0;width:100%;height:100%;min-width:100%;min-height:100%;object-fit:cover;object-position:center ${Math.max(0, Math.min(100, Number(s.focus) || 50))}%;transform:scale(${coverScale(s.blur)});transform-origin:center center;filter:blur(${s.blur}px) brightness(${s.brightness}) saturate(${s.saturation})}`,
        `[data-cyrene-wallpaper-wash]{position:absolute;inset:0;background:linear-gradient(180deg,${washLight} 0%,${washLight} 45%,${washLight2} 100%)}`,
        `[data-ds-dark-theme] [data-cyrene-wallpaper-wash]{background:linear-gradient(180deg,${washDark} 0%,${washDark} 45%,${washDark2} 100%)}`,
      ].join('');
    }

    function ensureWallHost() {
      if (wallHost !== null) return wallHost;
      wallHost = document.createElement('div');
      wallHost.setAttribute('data-cyrene-wallpaper', '');
      const wash = document.createElement('div');
      wash.setAttribute('data-cyrene-wallpaper-wash', '');
      wallHost.appendChild(wash);
      // First child of body: everything the app paints afterwards sits on top.
      document.body.prepend(wallHost);
      return wallHost;
    }

    let resizeHooked = false;

    /** The blur compensation depends on the viewport, so re-emit on resize. */
    function ensureResizeHook() {
      if (resizeHooked || typeof window === 'undefined') return;
      resizeHooked = true;
      let timer = 0;
      window.addEventListener('resize', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (wall.state.enabled) setTag(wallTagId, wallCss(wall.state));
        }, 200);
      });
    }

    function applyWallpaper() {
      if (typeof document === 'undefined') return;
      // 0.3.1 — a hand-over character (fat-fish) paints NOTHING of ours. The store still
      // changes (the settings sliders stay live and are remembered per character), but
      // the applier has to stay inert — and it has to *stay* empty rather than merely
      // skip one repaint, because an old wallpaper would otherwise survive under the
      // target skin and read as "the previous look".
      if (suppressPaint) {
        setTag(wallTagId, '');
        teardownPaintLayers();
        return;
      }
      const s = wall.state;
      const file = currentWallFile();
      if (!s.enabled || file === '') {
        if (wallHost !== null) wallHost.style.display = 'none';
        hideBands();
        setTag(wallTagId, '');
        // No picture: the sky goes opaque, but the stars stay right where they were.
        refreshStarGradient();
        wall.emit();
        return;
      }
      const host = ensureWallHost();
      // One unified behaviour: a picture is painted as the window background (continuous,
      // sidebars included). A video can only live in an element, so it uses the fixed
      // full-window layer instead — the translucent surfaces make both look the same.
      if (!isVideo(file)) {
        host.style.display = 'none';
        if (artFile !== file) {
          artFile = file;
          loadArtSize(file); // 重新量一次底图尺寸；加载完成后会再调用一次 applyWallpaper
        }
        startBandObservers();
        setTag(wallTagId, windowModeCss(s, file));
        // Paint the complete picture's side bands into whichever sidebars are open, using
        // the same geometry as the base so the extra elements land exactly in place.
        applyBands(s.overlay, windowBackgroundGeometry(Math.max(0, Math.min(100, Number(s.focus) || 50))), veilOf(hexToRgbTriple(s.tint)));
        refreshStarGradient();
        wall.emit();
        return;
      }
      hideBands();
      host.style.display = '';
      const key = `${isVideo(file) ? 'video' : 'image'}:${file}`;
      if (wallMounted !== key) {
        if (wallMedia !== null) wallMedia.remove();
        const kind = isVideo(file) ? 'video' : 'img';
        wallMedia = document.createElement(kind);
        wallMedia.setAttribute('data-cyrene-wallpaper-media', '');
        if (kind === 'video') {
          wallMedia.autoplay = true;
          wallMedia.muted = true;
          wallMedia.loop = true;
          wallMedia.playsInline = true;
          wallMedia.setAttribute('playsinline', '');
          wallMedia.setAttribute('preload', 'auto');
        }
        wallMedia.src = wallUrl(file);
        wallMedia.addEventListener('error', () => {
          wallDiag = `媒体加载失败：${file}（点「检查壁纸文件」看 HTTP 状态）`;
          wall.emit();
        });
        host.prepend(wallMedia);
        wallMounted = key;
        if (kind === 'video' && typeof wallMedia.play === 'function') {
          const played = wallMedia.play();
          if (played !== undefined && typeof played.catch === 'function') played.catch(() => {});
        }
      }
      setTag(wallTagId, wallCss(s));
      ensureResizeHook();
      refreshStarGradient();
      wall.emit();
    }

    async function rescanWallpapers() {
      try {
        const res = await fetch('/cyrene-wallpaper/index.json', { cache: 'no-store' });
        if (res.ok) {
          wallInfo = await res.json();
          wallDiag = `列表 HTTP ${res.status} · 目录 ${wallInfo.dir} · ${wallInfo.files.length} 个文件`;
        } else {
          wallDiag = `取列表失败：HTTP ${res.status}（宿主半体可能是旧版本，需要完全重启 DSH）`;
        }
      } catch (error) {
        wallDiag = `取列表异常：${String(error)}`;
      }
      applyWallpaper();
    }

    /** Dump exactly what the browser computed, so a hidden layer can be diagnosed. */
    function collectWallDiag() {
      const cs = (el, prop) => {
        if (el === null || el === undefined) return '(无元素)';
        const value = getComputedStyle(el).getPropertyValue(prop);
        return (value ?? '').trim() || '(空)';
      };
      const shell = document.querySelector('[id=root]');
      const chat = document.querySelector(CHAT);
      const styleTag = document.querySelector(`style[data-plugin-css=${JSON.stringify(wallTagId)}]`);
      const media = wallMedia;
      const size =
        media === null
          ? '(无媒体)'
          : media.naturalWidth
            ? `${media.naturalWidth}×${media.naturalHeight}`
            : media.videoWidth
              ? `${media.videoWidth}×${media.videoHeight}`
              : '(未解码)';
      wallDiag = [
        `开关=${wall.state.enabled ? '开' : '关'}`,
        `文件=${currentWallFile() || '(空)'}`,
        `层=${wallHost === null ? '无' : `有(${wallHost.style.display || 'block'})`}`,
        `媒体=${media === null ? '无' : media.tagName} ${size}`,
        `媒体 filter=${cs(media, 'filter')}`,
        `样式标签=${styleTag === null ? '无' : `${styleTag.textContent.length} 字符`}`,
        `--bg-base@html=${cs(document.documentElement, '--dsw-alias-bg-base')}`,
        `@body=${cs(document.body, '--dsw-alias-bg-base')}`,
        `body 底色=${cs(document.body, 'background-color')}`,
        `#root 底色=${cs(shell, 'background-color')}`,
        `对话区底色=${cs(chat, 'background-color')}`,
        `body 上有 data-cyrene-skin=${document.body.hasAttribute('data-cyrene-skin') ? '有' : '无'}`,
        `让位=${suppressPaint ? '是（本插件不画任何层）' : '否'}`,
        `当前皮肤=${document.documentElement.getAttribute('data-dsh-skin') || '(stock)'}`,
        `skinHold=${JSON.stringify(ca.state.skinHold ?? null)}`,
        `最近一次皮肤切换=${lastSkinResult}`,
        `窗口尺寸=${typeof window === 'undefined' ? '?' : `${window.innerWidth}×${window.innerHeight}`}`,
        ...bandProbe(),
        ...centerProbe(cs),
      ].join(' ｜ ');
      wall.emit();
    }

    /** State of the side-band overlay: is the picture chosen and where is it drawn. */
    function bandProbe() {
      const overlay = wall.state.overlay || '';
      const described = (el) => {
        if (el === null) return '未建';
        if (el.style.display !== 'block') return `隐藏(${el.style.display || '默认 none'})`;
        return `显示 x=${el.style.left} w=${el.style.width} 图=${el.style.backgroundImage.includes('url') ? '有' : '无'}`;
      };
      return [
        `叠加图=${overlay === '' ? '(未选)' : overlay}`,
        `贴片容器=${bandHost === null ? '未建' : bandHost.style.display === 'none' ? '隐藏' : '显示'}`,
        `左贴片=${described(bandLeft)}`,
        `右贴片=${described(bandRight)}`,
        `原图尺寸=${artSize === null ? '未探测' : `${artSize.w}×${artSize.h}`}`,
      ];
    }

    /** Who is painted on top at the window centre, and which ancestors are opaque. */
    function centerProbe(cs) {
      if (typeof window === 'undefined' || typeof document.elementFromPoint !== 'function') return [];
      const top = document.elementFromPoint(Math.round(window.innerWidth / 2), Math.round(window.innerHeight / 2));
      if (top === null) return ['窗口中心元素=(空)'];
      const describe = (el) => {
        const cls = typeof el.className === 'string' ? el.className.split(/\s+/).slice(0, 2).join('.') : '';
        return `${el.tagName.toLowerCase()}${cls === '' ? '' : `.${cls}`} bg=${cs(el, 'background-color')} z=${cs(el, 'z-index')}`;
      };
      const out = [`窗口中心最上层=${describe(top)}`];
      const opaque = [];
      let node = top;
      for (let i = 0; i < 14 && node !== null && node !== document.documentElement; i += 1) {
        const bg = cs(node, 'background-color');
        if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' && bg !== '(空)') {
          opaque.push(`${node.tagName.toLowerCase()}=${bg}`);
        }
        node = node.parentElement;
      }
      out.push(`不透明祖先=${opaque.length === 0 ? '无' : opaque.slice(0, 5).join(', ')}`);
      return out;
    }

    /** Ask the host for the chosen file and report exactly what came back. */
    async function checkWallpaperFile() {
      const file = currentWallFile();
      if (file === '') {
        wallDiag = '没有可用的壁纸文件：目录列表为空';
        wall.emit();
        return;
      }
      try {
        const res = await fetch(wallUrl(file), { cache: 'no-store' });
        const blob = await res.blob();
        wallDiag = `文件 HTTP ${res.status} · ${res.headers.get('content-type') ?? '?'} · ${blob.size} 字节 · ${file}`;
      } catch (error) {
        wallDiag = `文件请求异常：${String(error)}`;
      }
      wall.emit();
    }

    function WallPanel() {
      const state = useStore(wall);
      const file = currentWallFile();
      const children = [
        h('div', { key: 'dir', style: label() }, '文件目录：' + (wallInfo.dir || '<DSH_HOME>/wallpaper')),
        h(
          'div',
          { key: 'switch', style: { display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' } },
          h(Switch, {
            on: state.enabled,
            labelText: '壁纸开关',
            onToggle: () => wall.set({ enabled: !state.enabled }),
          }),
          h('span', { style: label() }, wallInfo.files.length === 0 ? '没找到壁纸文件' : `共 ${wallInfo.files.length} 个`),
        ),
      ];

      if (wallInfo.files.length > 0) {
        children.push(
          h(
            Row,
            {
              key: 'file',
              title: '底图壁纸（固定不动）',
              hint: '图片（png/jpg/webp/gif）铺满整个界面；视频（mp4/webm/mov）也支持，走独立层播放',
            },
            h(
              'select',
              {
                value: file,
                onChange: (e) => wall.set({ file: e.target.value, enabled: true }),
                style: { ...inputStyle, cursor: 'pointer' },
              },
              ...wallInfo.files.map((f) => h('option', { key: f, value: f }, f)),
            ),
          ),
          h(
            Row,
            {
              key: 'overlay',
              title: '侧栏叠加图（完整图，可选）',
              hint: '选一张与底图同构图、只是两侧多了元素（如左边的孩童飞鸟、右边的神殿）的图：打开侧栏时，它对应那一侧的画面会精确叠在底图同一坐标上，像画上去一样',
            },
            h(
              'select',
              {
                value: state.overlay,
                onChange: (e) => wall.set({ overlay: e.target.value, enabled: true }),
                style: { ...inputStyle, cursor: 'pointer' },
              },
              h('option', { key: '', value: '' }, '（不用叠加图）'),
              ...wallInfo.files.map((f) => h('option', { key: f, value: f }, f)),
            ),
          ),
          state.panel >= 0.98
            ? h(
                'div',
                { key: 'warn', style: label({ color: '#ff5b8a' }) },
                '⚠️ 主区不透明度 = 100%：面板是实心的，壁纸会被完全挡住。请拉到 60% 左右。',
              )
            : null,
          h(SliderRow, {
            key: 'panel',
            title: '主区不透明度（对话区）',
            hint: '越低壁纸越透；文字对比度也越低，50%~70% 比较好看',
            value: state.panel,
            min: 0.05,
            max: 1,
            step: 0.01,
            onChange: (v) => wall.set({ panel: v }),
            format: (v) => `${Math.round(v * 100)}%`,
          }),
          h(SliderRow, {
            key: 'sidebar',
            title: '侧栏不透明度（左右两侧）',
            hint: '侧栏用的是另一个底色 token，所以单独给一个滑杆；调到最低就是全透明玻璃、壁纸为主',
            value: state.sidebar,
            min: 0.05,
            max: 1,
            step: 0.01,
            onChange: (v) => wall.set({ sidebar: v }),
            format: (v) => `${Math.round(v * 100)}%`,
          }),
          // ── 0.2.0: the two surfaces the panel token never reached ──────────────
          h(SliderRow, {
            key: 'bubble',
            title: '对话框不透明度（消息气泡）',
            hint: '消息气泡自己的底色（--dsw-specific-bubble），默认跟随本模式的主区不透明度；调低就是玻璃气泡，壁纸会透出来',
            value: state.bubble,
            min: 0.03,
            max: 1,
            step: 0.01,
            onChange: (v) => wall.set({ bubble: v }),
            format: (v) => `${Math.round(v * 100)}%`,
          }),
          h(SliderRow, {
            key: 'code',
            title: '代码块不透明度',
            hint: '代码块卡片 / 终端 / 搜索结果的底色（--dsw-alias-markdown-code-block + .md-code-block），默认比对话框略实，保证代码读得清',
            value: state.code,
            min: 0.03,
            max: 1,
            step: 0.01,
            onChange: (v) => wall.set({ code: v }),
            format: (v) => `${Math.round(v * 100)}%`,
          }),
          h(SliderRow, {
            key: 'focus',
            title: '画面焦点（上下）',
            hint: '底图等比铺满、锚定窗口中心（永不移动，与侧栏无关）；这里决定上下保留哪一段（0=画面顶部贴窗口顶部，100=底部贴窗口底部）',
            value: state.focus,
            min: 0,
            max: 100,
            step: 1,
            onChange: (v) => wall.set({ focus: v }),
            format: (v) => `${v}%`,
          }),
          h(SliderRow, {
            key: 'blur',
            title: '模糊（仅视频壁纸生效）',
            hint: '图片请用预模糊文件（bg-soft-12 / bg-haze-28 / bg-heavy-55）；视频在这里实时模糊',
            value: state.blur,
            min: 0,
            max: 80,
            step: 1,
            onChange: (v) => wall.set({ blur: v }),
            format: (v) => `${v}px`,
          }),
          h(
            Row,
            {
              key: 'tint',
              title: '面板底色（保留粉色）',
              hint: '面板与侧栏的半透明底色，默认珍珠粉；想要纯白就改成 #ffffff',
            },
            h(
              'div',
              { style: { display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' } },
              h('input', {
                type: 'color',
                value: state.tint,
                onChange: (e) => wall.set({ tint: e.target.value }),
                style: { width: '52px', height: '30px', border: 'none', background: 'transparent', cursor: 'pointer' },
              }),
              h('span', { style: label() }, `亮色 ${state.tint}`),
              h('input', {
                type: 'color',
                value: state.tintDark,
                onChange: (e) => wall.set({ tintDark: e.target.value }),
                style: { width: '52px', height: '30px', border: 'none', background: 'transparent', cursor: 'pointer' },
              }),
              h('span', { style: label() }, `暗色 ${state.tintDark}`),
            ),
          ),
        );
      }

      children.push(
        h(
          'div',
          { key: 'actions', style: { display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' } },
          button('重新扫描壁纸文件夹', rescanWallpapers),
          button('检查壁纸文件', checkWallpaperFile),
          button('运行诊断', collectWallDiag),
        ),
        wallDiag === ''
          ? null
          : h('div', { key: 'diag', style: label({ color: '#ff5b8a', wordBreak: 'break-all' }) }, wallDiag),
        h(
          'div',
          { key: 'note', style: label() },
          '底图固定不动（锚定窗口中心、等比铺满）；打开侧栏时把「侧栏叠加图」对应那一侧的画面，' +
            '按与底图相同的坐标精确叠上去，所以看起来是画上去的。视频走独立层播放，不参与叠加。' +
            '「对话框不透明度」只改消息气泡，「代码块不透明度」只改代码卡片/终端/搜索结果的底色，两者都按角色各存一套，' +
            '想改默认值可以写 <DSH_HOME>/character-agent/characters.json 的 wallpaper.bubble / wallpaper.code。',
        ),
      );

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px', padding: '6px 0' } }, children);
    }

    // ═════════════════ 星空底 + 星星粒子（0.2.0，大肥鱼专属） ══════════════════
    //
    // 蓝色大肥鱼 has no theme package of its own, so its night sky is ours. ONE canvas
    // owns both halves of it:
    //   • the deep-blue gradient (`#0b1a33` → `#16264a`), painted at `wash` alpha while
    //     a wallpaper picture is showing so the picture still reads through, and opaque
    //     when there is no wallpaper — that is the "星空底";
    //   • the twinkling stars, at full alpha, on top of it.
    //
    // Stacking: the canvas is a direct child of <body> appended *last*, with
    // `position:fixed; inset:0; z-index:-1`. Negative-z-index children paint after the
    // root/body background (so above the wallpaper, which is the body's background
    // image, and above the `[data-cyrene-bands]` side bands at the same z-index but
    // earlier in DOM order) and before every in-flow block (so below all panels).
    //
    // Cost: one canvas, one rAF loop capped at ~30 fps, star objects allocated once per
    // resize (never per frame), the gradient cached, and the loop stops entirely while
    // `document.hidden` or the canvas is not mounted.

    const starTagId = 'dsh-character-agent/stars.css';
    const STARS_CSS = [
      // `inset:0` is the contract; the explicit longhands keep older engines honest.
      '[data-ca-starfield-canvas]{position:fixed;top:0;right:0;bottom:0;left:0;inset:0;width:100vw;height:100vh;' +
        'display:block;pointer-events:none;user-select:none;-webkit-user-drag:none;z-index:-1;background:transparent}',
      'html:not([data-ca-starfield]) [data-ca-starfield-canvas]{display:none!important}',
      // The spec's guarantee, spelled out: the layer is 大肥鱼-only. The starfield flag is
      // only ever set for a character whose registry entry enables it (fat-fish today),
      // so this rule costs nothing and makes the gate auditable in one line.
      'html:not([data-ca-character="fat-fish"]) [data-ca-starfield-canvas]{display:none!important}',
    ].join('');

    let starCanvas = null;
    let starCtx = null;
    let starRaf = 0;
    let starLastDraw = 0;
    let starField = null; // { w, h, dpr, gradient, stars[] } — rebuilt on resize only
    let starConfig = null; // resolved starfield config for the live character
    let starOn = false; // the live on/off state (also what the panel switch shows)
    let starHooks = false;

    /** Resolve a character's starfield, honouring the per-character manual toggle. */
    function starfieldFor(id) {
      const character = REGISTRY?.characters?.[id];
      const sf = character?.starfield ?? {};
      const saved = ca.state.per?.[id]?.star;
      const top = typeof sf.top === 'string' ? sf.top : '#0b1a33';
      const bottom = typeof sf.bottom === 'string' ? sf.bottom : '#16264a';
      return {
        enabled: saved?.enabled ?? sf.enabled === true,
        top,
        bottom,
        wash: Number.isFinite(Number(sf.wash)) ? Math.max(0, Math.min(1, Number(sf.wash))) : 0.52,
        density: Number.isFinite(Number(sf.density)) ? Math.max(0.1, Math.min(4, Number(sf.density))) : 1,
      };
    }

    /**
     * `prefers-reduced-motion`, cached. Calling `matchMedia()` per frame would allocate a
     * MediaQueryList on every tick — exactly the "no objects per frame" rule.
     */
    let reducedMotion = null;

    function starsReduced() {
      if (reducedMotion !== null) return reducedMotion;
      try {
        reducedMotion =
          typeof window.matchMedia === 'function' &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches === true;
      } catch {
        reducedMotion = false;
      }
      return reducedMotion;
    }

    function ensureStarCanvas() {
      if (starCanvas !== null) return starCanvas;
      if (typeof document === 'undefined') return null;
      starCanvas = document.createElement('canvas');
      starCanvas.setAttribute('data-ca-starfield-canvas', '');
      starCanvas.setAttribute('aria-hidden', 'true');
      // Last child of <body>: later siblings paint above earlier ones at the same
      // (negative) z-index, which is what puts the stars over the wallpaper.
      (document.body ?? document.documentElement).appendChild(starCanvas);
      starCtx = typeof starCanvas.getContext === 'function' ? starCanvas.getContext('2d') : null;
      return starCanvas;
    }

    function dropStarCanvas() {
      stopStarLoop();
      if (starCanvas !== null && typeof starCanvas.remove === 'function') starCanvas.remove();
      starCanvas = null;
      starCtx = null;
      starField = null;
    }

    /** Is a wallpaper picture actually painted right now? Decides the gradient alpha. */
    function wallpaperShowing() {
      return wall.state.enabled === true && currentWallFile() !== '';
    }

    const clampNum = (value, low, high, fallback) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return fallback;
      return Math.max(low, Math.min(high, n));
    };

    /**
     * (Re)measure the viewport and (re)seed the star field. This is the only place
     * star objects are created — never inside the animation frame.
     */
    function measureStars(cfg) {
      const canvas = ensureStarCanvas();
      if (canvas === null) return;
      const w = Math.max(320, Math.round((typeof window === 'undefined' ? 1280 : window.innerWidth) || 1280));
      const h = Math.max(240, Math.round((typeof window === 'undefined' ? 720 : window.innerHeight) || 720));
      const dpr = clampNum(typeof window === 'undefined' ? 1 : window.devicePixelRatio, 1, 2, 1);
      if (typeof canvas.style === 'object' && canvas.style !== null) {
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        canvas.style.background = 'transparent';
      }
      try {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      } catch {
        /* an unwritable canvas is still a valid (blank) layer */
      }
      const ctx = ctxOf(canvas);
      starCtx = ctx;
      let gradient = null;
      const alpha = wallpaperShowing() ? cfg.wash : 1;
      if (ctx !== null && typeof ctx.createLinearGradient === 'function') {
        // Cached: created here, never in the frame loop.
        gradient = ctx.createLinearGradient(0, 0, 0, h);
        gradient.addColorStop(0, rgbaOf(cfg.top, alpha));
        gradient.addColorStop(1, rgbaOf(cfg.bottom, alpha));
      }
      // Count and size follow the screen: bigger window → more, slightly larger stars.
      const area = w * h;
      const scale = Math.max(0.75, Math.min(1.7, Math.sqrt(area) / 1180));
      const count = Math.round(clampNum((area / 13500) * cfg.density, 70, 320, 140));
      const stars = [];
      for (let i = 0; i < count; i += 1) {
        const big = Math.random() < 0.08;
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: (big ? 1.6 + Math.random() * 1.1 : 0.5 + Math.random() * 1.1) * scale,
          base: (big ? 0.85 : 0.45) + Math.random() * 0.45,
          phase: Math.random() * Math.PI * 2,
          speed: 0.5 + Math.random() * 1.6, // twinkle rate (rad/s)
          driftPhase: Math.random() * Math.PI * 2,
          driftSpeed: 0.06 + Math.random() * 0.14, // very slow drift
          driftAmp: 1.5 + Math.random() * 3.5, // px — "极小幅度漂移"
        });
      }
      starField = { w, h, dpr, gradient, alpha, stars };
    }

    function ctxOf(canvas) {
      if (canvas === null || typeof canvas.getContext !== 'function') return null;
      try {
        return canvas.getContext('2d') ?? null;
      } catch {
        return null;
      }
    }

    /** '#0b1a33' → 'rgba(11,26,51,0.52)'. */
    function rgbaOf(hex, alpha) {
      return `rgba(${hexToRgbTriple(hex)},${alpha})`;
    }

    /** Paint one frame. No allocations: the gradient and every star already exist. */
    function drawStars(timeMs) {
      const ctx = starCtx;
      const field = starField;
      if (ctx === null || field === null) return;
      const still = starsReduced();
      const t = timeMs / 1000;
      try {
        if (typeof ctx.setTransform === 'function') ctx.setTransform(field.dpr, 0, 0, field.dpr, 0, 0);
        ctx.clearRect(0, 0, field.w, field.h);
        if (field.gradient !== null) {
          ctx.fillStyle = field.gradient;
          ctx.fillRect(0, 0, field.w, field.h);
        }
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < field.stars.length; i += 1) {
          const star = field.stars[i];
          const twinkle = still ? 0.72 : 0.5 + 0.5 * Math.sin(star.phase + t * star.speed);
          ctx.globalAlpha = clampNum(star.base * (0.3 + 0.7 * twinkle), 0, 1, 0.5);
          const x = still ? star.x : star.x + Math.sin(star.driftPhase + t * star.driftSpeed) * star.driftAmp;
          const y = still
            ? star.y
            : star.y + Math.cos(star.driftPhase * 1.7 + t * star.driftSpeed * 0.8) * star.driftAmp * 0.6;
          ctx.fillRect(x, y, star.r, star.r);
        }
        ctx.globalAlpha = 1;
      } catch {
        /* a torn-down context must never break the appearance layer */
      }
    }

    /**
     * Keep the sky in step with the wallpaper without re-seeding the stars.
     *
     * With a picture showing the gradient is laid on at `starfield.wash`; with none it
     * goes fully opaque (the pure 星空底). Only the gradient object is rebuilt, and only
     * when that alpha actually changes, so dragging a wallpaper slider costs nothing.
     */
    function refreshStarGradient() {
      if (starCtx === null || starField === null || starConfig === null) return;
      const alpha = wallpaperShowing() ? starConfig.wash : 1;
      if (starField.alpha === alpha) return;
      try {
        const gradient = starCtx.createLinearGradient(0, 0, 0, starField.h);
        gradient.addColorStop(0, rgbaOf(starConfig.top, alpha));
        gradient.addColorStop(1, rgbaOf(starConfig.bottom, alpha));
        starField.gradient = gradient;
        starField.alpha = alpha;
      } catch {
        return;
      }
      drawStars(typeof performance === 'object' ? performance.now() : Date.now());
    }

    function stopStarLoop() {
      if (starRaf !== 0 && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(starRaf);
      starRaf = 0;
    }

    function startStarLoop() {
      if (starRaf !== 0 || !starOn) return;
      if (typeof requestAnimationFrame !== 'function') {
        // No rAF (headless / exotic shell): draw one static frame and stop.
        drawStars(0);
        return;
      }
      starLastDraw = 0;
      starRaf = requestAnimationFrame(starLoop);
    }

    function starLoop(now) {
      starRaf = 0;
      if (!starOn || starField === null) return;
      if (typeof document !== 'undefined' && document.hidden === true) return; // paused until visible
      starRaf = requestAnimationFrame(starLoop);
      if (now - starLastDraw < 33) return; // ~30 fps: plenty for a twinkle, cheap
      starLastDraw = now;
      drawStars(now);
    }

    /** Install the visibility/resize hooks exactly once. */
    function ensureStarHooks() {
      if (starHooks || typeof window === 'undefined') return;
      starHooks = true;
      const onResize = () => {
        if (!starOn) return;
        measureStars(starConfig ?? starfieldFor(currentCharacter));
        drawStars(typeof performance === 'object' ? performance.now() : Date.now());
      };
      window.addEventListener('resize', onResize);
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (!starOn) return;
          if (document.hidden === true) {
            stopStarLoop();
          } else {
            startStarLoop();
          }
        });
      }
      if (typeof window.matchMedia === 'function') {
        try {
          const query = window.matchMedia('(prefers-reduced-motion: reduce)');
          reducedMotion = query.matches === true;
          if (typeof query.addEventListener === 'function') {
            query.addEventListener('change', (event) => {
              reducedMotion = event.matches === true;
              if (!starOn) return;
              stopStarLoop();
              if (reducedMotion) drawStars(0);
              else startStarLoop();
            });
          }
        } catch {
          /* older matchMedia: the cached flag simply stays at its first reading */
        }
      }
    }

    /**
     * Apply the starfield for the character on screen.
     *
     * Only `data-ca-character="fat-fish"` (or any other character whose registry
     * entry enables it) ever draws: switching to 昔涟 removes the canvas from the DOM,
     * not merely hides it, so the acceptance test can assert its absence.
     */
    function applyStars() {
      if (typeof document === 'undefined') return;
      const cfg = starfieldFor(currentCharacter);
      starConfig = cfg;
      // 0.3.1 — in a hand-over character NOTHING of ours paints, and the starfield is our
      // paint: it stays off no matter what the per-character switch says. The switch keeps
      // remembering the choice, so it comes back when a self-painting character returns.
      const next = suppressPaint !== true && cfg.enabled === true;
      const root = document.documentElement;
      if (next) root.dataset.caStarfield = 'on';
      else if (root.dataset !== undefined) delete root.dataset.caStarfield;
      setTag(starTagId, next ? STARS_CSS : '');
      starOn = next;
      if (!next) {
        dropStarCanvas();
        return;
      }
      measureStars(cfg);
      ensureStarHooks();
      const still = starsReduced();
      drawStars(typeof performance === 'object' ? performance.now() : Date.now());
      if (still) {
        stopStarLoop(); // 静止：一帧就够
        return;
      }
      startStarLoop();
    }

    // ─────────────────────── background music ───────────────────────────

    const bgm = makeStore('dsh-cyrene-hero.bgm', { enabled: true, volume: 0.45, track: '' });
    let bgmInfo = { dir: '', tracks: [] };
    let audio = null;
    let status = 'idle';
    let gestureArmed = false;

    function currentTrack() {
      const s = bgm.state;
      if (s.track !== '' && bgmInfo.tracks.includes(s.track)) return s.track;
      return bgmInfo.tracks[0] ?? '';
    }

    function ensureAudio() {
      if (audio !== null) return audio;
      audio = document.createElement('audio');
      audio.loop = true;
      audio.preload = 'auto';
      document.body.appendChild(audio);
      return audio;
    }

    function armGesture() {
      if (gestureArmed) return;
      gestureArmed = true;
      const start = () => {
        gestureArmed = false;
        applyAudio();
      };
      document.addEventListener('pointerdown', start, { once: true, capture: true });
      document.addEventListener('keydown', start, { once: true, capture: true });
    }

    function applyAudio() {
      if (typeof document === 'undefined') return;
      const s = bgm.state;
      if (bgmInfo.tracks.length === 0) {
        status = 'notrack';
        if (audio !== null) audio.pause();
        bgm.emit();
        return;
      }
      const el = ensureAudio();
      const src = `/cyrene-bgm/${encodeURIComponent(currentTrack())}`;
      if (el.getAttribute('src') !== src) el.setAttribute('src', src);
      el.volume = Math.max(0, Math.min(1, Number(s.volume) || 0));
      if (!s.enabled) {
        el.pause();
        status = 'paused';
        bgm.emit();
        return;
      }
      const played = el.play();
      if (played !== undefined && typeof played.then === 'function') {
        played
          .then(() => {
            status = 'playing';
            bgm.emit();
          })
          .catch(() => {
            status = 'blocked';
            armGesture();
            bgm.emit();
          });
      } else {
        status = 'playing';
        bgm.emit();
      }
    }

    async function rescanTracks() {
      try {
        const res = await fetch('/cyrene-bgm/index.json', { cache: 'no-store' });
        if (res.ok) bgmInfo = await res.json();
      } catch {
        /* keep the previous list */
      }
      applyAudio();
    }

    const STATUS_TEXT = {
      playing: '正在播放',
      paused: '已关闭',
      blocked: '等你点一下页面就会开始（浏览器自动播放限制）',
      notrack: '没找到音乐文件',
      error: '播放失败',
      idle: '准备中…',
    };

    function BgmPanel() {
      const state = useStore(bgm);
      const children = [
        h('div', { key: 'desc', style: label() }, '循环播放，出自 ' + (bgmInfo.dir || '<DSH_HOME>/bgm')),
        h(
          'div',
          { key: 'switch', style: { display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' } },
          h(Switch, {
            on: state.enabled,
            labelText: '背景音乐开关',
            onToggle: () => bgm.set({ enabled: !state.enabled }),
          }),
          h('span', { style: label(state.enabled ? { color: 'var(--ca-accent, #ff5b8a)' } : {}) }, STATUS_TEXT[status] ?? status),
        ),
      ];
      if (bgmInfo.tracks.length > 0) {
        children.push(
          h(SliderRow, {
            key: 'volume',
            title: '音量',
            value: state.volume,
            min: 0,
            max: 1,
            step: 0.05,
            onChange: (v) => bgm.set({ volume: v }),
            format: (v) => `${Math.round(v * 100)}%`,
          }),
        );
        if (bgmInfo.tracks.length > 1) {
          children.push(
            h(
              Row,
              { key: 'track', title: '曲目（只播当前这首，循环）' },
              h(
                'select',
                {
                  value: currentTrack(),
                  onChange: (e) => bgm.set({ track: e.target.value, enabled: true }),
                  style: { ...inputStyle, cursor: 'pointer' },
                },
                ...bgmInfo.tracks.map((t) => h('option', { key: t, value: t }, t)),
              ),
            ),
          );
        }
      }
      children.push(
        h(
          'div',
          { key: 'actions', style: { display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' } },
          button('重新扫描音乐文件夹', rescanTracks),
        ),
      );
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px', padding: '6px 0' } }, children);
    }

    // ──────────────────────── typography panel ──────────────────────────

    function TypographyPanel() {
      const state = useStore(type);
      const preset = FONT_PRESETS.find((p) => p.id === state.fontId) ?? FONT_PRESETS[0];

      return h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: '16px', padding: '6px 0' } },
        h(
          Row,
          { key: 'font', title: '界面字体', hint: '作用于整个界面（含对话文字）；代码块保持等宽字体不变' },
          h(
            'select',
            {
              value: state.fontId,
              onChange: (e) => type.set({ fontId: e.target.value }),
              style: { ...inputStyle, cursor: 'pointer' },
            },
            ...FONT_PRESETS.map((p) => h('option', { key: p.id, value: p.id }, p.label)),
          ),
          state.fontId === 'custom'
            ? h('input', {
                type: 'text',
                value: state.fontCustom,
                placeholder: '"Font Name", sans-serif',
                onChange: (e) => type.set({ fontCustom: e.target.value }),
                style: inputStyle,
              })
            : null,
          preset.stack === null || preset.stack === ''
            ? null
            : h('span', { style: label() }, preset.stack),
        ),
        h(SliderRow, {
          key: 'size',
          title: '对话字号',
          hint: '0 = 保持 DSH 默认；只作用于对话区正文（含列表/表格/引用）',
          value: state.chatFontSize,
          min: 0,
          max: 24,
          step: 1,
          onChange: (v) => type.set({ chatFontSize: v }),
          format: (v) => (v > 0 ? `${v}px` : '默认'),
        }),
        h(SliderRow, {
          key: 'lh',
          title: '行高',
          hint: '0 = 保持 DSH 默认',
          value: state.chatLineHeight,
          min: 0,
          max: 2.4,
          step: 0.05,
          onChange: (v) => type.set({ chatLineHeight: v }),
          format: (v) => (v > 0 ? v.toFixed(2) : '默认'),
        }),
        h(SliderRow, {
          key: 'ls',
          title: '字间距',
          hint: '0 = 保持 DSH 默认（负值更紧凑）',
          value: state.chatLetterSpacing,
          min: -0.5,
          max: 1.5,
          step: 0.05,
          onChange: (v) => type.set({ chatLetterSpacing: v }),
          format: (v) => (Math.abs(v) > 0.001 ? `${v.toFixed(2)}px` : '默认'),
        }),
        h(
          'div',
          { key: 'reset', style: { display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' } },
          button('恢复默认', () =>
            type.set({
              fontId: DEFAULTS.fontId,
              fontCustom: DEFAULTS.fontCustom,
              chatFontSize: DEFAULTS.chatFontSize,
              chatLineHeight: DEFAULTS.chatLineHeight,
              chatLetterSpacing: DEFAULTS.chatLetterSpacing,
            }),
          ),
          h('span', { style: label() }, '设置存在浏览器本地；改完立即生效，不用刷新'),
        ),
      );
    }

    // ═══════════════════ character registry & mode tracking ══════════════════
    //
    // A "mode" is the agent preset of the session on screen. The character is a
    // pure function of that preset (registry `presets`), so switching sessions is
    // enough: no reload, no restart, and the switch happens inside one store
    // notification (plus a 2 s safety net for late projections).

    /** Whale gate + per-character appearance memory + last detected mode. */
    const ca = makeStore('dsh-character-agent.v1', {
      whale: true,
      last: '',
      preset: '',
      source: '',
      session: '',
      per: {},
      /**
       * 0.2.0 — one-shot marker for 改造 4. `true` means "the new-session default has
       * already been offered/applied once", so a later manual choice in DSH's own
       * 设置 → 预设 is never overwritten again.
       */
      seeded: false,
      /**
       * 0.3.1 — the skin we borrowed while a hand-over character owned the look:
       *   { previous: string | null, skin: string, restore: boolean }
       * `previous: null` means "the stock look", which is a real value and must be
       * restorable. It lives here (localStorage) so a reload keeps the debt.
       */
      skinHold: null,
    });

    /**
     * The name of the host settings namespace that owns 「新会话默认 preset」.
     *
     * Evidence: @deepseek-ai/dsh-client-ui-agent-preset/lib/client.js:1082
     *   const AGENT_PRESET_SETTINGS_NS = "agent-preset-registry";
     * and :1094-1096
     *   async function writeDefaultPreset(ctx, id, expectedRevision) {
     *     const response = await ctx.remote.settings.update(AGENT_PRESET_SETTINGS_NS,
     *       { selectedDefault: id }, expectedRevision);
     *     return response.ok ? void 0 : response.error.message;
     *   }
     * The host field is declared `selectedDefault: z.string().volatile()`
     * (@deepseek-ai/dsh-agent-preset-registry/lib/index.js:443) and `.volatile()` is
     * exactly what Settings may persist — through the *profile's Cordis patch*
     * (@deepseek-ai/dsh-settings README: "Changes persist through the active
     * profile's Cordis patch"). The live profile patch currently has no
     * `agent-preset-registry` entry at all, so the first write would *insert* one —
     * which is why this plugin does not do it behind the user's back.
     */
    const PRESET_SETTINGS_NS = 'agent-preset-registry';

    /** Set by `apply(ctx)`; the seed + the panel's write button need it later. */
    let hostCtx = null;

    /**
     * Reach a `remote.<name>` namespace without making it a hard `inject`
     * dependency: if the API Gateway or that controller is absent, this returns
     * `undefined` and the caller degrades instead of holding the whole plugin in
     * "pending" (which would also kill the appearance layer).
     */
    function remoteNamespace(ctx, name) {
      if (ctx === null || ctx === undefined) return undefined;
      try {
        const remote = typeof ctx.get === 'function' ? (ctx.get('remote') ?? ctx.remote) : ctx.remote;
        if (remote === null || remote === undefined) return undefined;
        const value = remote[name];
        return value === undefined ? undefined : value;
      } catch {
        return undefined;
      }
    }

    /** The session currently on screen, straight out of the browser's store. */
    function currentSessionSummary(ctx) {
      try {
        const list = ctx?.get?.('sessions')?.list?.getSnapshot();
        const rows = Object.values(list?.byId ?? {});
        return rows.find((row) => (row?.retainedBy?.mainView ?? 0) > 0);
      } catch {
        return undefined;
      }
    }

    /** Last outcome line shown under 「新会话默认模式」 in the settings panel. */
    let seedResult = '';

    function seedHintText() {
      return ca.state.seeded === true
        ? '已经处理过一次（dsh-character-agent.v1.seeded = true）；之后你在 DSH 设置里怎么选都不会被覆盖。'
        : '还没处理过：本插件首次启动时会为新会话把「外观」定成大肥鱼（不改 DSH 自己的设置）。';
    }

    /**
     * 改造 4 — make a new session open as 蓝色大肥鱼, exactly once.
     *
     * Two independent halves:
     *   1. the *appearance* default: `characters.js` now has `default: 'fat-fish'`,
     *      so an unmapped preset / the new-session screen already renders the fish —
     *      that needs no write at all;
     *   2. the *preset* itself: DSH's 「new-session default」 is the host settings
     *      field `agent-preset-registry.selectedDefault`, and the only client-side
     *      way to change it is `remote.settings.update(...)`, which config-editor
     *      persists into the profile's `cordis.patch.yml`. The live profile patch has
     *      no such entry yet, so the first write would insert one and change that
     *      file's bytes — the one thing this task must not do. Therefore the
     *      automatic half only uses the session-scoped
     *      `remote.agentPresets.select(sessionId, presetId)` on a *blank* session
     *      (exactly what the hero preset chip does); the persistent write is left to
     *      an explicit button in the panel (`setHostDefaultPreset`).
     */
    async function seedNewSessionDefault(ctx) {
      if (ca.state.seeded === true) return;
      ca.set({ seeded: true }); // never again, whatever the outcome below
      const session = currentSessionSummary(ctx);
      const preset = session?.projectionValues?.agentPreset;
      if (session === undefined || session.blank !== true) {
        seedResult = '新会话外观已默认成「蓝色大肥鱼」（注册表 default）；当前没有空白会话需要同步。';
        return;
      }
      if (preset === 'fat-fish') {
        seedResult = '当前空白会话已经是「蓝色大肥鱼」预设，无需改动。';
        return;
      }
      const presets = remoteNamespace(ctx, 'agentPresets');
      if (presets === undefined || typeof presets.select !== 'function') {
        seedResult = '拿不到 agentPresets 远程接口：只把外观默认成大肥鱼，预设本身没动。';
        return;
      }
      try {
        const result = await presets.select(session.id, 'fat-fish');
        seedResult =
          result?.ok === true
            ? `已把当前空白会话（${session.id}）切到「蓝色大肥鱼」预设。`
            : `宿主拒绝了切换：${result?.error?.message ?? '未知原因'}；外观仍是默认的大肥鱼。`;
      } catch (error) {
        seedResult = `切换空白会话失败：${String(error)}；外观仍是默认的大肥鱼。`;
      }
      ca.emit();
    }

    /**
     * Explicit write of DSH's own 「new-session default preset」.
     *
     * Same call the preset management section makes when you click
     * 「设为新任务默认」 (@deepseek-ai/dsh-client-ui-agent-preset/lib/client.js:1094).
     */
    async function setHostDefaultPreset(id) {
      const settings = remoteNamespace(hostCtx, 'settings');
      if (settings === undefined || typeof settings.update !== 'function') {
        seedResult = '拿不到 settings 远程接口（remote.settings），没法写 DSH 的默认预设。';
        ca.emit();
        return;
      }
      try {
        const response = await settings.update(PRESET_SETTINGS_NS, { selectedDefault: id });
        seedResult =
          response?.ok === true
            ? `已写入：新会话默认 preset = ${id}（存于 profile 的 cordis.patch.yml · agent-preset-registry · selectedDefault）。`
            : `写入失败：${response?.error?.message ?? '未知原因'}`;
      } catch (error) {
        seedResult = `写入异常：${String(error)}`;
      }
      ca.set({ seeded: true });
    }

    /** Served by the host at /character-agent/registry.json. */
    let REGISTRY = null;
    /** Character currently applied (boot starts on `cyrene`, hero.json included). */
    let currentCharacter = 'cyrene';
    /** Hero config currently applied, captured when switching away. */
    let currentHero = null;
    /** Sessions whose projection we already asked the host to refresh. */
    const projectionAsked = new Set();
    /** Re-read entry point, exposed to the settings panel's "重新检测" button. */
    let evaluateMode = () => {};

    /** Built-in copy of the default character, used when the host half is absent. */
    const FALLBACK_CHARACTER = {
      id: 'cyrene',
      label: '昔涟',
      subtitle: 'Cyrene',
      note: '宿主半体没应答 /character-agent/registry.json，已回落到内置的昔涟外观。',
      skin: { accent: '#ff5b8a', glow: 'rgba(255, 91, 138, .30)', tint: '#fff7fb', tintDark: '#1a1424' },
      hero: { ...DEFAULTS },
      wallpaper: {
        enabled: true,
        base: 'base-haze.jpg',
        overlay: 'overlay-haze.jpg',
        panel: 0.6,
        sidebar: 0.3,
        blur: 28,
        brightness: 0.94,
        saturation: 1.05,
        wash: 0.28,
        focus: 55,
        tint: '#fff7fb',
        tintDark: '#1a1424',
      },
      bgm: { enabled: true, volume: 0.45, track: '' },
      font: { fontId: 'lxgw', chatFontSize: 0, chatLineHeight: 0, chatLetterSpacing: 0 },
      pet: { visible: false },
    };

    async function loadRegistry() {
      try {
        const res = await fetch('/character-agent/registry.json', { cache: 'no-store' });
        if (res.ok) {
          const doc = await res.json();
          if (doc !== null && typeof doc === 'object' && doc.characters !== undefined) {
            REGISTRY = doc;
            return doc;
          }
        }
      } catch {
        /* host half missing or still starting: the fallback below is enough */
      }
      REGISTRY = {
        version: 0,
        // Keep the fallback consistent with characters.js: unknown/no session → 大肥鱼.
        default: 'fat-fish',
        presets: {
          'fat-fish': 'fat-fish',
          'cyrene-work': 'cyrene',
          chat: 'cyrene',
        },
        characters: { cyrene: FALLBACK_CHARACTER },
      };
      return REGISTRY;
    }

    /** Preset id -> character id, with the registry default as the catch-all. */
    function characterForPreset(presetId) {
      const characters = REGISTRY?.characters ?? {};
      const mapped = presetId === undefined ? undefined : REGISTRY?.presets?.[presetId];
      if (typeof mapped === 'string' && characters[mapped] !== undefined) return mapped;
      const fallback = REGISTRY?.default ?? 'cyrene';
      return characters[fallback] !== undefined ? fallback : 'cyrene';
    }

    function pick(source, keys) {
      const out = {};
      if (source === null || typeof source !== 'object') return out;
      for (const key of keys) if (source[key] !== undefined) out[key] = source[key];
      return out;
    }

    const HERO_KEYS = ['image', 'width', 'aspect', 'tuck', 'glow', 'hideBuiltinMark', 'greeting', 'subtitle'];
    const WALL_KEYS = [
      'enabled',
      'file',
      'overlay',
      'mode',
      'blur',
      'brightness',
      'saturation',
      'panel',
      'sidebar',
      'bubble',
      'code',
      'tint',
      'tintDark',
      'wash',
      'focus',
    ];
    const TYPE_KEYS = ['fontId', 'fontCustom', 'chatFontSize', 'chatLineHeight', 'chatLetterSpacing'];
    const BGM_KEYS = ['enabled', 'volume', 'track'];

    const num = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

    /** Snapshot the live appearance into this character's slot, so it survives a switch. */
    function captureCharacter(id) {
      if (id === '') return;
      const per = { ...(ca.state.per ?? {}) };
      per[id] = {
        wall: pick(wall.state, WALL_KEYS),
        type: pick(type.state, TYPE_KEYS),
        bgm: pick(bgm.state, BGM_KEYS),
        // 0.2.0: the 星星粒子 switch is per character too — captured from the *live*
        // state, so toggling it and then switching modes remembers the choice.
        star: { enabled: starOn },
        ...(currentHero === null ? {} : { hero: pick(currentHero, HERO_KEYS) }),
      };
      ca.set({ per });
    }

    // ── skin: one accent variable, used by our own controls and the hero glow ──
    const skinTagId = 'dsh-character-agent/skin.css';

    function applySkin(skin) {
      if (typeof document === 'undefined') return;
      const accent = typeof skin?.accent === 'string' ? skin.accent : '#ff5b8a';
      const glow = typeof skin?.glow === 'string' ? skin.glow : 'rgba(255, 91, 138, .30)';
      document.documentElement.style.setProperty('--ca-accent', accent);
      setTag(skinTagId, `:root{--ca-accent:${accent};--ca-glow:${glow}}`);
    }

    // ── whale-girl gate ─────────────────────────────────────────────────────
    //
    // dsh-whale-girl is a process-level widget: its client half appends
    //   <div id="dsh-whale-girl-mount"> (0x0, position:fixed, z-index 2147483647)
    // to <body> and portals the pet (`.wg-root`, 170x170, position:fixed) into it.
    // It is mounted for every session, so the only per-character control we can
    // own without touching that package is CSS. `display:none` on the mount takes
    // the whole subtree out of layout — the pet neither draws nor reserves space —
    // and the extra `.wg-root` rule covers a future mount swap.
    const gateTagId = 'dsh-character-agent/gate.css';
    const GATE_CSS = [
      'html[data-ca-character]:not([data-ca-character="fat-fish"]) #dsh-whale-girl-mount,',
      'html[data-ca-whale="off"] #dsh-whale-girl-mount,',
      'html[data-ca-character]:not([data-ca-character="fat-fish"]) .wg-root,',
      'html[data-ca-whale="off"] .wg-root{display:none!important}',
      // the rope overlay is an anonymous <svg> appended to <body> only while dragging
      'html[data-ca-character]:not([data-ca-character="fat-fish"]) body>svg[style*="2147483646"],',
      'html[data-ca-whale="off"] body>svg[style*="2147483646"]{display:none!important}',
    ].join('');

    function applyGate() {
      if (typeof document === 'undefined') return;
      const root = document.documentElement;
      root.dataset.caCharacter = currentCharacter === '' ? (ca.state.last || 'cyrene') : currentCharacter;
      root.dataset.caWhale = ca.state.whale === false ? 'off' : 'on';
    }

    /** Written before the first paint of anything we own (no pet flash on boot). */
    function installGateCss() {
      setTag(gateTagId, GATE_CSS);
      applyGate();
    }

    // ═════════════ 0.3.1 — 让位（hand-over）: 整套外观交给皮肤中心 ═════════════
    //
    // The user's report — 「切换皮肤时有时还会看到一些之前的底图，还有粉色，切换时全局
    // 都要变」 — was a *teardown* bug, not a paint bug. 0.2.0 repainted our layers on a
    // character switch but never removed them, and it never touched the other owners of
    // the page at all, so the previous look bled through:
    //
    //   · `[data-cyrene-bands]` stayed in the DOM (only `display:none`) with the previous
    //     base picture baked into its inline `background-image`  (client.js:594-596, 624);
    //   · our `!important` token overrides stayed behind and kept tinting panels with the
    //     old pink tint `#fff7fb` / `#1a1424`                            (client.js:645-693);
    //   · dsh-cyrene kept painting its `body[data-cy-grad]` gradient (with `!important`,
    //     which out-ranks any incoming skin), its pink `.cyrene-bg-particles` canvas at
    //     z-index 1, and its Live2D pet at z-index 2147483000
    //     (dsh-cyrene/lib/client.js:286-289, 291-293, 295, 623-626);
    //   · dsh-cyrene's non-token pink rules (focus ring, scrollbar, logo, turnStatus
    //     tokens) are NOT remapped by the mid-autumn skin, so they stay pink
    //     (dsh-cyrene/lib/client.js:259-280).
    //
    // A hand-over character (registry `yieldTo`, fat-fish since 0.3.1) is different: the
    // skin center's skin is the only painter. Three stages, in this order:
    //
    //   1. `clearOurPaint()` + `applyYieldCss(true)` — our layers are REMOVED (not hidden)
    //      and one independent sheet suppresses the theme that is fading out;
    //   2. `handOverSkin()` — enable the target skin through skin-center's own controller
    //      (the same `switchTo` its settings card uses, so it commits + persists);
    //   3. the rest of `applyCharacter()` — hero, fonts, music, accent.
    //
    // `yield.css` is its own `<style data-plugin-css="dsh-character-agent/yield.css">` and
    // is deleted on the way back to 昔涟, so dsh-cyrene gets its tokens, gradient,
    // particles and pet back byte for byte.

    const yieldTagId = 'dsh-character-agent/yield.css';

    /** True while the live character hands the look over: every paint applier is inert. */
    let suppressPaint = false;

    /** Result of the last stage-2 hand-off, for the diagnostics read-out. */
    let lastSkinResult = 'n/a';

    /** Monotonic switch counter: a slow skin switch must never re-paint over a newer one. */
    let applySeq = 0;

    /**
     * Skin-center calls are serialized. A hand-back queued while a hand-over is still
     * waiting for the runtime (up to SKIN_WAIT_MS) must run *after* it, not race it —
     * otherwise the late hand-over would persist the borrowed skin over the restored one.
     */
    let skinChain = Promise.resolve();

    function serialSkin(task) {
      const run = skinChain.then(task, task);
      skinChain = run.then(
        () => {},
        () => {},
      );
      return run;
    }

    /** A registry key is safe in a selector once quotes/backslashes are gone. */
    function yieldScope(characterId) {
      return `html[data-ca-character="${String(characterId).replace(/["\\]/g, '')}"]`;
    }

    /**
     * The 让位 sheet. Every rule is scoped to the hand-over character and carries
     * `!important` with a specificity at least equal to the rule it must beat.
     *
     * Selectors are the *real* ones, read out of the installed packages:
     *   dsh-cyrene 0.4.1 lib/client.js:286  body[data-cy-grad]{background:…!important}
     *   dsh-cyrene 0.4.1 lib/client.js:291  body[data-cy-particles] .cyrene-bg-particles{display:block}
     *   dsh-cyrene 0.4.1 lib/client.js:293  .cyrene-bg-particles{position:fixed;inset:0;z-index:1}
     *   dsh-cyrene 0.4.1 lib/client.js:295  .cyrene-pet-root{position:fixed;…;z-index:2147483000}
     *   dsh-cyrene 0.4.1 lib/client.js:623  container.dataset.dshCyrenePet='' (the pet host)
     *   dsh-cyrene 0.4.1 lib/client.js:259-280  the pink focus/scrollbar/logo/turnStatus rules
     * and the values it paints with come from the *incoming* skin's own tokens
     * (`--dsw-alias-brand-primary` etc.), so a different target skin needs no code change.
     *
     * @param characterId the hand-over character on screen.
     * @returns CSS text.
     */
    function yieldCss(characterId) {
      const s = yieldScope(characterId);
      return [
        // 1) the full-page gradient — `!important` on body[data-cy-grad] (0-1-1).
        //    Ours is 0-2-2 + `!important`, so it wins whatever the load order.
        `${s} body[data-cy-grad]{background:none!important;background-image:none!important;background-color:transparent!important;background-attachment:scroll!important}`,
        `${s} body[data-cy-grad] [id=root]{background:transparent!important}`,
        // 2) the pink particle canvas — shown by body[data-cy-particles], z-index 1.
        `${s} body[data-cy-particles] .cyrene-bg-particles,${s} .cyrene-bg-particles{display:none!important;visibility:hidden!important;opacity:0!important}`,
        // 3) the Live2D 桌宠 (host div + its fixed root). It is a 昔涟 figure; in a
        //    fat-fish screen it is the most obvious piece of the previous look.
        `${s} [data-dsh-cyrene-pet],${s} .cyrene-pet-root{display:none!important}`,
        // 4) the pink rules the incoming skin does NOT remap (0 matches for all of these
        //    in /api/skin-center/v2/skins/mid-autumn/patches). Repaint them with the
        //    skin's own brand token instead of leaving dsh-cyrene's pink.
        `${s} body[data-cyrene-skin] :focus-visible{outline-color:var(--dsw-alias-brand-primary,#E7B44E)!important}`,
        `${s} body[data-cyrene-skin] a,${s} body[data-cyrene-skin] a:hover{color:var(--dsw-alias-brand-primary,#E7B44E)!important}`,
        `${s} body[data-cyrene-skin] ::-webkit-scrollbar-thumb{background:var(--dsw-alias-scrollbar-bg-l2,var(--dsw-alias-brand-primary,#E7B44E))!important}`,
        `${s} body[data-cyrene-skin] ::-webkit-scrollbar-thumb:hover{background:var(--dsw-alias-scrollbar-hover-l2,var(--dsw-alias-brand-primary,#E7B44E))!important}`,
        `${s} body[data-cyrene-skin] svg[class*="matrix"] rect{fill:var(--dsw-alias-brand-primary,#E7B44E)!important}`,
        `${s} body[data-cyrene-skin] svg[viewBox="26 0 156 24"],${s} body[data-cyrene-skin] svg[viewBox="0 0 23.16 17.04"]{color:var(--dsw-alias-brand-primary,#E7B44E)!important}`,
        `${s} body[data-cyrene-skin] [class*="turnStatus"]{--dsw-static-deepseek-500:var(--dsw-alias-brand-primary,#E7B44E);--dsw-static-deepseek-200:var(--dsw-alias-brand-primary,#E7B44E)}`,
        // 5) Belt and braces: a stale layer from an older build must not paint either.
        `${s} [data-cyrene-wallpaper],${s} [data-cyrene-bands],${s} [data-ca-starfield-canvas]{display:none!important}`,
      ].join('');
    }

    /**
     * Remove every layer we own — `remove()`, never `display:none`. A hidden layer keeps
     * the old picture in the DOM (and in the browser's image cache) and reappears the
     * moment anything flips `display` back.
     */
    function teardownPaintLayers() {
      if (typeof document === 'undefined') return;
      // starfield: canvas + rAF + the html flag that arms the layer
      starOn = false;
      dropStarCanvas();
      if (document.documentElement.dataset !== undefined) delete document.documentElement.dataset.caStarfield;
      // wallpaper: media first, then the layer that holds it
      if (wallMedia !== null) {
        wallMedia.remove();
        wallMedia = null;
        wallMounted = '';
      }
      if (wallHost !== null) {
        wallHost.remove();
        wallHost = null;
      }
      // side bands: the host carried the previous picture in its inline background-image
      if (bandHost !== null) {
        bandHost.remove();
        bandHost = null;
        bandLeft = null;
        bandRight = null;
      }
    }

    /**
     * Full teardown of our paint: stylesheet text, DOM layers, and any inline background
     * a previous build may have written on `html`/`body`.
     */
    function clearOurPaint() {
      if (typeof document === 'undefined') return;
      setTag(wallTagId, '');
      setTag(starTagId, '');
      teardownPaintLayers();
      // Anything a previous build (or a torn-down instance) left behind, by attribute.
      for (const selector of ['[data-cyrene-wallpaper]', '[data-cyrene-bands]', '[data-ca-starfield-canvas]']) {
        let stale = [];
        try {
          stale = document.querySelectorAll(selector) ?? [];
        } catch {
          stale = [];
        }
        for (const el of stale) if (typeof el.remove === 'function') el.remove();
      }
      // The 0.1.x paint path wrote the picture inline on html/body; clear it too, so an
      // empty stylesheet cannot still leave a `background-image` behind.
      for (const el of [document.documentElement, document.body]) {
        if (el === null || el === undefined || el.style === null || el.style === undefined) continue;
        if (typeof el.style.removeProperty !== 'function') continue;
        el.style.removeProperty('background-image');
        el.style.removeProperty('background');
      }
      // Force the cover geometry to be re-measured before it is used again.
      artFile = '';
    }

    /**
     * Install / remove the 让位 sheet. Off = the element is REMOVED, so dsh-cyrene is back
     * to exactly the CSS it shipped with when 昔涟 owns the page again.
     */
    function applyYieldCss(characterId, on) {
      if (typeof document === 'undefined') return;
      if (!on) {
        const tag = document.querySelector(`style[data-plugin-css=${JSON.stringify(yieldTagId)}]`);
        if (tag !== null && tag !== undefined && typeof tag.remove === 'function') tag.remove();
        return;
      }
      setTag(yieldTagId, yieldCss(characterId));
    }

    // ── skin-center bridge (v2) ─────────────────────────────────────────────
    //
    // Evidence (installed @linxin666/dsh-client-ui-skin-center 0.4.8):
    //   lib/client.js:1724  root.__skinRuntime = store        <- in-page handle
    //   lib/client.js:1592  controller.switchTo(id, entry)    <- commit + persist
    //   lib/client.js:1440  POST /api/skin-center/v2/active   {active: id}
    //   lib/index.js:1635   that POST writes $DSH_HOME/skin-center-active.json
    //   lib/client.js:1764  window event `dsh-skin-applied`   {detail:{id}} converges a page
    //   lib/client.js:1474  html[data-dsh-skin="<id>"]        <- the on-screen stamp
    //
    // We never rewrite the skin-center state file by hand: we ask its controller, the
    // same path its own settings card takes.

    const SKIN_ACTIVE_URL = '/api/skin-center/v2/active';
    const SKIN_WAIT_MS = 4000;
    const SKIN_POLL_MS = 100;

    function skinRuntime() {
      if (typeof window === 'undefined') return null;
      const rt = window.__skinRuntime;
      if (rt === null || rt === undefined) return null;
      const controller = rt.controller;
      if (controller === null || controller === undefined) return null;
      return typeof controller.switchTo === 'function' ? rt : null;
    }

    async function waitForSkinRuntime() {
      const deadline = Date.now() + SKIN_WAIT_MS;
      for (;;) {
        const rt = skinRuntime();
        if (rt !== null) return rt;
        if (Date.now() >= deadline) return null;
        await new Promise((resolve) => setTimeout(resolve, SKIN_POLL_MS));
      }
    }

    /** The skin on screen, from the stamp skin-center puts on <html>. */
    function stampedSkin() {
      if (typeof document === 'undefined') return null;
      const root = document.documentElement;
      if (root === null || root === undefined || typeof root.getAttribute !== 'function') return null;
      const value = root.getAttribute('data-dsh-skin');
      return typeof value === 'string' && value !== '' ? value : null;
    }

    /** The persisted selection, via skin-center's own GET route. undefined = unknown. */
    async function persistedSkin() {
      try {
        const res = await fetch(SKIN_ACTIVE_URL, { cache: 'no-store' });
        if (!res.ok) return undefined;
        const body = await res.json();
        if (body?.ok !== true) return undefined;
        return typeof body.active === 'string' && body.active !== '' ? body.active : null;
      } catch {
        return undefined;
      }
    }

    /**
     * Enable a skin-center skin (or `null` for the stock look) through its controller,
     * which commits AND persists. Falls back to the persisted-selection route + the
     * `dsh-skin-applied` convergence event when the runtime is not up yet.
     *
     * @param id skin id, or null for the stock look.
     * @returns 'switched' | 'unchanged' | 'persisted'
     */
    async function switchSkin(id) {
      const rt = await waitForSkinRuntime();
      if (rt !== null) {
        if (rt.controller.active === id) return 'unchanged';
        let entry = null;
        if (id !== null) {
          entry = typeof rt.find === 'function' ? rt.find(id) : null;
          if (entry === null && typeof rt.refreshCatalog === 'function') {
            try {
              await rt.refreshCatalog();
            } catch {
              /* the catalog we already have stays authoritative */
            }
            entry = typeof rt.find === 'function' ? rt.find(id) : null;
          }
          if (entry === null) throw new Error(`skin "${id}" is not in the skin-center catalog`);
        }
        await rt.controller.switchTo(id, entry);
        return 'switched';
      }
      const res = await fetch(SKIN_ACTIVE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ active: id }),
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`POST ${SKIN_ACTIVE_URL} -> HTTP ${res.status}`);
      if (id !== null && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
        window.dispatchEvent(new CustomEvent('dsh-skin-applied', { detail: { id } }));
      }
      return 'persisted';
    }

    /** The registry's hand-over record, or null when this character paints itself. */
    function yieldConfigFor(character) {
      const record = character?.yieldTo;
      return typeof record?.skin === 'string' && record.skin !== '' ? record : null;
    }

    /**
     * Stage 2a — enable `yieldTo.skin`, remembering what was on screen so the previous
     * skin can be given back. The memory lives in localStorage (`ca.skinHold`) because a
     * reload while the fat-fish screen owns the look must still restore it afterwards.
     */
    async function handOverSkin(cfg) {
      const target = cfg.skin;
      const hold = ca.state.skinHold;
      if (hold === null || hold === undefined) {
        const current = stampedSkin() ?? (await persistedSkin()) ?? null;
        // Nothing to give back when the target is already the user's own selection.
        if (current !== target) {
          ca.set({ skinHold: { previous: current, skin: target, restore: cfg.restorePrevious !== false } });
        }
      }
      const outcome = await serialSkin(() => switchSkin(target));
      // `persisted` means the controller was not up and only the selection was written:
      // the page itself still carries the old stamp, so the hand-back must not use the
      // stamp to decide whether the user changed skins in the meantime.
      const currentHold = ca.state.skinHold;
      if (currentHold !== null && currentHold !== undefined) {
        ca.set({ skinHold: { ...currentHold, applied: outcome !== 'persisted' } });
      }
      return outcome;
    }

    /**
     * Stage 2b — give the previous skin back when a self-painting character takes over.
     * If the user picked a different skin while the hand-over was live, theirs wins.
     */
    async function restoreSkin() {
      const hold = ca.state.skinHold;
      if (hold === null || hold === undefined) return 'none';
      if (hold.restore === false) {
        ca.set({ skinHold: null });
        return 'kept';
      }
      // The "did the user pick something else?" test needs to know that OUR switch actually
      // landed. When it has not (yet), just give the previous selection back — that call is
      // harmless when it is already active.
      if (hold.applied === true) {
        const active = stampedSkin() ?? skinRuntime()?.controller?.active ?? null;
        const borrowed = typeof hold.skin === 'string' ? hold.skin : '';
        if (active !== null && borrowed !== '' && active !== borrowed) {
          ca.set({ skinHold: null });
          return 'user-choice';
        }
      }
      const previous = typeof hold.previous === 'string' ? hold.previous : null;
      try {
        await serialSkin(() => switchSkin(previous));
      } catch (error) {
        // The remembered skin is gone (uninstalled) or the skin center refused: drop the
        // debt instead of retrying it on every later switch, and surface it once.
        ca.set({ skinHold: null });
        throw error;
      }
      ca.set({ skinHold: null });
      return previous === null ? 'stock' : previous;
    }

    /** Remove the hero picture/greeting (only when `yieldTo.keepHero` is false). */
    function clearHero() {
      if (typeof document === 'undefined') return;
      heroCfg = null;
      const tag = document.querySelector(`style[data-plugin-css=${JSON.stringify(heroTagId)}]`);
      if (tag !== null && tag !== undefined && typeof tag.remove === 'function') tag.remove();
    }

    // ── apply one character ─────────────────────────────────────────────────
    /**
     * Apply one character. Stage order matters and is the fix for "half old, half new":
     * our layers come down first, the skin changes second, everything else lands third.
     *
     * @param id character id.
     * @returns promise resolving once the whole switch (including the skin) settled.
     */
    async function applyCharacter(id) {
      const seq = ++applySeq;
      const character = REGISTRY?.characters?.[id] ?? FALLBACK_CHARACTER;
      const saved = ca.state.per?.[id] ?? {};
      const hero = { ...(character.hero ?? DEFAULTS), ...(saved.hero ?? {}) };
      const w = character.wallpaper ?? {};
      const wSaved = saved.wall ?? {};
      const t = character.font ?? {};
      const tSaved = saved.type ?? {};
      const b = character.bgm ?? {};
      const bSaved = saved.bgm ?? {};
      const handOver = yieldConfigFor(character);

      currentCharacter = id;
      currentHero = pick(hero, HERO_KEYS);
      if (typeof document !== 'undefined') {
        // yield.css keys on this attribute, and it has to be in place *before* stage 1
        // tears anything down (switchTo sets it too, but only after this call returns).
        document.documentElement.dataset.caCharacter = id;
      }

      // ── stage 1: take our own layers down (and, for a hand-over character, suppress
      //    the theme still mounted behind them).
      if (handOver !== null) {
        suppressPaint = true;
        clearOurPaint();
        applyYieldCss(id, true);
      } else {
        suppressPaint = false;
        applyYieldCss('', false);
      }

      // ── stage 2: hand the global skin over / give it back. A failure must not abort
      //    stage 3 — the character still applies, only the skin is wrong, and both the
      //    panel and `/character-agent/diag` report it.
      let skinResult = 'n/a';
      try {
        skinResult = handOver !== null ? await handOverSkin(handOver) : await restoreSkin();
      } catch (error) {
        skinResult = `failed: ${String(error?.message ?? error)}`;
        console.warn('[dsh-character-agent] skin-center hand-off failed', error);
      }
      lastSkinResult = skinResult;
      // A newer switch started while this one was awaiting the skin: it owns the page.
      if (seq !== applySeq) return { character: id, yield: handOver !== null, skin: 'superseded' };

      // ── stage 3: the rest of the character. While `suppressPaint` is true every paint
      //    applier below is inert, so nothing can quietly repaint during the hand-over.
      wall.set({
        enabled: wSaved.enabled ?? w.enabled ?? true,
        file: wSaved.file ?? w.base ?? '',
        overlay: wSaved.overlay ?? w.overlay ?? '',
        mode: wSaved.mode ?? w.mode ?? DEFAULTS.wallMode,
        blur: num(wSaved.blur ?? w.blur, DEFAULTS.wallBlur),
        brightness: num(wSaved.brightness ?? w.brightness, DEFAULTS.wallBrightness),
        saturation: num(wSaved.saturation ?? w.saturation, DEFAULTS.wallSaturation),
        panel: num(wSaved.panel ?? w.panel, DEFAULTS.wallPanel),
        sidebar: num(wSaved.sidebar ?? w.sidebar, DEFAULTS.wallSidebar),
        // 0.2.0: bubble falls back to *this character's* main-area opacity, so the
        // default really is 「= 当前主区不透明度」 without pinning a number here.
        bubble: num(wSaved.bubble ?? w.bubble ?? w.panel, DEFAULTS.wallBubble),
        code: num(wSaved.code ?? w.code, DEFAULTS.wallCode),
        tint: wSaved.tint ?? w.tint ?? DEFAULTS.wallTint,
        tintDark: wSaved.tintDark ?? w.tintDark ?? DEFAULTS.wallTintDark,
        wash: num(wSaved.wash ?? w.wash, DEFAULTS.wallWash),
        focus: num(wSaved.focus ?? w.focus, DEFAULTS.wallFocus),
      });

      type.set({
        fontId: tSaved.fontId ?? t.fontId ?? DEFAULTS.fontId,
        fontCustom: tSaved.fontCustom ?? t.fontCustom ?? '',
        chatFontSize: num(tSaved.chatFontSize ?? t.chatFontSize, 0),
        chatLineHeight: num(tSaved.chatLineHeight ?? t.chatLineHeight, 0),
        chatLetterSpacing: num(tSaved.chatLetterSpacing ?? t.chatLetterSpacing, 0),
      });

      bgm.set({
        enabled: bSaved.enabled ?? b.enabled ?? true,
        volume: num(bSaved.volume ?? b.volume, DEFAULTS.bgmVolume),
        track: bSaved.track ?? b.track ?? '',
      });

      applySkin(character.skin ?? {});
      // Starfield last: it needs the wallpaper state (it decides its own gradient alpha
      // from whether a picture is showing), and the wall store was just re-seeded.
      if (handOver === null || handOver.keepHero !== false) applyHero(currentHero);
      else clearHero();
      applyStars();
      return { character: id, yield: handOver !== null, skin: skinResult };
    }

    // ── reporting to the host (the /character-agent/mode status route) ──────
    let reportedKey = '';

    function reportMode(presetId, sessionId, character, source) {
      const key = `${presetId ?? ''}|${sessionId ?? ''}`;
      if (key === reportedKey) return;
      reportedKey = key;
      try {
        fetch('/character-agent/mode', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ presetId, sessionId, character, source }),
          cache: 'no-store',
        }).catch(() => {});
      } catch {
        /* host half missing: detection still works, only the status route is stale */
      }
    }

    // ── the switch itself ───────────────────────────────────────────────────
    /**
     * Switch to a character. Async since 0.3.1 because the skin hand-off is: the
     * attributes and the gate go down synchronously, then `applyCharacter` runs its three
     * stages, then the mode is logged/reported.
     */
    async function switchTo(characterId, presetId, sessionId, source) {
      const previous = currentCharacter;
      const changed = characterId !== previous;
      if (changed && previous !== '') captureCharacter(previous);
      if (typeof document !== 'undefined') {
        const root = document.documentElement;
        root.dataset.caPreset = presetId ?? '';
        root.dataset.caCharacter = characterId;
      }
      applyGate();
      ca.set({ last: characterId, preset: presetId ?? '', source: source ?? '', session: sessionId ?? '' });
      reportMode(presetId, sessionId, characterId, source);
      if (!changed) return;
      try {
        await applyCharacter(characterId);
      } catch (error) {
        console.warn('[dsh-character-agent] applyCharacter failed', error);
      }
      console.info(`[dsh-character-agent] appearance ${previous || '(boot)'} -> ${characterId} (preset ${presetId ?? '?'}, ${source ?? '?'}, skin ${lastSkinResult})`);
    }

    /**
     * The session on screen, according to the browser's own store.
     *
     * Evidence (DSH 0.2.1-rc.2, app.asar):
     *   @deepseek-ai/dsh-client-ui-workspace/lib/client.js:89
     *     const current = () => Object.values(ctx.sessions.list.getSnapshot().byId)
     *       .find((row) => (row.retainedBy.mainView ?? 0) > 0);
     *   @deepseek-ai/dsh-client-ui-agent-preset/lib/client.js:1002-1004
     *     state.byId[sessionId]?.projectionValues?.agentPreset
     *   @deepseek-ai/dsh-cordis-client-runner/lib/client.js (ISessions / SessionListState)
     *     list: ObservableSnapshot<SessionListState>; byId: Record<SessionId, SessionSummary>
     */
    function readActivePreset(sessions) {
      try {
        const list = sessions.list.getSnapshot();
        const rows = Object.values(list?.byId ?? {});
        const active = rows.find((row) => (row?.retainedBy?.mainView ?? 0) > 0);
        const preset = active?.projectionValues?.agentPreset;
        return {
          presetId: typeof preset === 'string' ? preset : undefined,
          sessionId: active?.id,
          hasActive: active !== undefined,
          blank: active?.blank === true,
        };
      } catch (error) {
        return { presetId: undefined, sessionId: undefined, hasActive: false, blank: false, error: String(error) };
      }
    }

    function startModeTracking(ctx) {
      // 改造 4: the one-shot new-session seed. It runs before anything else so the
      // marker lands even when the browser has no session service yet.
      seedNewSessionDefault(ctx).catch(() => {});
      const sessions = ctx.get('sessions');
      if (sessions === undefined) {
        ca.set({ source: 'no-sessions-service' });
        return;
      }
      let lastKey = '';
      evaluateMode = () => {
        const found = readActivePreset(sessions);
        if (found.presetId !== undefined) {
          const characterId = characterForPreset(found.presetId);
          const key = `${characterId}|${found.presetId}|${found.sessionId ?? ''}`;
          if (key !== lastKey) {
            lastKey = key;
            switchTo(characterId, found.presetId, found.sessionId, 'session-store').catch((error) =>
              console.warn('[dsh-character-agent] switch failed', error),
            );
          }
          return;
        }
        // The session is on screen but its projection has not arrived: ask the
        // host once per session, then let the next list notification decide.
        if (found.sessionId !== undefined && !projectionAsked.has(found.sessionId)) {
          projectionAsked.add(found.sessionId);
          try {
            sessions.refreshProjections(found.sessionId);
          } catch {
            /* host refused; the 2 s re-read below retries the store instead */
          }
        }
      };
      ctx.effect(() => sessions.list.subscribe(() => evaluateMode()), 'character-agent: session list subscription');
      // Safety net, not the main path: a projection can land without a list
      // notification ordering we control, and a local re-read is free. This also
      // bounds the worst-case switch latency to ~2 s, well inside the 1-2 s target
      // for the happy path (which is synchronous with the store notification).
      ctx.effect(() => {
        const timer = setInterval(() => evaluateMode(), 2000);
        return () => clearInterval(timer);
      }, 'character-agent: mode re-read');
      evaluateMode();
    }

    // ────────────────────── character settings panel ───────────────────────

    const SOURCE_TEXT = {
      'session-store': '会话存储（实时订阅）',
      'no-sessions-service': '没有 sessions 服务：停在最后角色（回落）',
      unknown: '未知：等会话投影',
    };

    function CharacterPanel() {
      const state = useStore(ca);
      const character = REGISTRY?.characters?.[currentCharacter] ?? FALLBACK_CHARACTER;
      const saved = state.per?.[currentCharacter] ?? {};
      const fontName =
        FONT_PRESETS.find((preset) => preset.id === (character.font?.fontId ?? ''))?.label ?? character.font?.fontId ?? '';
      const handOver = yieldConfigFor(character);
      const appearance = [
        [
          '外观归属',
          handOver === null
            ? '本插件自绘（壁纸底图 + token 覆盖 + 星空）'
            : `皮肤中心 · ${handOver.skin}（本插件不画壁纸/贴片/星空，并压住上一套主题）`,
        ],
        ['当前皮肤', stampedSkin() ?? '（stock / 皮肤中心未启用）'],
        ['首屏图', handOver === null || handOver.keepHero !== false ? character.hero?.image ?? '' : '（让位中，不绘制）'],
        ['问候语', handOver === null || handOver.keepHero !== false ? character.hero?.greeting ?? '' : '（让位中，不绘制）'],
        ['壁纸底图', handOver === null ? character.wallpaper?.base ?? '' : '（让位中，不绘制）'],
        ['侧栏叠加图', handOver === null ? character.wallpaper?.overlay || '（无）' : '（让位中，不绘制）'],
        ['对话框不透明度', handOver === null ? pctText(wall.state.bubble) : '（由目标皮肤决定）'],
        ['代码块不透明度', handOver === null ? pctText(wall.state.code) : '（由目标皮肤决定）'],
        [
          '星星粒子',
          handOver !== null
            ? '关（让位中，本插件不画）'
            : starOn
              ? `开（${starfieldFor(currentCharacter).top} → ${starfieldFor(currentCharacter).bottom}）`
              : '关',
        ],
        ['字体', fontName],
        ['背景音乐', character.bgm?.enabled === false ? '本模式关闭（无专属曲目）' : character.bgm?.track || '目录第一首'],
        ['强调色', character.skin?.accent ?? ''],
        ['最近一次皮肤切换', lastSkinResult],
      ];
      const [diag, setDiag] = React.useState('');
      const whaleOn = state.whale !== false;
      const gateText = currentCharacter === 'fat-fish' ? (whaleOn ? '本模式：显示' : '本模式：已关掉') : '本模式：隐藏（不是大肥鱼模式）';
      const presetText = state.preset === '' ? '（还没检测到）' : state.preset;
      const sourceText = SOURCE_TEXT[state.source] ?? (state.source === '' ? '启动中…' : state.source);

      const resetCurrent = () => {
        const per = { ...(state.per ?? {}) };
        delete per[currentCharacter];
        ca.set({ per });
        applyCharacter(currentCharacter).catch((error) => console.warn('[dsh-character-agent] reset failed', error));
        applyGate();
      };

      const runDiag = () => {
        fetch('/character-agent/diag', { cache: 'no-store' })
          .then((res) => res.json())
          .then((json) => setDiag(JSON.stringify(json, null, 2)))
          .catch((error) => setDiag(`诊断请求失败：${String(error)}`));
      };

      return h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: '16px', padding: '6px 0' } },
        h(
          Row,
          {
            title: '当前模式',
            hint: '模式 = 会话的 agent preset。宿主给 /character-agent/mode 的答复就是客户端上报的这份状态。',
          },
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' } },
            h(
              'span',
              {
                style: {
                  border: '1px solid var(--ca-accent, #ff5b8a)',
                  color: 'var(--ca-accent, #ff5b8a)',
                  borderRadius: '999px',
                  padding: '2px 10px',
                  fontSize: '13px',
                },
              },
              character.label,
            ),
            h('span', { style: primary }, `preset: ${presetText}`),
            h('span', { style: label() }, sourceText),
            h('span', { style: label() }, `会话：${state.session === '' ? '—' : state.session}`),
          ),
        ),
        h(
          Row,
          {
            title: '鲸鱼娘（桌宠）',
            hint: 'dsh-whale-girl 是进程级挂件，每个会话都会挂上；这里用 CSS 只在「蓝色大肥鱼」角色下放它出来，关掉后任何模式都不显示。它的包一行没改。',
          },
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' } },
            h(Switch, {
              on: whaleOn,
              labelText: '鲸鱼娘开关',
              onToggle: () => {
                ca.set({ whale: !whaleOn });
                applyGate();
              },
            }),
            h('span', { style: label() }, gateText),
          ),
        ),
        h(
          Row,
          {
            title: '星星粒子（本模式）',
            hint:
              '只在开启本模式时画：一层 canvas 同时铺深蓝星空底（' +
              `${starfieldFor(currentCharacter).top} → ${starfieldFor(currentCharacter).bottom}）和闪烁的星星，` +
              '位置在壁纸之上、所有面板之下；切到别的模式会自动移除这一层。开关按角色各自记住。' +
              '注意：本模式若已把外观让位给皮肤中心的皮肤，本插件不画任何东西，这一层也不会绘制（开关只记住选择）。',
          },
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' } },
            h(Switch, {
              on: starOn,
              labelText: '星星粒子开关',
              onToggle: () => {
                const per = { ...(state.per ?? {}) };
                const slot = { ...(per[currentCharacter] ?? {}) };
                slot.star = { enabled: !starOn };
                per[currentCharacter] = slot;
                ca.set({ per });
                applyStars();
              },
            }),
            h(
              'span',
              { style: label() },
              handOver !== null
                ? '本模式：不绘制（外观让位给目标皮肤）'
                : starOn
                  ? '本模式：开（约 30fps，页面隐藏时暂停）'
                  : '本模式：关',
            ),
          ),
        ),
        h(
          Row,
          {
            title: '新会话默认模式（DSH 预设）',
            hint:
              'DSH 把「新会话默认 preset」存在设置命名空间 agent-preset-registry 的 selectedDefault 字段里（由 config-editor 落盘到 profile 的 cordis.patch.yml）。' +
              '本插件只做一次「新会话外观 = 大肥鱼」的种子，不会替你改写那份 patch；需要真正改默认 preset 时按下面这颗按钮（也可以随时在 DSH 自己的 设置 → 预设 里改回来）。',
          },
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' } },
            button('把「蓝色大肥鱼」设为 DSH 新会话默认', () => setHostDefaultPreset('fat-fish')),
            button('设回「标准模式」', () => setHostDefaultPreset('standard')),
            h('span', { style: label() }, seedResult === '' ? seedHintText() : seedResult),
          ),
        ),
        h(
          Row,
          {
            title: `本模式外观（${character.label}）`,
            hint: '切模式时自动套用这组默认值；在「壁纸 / 文字样式 / 背景音乐」里改过的东西会记在本模式名下，切回来还在。',
          },
          h(
            'div',
            { style: { display: 'grid', gridTemplateColumns: '120px 1fr', gap: '6px 14px', fontSize: '13px' } },
            ...appearance.flatMap(([key, value]) =>
              [
                h('span', { key: `${key}-k`, style: label() }, key),
                h('span', { key: `${key}-v`, style: { ...primary, wordBreak: 'break-all' } }, String(value)),
              ],
            ),
          ),
        ),
        character.note
          ? h('div', { style: label({ wordBreak: 'break-all' }) }, `注：${character.note}`)
          : null,
        h(
          'div',
          { style: { display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' } },
          button('重新检测模式', () => evaluateMode()),
          button('恢复本模式默认外观', resetCurrent),
          button('读宿主诊断', runDiag),
          h('span', { style: label() }, Object.keys(saved).length > 0 ? '本模式有本地改动存档' : '本模式暂无本地改动存档'),
        ),
        diag === ''
          ? null
          : h(
              'pre',
              {
                style: {
                  fontSize: '12px',
                  lineHeight: '18px',
                  maxHeight: '220px',
                  overflow: 'auto',
                  background: 'var(--dsw-alias-bg-layer-1, rgba(0,0,0,.04))',
                  borderRadius: '8px',
                  padding: '10px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                },
              },
              diag,
            ),
      );
    }


    // ─────────────────────────────── boot ────────────────────────────────

    /** `sessions` is the detection source; `slots` mounts the settings sections. */
    const inject = ['slots', 'sessions'];

    async function boot() {
      await loadRegistry();
      let cfg = DEFAULTS;
      try {
        const res = await fetch('/cyrene-hero/hero.json', { cache: 'no-store' });
        if (res.ok) cfg = { ...DEFAULTS, ...(await res.json()) };
      } catch {
        /* defaults */
      }
      // 0.2.0 — the first paint follows the registry default (fat-fish since 0.2.0), so
      // the new-session screen no longer flashes 昔涟 before the session store answers.
      // 昔涟's own first screen still comes from hero.json whenever her preset wins;
      // here her hero.json config is only used as the *seed* for the cyrene slot, so
      // existing customisations survive the switch.
      // `characterForPreset(undefined)` is the safe way to ask: it also degrades to
      // cyrene when the host half is missing and the fallback has no fat-fish record.
      const bootCharacter = characterForPreset(undefined);
      currentCharacter = bootCharacter;
      currentHero = pick({ ...DEFAULTS, ...cfg }, HERO_KEYS);
      applyHero(currentHero);
      applySkin(REGISTRY?.characters?.[bootCharacter]?.skin ?? FALLBACK_CHARACTER.skin);
      applyTypography(type.state);

      // Scan the folders FIRST: the appliers need the file lists, and a failure in
      // one settings store must never stop the others from being initialised.
      await Promise.all([rescanTracks(), rescanWallpapers()]);

      const adopt = (store, patch) => {
        if (store.touched) return;
        try {
          store.set(patch);
        } catch (error) {
          console.warn('[dsh-character-agent] init failed', error);
        }
      };

      adopt(bgm, {
        enabled: cfg.bgm !== false,
        volume: typeof cfg.bgmVolume === 'number' ? cfg.bgmVolume : 0.45,
      });
      adopt(type, {
        fontId: cfg.fontId ?? DEFAULTS.fontId,
        fontCustom: cfg.fontCustom ?? '',
        chatFontSize: Number(cfg.chatFontSize) || 0,
        chatLineHeight: Number(cfg.chatLineHeight) || 0,
        chatLetterSpacing: Number(cfg.chatLetterSpacing) || 0,
      });
      adopt(wall, {
        enabled: cfg.wall !== false,
        file: cfg.wallFile ?? '',
        overlay: cfg.wallOverlay ?? '',
        mode: cfg.wallMode ?? DEFAULTS.wallMode,
        blur: Number(cfg.wallBlur) || DEFAULTS.wallBlur,
        brightness: Number(cfg.wallBrightness) || DEFAULTS.wallBrightness,
        saturation: Number(cfg.wallSaturation) || DEFAULTS.wallSaturation,
        panel: Number(cfg.wallPanel) || DEFAULTS.wallPanel,
        sidebar: Number.isFinite(Number(cfg.wallSidebar)) ? Number(cfg.wallSidebar) : DEFAULTS.wallSidebar,
        tint: cfg.wallTint ?? DEFAULTS.wallTint,
        tintDark: cfg.wallTintDark ?? DEFAULTS.wallTintDark,
        wash: Number.isFinite(Number(cfg.wallWash)) ? Number(cfg.wallWash) : DEFAULTS.wallWash,
        focus: Number.isFinite(Number(cfg.wallFocus)) ? Number(cfg.wallFocus) : DEFAULTS.wallFocus,
      });

      // When the registry default is not 昔涟, its own record beats hero.json's global
      // values: apply it once here so the new-session screen is complete (wallpaper,
      // music, font, starfield) without waiting for a session projection.
      //
      // 0.3.1 — do NOT await this: stage 2 may wait for the skin-center runtime, and mode
      // tracking must not sit behind that. `applyCharacter` saves the skin debt
      // synchronously before its first await and guards its later stages with a sequence
      // number, so a session that arrives meanwhile supersedes it cleanly.
      if (bootCharacter !== 'cyrene') {
        applyCharacter(bootCharacter).catch((error) =>
          console.warn('[dsh-character-agent] default character apply failed', error),
        );
      } else if (ca.state.skinHold !== null && ca.state.skinHold !== undefined) {
        // 0.3.1 — the previous load handed the skin over for a fat-fish screen (the
        // selection is persisted by skin-center, so the borrowed skin boots with us).
        // Booting straight into a 昔涟 screen means it has to be given back now.
        applyYieldCss('', false);
        restoreSkin()
          .then((result) => {
            lastSkinResult = result;
          })
          .catch((error) => console.warn('[dsh-character-agent] skin restore failed', error));
      }
      // Without this the gate keeps whatever character the pre-boot `installGateCss()`
      // saw, which is the *initial* one — on the new-session screen (no session, so no
      // switchTo) `data-ca-character` would stay stale until the first session appears.
      applyGate();
    }

    function apply(ctx) {
      hostCtx = ctx;
      // Gate CSS + data-* attributes first: the whale-girl client half may mount
      // before our boot() settles, and it must never flash in a cyrene session.
      installGateCss();
      // The starfield stylesheet is inert until `data-ca-starfield` is set, and it must
      // be in place before the first canvas can be painted.
      setTag(starTagId, STARS_CSS);
      boot()
        .catch((error) => console.warn('[dsh-character-agent] boot failed', error))
        .finally(() => startModeTracking(ctx));
      type.subscribe(() => applyTypography(type.state));
      wall.subscribe(() => applyWallpaper());
      // Without this the music switch only changed the store and never touched playback.
      bgm.subscribe(() => applyAudio());
      const slots = ctx.get('slots');
      if (slots === undefined) return;
      const section = (id, order, labelText, Component) =>
        slots.inject('settings.section', () =>
          slots.register({ name: 'settings.section', id, order, label: labelText }, () => React.createElement(Component)),
        );
      section('character-appearance', 25, '角色 · 模式外观', CharacterPanel);
      section('character-type', 26, '角色 · 文字样式', TypographyPanel);
      section('character-wall', 27, '角色 · 背景壁纸', WallPanel);
      section('character-bgm', 28, '角色 · 背景音乐', BgmPanel);
    }

    exports.name = 'character-agent';
    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  },
});
