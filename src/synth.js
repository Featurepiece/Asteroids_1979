// =====================================================================
//  SOUND - the Asteroids board makes its sounds with analogue circuits
//  that the program only switches on and off (see ASTDEC: EXPSND,
//  THUMP, SCRSND, SCRFIR, SCRSEL, SHPSND, SHPFIR, TONE).  This is a
//  sample-by-sample recreation driven by those same register values.
//  Frequencies, sweeps, decay times and mix levels follow MAME's
//  discrete model of the board (asteroid_a.cpp, K. Wilkins).  The
//  thump pitches are my own estimate from the circuit values, so they
//  are approximate.
//  This function is also stringified into an AudioWorklet, so it must
//  stay self-contained.
// =====================================================================
function makeSynth(sr) {
  const regs = { EXPSND: 0, THUMP: 0, SCRSND: 0, SCRSEL: 0, SCRFIR: 0, SHPSND: 0, SHPFIR: 0, TONE: 0 };
  const TAU = Math.PI * 2;
  const onePole = fc => { const a = 1 - Math.exp(-TAU * fc / sr); let y = 0; return x => (y += a * (x - y)); };
  function bandpass(fc, q) {                 // RBJ biquad, constant 0 dB peak gain
    const w = TAU * fc / sr, al = Math.sin(w) / (2 * q), a0 = 1 + al;
    const b0 = al / a0, b2 = -al / a0, a1 = -2 * Math.cos(w) / a0, a2 = (1 - al) / a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return x => { const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
  }
  const dcBlock = () => { let x1 = 0, y1 = 0; const r = 1 - TAU * 10 / sr; return x => { const y = x - x1 + r * y1; x1 = x; y1 = y; return y; }; };

  // ---- noise: 16 bit LFSR clocked at 12 kHz (bits 6 and 14, XNOR) ----
  let lfsr = 0, noisePh = 0, noise = 1, noiseClk = 0;
  const NOISE_HZ = 12000;
  function stepNoise() {
    noisePh += NOISE_HZ / sr;
    while (noisePh >= 1) {
      noisePh -= 1;
      const fb = (~(((lfsr >> 6) ^ (lfsr >> 14)) & 1)) & 1;
      lfsr = ((lfsr << 1) | fb) & 0xFFFF;
      noise = fb ? 0.5 : -0.5;          // MAME: +/- amplitude/2
      noiseClk++;
    }
  }

  // ---- thrust: gated noise, RC 72 Hz, band-pass 89.5 Hz, low-pass 160 Hz ----
  const thrLP1 = onePole(72), thrBP = bandpass(89.5, 7.6), thrLP2 = onePole(160);   // band-pass damping 1/7.6
  let thrEnv = 0;

  // ---- explosion: noise sampled at 12 kHz / divider, times volume, RC 52 Hz ----
  let expHold = 0, expLastClk = 0;
  const expLP = onePole(52);
  const EXP_DIV = { 0x00: 12, 0x40: 6, 0x80: 3, 0xC0: 5 };

  // ---- thump: 555 square wave, two pitches, RC 482 Hz ----
  let thumpPh = 0;
  const thumpLP = onePole(482), thumpDC = dcBlock();
  const thumpHz = d => (d & 4 ? 68 : 40);    // estimate (see header)

  // ---- saucer: triangle VCO warbled by a slow triangle ----
  let sPh = 0, sLfo = 0;
  const tri = p => (p < 0.5 ? 4 * p - 1 : 3 - 4 * p);

  // ---- fire sounds: falling square-wave sweep with decaying level ----
  function firer(f0, f1, decay) {
    let on = false, t = 0, ph = 0;
    return gate => {
      if (gate && !on) { t = 0; ph = 0; }
      on = gate;
      if (!on) return 0;
      t += 1 / sr;
      const f = Math.max(f1, f0 - (f0 - f1) / 0.28 * t);
      ph = (ph + f / sr) % 1;
      const duty = Math.min(0.95, (4500 / f + 67) / 100);
      const amp = 7 + decay.a * Math.exp(-t / decay.tau);
      return (ph < duty ? 0.5 : -0.5) * amp;
    };
  }
  const shipFire = firer(820, 110, { a: 46, tau: 0.081 });
  const saucFire = firer(830, 630, { a: 42.5, tau: 0.3 });
  const fireDC = dcBlock();

  let lifePh = 0;
  const outDC = dcBlock();
  const MIX = 2 * 1.4 / 1910.6;               // MAME output normalisation (65534/1910.6, route gain 1.4)
  let master = 1;

  function sample() {
    stepNoise();
    // thrust
    thrEnv += ((regs.SHPSND & 0x80 ? 1 : 0) - thrEnv) * 0.01;
    let out = thrLP2(thrBP(thrLP1(noise * thrEnv * 600 * 7.6)));
    // explosion
    const div = EXP_DIV[regs.EXPSND & 0xC0];
    if (noiseClk - expLastClk >= div) { expLastClk = noiseClk; expHold = noise; }
    out += expLP(expHold * ((regs.EXPSND & 0x3C) >> 2) * 1000 / 15);
    // thump
    if (regs.THUMP & 0x10) {
      thumpPh = (thumpPh + thumpHz(regs.THUMP & 0x0F) / sr) % 1;
      out += thumpDC(thumpLP(thumpPh < 0.5 ? 0.5 : -0.5)) * 131.6;
    } else out += thumpDC(thumpLP(0)) * 131.6;
    // saucer
    if (regs.SCRSND & 0x80) {
      const big = regs.SCRSEL & 0x80 ? 1 : 0;
      sLfo = (sLfo + (big ? 5.75 : 8.25) / sr) % 1;
      const f = 750 - 250 * big + 460 + 460 * tri(sLfo);
      sPh = (sPh + f / sr) % 1;
      out += tri(sPh) * 0.5 * 76.1;
    }
    // fire
    out += fireDC(shipFire(!!(regs.SHPFIR & 0x80)) + saucFire(!!(regs.SCRFIR & 0x80)));
    // extra life tone: 3 kHz
    if (regs.TONE & 0x80) { lifePh = (lifePh + 3000 / sr) % 1; out += (lifePh < 0.5 ? 0.5 : -0.5) * 100; }
    const v = outDC(out * MIX * master);
    return v > 1 ? 1 : v < -1 ? -1 : v;
  }

  return {
    regs,
    set volume(v) { master = v; },
    render(buf) { for (let i = 0; i < buf.length; i++) buf[i] = sample(); },
  };
}
