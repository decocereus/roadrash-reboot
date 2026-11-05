import bpy, json, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from common import REPO, export_static
from stall_part import *


def stall_noodle():
    p = Part("stall_noodle", STALL_LIMIT)
    p.mat(4.4, 3.2)
    p.box((0.72, 0.55, 0), (0.56, 1.1, 3.5), TEAL, top=CREAM, low=SLATE)
    p.face([(-0.95, 0.5, 1.7), (-0.95, 0.5, -1.7), (-0.95, 2.2, -1.7), (-0.95, 2.2, 1.7)], [ORANGE, ORANGE, WARM, WARM], True)
    for z in (-0.6, 0.6):
        p.box((-0.9, 1.35, z), (0.03, 1.7, 0.08), INK, skip="tbXzZ")
    for y in (1.0, 1.65):
        p.box((-0.905, y, 0), (0.03, 0.07, 3.4), INK, skip="tbXzZ")
    p.awning(-1.2, 1.7, 3.0, 2.45, -2.1, 2.1, (ROSE, AMBER), 6)
    for x, z in ((-1.0, -1.95), (-1.0, 1.95), (1.15, -1.95), (1.15, 1.95)):
        p.post(x, z, 0, 2.5 if x > 0 else 2.9)
    for z, seat in ((-1.15, AMBER), (0.0, RED), (1.15, CYAN)):
        p.box((1.42, 0.74, z), (0.42, 0.08, 0.42), seat, skip="b")
        for dx, dz in ((-0.14, -0.14), (0.14, -0.14), (0.0, 0.15)):
            p.prism((1.42 + dx, 0.35, z + dz), 0.03, 0.7, 3, seat, cap=False)
    p.prism((0.72, 1.3, -1.0), 0.3, 0.4, 5, STEEL, top=WARM)
    p.steam(0.72, 1.85, -1.0, puffs=2)
    for z in (-1.2, 1.2):
        p.lantern((1.5, 1.72, z), 0.28, 0.26, 5, RED, band=AMBER)
    p.post(1.2, 2.25, 2.3, 2.4, INK)
    p.sign((1.2, 3.95, 2.25), 0.95, 3.1, "z", "NOODLE", YELLOW, ORANGE, 0.4, stack=True)
    return p


def stall_food_cart():
    p = Part("stall_food_cart", STALL_LIMIT)
    p.mat(3.2, 2.6)
    p.box((0.2, 0.72, 0), (1.0, 0.9, 2.3), MAGENTA, top=CREAM, low=SLATE)
    p.face([(0.71, 0.72, 1.1), (0.71, 0.72, -1.1), (0.71, 0.98, -1.1), (0.71, 0.98, 1.1)], CYAN, True)
    for z in (-0.85, 0.85):
        p.prism((0.72, 0.3, z), 0.3, 0.07, 6, INK, top=SLATE, axis="x")
    p.prism((0.2, 1.38, -0.55), 0.3, 0.42, 6, STEEL, top=WARM)
    p.steam(0.2, 2.0, -0.55)
    p.box((0.2, 1.3, 0.55), (0.7, 0.26, 0.9), ORANGE, top=YELLOW)
    p.post(-0.45, 0, 0.3, 3.1, INK, 0.1)
    hub, rim = (-0.1, 3.5, 0), []
    radius = 2.0
    for i in range(8):
        a = math.tau * i / 8 + math.pi / 8
        rim.append((-0.1 + radius * math.cos(a), 2.75, -radius * math.sin(a)))
    for i in range(8):
        a, b = rim[i], rim[(i + 1) % 8]
        p.face([a, b, hub], ROSE if i % 2 else AMBER)
        p.face([b, a, (-0.1, 2.8, 0)], WARM, True)
    for z in (-1.1, 0.0, 1.1):
        p.lantern((1.05, 2.3, z), 0.22, 0.2, 5, LAMP, band=CREAM)
    p.post(-1.1, 2.2, 0, 2.9, INK)
    p.sign((-1.1, 3.45, 2.2), 1.8, 1.1, "z", "HOT", YELLOW, CYAN, 0.68)
    return p


def stall_fabric():
    p = Part("stall_fabric", STALL_LIMIT)
    p.mat(5.0, 3.0)
    p.awning(-1.25, 1.65, 3.15, 2.55, -2.4, 2.4, (CREAM, BLUE), 8)
    for x, z in ((-1.1, -2.25), (-1.1, 2.25), (1.2, -2.25), (1.2, 2.25)):
        p.post(x, z, 0, 2.6 if x > 0 else 3.05)
    p.box((0.55, 0.42, 0), (1.2, 0.84, 3.6), WOOD, top=SLATE, low=SLATE)
    rolls = (MAGENTA, YELLOW, CYAN, RED, LEAF)
    for i, col in enumerate(rolls):
        p.prism((0.55, 0.98, -1.4 + i * 0.7), 0.15, 1.1, 5, col, axis="x", cap=False)
    bolts = ((-1.9, 0.72, RED), (-1.15, 0.72, CYAN), (-0.4, 0.72, YELLOW), (0.35, 0.72, MAGENTA), (1.1, 0.72, LEAF), (1.85, 0.72, ORANGE))
    for z, wide, col in bolts:
        a, b = z - wide / 2, z + wide / 2
        p.face([(-1.0, 0.45, b), (-1.0, 0.45, a), (-1.0, 2.75, a), (-1.0, 2.75, b)], [dim(col, 0.45), dim(col, 0.45), col, col], True)
    for z, col in ((-1.5, MAGENTA), (1.5, CYAN)):
        low = dim(col, 0.55)
        p.face([(1.5, 1.05, z + 0.34), (1.5, 1.05, z - 0.34), (1.5, 2.3, z - 0.34), (1.5, 2.3, z + 0.34)], [low, low, col, col], True)
        p.face([(1.49, 1.05, z - 0.34), (1.49, 1.05, z + 0.34), (1.49, 2.3, z + 0.34), (1.49, 2.3, z - 0.34)], [low, low, col, col], True)
    p.post(1.25, 2.6, 2.4, 2.75, INK)
    p.sign((1.25, 3.85, 2.6), 0.95, 2.2, "z", "SILK", CYAN, MAGENTA, 0.42, stack=True)
    return p


def stall_parts():
    p = Part("stall_parts", STALL_LIMIT)
    p.mat(4.6, 3.0)
    p.box((0.1, 2.9, 0), (3.0, 0.14, 4.6), STEEL, top=TEAL, low=INK)
    p.box((1.45, 2.73, 0), (0.1, 0.2, 4.0), CYAN, glow=True, skip="X")
    p.face([(-1.3, 2.83, -2.0), (1.3, 2.83, -2.0), (1.3, 2.83, 2.0), (-1.3, 2.83, 2.0)], [SLATE, CYAN, CYAN, SLATE], True)
    for x, z in ((-1.2, -2.1), (-1.2, 2.1), (1.2, -2.1), (1.2, 2.1)):
        p.post(x, z, 0, 2.83)
    p.box((0.6, 0.86, -1.0), (1.3, 0.1, 1.9), STEEL, top=ORANGE, skip="b")
    p.box((0.6, 0.86, 1.1), (1.3, 0.1, 1.5), STEEL, top=YELLOW, skip="b")
    for z in (-1.8, -0.2, 0.5, 1.75):
        p.box((0.6, 0.4, z), (1.1, 0.8, 0.08), SLATE, skip="tb")
    for x, z, col in ((0.35, -1.5, MAGENTA), (0.8, -0.6, CREAM), (0.4, 1.0, RED)):
        p.box((x, 1.08, z), (0.5, 0.34, 0.5), col, top=CREAM)
    for i in range(3):
        p.prism((1.45, 0.14 + i * 0.27, 2.75), 0.42, 0.26, 6, INK, top=SLATE)
    p.box((-0.95, 1.2, 0), (0.4, 2.4, 3.6), SLATE, top=ORANGE)
    p.face([(-0.74, 0.5, 1.7), (-0.74, 0.5, -1.7), (-0.74, 2.3, -1.7), (-0.74, 2.3, 1.7)], [dim(ORANGE, 0.7), dim(ORANGE, 0.7), AMBER, AMBER], True)
    for z, y, wide, tall, col in ((-1.1, 1.75, 0.7, 0.3, CYAN), (-0.1, 1.2, 0.9, 0.22, INK), (0.9, 1.8, 0.5, 0.7, MAGENTA), (1.2, 1.0, 0.5, 0.2, INK)):
        p.box((-0.72, y, z), (0.02, tall, wide), col, skip="tbX", glow=col != INK)
    p.post(1.2, -2.1, 2.83, 3.3, INK)
    p.sign((1.2, 3.8, -2.1), 2.7, 1.0, "z", "SCRAP", CYAN, ORANGE, 0.54)
    return p


def stall_fruit():
    p = Part("stall_fruit", STALL_LIMIT)
    p.mat(4.0, 3.0)
    p.awning(-1.2, 1.7, 3.0, 2.4, -2.0, 2.0, (AMBER, MAGENTA), 6)
    for x, z in ((-1.05, -1.85), (-1.05, 1.85), (1.25, -1.85), (1.25, 1.85)):
        p.post(x, z, 0, 2.45 if x > 0 else 2.9)
    rows = ((1.1, 0.55, (ORANGE, YELLOW, RED, LEAF)), (0.4, 1.0, (RED, LEAF, ORANGE, YELLOW)), (-0.3, 1.45, (YELLOW, ORANGE, LEAF, MAGENTA)))
    for x, y, cols in rows:
        for i, col in enumerate(cols):
            z0, z1 = -1.7 + i * 0.86, -1.7 + (i + 1) * 0.86 - 0.05
            p.face([(x + 0.33, y - 0.12, z1), (x + 0.33, y - 0.12, z0), (x - 0.33, y + 0.2, z0), (x - 0.33, y + 0.2, z1)], col)
            p.face([(x + 0.33, y - 0.42, z1), (x + 0.33, y - 0.42, z0), (x + 0.33, y - 0.12, z0), (x + 0.33, y - 0.12, z1)], WOOD)
    for x, tall in ((1.1, 0.43), (0.4, 0.88), (-0.3, 1.33)):
        p.box((x - 0.03, tall / 2, 0.02), (0.6, tall, 3.44), WOOD, skip="tbX")
    p.box((-0.33, 0.67, 0.02), (0.6, 1.33, 3.44), WOOD, skip="tbxzZ")
    for z in (-1.1, 0.0, 1.1):
        p.bead((1.55, 1.9, z), 0.17, 0.2, 6, WARM)
    p.post(1.25, 2.3, 0, 2.5, INK)
    p.sign((1.25, 3.05, 2.3), 2.2, 1.0, "z", "FRUIT", YELLOW, RED, 0.5)
    return p


def stall_neon():
    p = Part("stall_neon", STALL_LIMIT)
    p.mat(3.2, 3.2)
    p.post(-1.3, -0.5, 0, 5.1, INK, 0.12)
    p.post(1.3, -0.5, 0, 5.1, INK, 0.12)
    p.box((0, 5.05, -0.5), (2.9, 0.14, 0.14), INK)
    p.sign((0, 4.2, -0.5), 2.7, 1.5, "z", "NEON", MAGENTA, CYAN, 0.9)
    p.sign((0.55, 2.55, -0.5), 1.45, 1.4, "z", "24H", YELLOW, MAGENTA, 0.72)
    for z, col in ((-0.46, BLUE), (-0.54, CYAN)):
        face = [(-1.2, 1.9, z), (-0.2, 1.9, z), (-0.2, 3.25, z), (-1.2, 3.25, z)]
        p.face(face if z > -0.5 else face[::-1], [dim(BLUE, 0.7), dim(BLUE, 0.7), CYAN, CYAN], True)
    p.box((-0.9, 0.6, 0.6), (1.0, 1.2, 1.5), SLATE, top=ORANGE)
    p.face([(-0.39, 0.25, 1.25), (-0.39, 0.25, -0.05), (-0.39, 1.05, -0.05), (-0.39, 1.05, 1.25)], [dim(MAGENTA, 0.5), dim(MAGENTA, 0.5), MAGENTA, MAGENTA], True)
    for x, col in ((0.1, MAGENTA), (0.7, CYAN), (1.3, YELLOW)):
        p.box((x, 0.5, 0.55), (0.52, 1.0, 0.68), INK, top=SLATE, skip="bX")
        p.prism((x, 0.55, 0.92), 0.05, 0.8, 4, col, glow=True, cap=False)
    return p


def deco_crates():
    p = Part("deco_crates", DECO_LIMIT)
    p.box((0, 0.2, -0.26), (0.5, 0.4, 0.5), AMBER, top=WOOD)
    p.box((0.06, 0.2, 0.3), (0.5, 0.4, 0.5), ROSE, top=WOOD)
    p.box((0.02, 0.6, -0.02), (0.46, 0.4, 0.46), TEAL, top=CREAM)
    return p


def deco_bin():
    p = Part("deco_bin", DECO_LIMIT)
    p.box((0, 0.5, 0), (0.6, 1.0, 0.6), MAGENTA, top=SLATE, low=SLATE)
    p.box((0, 1.05, 0), (0.68, 0.1, 0.68), INK, top=CYAN)
    return p


def deco_stool():
    p = Part("deco_stool", DECO_LIMIT)
    p.box((0, 0.74, 0), (0.42, 0.08, 0.42), AMBER, skip="b")
    for dx, dz in ((-0.15, -0.15), (0.15, -0.15), (-0.15, 0.15), (0.15, 0.15)):
        p.prism((dx, 0.35, dz), 0.03, 0.7, 3, AMBER, cap=False)
    return p


def deco_string_lights():
    p = Part("deco_string_lights", DECO_LIMIT)
    span, sag, count = 6.0, 0.5, 6
    rail = []
    for i in range(count + 1):
        t = i / count
        rail.append((-span / 2 + t * span, 3.3 - sag * 4 * t * (1 - t)))
    for (x0, y0), (x1, y1) in zip(rail, rail[1:]):
        p.face([(x0, y0 - 0.02, 0), (x1, y1 - 0.02, 0), (x1, y1 + 0.02, 0), (x0, y0 + 0.02, 0)], INK)
    for x, y in rail[:count]:
        p.bead((x + span / count / 2, y - 0.14, 0), 0.1, 0.12, 4, WARM)
    return p


def deco_lanterns():
    p = Part("deco_lanterns", DECO_LIMIT)
    for z, y in ((-0.55, 2.5), (0.55, 2.35)):
        p.lantern((0, y, z), 0.32, 0.3, 5, RED, band=AMBER)
        p.face([(0, y + 0.3, z + 0.03), (0, y + 0.3, z - 0.03), (0, 3.2, z - 0.03), (0, 3.2, z + 0.03)], INK)
    return p


def deco_hanging_sign():
    p = Part("deco_hanging_sign", DECO_LIMIT)
    p.post(0, 0, 0, 2.3, INK)
    p.sign((0, 2.9, 0), 1.3, 1.2, "z", "INK", YELLOW, MAGENTA, 0.5)
    return p


STALLS = (stall_noodle, stall_food_cart, stall_fabric, stall_parts, stall_fruit, stall_neon)
DECOS = (deco_crates, deco_bin, deco_stool, deco_string_lights, deco_lanterns, deco_hanging_sign)


def materials():
    made = []
    for name, emissive in (("stall_cel", False), ("stall_glow", True)):
        m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        m.use_backface_culling = True
        nodes = m.node_tree.nodes
        bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
        colour = nodes.new("ShaderNodeVertexColor")
        colour.layer_name = "Col"
        bsdf.inputs["Roughness"].default_value = 1.0
        m.node_tree.links.new(colour.outputs["Color"], bsdf.inputs["Base Color"])
        if emissive:
            m.node_tree.links.new(colour.outputs["Color"], bsdf.inputs["Emission Color"])
            bsdf.inputs["Emission Strength"].default_value = 1.0
        made.append(m)
    return made


def to_object(part, slots, collection=None):
    me = bpy.data.meshes.new(part.name)
    me.from_pydata(part.points, [], part.faces)
    me.update()
    attribute = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    me.color_attributes.active_color = attribute
    attribute.data.foreach_set("color", [c for rgba in part.colours for c in rgba])
    for m in slots:
        me.materials.append(m)
    me.polygons.foreach_set("material_index", part.slots)
    me.update()
    ob = bpy.data.objects.new(part.name, me)
    (collection or bpy.context.scene.collection).objects.link(ob)
    return ob


def build_parts():
    parts = [make() for make in STALLS + DECOS]
    over = [(p.name, p.triangles(), p.limit) for p in parts if p.triangles() > p.limit]
    if over:
        raise ValueError(f"Over the triangle budget: {over}")
    return parts


def metrics(parts, path):
    rows = {p.name: {"triangles": p.triangles(), "glowTriangles": p.glow_triangles(), "footprint": p.footprint} for p in parts}
    with open(path, "w") as out:
        json.dump(rows, out, indent=2)
        out.write("\n")
    return rows


if __name__ == "__main__":
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    parts = build_parts()
    slots = materials()
    export_static("stalls", [to_object(p, slots) for p in parts])
    rows = metrics(parts, os.path.join(REPO, "docs", "art", "breakwater-stalls", "metrics.json"))
    print("STALLS", json.dumps({k: v["triangles"] for k, v in rows.items()}))
