# Banners of the Realm (browser prototype)

Open `index.html` (works from file://, no server or network needed), or `python3 -m http.server 8765`.

- `engine.js` pure game logic (map, orders, resolution generator, economy, AI)
- `ui.js`, `style.css`, `index.html` SVG map + panels
- `test.js` headless tests: `node test.js [games]` simulates AI-vs-AI games and checks invariants
- `e2e.py` optional Playwright click-through of the real UI
