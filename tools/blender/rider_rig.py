import bpy, bmesh, math, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from common import *
import rider as R
import bike as bike_mod
from mathutils import Vector, Matrix

X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
SIDES = (("_l", 1), ("_r", -1))
RIDE = R.RIDE


class Poser:
    def __init__(self, arm):
        self.arm = arm
        self.pbs = arm.pose.bones
        self.W = arm.matrix_world

    def upd(self):
        bpy.context.view_layer.update()

    def reset(self):
        for pb in self.pbs:
            pb.matrix_basis = Matrix.Identity(4)
        self.upd()

    def rot(self, name, axis, deg):
        pb = self.pbs[name]
        M = self.W @ pb.matrix
        hd = M.to_translation()
        Rm = Matrix.Translation(hd) @ Matrix.Rotation(math.radians(deg), 4, axis) @ Matrix.Translation(-hd)
        pb.matrix = self.W.inverted() @ Rm @ M
        self.upd()

    def aim(self, name, direction, roll=0.0):
        pb = self.pbs[name]
        M = self.W @ pb.matrix
        hd = M.to_translation()
        cur = (M.to_3x3() @ Y).normalized()
        d = Vector(direction).normalized()
        q = cur.rotation_difference(d)
        Rm = Matrix.Translation(hd) @ q.to_matrix().to_4x4() @ Matrix.Translation(-hd)
        pb.matrix = self.W.inverted() @ Rm @ M
        self.upd()
        if roll:
            self.rot(name, d, roll)

    def hips(self, target):
        pel = self.pbs["pelvis"]
        M = self.W @ pel.matrix
        now = (self.W @ self.pbs["thigh_l"].head + self.W @ self.pbs["thigh_r"].head) / 2
        now.x = 0
        pel.matrix = self.W.inverted() @ Matrix.Translation(B(*target) - now) @ M
        self.upd()

    def ik(self, jobs):
        targets = []
        for bone, loc in jobs:
            e = bpy.data.objects.new("ik_" + bone, None)
            bpy.context.scene.collection.objects.link(e)
            e.location = loc
            c = self.pbs[bone].constraints.new("IK")
            c.target = e
            c.chain_count = 2
            c.use_tail = True
            c.iterations = 200
            targets.append(e)
        self.upd()
        for o in bpy.context.scene.objects:
            o.select_set(False)
        self.arm.select_set(True)
        bpy.context.view_layer.objects.active = self.arm
        bpy.ops.object.mode_set(mode="POSE")
        bpy.ops.pose.select_all(action="SELECT")
        bpy.ops.pose.visual_transform_apply()
        for pb in self.pbs:
            for c in list(pb.constraints):
                pb.constraints.remove(c)
        bpy.ops.object.mode_set(mode="OBJECT")
        for e in targets:
            bpy.data.objects.remove(e)
        self.upd()

    def grip(self, s, sx, curl=(50, 55, 40)):
        for f in ("index", "middle", "ring", "pinky"):
            for i, d in zip(("_01", "_02", "_03"), curl):
                self.rot(f + i + s, X, d)
        self.rot("thumb_01" + s, Z, sx * 25)
        self.rot("thumb_02" + s, X, 30)

    def fist(self, s, sx):
        self.grip(s, sx, (70, 80, 60))


def ride(p, lean=0.0, free=()):
    p.reset()
    p.hips(RIDE["hip"])
    p.rot("pelvis", X, RIDE["pelvis"])
    for n, d in zip(("spine_01", "spine_02", "spine_03"), RIDE["spine"]):
        p.rot(n, X, d)
    if lean:
        p.rot("spine_02", Y, lean * 0.5)
        p.rot("spine_03", Y, lean * 0.5)
    p.rot("neck_01", X, RIDE["neck"])
    p.rot("head", X, RIDE["head"])
    if lean:
        p.rot("neck_01", Y, -lean * 0.6)
    jobs = []
    for s, sx in SIDES:
        p.rot("clavicle" + s, Y, -sx * 8)
        p.aim("upperarm" + s, (sx * 0.35, -0.75, -0.55))
        p.aim("lowerarm" + s, (-sx * 0.1, -1, -0.25))
        p.aim("thigh" + s, (sx * 0.28, -1, -0.45))
        p.aim("calf" + s, (sx * 0.0, 0.7, -0.75))
        if ("arm", s) not in free:
            x, y, z = RIDE["wrist"]
            jobs.append(("lowerarm" + s, B(sx * x, y, z)))
        if ("leg", s) not in free:
            x, y, z = RIDE["ankle"]
            jobs.append(("calf" + s, B(sx * x, y, z)))
    p.ik(jobs)
    for s, sx in SIDES:
        if ("arm", s) not in free:
            p.aim("hand" + s, (-sx * 0.25, -1, -0.12))
            p.grip(s, sx)
        if ("leg", s) not in free:
            p.aim("foot" + s, (sx * 0.05, -1, -0.45))
            p.aim("ball" + s, (sx * 0.05, -1, -0.2))


def side_of(sx):
    return "_l" if sx > 0 else "_r"


def punch(p, sx):
    s = side_of(sx)
    ride(p, lean=sx * 14, free=(("arm", s),))
    p.rot("clavicle" + s, Y, -sx * 6)
    p.aim("upperarm" + s, (sx * 1.0, -0.22, 0.06))
    p.aim("lowerarm" + s, (sx * 1.0, -0.3, 0.1))
    p.aim("hand" + s, (sx * 1.0, -0.3, 0.1))
    p.fist(s, sx)


def windup(p, sx):
    s = side_of(sx)
    ride(p, lean=-sx * 5, free=(("arm", s),))
    p.aim("upperarm" + s, (sx * 0.7, 0.25, 0.65))
    p.aim("lowerarm" + s, (sx * 0.05, 0.5, 0.86))
    p.aim("hand" + s, (sx * 0.05, 0.5, 0.86))
    p.fist(s, sx)


def swing(p, sx):
    s = side_of(sx)
    ride(p, lean=sx * 16, free=(("arm", s),))
    p.aim("upperarm" + s, (sx * 0.95, -0.3, -0.12))
    p.aim("lowerarm" + s, (sx * 1.0, -0.45, -0.05))
    p.aim("hand" + s, (sx * 1.0, -0.45, -0.05))
    p.fist(s, sx)


def kick(p, sx):
    s = side_of(sx)
    ride(p, lean=-sx * 9, free=(("leg", s),))
    p.aim("thigh" + s, (sx * 0.8, -0.58, -0.12))
    p.aim("calf" + s, (sx * 1.0, -0.15, -0.3))
    p.aim("foot" + s, (sx * 0.5, -0.8, -0.2))
    p.aim("ball" + s, (sx * 0.5, -0.85, 0.0))


def arms_down(p, spread=0.16, bend=0.2):
    for s, sx in SIDES:
        p.aim("upperarm" + s, (sx * spread, 0.05, -1))
        p.aim("lowerarm" + s, (sx * spread * 0.6, -bend, -1))
        p.aim("hand" + s, (sx * spread * 0.4, -bend, -1))
        p.grip(s, sx, (20, 25, 20))


def stand(p):
    p.reset()
    arms_down(p)


def surrender(p):
    p.reset()
    for s, sx in SIDES:
        p.rot("clavicle" + s, Y, sx * 18)
        p.aim("upperarm" + s, (sx * 0.72, 0.0, 0.62))
        p.aim("lowerarm" + s, (sx * 0.12, -0.08, 1))
        p.aim("hand" + s, (sx * 0.05, -0.05, 1))


def run(p, sx):
    p.reset()
    p.rot("spine_01", X, 8)
    p.rot("spine_03", X, 8)
    p.rot("spine_02", Z, -sx * 10)
    p.rot("head", X, -10)
    for s, k in SIDES:
        fwd = k == sx
        if fwd:
            p.aim("thigh" + s, (k * 0.06, -0.72, -0.7))
            p.aim("calf" + s, (k * 0.02, 0.28, -0.96))
            p.aim("foot" + s, (k * 0.05, -0.9, -0.4))
            p.aim("upperarm" + s, (k * 0.2, 0.6, -0.78))
            p.aim("lowerarm" + s, (k * 0.05, -0.35, -0.94))
        else:
            p.aim("thigh" + s, (k * 0.06, 0.34, -0.94))
            p.aim("calf" + s, (k * 0.02, 0.86, -0.5))
            p.aim("foot" + s, (k * 0.05, 0.2, -1))
            p.aim("upperarm" + s, (k * 0.2, -0.5, -0.85))
            p.aim("lowerarm" + s, (-k * 0.1, -0.92, 0.25))
        p.aim("hand" + s, (0, -0.6, -0.5))
        p.grip(s, k, (55, 60, 45))


def lift(p):
    p.reset()
    p.rot("pelvis", X, 30)
    p.rot("spine_01", X, 16)
    p.rot("spine_02", X, 14)
    p.rot("spine_03", X, 10)
    p.rot("neck_01", X, -24)
    for s, sx in SIDES:
        p.aim("thigh" + s, (sx * 0.22, -0.55, -0.82))
        p.aim("calf" + s, (sx * 0.1, 0.42, -0.9))
        p.aim("foot" + s, (sx * 0.1, -0.9, -0.3))
        p.aim("upperarm" + s, (sx * 0.3, -0.5, -0.82))
        p.aim("lowerarm" + s, (sx * 0.1, -0.75, -0.66))
        p.aim("hand" + s, (0, -0.8, -0.6))
        p.grip(s, sx)


def lying(p):
    p.reset()
    p.rot("head", Z, 35)
    for s, sx in SIDES:
        up = 0.75 if sx > 0 else -0.35
        p.aim("upperarm" + s, (sx * 0.8, 0.05, up))
        p.aim("lowerarm" + s, (sx * 0.5, 0.05, up + 0.5 if sx > 0 else -1))
        p.aim("hand" + s, (sx * 0.5, 0.0, up + 0.5 if sx > 0 else -1))
    p.aim("thigh_l", (0.3, 0.0, -1))
    p.aim("calf_l", (0.05, 0.0, -1))
    p.aim("thigh_r", (-0.12, 0.0, -1))
    p.aim("calf_r", (-0.3, 0.0, -1))
    for s, sx in SIDES:
        p.aim("foot" + s, (sx * 0.5, 0.2, -1))


def tumble(p, k):
    p.reset()
    p.rot("spine_01", X, 22 * k)
    p.rot("spine_02", X, 20 * k)
    p.rot("spine_03", Z, 18 * k)
    p.rot("neck_01", X, 18 * k)
    for s, sx in SIDES:
        a = k * sx
        p.aim("upperarm" + s, (sx * 0.85, -0.3 * a, 0.5 * a))
        p.aim("lowerarm" + s, (sx * 0.4, -0.8, 0.3 * a))
        p.aim("hand" + s, (sx * 0.4, -0.8, 0.3 * a))
        p.aim("thigh" + s, (sx * 0.3, -0.7 * (1 if a > 0 else 0.1), -0.7))
        p.aim("calf" + s, (sx * 0.1, 0.75 if a > 0 else 0.2, -0.6))


POSES = [
    ("rest", lambda p: p.reset()),
    ("seated", lambda p: ride(p)),
    ("punch_l", lambda p: punch(p, 1)),
    ("punch_r", lambda p: punch(p, -1)),
    ("kick_l", lambda p: kick(p, 1)),
    ("kick_r", lambda p: kick(p, -1)),
    ("windup_l", lambda p: windup(p, 1)),
    ("windup_r", lambda p: windup(p, -1)),
    ("swing_l", lambda p: swing(p, 1)),
    ("swing_r", lambda p: swing(p, -1)),
    ("run_a", lambda p: run(p, 1)),
    ("run_b", lambda p: run(p, -1)),
    ("lift", lift),
    ("lying", lying),
    ("tumble_a", lambda p: tumble(p, 1)),
    ("tumble_b", lambda p: tumble(p, -1)),
    ("surrender", surrender),
    ("stand", stand),
]


def bake_body(h):
    arm_mod = [m for m in h.modifiers if m.type == "ARMATURE"][0]
    arm_mod.show_viewport = False
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(h.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    h.data = me
    for m in list(h.modifiers):
        if m.type != "ARMATURE":
            h.modifiers.remove(m)
    arm_mod.show_viewport = True
    for p in me.polygons:
        p.use_smooth = True
    me.set_sharp_from_angle(angle=math.radians(60))


def bake_extra(o, bone):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    o.modifiers.clear()
    o.data = me
    g = o.vertex_groups.new(name=bone)
    g.add(list(range(len(me.vertices))), 1.0, "REPLACE")


def build(macro):
    h, arm = R.make_human(macro)
    R.paint_suit(h, arm)
    bones = arm.data.bones
    head_c = (arm.matrix_world @ bones["head"].head_local + arm.matrix_world @ bones["head"].tail_local) / 2 + Vector((0, -0.035, 0.012))
    extras = list(zip([R.helmet(arm, head_c)] + R.armour(arm), ["head", "spine_03", "calf_l", "calf_r"]))
    bake_body(h)
    for o, bone in extras:
        bake_extra(o, bone)
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o, _ in extras:
        o.select_set(True)
    h.select_set(True)
    bpy.context.view_layer.objects.active = h
    bpy.ops.object.join()
    h.name = "rider"
    h.data.name = "rider"
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    return h, arm


def author(arm):
    p = Poser(arm)
    store = []
    for name, fn in POSES:
        fn(p)
        store.append({pb.name: pb.matrix_basis.copy() for pb in arm.pose.bones})
    p.reset()
    return store


def key(arm, store):
    for f, basis in enumerate(store):
        for pb in arm.pose.bones:
            pb.matrix_basis = basis[pb.name]
        for pb in arm.pose.bones:
            pb.keyframe_insert("rotation_quaternion", frame=f)
            if pb.name in ("pelvis", "Root"):
                pb.keyframe_insert("location", frame=f)
    sc = bpy.context.scene
    sc.frame_start = 0
    sc.frame_end = len(store) - 1
    sc.render.fps = 30


def lineup(h, arm, bike_objs, path):
    sc = bpy.context.scene
    made = []
    for f, (name, _) in enumerate(POSES):
        sc.frame_set(f)
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(h.evaluated_get(dg))
        o = bpy.data.objects.new("snap_" + name, me)
        sc.collection.objects.link(o)
        col, row = f % 6, f // 6
        o.location = (col * 1.5, 0, -row * 2.3)
        made.append(o)
        if 1 <= f <= 9:
            for b in bike_objs:
                c = b.copy()
                sc.collection.objects.link(c)
                c.location = o.location
                made.append(c)
    h.hide_render = True
    for b in bike_objs:
        b.hide_render = True
    for nm, loc, tgt in (("front", (3.75, 1.2, -13.5), (3.75, -1.4, 0)), ("back", (3.75, 1.2, 13.5), (3.75, -1.4, 0)), ("side", (-11.0, -1.4, -2.0), (3.75, -1.4, 0))):
        cam = bpy.data.cameras.new(nm)
        cam.lens = 60
        ob = bpy.data.objects.new(nm, cam)
        sc.collection.objects.link(ob)
        l, t = B(*loc), B(*tgt)
        ob.location = l
        ob.rotation_euler = (t - l).to_track_quat("-Z", "Y").to_euler()
        sc.camera = ob
        sc.render.engine = "BLENDER_WORKBENCH"
        sc.render.resolution_x, sc.render.resolution_y = 1500, 1100
        sh = sc.display.shading
        sh.light = "STUDIO"
        sh.color_type = "MATERIAL"
        sh.show_object_outline = True
        sh.show_cavity = True
        sc.render.filepath = f"{path}-{nm}.png"
        bpy.ops.render.render(write_still=True)
        bpy.data.objects.remove(ob)
    for o in made:
        bpy.data.objects.remove(o)
    h.hide_render = False
    for b in bike_objs:
        b.hide_render = False
    sc.frame_set(0)


CAST = {
    "a": {"gender": 1.0, "muscle": 0.62, "weight": 0.5, "height": 0.55, "age": 0.5},
    "b": {"gender": 0.0, "muscle": 0.5, "weight": 0.42, "height": 0.5, "age": 0.45},
    "c": {"gender": 1.0, "muscle": 0.85, "weight": 0.78, "height": 0.68, "age": 0.55},
}

if __name__ == "__main__":
    keys = [a for a in ARGS if a in CAST] or list(CAST)
    os.makedirs(MODELS, exist_ok=True)
    for key_ in keys:
        bike_objs = bike_mod.build()
        h, arm = build(CAST[key_])
        store = author(arm)
        key(arm, store)
        if SHOW:
            os.makedirs(PREVIEWS, exist_ok=True)
            lineup(h, arm, bike_objs, os.path.join(PREVIEWS, f"poses-{key_}"))
        for o in bpy.context.scene.objects:
            o.select_set(o is h or o is arm)
        bpy.context.view_layer.objects.active = arm
        bpy.ops.export_scene.gltf(
            filepath=os.path.join(MODELS, f"rider_{key_}.glb"),
            use_selection=True,
            export_apply=False,
            export_yup=True,
            export_skins=True,
            export_animations=True,
            export_animation_mode="SCENE",
            export_frame_range=True,
            export_force_sampling=True,
            export_optimize_animation_size=False,
            export_morph=False,
        )
        print("RIGGED", key_, len(h.data.polygons), "POSES", ",".join(n for n, _ in POSES))
