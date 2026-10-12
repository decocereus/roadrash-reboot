import bpy, bmesh, math, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
import bike as bike_mod
from mathutils import Vector, Matrix, Quaternion

HERE = os.path.dirname(os.path.abspath(__file__))
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))


def make_human(macro):
    from bl_ext.blender_org.mpfb.services.humanservice import HumanService
    from bl_ext.blender_org.mpfb.services.targetservice import TargetService
    m = TargetService.get_default_macro_info_dict()
    m.update(macro)
    h = HumanService.create_human(scale=0.1, feet_on_ground=True, macro_detail_dict=m)
    HumanService.add_builtin_rig(h, "game_engine", import_weights=True)
    arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
    return h, arm


def paint_suit(h, arm):
    me = h.data
    me.materials.clear()
    for m in materials():
        me.materials.append(m)
    bones = {b.name: b for b in arm.data.bones}
    head = lambda n: arm.matrix_world @ bones[n].head_local
    bm = bmesh.new()
    bm.from_mesh(me)

    def cut(co, no):
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-5, plane_co=Vector(co), plane_no=Vector(no))

    cut((0, 0, 0.34), (0, 0, 1))
    cut((0, 0, 1.33), (0, 0, 1))
    cut((0, 0, 1.02), (0, 0, 1))
    cut((0.048, 0, 0), (1, 0, 0))
    cut((-0.048, 0, 0), (1, 0, 0))
    arms = {}
    for s in ("_l", "_r"):
        e, w = head("lowerarm" + s), head("hand" + s)
        d = w - e
        arms[s] = (e, d.normalized(), d.length)
        cut(e + d * 0.16, d.normalized())
        cut(e + d * 0.84, d.normalized())
    bm.to_mesh(me)
    bm.free()
    names = {g.index: g.name for g in h.vertex_groups}
    dom = []
    for v in me.vertices:
        best, bw = None, 0.0
        for g in v.groups:
            n = names.get(g.group)
            if n in bones and g.weight > bw:
                best, bw = n, g.weight
        dom.append(best)
    for p in me.polygons:
        c = p.center
        votes = {}
        for vi in p.vertices:
            votes[dom[vi]] = votes.get(dom[vi], 0) + 1
        b = max(votes, key=votes.get) or ""
        side = "_l" if c.x > 0 else "_r"
        m = "suit"
        if b.startswith(("hand", "index", "middle", "ring", "pinky", "thumb", "lowerarm")):
            e, d, ln = arms[side]
            t = (c - e).dot(d) / ln
            m = "glove" if t > 0.84 else "suit2" if t > 0.16 else "suit"
        elif c.z < 0.34:
            m = "boot"
        elif b in ("neck_01", "head"):
            m = "suit2"
        elif c.z > 1.33 and b.startswith(("spine", "clavicle", "upperarm")):
            m = "suit2"
        elif abs(c.x) < 0.048 and c.y > 0.02 and 1.02 < c.z < 1.33:
            m = "armour"
        elif 0.8 < c.z < 1.02 and b in ("pelvis", "thigh_l", "thigh_r", "spine_01"):
            m = "suit2"
        p.material_index = MI[m]
    d = h.modifiers.new("puff", "DISPLACE")
    d.strength = 0.016
    d.mid_level = 0.0
    sm = h.modifiers.new("soften", "SMOOTH")
    sm.factor = 0.7
    sm.iterations = 5


def pose(arm, P):
    pbs = arm.pose.bones
    W = arm.matrix_world

    def upd():
        bpy.context.view_layer.update()

    def rot(name, axis, deg):
        pb = pbs[name]
        M = W @ pb.matrix
        hd = M.to_translation()
        R = Matrix.Translation(hd) @ Matrix.Rotation(math.radians(deg), 4, axis) @ Matrix.Translation(-hd)
        pb.matrix = W.inverted() @ R @ M
        upd()

    def aim(name, direction, roll_deg=0.0):
        pb = pbs[name]
        M = W @ pb.matrix
        hd = M.to_translation()
        cur = (M.to_3x3() @ Y).normalized()
        q = cur.rotation_difference(Vector(direction).normalized())
        R = Matrix.Translation(hd) @ q.to_matrix().to_4x4() @ Matrix.Translation(-hd)
        pb.matrix = W.inverted() @ R @ M
        upd()
        if roll_deg:
            rot(name, Vector(direction).normalized(), roll_deg)

    pel = pbs["pelvis"]
    M = W @ pel.matrix
    hip_now = (W @ pbs["thigh_l"].head + W @ pbs["thigh_r"].head) / 2
    hip_now.x = 0
    pel.matrix = W.inverted() @ Matrix.Translation(B(*P["hip"]) - hip_now) @ M
    upd()
    rot("pelvis", X, P["pelvis"])
    for n, d in zip(("spine_01", "spine_02", "spine_03"), P["spine"]):
        rot(n, X, d)
    rot("neck_01", X, P["neck"])
    rot("head", X, P["head"])
    targets = []
    for s, sx in (("_l", 1), ("_r", -1)):
        rot("clavicle" + s, Y, -sx * 8)
        aim("upperarm" + s, (sx * 0.35, -0.75, -0.55))
        aim("lowerarm" + s, (-sx * 0.1, -1, -0.25))
        aim("thigh" + s, (sx * 0.28, -1, -0.45))
        aim("calf" + s, (sx * 0.0, 0.7, -0.75))
        for bone, key, chain in (("lowerarm" + s, "wrist", 2), ("calf" + s, "ankle", 2)):
            e = bpy.data.objects.new("ik_" + bone, None)
            bpy.context.scene.collection.objects.link(e)
            x, y, z = P[key]
            e.location = B(sx * x, y, z)
            c = pbs[bone].constraints.new("IK")
            c.target = e
            c.chain_count = chain
            c.use_tail = True
            c.iterations = 200
            targets.append(e)
    upd()
    for o in bpy.context.scene.objects:
        o.select_set(False)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.pose.visual_transform_apply()
    for pb in pbs:
        for c in list(pb.constraints):
            pb.constraints.remove(c)
    bpy.ops.object.mode_set(mode="OBJECT")
    for e in targets:
        bpy.data.objects.remove(e)
    upd()
    for s, sx in (("_l", 1), ("_r", -1)):
        aim("hand" + s, (-sx * 0.25, -1, -0.12), roll_deg=P.get("hand_roll", 0) * sx)
        aim("foot" + s, (sx * 0.05, -1, -0.45))
        aim("ball" + s, (sx * 0.05, -1, -0.2))
        for f in ("index", "middle", "ring", "pinky"):
            for i, d in zip(("_01", "_02", "_03"), P["curl"]):
                rot(f + i + s, X, d)
        rot("thumb_01" + s, Z, sx * 25)
        rot("thumb_02" + s, X, 30)


def delta(arm, bone):
    pb = arm.pose.bones[bone]
    return arm.matrix_world @ pb.matrix @ pb.bone.matrix_local.inverted() @ arm.matrix_world.inverted()


def superring(bm, z, y0, w, up, dn, n=2.5, seg=20):
    e = 2 / n
    ring = []
    for j in range(seg):
        a = j / seg * math.tau
        cs, sn = math.cos(a), math.sin(a)
        x = w * math.copysign(abs(cs) ** e, cs)
        y = (up if sn >= 0 else dn) * math.copysign(abs(sn) ** e, sn)
        ring.append(bm.verts.new(Vector((x, y0 + y, z))))
    return ring


def helmet(arm, centre):
    bm = bmesh.new()
    st = [(-0.176, -0.075, 0.05, 0.045, 0.055), (-0.15, -0.035, 0.1, 0.095, 0.1), (-0.09, 0.0, 0.128, 0.125, 0.14), (0.0, 0.01, 0.14, 0.142, 0.152), (0.08, 0.012, 0.136, 0.136, 0.142), (0.14, 0.002, 0.112, 0.106, 0.112), (0.176, -0.008, 0.06, 0.05, 0.06)]
    rings = [superring(bm, *s) for s in st]
    n = len(rings[0])
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            f = bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    bm.faces.new(rings[0])
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges, cuts=1, use_grid_fill=True, smooth=0.6)
    for co, no in (((0, -0.03, 0), (0, 1, 0)), ((0, 0.072, 0), (0, 1, 0)), ((0, -0.105, 0), (0, 1, 0)), ((0.028, 0, 0), (1, 0, 0)), ((-0.028, 0, 0), (1, 0, 0)), ((0, 0, -0.05), (0, 0, 1))):
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-5, plane_co=Vector(co), plane_no=Vector(no))
    bm.normal_update()
    for f in bm.faces:
        c = f.calc_center_median()
        m = "helmet"
        if c.z < -0.05 and -0.03 < c.y < 0.072:
            m = "visor"
        elif c.y < -0.105:
            m = "suit2"
        elif abs(c.x) < 0.028:
            m = "helmet2"
        f.material_index = MI[m]
    for s in (-1, 1):
        vs = [bm.verts.new(Vector((s * x, y, z))) for x, y, z in [(0.03, 0.146, 0.06), (0.03, 0.118, 0.16), (0.03, 0.09, 0.19), (0.0, 0.1, 0.2), (0.0, 0.135, 0.165), (0.0, 0.158, 0.06)]]
    fin = [(0.0, 0.156, 0.03), (0.032, 0.146, 0.05), (0.036, 0.11, 0.165), (0.0, 0.118, 0.205), (-0.036, 0.11, 0.165), (-0.032, 0.146, 0.05)]
    top = [bm.verts.new(Vector(p)) for p in fin]
    low = [bm.verts.new(Vector((p[0] * 0.9, p[1] - 0.03, p[2] - 0.012))) for p in fin]
    f = bm.faces.new(top)
    f.material_index = MI["helmet2"]
    for i in range(6):
        f = bm.faces.new((top[i], top[(i + 1) % 6], low[(i + 1) % 6], low[i]))
        f.material_index = MI["helmet2"]
    D = delta(arm, "head")
    for v in bm.verts:
        p = B(v.co.x, v.co.y, v.co.z) + centre
        v.co = D @ p
    return finish("helmet", bm, angle=42)


def armour(arm):
    out = []
    bm = bmesh.new()
    tube(bm, [(0, 1.2, 0.085), (0, 1.3, 0.108), (0, 1.42, 0.118), (0, 1.49, 0.098)], [(0.04, 0.015), (0.065, 0.034), (0.06, 0.038), (0.03, 0.015)], "armour", n=6)
    D = delta(arm, "spine_03")
    for v in bm.verts:
        v.co = D @ v.co
    out.append(finish("hump", bm, bevel=0.004))
    for s, sx in (("_l", 1), ("_r", -1)):
        bm = bmesh.new()
        k = arm.matrix_world @ arm.data.bones["calf" + s].head_local
        tube(bm, [(k.x + sx * 0.035, k.z + 0.07, k.y - 0.06), (k.x + sx * 0.05, k.z, k.y - 0.075), (k.x + sx * 0.04, k.z - 0.07, k.y - 0.06)], [(0.035, 0.012), (0.045, 0.016), (0.03, 0.012)], "armour", n=6)
        D = delta(arm, "calf" + s)
        for v in bm.verts:
            v.co = D @ v.co
        out.append(finish("knee" + s, bm, bevel=0.003))
    return out


RIDE = {"hip": (0, 0.895, 0.36), "pelvis": 24, "spine": (10, 12, 10), "neck": -22, "head": -26, "wrist": (0.3, 0.99, -0.31), "ankle": (0.235, 0.53, 0.37), "curl": (50, 55, 40)}


def build(macro, P=RIDE):
    h, arm = make_human(macro)
    paint_suit(h, arm)
    pose(arm, P)
    head_c = (arm.matrix_world @ arm.data.bones["head"].head_local + arm.matrix_world @ arm.data.bones["head"].tail_local) / 2 + Vector((0, -0.035, 0.012))
    extra = [helmet(arm, head_c)] + armour(arm)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(h.evaluated_get(dg))
    body = bpy.data.objects.new("rider_body", me)
    bpy.context.scene.collection.objects.link(body)
    body.matrix_world = h.matrix_world
    for p in me.polygons:
        p.use_smooth = True
    me.set_sharp_from_angle(angle=math.radians(60))
    bpy.data.objects.remove(h)
    bpy.data.objects.remove(arm)
    return join("rider", [body] + extra)
