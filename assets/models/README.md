# Static environment models

Neon Coast keeps its custom WebGL renderer. `asset-loader.js` adds a deliberately small glTF 2.0 GLB path for static environment assets; it does not replace or wrap the renderer.

## Pink Palm Pier concession

`pink-palm-concession.glb` is an original Pelican Fry kiosk placed in the two existing Pink Palm boardwalk stall slots. It is authored at 1 Blender unit per game meter, uses a ground-center pivot, faces local +Z in the game, has seven named PBR material groups, UVs, and an `ANCHOR_ServiceWindow` node. Its 8.62 m × 5.04 m footprint stays within the reserved 8.9 m × 5.2 m slot. The editable `COL_PinkPalmConcession` collision proxy is retained in the Blender source; gameplay uses the existing tagged stall collider so layout checks and the Pelican Fry interaction remain unchanged.

Two render LOD nodes ship in the GLB. The game uses LOD0 inside 56 m and LOD1 farther away. The current renderer consumes material base colors, roughness, metallic, and emissive factors with a lightweight directional/specular pass. The source GLB retains UVs and PBR values; this static loader does not yet sample GLB image textures.

## Regenerate

With Blender 5.0 installed, run from the project root:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.0\blender.exe' --background --factory-startup --python assets/models/source/build_pink_palm_concession.py
```

The script saves `source/pink-palm-concession.blend`, exports the self-contained `pink-palm-concession.glb`, and stops before export if either LOD exceeds 12,000 triangles or lacks UVs/materials, has loose vertices, non-manifold edges, or unapplied scale.

## GLB loader scope

`asset-loader.js` supports self-contained GLB 2.0 files with static triangle meshes, scene-node transforms, normals, optional vertex colors, material PBR factors, and named anchor extras. It rejects external buffers, animation/skinning, morph targets, Draco compression, sparse accessors, and non-triangle primitive modes. Image-texture sampling and collision import are not implemented.
