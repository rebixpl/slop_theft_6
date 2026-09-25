# Graphics, architecture and interface upgrade

This branch keeps the existing custom WebGL 1 engine and game. It is not a replacement game or an engine migration. The architecture/UI runtime is committed at `25d7dfb643d6d99b1fbcb63470eba2a87e4467c6` on `graphics/visual-overhaul`; pull request #1 remains unmerged.

## Get and run the branch

From an existing clean checkout:

```sh
git fetch origin
git switch graphics/visual-overhaul
git pull --ff-only origin graphics/visual-overhaul
```

Keep any unrelated local changes; do not force-reset the checkout. Close the old Neon Coast local-server window before running a second copy: the existing launcher can reuse a server on port 8765 and otherwise serve the older folder.

On Windows, run `START_GAME.bat` from the updated folder. Python 3 is required by the existing launcher. Hard-refresh the browser after switching versions.

On macOS/Linux, run from the updated folder:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/`. Serve the game over HTTP rather than opening `index.html` directly so separate textures and GLB models can load.

## Architecture and materials

`graphics/architecture.js` supplies four deterministic coastal facade styles, recessed window panes with structural piers, storefront glazing, sign lettering, awnings, selected balconies, shutters, roof copings, air-conditioning detail and pitched-roof cottages. Generic building, high-rise tier and cottage construction now use these helpers. Collision definitions and world placement remain in the existing gameplay code.

A separate per-vertex surface attribute identifies plaster, coral plaster, stone, roof tile, brick, timber, glass, metal, canvas and signage. These surfaces no longer depend only on guessing a material from its paint color. The shader samples the existing architecture image atlas, adds limited close-range relief, and uses material-specific response. Landmark material names also select these shared surfaces.

This reuses the repository's existing texture images; it does not claim that every building has a unique hand-painted texture set. The static GLB loader still does not sample arbitrary embedded GLB image textures or import skeletal animation. Assigning the shared atlas by material name is distinct from adding general glTF texture support.

World geometry uploads in bounded batches during construction instead of retaining every expanded vertex array until the entire city is finished. The verified seeded world contains 9,610,316 static triangles across 1,857 chunks in total, not all drawn simultaneously. Hardware memory and performance profiling is still needed.

## Texture-loading correction

The tests use a real local HTTP server, not `file://`. A timing problem was reproduced: texture timeouts could expire while synchronous city construction held the main thread. Requests and their deadlines now start after that work. Already-decoded images are uploaded rather than falsely classified as timed out, and late successful loads repair fallback status without counting progress twice.

The normal HTTP integration run recorded all seven active material images loaded with nonzero dimensions and no warnings. Open Settings for the material-load count, or inspect `neonCoastMaterials()` in the browser console for protocol, image dimensions and fallback reasons.

## Interface and atlas

The main menu uses larger condensed lettering and a cream/pink coastal palette. The gameplay HUD has smaller mission and wanted displays, a compact minimap/health layout and a settings tray for utility buttons. This is an original GTA-inspired interface, not a claim to reproduce an official GTA VI HUD.

The full-screen atlas draws the actual game's roads and regions. It supports drag-panning, pointer-anchored wheel/button zoom, Fit, My Location, location search, category filters, selected destinations and real navigation waypoints. Dragging does not accidentally set a waypoint. Labels are prioritized and rejected when they would overlap or clip. Search typing does not trigger gameplay hotkeys; keyboard focus stays inside the open map and returns when it closes. Desktop and narrow-screen layouts retain the map controls and destination panel.

## Earlier model and lighting improvements retained

- Human bodies, heads, hands, clothing and shoes retain existing animation anchors and appearance variants; held-weapon attachments follow the hands.
- Vehicle wheels have rounded tire profiles, inset rims, spokes, brakes and hub detail. Shells have crease-aware normals, curved roofs and beveled trim while keeping wheel/cockpit coordinates.
- Palms have curved trunks and individual leaflets; pines/cypresses have tiered silhouettes. Palm generation keeps the original 18 random samples so later world placement is deterministic.
- Common ellipsoids, cylinders and tapered segments have analytic smooth normals.
- Linear-light material shading, roughness/metallic response, analytical sky reflections, sky/haze and animated water remain active. Sky reflections are an approximation, not reflections of nearby geometry.
- Bounded sun shadows use nine-tap filtering, normalized RGBA8 packing and receiver-plane correction. Dynamic transforms are queued from the previous frame. `?shadows=0` disables sun shadows; `neonCoastGraphicsStats()` reports their state.
- The missing `rotateY` helper used by night rendering and helicopter geometry is restored.

## Verification

Successful integration run: https://github.com/rebixpl/slop_theft_6/actions/runs/36201123071

Verified runtime commit: `25d7dfb643d6d99b1fbcb63470eba2a87e4467c6`.

- 23/23 unit tests: geometry, facade recesses/bounds/material tags, deterministic layout, bounded batching, map projection/zoom/search/label placement and texture-loading races.
- 5/5 browser fixtures: three real-WebGL shadow/fallback checks and two responsive-layout/DOM interaction checks. Layout sizes: 1280x800, 900x560 and 390x844.
- Normal HTTP game run: startup, walking, driving, map, night mode, render scale, all seven texture images, pan/zoom/search, real waypoint creation/clearing, search hotkey isolation and narrow-screen map/HUD captures passed.
- Forced non-VAO game run: daytime startup, walking, driving, map opening and scene captures passed. This run deliberately exits before the night and full atlas interaction sequence; do not describe it as a full feature-equivalent pass.
- Both game reports contain zero JavaScript/console errors and zero console warnings. Screenshot checkpoints returned no WebGL error. Both landmark GLBs loaded.

Screenshots are real Chromium/SwiftShader captures. Menu artwork is a background image, not a representation of the in-game renderer. Tests use deterministic, explicitly stepped real game frames; they are not a sustained FPS or long-session benchmark.

Reproduce with:

```sh
npm install
npm test
npx playwright install chromium
node --test tests/renderer.test.cjs tests/interface.test.cjs
# With the local HTTP server running:
node tests/browser-smoke.cjs
# Optional daytime compatibility check:
QA_NO_VAO=1 QA_DAY_ONLY=1 node tests/browser-smoke.cjs
```

Use `QA_OUTPUT` to choose the evidence folder and `QA_BROWSER` for an existing Chromium executable. The remaining Visual QA workflow is read-only.

## Limits

This improves shared model families, generic architecture and UI, not every individual building, aircraft, boat or prop as a bespoke production asset. Character animation is still procedural. Building styles still repeat. There are no new walkable interiors, screen-space reflections, ray tracing, baked global illumination or ambient-occlusion pass.

Hardware GPU FPS/memory use, Safari, full touch gameplay, all missions and long-session stability remain unverified. Responsive UI checks are not a claim that the whole game is mobile-ready. Shadow resolution aliasing and slight dynamic-shadow lag remain possible.
