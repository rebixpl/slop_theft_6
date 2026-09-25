# Static environment models

Neon Coast keeps its custom WebGL renderer. `asset-loader.js` adds a deliberately small glTF 2.0 GLB path for static environment assets; it does not replace or wrap the renderer.

## Pink Palm Pier concession

`pink-palm-concession.glb` is an original Pelican Fry kiosk placed in the two existing Pink Palm boardwalk stall slots. It is authored at 1 Blender unit per game meter, uses a ground-center pivot, faces local +Z in the game, has seven named PBR material groups, UVs, and an `ANCHOR_ServiceWindow` node. Its 8.62 m × 5.04 m footprint stays within the reserved 8.9 m × 5.2 m slot. The editable `COL_PinkPalmConcession` collision proxy is retained in the Blender source; gameplay uses the existing tagged stall collider so layout checks and the Pelican Fry interaction remain unchanged.

Two render LOD nodes ship in the GLB. The game uses LOD0 inside 56 m and LOD1 farther away. The current renderer consumes material base colors, roughness, metallic, and emissive factors with a lightweight directional/specular pass. The source GLB retains UVs and PBR values; this static loader does not yet sample GLB image textures.

## Sunport Art Deco hotel

`sunport-artdeco-hotel.glb` is the Palmer House landmark in a reserved central Sunport block. Its 26 m class facade uses stepped Art Deco massing, recessed sea-glass storefronts, brass trim, balconies, a blade sign, and emissive `PALMER HOUSE` lettering. It has seven named PBR material groups, a ground-center pivot, UVs, and `ANCHOR_Entry`. The editable `COL_SunportArtDecoHotel` proxy is retained in the Blender source; gameplay keeps a tagged building collider at the same reserved footprint.

The GLB ships LOD0 (9,956 triangles) and LOD1 (8,562 triangles); gameplay switches at 110 m. Blender 5.0 builds the model from reproducible geometry with applied transforms and documented dimensions. The game keeps its custom WebGL renderer and uses the existing static GLB loader: material factors and emissive color render in game, while image textures, skeletal animation, and collision import remain outside that loader's scope. A procedural facade remains visible if the GLB cannot load.

Regenerate with:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.0\blender.exe' --background --factory-startup --python assets/models/source/build_sunport_artdeco_hotel.py
```

## Regenerate

With Blender 5.0 installed, run from the project root:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.0\blender.exe' --background --factory-startup --python assets/models/source/build_pink_palm_concession.py
```

The script saves `source/pink-palm-concession.blend`, exports the self-contained `pink-palm-concession.glb`, and stops before export if either LOD exceeds 12,000 triangles or lacks UVs/materials, has loose vertices, non-manifold edges, or unapplied scale.

## GLB loader scope

`asset-loader.js` supports self-contained GLB 2.0 files with static triangle meshes, scene-node transforms, normals, optional vertex colors, material PBR factors, and named anchor extras. It rejects external buffers, animation/skinning, morph targets, Draco compression, sparse accessors, and non-triangle primitive modes. Image-texture sampling and collision import are not implemented.
