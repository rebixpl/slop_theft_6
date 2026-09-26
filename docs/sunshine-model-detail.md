# Clear-sun coastal lighting and sculpted model pass

Base: merged main `869f6ea9daeeea9859b0ca39b65e2aacf01a1c99`.
Branch: `graphics/sunshine-model-detail`. This pass does not change missions, save formats, road layout, UI structure or the simulation.

## Visual references and scope

The visual brief is clear, warm coastal daylight: blue sky, localized white clouds, warm highlights, darker cool shadows, varied facade color and darker glazing. It is not a full-screen pink tint. References inspected were Rockstar's official Vice City 05 (beach/daylight), Vice City 09 (street under an overpass), Vice City 06 (night lighting) and Leonida Keys 04 (turquoise water), via the [official screenshot gallery](https://www.rockstargames.com/VI/media/screenshots). The [extended-look page](https://www.rockstargames.com/VI/an-extended-look) and the user's [Leonida map reference](https://map.stateofleonida.net/) were consulted as context. This does not claim that every frame of a long gameplay video was watched, that an entire screenshot collection was reviewed, or that the community map was imported.

All new geometry is original code-authored geometry. No Rockstar models, textures, map data or UI artwork are bundled.

## What caused the pale image

The previous shader applied `1 - exp(-distance * 0.00072)` daytime haze from the camera itself, mixed it toward a bright desaturated sky and used strong ambient illumination. At 100 m that first term alone replaced about 6.95% of the surface color with haze. The updated foreground is haze-free for 80 m, then uses density 0.00018: about 0.36% at 100 m and 7.28% at 500 m. A separate 1260–1470 m fade still conceals the distant draw boundary.

The sky has darker blue radiance rather than relying on a saturation filter after tone mapping. Cumulus coverage is reduced. Direct sunlight is warmer, ambient lighting is reduced, and window interiors are darker. Skin and fabric have explicit surface IDs so the clothing does not inherit wall/glass heuristics or the emissive-sign branch. Water has a turquoise base, with the existing moving normals/reflections retained.

`NeonCoastShaders.atmosphere` exports the settings actually inserted into the shader. These are tested, not a second unused configuration.

## Vehicle modeling

The monolithic old car factory is replaced by `graphics/vehicles.js`. Roadster, muscle, coupe and sport profiles keep their original axle positions, tire radius and cockpit anchors. A sampled cross-section surface creates curved shoulders and actual wheel openings. Windscreens, rear glass, side glass and roofs are subdivided curved surfaces. Original round/strip lamp layouts, grille bars, exhaust outlets, mirrors, panel seams, sill trim, rounded seats, headrests and stitching distinguish the near-view models.

The high body meshes are about 11–13k triangles; distant bodies are about 1.5–1.9k. Near details add about 20k triangles per model, excluding lenses, glass and wheels. The existing distance selection skips these details far away and now selects the cheaper body. This is a near-view quality trade-off, not a claim that more triangles are free.

A separate rounded-cuboid generator preserves exact bounds with analytic corner normals. It is used for modeled parts rather than simply subdividing flat boxes. New shape-preserving ring interpolation refines heads/hair without changing animation attachment points.

## Architecture

Art Deco retail fronts receive semicircular arch trim with real inner reveals, rounded canopies and smooth columns. Selected coastal balconies have curved slab edges and open continuous handrails. Frames are thinner/darker; plaster retains more of the original building color. Street-scale downpipes and utility details add grounding. New curved detail is restricted to selected bays/floors rather than copied into every window.

A representative 24 x 20 x 22 m building uses approximately 5.3–7.0k triangles depending on style. The regression budget is 7.5k, up from 6.5k to account for the actual new curved features. Layout bounds and collision definitions are preserved; these are still procedural exteriors, not enterable interiors or unique production assets for every block.

## Verification commands

```sh
npm install
npm test
npx playwright install chromium
node --test tests/renderer.test.cjs tests/atmosphere.test.cjs tests/interface.test.cjs
python3 -m http.server 8765 --bind 127.0.0.1
# In a second terminal:
node tests/browser-smoke.cjs
```

The WebGL sky test renders real pixels: the prior clear-day sample was RGB 177/201/217; the revised sample was 106/157/197 in local Chromium/SwiftShader. Shadow tests still verify unoccluded flat ground, actual occluder shadows and the no-VAO path. Geometry tests cover dimensions, normals, anchors, determinism, high/low mesh cost and flat bonnet centers. Full HTTP gameplay checks and matching before/after captures are published as GitHub Actions artifacts; screenshots are not generated mockups.

Browser-plugin tools were not available. Local isolated fixtures used Chromium/Playwright under Xvfb. Full HTTP navigation was blocked in the local test environment, so full-game HTTP verification runs in the repository's GitHub Actions instead. No access workaround was used.

## Limits

This is still the existing custom WebGL 1 renderer and a procedural game, not visual parity with GTA VI. Character animation, boats, aircraft and many props retain their earlier modeling. Building styles repeat. Reflections are analytical sky approximations, not nearby geometry reflections. There is no ray tracing, screen-space reflection or baked global illumination. Hardware frame rate/memory, continuous long play, every mission and Safari are not established by deterministic software-rendered checks. Night lighting and the current menu/map are retained rather than redesigned again.

After checkout, close any old game server before launching `START_GAME.bat`; otherwise the old server may serve a different folder. Hard-refresh after switching branches.
