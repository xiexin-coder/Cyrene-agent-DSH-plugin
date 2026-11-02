/**
 * dsh-character-agent — character registry (single source of truth).
 *
 * One record per character. Everything the appearance layer can switch is a field
 * here: skin accent, hero picture + greeting, wallpaper pair, music, font and
 * whether the whale-girl pet is allowed on screen.
 *
 * The host half serves this as `/character-agent/registry.json`; the client half
 * fetches it at boot (and falls back to its own minimal copy of `cyrene` when the
 * route is unavailable). Presets are mapped to characters by `PRESET_CHARACTER`;
 * a preset that is not listed belongs to `DEFAULT_CHARACTER` — since 0.2.0 that is
 * `fat-fish`, so a brand-new custom preset (and the new-session screen, which has
 * no session at all) opens as 蓝色大肥鱼. The 昔涟 presets are therefore listed
 * explicitly: `standard`, `ptc`, `minimal`, `cordis`, `chat` and `cyrene-work`.
 *
 * Paths: a wallpaper/hero `image` may be either a bare file name (resolved under
 * that character's own route) or an absolute route path (`/...`) that the client
 * uses verbatim. The fat-fish entries point at `dsh-whale-girl`'s own `assets/`,
 * which this plugin only *reads* — the package is never modified.
 *
 * Overrides: `<DSH_HOME>/character-agent/characters.json` may contain
 *   { "default": "cyrene", "presets": { "my-preset": "fat-fish" },
 *     "characters": { "cyrene": { "hero": { "greeting": "..." } } } }
 * and is deep-merged over the defaults below.
 *
 * Hand-over (0.3.1): a character record may carry `yieldTo`
 *   { "skin": "mid-autumn", "keepHero": true, "restorePrevious": true }
 * which means "the skin center owns the whole look, this plugin paints nothing".
 * `fat-fish` has it by default. Opt out from characters.json with
 * `{"yieldTo": {"skin": ""}}` (NOT null — mergeDeep treats null as "no override").
 * @module dsh-character-agent/characters
 */

/** Characters this build knows about. */
export const CHARACTER_IDS = ['cyrene', 'fat-fish'];

/**
 * Preset id -> character id.
 *
 * Only the presets that *belong* to a character are listed: the two 昔涟 modes the
 * user actually built (`chat`, `cyrene-work`) and the fish itself. Everything else
 * — DSH's built-ins `standard` / `ptc` / `minimal` / `cordis` and any preset the
 * user adds later — is unmapped on purpose and therefore lands on
 * {@link DEFAULT_CHARACTER}. That is what makes a brand-new session (which DSH
 * starts on `standard`) open as 蓝色大肥鱼 without touching the host's settings.
 */
export const PRESET_CHARACTER = {
  'fat-fish': 'fat-fish',
  'cyrene-work': 'cyrene',
  chat: 'cyrene',
};

/**
 * Character used when the current session's preset is unknown, and on the
 * new-session screen (which has no session yet).
 */
export const DEFAULT_CHARACTER = 'fat-fish';

/**
 * Route prefixes owned by this plugin. They are identical to dsh-cyrene-hero's
 * routes on purpose: the material folders did not move, and existing bookmarks
 * (and hero.json) keep working.
 */
export const ROUTES = {
  hero: '/cyrene-hero',
  bgm: '/cyrene-bgm',
  wallpaper: '/cyrene-wallpaper',
  fonts: '/cyrene-fonts',
  /** Fat-fish materials, read out of the installed dsh-whale-girl package. */
  fatFish: '/character-agent/fat-fish',
  /** Registry / mode status. */
  api: '/character-agent',
};

/** Per-character defaults. Keep `cyrene` identical to the shipped hero.json look. */
export const DEFAULT_CHARACTERS = {
  cyrene: {
    id: 'cyrene',
    label: '昔涟',
    subtitle: 'Cyrene',
    note: '默认角色；外观素材在 <DSH_HOME>/hero-assets、wallpaper、bgm、fonts。',
    skin: {
      accent: '#ff5b8a',
      glow: 'rgba(255, 91, 138, .30)',
      tint: '#fff7fb',
      tintDark: '#1a1424',
    },
    hero: {
      image: '/cyrene-hero/hero.png',
      width: 130,
      aspect: '1 / 1',
      tuck: -12,
      hideBuiltinMark: true,
      greeting: '想和人家说悄悄话吗?',
      subtitle: 'Want to share a little secret with me? ›',
    },
    wallpaper: {
      enabled: true,
      base: 'base-haze.jpg',
      overlay: 'overlay-haze.jpg',
      panel: 0.6,
      sidebar: 0.3,
      // 0.2.0: the two surfaces the panel token never reached. `bubble` defaults to
      // the main-area opacity (0.60 here), `code` is deliberately more solid (0.85).
      bubble: 0.6,
      code: 0.85,
      blur: 28,
      brightness: 0.94,
      saturation: 1.05,
      wash: 0.28,
      focus: 55,
      tint: '#fff7fb',
      tintDark: '#1a1424',
    },
    // 昔涟 keeps her theme package's background: no starfield, and the panel toggle
    // starts off for her.
    starfield: { enabled: false },
    bgm: { enabled: true, volume: 0.45, track: '' },
    font: { fontId: 'lxgw', chatFontSize: 0, chatLineHeight: 0, chatLetterSpacing: 0 },
    pet: { visible: false },
  },
  'fat-fish': {
    id: 'fat-fish',
    label: '蓝色大肥鱼',
    subtitle: 'Blue Fat Fish',
    note: '0.3.1 起整套外观让位给皮肤中心的 mid-autumn（桂影月华）：本插件不画壁纸/贴片/星空，并把 dsh-cyrene 的渐变、粒子、桌宠与粉色规则压住；切回昔涟会恢复切换前的皮肤。素材仍引用 dsh-whale-girl 0.4.4 的 assets/（只读引用，未修改它的包）；BGM 复用昔涟的 cyrene-ambient-loop.wav（同一条 /cyrene-bgm 路由，没复制文件）。',
    skin: {
      accent: '#4a6cf7',
      glow: 'rgba(74, 108, 247, .32)',
      tint: '#eef5ff',
      tintDark: '#0e1626',
    },
    hero: {
      image: '/character-agent/fat-fish/whale-girl.png',
      width: 150,
      aspect: '1 / 1',
      tuck: -10,
      hideBuiltinMark: true,
      greeting: '本鱼在这儿，说吧。',
      subtitle: '说什么都行，反正本鱼懒得动 ›',
    },
    wallpaper: {
      enabled: true,
      base: '/character-agent/fat-fish/background.png',
      overlay: '',
      panel: 0.72,
      sidebar: 0.42,
      bubble: 0.72, // 默认跟随本模式主区不透明度
      code: 0.88, // 比对话框略实一点，代码仍然读得清
      blur: 28,
      brightness: 0.92,
      saturation: 1.02,
      wash: 0.34,
      focus: 50,
      tint: '#eef5ff',
      tintDark: '#0e1626',
    },
    /**
     * 0.2.0: 大肥鱼 has no theme package of its own, so the星空底 is ours: a deep-blue
     * gradient plus a twinkling-star canvas drawn above the wallpaper and below every
     * panel. `wash` is the gradient's alpha while a wallpaper picture is showing (so
     * the picture still reads through the night sky); with no wallpaper the canvas
     * paints the gradient at full strength. `density` scales the star count.
     */
    starfield: {
      // 0.3.1: off, because `yieldTo` below hands the whole look to the mid-autumn skin
      // and this plugin paints nothing of its own in that mode. Override it in
      // characters.json with `{"yieldTo": {"skin": ""}, "starfield": {"enabled": true}}`
      // to get the 0.2.0 night sky back (`yieldTo: null` would NOT work: mergeDeep treats
      // null as "no override").
      enabled: false,
      top: '#0b1a33',
      bottom: '#16264a',
      wash: 0.52,
      density: 1,
    },
    /**
     * 0.3.1 — 让位 / hand-over.
     *
     * Presence of this record means: while this character owns the session, the whole
     * appearance belongs to the **skin center** and this plugin must not paint anything
     * of its own (no wallpaper, no side bands, no `--dsw-*` token overrides, no starfield)
     * and must suppress the fading theme that is still mounted (dsh-cyrene).
     *
     *   skin            skin-center skin id to enable (v2 `/api/skin-center/v2/active`)
     *   keepHero        keep this character's hero picture + greeting (the one exception:
     *                   it is a portrait, not a background). Default true.
     *   restorePrevious give the previous skin back when another character takes over.
     *                   Default true; the previous id is remembered in localStorage.
     *
     * The client switches in this order: tear our layers down → enable `skin` → apply the
     * rest of the character, so there is no window where half the old look is still on.
     * `characters.json` opts out with `{"yieldTo": {"skin": ""}}` (an empty skin id) —
     * note it must be that, not `null`: `mergeDeep` treats `null` as "no override" and
     * keeps the registry default.
     */
    yieldTo: {
      skin: 'mid-autumn',
      keepHero: true,
      restorePrevious: true,
    },
    // 复用昔涟现成的 /cyrene-bgm 路由与 <DSH_HOME>/bgm/cyrene-ambient-loop.wav，
    // 不复制文件：同一份素材，两条路由。
    bgm: { enabled: true, volume: 0.35, track: 'cyrene-ambient-loop.wav' },
    font: { fontId: 'system', chatFontSize: 0, chatLineHeight: 0, chatLetterSpacing: 0 },
    pet: { visible: true },
  },
};

/** Deep merge plain objects; arrays and scalars replace. */
export function mergeDeep(base, patch) {
  if (patch === null || patch === undefined) return base;
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return patch;
  if (typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    out[key] = key in base ? mergeDeep(base[key], value) : value;
  }
  return out;
}

/**
 * Resolve the registry: defaults + optional user override file + the fat-fish
 * asset probe.
 *
 * @param {object} [options]
 * @param {object} [options.override] parsed `characters.json`, if any.
 * @param {{ dir: string, files: string[] } | null} [options.fatFishAssets] probe result.
 * @returns {object} registry document served to the client.
 */
export function buildRegistry(options = {}) {
  const override = options.override ?? {};
  const characters = {};
  for (const id of CHARACTER_IDS) {
    const merged = mergeDeep(DEFAULT_CHARACTERS[id], override.characters?.[id] ?? {});
    // The fat-fish picture set is optional: when the whale-girl package is not
    // installed we keep the config but mark it unavailable, and the client falls
    // back to the cyrene wallpaper at reduced opacity (placeholder).
    if (id === 'fat-fish' && options.fatFishAssets) {
      const files = options.fatFishAssets.files ?? [];
      merged.assets = {
        dirs: options.fatFishAssets.dirs?.map((entry) => entry.dir) ?? [],
        files,
        available: files.length > 0,
      };
    }
    characters[id] = merged;
  }
  return {
    version: 1,
    default: typeof override.default === 'string' ? override.default : DEFAULT_CHARACTER,
    presets: { ...PRESET_CHARACTER, ...(override.presets ?? {}) },
    characters,
    routes: ROUTES,
  };
}

/**
 * Which character a preset renders as.
 * @param {object} registry registry document.
 * @param {string | undefined} presetId the session's `projectionValues.agentPreset`.
 * @returns {string} character id.
 */
export function characterForPreset(registry, presetId) {
  const known = registry?.characters ?? DEFAULT_CHARACTERS;
  const mapped = presetId === undefined ? undefined : registry?.presets?.[presetId];
  if (typeof mapped === 'string' && known[mapped] !== undefined) return mapped;
  return registry?.default !== undefined && known[registry.default] !== undefined
    ? registry.default
    : DEFAULT_CHARACTER;
}
