import bpy, bmesh, math, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from common import *

BODY = [
    (-2.30, 0.58, 0.55, 0.66, 0.50, 0.38, 0.30),
    (-2.20, 0.67, 0.72, 0.84, 0.52, 0.32, 0.22),
    (-1.60, 0.81, 0.80, 0.91, 0.58, 0.30, 0.19),
    (-0.80, 0.92, 0.82, 0.92, 0.62, 0.30, 0.19),
    (0.00, 0.94, 0.83, 0.92, 0.62, 0.30, 0.19),
    (1.30, 0.95, 0.82, 0.92, 0.64, 0.30, 0.19),
    (1.95, 0.94, 0.78, 0.89, 0.62, 0.31, 0.21),
    (2.25, 0.88, 0.70, 0.82, 0.58, 0.34, 0.24),
    (2.33, 0.76, 0.56, 0.66, 0.54, 0.40, 0.32),
]
CABIN = [(-0.82, 0.93, 0.74, 0.80, 0.90), (-0.05, 1.40, 0.60, 0.82, 0.93), (0.90, 1.41, 0.60, 0.82, 0.94), (1.62, 0.97, 0.72, 0.80, 0.93)]
WHEELS = [(-1.42, 0.33), (1.38, 0.33)]
WX, WW = 0.84, 0.22


def body():
    bm = bmesh.new()
    st = [(z, [(0, d), (wd * 0.75, d), (wd, d - 0.04), (wm, mid), (wm, sill), (wm - 0.06, bot), (0, bot)]) for z, d, wd, wm, mid, sill, bot in BODY]
    ring_loft(bm, st, "body", seg_mat=lambda j: "dark" if j >= 4 else "body")
    cs = [(z, [(0, t), (wr * 0.85, t), (wr, t - 0.05), (wb, b), (0, b)]) for z, t, wr, wb, b in CABIN]
    windscreen = ring_loft(bm, cs[0:2], "glass", cap=False)
    ring_loft(bm, cs[1:3], "body", seg_mat=lambda j: "glass" if j == 2 else "body", cap=False)
    rear_window = ring_loft(bm, cs[2:4], "glass", cap=False)
    for ring in (windscreen[0], rear_window[-1]):
        bm.faces.new(ring).material_index = MI["body"]
    for s in (-1, 1):
        tube(bm, [(s * 0.80, 0.92, -0.84), (s * 0.615, 1.385, -0.05)], [(0.03, 0.045)], "body", n=4, phase=math.pi / 4)
        tube(bm, [(s * 0.615, 1.385, 0.9), (s * 0.79, 0.95, 1.64)], [(0.03, 0.06)], "body", n=4, phase=math.pi / 4)
        tube(bm, [(s * 0.82, 0.93, 0.42), (s * 0.615, 1.39, 0.42)], [(0.025, 0.045)], "body", n=4, up=(0, 0, 1), phase=math.pi / 4)
        tube(bm, [(s * 0.61, 1.40, -0.05), (s * 0.61, 1.41, 0.9)], [(0.03, 0.03)], "body", n=4, phase=math.pi / 4)
        box(bm, (s * 0.99, 0.99, -0.62), (0.16, 0.1, 0.07), "body")
        box(bm, (s * 0.56, 0.61, -2.26), (0.36, 0.085, 0.1), "light_head")
        box(bm, (s * 0.55, 0.76, 2.3), (0.4, 0.09, 0.1), "light_tail")
        box(bm, (s * 0.925, 0.7, 0.42), (0.012, 0.5, 0.015), "dark")
        box(bm, (s * 0.925, 0.7, -0.72), (0.012, 0.5, 0.015), "dark")
        box(bm, (s * 0.925, 0.7, 1.28), (0.012, 0.5, 0.015), "dark")
    box(bm, (0, 0.76, 2.325), (1.1, 0.03, 0.05), "light_tail")
    box(bm, (0, 0.44, -2.3), (0.95, 0.15, 0.06), "dark")
    box(bm, (0, 0.5, 2.345), (0.44, 0.11, 0.02), "plate")
    box(bm, (0, 0.27, 2.3), (1.3, 0.1, 0.12), "dark")
    box(bm, (0, 0.25, -2.24), (1.4, 0.07, 0.16), "dark")
    return finish("car_shell", bm, angle=28, bevel=0.012)


def arches():
    bm = bmesh.new()
    for z, R in WHEELS:
        for s in (-1, 1):
            lathe(bm, (s * 0.905, R + 0.03, z), [(0.0, -0.03), (0.42, -0.03), (0.42, 0.03), (0.0, 0.03)], "dark", steps=28)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=B(0, 0.2, 0), plane_no=B(0, 1, 0), clear_inner=True)
    return finish("car_arches", bm, angle=40)


def wheels():
    bm = bmesh.new()
    for z, R in WHEELS:
        for s in (-1, 1):
            c = (s * WX, R, z)
            rim = R * 0.66
            prof = []
            for i in range(11):
                a = math.radians(-90 + 180 * i / 10)
                prof.append((rim + (R - rim) * max(0.0, math.cos(a)) ** 0.35, WW / 2 * math.sin(a)))
            lathe(bm, c, prof, "tyre", steps=32)
            fx = s * WW * 0.36
            lathe(bm, (c[0] + fx, R, z), [(0.0, 0.0), (rim, 0.0)], "tyre", steps=24)
            lathe(bm, (c[0] + fx, R, z), [(rim - 0.025, -0.02), (rim, -0.02), (rim, 0.02), (rim - 0.025, 0.02)], "metal", steps=32, closed=True)
            lathe(bm, (c[0] + fx + s * 0.012, R, z), [(0.0, -0.01), (0.05, -0.01), (0.05, 0.01), (0.0, 0.01)], "metal", steps=12)
            for k in range(5):
                a = k * 72 + 18
                rot = rx(a)
                mid = rot @ Vector((0, rim * 0.52, 0))
                box(bm, (c[0] + fx + s * 0.008, R + mid.y, z + mid.z), (0.02, rim * 0.92, 0.05), "metal", rot=rot)
    return finish("car_wheels", bm, angle=40)


def build():
    return join("car", [body(), arches(), wheels()])


if __name__ == "__main__":
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    car = build()
    export_static("car", [car])
    preview("car", [("side", (-6.0, 1.2, 0.0), (0, 0.7, 0), 50), ("rear", (-3.0, 2.0, 5.5), (0, 0.6, 0.2), 50), ("front", (3.2, 1.6, -5.5), (0, 0.6, -0.2), 50)])
