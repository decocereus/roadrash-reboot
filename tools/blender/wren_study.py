"""Run: blender -b --python-exit-code 1 -P tools/blender/wren_study.py."""

import json
import math
import os
import sys
from pathlib import Path

import bpy
import bmesh

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import B, MI, box, finish, lathe, ring_loft, tube


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs/art/wren-400-study"
COLOURS = {
    "body": "FFF04A", "accent": "19E6FF", "dark": "231D30",
    "metal": "8F93AD", "gold": "E0AC3A", "tyre": "17141F",
    "glass": "101C30", "seat": "17141F", "light_tail": "FF2E3D",
    "light_head": "FFF7D6", "light_ind": "FF9A1F", "plate": "ECE6D8",
}


def rgb(hex_colour):
    return tuple(int(hex_colour[i:i + 2], 16) / 255 for i in (0, 2, 4))


def panel(bm, points, material):
    face = bm.faces.new([bm.verts.new(B(*point)) for point in points])
    face.material_index = MI[material]


def wheel(name, radius, width, z):
    bm = bmesh.new()
    rim = 0.205
    lathe(bm, (0, radius, z), [
        (rim, -width * 0.46), (radius * 0.94, -width * 0.5),
        (radius, 0), (radius * 0.94, width * 0.5), (rim, width * 0.46),
    ], "tyre", steps=16)
    for side in (-1, 1):
        x = side * width * 0.46
        lathe(bm, (0, radius, z), [(rim - 0.018, x), (rim, x)], "metal", steps=12)
    for a in range(3):
        angle = a * math.tau / 3
        tube(bm, [(0, radius, z),
                  (0, radius + 0.193 * math.cos(angle), z + 0.193 * math.sin(angle))],
             [(0.015, width * 0.32)], "dark", n=4, up=(1, 0, 0), cap=False)
    lathe(bm, (0, radius, z), [(0, -width * 0.53), (0.042, -width * 0.53),
                              (0.042, width * 0.53), (0, width * 0.53)],
          "metal", steps=6)
    lathe(bm, (width * 0.55, radius, z), [(0.075, 0), (0.14, 0)], "metal", steps=12)
    return finish(name, bm, angle=36)


def body():
    bm = bmesh.new()
    ring_loft(bm, [
        (-0.43, [(0, 0.91), (0.12, 0.90), (0.15, 0.80), (0, 0.74)]),
        (-0.29, [(0, 1.00), (0.17, 0.97), (0.205, 0.82), (0, 0.735)]),
        (-0.06, [(0, 0.985), (0.185, 0.945), (0.20, 0.805), (0, 0.735)]),
        (0.15, [(0, 0.85), (0.11, 0.84), (0.12, 0.77), (0, 0.735)]),
    ], "body")
    ring_loft(bm, [
        (0.12, [(0, 0.79), (0.115, 0.79), (0.115, 0.745), (0, 0.735)]),
        (0.42, [(0, 0.80), (0.145, 0.79), (0.14, 0.745), (0, 0.735)]),
        (0.62, [(0, 0.86), (0.12, 0.85), (0.125, 0.80), (0, 0.79)]),
    ], "seat")
    ring_loft(bm, [
        (0.38, [(0, 0.752), (0.145, 0.75), (0.11, 0.68), (0, 0.68)]),
        (0.66, [(0, 0.854), (0.13, 0.835), (0.11, 0.78), (0, 0.77)]),
        (0.92, [(0, 0.89), (0.065, 0.88), (0.065, 0.825), (0, 0.815)]),
    ], "body", seg_mat=lambda j: "dark" if j == 2 else "body")
    for side in (-1, 1):
        for points in [
            [(0.18, 0.918, -0.27), (0.199, 0.845, -0.25),
             (0.199, 0.835, -0.15), (0.185, 0.909, -0.17)],
            [(0.123, 0.817, 0.65), (0.071, 0.859, 0.89),
             (0.071, 0.844, 0.89), (0.123, 0.802, 0.65)],
        ]:
            panel(bm, [(side * x, y, z) for x, y, z in points], "accent")
        tube(bm, [(side * 0.09, 0.85, -0.39), (side * 0.16, 0.53, -0.08),
                  (side * 0.12, 0.70, 0.33), (side * 0.09, 0.85, -0.39)],
             [0.023], "dark", n=3, cap=False)
        tube(bm, [(side * 0.16, 0.53, -0.08), (side * 0.13, 0.32, 0.25),
                  (side * 0.12, 0.70, 0.33)], [0.022], "dark", n=3, cap=False)
        tube(bm, [(side * 0.13, 0.36, 0.16), (side * 0.13, 0.306, 0.69)],
             [(0.045, 0.025)], "metal", n=4, cap=False)
        tube(bm, [(side * 0.105, 0.293, -0.69), (side * 0.105, 0.60, -0.565)],
             [0.022], "metal", n=6, cap=False)
        tube(bm, [(side * 0.105, 0.60, -0.565), (side * 0.105, 0.96, -0.42)],
             [0.031], "gold", n=6, cap=False)
        tube(bm, [(side * 0.10, 0.95, -0.42), (side * 0.22, 0.985, -0.39),
                  (side * 0.34, 0.94, -0.355)], [0.017], "metal", n=3, cap=False)
        tube(bm, [(side * 0.25, 0.974, -0.38), (side * 0.355, 0.936, -0.35)],
             [0.023], "seat", n=6)
        tube(bm, [(side * 0.28, 0.97, -0.375), (side * 0.33, 1.105, -0.44)],
             [0.007], "dark", n=3, cap=False)
        box(bm, (side * 0.35, 1.105, -0.44), (0.10, 0.054, 0.026), "dark")
        panel(bm, [(side * (0.35 + dx), 1.105 + dy, -0.423)
                   for dx, dy in [(-0.04, -0.018), (0.04, -0.018),
                                  (0.04, 0.018), (-0.04, 0.018)]], "glass")
        tube(bm, [(side * 0.11, 0.39, 0.21), (side * 0.23, 0.39, 0.21)],
             [0.017], "metal", n=4)
    box(bm, (0, 0.47, -0.08), (0.245, 0.24, 0.30), "dark")
    for y in (0.44, 0.52, 0.60):
        box(bm, (0, y, -0.105), (0.28, 0.018, 0.26), "metal")
    lathe(bm, (0, 0.39, 0.09), [(0, -0.153), (0.092, -0.153),
                               (0.092, 0.153), (0, 0.153)], "dark", steps=10)
    tube(bm, [(-0.07, 0.52, -0.27), (-0.08, 0.24, -0.31),
              (-0.15, 0.22, 0.14), (-0.21, 0.31, 0.42)], [0.025], "metal", n=4, cap=False)
    tube(bm, [(-0.21, 0.31, 0.42), (-0.235, 0.41, 0.78)],
         [(0.057, 0.065)], "dark", n=6)
    tube(bm, [(-0.235, 0.41, 0.78), (-0.24, 0.425, 0.815)],
         [(0.047, 0.054)], "metal", n=6, cap=False)
    tube(bm, [(0, 0.80, -0.58), (0, 0.80, -0.72)], [0.108], "dark", n=12)
    tube(bm, [(0, 0.80, -0.724), (0, 0.80, -0.735)], [0.087], "light_head", n=12)
    box(bm, (0, 0.80, -0.744), (0.155, 0.014, 0.009), "dark")
    box(bm, (0, 0.95, -0.45), (0.15, 0.035, 0.10), "dark")
    box(bm, (0, 0.97, -0.455), (0.10, 0.008, 0.055), "accent")
    box(bm, (0, 0.847, 0.922), (0.105, 0.018, 0.012), "light_tail")
    ring_loft(bm, [
        (z, [(0, y), (0.063, y - 0.015), (0.063, y - 0.055), (0, y - 0.035)])
        for z, y in [(-0.94, 0.52), (-0.77, 0.62), (-0.60, 0.61), (-0.47, 0.52)]
    ], "body")
    return finish("bike_body", bm, angle=35)


def render_view(name, position, target, scale, wire=False):
    scene = bpy.context.scene
    scene.camera.location = B(*position)
    scene.camera.rotation_euler = (B(*target) - scene.camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera.data.ortho_scale = scale
    overlays = []
    if wire:
        for obj in list(scene.objects):
            if obj.type != "MESH":
                continue
            overlay = obj.copy()
            overlay.data = obj.data.copy()
            scene.collection.objects.link(overlay)
            for face in overlay.data.polygons:
                face.material_index = MI["tyre"]
            overlay.modifiers.new("Export triangles", "TRIANGULATE")
            lines = overlay.modifiers.new("Topology lines", "WIREFRAME")
            lines.thickness = 0.0015
            lines.offset = 1
            overlays.append(overlay)
    scene.render.filepath = str(OUT / f"{name}.png")
    bpy.ops.render.render(write_still=True)
    for overlay in overlays:
        mesh = overlay.data
        bpy.data.objects.remove(overlay, do_unlink=True)
        bpy.data.meshes.remove(mesh)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    objects = [body(), wheel("wheel_f", 0.293, 0.115, -0.69),
               wheel("wheel_r", 0.306, 0.16, 0.69)]
    for name, colour in COLOURS.items():
        mat = bpy.data.materials[name]
        mat.diffuse_color = (*rgb(colour), 1)
        mat.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value = (*rgb(colour), 1)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1
    for obj in objects:
        obj.select_set(True)
        obj.data.calc_loop_triangles()
    counts = {obj.name: len(obj.data.loop_triangles) for obj in objects}
    assert sum(counts.values()) <= 1200, counts
    for obj in objects:
        assert all(math.isfinite(axis) for vertex in obj.data.vertices for axis in vertex.co)
        assert all(triangle.area > 1e-10 for triangle in obj.data.loop_triangles)
    stats = {"triangles": sum(counts.values()), "parts": counts,
             "wheelbase_m": 1.38, "textures": 0,
             "purpose": "Standalone candidate; shipped bike unchanged"}
    (OUT / "metrics.json").write_text(json.dumps(stats, indent=2) + "\n")
    bpy.ops.export_scene.gltf(filepath=str(OUT / "wren-400.glb"),
                              use_selection=True, export_apply=True,
                              export_yup=True, export_texcoords=False,
                              export_cameras=False, export_lights=False)
    camera = bpy.data.objects.new("Presentation camera", bpy.data.cameras.new("Presentation camera"))
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.type = "ORTHO"
    scene.render.engine = "BLENDER_WORKBENCH"
    bpy.context.preferences.filepaths.save_version = 0
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1120
    scene.render.resolution_percentage = 100
    scene.world = bpy.data.worlds.new("Studio")
    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.studio_light = "paint.sl"
    shading.color_type = "MATERIAL"
    shading.show_shadows = True
    shading.show_cavity = True
    shading.cavity_type = "BOTH"
    shading.curvature_ridge_factor = 1.1
    shading.curvature_valley_factor = 1.1
    shading.show_object_outline = True
    shading.object_outline_color = (0.005, 0.004, 0.008)
    shading.background_type = "WORLD"
    scene.world.color = (0.025, 0.025, 0.032)
    scene.view_settings.view_transform = "Standard"
    render_view("hero", (-3.1, 1.65, -3.4), (0, 0.55, 0), 2.7)
    render_view("side", (-4, 0.9, 0), (0, 0.55, 0), 2.55)
    render_view("rear", (-2.8, 1.55, 3.4), (0, 0.55, 0), 2.65)
    render_view("topology", (-3.1, 1.65, -3.4), (0, 0.55, 0), 2.7, wire=True)
    for obj in objects:
        obj.show_wire = False
        obj.select_set(False)
    scene.camera.location = B(-3.1, 1.65, -3.4)
    scene.camera.rotation_euler = (B(0, 0.55, 0) - scene.camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera.data.ortho_scale = 2.7
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                area.spaces.active.region_3d.view_perspective = "CAMERA"
                area.spaces.active.shading.type = "SOLID"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "wren-400.blend"))
    print("WREN_METRICS", json.dumps(stats))


if __name__ == "__main__":
    main()
