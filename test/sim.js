// Headless simulation of the game logic (no browser).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ctx = { console, Math };
vm.createContext(ctx);
for (const f of ['data.js', 'game.js', 'synth.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx, { filename: f });

function makeVG() {
  let segs = [], next = [], x = 0, y = 0, s = 0, labsCount = 0;
  return {
    begin() { next = []; labsCount = 0; },
    labs(nx, ny, ns) { x = nx; y = ny; s = ns; labsCount++; },
    vec(dx, dy, z) { const k = 2 ** s, nx = x + dx * k, ny = y + dy * k; if (z > 0) next.push([x, y, nx, ny, z]); x = nx; y = ny; },
    dot(z) { if (z > 0) next.push([x, y, x, y, z]); },
    shape(arr, zAdd = 0, mx = 1, my = 1) { for (const v of arr) this.vec(v[0] * mx, v[1] * my, zAdd ? (v[2] + zAdd) & 15 : v[2]); },
    end() { segs = next; }, abort() {},
    get segs() { return segs; },
  };
}

function run(seed, frames, policy) {
  const sw = { fire: false, hyp: false, thrust: false, rotl: false, rotr: false, start1: false, start2: false };
  const snd = {};
  const V = makeVG();
  const io = { sw, snd, opt: { lang: 0, lives: 3, coinage: 2 }, V };
  const M = vm.runInContext('createMachine', ctx)(io);
  M.powerOn();
  let rng = seed;
  const rnd = () => ((rng = (rng * 1103515245 + 12345) >>> 0) / 4294967296);
  const log = [];
  for (let f = 0; f < frames; f++) {
    policy(f, sw, M, rnd);
    M.frame();
    log.push({ f, segs: V.segs.length, zp: M.zp.slice(), pg: M.pg.slice(), snd: Object.assign({}, snd) });
  }
  return { M, log, V };
}
module.exports = { run, ctx };

if (require.main === module) {
  const C = { NPLAYR: 0x1B, SCORE: 0x51, HITS: 0x56, CRDT: 0x6F, HSCORE: 0x1C, INITL: 0x33, UPDFLG: 0x31 };
  const bcd = (lo, hi) => ((hi >> 4) * 1000 + (hi & 15) * 100 + (lo >> 4) * 10 + (lo & 15)) * 10;
  // 1. attract mode for 2000 frames
  let r = run(1, 2000, () => {});
  const nrocks = r.log.map(e => e.pg[246]);
  console.log('attract: max segs', Math.max(...r.log.map(e => e.segs)), 'rocks first frame', nrocks[1], 'saucer seen', r.log.some(e => e.pg[28] > 0 && e.pg[28] < 0x80));

  // 2. play several games with a random-ish policy
  for (let seed = 1; seed <= 6; seed++) {
    let started = 0, gameOverAt = -1;
    r = run(seed, 60000, (f, sw, M, rnd) => {
      for (const k in sw) sw[k] = false;
      if (f === 100) M.coin();
      if (f === 110 || f === 111) sw.start1 = true;
      if (f > 120) {
        sw.rotl = (f >> 5) % 3 === 0; sw.rotr = (f >> 5) % 3 === 1;
        sw.fire = (f & 7) < 3;
        sw.thrust = rnd() < 0.08;
        sw.hyp = rnd() < 0.002;
      }
      // initials entry: rotate a bit, then accept
      if (M.zp[0x1B] === 0 && !((M.zp[0x31] & M.zp[0x32]) & 0x80)) { sw.rotl = (f % 16) < 4; sw.hyp = (f % 40) > 30; sw.fire = false; }
    });
    for (const e of r.log) {
      if (!started && e.zp[C.NPLAYR] === 1) started = e.f;
      if (started && gameOverAt < 0 && e.zp[C.NPLAYR] === 0xFF) gameOverAt = e.f;
    }
    const sc = Math.max(...r.log.map(e => bcd(e.zp[C.SCORE], e.zp[C.SCORE + 1])));
    const last = r.log[r.log.length - 1].zp;
    const hs = bcd(last[C.HSCORE], last[C.HSCORE + 1]);
    const ini = Array.from(last.slice(C.INITL, C.INITL + 3)).map(c => c === 0 ? '_' : c <= 10 ? String(c - 1) : String.fromCharCode(54 + c)).join('');
    const maxLives = Math.max(...r.log.map(e => e.zp[C.HITS]));
    const sounds = new Set(); r.log.forEach(e => { for (const k in e.snd) if (e.snd[k]) sounds.add(k); });
    console.log(`seed ${seed}: started f${started}, game over f${gameOverAt} (${((gameOverAt - started) / 61.5).toFixed(0)}s), best score ${sc}, hiscore ${hs} ${ini}, max lives ${maxLives}, max segs ${Math.max(...r.log.map(e => e.segs))}, sounds ${[...sounds].join(',')}`);
  }
}
