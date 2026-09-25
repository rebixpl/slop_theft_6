"""Build and export the Palmer House Sunport landmark.

Run from the project root with:
  blender --background --factory-startup --python assets/models/source/build_sunport_artdeco_hotel.py

Units: 1 Blender unit = 1 game meter. Blender Z-up exports to glTF Y-up;
the entrance facade is Blender -Y, which becomes game +Z. Origin is ground-center.
"""

from pathlib import Path
import json
import math
import bpy
import bmesh


if not bpy.app.background:
    raise RuntimeError("Run this asset builder in an isolated Blender background process.")

ROOT = Path(__file__).resolve().parents[3]
MODEL_DIR = ROOT / "assets" / "models"
GLB_PATH = MODEL_DIR / "sunport-artdeco-hotel.glb"
BLEND_PATH = MODEL_DIR / "source" / "sunport-artdeco-hotel.blend"
MODEL_DIR.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1.0


def collection(name, parent=None):
    result = bpy.data.collections.new(name)
    (parent or scene.collection).children.link(result)
    return result


COL_PROJECT = collection("COL_SunportArtDecoHotel")
COL_GEO = collection("COL_Geo", COL_PROJECT)
COL_COLLISION = collection("COL_Collision", COL_PROJECT)
COL_ANCHORS = collection("COL_Anchors", COL_PROJECT)


def linear_channel(channel):
    channel /= 255.0
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def hex_color(value):
    return tuple(linear_channel((value >> shift) & 255) for shift in (16, 8, 0))


def material(name, color, roughness, metallic=0.0, emission=None, strength=0.0):
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*color, 1.0)
    shader = result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    if emission is not None:
        (shader.inputs.get("Emission Color") or shader.inputs.get("Emission")).default_value = (*emission, 1.0)
        emission_strength = shader.inputs.get("Emission Strength")
        if emission_strength:
            emission_strength.default_value = strength
    return result


MAT_STUCCO = material("MAT_Stucco_Ivory", hex_color(0xE9D6B6), 0.84)
MAT_CORAL = material("MAT_Stucco_SunsetCoral", hex_color(0xC87C70), 0.79)
MAT_SEAFOAM = material("MAT_Terrazzo_Seafoam", hex_color(0x72A99F), 0.54)
MAT_GLASS = material("MAT_Glass_DeepSea", hex_color(0x244957), 0.20, 0.18)
MAT_BRASS = material("MAT_Metal_AgedBrass", hex_color(0xC7A66F), 0.36, 0.68)
MAT_ROOF = material("MAT_Roof_MidnightTeal", hex_color(0x355B5D), 0.73)
MAT_NEON = material("MAT_Emissive_WarmNeon", hex_color(0xFFD184), 0.37, 0.0,
                    hex_color(0xFFB458), 1.45)


def activate(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def move_to_collection(obj, target):
    for owner in tuple(obj.users_collection):
        owner.objects.unlink(obj)
    target.objects.link(obj)


def finish(obj, bevel=0.02):
    if bevel > 0 and min(obj.dimensions) > 0.16:
        modifier = obj.modifiers.new("Bevel_Sun_Worn_Edges", "BEVEL")
        modifier.width = min(bevel, min(obj.dimensions) * 0.22)
        modifier.segments = 1
        modifier.limit_method = "ANGLE"
        modifier.angle_limit = math.radians(30)
        activate(obj)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    move_to_collection(obj, COL_GEO)
    return obj


def cube(name, location, dimensions, mat, bevel=0.02, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    obj.rotation_euler = rotation
    activate(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.data.materials.append(mat)
    return finish(obj, bevel)


def cylinder(name, location, radius, depth, mat, rotation=(0.0, 0.0, 0.0), vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth,
                                        location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons:
        polygon.use_smooth = len(polygon.vertices) == 4
    return finish(obj, 0.012)


def text_mesh(name, body, location, size, mat):
    curve = bpy.data.curves.new(name + "_Font", "FONT")
    curve.body = body
    curve.dimensions = "3D"
    curve.fill_mode = "FULL"
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.size = size
    curve.resolution_u = 3
    curve.render_resolution_u = 3
    curve.extrude = 0.008
    curve.bevel_depth = 0.0015
    curve.bevel_resolution = 1
    obj = bpy.data.objects.new(name, curve)
    COL_GEO.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (math.pi / 2, 0.0, 0.0)
    curve.materials.append(mat)
    activate(obj)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.object
    obj.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return obj


def join_meshes(objects, name):
    activate(objects[0])
    for obj in objects:
        obj.select_set(True)
    bpy.ops.object.join()
    root = bpy.context.object
    root.name = name
    root.data.name = name + "_Mesh"
    root.location = (0.0, 0.0, 0.0)
    root.rotation_euler = (0.0, 0.0, 0.0)
    root.scale = (1.0, 1.0, 1.0)
    root["asset_units"] = "1 Blender unit = 1 game meter"
    root["front_axis"] = "-Y in Blender; +Z in game after glTF Y-up conversion"
    root["pivot"] = "ground center"
    root["collision_proxy"] = "COL_SunportArtDecoHotel in COL_Collision"
    root["triangle_budget"] = 12000
    return root


# Grounded podium, main hotel body, two set-back shoulders, tower, and stepped crown.
cube("SM_SAH_Foundation", (0, 0, 0.15), (25.2, 20.8, 0.30), MAT_ROOF, 0.065)
cube("SM_SAH_Entry_Terrace", (0, -8.8, 0.29), (20.8, 2.8, 0.18), MAT_SEAFOAM, 0.035)
cube("SM_SAH_Podium", (0, 0.15, 2.25), (23.2, 17.2, 4.20), MAT_STUCCO, 0.05)
cube("SM_SAH_Main_Block", (0, 0.15, 7.30), (23.2, 16.5, 6.00), MAT_CORAL, 0.04)
for side in (-1, 1):
    cube(f"SM_SAH_Stepback_Wing_{side}", (side * 8.15, 0.45, 11.55),
         (6.6, 13.0, 2.5), MAT_STUCCO, 0.035)
cube("SM_SAH_Central_Tower", (0, 0.35, 13.55), (14.2, 12.1, 6.0), MAT_STUCCO, 0.045)
cube("SM_SAH_Crown_Upper", (0, 0.55, 17.35), (10.2, 9.2, 1.8), MAT_CORAL, 0.04)
cube("SM_SAH_Crown_Cap", (0, 0.55, 18.43), (11.6, 10.3, 0.34), MAT_SEAFOAM, 0.045)
cube("SM_SAH_Roof_Coping", (0, 0.15, 10.42), (24.0, 17.3, 0.28), MAT_SEAFOAM, 0.035)
cube("SM_SAH_Tower_Belt", (0, 0.32, 16.45), (15.0, 12.8, 0.34), MAT_SEAFOAM, 0.04)
cube("SM_SAH_Crown_Belt", (0, 0.55, 17.92), (11.2, 10.1, 0.24), MAT_BRASS, 0.025)

# Strong vertical piers, horizontal floor lines, and repeating recessed storefront bays.
for z, width in ((4.33, 23.7), (7.42, 23.7), (10.38, 23.8), (13.00, 14.55), (16.42, 14.8)):
    y = -8.48 if width > 20 else -5.78
    cube("SM_SAH_Front_Belt_Course", (0, y, z), (width, 0.30, 0.22), MAT_SEAFOAM, 0.025)
    cube("SM_SAH_Front_Brass_Inlay", (0, y - 0.17, z - 0.11), (width - 0.35, 0.035, 0.055), MAT_BRASS, 0.008)
for x in (-10.9, -7.25, -3.62, 0, 3.62, 7.25, 10.9):
    cube("SM_SAH_Storefront_Pilaster", (x, -8.60, 2.40), (0.34, 0.38, 4.0), MAT_SEAFOAM, 0.055)
    cube("SM_SAH_Pilaster_Cap", (x, -8.76, 4.20), (0.66, 0.56, 0.22), MAT_BRASS, 0.035)

for x in (-8.95, -5.35, -1.78, 1.78, 5.35, 8.95):
    width = 2.78
    cube("SM_SAH_Ground_Floor_Glass", (x, -8.49, 2.25), (width, 0.11, 2.76), MAT_GLASS, 0.018)
    for side in (-1, 1):
        cube("SM_SAH_Ground_Window_Jamb", (x + side * (width * 0.5 + 0.055), -8.61, 2.25),
             (0.11, 0.18, 2.92), MAT_BRASS, 0.015)
    cube("SM_SAH_Ground_Window_Sill", (x, -8.66, 0.78), (width + 0.20, 0.27, 0.14), MAT_SEAFOAM, 0.018)
    cube("SM_SAH_Storefront_Mullion", (x, -8.62, 2.22), (0.065, 0.16, 2.54), MAT_BRASS, 0.008)
    cube("SM_SAH_Ground_Window_Transom", (x, -8.63, 3.31), (width, 0.16, 0.10), MAT_BRASS, 0.012)

# Deep double entry, glowing transom, and a projecting deco canopy.
cube("SM_SAH_Entry_Recess", (0, -8.62, 2.10), (2.18, 0.16, 3.45), MAT_ROOF, 0.02)
for side in (-1, 1):
    cube("SM_SAH_Entry_Door_Leaf", (side * 0.48, -8.77, 1.58), (0.90, 0.09, 2.45), MAT_GLASS, 0.012)
    cylinder("SM_SAH_Entry_Pull", (side * 0.79, -8.85, 1.57), 0.035, 0.08, MAT_BRASS,
             rotation=(math.pi / 2, 0, 0), vertices=12)
cube("SM_SAH_Entry_Transom", (0, -8.78, 3.08), (1.91, 0.10, 0.38), MAT_NEON, 0.02)
cube("SM_SAH_Entry_Canopy", (0, -9.15, 3.68), (5.8, 1.22, 0.18), MAT_SEAFOAM, 0.04)
for x in (-2.45, 2.45):
    cube("SM_SAH_Canopy_Bracket", (x, -8.98, 3.35), (0.12, 0.58, 0.72), MAT_BRASS, 0.02,
         (0, 0, math.radians(22) * (1 if x < 0 else -1)))

def front_window(x, y, z, width, height, mullion=True):
    cube("SM_SAH_Window_Reveal", (x, y + 0.09, z), (width + 0.34, 0.15, height + 0.34), MAT_ROOF, 0.015)
    cube("SM_SAH_Window_Glass", (x, y, z), (width, 0.10, height), MAT_GLASS, 0.014)
    cube("SM_SAH_Window_Head", (x, y - 0.09, z + height * 0.5 + 0.10),
         (width + 0.48, 0.21, 0.12), MAT_BRASS, 0.014)
    cube("SM_SAH_Window_Sill", (x, y - 0.10, z - height * 0.5 - 0.11),
         (width + 0.52, 0.24, 0.15), MAT_SEAFOAM, 0.018)
    for side in (-1, 1):
        cube("SM_SAH_Window_Side_Frame", (x + side * (width * 0.5 + 0.10), y - 0.035, z),
             (0.12, 0.18, height + 0.20), MAT_BRASS, 0.012)
    if mullion:
        cube("SM_SAH_Window_Mullion", (x, y - 0.07, z), (0.075, 0.10, height - 0.04), MAT_BRASS, 0.008)


for floor_z in (5.84, 8.62):
    for x in (-9.05, -5.42, -1.81, 1.81, 5.42, 9.05):
        front_window(x, -8.43, floor_z, 2.10, 1.82)
for floor_z in (11.55, 14.20):
    for x in (-5.25, -2.62, 0, 2.62, 5.25):
        front_window(x, -5.82, floor_z, 1.42, 1.94)

# Two usable-looking shallow balconies with continuous rails and slender balusters.
for x in (-5.35, 5.35):
    cube("SM_SAH_Balcony_Slab", (x, -9.02, 4.92), (3.44, 1.32, 0.18), MAT_SEAFOAM, 0.035)
    cube("SM_SAH_Balcony_Rail_Top", (x, -9.64, 5.68), (3.35, 0.075, 0.085), MAT_BRASS, 0.025)
    cube("SM_SAH_Balcony_Rail_Base", (x, -9.64, 5.12), (3.35, 0.075, 0.075), MAT_BRASS, 0.02)
    for index in range(9):
        px = x - 1.48 + index * 0.37
        cube("SM_SAH_Balcony_Baluster", (px, -9.64, 5.40), (0.055, 0.055, 0.49), MAT_BRASS, 0.012)

# Fluted tower piers, stepped crown fins, roofline lamps, and hotel signage.
for x in (-6.65, -3.33, 0, 3.33, 6.65):
    cube("SM_SAH_Tower_Fluted_Pier", (x, -5.96, 13.45), (0.22, 0.30, 5.42), MAT_SEAFOAM, 0.04)
    for z in (11.0, 15.95):
        cube("SM_SAH_Pier_Capital", (x, -6.12, z), (0.62, 0.40, 0.22), MAT_BRASS, 0.035)
for x in (-4.7, -2.35, 0, 2.35, 4.7):
    cube("SM_SAH_Crown_Fin", (x, -4.34, 17.34), (0.16, 0.28, 1.55), MAT_SEAFOAM, 0.035)
cube("SM_SAH_Hotel_Sign_Backplate", (0, -6.02, 13.1), (8.9, 0.23, 0.94), MAT_ROOF, 0.04)
cube("SM_SAH_Hotel_Sign_Border", (0, -6.18, 13.1), (8.54, 0.09, 0.72), MAT_BRASS, 0.03)
cube("SM_SAH_Hotel_Sign_Face", (0, -6.24, 13.1), (8.28, 0.06, 0.56), MAT_ROOF, 0.018)
text_mesh("SM_SAH_Palmer_House_Letters", "PALMER HOUSE", (0, -6.31, 13.1), 0.64, MAT_NEON)
for x in (-4.85, 4.85):
    cylinder("SM_SAH_Deco_Sun_Medallion", (x, -6.08, 11.14), 0.36, 0.13, MAT_BRASS,
             rotation=(math.pi / 2, 0, 0), vertices=24)
    for ray in range(8):
        angle = ray * math.pi / 8
        cube("SM_SAH_Deco_Sun_Ray", (x + math.cos(angle) * 0.52, -6.10,
             11.14 + math.sin(angle) * 0.52), (0.17, 0.09, 0.055), MAT_NEON, 0.01,
             (0, -angle, 0))

# Blade sign is visible along the sidewalk approach and fits within the approved frontage projection.
cube("SM_SAH_Blade_Sign_Bracket", (-10.6, -9.05, 4.05), (0.12, 1.50, 0.13), MAT_BRASS, 0.025)
cube("SM_SAH_Blade_Sign_Frame", (-10.6, -9.78, 4.0), (1.18, 0.18, 1.12), MAT_BRASS, 0.045)
cube("SM_SAH_Blade_Sign_Face", (-10.6, -9.90, 4.0), (0.94, 0.07, 0.88), MAT_ROOF, 0.025)
for z in (3.72, 4.0, 4.28):
    cube("SM_SAH_Blade_Sign_Neon", (-10.6, -9.96, z), (0.62, 0.04, 0.055), MAT_NEON, 0.012)
for x in (-10.4, 10.4):
    cylinder("SM_SAH_Entry_Sconce", (x, -8.92, 3.48), 0.13, 0.09, MAT_NEON,
             rotation=(math.pi / 2, 0, 0), vertices=12)

# Restrained rooftop service equipment and a simple parapet silhouette.
for x in (-4.6, 4.6):
    cube("SM_SAH_Rooftop_HVAC", (x, 1.1, 19.14), (2.0, 1.8, 1.05), MAT_ROOF, 0.04)
    for fin in range(5):
        cube("SM_SAH_HVAC_Fin", (x - 0.72 + fin * 0.36, 0.16, 19.14),
             (0.075, 0.10, 0.70), MAT_BRASS, 0.008)
for x in (-11.0, 11.0):
    cube("SM_SAH_Podium_Corner_Pilaster", (x, -8.61, 3.00), (0.30, 0.34, 2.4), MAT_CORAL, 0.035)

render_objects = [obj for obj in COL_GEO.objects if obj.type == "MESH"]
lod0 = join_meshes(render_objects, "SM_SunportArtDecoHotel_LOD0")
activate(lod0)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(island_margin=0.012, area_weight=0.0, scale_to_bounds=False)
bpy.ops.mesh.select_all(action="DESELECT")
bpy.ops.object.mode_set(mode="OBJECT")
bm = bmesh.new()
bm.from_mesh(lod0.data)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(lod0.data)
bm.free()
lod0.data.update()

anchor = bpy.data.objects.new("ANCHOR_Entry", None)
COL_ANCHORS.objects.link(anchor)
anchor.empty_display_type = "ARROWS"
anchor.empty_display_size = 0.55
anchor.location = (0.0, -10.05, 0.0)
anchor["anchor_type"] = "building_entrance"
anchor["local_game_axis"] = "Y-up, front +Z"

bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 0.0, 9.4))
collision = bpy.context.object
collision.name = "COL_SunportArtDecoHotel"
collision.dimensions = (24.1, 18.0, 18.8)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
move_to_collection(collision, COL_COLLISION)
collision.hide_render = True
collision.hide_set(True)
collision["proxy_for"] = "SM_SunportArtDecoHotel_LOD0"

lod1 = lod0.copy()
lod1.data = lod0.data.copy()
lod1.name = "SM_SunportArtDecoHotel_LOD1"
lod1.data.name = lod1.name + "_Mesh"
COL_GEO.objects.link(lod1)
decimate = lod1.modifiers.new("LOD1_Keep_Silhouette", "DECIMATE")
decimate.ratio = 0.86
activate(lod1)
bpy.ops.object.modifier_apply(modifier=decimate.name)
cleanup = bmesh.new()
cleanup.from_mesh(lod1.data)
degenerate_faces = [face for face in cleanup.faces if face.calc_area() <= 1e-10]
if degenerate_faces:
    bmesh.ops.delete(cleanup, geom=degenerate_faces, context="FACES_ONLY")
bmesh.ops.dissolve_degenerate(cleanup, edges=list(cleanup.edges), dist=1e-5)
loose_vertices = [vertex for vertex in cleanup.verts if not vertex.link_edges]
if loose_vertices:
    bmesh.ops.delete(cleanup, geom=loose_vertices, context="VERTS")
bmesh.ops.recalc_face_normals(cleanup, faces=list(cleanup.faces))
cleanup.to_mesh(lod1.data)
cleanup.free()
lod1.data.update()


def triangle_count(obj):
    return sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons)


def validate_mesh(obj, budget=12000):
    tris = triangle_count(obj)
    materials = [slot.material.name for slot in obj.material_slots if slot.material]
    check = bmesh.new()
    check.from_mesh(obj.data)
    non_manifold = sum(1 for edge in check.edges if not edge.is_manifold)
    check.free()
    used = {index for poly in obj.data.polygons for index in poly.vertices}
    unused = len(obj.data.vertices) - len(used)
    if tris > budget:
        raise RuntimeError(f"{obj.name} exceeds triangle budget: {tris} > {budget}")
    if not obj.data.uv_layers or not materials or unused or non_manifold:
        raise RuntimeError(f"{obj.name} failed UV/material/topology validation: "
                           f"uv={len(obj.data.uv_layers)}, loose={unused}, non_manifold={non_manifold}")
    if tuple(round(v, 4) for v in obj.scale) != (1.0, 1.0, 1.0):
        raise RuntimeError(f"{obj.name} has unapplied scale {tuple(obj.scale)}")
    return {"name": obj.name, "triangles": tris, "materials": materials,
            "uv_layers": len(obj.data.uv_layers), "loose_vertices": unused,
            "non_manifold_edges": non_manifold}


report = [validate_mesh(lod0), validate_mesh(lod1)]
if len({name for entry in report for name in entry["materials"]}) > 7:
    raise RuntimeError("Material budget exceeded")
bpy.ops.object.select_all(action="DESELECT")
for obj in (lod0, lod1, anchor):
    obj.select_set(True)
bpy.context.view_layer.objects.active = lod0
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
bpy.ops.export_scene.gltf(
    filepath=str(GLB_PATH), export_format="GLB", use_selection=True,
    export_yup=True, export_apply=True, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_extras=True, export_animations=False,
)
print("NEON_COAST_ASSET_REPORT=" + json.dumps({
    "asset": "SM_SunportArtDecoHotel", "units": "1 Blender unit = 1 game meter",
    "blender_up": "Z", "glTF_up": "Y", "front": "Blender -Y -> game +Z",
    "pivot": "ground center", "collision": collision.name,
    "anchor": {"name": anchor.name, "type": anchor["anchor_type"],
               "blender_position": list(anchor.location)},
    "lods": report, "glb_bytes": GLB_PATH.stat().st_size,
    "blend_bytes": BLEND_PATH.stat().st_size,
}, sort_keys=True))
