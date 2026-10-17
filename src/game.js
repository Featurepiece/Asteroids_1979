// =====================================================================
//  GAME LOGIC - a routine-by-routine port of ASTROD (A35131.1A),
//  ASTMSG (A35131.1B), the NMI tone code (A35131.1D) and the parts of
//  VECUT (A35131.1C) the game uses.
//
//  The original RAM layout is kept: zero page is a 256-byte array with
//  the same variable order, and the two player pages (2 and 3) are
//  swapped by the "bank select" bit just like the real board does.
//  Arithmetic is done on bytes with the same carries and wrap-arounds,
//  so the game behaves the way the 6502 code does, quirks included.
// =====================================================================

const NOBJ = 27;               // ASTDEC: rocks 0..26, then:
const SHIP = NOBJ;             //   ship
const SAUC = NOBJ + 1;         //   saucer, then 2 saucer torpedoes, then 4 ship torpedoes

// ---- Zero page (same order as the .BLKB declarations in ASTROD) ----
const VGSIZE = 0x00, VGBRIT = 0x01, XCOMP = 0x04, TEMP1 = 0x08, TEMP2 = 0x0A, TEMP3 = 0x0C, TEMP4 = 0x14,
  PLAYR = 0x17, PLAYR2 = 0x18, LPLAYR = 0x19, NPLAYR = 0x1B, HSCORE = 0x1C, UPDINT = 0x30, UPDFLG = 0x31,
  INITL = 0x33, SCORE = 0x51, NHITS = 0x55, HITS = 0x56, RENTRY = 0x58, GDELAY = 0x59, SYNC = 0x5A,
  FRAME = 0x5B, INTCT = 0x5D, POLYL = 0x5E, POLYH = 0x5F, ANGLE = 0x60, LASTSW = 0x62, XINCL = 0x63,
  YINCL = 0x64, SND1 = 0x65, SND2 = 0x66, SND3 = 0x67, LEXPSND = 0x68, LSND1 = 0x69, LSND2 = 0x6A,
  LTHUMP = 0x6B, THUMP1 = 0x6C, THUMP2 = 0x6D, LOUT1 = 0x6E, CRDT = 0x6F, CMODE = 0x70,
  SHIPX = 0x7C, SHIPY = 0x88;

// ---- Player page (page 2, or page 3 when bank-switched) ----
const OBJ = 0, XINC = 35, YINC = 70, OBJXH = 105, OBJYH = 140, OBJXL = 175, OBJYL = 210,
  SROCKS = 245, NROCKS = 246, EDELAY = 247, SEDLAY = 248, RTIMER = 249, SDELAY = 250,
  RDELAY = 251, THUMP3 = 252, DIFCTY = 253;

function createMachine(io) {
  // io = { sw: {fire,hyp,thrust,rotl,rotr,start1,start2}, opt: {lang,lives,coinage}, snd: {} }
  const zp = new Uint8Array(256);
  const phys = [new Uint8Array(256), new Uint8Array(256)];
  let pg = phys[0], pg3 = phys[1];     // logical page 2 and page 3 (pg3 = "...+100")
  const snd = io.snd;
  const sw = io.sw;
  const V = io.V;                      // display list builder (vector generator)

  const bankSync = () => { const b = (zp[LOUT1] >> 2) & 1; pg = phys[b]; pg3 = phys[b ^ 1]; };
  const SW = v => (v ? 0x80 : 0);      // switches read as D7 = 1 when on

  // ------------------------------------------------------------------
  //  Small 6502 helpers
  // ------------------------------------------------------------------
  const COMP = a => (-a) & 0xFF;                       // two's complement
  const ASR = a => ((a & 0x80) | (a >> 1));            // CMP I,80 / ROR
  const sgnext = a => (a & 0x80 ? 0xFF : 0);
  function adcBCD(a, b, c) {                           // 6502 decimal-mode ADC
    let lo = (a & 15) + (b & 15) + c, hi = (a >> 4) + (b >> 4);
    if (lo > 9) { lo -= 10; hi++; }
    let co = 0;
    if (hi > 9) { hi -= 10; co = 1; }
    return [((hi << 4) | lo) & 0xFF, co];
  }

  // ------------------------------------------------------------------
  //  Vector-list helpers (VECUT)
  // ------------------------------------------------------------------
  const scaleOf = () => { const n = zp[VGSIZE] >> 4; return n >= 8 ? n - 16 : n; };
  function VGSABS(x4, y4) { V.labs(x4 * 4, y4 * 4, scaleOf()); }   // short form LABS
  function VGLABS(x, y) { V.labs(x, y, scaleOf()); }
  function VGHEX(d) { V.shape(VGMSGA[(d & 15) + 1]); }             // display a digit
  function VGCHAR(i) { V.shape(VGMSGA[i]); }                         // (Y)=index, as character number

  // ------------------------------------------------------------------
  //  RAND - random number generator (16-bit shift register)
  // ------------------------------------------------------------------
  function RAND() {
    let lo = zp[POLYL], hi = zp[POLYH];
    const c = lo >> 7;
    lo = (lo << 1) & 0xFF;
    hi = ((hi << 1) | c) & 0xFF;
    if (hi & 0x80) lo = (lo + 1) & 0xFF;
    if (lo & 2) lo ^= 1;                  // change bit 0 depending on bit 1
    if ((lo | hi) === 0) lo = (lo + 1) & 0xFF;   // beware the 0 case
    zp[POLYL] = lo; zp[POLYH] = hi;
    return lo;
  }

  // ------------------------------------------------------------------
  //  SIN / COS / ATAN
  // ------------------------------------------------------------------
  function SIN1(a) { if (a >= 0x41) a = ((a ^ 0x7F) + 1) & 0xFF; return SINCOS[a]; }
  function SIN(a) { a &= 0xFF; return (a & 0x80) ? COMP(SIN1(a & 0x7F)) : SIN1(a); }
  function COS(a) { return SIN((a + 0x40) & 0xFF); }

  function DIVIDE(a, d, cin) {           // 4-bit result divide
    let t = 0, c = cin;
    for (let i = 0; i < 4; i++) {
      let nc = t >> 7; t = ((t << 1) | c) & 0xFF; c = nc;
      nc = a >> 7; a = ((a << 1) | c) & 0xFF; c = nc;
      if (a >= d) { a = (a - d) & 0xFF; c = 1; } else c = 0;
    }
    t = ((t << 1) | c) & 0xFF;
    return t & 0x0F;
  }
  const ATANA = [0, 2, 5, 7, 10, 12, 15, 17, 19, 21, 23, 25, 26, 28, 29, 31];
  function ATAN3(a, d, cin) { return ATANA[DIVIDE(a, d, cin)]; }
  function ATAN2(x, y) {                 // x >= 0, y >= 0
    if (y === x) return 0x20;
    if (y < x) return ATAN3(y, x, 0);
    return COMP((ATAN3(x, y, 1) - 0x40) & 0xFF);   // 40-ARCTAN(X/Y)
  }
  function ATAN1(x, y) {
    if (x & 0x80) return COMP(ATAN2(COMP(x), y) ^ 0x80);   // falls through into COMP
    return ATAN2(x, y);
  }
  function ATAN(x, y) {                  // arctan(y/x), 0..FF, 40 = 90 degrees
    if (y & 0x80) return COMP(ATAN1(x, COMP(y)));
    return ATAN1(x, y);
  }

  // ------------------------------------------------------------------
  //  POINTS - add points to score (decimal), extra life every 10,000
  // ------------------------------------------------------------------
  function POINTS(x, a, c) {
    let r = adcBCD(zp[SCORE + x], a, c);
    zp[SCORE + x] = r[0];
    if (!r[1]) return;
    r = adcBCD(zp[SCORE + x + 1], 0, 1);
    zp[SCORE + x + 1] = r[0];
    if ((r[0] & 0x0F) === 0) {           // every 1000 (x10) give a new life
      zp[SND3] = 0xB0;                   // set off tone
      zp[HITS + zp[PLAYR]]++;
    }
  }

  // ------------------------------------------------------------------
  //  INIT / INIT1 / NEWSHP / RSAUCR
  // ------------------------------------------------------------------
  function INIT() {
    pg[SROCKS] = 2;                       // starting number of rocks - 2
    zp[NHITS] = io.opt.lives === 4 ? 4 : 3;
    for (let x = 4; x >= 0; x--) {
      pg[OBJ + NOBJ + x] = 0;
      pg[OBJ + NOBJ + 4 + x] = 0;
      zp[SCORE - 1 + x] = 0;              // (also clears the last initial of 10th place, as the original does)
    }
    pg[NROCKS] = 0;
  }
  function INIT1() {
    snd.EXPSND = 0; snd.THUMP = 0; snd.SCRSND = 0; snd.SCRFIR = 0;
    snd.SHPSND = 0; snd.SHPFIR = 0; snd.TONE = 0;
    zp[LEXPSND] = 0; zp[SND1] = 0; zp[SND2] = 0; zp[SND3] = 0;
  }
  function NEWSHP() {
    pg[OBJXL + SHIP] = 0; pg[OBJYL + SHIP] = 0;
    pg[XINC + SHIP] = 0; pg[YINC + SHIP] = 0;
    pg[OBJXH + SHIP] = 0x10; pg[OBJYH + SHIP] = 0x0C;   // middle of the screen
  }
  function RSAUCR() {
    pg[EDELAY] = pg[SEDLAY];
    pg[OBJ + SAUC] = 0; pg[XINC + SAUC] = 0; pg[YINC + SAUC] = 0;
  }

  // ------------------------------------------------------------------
  //  NEWVEL / NEWVE1 - new random velocity based on an old one
  // ------------------------------------------------------------------
  function NEWVE1(a) {
    if (a & 0x80) {
      if (a < 0xE1) a = 0xE1;            // -1F
      if (a >= 0xFB) return 0xFA;        // not too close to zero: -6
      return a;
    }
    if (a < 6) a = 6;
    if (a >= 0x20) a = 0x1F;
    return a;
  }
  function NEWVEL(x, y) {
    let r = RAND() & 0x8F; if (r & 0x80) r |= 0xF0;
    pg[XINC + x] = NEWVE1((r + pg[XINC + y]) & 0xFF);
    RAND(); RAND(); RAND();
    r = RAND() & 0x8F; if (r & 0x80) r |= 0xF0;
    pg[YINC + x] = NEWVE1((r + pg[YINC + y]) & 0xFF);
  }

  // ------------------------------------------------------------------
  //  NEWAST - start a new wave of asteroids
  // ------------------------------------------------------------------
  function NEWAST() {
    let x = NOBJ - 1;
    if (pg[RDELAY] === 0) {
      if (pg[OBJ + SAUC]) return;         // not while saucer is there
      pg[XINC + SAUC] = 0; pg[YINC + SAUC] = 0;
      pg[DIFCTY]++;
      if (pg[DIFCTY] >= 11) pg[DIFCTY]--;
      let a = pg[SROCKS] + 2;
      if (a >= 11) a = 11;                // leave one open picture
      pg[NROCKS] = a; pg[SROCKS] = a;
      let n = a;
      const y = NOBJ + 1;
      do {
        pg[OBJ + x] = (RAND() & 0x18) | 0x04;   // random picture, large
        NEWVEL(x, y);
        const r = RAND();
        let v = (r >> 1) & 0x1F;
        if (r & 1) {                      // start on Y axis
          if (v >= 0x18) v &= 0x17;
          pg[OBJYH + x] = v; pg[OBJXH + x] = 0; pg[OBJXL + x] = 0;
        } else {                          // start on X axis
          pg[OBJXH + x] = v; pg[OBJYH + x] = 0; pg[OBJYL + x] = 0;
        }
        x--;
      } while (--n);
      pg[EDELAY] = 0x7F;                  // saucer should wait
      pg[THUMP3] = 0x30;                  // reset thump sound
    }
    for (; x >= 0; x--) pg[OBJ + x] = 0;  // clear rest of objects
  }

  // ------------------------------------------------------------------
  //  CHKST - check for start / end of game
  // ------------------------------------------------------------------
  function CHKST2() { VGMSG(1); VGHEX(zp[PLAYR] + 1); }

  function CHKST() {
    if (zp[NPLAYR]) {
      if (zp[GDELAY]) { zp[GDELAY]--; CHKST2(); return false; }
      return CHKST1();
    }
    if (!((zp[UPDFLG] & zp[UPDFLG + 1]) & 0x80)) return false;   // updating initials
    if ((zp[CMODE] & 3) === 0) zp[CRDT] = 2;                       // free play
    else VGMSG((zp[CMODE] & 3) + 7);                               // game cost message
    // "ASTEROIDS BY ATARI"
    V.labs(380, 128, 0);
    for (const ch of ASTMSG_TEXT) V.shape(CH[ch]);
    const credits = zp[CRDT];
    if (!credits) return false;
    let x = 1;
    if (!sw.start1) {
      if (credits < 2 || !sw.start2) {
        // 40$: flash PUSH START
        if (!(zp[FRAME] & 0x20)) VGMSG(6);
        return false;
      }
      // two player start: set up player 2's page
      zp[LOUT1] |= 0x04; bankSync();
      INIT(); NEWAST(); NEWSHP();
      zp[HITS + 1] = zp[NHITS];
      x = 2;
      zp[CRDT]--;
    }
    zp[NPLAYR] = x;
    zp[CRDT]--;
    zp[LOUT1] = (zp[LOUT1] & 0xF8) ^ zp[NPLAYR]; bankSync();
    NEWSHP();
    pg[SDELAY] = 1; pg3[SDELAY] = 1;
    pg[SEDLAY] = 0x92; pg3[SEDLAY] = 0x92;      // enough for 3 large saucers
    pg3[EDELAY] = 0x92; pg[EDELAY] = 0x92;
    pg[RDELAY] = 0x7F; pg3[RDELAY] = 0x7F;
    pg[DIFCTY] = 5; pg3[DIFCTY] = 5;
    zp[UPDFLG] = 0xFF; zp[UPDFLG + 1] = 0xFF;
    zp[GDELAY] = 0x80;
    zp[PLAYR] = 0; zp[PLAYR2] = 0;
    zp[HITS] = zp[NHITS];
    zp[LTHUMP] = 4; zp[THUMP2] = 4;
    pg[THUMP3] = 0x30; pg3[THUMP3] = 0x30;
    return true;
  }

  function CHKST1() {
    if ((zp[FRAME] & 0x3F) === 0 && pg[THUMP3] !== 8) pg[THUMP3]--;   // thump speeds up
    if (zp[HITS + zp[PLAYR]] === 0) {
      if (!(pg[OBJ + NOBJ + 4] | pg[OBJ + NOBJ + 5] | pg[OBJ + NOBJ + 6] | pg[OBJ + NOBJ + 7])) {
        VGMSG(7);                                 // GAME OVER
        if (zp[NPLAYR] >= 2) CHKST2();
      }
    }
    if (pg[OBJ + SHIP]) return false;            // ship alive or exploding
    if (pg[SDELAY] !== 0x80) return false;
    pg[SDELAY] = 0x10;                           // delay before entering ship
    let x = zp[NPLAYR];
    if ((zp[HITS] | zp[HITS + 1]) === 0) {       // game is all over
      zp[LPLAYR] = x;
      zp[NPLAYR] = 0xFF;                         // flag to update high scores
      INIT1();
      zp[LOUT1] |= 0x03;
      return false;
    }
    RSAUCR();
    if (--x === 0) return false;                 // one player
    zp[GDELAY] = 0x80;
    x = zp[PLAYR] ^ 1;
    if (zp[HITS + x] === 0) return false;
    zp[PLAYR] = x;
    zp[LOUT1] ^= 0x04; bankSync();               // switch to other player's page
    zp[PLAYR2] = x << 1;
    return false;
  }

  // ------------------------------------------------------------------
  //  COLIDE - collision detector
  // ------------------------------------------------------------------
  function COLIDE() {
    let x = 7;
    while (x >= 0) {
      const o = pg[OBJ + NOBJ + x];
      if (o === 0 || (o & 0x80)) { x--; continue; }
      let y = NOBJ + 1;
      if (x < 4) { y--; if (x === 0) y--; }      // skip saucer-saucer, ship-ship
      let hit = false;
      for (; y >= 0; y--) {
        const oy = pg[OBJ + y];
        if (oy === 0 || (oy & 0x80)) continue;
        // X distance /2
        let lo = pg[OBJXL + y] - pg[OBJXL + NOBJ + x];
        let borrow = lo < 0 ? 1 : 0; lo &= 0xFF;
        let hi = (pg[OBJXH + y] - pg[OBJXH + NOBJ + x] - borrow) & 0xFF;
        let dx = ((hi & 1) << 7) | (lo >> 1);
        hi &= 0xFE;
        if (hi !== 0) { if (hi !== 0xFE) continue; dx ^= 0xFF; }
        // Y distance /2
        lo = pg[OBJYL + y] - pg[OBJYL + NOBJ + x];
        borrow = lo < 0 ? 1 : 0; lo &= 0xFF;
        hi = (pg[OBJYH + y] - pg[OBJYH + NOBJ + x] - borrow) & 0xFF;
        let dy = ((hi & 1) << 7) | (lo >> 1);
        hi &= 0xFE;
        if (hi !== 0) { if (hi !== 0xFE) continue; dy ^= 0xFF; }
        // size of target
        let r = (oy & 1) ? 42 : (oy & 2) ? 72 : 132;
        if (x === 0) r += 28;                      // the ship
        else if (x === 1) {                        // the saucer
          r += 19;
          if (pg[OBJ + SAUC] !== 1) r += 18;
        }
        if (r < dx || r < dy) continue;
        const r15 = (r + (r >> 1)) & 0xFF;         // 3/2 distance
        const sum = dx + dy;
        if (sum > 0xFF || sum >= r15) continue;    // chop off corners
        x = DSTRCT(x, y);
        hit = true;
        break;
      }
      x--;
      void hit;
    }
  }

  // ------------------------------------------------------------------
  //  CPYPOS / SEARCH / SPLIT - break a rock into fragments
  // ------------------------------------------------------------------
  function CPYPOS(x, y) {
    pg[OBJ + x] = (pg[OBJ + y] & 0x07) | (RAND() & 0x18);
    pg[OBJXL + x] = pg[OBJXL + y]; pg[OBJXH + x] = pg[OBJXH + y];
    pg[OBJYL + x] = pg[OBJYL + y]; pg[OBJYH + x] = pg[OBJYH + y];
    pg[XINC + x] = pg[XINC + y]; pg[YINC + x] = pg[YINC + y];
  }
  function SEARC1(x) { for (; x >= 0; x--) if (pg[OBJ + x] === 0) return x; return -1; }
  function SEARCH() { return SEARC1(NOBJ - 1); }

  const SPLIT_PTS = [0x10, 0x05, 0x02];   // small, medium, large (x10 when shown)
  function SPLIT(y, shooter) {
    pg[RTIMER] = 0x50;
    const pic = pg[OBJ + y] & 0x78;
    const sz = (pg[OBJ + y] & 0x07) >> 1;
    pg[OBJ + y] = sz ? (sz | pic) : 0;
    if (zp[NPLAYR] && (shooter === 0 || shooter >= 4))    // no points if saucer does it
      POINTS(zp[PLAYR2], SPLIT_PTS[sz], 0);
    if (pg[OBJ + y] === 0) return;
    let x = SEARCH();
    if (x < 0) return;
    pg[NROCKS]++;
    CPYPOS(x, y); NEWVEL(x, y);
    pg[OBJXL + x] ^= ((pg[XINC + x] & 0x1F) << 1) & 0xFF;   // prevent overlapping rocks
    x = SEARC1(x);
    if (x < 0) return;
    pg[NROCKS]++;
    CPYPOS(x, y); NEWVEL(x, y);
    pg[OBJYL + x] ^= ((pg[YINC + x] & 0x1F) << 1) & 0xFF;
  }

  // ------------------------------------------------------------------
  //  DSTRCT - destruction during collision.  Returns the new X.
  // ------------------------------------------------------------------
  function DSTRCT(x, y) {
    const explode = () => {                 // 70$
      const v = (pg[OBJ + y] & 3) ^ 2;
      zp[LEXPSND] = (((v >> 1) << 7) | ((v & 1) << 6)) | 0x3F;   // LSR/ROR/ROR: pitch in D7-D6
      pg[OBJ + y] = 0xA0;                   // timer for explosion
      pg[XINC + y] = 0; pg[YINC + y] = 0;
      return x;
    };
    const saucerHit = () => {               // 80$
      pg[EDELAY] = pg[SEDLAY];
      if (zp[NPLAYR] === 0) return explode();
      const small = pg[OBJ + SAUC] & 1;
      POINTS(zp[PLAYR2], small ? 0x99 : 0x20, small);   // 1000 or 200
      return explode();
    };
    if (x === 1) {
      if (y === NOBJ) { x = 0; y = NOBJ + 1; }          // ship hit saucer
      else {                                             // saucer hit rock
        pg[OBJ + NOBJ + x] = 0xA0; pg[XINC + NOBJ + x] = 0; pg[YINC + NOBJ + x] = 0;
        SPLIT(y, x); return explode();
      }
    }
    if (x === 0) {                          // ship hit something
      pg[SDELAY] = 0x81;
      zp[HITS + zp[PLAYR]]--;
      pg[OBJ + NOBJ] = 0xA0; pg[XINC + NOBJ] = 0; pg[YINC + NOBJ] = 0;
      if (y < NOBJ) { SPLIT(y, x); return explode(); }
      return saucerHit();
    }
    pg[OBJ + NOBJ + x] = 0;                 // clear torpedo
    if (y === NOBJ) {                       // torpedo hit ship
      zp[HITS + zp[PLAYR]]--;
      pg[SDELAY] = 0x81;
      return explode();
    }
    if (y > NOBJ) return saucerHit();       // torpedo hit saucer
    SPLIT(y, x);
    return explode();
  }

  // ------------------------------------------------------------------
  //  ENEMY / EFIRE - the flying saucer
  // ------------------------------------------------------------------
  function ENEMY() {
    if (zp[FRAME] & 3) return;               // every fourth frame
    const s = pg[OBJ + SAUC];
    if (s & 0x80) return;                    // exploding
    if (s) return EFIRE();
    if (zp[NPLAYR]) {
      const sh = pg[OBJ + SHIP];
      if (sh === 0 || (sh & 0x80)) return;   // you are not visible
    }
    if (pg[RTIMER]) pg[RTIMER]--;
    if (--pg[EDELAY] !== 0) return;          // no time yet
    pg[EDELAY] = 18;
    if (pg[RTIMER]) {
      if (pg[NROCKS] === 0) return;
      if (pg[NROCKS] >= pg[DIFCTY]) return;  // too many rocks
    }
    const a = (pg[SEDLAY] - 6) & 0xFF;
    if (a >= 0x20) pg[SEDLAY] = a;
    pg[OBJXL + SAUC] = 0; pg[OBJXH + SAUC] = 0;
    let r = RAND();
    for (let i = 0; i < 3; i++) {            // 3 bits into Y LSB
      pg[OBJYL + SAUC] = ((r & 1) << 7) | (pg[OBJYL + SAUC] >> 1);
      r >>= 1;
    }
    if (r >= 0x18) r &= 0x17;
    pg[OBJYH + SAUC] = r;                    // starting vertical position
    let xv = 0x10;
    if (!(zp[POLYH] & 0x40)) {               // start on right side
      pg[OBJXH + SAUC] = 0x1F; pg[OBJXL + SAUC] = 0xFF; xv = 0xF0;
    }
    pg[XINC + SAUC] = xv;
    let size = 2;                            // large
    if (!(pg[SEDLAY] & 0x80)) {
      if (zp[SCORE + zp[PLAYR2] + 1] >= 0x30) size = 1;   // keep small saucer
      else {
        const t = RAND();
        if ((pg[SEDLAY] >> 1) < t) size = 1;
      }
    }
    pg[OBJ + SAUC] = size;
  }

  const SAUCER_VY = [0xF0, 0, 0, 0x10];
  function EFIRE() {
    if (((zp[FRAME] << 1) & 0xFF) === 0) pg[YINC + SAUC] = SAUCER_VY[RAND() & 3];   // change direction
    if (zp[NPLAYR] && pg[SDELAY]) return;    // don't fire if you are dead
    if (--pg[EDELAY] !== 0) return;
    pg[EDELAY] = 10;
    let ang;
    if (pg[OBJ + SAUC] >> 1) ang = RAND();   // large saucer: random direction
    else {                                   // small saucer: aim at ship
      let t = ASR(pg[XINC + SAUC]);
      let lo = pg[OBJXL + SHIP] - pg[OBJXL + SAUC], b = lo < 0 ? 1 : 0; lo &= 0xFF;
      let hi = (pg[OBJXH + SHIP] - pg[OBJXH + SAUC] - b) & 0xFF;
      const X = ((((hi << 2) | (lo >> 6)) & 0xFF) - t) & 0xFF;
      t = ASR(pg[YINC + SAUC]);
      lo = pg[OBJYL + SHIP] - pg[OBJYL + SAUC]; b = lo < 0 ? 1 : 0; lo &= 0xFF;
      hi = (pg[OBJYH + SHIP] - pg[OBJYH + SAUC] - b) & 0xFF;
      const Y = ((((hi << 2) | (lo >> 6)) & 0xFF) - t) & 0xFF;
      zp[ANGLE + 1] = ATAN(X, Y);
      let r = RAND();
      const lim = zp[SCORE + zp[PLAYR2] + 1] >= 0x35 ? 1 : 0;   // "real good" after 35,000
      r &= [0x8F, 0x87][lim];
      if (r & 0x80) r |= [0x70, 0x78][lim];
      ang = (r + zp[ANGLE + 1] + lim) & 0xFF;                   // don't be too good - just close
    }
    zp[ANGLE + 1] = ang;
    FIRE1(3, 1, 1);
  }

  // ------------------------------------------------------------------
  //  FIRE - fire ship's torpedoes
  // ------------------------------------------------------------------
  function FIRE() {
    if (!zp[NPLAYR]) return;
    zp[LASTSW] = SW(sw.fire) | (zp[LASTSW] >> 1);      // ASL FIRESW / ROR LASTSW
    if (!(zp[LASTSW] & 0x80)) return;                  // not on
    if (zp[LASTSW] & 0x40) return;                     // not off before
    if (pg[SDELAY]) return;                            // ship not visible yet
    FIRE1(7, 0, 3);
  }
  function FIRE1(y, x, stop) {
    for (; y !== stop; y--) if (pg[OBJ + NOBJ + y] === 0) return FIRE3(y, x);
  }
  function FIRE3(y, x) {
    pg[OBJ + NOBJ + y] = 0x12;                         // length of life
    const cx = ASR(COS(zp[ANGLE + x]));
    let a = (cx + pg[XINC + NOBJ + x]) & 0xFF;
    if (a & 0x80) { if (a < 0x91) a = 0x91; } else if (a >= 0x70) a = 0x6F;
    pg[XINC + NOBJ + y] = a;
    const cy = ASR(SIN(zp[ANGLE + x]));
    a = (cy + pg[YINC + NOBJ + x]) & 0xFF;
    if (a & 0x80) { if (a < 0x91) a = 0x91; } else if (a >= 0x70) a = 0x6F;
    pg[YINC + NOBJ + y] = a;
    // start at the nose: position + 3/2 * (cos/2)
    let off = (ASR(cx) + cx) & 0xFF;
    let lo = off + pg[OBJXL + NOBJ + x];
    pg[OBJXL + NOBJ + y] = lo & 0xFF;
    pg[OBJXH + NOBJ + y] = (sgnext(cx) + pg[OBJXH + NOBJ + x] + (lo >> 8)) & 0xFF;
    off = (ASR(cy) + cy) & 0xFF;
    lo = off + pg[OBJYL + NOBJ + x];
    pg[OBJYL + NOBJ + y] = lo & 0xFF;
    pg[OBJYH + NOBJ + y] = (sgnext(cy) + pg[OBJYH + NOBJ + x] + (lo >> 8)) & 0xFF;
    zp[SND1 + x] = 0x80;                               // start fire sound
  }

  // ------------------------------------------------------------------
  //  HYPER - hyperspace
  // ------------------------------------------------------------------
  function HYPER() {
    if (!zp[NPLAYR]) return;
    if (pg[OBJ + SHIP] & 0x80) return;
    if (pg[SDELAY]) return;
    if (!sw.hyp) return;
    pg[OBJ + SHIP] = 0; pg[XINC + SHIP] = 0; pg[YINC + SHIP] = 0;
    pg[SDELAY] = 0x30;
    let a = RAND() & 0x1F;
    if (a >= 0x1D) a = 0x1C;
    if (a < 3) a = 3;
    pg[OBJXH + SHIP] = a;
    for (let i = 0; i < 5; i++) a = RAND();
    a &= 0x1F;
    let flag = 1;
    if (a >= 0x18) {
      a = ((a & 7) << 1) + 4;              // 4 to 18
      if (a >= pg[NROCKS]) flag = 0x80;    // flag for destruct on re-entry
    }
    if (a >= 0x15) a = 0x14;
    if (a < 3) a = 3;
    pg[OBJYH + SHIP] = a;
    zp[RENTRY] = flag;
  }

  // ------------------------------------------------------------------
  //  MOVE - rotate / thrust / friction / re-entry
  // ------------------------------------------------------------------
  function MOVE2(hi, lo) {
    if (hi & 0x80) { if (hi < 0xC1) return [0xC0, 0x01]; return [hi, lo]; }
    if (hi >= 0x40) return [0x3F, 0xFF];
    return [hi, lo];
  }
  function NEARBY() {
    for (let x = NOBJ + 1; x >= 0; x--) {
      if (pg[OBJ + x] === 0) continue;
      const dx = (pg[OBJXH + x] - pg[OBJXH + SHIP]) & 0xFF;
      if (dx >= 4 && dx < 0xFC) continue;
      const dy = (pg[OBJYH + x] - pg[OBJYH + SHIP]) & 0xFF;
      if (dy < 4 || dy >= 0xFC) { pg[SDELAY]++; return true; }
    }
    return false;
  }
  function MOVE() {
    if (!zp[NPLAYR]) return;
    if (pg[OBJ + SHIP] & 0x80) return;
    if (pg[SDELAY]) {
      if (--pg[SDELAY]) return;
      const y = zp[RENTRY];
      if (y & 0x80) {                         // blow up on re-entry
        pg[OBJ + SHIP] = 0xA0;
        zp[LEXPSND] = 0x3E;
        zp[HITS + zp[PLAYR]]--;
        pg[SDELAY] = 0x81;
      } else if (y) {
        pg[OBJ + SHIP] = 1;                   // returning from hyperspace
      } else if (!NEARBY()) {
        if (pg[OBJ + SAUC]) { pg[SDELAY] = 2; return; }
        pg[OBJ + SHIP] = 1;
      }
      zp[RENTRY] = 0;
      return;
    }
    if (sw.rotl) zp[ANGLE] += 3;
    else if (sw.rotr) zp[ANGLE] -= 3;
    if (zp[FRAME] & 1) return;                // every other frame check thrust
    if (sw.thrust) {
      snd.SHPSND = 0x80;
      let c = COS(zp[ANGLE]);
      let lo = ((c << 1) & 0xFF) + zp[XINCL];
      let hi = (sgnext(c) + pg[XINC + SHIP] + (lo >> 8)) & 0xFF;
      let r = MOVE2(hi, lo & 0xFF);
      pg[XINC + SHIP] = r[0]; zp[XINCL] = r[1];
      c = SIN(zp[ANGLE]);
      lo = ((c << 1) & 0xFF) + zp[YINCL];
      hi = (sgnext(c) + pg[YINC + SHIP] + (lo >> 8)) & 0xFF;
      r = MOVE2(hi, lo & 0xFF);
      pg[YINC + SHIP] = r[0]; zp[YINCL] = r[1];
      return;
    }
    snd.SHPSND = 0;
    const friction = (INC, INCL) => {
      if ((pg[INC + SHIP] | zp[INCL]) === 0) return;
      let a = ((pg[INC + SHIP] << 1) & 0xFF) ^ 0xFF, x, c;
      if (a & 0x80) { x = 0xFF; c = 0; } else { x = 0; c = 1; }
      const lo = a + zp[INCL] + c;
      zp[INCL] = lo & 0xFF;
      pg[INC + SHIP] = (x + pg[INC + SHIP] + (lo >> 8)) & 0xFF;
    };
    friction(XINC, XINCL);
    friction(YINC, YINCL);
  }

  // ------------------------------------------------------------------
  //  MOTION - move everything and draw it
  // ------------------------------------------------------------------
  function MOTION() {
    for (let x = NOBJ + 7; x >= 0; x--) {
      const o = pg[OBJ + x];
      if (o === 0) continue;
      if (o & 0x80) {                         // exploding
        let a, c;
        if (x === NOBJ) { a = 0; c = zp[FRAME] & 1; }        // ship: 1 every other frame
        else { a = COMP(o) >> 4; c = 1; }
        const n = (a + o + c) & 0xFF;
        if (n & 0x80) {
          pg[OBJ + x] = n;
          const scale = x === NOBJ ? 0 : ((n & 0xF0) + 0x10) & 0xFF;
          PICTUR(x, scale, pg[OBJXL + x], pg[OBJXH + x], pg[OBJYL + x], pg[OBJYH + x]);
          continue;
        }
        if (x === NOBJ) NEWSHP();
        else if (x > NOBJ) pg[EDELAY] = pg[SEDLAY];
        else if (--pg[NROCKS] === 0) pg[RDELAY] = 0x7F;
        pg[OBJ + x] = 0;
        continue;
      }
      // X position (0..1023, wraps)
      let lo = pg[XINC + x] + pg[OBJXL + x];
      pg[OBJXL + x] = lo & 0xFF;
      let hi = (sgnext(pg[XINC + x]) + pg[OBJXH + x] + (lo >> 8)) & 0xFF;
      if (hi >= 0x20) {
        hi &= 0x1F;
        if (x === NOBJ + 1) { RSAUCR(); continue; }   // saucer leaves the screen
      }
      pg[OBJXH + x] = hi;
      // Y position (0..767, wraps)
      lo = pg[YINC + x] + pg[OBJYL + x];
      pg[OBJYL + x] = lo & 0xFF;
      hi = (sgnext(pg[YINC + x]) + pg[OBJYH + x] + (lo >> 8)) & 0xFF;
      if (hi >= 0x18) hi = (hi === 0x18) ? 0 : 0x17;
      pg[OBJYH + x] = hi;
      const scale = (o & 1) ? 0xE0 : (o & 2) ? 0xF0 : 0;   // 1/4, 1/2, full size
      PICTUR(x, scale, pg[OBJXL + x], pg[OBJXH + x], pg[OBJYL + x], pg[OBJYH + x]);
    }
  }

  // ------------------------------------------------------------------
  //  PICTUR - display object picture
  // ------------------------------------------------------------------
  function PICTUR(x, scale, xl, xh, yl, yh) {
    zp[VGSIZE] = scale;
    const px = ((xh << 8) | xl) >> 3;
    const py = ((((yh + 4) & 0xFF) << 8) | yl) >> 3;   // range is 128..895
    VGLABS(px, py);
    const o = pg[OBJ + x];
    if (o & 0x80) {
      if (x === NOBJ) return SHPEXP();
      return V.shape(EXPPIC[(o & 0x0C) >> 2]);
    }
    if (x === NOBJ) return SHPPIC();
    if (x === NOBJ + 1) return V.shape(SAUCER);
    if (x > NOBJ + 1) {                      // torpedo: a dot
      V.dot(15);
      if ((zp[FRAME] & 3) === 0) pg[OBJ + x]--;   // decrement active count
      return;
    }
    V.shape(ROCKS[(o & 0x18) >> 3]);
  }

  // ------------------------------------------------------------------
  //  SHPPIC - ship picture (17 drawings mirrored into 4 quadrants)
  // ------------------------------------------------------------------
  function SHPPIC() {
    let a = zp[ANGLE], mx = 1, my = 1;
    if (a & 0x80) { my = -1; a = (0 - a) & 0xFF; }       // Y = -Y
    if ((a & 0x80) || (a & 0x40)) { mx = -1; a = (0x80 - a) & 0xFF; }   // X = -X
    const pic = SHIPS[(a >> 1) >> 1];
    V.shape(pic.body, 0, mx, my);
    if (sw.thrust && (zp[FRAME] & 4)) V.shape(pic.flame, 0, mx, my);   // flicker at 15 Hz
  }

  // ------------------------------------------------------------------
  //  SHPEXP - exploding ship pieces
  // ------------------------------------------------------------------
  function SHPEXP() {
    const o = pg[OBJ + SHIP];
    if (o < 0xA2) {                          // first explosion frames: init piece positions
      for (let x = 10; x >= 0; x -= 2) {
        zp[SHIPX + x + 1] = (((EXPDIR[x] >> 4) + 0xF8) & 0xFF) ^ 0xF8;
        zp[SHIPY + x + 1] = (((EXPDIR[x + 1] >> 4) + 0xF8) & 0xFF) ^ 0xF8;
      }
    }
    for (let x = ((o ^ 0xFF) & 0x70) >> 3; x >= 0; x -= 2) {
      const ex = EXPDIR[x], ey = EXPDIR[x + 1];
      let lo = ex + zp[SHIPX + x]; zp[SHIPX + x] = lo & 0xFF;
      zp[SHIPX + x + 1] = (sgnext(ex) + zp[SHIPX + x + 1] + (lo >> 8)) & 0xFF;
      lo = ey + zp[SHIPY + x]; zp[SHIPY + x] = lo & 0xFF;
      zp[SHIPY + x + 1] = (sgnext(ey) + zp[SHIPY + x + 1] + (lo >> 8)) & 0xFF;
      const s16 = (h, l) => { const v = (h << 8) | l; return v & 0x8000 ? v - 0x10000 : v; };
      const dx = s16(sgnext(ex), zp[SHIPX + x + 1]);
      const dy = s16(sgnext(ey), zp[SHIPY + x + 1]);
      const p = EXPSHP[x >> 1];
      V.vec(dx, dy, zp[VGBRIT] >> 4);        // VGBRIT is 0: an invisible move
      V.vec(p[0], p[1], BRITR);              // the piece
      V.vec(-p[0], -p[1], 0);
      V.vec(-dx, -dy, 0);                    // back to the middle
    }
  }

  // ------------------------------------------------------------------
  //  Text and numbers
  // ------------------------------------------------------------------
  function VGMSG(n) {
    zp[VGSIZE] = 0x10;                       // all messages are medium size
    const p = VGMSGS[n];
    VGSABS(p[0], p[1]);
    const lang = io.opt.lang & 3;
    for (const ch of MESSAGES[lang][n]) V.shape(CH[ch]);
  }

  function HEX(d) {                          // digit, with intensity change from TEMP4+2
    V.shape(VGMSGA[(d & 15) + 1], zp[TEMP4 + 2] >> 4);
  }
  function HEXZ(d, c) {                      // digit with zero suppression; returns carry
    d &= 15;
    if (c && d === 0) { VGCHAR(0); return 1; }
    HEX(d);
    return 0;
  }
  function DIGITS(addr, n, c, inten) {       // display 2n BCD digits from zero page
    zp[TEMP4 + 2] = inten;
    let cnt = n - 1, p = addr + n - 1;
    for (;;) {
      c = HEXZ(zp[p] >> 4, c);
      if (cnt === 0) c = 0;                  // display last digit (even 0)
      c = HEXZ(zp[p] & 15, c);
      p--; cnt--;
      if (cnt < 0) return c;
    }
  }

  function INITAL(y) {                       // display an initial (or underline)
    const c = zp[INITL + y];
    if (c) return VGCHAR(c);
    if ((zp[UPDFLG] & zp[UPDFLG + 1]) & 0x80) return VGCHAR(0);
    V.vec(8, 0, 7);                          // underline
    V.vec(4, 0, 0);
  }

  function LIVES(x4, n) {
    if (!n) return;
    zp[VGSIZE] = 0xE0;                       // 1/4 size picture
    VGSABS(x4, 852 >> 2);
    for (let i = 0; i < n; i++) V.shape(SHIP17);
  }

  // ------------------------------------------------------------------
  //  PARAMS - scores, lives, high score
  // ------------------------------------------------------------------
  function scoreFlash(isUp) {                // returns [show, intensityChange]
    if (!isUp) return [true, 0];
    if ((pg[OBJ + SHIP] | zp[RENTRY]) || (pg[SDELAY] & 0x80)) return [true, 0x20];
    return [!!(zp[FRAME] & 0x10), 0x20];
  }
  function PARAMS() {
    zp[VGSIZE] = 0x10;
    VGSABS(0, 0);
    VGSABS(100 >> 2, 876 >> 2);
    let [show, inten] = scoreFlash(zp[NPLAYR] === 2 && zp[PLAYR] === 0);
    if (show) { DIGITS(SCORE, 2, 1, inten); HEX(0); }
    LIVES(160 >> 2, zp[HITS]);
    zp[VGSIZE] = 0;                          // small characters
    VGSABS(480 >> 2, 876 >> 2);
    DIGITS(HSCORE, 2, 1, 0);
    VGHEX(0);
    zp[VGSIZE] = 0x10;
    VGSABS(768 >> 2, 876 >> 2);
    zp[TEMP4 + 2] = 0;
    const np = zp[NPLAYR];
    if (np === 1) return;                    // no player 2 in 1 player game
    [show, inten] = scoreFlash(np !== 0 && zp[PLAYR] !== 0);
    if (show) { DIGITS(SCORE + 2, 2, 1, inten); HEX(0); }
    LIVES(828 >> 2, zp[HITS + 1]);
  }

  // ------------------------------------------------------------------
  //  SCORES - high score table (attract mode)
  // ------------------------------------------------------------------
  function SCORES() {
    if (zp[NPLAYR]) return false;
    if (zp[FRAME + 1] & 4) return false;     // not time to display table
    if ((zp[HSCORE] | zp[HSCORE + 1]) === 0) return false;
    VGMSG(0);
    zp[VGSIZE] = 0x10;
    let ypos = 668 >> 2, ini = 0;
    for (let x = 0; x < 20; x += 2) {
      if ((zp[HSCORE + x] | zp[HSCORE + x + 1]) === 0) break;
      VGSABS(380 >> 2, ypos);
      zp[TEMP3] = adcBCD(x >> 1, 1, 0)[0];   // place number 1..10
      DIGITS(TEMP3, 1, 1, 0);
      V.dot(4);                              // a period
      VGCHAR(0);
      DIGITS(HSCORE + x, 2, 1, 0);
      VGHEX(0);
      VGCHAR(0);
      INITAL(ini); INITAL(ini + 1); INITAL(ini + 2);
      ini += 3;
      ypos = (ypos - 8) & 0xFF;
    }
    return true;
  }

  // ------------------------------------------------------------------
  //  UPDATE / GETINT - high score table and initials entry
  // ------------------------------------------------------------------
  function UPDATE() {
    if (!(zp[NPLAYR] & 0x80)) return;
    zp[FRAME + 1] = 0xFF;
    zp[UPDFLG] = 0xFF; zp[UPDFLG + 1] = 0xFF;
    for (let X = 2; X >= 0; X -= 2) {
      for (let Y = 0; Y < 20; Y += 2) {
        const hs = zp[HSCORE + Y] | (zp[HSCORE + Y + 1] << 8);
        const sc = zp[SCORE + X] | (zp[SCORE + X + 1] << 8);
        if (hs >= sc) continue;
        // new high score: make room
        const idx = (Y >> 1) + Y;            // index into initials table
        zp[UPDFLG + (X >> 1)] = idx;
        let xi = 27, yi = 18;
        while (xi !== idx) {
          zp[INITL + xi] = zp[INITL + xi - 3]; zp[INITL + xi + 1] = zp[INITL + xi - 2]; zp[INITL + xi + 2] = zp[INITL + xi - 1];
          zp[HSCORE + yi] = zp[HSCORE + yi - 2]; zp[HSCORE + yi + 1] = zp[HSCORE + yi - 1];
          yi -= 2; xi -= 3;
          if (xi === 0) break;
        }
        zp[INITL + xi] = 11;                 // start letters at A
        zp[INITL + xi + 1] = 0; zp[INITL + xi + 2] = 0;
        zp[FRAME + 1] = 0xF0;                // timeout for getting initials
        zp[HSCORE + Y + 1] = zp[SCORE + X + 1];
        zp[HSCORE + Y] = zp[SCORE + X];
        break;
      }
    }
    if (!(zp[UPDFLG + 1] & 0x80) && zp[UPDFLG + 1] >= zp[UPDFLG]) {
      let a = zp[UPDFLG + 1] + 3;            // player 1 moved player 2 down a place
      if (a >= 30) a = 0xFF;
      zp[UPDFLG + 1] = a;
    }
    zp[NPLAYR] = 0;
    zp[UPDINT] = 0;
  }

  function GETINT() {                        // returns true while entering initials
    if ((zp[UPDFLG] & zp[UPDFLG + 1]) & 0x80) return false;
    if (zp[LPLAYR] >> 1) {                   // last game was 2 player
      VGMSG(1);
      const y = (zp[UPDFLG + 1] & 0x80) ? 1 : 2;
      zp[PLAYR] = y;
      if (!(zp[FRAME] & 0x10)) VGHEX(y);
    }
    VGMSG(2); VGMSG(3); VGMSG(4); VGMSG(5);
    zp[VGSIZE] = 0x20;                       // larger characters for initials
    VGSABS(400 >> 2, 228 >> 2);
    zp[PLAYR] >>= 1;
    const p = zp[PLAYR];
    const base = zp[UPDFLG + p];
    let cur = (base + zp[UPDINT]) & 0xFF;
    INITAL(base); INITAL(base + 1); INITAL(base + 2);
    // hyperspace accepts the letter (debounced)
    zp[LASTSW] = ((zp[LASTSW] << 1) | (sw.hyp ? 1 : 0)) & 0xFF;
    if ((zp[LASTSW] & 0x1F) === 0x07) {
      zp[UPDINT]++;
      if (zp[UPDINT] >= 3) {
        zp[UPDFLG + p] = 0xFF;
        zp[UPDINT] = 0;
        zp[FRAME + 1] = 1;                   // bring up high score table next
        return true;                         // (returns with N clear, so this frame still counts as updating)
      }
      cur = (cur + 1) & 0xFF;
      zp[FRAME + 1] = 0xF0;
      zp[INITL + cur] = 11;
    }
    if (zp[FRAME + 1] === 0) { zp[UPDFLG] = 0xFF; zp[UPDFLG + 1] = 0xFF; return true; }   // timeout
    if ((zp[FRAME] & 7) === 0) {
      let d = 0;
      if (sw.rotl) d = 1; else if (sw.rotr) d = 0xFF;
      if (d) {
        let v = (d + zp[INITL + cur]) & 0xFF;
        if (v & 0x80) v = 36;                // before blank is Z
        else if (v < 11) v = (v === 1) ? 11 : 0;
        if (v >= 37) v = 0;
        zp[INITL + cur] = v;
      }
    }
    return true;
  }

  // ------------------------------------------------------------------
  //  SOUNDS
  // ------------------------------------------------------------------
  function SOUND1(x) {
    let on;
    if (zp[LSND1 + x] & 0x80) {
      const s = zp[SND1 + x];
      if (s === 0 || (s & 0x80)) on = false;   // must start a new one
      else on = (--zp[SND1 + x]) !== 0;
    } else if (zp[SND1 + x] & 0x80) { zp[SND1 + x] = 0x10; on = true; }
    else on = false;
    zp[LSND1 + x] = on ? 0x80 : 0;
    return zp[LSND1 + x];
  }
  function SOUNDS() {
    if (!zp[NPLAYR]) return;                  // attract mode is silent
    const s = pg[OBJ + SAUC];
    let on = 0;
    if (s && !(s & 0x80)) { snd.SCRSEL = s === 2 ? 0x80 : 0; on = 0x80; }
    snd.SCRSND = on;
    snd.SCRFIR = SOUND1(1);
    snd.SHPFIR = SOUND1(0);
    if (pg[OBJ + SHIP] !== 1) snd.SHPSND = 0;
    let thumpOff = true;
    const ship = pg[OBJ + SHIP];
    if (pg[NROCKS] && !(ship & 0x80) && (ship | zp[RENTRY])) {
      thumpOff = false;
      if (zp[THUMP1]) { if (--zp[THUMP1] === 0) thumpOff = true; }
      else if (--zp[THUMP2] === 0) {
        zp[THUMP1] = 4;                       // frames for sound to be on
        zp[LTHUMP] ^= 0x14;                   // turn on and change tone
        snd.THUMP = zp[LTHUMP];
      }
    }
    if (thumpOff) {
      zp[LTHUMP] &= 0x0F;
      snd.THUMP = zp[LTHUMP];
      zp[THUMP2] = pg[THUMP3];
    }
    let l = zp[LEXPSND];
    if (l & 0x3F) l--;
    zp[LEXPSND] = l;
    snd.EXPSND = l;
  }

  // ------------------------------------------------------------------
  //  START / main loop pass (one 16 ms frame)
  // ------------------------------------------------------------------
  function START() { INIT1(); INIT(); NEWAST(); }

  function powerOn() {                        // PWRON
    zp.fill(0); phys[0].fill(0); phys[1].fill(0);
    zp[UPDFLG] = 0xB0; zp[UPDFLG + 1] = 0xB0; // not getting initials
    zp[LOUT1] = 0x03; bankSync();
    setCoinMode();
    if (io.loadHighScores) io.loadHighScores(zp, HSCORE, INITL);
    START();
  }
  function setCoinMode() { zp[CMODE] = io.opt.coinage & 3; }

  // coin inserted (the COIN65 routine, simplified to the three coin modes)
  let halfCoin = 0;
  function coin() {
    const m = zp[CMODE] & 3;
    if (m === 0) return;
    let add = 0;
    if (m === 1) add = 2;
    else if (m === 2) add = 1;
    else { halfCoin ^= 1; if (!halfCoin) add = 1; }
    zp[CRDT] = Math.min(255, zp[CRDT] + add);
  }

  function frame() {
    // NMI tone for the extra-life beeps (4 NMIs per frame)
    if (zp[FRAME] & 1) zp[SND3] = Math.max(0, zp[SND3] - 4);
    zp[FRAME]++; if (zp[FRAME] === 0) zp[FRAME + 1]++;
    V.begin();
    if (CHKST()) { START(); V.abort(); return; }
    UPDATE();
    if (!GETINT()) {
      if (!SCORES()) {
        if (!zp[GDELAY]) { FIRE(); HYPER(); MOVE(); ENEMY(); }
        MOTION();
        COLIDE();
      }
    }
    PARAMS();
    SOUNDS();
    RAND();                                   // keep random numbers coming
    V.end();
    const a = pg[RDELAY];
    if (a) pg[RDELAY]--;
    if ((a | pg[NROCKS]) === 0) NEWAST();     // start new set of asteroids
    snd.TONE = (zp[SND3] && (zp[FRAME] & 4)) ? 0x80 : 0;
  }

  return {
    powerOn, frame, coin, setCoinMode,
    get zp() { return zp; }, get pg() { return pg; }, phys,
    debug: { RAND, SIN, COS, ATAN, NOBJ, consts: { HSCORE, INITL, NPLAYR, CRDT, HITS, SCORE, FRAME, OBJ, NROCKS, SDELAY } },
  };
}
