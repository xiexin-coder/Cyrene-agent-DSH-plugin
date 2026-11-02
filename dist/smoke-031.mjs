/**
 * dsh-character-agent 0.3.1 — headless verification of the "mode switch is thorough" fix.
 *
 * Same stubs as the earlier 0.2.0 smoke script (tiny DOM / localStorage / fetch / React), plus two
 * things the new feature needs:
 *   · a `document.querySelectorAll` that really answers the attribute selectors the
 *     teardown uses (`style[data-plugin-css]`, `[data-cyrene-wallpaper]`, …), and
 *   · a skin-center stub: `window.__skinRuntime` (the in-page controller the real
 *     @linxin666/dsh-client-ui-skin-center 0.4.8 publishes at lib/client.js:1724), its
 *     `html[data-dsh-skin]` stamp, and `GET/POST /api/skin-center/v2/active`.
 *
 * What is asserted (the user's report: 切换时还能看到旧底图 + 粉色):
 *   1. cyrene → fat-fish : our wallpaper/token/starfield layers are REMOVED, yield.css is
 *      installed, the target skin is enabled exactly once, the previous skin is remembered;
 *   2. fat-fish → cyrene : yield.css is DELETED, the pink wallpaper and token overrides are
 *      back, the previous skin is restored, nothing suppresses dsh-cyrene's particles;
 *   3. three round trips  : no accumulation — style-tag count per mode is stable, the star
 *      canvas is never duplicated (and never left in fat-fish), no stale background-image;
 *   4. a skin-center that is not up yet still gets the right persisted selection (fallback).
 *
 * Usage: node dist/smoke-031.mjs [--installed]
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const installed = process.argv.includes('--installed') || process.env.PLUGIN === 'installed';
const race = process.argv.includes('--race');
const t0 = Date.now();

// ── minimal DOM ─────────────────────────────────────────────────────────────
const head = {
  tagName: 'HEAD',
  children: [],
  appendChild(node) {
    this.children.push(node);
    node.parentNode = this;
    // mirror the real document: our setTag() looks the tag up by data-plugin-css
    if (node.dataset?.pluginCss !== undefined) styleTags.set(node.dataset.pluginCss, node);
    return node;
  },
  removeChild(node) {
    const at = this.children.indexOf(node);
    if (at >= 0) this.children.splice(at, 1);
    node.parentNode = null;
    if (node.dataset?.pluginCss !== undefined) styleTags.delete(node.dataset.pluginCss);
    return node;
  },
};

function makeElement(tag, className = '') {
  const styleMap = new Map();
  const el = {
    tagName: String(tag).toUpperCase(),
    style: {
      _map: styleMap,
      display: '',
      background: '',
      backgroundImage: '',
      width: '',
      height: '',
      setProperty(name, value) {
        styleMap.set(name, String(value));
      },
      removeProperty(name) {
        styleMap.delete(name);
        if (name === 'background-image') this.backgroundImage = '';
        if (name === 'background') this.background = '';
      },
      getPropertyValue(name) {
        return styleMap.get(name) ?? '';
      },
    },
    dataset: {},
    attributes: {},
    children: [],
    parentNode: null,
    textContent: '',
    className,
    id: '',
    volume: 1,
    src: '',
    width: 0,
    height: 0,
    _ctx: null,
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name.startsWith('data-')) {
        const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        this.dataset[key] = String(value);
      }
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
    },
    hasAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name);
    },
    removeAttribute(name) {
      delete this.attributes[name];
      if (name.startsWith('data-')) {
        const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        delete this.dataset[key];
      }
    },
    appendChild(child) {
      if (child.parentNode !== null && typeof child.parentNode.removeChild === 'function') {
        child.parentNode.removeChild(child);
      }
      this.children.push(child);
      child.parentNode = this;
      return child;
    },
    insertBefore(child) {
      return this.appendChild(child);
    },
    prepend(child) {
      if (child.parentNode !== null && typeof child.parentNode.removeChild === 'function') {
        child.parentNode.removeChild(child);
      }
      this.children.unshift(child);
      child.parentNode = this;
      return child;
    },
    removeChild(child) {
      const at = this.children.indexOf(child);
      if (at >= 0) this.children.splice(at, 1);
      child.parentNode = null;
      return child;
    },
    remove() {
      if (this.parentNode !== null) this.parentNode.removeChild(this);
    },
    addEventListener() {},
    removeEventListener() {},
    play() {
      return new Promise(() => {});
    },
    pause() {},
    getContext(kind) {
      if (kind !== '2d') return null;
      if (this._ctx === null) this._ctx = makeContext2d();
      return this._ctx;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 1600, height: 900 };
    },
  };
  return el;
}

function makeContext2d() {
  const calls = { fillRect: 0, clearRect: 0, gradients: 0 };
  return {
    calls,
    fillStyle: '',
    globalAlpha: 1,
    setTransform() {},
    clearRect() {
      calls.clearRect += 1;
    },
    fillRect() {
      calls.fillRect += 1;
    },
    createLinearGradient() {
      calls.gradients += 1;
      return { addColorStop() {} };
    },
  };
}

const documentElement = makeElement('html');
const body = makeElement('body');
const styleTags = new Map();
const created = [];
const posts = [];
const skinCalls = [];

function walk(node, out = []) {
  for (const child of node.children ?? []) {
    out.push(child);
    walk(child, out);
  }
  return out;
}

function allNodes() {
  return [...walk(head), ...walk(body)];
}

function attrSelector(selector) {
  const match = /^\[(data-[a-z-]+)\]$/.exec(selector);
  return match === null ? null : match[1];
}

function isPluginStyle(node) {
  return node.tagName === 'STYLE' && node.dataset.pluginCss !== undefined;
}

globalThis.document = {
  documentElement,
  head,
  body,
  hidden: false,
  createElement: (tag) => {
    const el = makeElement(tag);
    created.push(el);
    return el;
  },
  createElementNS: (_ns, tag) => makeElement(tag),
  querySelector(selector) {
    const plugin = /^style\[data-plugin-css="(.*)"\]$/.exec(selector);
    if (plugin !== null) return styleTags.get(plugin[1]) ?? null;
    if (selector === '[data-ca-starfield-canvas]') {
      return allNodes().find((el) => el.getAttribute?.('data-ca-starfield-canvas') !== null) ?? null;
    }
    const attr = attrSelector(selector);
    if (attr !== null) return allNodes().find((el) => el.getAttribute?.(attr) !== null) ?? null;
    return null;
  },
  querySelectorAll(selector) {
    if (selector === 'style[data-plugin-css]') return head.children.filter(isPluginStyle);
    const attr = attrSelector(selector);
    if (attr !== null) return allNodes().filter((el) => el.getAttribute?.(attr) !== null);
    return [];
  },
  addEventListener() {},
  removeEventListener() {},
  getElementById: () => null,
  elementFromPoint: () => null,
};

globalThis.MutationObserver = class {
  observe() {}
  disconnect() {}
};
globalThis.ResizeObserver = class {
  observe() {}
  disconnect() {}
};
globalThis.Image = class {
  set src(_value) {}
};
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
globalThis.performance = { now: () => Date.now() };
let rafSeq = 0;
globalThis.requestAnimationFrame = () => {
  rafSeq += 1;
  return rafSeq;
};
globalThis.cancelAnimationFrame = () => {};

// ── skin-center stub ────────────────────────────────────────────────────────
let persistedSkin = 'blue-fantasy';
let catalog = ['blue-fantasy', 'mid-autumn'];
let runtimeAvailable = true;

const skinRuntime = {
  controller: {
    active: 'blue-fantasy',
    async switchTo(id, entry) {
      skinCalls.push({ id, entry: entry === null ? null : entry?.manifest?.id ?? null });
      if (id !== null && !catalog.includes(id)) throw new Error(`skin ${id} not in catalog`);
      // --race: make the boot hand-over slow so the session switch to 昔涟 lands while it
      // is still in flight; the serialized skin chain must still end on the old skin.
      if (race && id === 'mid-autumn') await new Promise((resolve) => setTimeout(resolve, 400));
      this.active = id;
      if (id === null) documentElement.removeAttribute('data-dsh-skin');
      else documentElement.setAttribute('data-dsh-skin', id);
      persistedSkin = id; // its own switchTo persists through POST /active
      return id;
    },
  },
  find(id) {
    return catalog.includes(id) ? { manifest: { id } } : null;
  },
  async refreshCatalog() {
    catalog = [...new Set([...catalog, 'mid-autumn'])];
  },
  catalog: () => catalog,
};
documentElement.setAttribute('data-dsh-skin', 'blue-fantasy');

globalThis.window = {
  innerWidth: 1600,
  innerHeight: 900,
  devicePixelRatio: 2,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {
    return true;
  },
  matchMedia: (query) => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  __skinRuntime: skinRuntime,
  __ModuleLoader__: {
    load(def) {
      globalThis.__clientExports = def.factory((name) => {
        if (name === 'react') {
          return {
            createElement: (type, props, ...children) =>
              typeof type === 'function' ? type({ ...(props ?? {}), children }) : { type, props, children },
            useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
            useEffect: () => {},
          };
        }
        if (name === 'react-dom') return { createPortal: () => null };
        if (name === 'react-dom/client') return { createRoot: () => ({ render() {} }) };
        if (name === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null };
        throw new Error(`unexpected require(${name})`);
      });
    },
  },
};

// ── localStorage: a per-character starfield stored for 昔涟, so a canvas exists to dedupe ──
const memory = new Map([
  [
    'dsh-character-agent.v1',
    JSON.stringify({ whale: true, last: '', per: { cyrene: { star: { enabled: true } } }, seeded: true, skinHold: null }),
  ],
]);
globalThis.localStorage = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
};
const state = () => JSON.parse(memory.get('dsh-character-agent.v1') ?? '{}');

// ── registry (the real host module, not a copy) ─────────────────────────────
const PLUGIN = installed
  ? pathToFileURL('C:/Users/zsh/.dsh/profiles/desktop/node_modules/dsh-character-agent').href
  : pathToFileURL(new URL('../dsh-character-agent', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')).href;
const { buildRegistry } = await import(`${PLUGIN}/lib/characters.js`);
const registryDoc = JSON.parse(JSON.stringify(buildRegistry({})));
console.log(`plugin under test: ${installed ? 'installed' : 'source tree'} (${PLUGIN})`);
console.log(`registry: default=${registryDoc.default} fat-fish.yieldTo=${JSON.stringify(registryDoc.characters['fat-fish'].yieldTo)} fat-fish.starfield.enabled=${registryDoc.characters['fat-fish'].starfield.enabled}`);

function jsonResponse(value, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(value),
    blob: () => Promise.resolve({ size: 0 }),
    headers: { get: () => 'application/json' },
  });
}

globalThis.fetch = (url, options = {}) => {
  const target = String(url);
  if (target.endsWith('/character-agent/registry.json')) return jsonResponse(registryDoc);
  if (target.endsWith('/cyrene-hero/hero.json')) {
    return jsonResponse({ wallFile: 'base-haze.jpg', wallOverlay: 'overlay-haze.jpg', fontId: 'lxgw' });
  }
  if (target.endsWith('/cyrene-wallpaper/index.json')) {
    return jsonResponse({ dir: 'wallpaper', files: ['base-haze.jpg', 'overlay-haze.jpg'] });
  }
  if (target.endsWith('/cyrene-bgm/index.json')) return jsonResponse({ dir: 'bgm', tracks: ['cyrene-ambient-loop.wav'] });
  if (target.endsWith('/api/skin-center/v2/active')) {
    if (options.method === 'POST') {
      const payload = JSON.parse(options.body ?? '{}');
      posts.push({ url: 'skin-active', payload });
      if (!runtimeAvailable) persistedSkin = payload.active ?? null;
      return jsonResponse({ ok: true, active: persistedSkin });
    }
    return jsonResponse({ ok: true, active: persistedSkin });
  }
  if (target.endsWith('/character-agent/mode') && options.method === 'POST') {
    posts.push({ url: 'mode', ...JSON.parse(options.body) });
    return jsonResponse({ ok: true });
  }
  return jsonResponse({}, 404);
};

// ── load the client half exactly the way the web shell does ────────────────
await import(`${PLUGIN}/lib/client.js`);
const client = globalThis.__clientExports;
if (client === undefined || typeof client.apply !== 'function') throw new Error('client half did not export apply()');

const subscriptions = new Set();
const sessionState = { byId: {} };
const sessions = {
  list: {
    getSnapshot: () => sessionState,
    subscribe: (fn) => {
      subscriptions.add(fn);
      return () => subscriptions.delete(fn);
    },
  },
  refreshProjections: () => Promise.resolve(),
};
const remote = {
  settings: { update: () => Promise.resolve({ ok: true, value: {} }) },
  agentPresets: { select: () => Promise.resolve({ ok: true, value: '' }) },
};
const sectionFactories = new Map();
const registeredSections = [];
const slots = {
  inject: (_key, callback) => {
    callback();
    return () => {};
  },
  register: (definition, factory) => {
    registeredSections.push(definition.id);
    sectionFactories.set(definition.id, factory);
    return () => {};
  },
};
const ctx = {
  get: (name) => (name === 'slots' ? slots : name === 'sessions' ? sessions : name === 'remote' ? remote : undefined),
  effect: (fn) => fn(),
};

client.apply(ctx);
// --race: the session turns out to be 昔涟 while boot's hand-over is still in flight.
if (race) setTimeout(() => switchSession('cyrene-work'), 40);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
await wait(200);

// ── assertions ──────────────────────────────────────────────────────────────
let failed = 0;
function assert(condition, message) {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${message}`);
  if (!condition) failed += 1;
}
const tag = (id) => styleTags.get(id)?.textContent ?? '';
const wallCss = () => tag('dsh-character-agent/wall.css');
const starsCss = () => tag('dsh-character-agent/stars.css');
const yieldCss = () => tag('dsh-character-agent/yield.css');
const yieldPresent = () => styleTags.has('dsh-character-agent/yield.css');
const starCanvas = () => allNodes().find((el) => el.getAttribute?.('data-ca-starfield-canvas') !== null) ?? null;
const pluginStyles = () => document.querySelectorAll('style[data-plugin-css]');
const byAttr = (name) => allNodes().filter((el) => el.getAttribute?.(name) !== null);
const allCss = () => pluginStyles().map((el) => el.textContent).join('\n');
const character = () => documentElement.dataset.caCharacter;

function switchSession(preset) {
  sessionState.byId = { s: { id: 's', blank: false, retainedBy: { mainView: 1 }, projectionValues: { agentPreset: preset } } };
  for (const fn of subscriptions) fn();
  return wait(140);
}

console.log('\n════ race: 启动让位还没落地，会话已经是昔涟 ════');
if (race) {
  await wait(1600);
  const order = skinCalls.map((c) => c.id).join('→');
  console.log(`  character=${character()} stamp=${documentElement.getAttribute('data-dsh-skin')} persisted=${persistedSkin} skinHold=${JSON.stringify(state().skinHold)}`);
  console.log(`  skinCalls=${order}`);
  assert(character() === 'cyrene', 'the session switch wins the character');
  assert(documentElement.getAttribute('data-dsh-skin') === 'blue-fantasy', 'the page ends on the previous skin, not the borrowed one');
  assert(persistedSkin === 'blue-fantasy', 'the persisted selection ends on the previous skin (hand-back ran after the hand-over)');
  assert(state().skinHold === null, 'no skin debt left behind');
  assert(!yieldPresent(), 'yield.css removed');
  assert(wallCss().includes('url("/cyrene-wallpaper/base-haze.jpg")'), 'the cyrene wallpaper is painted');
  assert(order === 'mid-autumn→blue-fantasy', `hand-over then hand-back, in that order (${order})`);
  console.log(failed === 0 ? '\nRACE PASS' : `\n${failed} FAILURE(S)`);
  process.exit(failed === 0 ? 0 : 1);
}

console.log('\n════ 0. boot（注册表默认 = 大肥鱼 → 应直接进入让位态）════');
console.log(`  data-ca-character=${character()}  skin stamp=${documentElement.getAttribute('data-dsh-skin')}`);
console.log(`  style tags: ${pluginStyles().map((s) => s.dataset.pluginCss).join(' | ')}`);
assert(character() === 'fat-fish', 'boot renders the registry default fat-fish');
assert(skinCalls.length === 1 && skinCalls[0].id === 'mid-autumn', 'boot already enabled mid-autumn through the skin center');
assert(yieldPresent(), 'yield.css installed at boot (fat-fish)');
assert(
  yieldCss().includes('html[data-ca-character="fat-fish"] body[data-cy-grad]{background:none!important'),
  'yield.css kills dsh-cyrene body[data-cy-grad] gradient (0-2-2 + !important)',
);
assert(
  yieldCss().includes('html[data-ca-character="fat-fish"] .cyrene-bg-particles{display:none!important'),
  'yield.css hides .cyrene-bg-particles',
);
assert(
  yieldCss().includes('html[data-ca-character="fat-fish"] [data-dsh-cyrene-pet]'),
  'yield.css hides the 昔涟 Live2D pet host',
);
assert(
  yieldCss().includes('body[data-cyrene-skin] :focus-visible') &&
    yieldCss().includes('svg[class*="matrix"]') &&
    yieldCss().includes('[class*="turnStatus"]'),
  'yield.css repaints the pink rules the incoming skin does not remap',
);
assert(wallCss() === '', 'wall.css is empty (no wallpaper base/overlay, no token overrides)');
assert(!allCss().includes('--dsw-alias-bg-base'), 'no --dsw-alias-bg-base override anywhere');
assert(!allCss().includes('--dsw-specific-bubble'), 'no --dsw-specific-bubble override anywhere');
assert(starCanvas() === null, 'starfield canvas absent (registry starfield.enabled=false)');
assert(documentElement.dataset.caStarfield === undefined, 'html[data-ca-starfield] is not set');
assert(byAttr('data-cyrene-wallpaper').length === 0, 'no [data-cyrene-wallpaper] element');
assert(byAttr('data-cyrene-bands').length === 0, 'no [data-cyrene-bands] element');
assert(skinCalls.length === 1 && skinCalls[0].id === 'mid-autumn', `skin-center enabled mid-autumn exactly once (${JSON.stringify(skinCalls.map((c) => c.id))})`);
assert(persistedSkin === 'mid-autumn', 'skin-center persisted mid-autumn');
assert(state().skinHold?.previous === 'blue-fantasy', `previous skin remembered as blue-fantasy (skinHold=${JSON.stringify(state().skinHold)})`);
assert(tag('dsh-character-agent/hero.css').includes('_composerHero'), 'hero picture kept (yieldTo.keepHero defaults to true)');

console.log('\n════ 1. fat-fish → cyrene：交出皮肤、恢复粉壁纸、让位表整条删除 ════');
skinCalls.length = 0;
await switchSession('cyrene-work');
console.log(`  data-ca-character=${character()}  skin stamp=${documentElement.getAttribute('data-dsh-skin')}  canvas=${starCanvas() === null ? 'none' : 'present'}`);
assert(character() === 'cyrene', 'switching to a cyrene preset switches the character');
assert(!yieldPresent(), 'yield.css is REMOVED from <head> (not just emptied)');
assert(
  !allCss().includes('.cyrene-bg-particles{display:none') && !allCss().includes('body[data-cy-grad]{background:none'),
  'no yield rule survives anywhere',
);
assert(wallCss().includes('--dsw-alias-bg-base:rgba(255,247,251,0.600)!important'), 'pink token override restored (cyrene panel 60%)');
assert(wallCss().includes('url("/cyrene-wallpaper/base-haze.jpg")'), 'pink wallpaper base restored');
assert(wallCss().includes('--dsw-specific-bubble:rgba(255,247,251,0.600)!important'), 'bubble override restored');
assert(skinCalls.length === 1 && skinCalls[0].id === 'blue-fantasy', `previous skin restored exactly once (${JSON.stringify(skinCalls.map((c) => c.id))})`);
assert(persistedSkin === 'blue-fantasy', 'skin-center persisted the restored skin');
assert(state().skinHold === null, 'skinHold cleared after the restore');
assert(starCanvas() !== null, 'starfield canvas is back for cyrene (its own per-character switch was on)');
assert(starsCss().includes('z-index:-1'), 'stars.css is armed again');
assert(!allCss().includes('.cyrene-bg-particles{display:none'), 'nothing suppresses dsh-cyrene particles any more');

console.log('\n════ 2. 旧一层的人为残留（复现用户看到的「上一个底图」）════');
const legacyWall = document.createElement('div');
legacyWall.setAttribute('data-cyrene-wallpaper', '');
body.appendChild(legacyWall);
const legacyBands = document.createElement('div');
legacyBands.setAttribute('data-cyrene-bands', '');
legacyBands.style.backgroundImage = 'url("/cyrene-wallpaper/overlay-haze.jpg")';
body.prepend(legacyBands);
body.style.setProperty('background-image', 'url("/cyrene-wallpaper/base-haze.jpg")');
documentElement.style.setProperty('background-image', 'url("/cyrene-wallpaper/base-haze.jpg")');
console.log(`  planted: wallpaper=${byAttr('data-cyrene-wallpaper').length} bands=${byAttr('data-cyrene-bands').length} body-bg=${body.style.getPropertyValue('background-image')}`);
assert(byAttr('data-cyrene-wallpaper').length >= 1 && byAttr('data-cyrene-bands').length === 1, 'legacy layers planted in <body>');

console.log('\n════ 3. cyrene → fat-fish：先撤自己的层，再启用目标皮肤 ════');
skinCalls.length = 0;
const midAutumnBefore = skinCalls.filter((c) => c.id === 'mid-autumn').length;
await switchSession('fat-fish');
console.log(`  data-ca-character=${character()}  skin stamp=${documentElement.getAttribute('data-dsh-skin')}`);
assert(character() === 'fat-fish', 'character is fat-fish again');
assert(byAttr('data-cyrene-wallpaper').length === 0, '[data-cyrene-wallpaper] REMOVED (remove(), not display:none)');
assert(byAttr('data-cyrene-bands').length === 0, '[data-cyrene-bands] REMOVED with its inline background-image');
assert(body.style.getPropertyValue('background-image') === '', 'body inline background-image cleared');
assert(documentElement.style.getPropertyValue('background-image') === '', 'html inline background-image cleared');
assert(wallCss() === '', 'wall.css text cleared');
assert(!allCss().includes('url("/cyrene-wallpaper/'), 'no old wallpaper URL left in any style sheet');
assert(!allCss().includes('--dsw-alias-bg-base'), 'token overrides cleared');
assert(starCanvas() === null, 'starfield canvas removed again');
assert(documentElement.dataset.caStarfield === undefined, 'html[data-ca-starfield] cleared');
assert(yieldPresent(), 'yield.css installed');
assert(skinCalls.filter((c) => c.id === 'mid-autumn').length - midAutumnBefore === 1, `mid-autumn enabled exactly once for this switch (${JSON.stringify(skinCalls.map((c) => c.id))})`);
assert(persistedSkin === 'mid-autumn', 'skin-center persisted mid-autumn');
assert(state().skinHold?.previous === 'blue-fantasy', 'the skin to give back is still blue-fantasy');

console.log('\n════ 4. 连续来回 3 次：不累积 ════');
const tagNames = (list) => list.map((el) => el.dataset.pluginCss).sort().join(',');
const signature = (tags, canvas, bands, hosts) => `${tags}/${canvas}/${bands}/${hosts}`;
const counts = { cyrene: [], fish: [] };
let accumulated = 0;
for (let round = 1; round <= 3; round += 1) {
  await switchSession('cyrene-work');
  const cyreneTags = pluginStyles();
  const cyreneCanvas = starCanvas();
  const cyreneBands = byAttr('data-cyrene-bands').length;
  const cyreneHosts = byAttr('data-cyrene-wallpaper').length;
  counts.cyrene.push(signature(cyreneTags.length, cyreneCanvas === null ? 0 : 1, cyreneBands, cyreneHosts));
  console.log(`  round ${round} cyrene: styles=${cyreneTags.length} [${tagNames(cyreneTags)}] canvas=${cyreneCanvas === null ? 0 : 1} bands=${cyreneBands} wallHost=${cyreneHosts}`);

  await switchSession('fat-fish');
  const fishTags = pluginStyles();
  const fishCanvas = starCanvas();
  const fishBands = byAttr('data-cyrene-bands').length;
  const fishHosts = byAttr('data-cyrene-wallpaper').length;
  counts.fish.push(signature(fishTags.length, fishCanvas === null ? 0 : 1, fishBands, fishHosts));
  console.log(`  round ${round} fat-fish: styles=${fishTags.length} [${tagNames(fishTags)}] canvas=${fishCanvas === null ? 0 : 1} bands=${fishBands} wallHost=${fishHosts} yield=${yieldPresent() ? 'yes' : 'no'}`);
  if (!yieldPresent() || fishBands !== 0 || fishHosts !== 0 || fishCanvas !== null) accumulated += 1;
  if (allCss().includes('url("/cyrene-wallpaper/')) accumulated += 1;
}
console.log(`  signatures: cyrene=${counts.cyrene.join(' ')}  fat-fish=${counts.fish.join(' ')}`);
assert(new Set(counts.cyrene).size === 1, 'cyrene style-tag/canvas/band signature is identical every round');
assert(new Set(counts.fish).size === 1, 'fat-fish style-tag/canvas/band signature is identical every round');
const partsOf = (sig) => sig.split('/').map(Number);
assert(counts.fish.every((c) => partsOf(c)[2] === 0 && partsOf(c)[3] === 0), 'no [data-cyrene-*] layer left in any fat-fish round');
assert(accumulated === 0, 'no accumulation across three round trips');
assert(pluginStyles().length === 7, `exactly 7 style tags in fat-fish (6 own + yield), got ${pluginStyles().length}`);
assert(starCanvas() === null && byAttr('data-ca-starfield-canvas').length === 0, 'no duplicate star canvas');
assert(body.style.getPropertyValue('background-image') === '', 'body background-image still empty after the cycles');
assert(documentElement.style.getPropertyValue('background-image') === '', 'html background-image still empty after the cycles');

console.log('\n════ 5. 设置面板（在让位态）仍然可渲染，并如实显示「让位中」════');
for (const [id, factory] of sectionFactories) {
  try {
    const tree = factory();
    console.log(`PASS  panel ${id} rendered`);
    if (id === 'character-appearance') {
      const text = JSON.stringify(tree);
      assert(text.includes('外观归属'), 'panel shows 外观归属');
      assert(text.includes('不绘制（外观让位给目标皮肤）'), 'panel says the starfield is not painted while yielding');
      assert(text.includes('皮肤中心 · mid-autumn'), 'panel names the skin that owns the look');
    }
  } catch (error) {
    console.log(`FAIL  panel ${id} threw: ${String(error)}`);
    failed += 1;
  }
}

console.log('\n════ 6. 皮肤中心客户端还没起来时的回落（POST /active + dsh-skin-applied 契约）════');
runtimeAvailable = false;
delete window.__skinRuntime;
const postsBefore = posts.filter((p) => p.url === 'skin-active').length;
await switchSession('cyrene-work');
await wait(4200); // the hand-over waits up to SKIN_WAIT_MS for the runtime, then falls back
const skinPosts = posts.filter((p) => p.url === 'skin-active');
console.log(`  fallback posts: ${JSON.stringify(skinPosts.map((p) => p.payload))}`);
assert(character() === 'cyrene', 'character switched to cyrene even without the runtime');
assert(skinPosts.length > postsBefore, 'fell back to POST /api/skin-center/v2/active {active: "blue-fantasy"}');
assert(skinPosts.some((p) => p.payload?.active === 'blue-fantasy'), 'the remembered skin was posted');
assert(persistedSkin === 'blue-fantasy', 'fallback persisted the restored selection');
assert(!yieldPresent(), 'yield.css removed without the runtime too');

console.log(`\nstyle tags now: ${pluginStyles().map((s) => s.dataset.pluginCss).join(' | ')}`);
console.log(`skinCalls total: ${skinCalls.length}, persisted=${persistedSkin}, skinHold=${JSON.stringify(state().skinHold)}`);
console.log(failed === 0 ? `\nALL PASS (${Date.now() - t0} ms)` : `\n${failed} FAILURE(S)`);
process.exit(failed === 0 ? 0 : 1);
