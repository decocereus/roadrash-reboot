import bpy, bmesh, math, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from common import *
import car as car_mod

WIDTH = 2.5
HALF = WIDTH / 2
CAB_FRONT = -9.4
CAB_BACK = -6.5
DECK_FRONT = -6.1
DECK_BACK = 7.0
LOWER_DECK = 1.18
UPPER_DECK = 2.72
TOP = 2.72 + 1.45 + 0.05
RAMP_TOE = 19.3
RAMP_LIP = 8.6
RAMP_RISE = 4.3
RAMP_WIDTH = 2.4
TYRE = 0.52
AXLES = [-8.0, 2.8, 4.1, 5.4]


def cab():
    bm = bmesh.new()
    st = [
        (CAB_FRONT, [(0, 3.1), (0.85, 3.1), (HALF - 0.08, 3.0), (HALF, 1.9), (HALF, 0.95), (HALF - 0.04, 0.5), (0, 0.5)]),
        (CAB_FRONT + 0.5, [(0, 3.42), (0.9, 3.42), (HALF - 0.05, 3.3), (HALF, 2.0), (HALF, 0.95), (HALF - 0.04, 0.5), (0, 0.5)]),
        (CAB_BACK, [(0, 3.42), (0.9, 3.42), (HALF - 0.05, 3.3), (HALF, 2.0), (HALF, 0.95), (HALF - 0.04, 0.5), (0, 0.5)]),
    ]
    stations = [(z, p) for z, p in st]
    r = ring_loft(bm, stations, "body", seg_mat=lambda j: "dark" if j >= 4 else "body", cap=False)
    bm.faces.new(r[0]).material_index = MI["body"]
    bm.faces.new(r[-1]).material_index = MI["dark"]
    front = CAB_FRONT - 0.015
    box(bm, (0, 2.45, front + 0.09), (2.1, 1.0, 0.02), "glass")
    box(bm, (0, 1.32, front), (1.5, 0.7, 0.03), "dark")
    for k in range(5):
        box(bm, (0, 1.05 + k * 0.14, front - 0.018), (1.42, 0.05, 0.02), "metal")
    for s in (-1, 1):
        box(bm, (s * 0.98, 1.0, front), (0.34, 0.22, 0.04), "light_head")
        box(bm, (s * (HALF + 0.005), 2.5, CAB_FRONT + 1.5), (0.02, 0.75, 1.3), "glass")
        box(bm, (s * (HALF + 0.21), 2.55, CAB_FRONT + 0.32), (0.08, 0.4, 0.2), "dark")
        box(bm, (s * (HALF + 0.11), 2.55, CAB_FRONT + 0.32), (0.16, 0.04, 0.04), "dark")
        box(bm, (s * (HALF + 0.005), 1.3, CAB_FRONT + 1.5), (0.02, 0.1, 1.4), "accent")
        tube(bm, [(s * 0.9, 3.42, CAB_BACK + 0.35), (s * 0.9, 4.1, CAB_BACK + 0.35)], [(0.07, 0.07)], "metal", n=8)
    box(bm, (0, 0.62, CAB_FRONT - 0.03), (WIDTH - 0.04, 0.26, 0.14), "dark")
    box(bm, (0, 3.5, CAB_FRONT + 0.7), (1.8, 0.1, 0.5), "dark")
    for k in (-1, 0, 1):
        box(bm, (k * 0.5, 3.57, CAB_FRONT + 0.55), (0.3, 0.05, 0.12), "light_ind")
    return finish("truck_cab", bm, angle=30, bevel=0.012)


def deck(bm, y):
    length = DECK_BACK - DECK_FRONT
    centre = (DECK_BACK + DECK_FRONT) / 2
    box(bm, (0, y - 0.07, centre), (WIDTH - 0.06, 0.1, length - 0.05), "dark")
    for s in (-1, 1):
        box(bm, (s * (HALF - 0.05), y - 0.1, centre), (0.1, 0.22, length), "metal")
        box(bm, (s * (HALF - 0.05), y + 0.08, centre), (0.06, 0.06, length - 0.1), "body")


def carrier():
    bm = bmesh.new()
    length = DECK_BACK - CAB_BACK
    centre = (DECK_BACK + CAB_BACK) / 2
    for s in (-1, 1):
        box(bm, (s * 0.5, 0.8, centre), (0.16, 0.26, length), "dark")
    deck(bm, LOWER_DECK)
    deck(bm, UPPER_DECK)
    box(bm, (0, UPPER_DECK - 0.11, CAB_BACK + 0.1), (WIDTH - 0.08, 0.06, 0.8), "dark")
    posts = [DECK_FRONT, -1.75, 2.6, DECK_BACK - 0.05]
    for z in posts:
        for s in (-1, 1):
            box(bm, (s * (HALF - 0.05), (LOWER_DECK + TOP) / 2, z), (0.128, TOP - LOWER_DECK, 0.13), "metal")
    for s in (-1, 1):
        box(bm, (s * (HALF - 0.05), TOP + 0.01, (DECK_FRONT + DECK_BACK) / 2), (0.08, 0.05, DECK_BACK - DECK_FRONT + 0.02), "metal")
        for a, b in zip(posts, posts[1:]):
            tube(bm, [(s * (HALF - 0.04), LOWER_DECK + 0.05, a), (s * (HALF - 0.04), UPPER_DECK - 0.15, b)], [(0.03, 0.03)], "dark", n=4, phase=math.pi / 4)
            tube(bm, [(s * (HALF - 0.04), UPPER_DECK + 0.1, a), (s * (HALF - 0.04), TOP - 0.1, b)], [(0.03, 0.03)], "dark", n=4, phase=math.pi / 4)
        box(bm, (s * (HALF + 0.002), LOWER_DECK - 0.07, centre), (0.012, 0.03, 8.0), "accent")
    box(bm, (0, 0.6, DECK_BACK - 0.1), (WIDTH - 0.04, 0.2, 0.12), "dark")
    for s in (-1, 1):
        box(bm, (s * 1.0, 0.82, DECK_BACK - 0.02), (0.36, 0.14, 0.05), "light_tail")
        box(bm, (s * (HALF + 0.008), 0.72, 3.45), (0.03, 0.4, 2.6), "dark")
    return finish("truck_carrier", bm, angle=30, bevel=0.01)


def ramp_y(z, lift=0.015):
    return RAMP_RISE * (RAMP_TOE - z) / (RAMP_TOE - RAMP_LIP) + lift


def chevron(bm, z):
    half = RAMP_WIDTH / 2 - 0.14
    point, depth = 0.7, 0.42
    for s in (-1, 1):
        quad = [(0, z), (s * half, z + point), (s * half, z + point + depth), (0, z + depth)]
        corners = quad if s > 0 else quad[::-1]
        f = bm.faces.new([bm.verts.new(B(x, ramp_y(zz), zz)) for x, zz in corners])
        f.material_index = MI["gold"]
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()


def ramp():
    bm = bmesh.new()
    half = RAMP_WIDTH / 2
    verts = [
        B(-half, 0.02, RAMP_TOE), B(half, 0.02, RAMP_TOE),
        B(half, RAMP_RISE, RAMP_LIP), B(-half, RAMP_RISE, RAMP_LIP),
        B(-half, RAMP_RISE - 0.22, RAMP_LIP), B(half, RAMP_RISE - 0.22, RAMP_LIP),
    ]
    vs = [bm.verts.new(v) for v in verts]
    for idx, mat in [((0, 1, 2, 3), "dark"), ((3, 2, 5, 4), "body"), ((0, 3, 4), "body"), ((1, 5, 2), "body"), ((0, 4, 5, 1), "dark")]:
        f = bm.faces.new([vs[i] for i in idx])
        f.material_index = MI[mat]
    length = RAMP_TOE - RAMP_LIP
    for t in (0.1, 0.28, 0.46, 0.64, 0.82):
        chevron(bm, RAMP_LIP + length * t)
    axle = RAMP_LIP + 2.6
    for s in (-1, 1):
        x = s * (half - 0.1)
        tube(bm, [(x, 0.5, axle), (x, RAMP_RISE - 0.2, RAMP_LIP + 0.25)], [(0.05, 0.05)], "metal", n=6)
        tube(bm, [(x, 0.5, axle), (x, ramp_y(axle + 2.6, -0.04), axle + 2.6)], [(0.05, 0.05)], "metal", n=6)
        tube(bm, [(s * 0.5, 0.82, DECK_BACK - 0.05), (s * (half - 0.1), 0.5, axle)], [(0.06, 0.06)], "metal", n=6)
        box(bm, (s * (half + 0.004), RAMP_RISE - 0.1, RAMP_LIP + 0.05), (0.02, 0.1, 0.5), "light_ind")
        box(bm, (s * (half - 0.05), 0.26, RAMP_TOE - 0.1), (0.1, 0.04, 0.2), "light_tail")
    box(bm, (0, RAMP_RISE - 0.02, RAMP_LIP + 0.04), (RAMP_WIDTH - 0.05, 0.05, 0.08), "light_ind")
    box(bm, (0, 0.5, axle), (RAMP_WIDTH - 0.3, 0.1, 0.14), "metal")
    ob = finish("truck_ramp", bm, angle=26)
    plates = [p for p in ob.data.polygons if p.material_index == MI["gold"]]
    flipped = [p for p in plates if p.normal.z < 0]
    if flipped:
        fix = bmesh.new()
        fix.from_mesh(ob.data)
        fix.faces.ensure_lookup_table()
        for p in flipped:
            fix.faces[p.index].normal_flip()
        fix.to_mesh(ob.data)
        fix.free()
    return ob


def wheels():
    bm = bmesh.new()
    for z, R, W, X in [(z, TYRE, 0.34, HALF - 0.17) for z in AXLES] + [(RAMP_LIP + 2.6, 0.42, 0.28, RAMP_WIDTH / 2 - 0.02)]:
        for s in (-1, 1):
            rim = R * 0.62
            lathe(bm, (s * X, R, z), [(rim, -W / 2), (R - 0.03, -W / 2), (R, -W / 4), (R, W / 4), (R - 0.03, W / 2), (rim, W / 2)], "tyre", steps=20)
            lathe(bm, (s * X, R, z), [(0.0, -W * 0.46), (rim, -W * 0.46), (rim, W * 0.46), (0.0, W * 0.46)], "metal", steps=14)
    return finish("truck_wheels", bm, angle=40)


def arches():
    bm = bmesh.new()
    for z in AXLES:
        for s in (-1, 1):
            box(bm, (s * (HALF - 0.17), TYRE * 2 + 0.05, z), (0.42, 0.06, 1.2), "dark")
    return finish("truck_arches", bm, angle=40)


def build():
    rig = join("truck", [cab(), carrier(), ramp(), wheels(), arches()])
    rig.data.transform(Matrix.Translation(B(0, 0, -(CAB_FRONT + RAMP_TOE) / 2)))
    return rig


STACK = [(y, z) for y in (LOWER_DECK, UPPER_DECK) for z in (-3.9, 0.45, 4.8)]


STACK_PAINTS = [(0.95, 0.75, 0.1), (0.1, 0.55, 0.95), (0.95, 0.12, 0.3), (0.2, 0.8, 0.55), (0.92, 0.92, 0.92), (0.15, 0.82, 0.9)]


def preview_stack():
    for index, (y, z) in enumerate(STACK):
        car_mod.WHEELS, car_mod.WX, car_mod.WW = [(-1.42, 0.33), (1.38, 0.33)], 0.84, 0.22
        c = car_mod.build()
        c.location = B(0, y, z)
        paint = bpy.data.materials["body"].copy()
        paint.diffuse_color = (*STACK_PAINTS[index], 1)
        for i, m in enumerate(c.data.materials):
            if m and m.name == "body":
                c.data.materials[i] = paint


if __name__ == "__main__":
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    truck = build()
    export_static("truck", [truck])
    print("TRIS", sum(len(p.vertices) - 2 for p in truck.data.polygons))
    if SHOW:
        preview_stack()
        ground = bmesh.new()
        box(ground, (0, -0.02, 2), (40, 0.04, 90), "metal")
        finish("ground", ground)
        bpy.context.scene.world = bpy.data.worlds.new("sky")
        bpy.context.scene.world.color = (0.6, 0.62, 0.68)
        os.makedirs(PREVIEWS, exist_ok=True)
        print("PREVIEWS", render_views(os.path.join(PREVIEWS, "truck"), [
            ("rear", (-8.5, 5.0, 25.0), (0, 2.0, 6.5), 34),
            ("rider", (0.0, 1.7, 26.0), (0, 2.6, 4), 30),
            ("front", (9.0, 4.2, -18.0), (0, 2.0, 0.5), 34),
            ("side", (30.0, 2.6, 4.5), (0, 2.1, 4.5), 40),
        ], res=(1100, 720)))
