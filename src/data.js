// =====================================================================
//  DATA - transcribed from ASTVEC (A35127.XX) and VECAN (VECAN.XX)
//  Every shape is a list of vectors [dx, dy, z] exactly as written in
//  the original VCTR / SVCTR macros: dx,dy in vector-generator units,
//  z = beam intensity 0..15 (0 = invisible move).
// =====================================================================

const BRITE = 7;            // .BRITE  (normal brightness)
const BRITR = BRITE + 5;    // .BRITR  (ship / saucer brightness = 12)

// Helper: flat [dx,dy,z, dx,dy,z, ...] -> [[dx,dy,z], ...]
function vecs(flat) {
  const out = [];
  for (let i = 0; i < flat.length; i += 3) out.push([flat[i], flat[i + 1], flat[i + 2]]);
  return out;
}

const R = BRITR, R1 = BRITR - 1;

// SHIP0..SHIP16: ship pointing at 0..90 degrees in 17 steps.
// The game mirrors these for the other three quadrants (see SHPPIC).
// Each has the ship picture, then (after an RTSL) the flame picture.
const SHIPS = [
  { body: vecs([-24,-16,0,  0,32,R,  -16,16,R1,  96,-32,R,  -96,-32,R,  16,16,R1]), flame: vecs([-32,16,R, 32,16,R]) },
  { body: vecs([-22,-18,0,  -3,32,R, -17,14,R,   99,-22,R,  -92,-41,R,  14,17,R]),  flame: vecs([-33,13,R, 30,19,R]) },
  { body: vecs([-20,-20,0,  -6,31,R, -19,13,R,  100,-13,R,  -88,-50,R,  13,19,R]),  flame: vecs([-35,9,R,  28,22,R]) },
  { body: vecs([-18,-22,0,  -9,31,R, -20,11,R,  101,-3,R,   -83,-58,R,  11,20,R]),  flame: vecs([-35,6,R,  26,25,R]) },
  { body: vecs([-16,-24,0, -12,30,R, -21,9,R,   101,7,R,    -76,-66,R,  9,21,R]),   flame: vecs([-36,3,R,  23,27,R]) },
  { body: vecs([-14,-25,0, -15,28,R, -22,7,R,   100,17,R,   -70,-73,R,  7,22,R]),   flame: vecs([-36,-1,R, 21,29,R]) },
  { body: vecs([-11,-27,0, -18,27,R, -22,4,R,    98,27,R,   -62,-80,R,  4,22,R]),   flame: vecs([-35,-4,R, 18,31,R]) },
  { body: vecs([-8,-28,0,  -20,25,R, -23,2,R,    95,36,R,   -54,-86,R,  2,23,R]),   flame: vecs([-35,-8,R, 15,33,R]) },
  { body: vecs([-6,-28,0,  -23,23,R, -23,0,R,    91,45,R,   -45,-91,R,  0,23,R]),   flame: vecs([-34,-11,R, 11,34,R]) },
  { body: vecs([-3,-29,0,  -25,20,R, -23,-2,R,   86,54,R,   -36,-95,R, -2,23,R]),   flame: vecs([-33,-15,R, 8,35,R]) },
  { body: vecs([0,-29,0,   -27,18,R, -22,-4,R,   80,62,R,   -27,-98,R, -4,22,R]),   flame: vecs([-31,-18,R, 4,35,R]) },
  { body: vecs([3,-29,0,   -28,15,R, -22,-7,R,   73,70,R,  -17,-100,R, -7,22,R]),   flame: vecs([-29,-21,R, 1,36,R]) },
  { body: vecs([6,-28,0,   -30,12,R, -21,-9,R,   66,76,R,   -7,-101,R, -9,21,R]),   flame: vecs([-27,-23,R, -3,36,R]) },
  { body: vecs([8,-28,0,   -31,9,R,  -20,-11,R,  58,83,R,    3,-101,R, -11,20,R]),  flame: vecs([-25,-26,R, -6,35,R]) },
  { body: vecs([11,-27,0,  -31,6,R,  -19,-13,R,  50,88,R,   13,-100,R, -13,19,R]),  flame: vecs([-22,-28,R, -9,35,R]) },
  { body: vecs([14,-25,0,  -32,3,R,  -17,-14,R,  41,92,R,    22,-99,R, -14,17,R]),  flame: vecs([-19,-30,R, -13,33,R]) },
  { body: vecs([16,-24,0,  -32,0,R,  -16,-16,R,  32,96,R,    32,-96,R, -16,16,R]),  flame: vecs([-16,-32,R, -16,32,R]) },
];

// SHIP17: small ship used to show lives remaining (ends with a move to the next slot)
const SHIP17 = vecs([-16,-24,0, 32,0,BRITE, 16,-16,BRITE, -32,96,BRITE, -32,-96,BRITE, 16,16,BRITE, 80,24,0]);

const B = BRITE, B1 = BRITE + 1, Bm = BRITE - 1;
const ROCKS = [
  vecs([0,16,0, 16,16,B, 16,-16,B, -8,-16,B, 8,-16,B, -24,-16,B1, -24,0,B1, -16,16,B, 0,32,B, 16,16,B, 16,-16,B]),
  vecs([16,8,0, 16,8,B, -16,16,B, -16,-8,B, -16,8,B, -16,-16,B, 8,-16,B, -8,-16,B, 16,-16,B, 8,8,B, 24,-8,B1, 16,24,B1, -16,16,B]),
  vecs([-16,0,0, -16,-8,B, 16,-24,B, 16,24,B, 0,-24,B, 16,0,B, 16,24,B, 0,16,B, -16,24,B, -24,0,B, -24,-24,B, 16,-8,B]),
  vecs([8,0,0, 24,8,B, 0,8,Bm, -24,16,B, -24,0,B, 8,-16,Bm, -24,0,B, 0,-24,B, 16,-24,B, 24,8,B, 8,-8,Bm, 16,16,Bm, -24,16,B]),
];

const R2 = BRITR + 1;
const SAUCER = vecs([-16,8,0, 32,0,R, 24,-16,0, -80,0,R2, 24,-16,R2, 32,0,R, 24,16,R2, -24,16,R2, -8,16,R, -16,0,R, -8,-16,R, -24,-16,R2]);

// EXP16 and its 14/16, 12/16, 10/16 copies: ten dots around a centre.
// (The source lists all four tables; each is EXP16 scaled by n/16, which
//  gives exactly the integers written in the source.)
const EXP16_MOVES = [[-16,0],[-16,-16],[16,-16],[24,8],[16,-8],[0,16],[8,24],[-8,24],[-32,-8],[-24,8]];
function expPic(n) {
  const out = [];
  for (const [x, y] of EXP16_MOVES) { out.push([x * n / 16, y * n / 16, 0]); out.push([0, 0, BRITE]); }
  return out;
}
const EXPPIC = [expPic(10), expPic(12), expPic(14), expPic(16)];

// Ship explosion: six pieces and their drift directions
const EXPSHP = [[-8,-12],[4,-8],[6,2],[-8,8],[-6,2],[4,-4]];
const EXPDIR = [-40,30, 50,-20, 0,-60, 60,20, 10,70, -40,-40].map(v => v & 0xFF);

// SINCOS: sine table, 0..64 (64 = 90 degrees)
const SINCOS = [
  0,3,6,9,12,16,19,22, 25,28,31,34,37,40,43,46,
  49,51,54,57,60,63,65,68, 71,73,76,78,81,83,85,88,
  90,92,94,96,98,100,102,104, 106,107,109,111,112,113,115,116,
  117,118,120,121,122,122,123,124, 125,125,126,126,126,127,127,127,
  127,
];

// ---------------------------------------------------------------------
//  Character set (VECAN).  SVCTR x,y,z.
// ---------------------------------------------------------------------
const CH = {};
CH[' '] = vecs([12,0,0]);
CH.A = vecs([0,8,B, 4,4,B, 4,-4,B, 0,-8,B, -8,4,0, 8,0,B, 4,-4,0]);
CH.B = vecs([0,12,B, 6,0,B, 2,-2,Bm, 0,-2,Bm, -2,-2,Bm, -6,0,B, 6,0,0, 2,-2,Bm, 0,-2,Bm, -2,-2,Bm, -6,0,B, 12,0,0]);
CH.C = vecs([0,12,B, 8,0,B, -8,-12,0, 8,0,B, 4,0,0]);
CH.D = vecs([0,12,B, 4,0,B, 4,-4,B, 0,-4,B, -4,-4,B, -4,0,B, 12,0,0]);
CH.E = vecs([0,12,B, 8,0,B, -2,-6,0, -6,0,B, 0,-6,0, 8,0,B, 4,0,0]);
CH.F = vecs([0,12,B, 8,0,B, -2,-6,0, -6,0,B, 0,-6,0, 12,0,0]);
CH.G = vecs([0,12,B, 8,0,B, 0,-4,B, -4,-4,0, 4,0,B, 0,-4,B, -8,0,B, 12,0,0]);
CH.H = vecs([0,12,B, 0,-6,0, 8,0,B, 0,6,0, 0,-12,B, 4,0,0]);
CH.I = vecs([8,0,B, -4,0,0, 0,12,B, 4,0,0, -8,0,B, 12,-12,0]);
CH.J = vecs([0,4,0, 4,-4,B, 4,0,B, 0,12,B, 4,-12,0]);
CH.K = vecs([0,12,B, 6,0,0, -6,-6,B, 6,-6,B, 6,0,0]);
CH.L = vecs([0,12,0, 0,-12,B, 8,0,B, 4,0,0]);
CH.M = vecs([0,12,B, 4,-4,B, 4,4,B, 0,-12,B, 4,0,0]);
CH.N = vecs([0,12,B, 8,-12,B, 0,12,B, 4,-12,0]);
CH.O = vecs([0,12,B, 8,0,B, 0,-12,B, -8,0,B, 12,0,0]);
CH.P = vecs([0,12,B, 8,0,B, 0,-6,B, -8,0,B, 6,-6,0, 6,0,0]);
CH.Q = vecs([0,12,B, 8,0,B, 0,-8,B, -4,-4,B, -4,0,B, 4,4,0, 4,-4,B, 4,0,0]);
CH.R = vecs([0,12,B, 8,0,B, 0,-6,B, -8,0,B, 2,0,0, 6,-6,B, 4,0,0]);
CH.S = vecs([8,0,B, 0,6,B, -8,0,B, 0,6,B, 8,0,B, 4,-12,0]);
CH.T = vecs([4,0,0, 0,12,B, -4,0,0, 8,0,B, 4,-12,0]);
CH.U = vecs([0,12,0, 0,-12,B, 8,0,B, 0,12,B, 4,-12,0]);
CH.V = vecs([0,12,0, 4,-12,B, 4,12,B, 4,-12,0]);
CH.W = vecs([0,12,0, 0,-12,B, 4,4,B, 4,-4,B, 0,12,B, 4,-12,0]);
CH.X = vecs([8,12,B, -8,0,0, 8,-12,B, 4,0,0]);
CH.Y = vecs([4,0,0, 0,8,B, -4,4,B, 8,0,0, -4,-4,B, 8,-8,0]);
CH.Z = vecs([0,12,0, 8,0,B, -8,-12,B, 8,0,B, 4,0,0]);
CH['0'] = CH.O;
CH['1'] = vecs([4,0,0, 0,12,B, 8,-12,0]);
CH['2'] = vecs([0,12,0, 8,0,B, 0,-6,B, -8,0,B, 0,-6,B, 8,0,B, 4,0,0]);
CH['3'] = vecs([8,0,B, 0,12,B, -8,0,B, 0,-6,0, 8,0,B, 4,-6,0]);
CH['4'] = vecs([0,12,0, 0,-6,B, 8,0,B, 0,6,0, 0,-12,B, 4,0,0]);
CH['5'] = vecs([8,0,B, 0,6,B, -8,0,B, 0,6,B, 8,0,B, 4,-12,0]);
CH['6'] = vecs([0,6,0, 8,0,B, 0,-6,B, -8,0,B, 0,12,B, 12,-12,0]);
CH['7'] = vecs([0,12,0, 8,0,B, 0,-12,B, 4,0,0]);
CH['8'] = vecs([8,0,B, 0,12,B, -8,0,B, 0,-12,B, 0,6,0, 8,0,B, 4,-6,0]);
CH['9'] = vecs([8,0,0, 0,12,B, -8,0,B, 0,-6,B, 8,0,B, 4,-6,0]);

// VGMSGA: character table indexed 0=blank, 1..10 = 0..9, 11..36 = A..Z
const VGMSGA = [' ', '0','1','2','3','4','5','6','7','8','9',
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map(c => CH[c]);

// ---------------------------------------------------------------------
//  Messages (ASTVEC L0 and ASTMSG L1..L3), positions from VGMSGS
// ---------------------------------------------------------------------
const MESSAGES = [
  [ // L0 English
    'HIGH SCORES', 'PLAYER ', 'YOUR SCORE IS ONE OF THE TEN BEST', 'PLEASE ENTER YOUR INITIALS',
    'PUSH ROTATE TO SELECT LETTER', 'PUSH HYPERSPACE WHEN LETTER IS CORRECT', 'PUSH START',
    'GAME OVER', '1 COIN 2 PLAYS', '1 COIN 1 PLAY', '2 COINS 1 PLAY'],
  [ // L1 German
    'HOECHSTERGEBNIS', 'SPIELER ', 'IHR ERGEBNIS IST EINES DER ZEHN BESTEN', 'BITTE GEBEN SIE IHRE INITIALEN EIN',
    'ZUR BUCHSTABENWAHL ROTATE DRUECKEN', 'WENN BUCHSTABE OK HYPERSPACE DRUECKEN', 'STARTKNOEPFE DRUECKEN',
    'SPIELENDE', '1 MUENZE 2 SPIELE', '1 MUENZE 1 SPIEL', '2 MUENZEN 1 SPIEL'],
  [ // L2 French
    'MEILLEUR SCORE', 'JOUER ', 'VOTRE SCORE EST UN DES 10 MEILLEURS', 'SVP ENTREZ VOS INITIALES',
    'POUSSEZ ROTATE POUR VOS INITIALES', 'POUSSEZ HYPERSPACE QUAND LETTRE CORRECTE', 'APPUYER SUR START',
    'FIN DE PARTIE', '1 PIECE 2 JOUEURS', '1 PIECE 1 JOUEUR', '2 PIECES 1 JOUEUR'],
  [ // L3 Spanish
    'RECORDS', 'JUGADOR ', 'SU PUNTAJE ESTA ENTRE LOS DIEZ MEJORES', 'POR FAVOR ENTRE SUS INICIALES',
    'OPRIMA ROTATE PARA SELECCIONAR LA LETRA', 'OPRIMA HYPERSPACE', 'PULSAR START',
    'JUEGO TERMINADO', '1 FICHA 2 JUEGOS', '1 FICHA 1 JUEGO', '2 FICHAS 1 JUEGO'],
];
// VGMSGS: (x/4, y/4) start position of each message
const VGMSGS = [[400,728],[400,728],[50,680],[50,648],[50,616],[50,584],[400,792],[400,628],[320,228],[320,228],[320,228]]
  .map(([x, y]) => [x >> 2, y >> 2]);
// ASTMSG: LABS 380,128 at size 0, "ASTEROIDS BY ATARI"
const ASTMSG_TEXT = 'ASTEROIDS BY ATARI';
