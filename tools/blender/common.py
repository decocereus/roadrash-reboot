import bpy, bmesh, math, os, sys, tempfile
from mathutils import Vector, Matrix

PALETTE = [
    ("body", (0.95, 0.12, 0.3)), ("accent", (0.08, 0.07, 0.11)), ("dark", (0.1, 0.09, 0.13)), ("metal", (0.55, 0.57, 0.64)),
    ("gold", (0.8, 0.62, 0.2)), ("tyre", (0.05, 0.045, 0.06)), ("glass", (0.05, 0.09, 0.14)), ("seat", (0.06, 0.055, 0.075)),
    ("light_tail", (1.0, 0.1, 0.15)), ("light_head", (1.0, 0.97, 0.85)), ("light_ind", (1.0, 0.6, 0.1)), ("plate", (0.9, 0.88, 0.8)),
    ("suit", (1.0, 0.92, 0.2)), ("suit2", (0.09, 0.08, 0.12)), ("armour", (0.16, 0.15, 0.2)), ("glove", (0.06, 0.055, 0.075)),
    ("boot", (0.07, 0.06, 0.08)), ("helmet", (0.94, 0.93, 0.9)), ("helmet2", (1.0, 0.15, 0.2)), ("visor", (0.06, 0.1, 0.16)),
]
MI = {n: i for i, (n, _) in enumerate(PALETTE)}


def B(x, y, z):
    return Vector((x, z, y))


def materials():
    out = []
    for name, col in PALETTE:
        m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        m.diffuse_color = (*col, 1)
        m.use_nodes = True
        bsdf = m.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = (*col, 1)
            bsdf.inputs["Roughness"].default_value = 0.6
            if name.startswith("light_"):
                bsdf.inputs["Emission Color"].default_value = (*col, 1)
                bsdf.inputs["Emission Strength"].default_value = 3.0
        out.append(m)
    return out


def finish(name, bm, angle=38, bevel=0.0, coll=None):
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    (coll or bpy.context.scene.collection).objects.link(ob)
    for m in materials():
        me.materials.append(m)
    for p in me.polygons:
        p.use_smooth = True
    me.set_sharp_from_angle(angle=math.radians(angle))
    if bevel:
        md = ob.modifiers.new("bevel", "BEVEL")
        md.width = bevel
        md.segments = 2
        md.limit_method = "ANGLE"
        md.angle_limit = math.radians(32)
        md.miter_outer = "MITER_ARC"
    return ob


def ring_loft(bm, stations, mat, seg_mat=None, cap=True):
    rings = []
    k = len(stations[0][1])
    for z, h in stations:
        assert len(h) == k, (z, len(h), k)
        pts = [B(x, y, z) for x, y in h] + [B(-x, y, z) for x, y in reversed(h[1:-1])]
        rings.append([bm.verts.new(p) for p in pts])
    n = len(rings[0])
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            f = bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
            j = i if i < k - 1 else n - 1 - i
            f.material_index = MI[seg_mat(j) if seg_mat else mat]
    if cap:
        for r in (rings[0], rings[-1]):
            f = bm.faces.new(r)
            f.material_index = MI[mat]
    return rings


def tube(bm, pts, radii, mat, n=8, up=(0, 1, 0), cap=True, phase=0.0):
    P = [Vector(p) for p in pts]
    upv = Vector(up)
    rings = []
    for i, p in enumerate(P):
        a = P[max(0, i - 1)]
        b = P[min(len(P) - 1, i + 1)]
        tan = (b - a).normalized()
        side = tan.cross(upv)
        if side.length < 1e-3:
            side = tan.cross(Vector((0, 0, -1)))
        side.normalize()
        v = side.cross(tan).normalized()
        r = radii[min(i, len(radii) - 1)]
        rx, ry = r if isinstance(r, (tuple, list)) else (r, r)
        ring = []
        for j in range(n):
            ang = phase + j / n * math.tau
            q = p + side * rx * math.cos(ang) + v * ry * math.sin(ang)
            ring.append(bm.verts.new(B(q.x, q.y, q.z)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            f = bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
            f.material_index = MI[mat]
    if cap:
        for r in (rings[0], rings[-1]):
            f = bm.faces.new(r)
            f.material_index = MI[mat]
    return rings


def lathe(bm, centre, profile, mat, steps=40, closed=False):
    cx, cy, cz = centre
    rings = []
    for s in range(steps):
        a = s / steps * math.tau
        rings.append([bm.verts.new(B(cx + ax, cy + r * math.cos(a), cz + r * math.sin(a))) for r, ax in profile])
    m = len(profile)
    for s in range(steps):
        a, b = rings[s], rings[(s + 1) % steps]
        for i in range(m if closed else m - 1):
            f = bm.faces.new((a[i], a[(i + 1) % m], b[(i + 1) % m], b[i]))
            f.material_index = MI[mat] if isinstance(mat, str) else MI[mat(i)]


def box(bm, centre, size, mat, rot=None):
    cx, cy, cz = centre
    sx, sy, sz = (s / 2 for s in size)
    vs = []
    for dx in (-sx, sx):
        for dy in (-sy, sy):
            for dz in (-sz, sz):
                v = Vector((dx, dy, dz))
                if rot:
                    v = rot @ v
                vs.append(bm.verts.new(B(cx + v.x, cy + v.y, cz + v.z)))
    for q in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
        f = bm.faces.new([vs[i] for i in q])
        f.material_index = MI[mat]


def rx(deg):
    return Matrix.Rotation(math.radians(deg), 3, "X")


def join(name, objs):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    dg = bpy.context.evaluated_depsgraph_get()
    for o in objs:
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
        o.modifiers.clear()
        o.data = me
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name
    objs[0].data.name = name
    return objs[0]


def render_views(path, views, res=(760, 520)):
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.render.resolution_x, sc.render.resolution_y = res
    sh = sc.display.shading
    sh.light = "STUDIO"
    sh.color_type = "MATERIAL"
    sh.show_object_outline = True
    sh.show_cavity = True
    sh.show_shadows = True
    sc.world = sc.world or bpy.data.worlds.new("w")
    sc.render.film_transparent = False
    out = []
    for name, loc, tgt, lens in views:
        cam = bpy.data.cameras.new(name)
        cam.lens = lens
        ob = bpy.data.objects.new(name, cam)
        sc.collection.objects.link(ob)
        l, t = B(*loc), B(*tgt)
        ob.location = l
        ob.rotation_euler = (t - l).to_track_quat("-Z", "Y").to_euler()
        sc.camera = ob
        sc.render.filepath = f"{path}-{name}.png"
        bpy.ops.render.render(write_still=True)
        out.append(sc.render.filepath)
        bpy.data.objects.remove(ob)
    return out


REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODELS = os.path.join(REPO, "apps", "web", "public", "models")
PREVIEWS = os.path.join(tempfile.gettempdir(), "rushline-models")
ARGS = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
SHOW = "show" in ARGS


def export_static(name, objs):
    os.makedirs(MODELS, exist_ok=True)
    for o in bpy.context.scene.objects:
        o.select_set(o in objs)
    bpy.ops.export_scene.gltf(filepath=os.path.join(MODELS, f"{name}.glb"), use_selection=True, export_apply=True, export_yup=True)


def preview(name, views):
    if SHOW:
        os.makedirs(PREVIEWS, exist_ok=True)
        print("PREVIEWS", render_views(os.path.join(PREVIEWS, name), views))
