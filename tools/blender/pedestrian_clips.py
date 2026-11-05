import bpy, math
from mathutils import Matrix, Vector

FPS = 30
SOLE = 0.0
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
SIDES = (("_l", 1), ("_r", -1))
WALK = {
    "speed": 1.4, "period": 1.0, "stance": 0.62, "heel": 0.1, "rise": 0.4, "strike": 22, "toe_off": -48,
    "lift": 0.075, "kick": 1.0, "drop": 0.06, "bob": 0.018, "bob_turn": 0.0, "lean": 3, "arm": 22, "elbow": 22,
    "yaw": 5, "roll": 2.5, "ankle_x": 0.1, "spread": 0.12,
}
RUN = {
    "speed": 3.0, "period": 0.66, "stance": 0.4, "heel": 0.05, "rise": 0.18, "strike": 8, "toe_off": -40,
    "lift": 0.26, "kick": 0.62, "drop": 0.1, "bob": 0.03, "bob_turn": 0.5, "lean": 10, "arm": 27, "elbow": 74,
    "yaw": 8, "roll": 3, "ankle_x": 0.085, "spread": 0.16,
}


def smooth(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * (3 - 2 * t)


class Poser:
    def __init__(self, arm):
        self.arm = arm
        self.pbs = arm.pose.bones
        self.bones = arm.data.bones

    def upd(self):
        bpy.context.view_layer.update()

    def reset(self):
        for pb in self.pbs:
            pb.matrix_basis = Matrix.Identity(4)
        self.upd()

    def at(self, name):
        return self.pbs[name].matrix.to_translation()

    def rot(self, name, axis, deg):
        pb = self.pbs[name]
        hd = pb.matrix.to_translation()
        pb.matrix = Matrix.Translation(hd) @ Matrix.Rotation(math.radians(deg), 4, axis) @ Matrix.Translation(-hd) @ pb.matrix
        self.upd()

    def aim(self, name, direction):
        pb = self.pbs[name]
        hd = pb.matrix.to_translation()
        cur = (pb.matrix.to_3x3() @ Y).normalized()
        q = cur.rotation_difference(Vector(direction).normalized())
        pb.matrix = Matrix.Translation(hd) @ q.to_matrix().to_4x4() @ Matrix.Translation(-hd) @ pb.matrix
        self.upd()

    def move_pelvis(self, x=0.0, y=0.0, z=0.0):
        pb = self.pbs["pelvis"]
        pb.matrix = Matrix.Translation((x, y, z)) @ pb.matrix
        self.upd()

    def leg(self, s, sx, ankle, pitch, pole=(0.12, -1.0, 0.1), toe=None):
        reach = self.reach(s, ankle, Vector((pole[0] * sx, pole[1], pole[2])))
        self.foot(s, pitch, toe)
        return reach

    def reach(self, s, ankle, side):
        thigh = self.bones["thigh" + s]
        calf = self.bones["calf" + s]
        a, b = thigh.length, calf.length
        hip = self.at("thigh" + s)
        ankle = Vector(ankle)
        to = ankle - hip
        d = min(to.length, (a + b) * 0.9985)
        along = to.normalized()
        out = (a * a - b * b + d * d) / (2 * d)
        side = (side - along * side.dot(along)).normalized()
        knee = hip + along * out + side * math.sqrt(max(a * a - out * out, 0.0))
        self.aim("thigh" + s, knee - hip)
        self.aim("calf" + s, ankle - knee)
        return to.length / (a + b)

    def foot(self, s, pitch, toe=None):
        foot = self.bones["foot" + s]
        d = foot.tail_local - foot.head_local
        rest = math.atan2(d.z, -d.y)
        t = rest + math.radians(pitch)
        self.aim("foot" + s, (d.x * 0.3, -math.cos(t), math.sin(t)))
        flat = min(pitch, 0.0) if toe is None else toe
        ball = self.bones["ball" + s]
        bd = ball.tail_local - ball.head_local
        br = math.atan2(bd.z, -bd.y) + math.radians(pitch - flat)
        self.aim("ball" + s, (bd.x * 0.3, -math.cos(br), math.sin(br)))

    def arm_at(self, s, sx, swing, elbow, spread):
        a = math.radians(swing)
        e = math.radians(swing + elbow)
        self.aim("upperarm" + s, (sx * spread, -math.sin(a), -math.cos(a)))
        self.aim("lowerarm" + s, (sx * spread * 0.45, -math.sin(e), -math.cos(e)))
        self.aim("hand" + s, (sx * spread * 0.3, -math.sin(e + 0.12), -math.cos(e + 0.12)))

    def look(self, yaw=0.0, nod=0.0):
        self.aim("head", (0, -0.04, 1))
        self.aim("neck_01", (0, -0.1, 1))
        self.aim("head", (0, -0.04, 1))
        if yaw:
            self.rot("head", Z, yaw)
        if nod:
            self.rot("head", X, nod)


class Foot:
    def __init__(self, arm):
        b = arm.data.bones
        ankle = b["foot_l"].head_local
        ball = b["ball_l"].head_local
        self.ankle_z = ankle.z
        self.ball_f = -(ball.y - ankle.y)
        self.ball_z = ball.z
        self.heel_f = 0.055

    def from_heel(self, pitch):
        t = math.radians(pitch)
        return self.heel_f * math.cos(t) - self.ankle_z * math.sin(t), self.heel_f * math.sin(t) + self.ankle_z * math.cos(t)

    def from_ball(self, pitch):
        t = math.radians(pitch)
        f, z = -self.ball_f, self.ankle_z - self.ball_z
        return f * math.cos(t) - z * math.sin(t), f * math.sin(t) + z * math.cos(t)


def ankle_state(g, foot, phase):
    stride = g["speed"] * g["period"]
    s = g["stance"]
    heel_end = g["heel"]
    rise = g["rise"]
    ball_w = foot.heel_f + foot.ball_f
    if phase < heel_end:
        pitch = g["strike"] * (1 - smooth(phase / heel_end))
        f, z = foot.from_heel(pitch)
        return f, z, pitch
    if phase < rise:
        return foot.heel_f, foot.ankle_z, 0.0
    if phase < s:
        pitch = g["toe_off"] * smooth((phase - rise) / (s - rise))
        f, z = foot.from_ball(pitch)
        return ball_w + f, foot.ball_z + z, pitch
    t = (phase - s) / (1 - s)
    f0, z0 = foot.from_ball(g["toe_off"])
    f1, z1 = foot.from_heel(g["strike"])
    w0, w1 = ball_w + f0, stride + f1
    w = w0 + (w1 - w0) * smooth(t)
    z = foot.ball_z + z0 + (z1 - foot.ball_z - z0) * smooth(t) + g["lift"] * math.sin(math.pi * t ** g["kick"])
    pitch = g["toe_off"] + (g["strike"] - g["toe_off"]) * smooth(t * 1.15)
    return w, z, pitch


def gait(p, g, foot, phase):
    stride = g["speed"] * g["period"]
    mid = (g["heel"] + g["rise"]) / 2
    c = math.cos(math.tau * phase)
    p.reset()
    bob = g["bob"] * math.cos(math.tau * (2 * (phase - mid)) + math.tau * g["bob_turn"])
    sway = 0.012 * math.cos(math.tau * (phase - mid))
    p.move_pelvis(x=sway, z=-g["drop"] + bob + SOLE)
    p.rot("pelvis", Z, -g["yaw"] * c)
    p.rot("pelvis", Y, g["roll"] * math.cos(math.tau * (phase - mid)))
    p.rot("spine_01", X, g["lean"] * 0.4)
    p.rot("spine_02", X, g["lean"] * 0.4)
    p.rot("spine_02", Z, g["yaw"] * 0.9 * c)
    p.rot("spine_03", X, g["lean"] * 0.2)
    p.rot("spine_03", Z, g["yaw"] * 0.9 * c)
    p.look()
    reach = 0.0
    for s, sx in SIDES:
        at = (phase if sx == 1 else phase + 0.5) % 1.0
        w, z, pitch = ankle_state(g, foot, at)
        f = w - stride * at - (foot.heel_f - stride * mid)
        reach = max(reach, p.leg(s, sx, (sx * g["ankle_x"], -f, z + SOLE), pitch))
        swing = -g["arm"] * sx * c + g["lean"] * 0.8
        p.arm_at(s, sx, swing, g["elbow"] + max(0.0, swing) * 0.5, g["spread"])
    return reach


def plant(p, x=0.11, ly=0.0, ry=0.0):
    for s, sx in SIDES:
        p.leg(s, sx, (sx * x, (ly if sx == 1 else ry) - 0.022, p.bones["foot_l"].head_local.z + SOLE), 0.0)


def stand_pose(p, shift=0.0, breathe=0.0, yaw=0.0):
    p.reset()
    p.move_pelvis(x=shift, z=-0.014 + SOLE + breathe * 0.004)
    p.rot("spine_02", X, -1.0 + breathe * 0.8)
    p.rot("spine_03", X, -1.0 + breathe * 0.8)
    p.look(yaw=yaw)
    plant(p)
    for s, sx in SIDES:
        p.arm_at(s, sx, 2 + breathe, 14, 0.15)


def flinch_pose(p):
    p.reset()
    p.move_pelvis(y=0.05, z=-0.09 + SOLE)
    p.rot("pelvis", X, 6)
    p.rot("spine_01", X, 10)
    p.rot("spine_02", X, 12)
    p.rot("spine_03", X, 8)
    p.rot("head", X, 18)
    p.rot("head", Z, 22)
    plant(p, x=0.13, ly=-0.08, ry=0.1)
    for s, sx in SIDES:
        p.aim("upperarm" + s, (sx * 0.42, -0.72, 0.1 if sx == 1 else -0.12))
        p.aim("lowerarm" + s, (-sx * 0.42, -0.25, 0.86))
        p.aim("hand" + s, (-sx * 0.35, -0.05, 0.92))


def recoil_pose(p):
    p.reset()
    p.move_pelvis(y=0.16, z=-0.05 + SOLE)
    p.rot("pelvis", X, -8)
    p.rot("spine_01", X, 16)
    p.rot("spine_02", X, 18)
    p.rot("spine_03", X, 10)
    p.rot("head", X, 18)
    plant(p, x=0.13, ly=-0.02, ry=0.06)
    for s, sx in SIDES:
        p.aim("upperarm" + s, (sx * 0.8, -0.3, 0.1))
        p.aim("lowerarm" + s, (sx * 0.9, -0.3, 0.2))
        p.aim("hand" + s, (sx * 0.9, -0.2, 0.2))


def thrown_pose(p):
    p.reset()
    p.move_pelvis(y=0.42, z=-0.34 + SOLE)
    p.rot("pelvis", X, -42)
    p.rot("spine_01", X, 6)
    p.rot("spine_02", X, 8)
    p.rot("head", X, 14)
    for s, sx in SIDES:
        p.aim("thigh" + s, (sx * 0.2, -0.75, -0.25 if sx == 1 else -0.55))
        p.aim("calf" + s, (sx * 0.08, -0.15 if sx == 1 else -0.45, -0.95))
        p.foot(s, 18, toe=0.0)
        p.aim("upperarm" + s, (sx * 0.85, 0.15, 0.55))
        p.aim("lowerarm" + s, (sx * 0.65, 0.5, 0.6))
        p.aim("hand" + s, (sx * 0.6, 0.55, 0.55))


def landing_pose(p):
    p.reset()
    p.move_pelvis(y=0.56, z=-0.63 + SOLE)
    p.rot("pelvis", X, -78)
    p.rot("spine_01", X, -4)
    p.rot("head", X, 18)
    for s, sx in SIDES:
        p.aim("thigh" + s, (sx * 0.22, -0.92, 0.28 if sx == 1 else 0.12))
        p.aim("calf" + s, (sx * 0.1, -0.86, -0.42 if sx == 1 else -0.08))
        p.foot(s, 40, toe=0.0)
        p.aim("upperarm" + s, (sx * 0.86, 0.45, 0.12))
        p.aim("lowerarm" + s, (sx * 0.8, 0.5, 0.14))
        p.aim("hand" + s, (sx * 0.8, 0.5, 0.14))


def lie_pose(p, breathe=0.0):
    p.reset()
    p.move_pelvis(y=0.6, z=-0.7 + SOLE)
    p.rot("pelvis", X, -90)
    p.rot("spine_02", X, breathe * 1.2)
    p.rot("spine_03", X, -breathe * 1.2)
    p.aim("neck_01", (0, 1, 0.1))
    p.aim("head", (0.12, 1, 0.16))
    for s, sx in SIDES:
        p.aim("thigh" + s, (sx * 0.2, -1, 0.02 if sx == 1 else 0.22))
        p.aim("calf" + s, (sx * 0.1, -1, 0.01 if sx == 1 else -0.2))
        p.foot(s, 62, toe=0.0)
        p.aim("upperarm" + s, (sx * 0.84, 0.48, -0.02))
        p.aim("lowerarm" + s, (sx * 0.86, 0.3 if sx == 1 else -0.2, 0.02))
        p.aim("hand" + s, (sx * 0.86, 0.3 if sx == 1 else -0.2, 0.0))


def sit_pose(p):
    p.reset()
    p.move_pelvis(y=0.36, z=-0.74 + SOLE)
    p.rot("pelvis", X, -30)
    p.rot("spine_01", X, 12)
    p.rot("spine_02", X, 12)
    p.rot("spine_03", X, 10)
    p.look(nod=8)
    ankle = p.bones["foot_l"].head_local.z + SOLE
    p.leg("_l", 1, (0.17, -0.1, ankle), 0.0, pole=(0.25, -0.7, 1))
    p.leg("_r", -1, (-0.2, -0.28, ankle + 0.02), 18, pole=(0.3, -0.7, 1))
    for s, sx in SIDES:
        p.aim("upperarm" + s, (sx * 0.34, 0.5, -0.8))
        p.aim("lowerarm" + s, (sx * 0.24, 0.3, -0.92))
        p.aim("hand" + s, (sx * 0.3, 0.42, -0.25))


def kneel_pose(p):
    p.reset()
    p.move_pelvis(y=0.1, z=-0.44 + SOLE)
    p.rot("pelvis", X, 22)
    p.rot("spine_01", X, 12)
    p.rot("spine_02", X, 10)
    p.look(nod=6)
    ankle = p.bones["foot_l"].head_local.z + SOLE
    p.leg("_l", 1, (0.13, -0.16, ankle), 0.0)
    p.leg("_r", -1, (-0.13, 0.42, ankle + 0.07), -52, pole=(0.05, -1, -0.25))
    p.aim("upperarm_l", (0.2, -0.55, -0.8))
    p.aim("lowerarm_l", (-0.1, -0.2, -0.97))
    p.aim("hand_l", (-0.1, -0.2, -0.97))
    p.aim("upperarm_r", (-0.32, -0.25, -0.9))
    p.aim("lowerarm_r", (-0.2, -0.4, -0.9))
    p.aim("hand_r", (-0.2, -0.4, -0.9))


def rising_pose(p):
    p.reset()
    p.move_pelvis(y=0.03, z=-0.14 + SOLE)
    p.rot("pelvis", X, 16)
    p.rot("spine_01", X, 8)
    p.rot("spine_02", X, 6)
    p.look(nod=4)
    plant(p, x=0.12, ly=-0.08, ry=0.08)
    for s, sx in SIDES:
        p.arm_at(s, sx, 8 if sx == 1 else -4, 22, 0.2)


def bump(phase, rise_from, rise_to, fall_from, fall_to):
    return smooth((phase - rise_from) / (rise_to - rise_from)) * (1 - smooth((phase - fall_from) / (fall_to - fall_from)))


def browse_pose(p, phase):
    turn = math.tau * phase
    reach = bump(phase, 0.22, 0.42, 0.62, 0.82)
    stand_pose(p, shift=0.02 * math.sin(turn), breathe=math.sin(2 * turn), yaw=16 * math.sin(turn))
    p.rot("spine_01", X, 3 + 4 * reach)
    p.rot("spine_02", X, 3 + 5 * reach)
    p.rot("head", X, 10 + 6 * reach)
    p.arm_at("_l", 1, 18 + 4 * math.sin(turn), 62, 0.16)
    swing = 6 + 46 * reach
    p.arm_at("_r", -1, swing, 14 + 34 * reach, 0.18 - 0.1 * reach)
    if reach > 0:
        p.rot("hand_r", X, 26 * reach * math.sin(3 * turn))


def haggle_pose(p, phase):
    turn = math.tau * phase
    beat = math.sin(4 * turn)
    offer = bump(phase, 0.0, 0.1, 0.42, 0.52)
    refuse = bump(phase, 0.5, 0.6, 0.86, 0.96)
    stand_pose(p, shift=0.024 * math.sin(turn), breathe=math.sin(2 * turn), yaw=10 * math.sin(turn))
    p.rot("spine_02", X, 4 + 5 * offer - 5 * refuse)
    p.rot("spine_03", X, 2 + 3 * offer - 4 * refuse)
    p.rot("head", X, 7 * beat * offer)
    p.rot("head", Z, 22 * math.sin(6 * turn) * refuse)
    left_swing = 16 + 12 * refuse
    left_elbow = 62 + 20 * refuse + 14 * beat * offer
    right_swing = 26 + 22 * offer + 8 * refuse
    right_elbow = 66 + 24 * offer * (0.5 + 0.5 * beat) + 18 * refuse
    p.arm_at("_l", 1, left_swing, left_elbow, 0.18 + 0.34 * refuse)
    p.arm_at("_r", -1, right_swing, right_elbow, 0.16 + 0.34 * refuse)


def serve_pose(p, phase):
    turn = math.tau * phase
    scoop = bump(phase, 0.04, 0.2, 0.32, 0.46)
    hand_over = bump(phase, 0.42, 0.56, 0.72, 0.86)
    stand_pose(p, shift=0.03 * math.sin(turn), breathe=math.sin(2 * turn), yaw=-16 * scoop + 8 * hand_over)
    p.rot("spine_01", X, 5 + 7 * scoop + 2 * hand_over)
    p.rot("spine_02", X, 5 + 8 * scoop + 3 * hand_over)
    p.rot("spine_02", Z, 12 * scoop - 8 * hand_over)
    p.rot("head", X, 8 + 16 * scoop - 8 * hand_over)
    p.arm_at("_l", 1, 30 + 16 * scoop + 26 * hand_over, 42 + 24 * scoop + 8 * hand_over, 0.2 - 0.06 * hand_over)
    p.arm_at("_r", -1, 26 + 22 * scoop + 40 * hand_over, 44 + 22 * scoop + 10 * hand_over, 0.16 - 0.04 * hand_over)


def capture(p, fn):
    fn(p)
    pose = {pb.name: pb.matrix_basis.copy() for pb in p.pbs}
    feet = {}
    for s, _ in SIDES:
        feet[s] = {
            "ankle": p.at("foot" + s),
            "foot": p.pbs["foot" + s].matrix.to_3x3() @ Y,
            "ball": p.pbs["ball" + s].matrix.to_3x3() @ Y,
        }
    return pose, feet


def mix(a, b, t):
    out = {}
    for name in a:
        la, qa, _ = a[name].decompose()
        lb, qb, _ = b[name].decompose()
        q = qa.slerp(qb, t)
        out[name] = Matrix.Translation(la.lerp(lb, t)) @ q.to_matrix().to_4x4()
    return out


def keyed(p, keys):
    poses = [(t, *capture(p, fn)) for t, fn in keys]
    floor = p.bones["foot_l"].head_local.z + SOLE - 0.012
    frames = []
    total = round(poses[-1][0] * FPS)
    for f in range(total + 1):
        t = f / FPS
        for (t0, a, fa), (t1, b, fb) in zip(poses, poses[1:]):
            if t <= t1 + 1e-6:
                e = smooth((t - t0) / (t1 - t0))
                for name, basis in mix(a, b, e).items():
                    p.pbs[name].matrix_basis = basis
                p.upd()
                for s, _ in SIDES:
                    ankle = fa[s]["ankle"].lerp(fb[s]["ankle"], e)
                    ankle.z = max(ankle.z, floor)
                    p.reach(s, ankle, p.at("calf" + s) - p.at("thigh" + s))
                    p.aim("foot" + s, fa[s]["foot"].lerp(fb[s]["foot"], e))
                    p.aim("ball" + s, fa[s]["ball"].lerp(fb[s]["ball"], e))
                frames.append({pb.name: pb.matrix_basis.copy() for pb in p.pbs})
                break
    return frames


def loop_frames(p, count, fn):
    frames = []
    for f in range(count + 1):
        fn(p, (f % count) / count)
        frames.append({pb.name: pb.matrix_basis.copy() for pb in p.pbs})
    return frames


def author(arm):
    p = Poser(arm)
    foot = Foot(arm)
    reach = {}

    def looped(g, name):
        count = round(g["period"] * FPS)

        def one(pp, phase):
            reach[name] = max(reach.get(name, 0.0), gait(pp, g, foot, phase))

        return loop_frames(p, count, one)

    def wait(pp, phase):
        turn = math.tau * phase
        stand_pose(pp, shift=0.018 * math.sin(turn), breathe=math.sin(2 * turn), yaw=26 * math.sin(turn) ** 3)

    stores = {
        "walk": looped(WALK, "walk"),
        "run": looped(RUN, "run"),
        "wait": loop_frames(p, 90, wait),
        "browse": loop_frames(p, 90, browse_pose),
        "haggle": loop_frames(p, 90, haggle_pose),
        "serve": loop_frames(p, 90, serve_pose),
        "flinch": keyed(p, [(0.0, stand_pose), (0.12, flinch_pose), (0.3, flinch_pose), (0.5, stand_pose)]),
        "fall": keyed(p, [(0.0, stand_pose), (0.1, recoil_pose), (0.28, thrown_pose), (0.5, landing_pose), (0.72, lie_pose)]),
        "lie": loop_frames(p, 60, lambda pp, phase: lie_pose(pp, math.sin(math.tau * phase))),
        "get_up": keyed(p, [(0.0, lie_pose), (0.3, sit_pose), (0.65, kneel_pose), (0.95, rising_pose), (1.25, stand_pose)]),
    }
    print("REACH", {k: round(v, 3) for k, v in reach.items()})
    p.reset()
    return stores


def key_clips(arm, stores):
    arm.animation_data_create()
    actions = {}
    for name, frames in stores.items():
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        arm.animation_data.action = act
        for f, basis in enumerate(frames):
            for pb in arm.pose.bones:
                pb.matrix_basis = basis[pb.name]
                pb.keyframe_insert("rotation_quaternion", frame=f)
                if pb.name == "pelvis":
                    pb.keyframe_insert("location", frame=f)
        actions[name] = act
    sc = bpy.context.scene
    sc.render.fps = FPS
    return actions


def report(arm, bodies, actions, stores):
    sc = bpy.context.scene
    for name, frames in stores.items():
        worst, where = 0.0, ""
        for f, (a, b) in enumerate(zip(frames, frames[1:])):
            for bone in a:
                qa, qb = a[bone].to_quaternion(), b[bone].to_quaternion()
                d = math.degrees(qa.rotation_difference(qb).angle)
                if d > worst:
                    worst, where = d, f"{bone}@{f}"
        print("TURN", name, "frames", len(frames), "max deg/frame", round(worst, 1), where)
    for name, act in actions.items():
        arm.animation_data.action = act
        low = 9.0
        for f in range(0, len(stores[name]), 3):
            sc.frame_set(f)
            dg = bpy.context.evaluated_depsgraph_get()
            for h in bodies:
                me = h.evaluated_get(dg).to_mesh()
                z = min(v.co.z for v in me.vertices)
                h.evaluated_get(dg).to_mesh_clear()
                low = min(low, z)
        print("FLOOR", name, "lowest vertex z", round(low, 3))
    for clip in ("walk", "run"):
        arm.animation_data.action = actions[clip]
        g = WALK if clip == "walk" else RUN
        count = len(stores[clip]) - 1
        ball = {}
        for f in range(count):
            sc.frame_set(f)
            bpy.context.view_layer.update()
            phase = f / count
            if g["heel"] < phase < g["stance"]:
                at = arm.pose.bones["ball_l"].matrix.to_translation()
                ball[f] = (at.y - g["speed"] * f / FPS, at.z)
        ys = [v[0] for v in ball.values()]
        zs = [v[1] for v in ball.values()]
        print("SKATE", clip, "ball world y range", round(max(ys) - min(ys), 3), "z range", round(max(zs) - min(zs), 3), "z min", round(min(zs), 3))
