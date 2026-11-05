import bpy, json, math, os, sys
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from common import ARGS
import stall_part as paint
import stalls as kit
from stall_part import Part, to_blender

OUT = ARGS[0] if ARGS else "/tmp/stalls"
ONLY = set(ARGS[1:])
DUSK_LIT = (1.1, 0.97, 0.82)
DUSK_SHADOW = (0.62, 0.5, 0.77)
KEY = (-0.15, 0.42, -0.88)
LIT_ABOVE = 0.125
GLOW_STRENGTH = 1.6
INK_LINE = "#2a0d3a"
SKY = ((0.0, "#2a0f5e"), (0.34, "#a3236f"), (0.6, "#ff4d4d"), (0.8, "#ff9a2e"), (1.0, "#ffe66b"))
WALLS = ("#c79a9e", "#d4aa94", "#b58aa4", "#dab59a", "#a68298", "#c4a4b4")
ROAD, KERB, WALK = "#75606f", "#c2aebc", "#9a8494"
ROAD_HALF, VERGE_HALF, BUILDING_FRONT = 4.0, 11.0, 12.2
STALL_X = 7.3
FOV, FOV_AT_SPEED = 48.0, 57.0
HORIZON_DOWN, BASE_DOWN, RIDER_IN_FRAME, RIDER_TOP, REAR_BEHIND = 0.34, 0.685, 0.27, 1.85, 0.75

PATCH = (
    ("stall_noodle", 1, 2.5),
    ("stall_fruit", -1, 3.5),
    ("stall_neon", 1, 9.5),
    ("stall_fabric", -1, 10.5),
    ("stall_parts", 1, 16.5),
    ("stall_food_cart", -1, 17.5),
    ("stall_fabric", 1, 24.0),
    ("stall_noodle", -1, 24.5),
    ("stall_food_cart", 1, 31.0),
    ("stall_parts", -1, 32.0),
    ("stall_fruit", 1, 37.5),
    ("stall_neon", -1, 38.5),
)
DECOR = (
    ("deco_crates", -1, 6.8, 5.6),
    ("deco_bin", 1, 6.2, 5.4),
    ("deco_stool", 1, 13.0, 5.4),
    ("deco_hanging_sign", -1, 14.0, 5.5),
    ("deco_lanterns", 1, 20.3, 5.6),
    ("deco_crates", 1, 28.0, 5.6),
    ("deco_bin", -1, 21.0, 5.4),
    ("deco_hanging_sign", 1, 34.5, 5.5),
    ("deco_lanterns", -1, 28.5, 5.6),
)
LIGHT_SPANS = ((-1, 7.0), (1, 13.0), (-1, 21.0), (1, 27.5), (-1, 35.0))


def chase_rig():
    span = 2 * math.tan(math.radians(FOV) / 2)
    pitch = math.atan(span * (0.5 - HORIZON_DOWN))
    to_base = pitch + math.atan(span * (BASE_DOWN - 0.5))
    to_top = pitch + math.atan(span * (BASE_DOWN - RIDER_IN_FRAME - 0.5))
    distance = (RIDER_TOP + REAR_BEHIND * math.tan(to_base)) / (math.tan(to_base) - math.tan(to_top))
    return distance, (distance - REAR_BEHIND) * math.tan(to_base), pitch


def tone(rgb):
    return (*(c ** 2.2 for c in rgb), 1.0)


def cel_material():
    m = bpy.data.materials.new("review_cel")
    m.use_backface_culling = True
    n, l = m.node_tree.nodes, m.node_tree.links
    n.clear()
    col = n.new("ShaderNodeVertexColor")
    col.layer_name = "Col"
    geo = n.new("ShaderNodeNewGeometry")
    dot = n.new("ShaderNodeVectorMath")
    dot.operation = "DOT_PRODUCT"
    dot.inputs[1].default_value = to_blender(KEY).normalized()
    l.new(geo.outputs["Normal"], dot.inputs[0])
    band = n.new("ShaderNodeMath")
    band.operation = "GREATER_THAN"
    band.inputs[1].default_value = LIT_ABOVE
    l.new(dot.outputs["Value"], band.inputs[0])
    light = n.new("ShaderNodeMix")
    light.data_type = "RGBA"
    light.inputs["A"].default_value = tone(DUSK_SHADOW)
    light.inputs["B"].default_value = tone(DUSK_LIT)
    l.new(band.outputs[0], light.inputs["Factor"])
    mult = n.new("ShaderNodeMix")
    mult.data_type = "RGBA"
    mult.blend_type = "MULTIPLY"
    mult.inputs["Factor"].default_value = 1.0
    l.new(col.outputs["Color"], mult.inputs["A"])
    l.new(light.outputs["Result"], mult.inputs["B"])
    shader = n.new("ShaderNodeEmission")
    l.new(mult.outputs["Result"], shader.inputs["Color"])
    out = n.new("ShaderNodeOutputMaterial")
    l.new(shader.outputs[0], out.inputs["Surface"])
    return m


def glow_material():
    m = bpy.data.materials.new("review_glow")
    m.use_backface_culling = True
    n, l = m.node_tree.nodes, m.node_tree.links
    n.clear()
    col = n.new("ShaderNodeVertexColor")
    col.layer_name = "Col"
    shader = n.new("ShaderNodeEmission")
    shader.inputs["Strength"].default_value = GLOW_STRENGTH
    l.new(col.outputs["Color"], shader.inputs["Color"])
    out = n.new("ShaderNodeOutputMaterial")
    l.new(shader.outputs[0], out.inputs["Surface"])
    return m


def set_world(flat=None):
    world = bpy.data.worlds.new("sky")
    bpy.context.scene.world = world
    n, l = world.node_tree.nodes, world.node_tree.links
    bg = next(x for x in n if x.type == "BACKGROUND")
    if flat:
        bg.inputs["Color"].default_value = paint.linear(flat)
        return
    coord = n.new("ShaderNodeTexCoord")
    sep = n.new("ShaderNodeSeparateXYZ")
    l.new(coord.outputs["Generated"], sep.inputs[0])
    scale = n.new("ShaderNodeMath")
    scale.operation = "MULTIPLY"
    scale.inputs[1].default_value = 2.6
    l.new(sep.outputs["Z"], scale.inputs[0])
    flip = n.new("ShaderNodeMath")
    flip.operation = "SUBTRACT"
    flip.inputs[0].default_value = 1.0
    flip.use_clamp = True
    l.new(scale.outputs[0], flip.inputs[1])
    ramp = n.new("ShaderNodeValToRGB")
    cr = ramp.color_ramp
    cr.elements[0].position, cr.elements[0].color = SKY[0][0], paint.linear(SKY[0][1])
    cr.elements[1].position, cr.elements[1].color = SKY[-1][0], paint.linear(SKY[-1][1])
    for pos, col in SKY[1:-1]:
        e = cr.elements.new(pos)
        e.color = paint.linear(col)
    l.new(flip.outputs[0], ramp.inputs["Fac"])
    l.new(ramp.outputs["Color"], bg.inputs["Color"])


def setup_render(res, lines=True):
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.eevee.taa_render_samples = 16
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.image_settings.file_format = "PNG"
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.render.use_freestyle = lines
    if lines:
        view = sc.view_layers[0]
        view.use_freestyle = True
        sc.render.line_thickness_mode = "ABSOLUTE"
        sc.render.line_thickness = 1.0
        ls = view.freestyle_settings.linesets[0] if view.freestyle_settings.linesets else view.freestyle_settings.linesets.new("ink")
        ls.select_silhouette, ls.select_border, ls.select_crease = True, True, True
        ls.linestyle.color = paint.linear(INK_LINE)[:3]
        ls.linestyle.thickness = 1.3
        ls.select_by_collection = True
        ls.collection_negation = "EXCLUSIVE"
        ls.collection = bpy.data.collections.get("no_ink") or bpy.data.collections.new("no_ink")
        if ls.collection.name not in sc.collection.children:
            sc.collection.children.link(ls.collection)


def camera(name, loc, target=None, pitch=None, fov=FOV):
    cam = bpy.data.cameras.new(name)
    cam.sensor_fit = "VERTICAL"
    cam.angle_y = math.radians(fov)
    cam.clip_start, cam.clip_end = 0.1, 2000
    ob = bpy.data.objects.new(name, cam)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = to_blender(loc)
    if target is not None:
        ob.rotation_euler = (to_blender(target) - ob.location).to_track_quat("-Z", "Y").to_euler()
    else:
        ob.rotation_euler = (math.pi / 2 - pitch, 0, 0)
    bpy.context.scene.camera = ob
    return ob


def caption(cam, text, fov, size=0.05):
    bpy.context.view_layer.update()
    aspect = bpy.context.scene.render.resolution_x / bpy.context.scene.render.resolution_y
    half = math.tan(math.radians(fov) / 2)
    curve = bpy.data.curves.new(f"cap{text[:6]}", "FONT")
    curve.body = text
    curve.size = size * half * 2
    ob = bpy.data.objects.new(curve.name, curve)
    bpy.data.collections["no_ink"].objects.link(ob)
    curve.materials.append(flat_white())
    ob.parent = cam
    ob.location = (-half * aspect * 0.96, -half * 0.93, -1.0)
    return ob


def flat_white():
    m = bpy.data.materials.get("review_label")
    if m:
        return m
    m = bpy.data.materials.new("review_label")
    n, l = m.node_tree.nodes, m.node_tree.links
    n.clear()
    s = n.new("ShaderNodeEmission")
    s.inputs["Color"].default_value = (1, 1, 1, 1)
    o = n.new("ShaderNodeOutputMaterial")
    l.new(s.outputs[0], o.inputs["Surface"])
    return m


def place(mesh_ob, x, y, z, turn=0.0):
    copy = bpy.data.objects.new(mesh_ob.name, mesh_ob.data)
    bpy.context.scene.collection.objects.link(copy)
    copy.location = to_blender((x, y, z))
    copy.rotation_euler = (0, 0, turn)
    return copy


def street(slots, start=-40.0, stop=70.0):
    p = Part("review_street", 10 ** 7)
    p.face([(-ROAD_HALF, 0, stop), (ROAD_HALF, 0, stop), (ROAD_HALF, 0, start - 200), (-ROAD_HALF, 0, start - 200)], ROAD)
    z = start - 200
    while z < stop:
        p.face([(-0.22, 0.005, z + 3), (-0.1, 0.005, z + 3), (-0.1, 0.005, z), (-0.22, 0.005, z)], paint.AMBER)
        p.face([(0.1, 0.005, z + 3), (0.22, 0.005, z + 3), (0.22, 0.005, z), (0.1, 0.005, z)], paint.AMBER)
        z += 3
    for side in (-1, 1):
        x0, x1 = sorted((side * (ROAD_HALF + 0.3), side * BUILDING_FRONT))
        p.face([(x0, 0.14, stop), (x1, 0.14, stop), (x1, 0.14, start - 200), (x0, 0.14, start - 200)], WALK)
        p.box((side * (ROAD_HALF + 0.15), 0.07, (stop + start - 200) / 2), (0.3, 0.14, stop - start + 200), KERB, skip="bx" if side > 0 else "bX")
        z = stop
        i = 0
        while z > start - 200:
            length = 14 + (i * 7) % 20
            wall = paint.dim(WALLS[i % len(WALLS)], 0.55)
            height = 8 + (i * 5) % 11
            p.box((side * (BUILDING_FRONT + 6), height / 2, z - length / 2), (12, height, length - 0.3), wall, skip="b")
            front = side * (BUILDING_FRONT - 0.02)
            faces_road = -side
            for row in range(3):
                for col in range(int(length // 4)):
                    zc = z - 2 - col * 4
                    yc = 4.5 + row * 3
                    lit = (i * 3 + col * 2 + row) % 3 != 0
                    colour = "#a8572a" if lit else "#1e1832"
                    w, h = 0.6, 0.7
                    a, b = (zc + w, zc - w) if faces_road > 0 else (zc - w, zc + w)
                    p.face([(front, yc - h, a), (front, yc - h, b), (front, yc + h, b), (front, yc + h, a)], colour, lit)
            a, b = (z - 0.5, z - length + 0.5) if faces_road > 0 else (z - length + 0.5, z - 0.5)
            p.face([(front, 0.14, a), (front, 0.14, b), (front, 3.0, b), (front, 3.0, a)], "#3a2452")
            z -= length
            i += 1
    return kit.to_object(p, slots)


def scale_boxes(slots, x_rider=1.8):
    p = Part("review_scale", 10 ** 6)
    p.box((x_rider, RIDER_TOP / 2, 0.3), (0.8, RIDER_TOP, 2.1), "#f4f4f4", top="#ffffff", glow=True)
    p.box((-5.4, 0.14 + 0.875, -6.0), (0.5, 1.75, 0.35), "#b7ff3c", top="#b7ff3c", glow=True)
    p.box((5.4, 0.14 + 0.875, -14.0), (0.5, 1.75, 0.35), "#b7ff3c", top="#b7ff3c", glow=True)
    p.box((6.1, 0.14 + 0.875, -3.0), (0.5, 1.75, 0.35), "#b7ff3c", top="#b7ff3c", glow=True)
    p.box((-5.5, 0.14 + 0.875, -25.0), (0.5, 1.75, 0.35), "#b7ff3c", top="#b7ff3c", glow=True)
    return kit.to_object(p, slots)


def assemble(by_name):
    tris = {"stalls": 0, "decorations": 0}
    for name, side, s in PATCH:
        place(by_name[name], side * STALL_X, 0.14, -s, 0.0 if side < 0 else math.pi)
        tris["stalls"] += by_name[name].data["tris"]
    for name, side, s, x in DECOR:
        place(by_name[name], side * x, 0.14, -s, 0.0 if side < 0 else math.pi)
        tris["decorations"] += by_name[name].data["tris"]
    for side, s in LIGHT_SPANS:
        place(by_name["deco_string_lights"], side * 7.4, 0.14, -s, -side * math.pi / 2)
        tris["decorations"] += by_name["deco_string_lights"].data["tris"]
    return tris


def render(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return bloom(path)


def bloom(path, threshold=0.86, strength=0.45, sigma=8.0):
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    rgb = px.reshape(h, w, 4)[:, :, :3]
    bright = np.clip(rgb - threshold, 0, 1) / (1 - threshold)
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.rfftfreq(w)[None, :]
    kernel = np.exp(-2 * (math.pi * sigma) ** 2 * (fx ** 2 + fy ** 2))
    blur = np.stack([np.fft.irfft2(np.fft.rfft2(bright[:, :, c]) * kernel, s=(h, w)) for c in range(3)], axis=-1)
    done = 1 - (1 - rgb) * (1 - np.clip(blur * strength, 0, 1))
    px.reshape(h, w, 4)[:, :, :3] = done
    img.pixels.foreach_set(px)
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)
    return path


def montage(paths, cols, path):
    imgs = []
    for p in paths:
        img = bpy.data.images.load(p, check_existing=False)
        w, h = img.size
        px = np.empty(w * h * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        imgs.append(px.reshape(h, w, 4))
        bpy.data.images.remove(img)
    rows = math.ceil(len(imgs) / cols)
    sheet = np.ones((rows * h, cols * w, 4), dtype=np.float32)
    for i, im in enumerate(imgs):
        r, c = i // cols, i % cols
        sheet[(rows - 1 - r) * h : (rows - r) * h, c * w : (c + 1) * w] = im
    out = bpy.data.images.new("sheet", cols * w, rows * h)
    out.pixels.foreach_set(sheet.ravel())
    out.filepath_raw = path
    out.file_format = "PNG"
    out.save()
    bpy.data.images.remove(out)


def clear_cameras():
    for o in [o for o in bpy.data.objects if o.type in {"CAMERA", "FONT"}]:
        bpy.data.objects.remove(o)


def wants(name):
    return not ONLY or name in ONLY


def main():
    os.makedirs(OUT, exist_ok=True)
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    slots = [cel_material(), glow_material()]
    parts = kit.build_parts()
    objs = {}
    for part in parts:
        ob = kit.to_object(part, slots)
        ob.data["tris"] = part.triangles()
        objs[part.name] = ob
    distance, height, pitch = chase_rig()
    print("RIG", round(distance, 2), round(height, 2), round(math.degrees(pitch), 2))

    set_world("#120a22")
    setup_render((800, 500))
    floor = Part("review_floor", 100)
    floor.face([(-30, 0, 30), (30, 0, 30), (30, 0, -30), (-30, 0, -30)], "#2a2040")
    floor_ob = kit.to_object(floor, slots)
    bpy.data.collections["no_ink"].objects.link(floor_ob)
    bpy.context.scene.collection.objects.unlink(floor_ob)
    for ob in objs.values():
        ob.hide_render = True
    sheets = {"stalls": [], "decorations": []}
    for part in parts:
        ob = objs[part.name]
        ob.hide_render = False
        small = part.limit == paint.DECO_LIMIT
        lows, highs = [min(q[i] for q in part.points) for i in range(3)], [max(q[i] for q in part.points) for i in range(3)]
        reach = max(highs[0] - lows[0], highs[1] - lows[1], highs[2] - lows[2], 1.2)
        focus = ((lows[0] + highs[0]) / 2, (lows[2] + highs[2]) / 2, -(lows[1] + highs[1]) / 2)
        away = reach * 2.7
        loc = (focus[0] + away * 0.72, max(1.0, focus[1] + away * 0.16), focus[2] + away * 0.68)
        fov = 34
        cam = camera(part.name, loc, target=focus, fov=fov)
        caption(cam, f"{part.name}  {part.triangles()} tris", fov)
        path = os.path.join(OUT, f"_part-{part.name}.png")
        if wants("parts"):
            render(path)
        sheets["decorations" if small else "stalls"].append(path)
        ob.hide_render = True
        clear_cameras()
    if wants("parts"):
        montage(sheets["stalls"], 2, os.path.join(OUT, "kit-stalls.png"))
        montage(sheets["decorations"], 3, os.path.join(OUT, "kit-decorations.png"))
        for group in sheets.values():
            for path in group:
                os.remove(path)
    bpy.data.objects.remove(bpy.data.objects["review_floor"])

    for ob in objs.values():
        ob.hide_render = True
    set_world()
    setup_render((1920, 1080))
    street(slots)
    scale_boxes(slots)
    tris = assemble(objs)
    print("PATCH", json.dumps(tris))
    shots = (
        ("street-chase", (1.8, height, distance), pitch, FOV, f"Chase camera {height:.1f} m high, {distance:.1f} m back, {FOV:.0f} deg. White box bike and rider 1.85 m, green boxes people 1.75 m"),
        ("street-speed", (1.8, height, distance), pitch, FOV_AT_SPEED, f"Chase camera at full speed, {FOV_AT_SPEED:.0f} deg, 75 m/s with one frame of blur"),
        ("street-approach", (1.8, height, distance + 45), pitch, FOV, "Same camera 45 m before the cluster"),
        ("street-plan", (0, 38, 16), None, 42, "Layout from above, 40 m cluster, both footpaths"),
    )
    for name, loc, tilt, fov, text in shots:
        if not wants(name):
            continue
        if tilt is None:
            cam = camera(name, loc, target=(0, 0, -17), fov=fov)
        else:
            cam = camera(name, loc, pitch=tilt, fov=fov)
        caption(cam, text, fov, size=0.032)
        sc = bpy.context.scene
        sc.render.use_motion_blur = name == "street-speed"
        sc.render.use_freestyle = name != "street-speed"
        if name == "street-speed":
            sc.render.fps = 60
            sc.frame_start = 1
            sc.frame_set(1)
            cam.keyframe_insert("location", frame=1)
            cam.location = to_blender((loc[0], loc[1], loc[2] - 75 / 60))
            cam.keyframe_insert("location", frame=2)
            sc.render.motion_blur_shutter = 1.0
            sc.frame_set(1)
        render(os.path.join(OUT, f"{name}.png"))
        sc.render.use_motion_blur = False
        clear_cameras()
    print("DONE", OUT)


main()
