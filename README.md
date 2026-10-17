# Asteroids (1979) — browser port

A JavaScript port of Atari's 1979 *Asteroids*, translated routine by routine from Ed Logg's original 6502 source (historicalsource/asteroids). Private personal project — the game and its source belong to Atari.

**Play:** open `index.html` in a browser. It's one self-contained file and works offline.

| | Keyboard | Controller |
|---|---|---|
| Rotate | ← → / A D | D-pad, left stick |
| Thrust | ↑ / W | B, RT, RB, D-pad up |
| Fire | Space, Ctrl, K | A, X |
| Hyperspace | ↓, S, Shift, L | Y, LB, LT, D-pad down |
| Coin | 5 or C | Back / Select |
| Start | 1 (one player), 2 (two players) | Start (1P), stick click (2P) |
| Pause / mute / options | P or Esc / M / O | |

## How it's built

- `src/game.js` — the game logic. Same routine names as the original (MOTION, COLIDE, SPLIT, ENEMY, EFIRE, HYPER, MOVE, …), same RAM layout including the player-page bank switch, and byte arithmetic with the original carries and wrap-arounds, so it plays like the 6502 code, quirks included.
- `src/data.js` — ship, rock, saucer, explosion and character shapes, sine table and messages (all four languages), transcribed from the vector ROM source.
- `src/main.js` — draws the vector list on a canvas the way the Digital Vector Generator scales it, at the board's 61.5 Hz frame rate.
- `src/synth.js` — recreates the board's analogue sounds in Web Audio, using the circuit figures from MAME's discrete sound model. The thump pitches are an estimate.
- `node build.js` puts everything into `index.html`. `node test/sim.js` runs the game headless as a smoke test.

Differences from the arcade board: high scores are saved in the browser, and there is no self-test mode.
