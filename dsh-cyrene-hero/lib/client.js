/**
 * dsh-cyrene-hero — client half.
 *
 * 1. Hero image + greeting on the new-session page.
 * 2. Looping background music from <DSH_HOME>/bgm/.
 * 3. Conversation typography (interface font, chat size, line height, spacing).
 * 4. Hazy wallpaper: an image or video from <DSH_HOME>/wallpaper/ behind a
 *    translucent UI, blurred live by CSS (so the haze is tunable with sliders).
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
  id: 'dsh-cyrene-hero',
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
              background: on ? '#ff5b8a' : 'var(--dsw-alias-interactive-bg-hover, #d8d8dd)',
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
            style: { width: '220px', accentColor: '#ff5b8a' },
          }),
          h('span', { style: label() }, format(value)),
        ),
      );
    }

    function setTag(tagId, css) {
      let tag = document.querySelector(`style[data-plugin-css=${JSON.stringify(tagId)}]`);
      if (tag === null) {
        tag = document.createElement('style');
        tag.dataset.plugin = 'dsh-cyrene-hero';
        tag.dataset.pluginCss = tagId;
        document.head.appendChild(tag);
      }
      tag.textContent = css;
    }

    // ─────────────────────────────── hero ───────────────────────────────

    const heroTagId = 'dsh-cyrene-hero/hero.css';
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

    function applyHero(c) {
      if (typeof document === 'undefined') return;
      setTag(heroTagId, heroCss(c));
      patchHeroText(c);
      if (heroObserverStarted) return;
      heroObserverStarted = true;
      new MutationObserver(() => patchHeroText(c)).observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }

    // ─────────────────────── typography ─────────────────────────────────

    const typeTagId = 'dsh-cyrene-hero/type.css';
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

    const wallTagId = 'dsh-cyrene-hero/wall.css';
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

    function currentWallFile() {
      const s = wall.state;
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
      probe.src = `/cyrene-wallpaper/${encodeURIComponent(file)}`;
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
      const url = `url("/cyrene-wallpaper/${encodeURIComponent(overlayFile)}")`;
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
      const url = `url("/cyrene-wallpaper/${encodeURIComponent(file)}")`;
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
      const s = wall.state;
      const file = currentWallFile();
      if (!s.enabled || file === '') {
        if (wallHost !== null) wallHost.style.display = 'none';
        hideBands();
        setTag(wallTagId, '');
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
        wallMedia.src = `/cyrene-wallpaper/${encodeURIComponent(file)}`;
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
        const res = await fetch(`/cyrene-wallpaper/${encodeURIComponent(file)}`, { cache: 'no-store' });
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
            '按与底图相同的坐标精确叠上去，所以看起来是画上去的。视频走独立层播放，不参与叠加。',
        ),
      );

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px', padding: '6px 0' } }, children);
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
          h('span', { style: label(state.enabled ? { color: '#ff5b8a' } : {}) }, STATUS_TEXT[status] ?? status),
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

    // ─────────────────────────────── boot ────────────────────────────────

    const inject = ['slots'];

    async function boot() {
      let cfg = DEFAULTS;
      try {
        const res = await fetch('/cyrene-hero/hero.json', { cache: 'no-store' });
        if (res.ok) cfg = { ...DEFAULTS, ...(await res.json()) };
      } catch {
        /* defaults */
      }
      applyHero(cfg);
      applyTypography(type.state);

      // Scan the folders FIRST: the appliers need the file lists, and a failure in
      // one settings store must never stop the others from being initialised.
      await Promise.all([rescanTracks(), rescanWallpapers()]);

      const adopt = (store, patch) => {
        if (store.touched) return;
        try {
          store.set(patch);
        } catch (error) {
          console.warn('[dsh-cyrene-hero] init failed', error);
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
    }

    function apply(ctx) {
      boot();
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
      section('cyrene-type', 26, '昔涟 · 文字样式', TypographyPanel);
      section('cyrene-wall', 27, '昔涟 · 背景壁纸', WallPanel);
      section('cyrene-bgm', 28, '昔涟 · 背景音乐', BgmPanel);
    }

    exports.name = 'cyrene-hero';
    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  },
});
