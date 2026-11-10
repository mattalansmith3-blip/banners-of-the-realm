# Banners of the Realm

A turn-based medieval strategy prototype (Lords of the Realm 2 × Power: The Game). Pure static HTML/CSS/JS, no build step, no network dependencies: open `index.html` (even from `file://`) or serve the folder.

* **County economy**: taxes, grain, wages, mood, rebellions.
* **Simultaneous secret orders**: everyone plans, then everything resolves at once (animated).
* **Capture & absorb**: take a rival capital's Royal Banner and its counties and army become yours.
* **Fog of war**, scouts, feints, **castles & sieges**, **heroes**, **seasonal events**, **personality AIs** (Warlord / Builder / Schemer), up to 6 houses on a 28-county map.
* **Diplomacy**: non-aggression pacts, alliances (shared vision, free passage, fight side by side, shared grand-alliance victory), peace treaties, trade deals, tribute demands/offers and hero ransom. Envoys are free (4 a season) and ride inside the sealed orders, so hotseat and play-by-link stay deterministic. Betrayal is allowed (marching into a partner's land) and costs reputation, trust and county mood; AI lords decide by personality, strength, trust and threat.
* **Multiplayer**: hotseat (pass-the-device screen) and serverless play-by-link with hashed commit/reveal turn codes.

See *How to Play* in the game for the rules and the multiplayer walkthrough.

## Files
| file | purpose |
|---|---|
| `index.html`, `style.css` | page + styling |
| `engine.js` | game rules, map, fog, AI (pure logic, also runs in node) |
| `net.js` | SHA-256, compressed integrity codes, replay records, commit/reveal protocol |
| `ui.js` | map rendering, animation, WebAudio sounds, panels, dialogs |
| `art/` + `art/manifest.js` | optional art (`window.BANNERS_ART`); the game works without it |
| `test.js`, `test_net.js`, `e2e.py` | tests (see below) |
| `sim.js` | playtest statistics harness (`node sim.js 600 80000 out.json`): game length, win rates, pact/betrayal rates, snowball, order usage |

## Tests
```
node test.js 200      # rules + diplomacy rules + AI fog compliance + determinism + 200 full multi-AI games
node test_net.js      # 3 clients + AI play-by-link in lock-step, tamper checks
python3 e2e.py http://localhost:8765/index.html   # Playwright click-through (solo, hotseat, 2 browser contexts for link play, phone width)
```
