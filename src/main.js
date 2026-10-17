// =====================================================================
//  FRONT END - vector display, controls, audio, settings
// =====================================================================

// ---- Vector generator: builds a list of beam segments for one frame ----
function createVG() {
  let shown = [], next = [], x = 0, y = 0, s = 0;
  return {
    begin() { next = []; x = 0; y = 0; s = 0; },
    labs(nx, ny, ns) { x = nx; y = ny; s = ns; },               // LABS: absolute position + scale
    vec(dx, dy, z) {                                             // VCTR: relative, scaled by 2^scale
      const k = Math.pow(2, s), nx = x + dx * k, ny = y + dy * k;
      if (z > 0) next.push(x, y, nx, ny, z);
      x = nx; y = ny;
    },
    dot(z) { if (z > 0) next.push(x, y, x, y, z); },
    shape(arr, zAdd = 0, mx = 1, my = 1) {                       // JSRL / copied picture
      for (const v of arr) this.vec(v[0] * mx, v[1] * my, zAdd ? (v[2] + zAdd) & 15 : v[2]);
    },
    end() { shown = next; },
    abort() { /* incomplete list: keep showing the previous frame */ },
    get segs() { return shown; },
  };
}

// ---- Settings ----
const DEFAULT_OPT = { lang: 0, lives: 3, coinage: 2, glow: true, volume: 0.8 };
function loadOpt() {
  try { return Object.assign({}, DEFAULT_OPT, JSON.parse(localStorage.getItem('asteroids79.opt') || '{}')); }
  catch (e) { return Object.assign({}, DEFAULT_OPT); }
}
function saveOpt(o) { try { localStorage.setItem('asteroids79.opt', JSON.stringify(o)); } catch (e) { /* ignore */ } }

const sw = { fire: false, hyp: false, thrust: false, rotl: false, rotr: false, start1: false, start2: false };
const snd = { EXPSND: 0, THUMP: 0, SCRSND: 0, SCRSEL: 0, SCRFIR: 0, SHPSND: 0, SHPFIR: 0, TONE: 0 };
const opt = loadOpt();
const V = createVG();

const io = {
  sw, snd, opt, V,
  loadHighScores(zp, HS, IN) {
    try {
      const d = JSON.parse(localStorage.getItem('asteroids79.hiscores') || 'null');
      if (d && d.hs && d.in) { d.hs.forEach((v, i) => { zp[HS + i] = v & 255; }); d.in.forEach((v, i) => { zp[IN + i] = v & 255; }); }
    } catch (e) { /* ignore */ }
  },
};
const M = createMachine(io);

let lastSaved = '';
function saveHighScores() {
  const zp = M.zp, c = M.debug.consts;
  if (!((zp[0x31] & zp[0x32]) & 0x80)) return;           // still entering initials
  const d = JSON.stringify({ hs: Array.from(zp.slice(c.HSCORE, c.HSCORE + 20)), in: Array.from(zp.slice(c.INITL, c.INITL + 30)) });
  if (d !== lastSaved) { lastSaved = d; try { localStorage.setItem('asteroids79.hiscores', d); } catch (e) { /* ignore */ } }
}

// ---- Display ----
const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');
const sharp = document.createElement('canvas');
const sctx = sharp.getContext('2d');
// Visible part of the vector generator's 1024x1024 space (same size as MAME's window)
const VIEW_X = -10, VIEW_W = 1044, VIEW_Y = 118, VIEW_H = 788;
let W = 0, H = 0;
function resize() {
  const ww = window.innerWidth, wh = window.innerHeight;
  let w = ww, h = Math.round(ww * VIEW_H / VIEW_W);
  if (h > wh) { h = wh; w = Math.round(wh * VIEW_W / VIEW_H); }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  W = canvas.width = sharp.width = Math.round(w * dpr);
  H = canvas.height = sharp.height = Math.round(h * dpr);
}
window.addEventListener('resize', resize);
resize();

ctx.filter = 'blur(2px)';
const canBlur = ctx.filter === 'blur(2px)';
ctx.filter = 'none';

const BRIGHT = Array.from({ length: 16 }, (_, z) => Math.min(1, Math.pow(z / 15, 0.6) * 1.05));
function render() {
  const segs = V.segs, kx = W / VIEW_W, ky = H / VIEW_H, top = VIEW_Y + VIEW_H;
  sctx.globalCompositeOperation = 'source-over';
  sctx.fillStyle = '#000';
  sctx.fillRect(0, 0, W, H);
  sctx.save();
  sctx.beginPath();                              // the DVG only draws inside 0..1023
  sctx.rect((0 - VIEW_X) * kx, (top - 1024) * ky, 1024 * kx, 1024 * ky);
  sctx.clip();
  sctx.lineCap = 'round';
  sctx.lineWidth = Math.max(1, kx * 1.6);
  sctx.strokeStyle = '#eef4ff';
  sctx.fillStyle = '#eef4ff';
  for (let z = 1; z < 16; z++) {                 // one path per brightness level
    sctx.globalAlpha = BRIGHT[z];
    sctx.beginPath();
    let any = false;
    for (let i = 0; i < segs.length; i += 5) {
      if (segs[i + 4] !== z) continue;
      const x0 = (segs[i] - VIEW_X) * kx, y0 = (top - segs[i + 1]) * ky, x1 = (segs[i + 2] - VIEW_X) * kx, y1 = (top - segs[i + 3]) * ky;
      if (x0 === x1 && y0 === y1) { sctx.moveTo(x0 + 0.01, y0); sctx.arc(x0, y0, sctx.lineWidth * 0.9, 0, Math.PI * 2); }
      else { sctx.moveTo(x0, y0); sctx.lineTo(x1, y1); }
      any = true;
    }
    if (any) { sctx.stroke(); sctx.fill(); }
  }
  sctx.restore();
  sctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  if (opt.glow && canBlur) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.filter = `blur(${Math.max(2, Math.round(kx * 5))}px)`;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(sharp, 0, 0);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
  }
  ctx.drawImage(sharp, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
}

// ---- Controls ----
const keys = new Set();
const tapped = new Set();          // keys pressed since the last frame (so quick taps aren't missed)
const KEYMAP = {
  rotl: ['ArrowLeft', 'KeyA'], rotr: ['ArrowRight', 'KeyD'], thrust: ['ArrowUp', 'KeyW'],
  fire: ['Space', 'ControlLeft', 'ControlRight', 'KeyK'], hyp: ['ArrowDown', 'KeyS', 'ShiftLeft', 'ShiftRight', 'KeyL'],
  start1: ['Digit1', 'Enter', 'NumpadEnter'], start2: ['Digit2'],
};
const COIN_KEYS = ['Digit5', 'KeyC'];
let coinWas = false;
window.addEventListener('keydown', e => {
  if (e.code === 'KeyO') { toggleOptions(); e.preventDefault(); return; }
  if (e.code === 'KeyP' || e.code === 'Escape') { if (!optionsOpen()) togglePause(); e.preventDefault(); return; }
  if (e.code === 'KeyM') { opt.volume = opt.volume > 0 ? 0 : 0.8; saveOpt(opt); applyVolume(); syncOptionsForm(); return; }
  if (optionsOpen()) return;
  keys.add(e.code);
  tapped.add(e.code);
  powerOnIfNeeded();
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); tapped.clear(); });

function readInputs() {
  const down = c => keys.has(c) || tapped.has(c);
  const k = name => KEYMAP[name].some(down);
  const coinHeld = COIN_KEYS.some(c => keys.has(c)), coinTap = COIN_KEYS.some(c => tapped.has(c));
  let padCoin = false;
  const pad = { fire: false, hyp: false, thrust: false, rotl: false, rotr: false, start1: false, start2: false };
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const g of pads) {
    if (!g || !g.connected) continue;
    const b = i => !!(g.buttons[i] && g.buttons[i].pressed);
    const ax = g.axes[0] || 0, ay = g.axes[1] || 0;
    pad.fire = pad.fire || b(0) || b(2);
    pad.thrust = pad.thrust || b(1) || b(7) || b(5) || b(12) || ay < -0.6;
    pad.hyp = pad.hyp || b(3) || b(4) || b(6) || b(13) || ay > 0.75;
    pad.rotl = pad.rotl || b(14) || ax < -0.4;
    pad.rotr = pad.rotr || b(15) || ax > 0.4;
    pad.start1 = pad.start1 || b(9);
    pad.start2 = pad.start2 || b(10) || b(11);
    padCoin = padCoin || b(8);
    if (b(9) || b(0)) powerOnIfNeeded();
  }
  for (const n of Object.keys(sw)) sw[n] = k(n) || pad[n];
  if ((coinHeld || coinTap || padCoin) && !coinWas) M.coin();
  coinWas = coinHeld || padCoin;
  tapped.clear();
}

// ---- Audio ----
let audio = null;
async function startAudio() {
  if (audio) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const ac = new AC();
  audio = { ac, post: null };
  try {
    const src = makeSynth.toString() + `
      class P extends AudioWorkletProcessor {
        constructor() { super(); this.s = makeSynth(sampleRate);
          this.port.onmessage = e => { if (e.data.regs) Object.assign(this.s.regs, e.data.regs); if (e.data.vol !== undefined) this.s.volume = e.data.vol; }; }
        process(i, o) { this.s.render(o[0][0]); for (let c = 1; c < o[0].length; c++) o[0][c].set(o[0][0]); return true; }
      }
      registerProcessor('asteroids-sound', P);`;
    const url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
    await ac.audioWorklet.addModule(url);
    const node = new AudioWorkletNode(ac, 'asteroids-sound', { outputChannelCount: [1] });
    node.connect(ac.destination);
    audio.post = m => node.port.postMessage(m);
  } catch (e) {
    // fallback: ScriptProcessor
    const s = makeSynth(ac.sampleRate);
    const node = ac.createScriptProcessor(1024, 0, 1);
    node.onaudioprocess = ev => s.render(ev.outputBuffer.getChannelData(0));
    node.connect(ac.destination);
    audio.post = m => { if (m.regs) Object.assign(s.regs, m.regs); if (m.vol !== undefined) s.volume = m.vol; };
  }
  applyVolume();
  if (ac.state === 'suspended') ac.resume();
}
function applyVolume() { if (audio && audio.post) audio.post({ vol: opt.volume }); }
function pushSound() {
  if (!audio || !audio.post) return;
  audio.post({ regs: paused ? { EXPSND: 0, THUMP: 0, SCRSND: 0, SCRFIR: 0, SHPSND: 0, SHPFIR: 0, TONE: 0 } : Object.assign({}, snd) });
}

// ---- Power on / pause / options ----
let powered = false, paused = false;
const splash = document.getElementById('splash');
const pauseEl = document.getElementById('paused');
function powerOnIfNeeded() {
  startAudio();
  if (audio && audio.ac.state === 'suspended') audio.ac.resume();
  if (powered) return;
  powered = true;
  splash.classList.add('hidden');
  M.powerOn();
}
splash.addEventListener('click', powerOnIfNeeded);
window.addEventListener('pointerdown', () => { if (powered) powerOnIfNeeded(); });
function togglePause() { if (!powered) return; paused = !paused; pauseEl.classList.toggle('hidden', !paused); pushSound(); }

const optEl = document.getElementById('options');
const optionsOpen = () => !optEl.classList.contains('hidden');
function syncOptionsForm() {
  for (const el of optEl.querySelectorAll('[data-opt]')) {
    const k = el.dataset.opt;
    if (el.type === 'checkbox') el.checked = !!opt[k];
    else if (el.type === 'range') el.value = opt[k];
    else el.value = String(opt[k]);
  }
}
function toggleOptions() {
  const open = !optionsOpen();
  optEl.classList.toggle('hidden', !open);
  if (open) { syncOptionsForm(); keys.clear(); }
  if (powered) { paused = open; pauseEl.classList.add('hidden'); pushSound(); }
}
optEl.addEventListener('input', e => {
  const el = e.target, k = el.dataset.opt;
  if (!k) return;
  opt[k] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? parseFloat(el.value) : parseInt(el.value, 10);
  saveOpt(opt);
  if (k === 'coinage' && powered) M.setCoinMode();
  if (k === 'volume') applyVolume();
});
document.getElementById('opt-close').addEventListener('click', toggleOptions);
document.getElementById('opt-reset').addEventListener('click', () => {
  if (!confirm('Clear the high score table?')) return;
  try { localStorage.removeItem('asteroids79.hiscores'); } catch (e) { /* ignore */ }
  lastSaved = '';
  if (powered) M.powerOn();
});
document.getElementById('opt-help').addEventListener('click', () => document.getElementById('help').classList.toggle('hidden'));

// ---- Main loop: the game runs at the board's 61.5 Hz frame rate ----
const FRAME_MS = 1000 / (12096000 / 4096 / 12 / 4);
let acc = 0, last = performance.now();
function loop(now) {
  let dt = now - last; last = now;
  if (dt > 250) dt = FRAME_MS;              // tab was hidden: don't fast-forward
  if (powered && !paused) {
    acc += dt;
    while (acc >= FRAME_MS) {
      acc -= FRAME_MS;
      readInputs();
      M.frame();
    }
    pushSound();
    if ((M.zp[0x5B] & 63) === 0) saveHighScores();
  } else {
    if (powered) readInputs();
    acc = 0;
  }
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
