"""Build the Pink Palm Pier kiosk and export both authored LODs to GLB.

Run from the project root with:
  blender --background --factory-startup --python assets/models/source/build_pink_palm_concession.py

Units: 1 Blender unit = 1 game meter. Blender Z-up exports to glTF Y-up;
the kiosk front is Blender -Y, which becomes game +Z. Origin is ground-center.
"""

from pathlib import Path
import math
import json
import bpy
import bmesh


if not bpy.app.background:
    raise RuntimeError("Run this asset builder in an isolated Blender background process.")

ROOT = Path(__file__).resolve().parents[3]
MODEL_DIR = ROOT / "assets" / "models"
GLB_PATH = MODEL_DIR / "pink-palm-concession.glb"
BLEND_PATH = MODEL_DIR / "source" / "pink-palm-concession.blend"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1.0
scene.render.engine = "BLENDER_EEVEE"


def collection(name, parent=None):
    result = bpy.data.collections.new(name)
    (parent or scene.collection).children.link(result)
    return result


COL_PROJECT = collection("COL_PinkPalmConcession")
COL_GEO = collection("COL_Geo", COL_PROJECT)
COL_COLLISION = collection("COL_Collision", COL_PROJECT)
COL_ANCHORS = collection("COL_Anchors", COL_PROJECT)


def linear_channel(channel):
    channel = channel / 255.0
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def hex_color(value):
    return tuple(linear_channel((value >> shift) & 255) for shift in (16, 8, 0))


def material(name, color, roughness, metallic=0.0, emission=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    if emission is not None:
        color_socket = shader.inputs.get("Emission Color") or shader.inputs.get("Emission")
        strength_socket = shader.inputs.get("Emission Strength")
        if color_socket:
            color_socket.default_value = (*emission, 1.0)
        if strength_socket:
            strength_socket.default_value = emission_strength
    return mat


MAT_ENAMEL = material("MAT_Enamel_Seafoam", hex_color(0x77A99D), 0.38, 0.12)
MAT_TIMBER = material("MAT_Timber_Sunbleached", hex_color(0x9A704C), 0.73)
MAT_CORAL = material("MAT_Canvas_Coral", hex_color(0xD66E62), 0.84)
MAT_IVORY = material("MAT_Canvas_Sand", hex_color(0xE8D0A2), 0.82)
MAT_GLASS = material("MAT_Glass_SeaTint", hex_color(0x345F68), 0.22, 0.05)
MAT_METAL = material("MAT_Metal_Brushed", hex_color(0x8E9D91), 0.48, 0.64)
MAT_GLOW = material("MAT_Emissive_Menu", hex_color(0xF3C478), 0.42, 0.0,
                    hex_color(0xFFAA55), 1.65)


def activate(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def move_to_collection(obj, target):
    for owner in tuple(obj.users_collection):
        owner.objects.unlink(obj)
    target.objects.link(obj)


def bevel_and_finish(obj, width):
    if width > 0:
        bevel = obj.modifiers.new("Bevel_Soft_SunWorn_Edges", "BEVEL")
        bevel.width = min(width, min(obj.dimensions) * 0.22)
        bevel.segments = 2
        bevel.limit_method = "ANGLE"
        bevel.angle_limit = math.radians(32)
        activate(obj)
        bpy.ops.object.modifier_apply(modifier=bevel.name)
    move_to_collection(obj, COL_GEO)
    return obj


def cube(name, location, dimensions, mat, bevel=0.025, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    obj.rotation_euler = rotation
    activate(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.data.materials.append(mat)
    return bevel_and_finish(obj, bevel)


def cylinder(name, location, radius, depth, mat, rotation=(0, 0, 0), vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth,
                                        location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons:
        polygon.use_smooth = len(polygon.vertices) == 4
    return bevel_and_finish(obj, 0.012)


def text_mesh(name, body, location, size, mat, rotation=(math.pi / 2, 0, 0), extrude=0.008):
    curve = bpy.data.curves.new(name + "_Font", "FONT")
    curve.body = body
    curve.dimensions = "3D"
    curve.fill_mode = "FULL"
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.size = size
    curve.resolution_u = 3
    curve.render_resolution_u = 3
    curve.extrude = extrude
    curve.bevel_depth = 0.0015
    curve.bevel_resolution = 1
    obj = bpy.data.objects.new(name, curve)
    COL_GEO.objects.link(obj)
    obj.location = location
    obj.rotation_euler = rotation
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
    root["asset_units"] = "1 Blender unit = 1 meter"
    root["front_axis"] = "-Y in Blender; +Z in game after glTF Y-up conversion"
    root["pivot"] = "ground center"
    root["collision_proxy"] = "COL_PinkPalmConcession in COL_Collision"
    root["triangle_budget"] = 12000
    return root


# Base and shell stay inside the existing 8.9 x 5.2 m reserved footprint.
cube("SM_PPC_Foundation", (0, 0, 0.12), (8.62, 5.04, 0.24), MAT_TIMBER, 0.06)
cube("SM_PPC_Floor", (0, 0, 0.27), (8.38, 4.78, 0.08), MAT_TIMBER, 0.025)
cube("SM_PPC_Back_Wall", (0, 2.27, 1.74), (8.24, 0.18, 2.86), MAT_ENAMEL, 0.035)
for side in (-1, 1):
    cube(f"SM_PPC_Side_Wall_{side}", (side * 4.08, 0.0, 1.74),
         (0.18, 4.52, 2.86), MAT_ENAMEL, 0.035)
    cube(f"SM_PPC_Front_Pier_{side}", (side * 4.02, -2.15, 1.74),
         (0.24, 0.22, 2.86), MAT_TIMBER, 0.025)
    cube(f"SM_PPC_Window_Jamb_{side}", (side * 2.84, -2.18, 1.90),
         (0.17, 0.20, 1.85), MAT_ENAMEL, 0.018)

# Open service hatch, dark sea-glass interior, deep counter and edge trim.
cube("SM_PPC_Service_Backdrop", (0, -1.91, 2.12), (5.38, 0.12, 1.08), MAT_GLASS, 0.018)
cube("SM_PPC_Service_Sill", (0, -2.34, 1.45), (5.86, 0.66, 0.15), MAT_TIMBER, 0.035)
cube("SM_PPC_Exterior_Counter_Front", (0, -2.13, 0.88), (5.60, 0.34, 1.02), MAT_ENAMEL, 0.045)
cube("SM_PPC_Counter_Inset", (0, -2.315, 0.91), (5.16, 0.045, 0.62), MAT_TIMBER, 0.018)
cube("SM_PPC_Counter_Cap", (0, -2.19, 1.42), (5.96, 0.54, 0.16), MAT_TIMBER, 0.035)
cube("SM_PPC_Hatch_Head", (0, -2.18, 2.70), (5.96, 0.22, 0.13), MAT_TIMBER, 0.025)
for side in (-1, 1):
    cube(f"SM_PPC_Lower_Corner_Panel_{side}", (side * 3.27, -2.18, 0.94),
         (1.24, 0.18, 1.16), MAT_ENAMEL, 0.025)
    cube(f"SM_PPC_Window_Lintel_{side}", (side * 3.26, -2.19, 2.62),
         (1.36, 0.20, 0.16), MAT_TIMBER, 0.025)

# Menu boards, readable raised lettering, and small warm fixtures.
for x, label, price in [(-1.86, "FRESH CATCH", "$12"), (0.0, "FRY BASKET", "$9"), (1.86, "KEY LIME", "$6")]:
    cube("SM_PPC_Menu_Board", (x, -2.055, 2.17), (1.65, 0.11, 0.67), MAT_TIMBER, 0.025)
    cube("SM_PPC_Menu_Paper", (x, -2.12, 2.17), (1.50, 0.035, 0.55), MAT_GLASS, 0.01)
    cube("SM_PPC_Menu_Title_Line", (x, -2.145, 2.27), (1.10, 0.018, 0.035), MAT_GLOW, 0.006)
    cube("SM_PPC_Menu_Item_Line", (x, -2.145, 2.15), (0.88, 0.018, 0.022), MAT_IVORY, 0.004)
    cube("SM_PPC_Menu_Price_Line", (x, -2.145, 2.05), (0.48, 0.018, 0.028), MAT_CORAL, 0.004)
for side in (-1, 1):
    cylinder("SM_PPC_Warm_Service_Lamp", (side * 3.42, -2.34, 2.82), 0.115, 0.09,
             MAT_GLOW, rotation=(math.pi / 2, 0, 0))

# Sign band and modelled lettering. The current gameplay food interaction stays outside this facade.
cube("SM_PPC_Sign_Trim", (0, -2.24, 3.08), (7.30, 0.22, 0.57), MAT_TIMBER, 0.045)
cube("SM_PPC_Sign_Face", (0, -2.365, 3.08), (7.05, 0.045, 0.43), MAT_ENAMEL, 0.018)
text_mesh("SM_PPC_Pelican_Fry_Letters", "PELICAN FRY", (0, -2.405, 3.085), 0.39, MAT_GLOW)
for x in (-3.18, 3.18):
    cylinder("SM_PPC_Sign_Rosette", (x, -2.41, 3.08), 0.15, 0.06, MAT_CORAL,
             rotation=(math.pi / 2, 0, 0))

# Roof with restrained standing seams; the striped awning provides the street-level color break.
cube("SM_PPC_Roof_Panel", (0, 0.0, 3.26), (8.58, 4.72, 0.18), MAT_ENAMEL, 0.035)
cube("SM_PPC_Roof_Fascia_Front", (0, -2.36, 3.22), (8.52, 0.13, 0.27), MAT_TIMBER, 0.018)
cube("SM_PPC_Roof_Fascia_Rear", (0, 2.34, 3.22), (8.52, 0.13, 0.27), MAT_TIMBER, 0.018)
for index in range(25):
    x = -4.05 + index * 0.3375
    cube("SM_PPC_Roof_Standing_Seam", (x, 0.0, 3.36), (0.035, 4.42, 0.055), MAT_METAL, 0.0)
awning_rotation = (math.atan2(0.25, 0.72), 0, 0)
for index in range(13):
    x = -3.9 + index * 0.65
    stripe_mat = MAT_CORAL if index % 2 == 0 else MAT_IVORY
    cube("SM_PPC_Canvas_Awning_Stripe", (x, -2.43, 2.79), (0.63, 0.78, 0.09),
         stripe_mat, 0.012, awning_rotation)
for side in (-1, 1):
    cube("SM_PPC_Awning_Bracket", (side * 3.78, -2.48, 2.55), (0.11, 0.72, 0.10),
         MAT_METAL, 0.012, (0.0, 0.0, math.radians(32) * side))

# Side service details make both reusable color variants read as working food stalls.
for side in (-1, 1):
    x = side * 4.176
    for z in (0.70, 1.02, 1.34):
        cube("SM_PPC_Side_Vent_Slat", (x, 1.35, z), (0.035, 0.94, 0.055), MAT_TIMBER, 0.008)
    cube("SM_PPC_Side_Utility_Panel", (x, -0.70, 1.06), (0.04, 0.82, 0.88), MAT_TIMBER, 0.018)
    for y in (-0.98, -0.70, -0.42):
        cube("SM_PPC_Utility_Door_Rib", (x - side * 0.025, y, 1.06), (0.045, 0.035, 0.68), MAT_METAL, 0.006)
cube("SM_PPC_Interior_Shelf", (0, 1.82, 1.55), (5.86, 0.40, 0.11), MAT_TIMBER, 0.018)
for x in (-2.4, -1.2, 1.2, 2.4):
    cylinder("SM_PPC_Bottle", (x, 1.70, 1.87), 0.075, 0.38, MAT_CORAL, vertices=12)

render_objects = [obj for obj in COL_GEO.objects if obj.type == "MESH"]
component_costs = sorted(
    ((obj.name, sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons))
     for obj in render_objects), key=lambda item: item[1], reverse=True)
print("NEON_COAST_COMPONENT_TRIANGLES=" + json.dumps({
    "objects": len(render_objects),
    "triangles": sum(cost for _, cost in component_costs),
    "largest": component_costs[:12],
}, sort_keys=True))
topology_costs = []
for obj in render_objects:
    check = bmesh.new()
    check.from_mesh(obj.data)
    bad = sum(1 for edge in check.edges if not edge.is_manifold)
    check.free()
    if bad:
        topology_costs.append((obj.name, bad))
print("NEON_COAST_COMPONENT_TOPOLOGY=" + json.dumps(sorted(topology_costs, key=lambda item: item[1], reverse=True)[:16]))
lod0 = join_meshes(render_objects, "SM_PinkPalmConcession_LOD0")

# Smart UVs stay in the editable source and GLB even though this first renderer proof uses PBR factors.
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

# A named service anchor is separate from the mesh and exported as glTF node extras.
anchor = bpy.data.objects.new("ANCHOR_ServiceWindow", None)
COL_ANCHORS.objects.link(anchor)
anchor.empty_display_type = "ARROWS"
anchor.empty_display_size = 0.28
anchor.location = (0.0, -2.58, 1.30)
anchor["anchor_type"] = "food_interaction"
anchor["local_game_axis"] = "Y-up, front +Z"

# Collision is an editable, deliberately simple proxy and is not selected for render export.
bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 0.0, 1.76))
collision = bpy.context.object
collision.name = "COL_PinkPalmConcession"
collision.dimensions = (8.78, 5.15, 3.52)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
move_to_collection(collision, COL_COLLISION)
collision.hide_render = True
collision.hide_set(True)

# Keep a genuinely simpler distant form in the same GLB; the renderer chooses it past 56 m.
lod1 = lod0.copy()
lod1.data = lod0.data.copy()
lod1.name = "SM_PinkPalmConcession_LOD1"
lod1.data.name = lod1.name + "_Mesh"
COL_GEO.objects.link(lod1)
decimate = lod1.modifiers.new("LOD1_Keep_Silhouette", "DECIMATE")
decimate.ratio = 0.58
activate(lod1)
bpy.ops.object.modifier_apply(modifier=decimate.name)
lod1.data.update()


def triangle_count(obj):
    return sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons)


def used_vertex_count(mesh):
    return len({index for poly in mesh.polygons for index in poly.vertices})


def validate_mesh(obj, budget):
    tris = triangle_count(obj)
    material_names = [slot.material.name for slot in obj.material_slots if slot.material]
    check_mesh = bmesh.new()
    check_mesh.from_mesh(obj.data)
    non_manifold = sum(1 for edge in check_mesh.edges if not edge.is_manifold)
    check_mesh.free()
    unused = len(obj.data.vertices) - used_vertex_count(obj.data)
    if tris > budget:
        raise RuntimeError(f"{obj.name} exceeds triangle budget: {tris} > {budget}")
    if not obj.data.uv_layers:
        raise RuntimeError(f"{obj.name} has no UV map")
    if not material_names:
        raise RuntimeError(f"{obj.name} has no material slots")
    if unused:
        raise RuntimeError(f"{obj.name} has {unused} loose vertices")
    if non_manifold:
        raise RuntimeError(f"{obj.name} has {non_manifold} non-manifold edges")
    if tuple(round(v, 4) for v in obj.scale) != (1.0, 1.0, 1.0):
        raise RuntimeError(f"{obj.name} has unapplied scale {tuple(obj.scale)}")
    return {"name": obj.name, "triangles": tris, "materials": material_names,
            "uv_layers": len(obj.data.uv_layers), "loose_vertices": unused,
            "non_manifold_edges": non_manifold}


report = [validate_mesh(lod0, 12000), validate_mesh(lod1, 12000)]
if len({name for entry in report for name in entry["materials"]}) > 7:
    raise RuntimeError("Material budget exceeded")

# Keep collision and interaction anchor in the editable .blend; export only visible LODs and anchor.
bpy.ops.object.select_all(action="DESELECT")
for obj in (lod0, lod1, anchor):
    obj.select_set(True)
bpy.context.view_layer.objects.active = lod0
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
bpy.ops.export_scene.gltf(
    filepath=str(GLB_PATH),
    export_format="GLB",
    use_selection=True,
    export_yup=True,
    export_apply=True,
    export_texcoords=True,
    export_normals=True,
    export_materials="EXPORT",
    export_extras=True,
    export_animations=False,
)

print("NEON_COAST_ASSET_REPORT=" + json.dumps({
    "asset": "SM_PinkPalmConcession",
    "units": "1 Blender unit = 1 game meter",
    "blender_up": "Z",
    "glTF_up": "Y",
    "front": "Blender -Y -> game +Z",
    "pivot": "ground center",
    "collision": collision.name,
    "anchor": {"name": anchor.name, "type": anchor["anchor_type"],
               "blender_position": list(anchor.location)},
    "lods": report,
    "glb_bytes": GLB_PATH.stat().st_size,
    "blend_bytes": BLEND_PATH.stat().st_size,
}, sort_keys=True))
