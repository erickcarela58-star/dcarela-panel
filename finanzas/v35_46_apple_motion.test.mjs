import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  presets,
  reducedMotion,
  springProgress,
  stop,
  stopInside,
  motion,
  reveal,
  pop,
  glassExpand,
  revealText,
  enterScreen,
  openDialog,
  closeDialog,
  count
} from './apple-motion.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(__dirname, rel), 'utf8');

function makeAnimTarget() {
  const animations = [];
  const style = {};
  const attrs = new Map();
  const children = [];
  const el = {
    nodeType: 1,
    style,
    children,
    setAttribute(k, v) { attrs.set(k, String(v)); },
    getAttribute(k) { return attrs.get(k) ?? null; },
    hasAttribute(k) { return attrs.has(k); },
    querySelector: () => null,
    querySelectorAll(sel) {
      if (sel === '[data-motion-unit]') return children.filter((c) => c.hasAttribute('data-motion-unit'));
      return [];
    },
    animate(keyframes, options) {
      const handle = {
        keyframes,
        options,
        cancelled: false,
        playState: 'running',
        finished: Promise.resolve(),
        cancel() {
          this.cancelled = true;
          this.playState = 'idle';
        },
        finish() {
          this.playState = 'finished';
        }
      };
      animations.push(handle);
      return handle;
    }
  };
  return { el, animations };
}

function withMockBrowserEnv(reduced = false, fn) {
  const prevMatchMedia = globalThis.matchMedia;
  const prevWindow = globalThis.window;
  const prevRaf = globalThis.requestAnimationFrame;
  const prevCaf = globalThis.cancelAnimationFrame;
  const prevPerf = globalThis.performance;
  let now = 0;
  let nextFrame = null;
  const mm = (q) => ({ matches: reduced && String(q).includes('prefers-reduced-motion') });
  globalThis.matchMedia = mm;
  globalThis.window = { matchMedia: mm };
  globalThis.requestAnimationFrame = (cb) => { nextFrame = cb; return 1; };
  globalThis.cancelAnimationFrame = () => { nextFrame = null; };
  globalThis.performance = { now: () => now };
  try {
    return fn({
      setNow(v) { now = v; },
      stepFrame(v) {
        now = v;
        const cb = nextFrame;
        nextFrame = null;
        if (cb) cb(v);
      }
    });
  } finally {
    globalThis.matchMedia = prevMatchMedia;
    globalThis.window = prevWindow;
    globalThis.requestAnimationFrame = prevRaf;
    globalThis.cancelAnimationFrame = prevCaf;
    globalThis.performance = prevPerf;
  }
}

test('apple-motion presets and springProgress physics follow natural Apple curves', () => {
  for (const key of ['smooth', 'snappy', 'bouncy', 'glass', 'press']) {
    assert.ok(presets[key], `Missing preset ${key}`);
  }
  assert.equal(springProgress(0), 0);
  assert.equal(springProgress(1), 1);

  const smoothMid = springProgress(0.5, 1);
  assert.ok(smoothMid > 0.85 && smoothMid <= 1, `unexpected smooth mid=${smoothMid}`);

  let peak = 0;
  for (let i = 0; i <= 40; i++) {
    peak = Math.max(peak, springProgress(i / 40, 0.72));
  }
  assert.ok(peak >= 0.99 && peak <= 1.15, `Apple spring overshoot should be gentle (peak=${peak})`);
});

test('apple-motion WAAPI helpers animate only transform/opacity and cancel prior animations on state change', () => {
  withMockBrowserEnv(false, () => {
    const { el, animations } = makeAnimTarget();
    reveal(el, { y: 14, duration: 400 });
    assert.equal(animations.length, 1);
    assert.equal(animations[0].cancelled, false);

    // Every sampled keyframe only animates compositor-safe transform + opacity (with lean sampling budget)
    assert.ok(animations[0].keyframes.length >= 17 && animations[0].keyframes.length <= 32, `Unexpected frame count ${animations[0].keyframes.length}`);
    for (const frame of animations[0].keyframes) {
      for (const prop of Object.keys(frame)) {
        assert.ok(['transform', 'opacity'].includes(prop), `Disallowed animated CSS prop ${prop}`);
      }
    }

    // Second animation on same element stops first cleanly
    pop(el, { duration: 360 });
    assert.equal(animations.length, 2);
    assert.equal(animations[0].cancelled, true);

    stop(el);
    assert.equal(animations[1].cancelled, true);

    glassExpand(el, { duration: 460 });
    assert.equal(animations.length, 3);

    enterScreen(el, { direction: 1 });
    assert.equal(animations.length, 4);
    assert.match(animations[3].keyframes[0].transform, /translate3d\(22px/);

    // stopInside cancels only animations within matching scope in O(active)
    const { el: otherEl, animations: otherAnims } = makeAnimTarget();
    reveal(otherEl, { duration: 380 });
    stopInside({ contains: (node) => node === el });
    assert.equal(animations[3].cancelled, true);
    assert.equal(otherAnims[0].cancelled, false);
    stop(otherEl);
  });
});

test('apple-motion revealText staggers [data-motion-unit] tokens sequentially and respects prefers-reduced-motion', async () => {
  await withMockBrowserEnv(false, async () => {
    const { el: host } = makeAnimTarget();
    const u1 = makeAnimTarget();
    const u2 = makeAnimTarget();
    const u3 = makeAnimTarget();
    for (const u of [u1, u2, u3]) {
      u.el.setAttribute('data-motion-unit', '');
      host.children.push(u.el);
    }
    const done = await revealText(host, { stagger: 35, duration: 360 });
    assert.equal(done.length, 3);
    assert.ok(done.every(Boolean));
    const delays = [u1, u2, u3].map((u) => u.animations[0].options.delay);
    assert.deepEqual(delays, [0, 35, 70]);
  });

  await withMockBrowserEnv(true, async () => {
    assert.equal(reducedMotion(), true);
    const { el, animations } = makeAnimTarget();
    const res = await reveal(el, { y: 16 });
    assert.equal(animations.length, 0);
    assert.equal(res, true);
  });
});

test('apple-motion count and dialog helpers execute cleanly in both normal and reduced-motion modes', async () => {
  await withMockBrowserEnv(false, async ({ stepFrame }) => {
    const target = { textContent: '' };
    count(target, 0, 1500, { duration: 400 });
    stepFrame(0);
    assert.equal(target.textContent, '0');
    stepFrame(200);
    assert.notEqual(target.textContent, '0');
    assert.notEqual(target.textContent, '1,500');
    stepFrame(400);
    assert.match(target.textContent, /1[,.]?500/);

    const backdrop = makeAnimTarget();
    const panel = makeAnimTarget();
    backdrop.el.open = false;
    backdrop.el.querySelector = (sel) => (sel === '[data-motion-panel]' ? panel.el : null);
    backdrop.el.showModal = () => { backdrop.el.open = true; };
    backdrop.el.close = () => { backdrop.el.open = false; };

    const opened = await openDialog(backdrop.el);
    assert.equal(opened, true);
    assert.equal(backdrop.el.open, true);
    assert.equal(panel.animations.length, 1);

    const closed = await closeDialog(backdrop.el);
    assert.equal(closed, true);
    assert.equal(backdrop.el.open, false);
    assert.equal(panel.animations.length, 2);
  });

  withMockBrowserEnv(true, () => {
    const reducedTarget = { textContent: '' };
    count(reducedTarget, 0, 980, { duration: 400 });
    assert.equal(reducedTarget.textContent, '980');
  });
});

test('wrapMotionWords wraps plain text words into [data-motion-unit] while safely skipping mixed SVG markup', () => {
  const appJs = read('app.js');
  const start = appJs.indexOf('function wrapMotionWords(');
  assert.ok(start !== -1, 'wrapMotionWords missing from app.js');
  const slice = appJs.slice(start, appJs.indexOf('\nfunction ', start + 10));

  const created = [];
  const plainHost = {
    nodeType: 1,
    dataset: {},
    textContent: 'Corte de caja listo',
    childNodes: [{ nodeType: 3, textContent: 'Corte de caja listo' }],
    querySelector: () => null,
    replaceChildren(frag) {
      this.childNodes = frag.children;
    }
  };
  const svgHost = {
    nodeType: 1,
    dataset: {},
    textContent: 'Texto con icono',
    childNodes: [
      { nodeType: 1, tagName: 'SVG', childNodes: [] },
      { nodeType: 3, textContent: 'Texto con icono' }
    ],
    querySelector: () => null,
    replaceChildren() {
      throw new Error('Must not replace children when mixed element nodes exist');
    }
  };
  const sandbox = {
    reducedMotion: () => false,
    document: {
      createDocumentFragment: () => ({ children: [], appendChild(n) { this.children.push(n); } }),
      createElement: (tag) => {
        const node = { nodeType: 1, tagName: tag.toUpperCase(), attributes: {}, textContent: '', setAttribute(k, v) { this.attributes[k] = v; } };
        created.push(node);
        return node;
      },
      createTextNode: (t) => ({ nodeType: 3, textContent: t })
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(slice, sandbox);

  assert.equal(sandbox.wrapMotionWords(plainHost), true);
  assert.equal(created.length, 4);
  assert.deepEqual(created.map((n) => n.textContent), ['Corte', 'de', 'caja', 'listo']);
  assert.ok(created.every((n) => n.attributes['data-motion-unit'] === 'word'));
  assert.equal(plainHost.dataset.motionWords, '1');

  assert.equal(sandbox.wrapMotionWords(svgHost), false);

  const longHost = {
    nodeType: 1,
    dataset: {},
    textContent: 'Uno dos tres cuatro cinco seis siete ocho nueve diez once doce',
    childNodes: [{ nodeType: 3, textContent: 'Uno dos tres cuatro cinco seis siete ocho nueve diez once doce' }],
    querySelector: () => null,
    replaceChildren() {
      throw new Error('Must skip word-splitting long strings >10 words to prevent animation storms');
    }
  };
  assert.equal(sandbox.wrapMotionWords(longHost), false);
});
