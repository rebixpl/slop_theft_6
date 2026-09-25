# Visual overhaul implementation plan

Goal: improve the existing game's geometry, shading and atmosphere without replacing the custom WebGL engine or changing missions, physics, collision footprints or saved-game formats.

## Implementation
1. Add dependency-free graphics geometry helpers; test finite, normalized normals, nondegenerate triangles, bounds, character soles at the existing rig's ground plane, wheel dimensions and the palm generator's exact random-number consumption.
2. Replace common primitive shading and build new human proportions, wheels and feathered palms. Smooth the existing distinct car shells and refine their trim while preserving cockpit/wheel attachment coordinates. Improve tree silhouettes and building roof detail without changing procedural layout.
3. Add linear-light material shading, inverse-transpose normals, analytical sky reflections, animated water, atmospheric sky and a bounded local directional shadow map. Keep WebGL 1's eight-sampler minimum and framebuffer fallback. Retain headlights, nighttime, imported GLB factors and all gameplay render tags.
4. Capture matched browser views and exercise walking, vehicles, day/night, maps and rendering scale. Run syntax/unit tests and an HTTP-served Chromium smoke test. Publish changes on a separate branch with an unmerged PR.

## Review risks
- Nonuniform model transforms must not distort lighting normals.
- New palm details must not advance the shared world generator's random stream.
- Static casters behind the camera must still cast shadows; avoid per-frame rebuilds of world geometry.
- Shadow/sky passes must restore program, viewport, texture, depth, blending and VAO state.
- Broad visual improvements are not a claim of replacing every individual asset with a bespoke production model.
