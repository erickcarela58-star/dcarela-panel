// Apple-inspired web motion. No runtime dependencies.
export const presets = Object.freeze({
  smooth: { duration: 550, damping: 1 },
  snappy: { duration: 430, damping: .78 },
  bouncy: { duration: 650, damping: .48 },
  glass: { duration: 540, damping: .72 },
  press: { duration: 260, damping: .85 },
});
const running = new WeakMap();
const activeElements = new Set();
export const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
export function springProgress(t, damping = .78) {
  const z = Math.max(.15, Math.min(1, damping));
  const w = 7 / z;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (z === 1) return 1 - (1 + w*t)*Math.exp(-w*t);
  const wd = w * Math.sqrt(1-z*z);
  return 1-Math.exp(-z*w*t)*(Math.cos(wd*t)+z*w/wd*Math.sin(wd*t));
}
const clamp = (x, a=0, b=1) => Math.min(b, Math.max(a, x));
export function stop(element) {
  running.get(element)?.cancel();
  running.delete(element);
  activeElements.delete(element);
}
export function stopInside(scope = globalThis.document) {
  for (const el of [...activeElements]) {
    if (!scope || scope === globalThis.document || el?.isConnected === false || scope.contains?.(el)) {
      stop(el);
    }
  }
}
export function motion(element, from, to, {preset='snappy', duration, damping, delay=0} = {}) {
  if (!element || element.isConnected === false) return Promise.resolve(false);
  stop(element);
  const p = presets[preset] ?? presets.snappy;
  const start = {x:0,y:0,sx:1,sy:1,rotate:0,opacity:1,...from};
  const end = {...start,...to};
  const frame = t => {
    const q = springProgress(t, damping ?? p.damping);
    const n = k => start[k] + (end[k]-start[k])*q;
    return { transform: `translate3d(${n('x')}px,${n('y')}px,0) rotate(${n('rotate')}deg) scale(${n('sx')},${n('sy')})`, opacity: clamp(n('opacity')) };
  };
  if (reducedMotion() || !element.animate) return Promise.resolve(true);
  const dur = duration ?? p.duration;
  const steps = dur <= 280 ? 17 : 29;
  const frames = Array.from({length: steps + 1}, (_, i) => frame(i / steps));
  const a = element.animate(frames,{duration: dur,delay,easing:'linear',fill:'both'});
  running.set(element,a);
  activeElements.add(element);
  return a.finished.then(()=>{
    if(running.get(element)!==a) return false;
    // Endpoints are transient: caller owns final layout and visibility.
    running.delete(element); activeElements.delete(element); a.cancel(); return true;
  },()=>{
    if(running.get(element)===a){ running.delete(element); activeElements.delete(element); }
    return false;
  });
}
export function reveal(element, opts={}) {
  return motion(element,{y:18,sx:.96,sy:.96,opacity:0},{y:0,sx:1,sy:1,opacity:1},opts);
}
export function pop(element, opts={}) {
  return motion(element,{sx:.65,sy:.65,rotate:-5,opacity:0},{sx:1,sy:1,rotate:0,opacity:1},{preset:'bouncy',...opts});
}
export function glassExpand(element, opts={}) {
  return motion(element,{sx:.72,sy:.88,y:16,opacity:0},{sx:1,sy:1,y:0,opacity:1},{preset:'glass',...opts});
}
// Text animation does not rewrite existing markup. Wrap units in data-motion-unit spans beforehand.
export function revealText(element,{stagger=55,preset='smooth',duration=430}={}) {
  const units = [...element.querySelectorAll('[data-motion-unit]')];
  if (!units.length) return reveal(element,{preset,duration});
  return Promise.all(units.map((unit,i)=>reveal(unit,{preset,duration,delay:Math.min(i*stagger,400)})));
}
export function enterScreen(element,{direction=1}={}) {
  return motion(element,{x:22*direction,opacity:0},{x:0,opacity:1},{preset:'smooth',duration:350});
}
const dialogVersions = new WeakMap();
function nextVersion(dialog) { const v=(dialogVersions.get(dialog)??0)+1;dialogVersions.set(dialog,v);return v; }
export async function openDialog(dialog) {
  const version=nextVersion(dialog);
  if(!dialog.open) dialog.showModal();
  const panel=dialog.querySelector('[data-motion-panel]')??dialog;
  await glassExpand(panel);
  return version===dialogVersions.get(dialog);
}
export async function closeDialog(dialog) {
  if(!dialog.open)return false;
  const version=nextVersion(dialog);
  const panel=dialog.querySelector('[data-motion-panel]')??dialog;
  const done=await motion(panel,{sx:1,sy:1,opacity:1},{sx:.96,sy:.96,y:10,opacity:0},{preset:'smooth',duration:180});
  if(done && dialogVersions.get(dialog)===version && dialog.open)dialog.close();
  return done;
}
const counters = new WeakMap();
export function count(element, from, to, {duration=650, currency, locale='es-DO'}={}) {
  counters.get(element)?.();
  const formatter=new Intl.NumberFormat(locale,currency?{style:'currency',currency}:{maximumFractionDigits:0});
  if(reducedMotion()){element.textContent=formatter.format(to);return ()=>{};}
  let frame, start, stopped=false;
  const cancel=()=>{stopped=true;cancelAnimationFrame(frame);};
  counters.set(element,cancel);
  const tick=now=>{
    if(stopped)return;
    start??=now;
    const t=clamp((now-start)/Math.max(1,duration));
    element.textContent=formatter.format(from+(to-from)*(1-Math.pow(1-t,4)));
    if(t<1)frame=requestAnimationFrame(tick);else if(counters.get(element)===cancel)counters.delete(element);
  };
  frame=requestAnimationFrame(tick);
  return cancel;
}
