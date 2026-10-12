import bpy, bmesh, math, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from common import *
import car as car_mod

BODY = [
    (-2.60, 0.98, 0.78, 0.90, 0.74, 0.44, 0.36),
    (-2.50, 1.10, 0.88, 0.98, 0.80, 0.36, 0.26),
    (-1.72, 2.02, 0.86, 1.00, 1.08, 0.34, 0.24),
    (-1.05, 2.10, 0.90, 1.00, 1.08, 0.34, 0.24),
    (2.48, 2.10, 0.92, 1.00, 1.08, 0.34, 0.24),
    (2.60, 2.02, 0.86, 0.96, 1.04, 0.40, 0.32),
]
WHEELS = [(-1.62, 0.36), (1.5, 0.36)]


def body():
    bm = bmesh.new()
    st = [(z, [(0, d), (wd * 0.75, d), (wd, d - 0.05), (wm, mid), (wm, sill), (wm - 0.06, bot), (0, bot)]) for z, d, wd, wm, mid, sill, bot in BODY]
    lower = lambda j: "dark" if j >= 4 else "body"
    r = ring_loft(bm, st[0:2], "body", seg_mat=lower, cap=False)
    bm.faces.new(r[0]).material_index = MI["body"]
    ring_loft(bm, st[1:3], "body", seg_mat=lambda j: "glass" if j <= 2 else lower(j), cap=False)
    ring_loft(bm, st[2:4], "body", seg_mat=lambda j: "glass" if j == 2 else lower(j), cap=False)
    r = ring_loft(bm, st[3:6], "body", seg_mat=lower, cap=False)
    bm.faces.new(r[-1]).material_index = MI["body"]
    for s in (-1, 1):
        tube(bm, [(s * 0.9, 1.08, -2.5), (s * 0.87, 2.0, -1.72)], [(0.035, 0.05)], "body", n=4, phase=math.pi / 4)
        tube(bm, [(s * 0.95, 1.1, -1.05), (s * 0.9, 2.06, -1.05)], [(0.03, 0.06)], "body", n=4, up=(0, 0, 1), phase=math.pi / 4)
        box(bm, (s * 1.1, 1.3, -1.9), (0.14, 0.26, 0.08), "dark")
        box(bm, (s * 0.62, 0.72, -2.6), (0.34, 0.14, 0.08), "light_head")
        box(bm, (s * 0.9, 1.25, 2.61), (0.1, 0.5, 0.05), "light_tail")
        box(bm, (s * 1.005, 1.2, -0.2), (0.012, 1.5, 0.015), "dark")
        box(bm, (s * 1.005, 0.72, 0.9), (0.014, 0.05, 3.0), "accent")
    box(bm, (0, 0.5, -2.62), (1.0, 0.2, 0.06), "dark")
    box(bm, (0, 0.3, -2.6), (1.9, 0.14, 0.14), "dark")
    box(bm, (0, 0.34, 2.62), (1.9, 0.14, 0.12), "dark")
    box(bm, (0, 1.2, 2.612), (0.014, 1.5, 0.02), "dark")
    box(bm, (0, 0.62, 2.63), (0.44, 0.11, 0.02), "plate")
    return finish("van_shell", bm, angle=28, bevel=0.014)


def arches():
    bm = bmesh.new()
    for z, R in WHEELS:
        for s in (-1, 1):
            lathe(bm, (s * 0.975, R + 0.03, z), [(0.0, -0.03), (0.46, -0.03), (0.46, 0.03), (0.0, 0.03)], "dark", steps=28)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=B(0, 0.22, 0), plane_no=B(0, 1, 0), clear_inner=True)
    return finish("van_arches", bm, angle=40)


def build():
    car_mod.WHEELS, car_mod.WX, car_mod.WW = WHEELS, 0.9, 0.24
    return join("van", [body(), arches(), car_mod.wheels()])


if __name__ == "__main__":
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    van = build()
    export_static("van", [van])
    preview("van", [("front", (4.2, 2.0, -6.5), (0, 1.0, -0.2), 50), ("rear", (-4.0, 2.2, 6.5), (0, 1.0, 0.2), 50)])
