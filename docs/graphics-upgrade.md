# Graphics upgrade

This branch keeps the existing custom WebGL 1 engine and game. It is a graphics/model pass, not a replacement game or a Three.js migration.

## Run

Close any old Neon Coast local-server window before running a second copy: the existing launcher reuses a Neon Coast server on port 8765, which could otherwise serve the older folder.

On Windows, run `START_GAME.bat` from the updated folder. Python 3 is required by the existing launcher. Hard-refresh the browser after switching versions.

On macOS/Linux, run from the updated folder:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/`. Serve the game over HTTP rather than opening `index.html` directly so separate textures and GLB models can load.

## Models and geometry

- Shared human models have new torso, jaw, skull, facial detail, sleeves, hands, trousers and shoes; existing rigs and color variants remain in use. Held-weapon attachments follow the revised hands.
- Car and motorcycle wheels use rounded tire profiles, inset rims, spokes, brakes and hub detail. Rolling radii and axle orientation are preserved.
- Car shells have crease-aware smooth normals, curved roofs, beveled trim and lower-body detail. The four existing vehicle profiles, cockpit coordinates and wheel attachment points are retained.
- Palms use curved, segmented trunks and individual folded leaflets. Pines/cypresses have tiered branch silhouettes rather than stacked cones. Palm generation consumes the same 18 random samples as before so later procedural placement does not shift.
- Common ellipsoids, cylinders and tapered segments use smooth analytic normals. Buildings receive roof/parapet detail without changing their collision footprints.

## Lighting

The shader now uses linear-light material calculations, roughness/metallic response, clearcoat-style vehicle highlights, analytical sky reflections, a procedural sky, distance haze and animated water normals. Sky reflections are an approximation, not reflections of nearby cars or buildings.

A bounded directional shadow map includes nearby static geometry and queued dynamic objects. It uses nine-tap filtering, normalized RGBA8 depth packing, and receiver-plane depth correction to avoid striped self-shadowing on roads. Lower render scales use a smaller map. `?shadows=0` disables sun shadows while keeping material and sky lighting. `neonCoastGraphicsStats()` in the browser console reports shadow state and draw counts.

The missing `rotateY` helper used by night rendering and helicopter geometry is also restored. The original baseline crashed when that night-rendering path ran.

## Verification

```sh
npm install
npm test
npx playwright install chromium
node --test tests/renderer.test.cjs
# With the local HTTP server running:
node tests/browser-smoke.cjs
```

The unit suite checks geometry normals, winding, degeneracy, bounds, rig anchors, wheel dimensions, deterministic palm generation, texture-unit budget, light matrices, depth packing and the yaw helper.

The real-WebGL fixture checks clean sunlit receiver pixels at both shadow resolutions, verifies that a raised occluder still casts a shadow, and exercises the non-VAO path. The browser smoke test uses a seeded world and explicitly stepped real game frames; it checks walking, driving, the map, day/night switching and render scale, with screenshots and console/GL error collection. Set `QA_NO_VAO=1` to run the full game without the VAO extension. Set `QA_OUTPUT` to choose an evidence folder.

The historical baseline is captured with `QA_DAY_ONLY=1` because its pre-existing night-mode crash is outside a valid visual comparison. This does not count as a full baseline smoke pass.

## Scope and limits

This improves shared model families and rendering throughout the world; it does not replace every individual building, aircraft, boat or prop with a bespoke production asset. Existing landmark GLBs and the static loader's image-texture/skinning limits are unchanged. Character animation is still the game's existing procedural rig.

Software-rendered Chromium checks demonstrate rendering and interactions, not hardware FPS. Hardware GPU performance, Safari, touch controls, all missions and long-session stability need separate testing. Dynamic shadows use previous-frame transforms, so very fast movement may show slight shadow lag. There is no screen-space reflection, ray tracing, baked global illumination or ambient-occlusion pass in this change.
