"""Retarget the on-foot loops from Quaternius' Universal Animation Library (CC0, see ual/PROVENANCE.md) onto the rider skeleton.

Blender -b -P tools/blender/rider_moves.py -- trim <AnimationLibrary_Godot_Standard.glb>
    Writes tools/blender/work/ual_moves.glb: the library's skeleton and the four loops below, no mesh. It sits outside
    out/ so `compress.ts` never stages it. The library file comes from the zip that ual/PROVENANCE.md pins by URL and
    hash; models are not committed.
Blender -b -P tools/blender/rider_moves.py -- <rider_a.glb>
    Writes tools/blender/out/rider_moves.glb: the rider skeleton, one animation per loop named as in MOVES, and `stand`,
    one frame of the rider's own standing pose. The game fits every other rider to these loops through `stand`.

Every loop starts on the frame the left heel lands. Rotations are copied in world space through a per-bone offset taken
with both skeletons in the same posture, so the two rest poses do not need to match. The pelvis carries the library's
hip travel scaled by the ratio of hip heights. Fingers are left out: the game keeps the standing pose's hands. Only the
bones below and the pelvis travel are written, at 30 frames a second.
"""
import bpy, math, os, sys
from mathutils import Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from rider_poses import POSE_FRAMES

SOURCE = os.path.join(HERE, "work", "ual_moves.glb")
OUT = os.path.join(HERE, "out", "rider_moves.glb")
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []

MOVES = {"walk": "Walk_Loop", "jog": "Jog_Fwd_Loop", "sprint": "Sprint_Loop", "idle": "Idle_Loop"}
# Each loop is retimed so a planted foot moves back at the gait's ground speed (m/s): the game's walk, Shift run and
# today's sprint. The library's jog swings its legs slowly for a 4.4 m/s run, so its swing is shortened until the cycle
# takes 0.714 s, 168 steps a minute, an easy runner's cadence. The walk and the sprint keep their authored swing.
RETIME = {"walk": (1.6, None), "jog": (4.4, 0.714), "sprint": (7.0, None)}
# The library's jog drops the hips 21 cm through each stance, twice a runner's bounce, and reads as a squat. Its hips keep
# this share of the drop below the loop's highest point, and the legs straighten so each foot keeps its path.
BOUNCE = {"jog": 0.4}

TORSO = {
    "pelvis": "DEF-hips", "spine_01": "DEF-spine.001", "spine_02": "DEF-spine.002", "spine_03": "DEF-spine.003",
    "neck_01": "DEF-neck", "head": "DEF-head",
}
LIMBS = {}
for ours, theirs in (("l", "L"), ("r", "R")):
    TORSO[f"clavicle_{ours}"] = f"DEF-shoulder.{theirs}"
    LIMBS.update({
        f"upperarm_{ours}": f"DEF-upper_arm.{theirs}", f"lowerarm_{ours}": f"DEF-forearm.{theirs}",
        f"hand_{ours}": f"DEF-hand.{theirs}", f"thigh_{ours}": f"DEF-thigh.{theirs}",
        f"calf_{ours}": f"DEF-shin.{theirs}", f"foot_{ours}": f"DEF-foot.{theirs}", f"ball_{ours}": f"DEF-toe.{theirs}",
    })
BONES = {**TORSO, **LIMBS}
CONTACT_REACH = 0.01
FPS = 30
STAND_FRAME = POSE_FRAMES.index("stand")


def imported(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    made = [o for o in bpy.data.objects if o not in before]
    return next(o for o in made if o.type == "ARMATURE"), made


def trim(library):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    arm, made = imported(library)
    for o in made:
        if o is not arm:
            bpy.data.objects.remove(o)
    keep = set(MOVES.values())
    for action in list(bpy.data.actions):
        if action.name not in keep:
            bpy.data.actions.remove(action)
    missing = keep - {a.name for a in bpy.data.actions}
    if missing:
        raise SystemExit(f"The library has no {', '.join(sorted(missing))}.")
    for action in bpy.data.actions:
        action.use_fake_user = True
    os.makedirs(os.path.dirname(SOURCE), exist_ok=True)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=SOURCE, use_selection=True, export_yup=True, export_animations=True,
        export_animation_mode="ACTIONS", export_force_sampling=True, export_optimize_animation_size=False,
    )
    print("TRIMMED", SOURCE, os.path.getsize(SOURCE), "bytes")


def world(arm, name):
    return arm.matrix_world @ arm.pose.bones[name].matrix


def settle():
    bpy.context.view_layer.update()


def depth(arm, name):
    bone, n = arm.data.bones[name], 0
    while bone.parent:
        bone, n = bone.parent, n + 1
    return n


def aim(arm, name, direction):
    pb = arm.pose.bones[name]
    M = world(arm, name)
    head = M.to_translation()
    turn = (M.to_3x3() @ Vector((0, 1, 0))).normalized().rotation_difference(direction.normalized())
    pb.matrix = arm.matrix_world.inverted() @ Matrix.Translation(head) @ turn.to_matrix().to_4x4() @ Matrix.Translation(-head) @ M
    settle()


def play(arm, action, frame):
    arm.animation_data.action = action
    if action.slots:
        arm.animation_data.action_slot = action.slots[0]
    bpy.context.scene.frame_set(frame)


def retarget(rider):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    theirs, made = imported(SOURCE)
    actions = {name: bpy.data.actions[source] for name, source in MOVES.items()}
    theirs.animation_data_create()
    theirs.animation_data.action = None
    for pb in theirs.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    bpy.context.scene.render.fps = FPS
    ours, mine = imported(rider)
    for o in mine:
        if o is not ours:
            bpy.data.objects.remove(o)
    poses = ours.animation_data.action
    first = int(poses.frame_range[0])
    if int(poses.frame_range[1]) - first < STAND_FRAME:
        raise SystemExit("The rider's pose clip has no stand frame.")
    play(ours, poses, first + STAND_FRAME)
    stand = {bone: ours.pose.bones[bone].matrix_basis.to_quaternion() for bone in BONES}
    ours.animation_data_clear()
    bpy.data.actions.remove(poses)
    for action in [a for a in bpy.data.actions if a not in actions.values()]:
        bpy.data.actions.remove(action)
    for pb in ours.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.matrix_basis = Matrix.Identity(4)
    settle()
    order = sorted(BONES, key=lambda name: depth(ours, name))
    for name in order:
        if name in LIMBS:
            rest = world(theirs, LIMBS[name])
            aim(ours, name, rest.to_3x3() @ Vector((0, 1, 0)))
    offsets = {
        name: world(theirs, BONES[name]).to_quaternion().inverted() @ world(ours, name).to_quaternion()
        for name in order
    }
    hip_ratio = world(ours, "pelvis").to_translation().z / world(theirs, "DEF-hips").to_translation().z
    their_hips = world(theirs, "DEF-hips").to_translation()
    our_hips = world(ours, "pelvis").to_translation()
    for pb in ours.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    settle()
    ours.animation_data_create()
    fps = FPS
    made_actions = [keyed(ours, "stand", [{bone: (turn, Vector()) for bone, turn in stand.items()}], order)]
    for name, source in actions.items():
        first, last = (int(v) for v in source.frame_range)
        frames = []
        for frame in range(first, last + 1):
            play(theirs, source, frame)
            for bone in order:
                M = world(theirs, BONES[bone])
                turn = M.to_quaternion() @ offsets[bone]
                head = world(ours, bone).to_translation()
                if bone == "pelvis":
                    head = our_hips + (M.to_translation() - their_hips) * hip_ratio
                ours.pose.bones[bone].matrix = ours.matrix_world.inverted() @ Matrix.LocRotScale(head, turn, Vector((1, 1, 1)))
                settle()
            frames.append({
                bone: (ours.pose.bones[bone].rotation_quaternion.copy(), ours.pose.bones[bone].location.copy())
                for bone in order
            } | {
                "ankle": (world(ours, "foot_l").to_translation(), world(ours, "foot_r").to_translation()),
                "ball": (world(ours, "ball_l").to_translation(), world(ours, "ball_r").to_translation()),
            })
        if len(frames) > 2 and all(
            frames[0][b][0].rotation_difference(frames[-1][b][0]).angle < 1e-3 for b in order
        ):
            frames.pop()
        start = 0
        if name != "idle":
            start = strike(frames, 0)
        frames = frames[start:] + frames[:start]
        if name in BOUNCE:
            steadied(ours, frames, order, BOUNCE[name])
        if name in RETIME:
            frames = retimed(frames, *RETIME[name], fps, order)
        made_actions.append(keyed(ours, name, frames, order))
        report(name, frames, fps)
    for o in made:
        bpy.data.objects.remove(o)
    for action in actions.values():
        bpy.data.actions.remove(action)
    ours.animation_data.action = None
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    ours.select_set(True)
    bpy.context.view_layer.objects.active = ours
    bpy.ops.export_scene.gltf(
        filepath=OUT, use_selection=True, export_yup=True, export_skins=False, export_animations=True,
        export_animation_mode="ACTIONS", export_force_sampling=False, export_optimize_animation_size=False,
    )
    print("MOVES", OUT, os.path.getsize(OUT), "bytes", ",".join(a.name for a in made_actions))


def posed(arm, frame, order):
    for bone in order:
        arm.pose.bones[bone].rotation_quaternion, arm.pose.bones[bone].location = frame[bone]
    settle()


def turn_about(arm, name, turn):
    M = world(arm, name)
    head = M.to_translation()
    arm.pose.bones[name].matrix = (
        arm.matrix_world.inverted() @ Matrix.Translation(head) @ turn.to_matrix().to_4x4() @ Matrix.Translation(-head) @ M
    )
    settle()


def reach(arm, side, foot):
    """Bend one leg so its ankle lands on the ankle of `foot`, a world matrix, and turn the foot back to it."""
    hip, knee = world(arm, f"thigh_{side}").to_translation(), world(arm, f"calf_{side}").to_translation()
    ankle, goal = world(arm, f"foot_{side}").to_translation(), foot.to_translation()
    upper, lower = (knee - hip).length, (ankle - knee).length
    toward = goal - hip
    span = min(max(toward.length, abs(upper - lower) + 1e-4), upper + lower - 1e-4)
    toward.normalize()
    bend = (knee - hip) - toward * (knee - hip).dot(toward)
    if bend.length < 1e-6:
        return
    bend.normalize()
    cosine = (upper * upper + span * span - lower * lower) / (2 * upper * span)
    placed = hip + toward * upper * cosine + bend * upper * math.sqrt(max(0.0, 1 - cosine * cosine))
    turn_about(arm, f"thigh_{side}", (knee - hip).rotation_difference(placed - hip))
    knee, ankle = world(arm, f"calf_{side}").to_translation(), world(arm, f"foot_{side}").to_translation()
    turn_about(arm, f"calf_{side}", (ankle - knee).rotation_difference(goal - knee))
    head = world(arm, f"foot_{side}").to_translation()
    arm.pose.bones[f"foot_{side}"].matrix = arm.matrix_world.inverted() @ Matrix.LocRotScale(
        head, foot.to_quaternion(), Vector((1, 1, 1))
    )
    settle()


def steadied(arm, frames, order, keep):
    """Raise the hips to `keep` of their drop below the loop's highest point, keeping every foot where it was."""
    heights = []
    for frame in frames:
        posed(arm, frame, order)
        heights.append(world(arm, "pelvis").to_translation().z)
    top = max(heights)
    legs = [f"{part}_{side}" for side in ("l", "r") for part in ("thigh", "calf", "foot")]
    for frame, height in zip(frames, heights):
        posed(arm, frame, order)
        feet = {side: world(arm, f"foot_{side}").copy() for side in ("l", "r")}
        hips = world(arm, "pelvis")
        hips.translation.z = top + keep * (height - top)
        arm.pose.bones["pelvis"].matrix = arm.matrix_world.inverted() @ hips
        settle()
        for side, foot in feet.items():
            reach(arm, side, foot)
        for bone in ["pelvis", *legs]:
            pb = arm.pose.bones[bone]
            frame[bone] = (pb.rotation_quaternion.copy(), pb.location.copy())


def keyed(arm, name, frames, order):
    """One action holding each frame's bone turns, and the pelvis travel, as linear keys."""
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    arm.animation_data.action = action
    for i, pose in enumerate(frames):
        for bone in order:
            pb = arm.pose.bones[bone]
            pb.rotation_quaternion, pb.location = pose[bone]
            pb.keyframe_insert("rotation_quaternion", frame=i)
            if bone == "pelvis":
                pb.keyframe_insert("location", frame=i)
    for curve in action.fcurves if hasattr(action, "fcurves") else (c for layer in action.layers for strip in layer.strips for bag in strip.channelbags for c in bag.fcurves):
        for point in curve.keyframe_points:
            point.interpolation = "LINEAR"
    return action


def strike(frames, side):
    """The first frame on which a heel comes down, when the ankle drops to within CONTACT_REACH of its lowest."""
    heel = min(f["ankle"][side].z for f in frames) + CONTACT_REACH
    return next(i for i in range(len(frames)) if frames[i]["ankle"][side].z < heel <= frames[i - 1]["ankle"][side].z)


def planted_travel(frames, i, j, side):
    """How far the ball of one foot moves back between two frames while it is down, or None when it is not down. The
    heel lands first in some loops; those frames keep their authored length."""
    low = min(f["ball"][side].z for f in frames) + 2 * CONTACT_REACH
    a, b = frames[i]["ball"][side], frames[j]["ball"][side]
    return b.y - a.y if a.z < low and b.z < low and b.y > a.y else None


def retimed(frames, speed, cycle, fps, order):
    """Resample a loop so a planted foot moves back at `speed`; the other intervals keep their authored length, or share
    what is left of `cycle` seconds."""
    n = len(frames)
    lengths, swinging = [], []
    for i in range(n):
        travels = [t for t in (planted_travel(frames, i, (i + 1) % n, side) for side in (0, 1)) if t]
        lengths.append(max(travels) / speed if travels else 1 / fps)
        swinging.append(not travels)
    if cycle is not None:
        planted = sum(l for l, s in zip(lengths, swinging) if not s)
        swing = sum(l for l, s in zip(lengths, swinging) if s)
        if planted >= cycle:
            raise SystemExit(f"A {cycle} s cycle leaves no time to swing.")
        lengths = [l * (cycle - planted) / swing if s else l for l, s in zip(lengths, swinging)]
    total = sum(lengths)
    count = max(2, round(total * fps))
    out = []
    i, start = 0, 0.0
    for k in range(count):
        t = k * total / count
        while start + lengths[i] < t:
            start += lengths[i]
            i += 1
        a, b = frames[i], frames[(i + 1) % n]
        f = (t - start) / lengths[i]
        pose = {bone: (a[bone][0].slerp(b[bone][0], f), a[bone][1].lerp(b[bone][1], f)) for bone in order}
        for point in ("ankle", "ball"):
            pose[point] = tuple(a[point][side].lerp(b[point][side], f) for side in (0, 1))
        out.append(pose)
    return out


def report(name, frames, fps):
    n = len(frames)
    if name == "idle":
        print("CLIP", name, "frames", n, "seconds", round(n / fps, 3))
        return
    sole = [[min(f["ankle"][s].z, f["ball"][s].z) for f in frames] for s in (0, 1)]
    lows = [min(each) for each in sole]
    right = strike(frames, 1)
    steps = [t * fps for t in (planted_travel(frames, i, (i + 1) % n, 0) for i in range(n)) if t]
    speed = sum(steps) / len(steps) if steps else 0
    if os.environ.get("MOVES_TRACE"):
        for i, f in enumerate(frames):
            print("TRACE", name, i, *(round(v, 3) for v in (f["ankle"][0].y, f["ankle"][0].z, f["ball"][0].y, f["ball"][0].z, f["ankle"][1].z)))
    print("CLIP", name, "frames", n, "seconds", round(n / fps, 3), "right contact at", round(right / n, 3),
          "planted intervals", len(steps), "foot speed", round(speed, 3), "min", round(min(steps), 3), "max", round(max(steps), 3), "stride", round(speed * n / fps, 3))


if __name__ == "__main__":
    if ARGS[:1] == ["trim"]:
        trim(ARGS[1])
    else:
        retarget(ARGS[0])
