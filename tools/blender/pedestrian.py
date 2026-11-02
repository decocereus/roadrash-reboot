import bpy, bmesh, math, os, sys
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from common import ARGS, MODELS, PREVIEWS
from pedestrian_clips import author, key_clips, report, smooth

HEIGHT = 1.7
DECIMATE = 0.15
YOKE = 1.3
BELT = (0.93, 0.975)
POCKET = (0.97, 1.09)
ARM_BONES = ("clavicle", "upperarm", "lowerarm", "hand")
LEG_BONES = ("thigh", "calf", "foot", "ball")
SIDES = ("_l", "_r")
KEPT = ["Root", "pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "head"] + [b + s for b in ARM_BONES + LEG_BONES for s in SIDES]
FINGERS = ("index", "middle", "ring", "pinky", "thumb")
ZONES = ("skin", "hair", "top", "bottom", "shoes", "accent", "dark", "white")
Z = {name: i for i, name in enumerate(ZONES)}
SHOE_TOP = 0.105
SHOE = (
    (0.075, 0.026, 0.004, 0.06, "foot"),
    (0.06, 0.042, 0.0, 0.1, "foot"),
    (0.02, 0.05, 0.0, 0.125, "foot"),
    (-0.04, 0.05, 0.0, 0.105, "foot"),
    (-0.1, 0.052, 0.0, 0.082, "foot"),
    (-0.165, 0.054, 0.0, 0.066, "ball"),
    (-0.215, 0.044, 0.0, 0.052, "ball"),
    (-0.24, 0.022, 0.006, 0.036, "ball"),
)
PUFF = {"skin": 0.0, "hair": 0.016, "top": 0.016, "bottom": 0.011, "shoes": 0.012, "accent": 0.018, "dark": 0.0, "white": 0.0}
OUTFITS = [
    ("e8b796", "16130f", "2b2f3a", "1d2230", "e6e2d8", "25e0d4"),
    ("c68a5e", "3c2417", "b3263b", "23202a", "15141a", "f2c230"),
    ("f1c8a8", "8d8d8d", "e7dcc4", "39414d", "4a2f20", "d9562b"),
    ("8d5a3a", "0e0c0b", "1f5c4d", "c9b998", "2b2b2b", "f4efe6"),
    ("d9a47c", "e8517f", "6a2fa0", "15131c", "f040a0", "ff3fa4"),
    ("5f3a27", "241a12", "d9892a", "2a3350", "eeeeee", "1f2a44"),
    ("f1c8a8", "caa46a", "2458c9", "8a8f98", "1a1a1f", "f7f7f2"),
    ("b67c52", "36d1c4", "141318", "141318", "141318", "ff2d55"),
]
DARK = "0c0b10"
WHITE = "e9e6df"
BODIES = {
    "man": {
        "macro": {"gender": 1.0, "age": 0.5, "muscle": 0.5, "weight": 0.5, "height": 0.52},
        "hem": 0.89,
        "sleeve": ("lowerarm", 0.92),
        "legs": ("calf", 0.97),
        "panel": ("zip",),
        "wear": (),
    },
    "woman": {
        "macro": {"gender": 0.0, "age": 0.5, "muscle": 0.45, "weight": 0.45, "height": 0.62, "cupsize": 0.3},
        "hem": 0.91,
        "sleeve": ("lowerarm", 0.45),
        "legs": ("calf", 0.97),
        "panel": ("yoke",),
        "wear": ("long_hair",),
    },
    "heavy": {
        "macro": {"gender": 1.0, "age": 0.8, "muscle": 0.35, "weight": 0.88, "height": 0.56},
        "hem": 0.89,
        "sleeve": ("lowerarm", 0.92),
        "legs": ("calf", 0.97),
        "panel": ("belt",),
        "wear": ("cap", "beard"),
    },
    "slim": {
        "macro": {"gender": 0.0, "age": 0.5, "muscle": 0.4, "weight": 0.3, "height": 0.62, "cupsize": 0.25},
        "hem": 0.88,
        "sleeve": ("lowerarm", 0.92),
        "legs": ("thigh", 0.72),
        "panel": ("pocket",),
        "wear": ("bob", "hood", "backpack"),
    },
    "older": {
        "macro": {"gender": 0.0, "age": 0.8, "muscle": 0.35, "weight": 0.76, "height": 0.5, "cupsize": 0.4},
        "hem": 0.89,
        "sleeve": ("lowerarm", 0.92),
        "legs": ("calf", 0.97),
        "panel": ("belt",),
        "wear": ("bun", "scarf"),
    },
    "sporty": {
        "macro": {"gender": 0.0, "age": 0.5, "muscle": 0.62, "weight": 0.42, "height": 0.6, "cupsize": 0.25},
        "hem": 0.9,
        "sleeve": ("upperarm", 0.62),
        "legs": ("thigh", 0.6),
        "panel": ("zip",),
        "wear": ("ponytail",),
    },
}


def make_human(macro):
    from bl_ext.blender_org.mpfb.services.humanservice import HumanService
    from bl_ext.blender_org.mpfb.services.targetservice import TargetService

    before = set(bpy.data.objects)
    m = TargetService.get_default_macro_info_dict()
    m.update(macro)
    h = HumanService.create_human(scale=0.1, feet_on_ground=True, macro_detail_dict=m)
    HumanService.add_builtin_rig(h, "game_engine", import_weights=True)
    arm = next(o for o in set(bpy.data.objects) - before if o.type == "ARMATURE")
    return h, arm


def eye_centres(h):
    mask = next(m for m in h.modifiers if m.type == "MASK")
    arm_mod = next(m for m in h.modifiers if m.type == "ARMATURE")
    mask.show_viewport = False
    arm_mod.show_viewport = False
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(h.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    index = h.vertex_groups["helper-l-eye"].index
    pts = [v.co.copy() for v in me.vertices if any(g.group == index and g.weight > 0.5 for g in v.groups)]
    bpy.data.meshes.remove(me)
    mask.show_viewport = True
    return sum(pts, Vector()) / len(pts)


def curl_fingers(arm):
    for s in SIDES:
        for finger in FINGERS:
            for joint, deg in zip(("_01", "_02", "_03"), (38, 48, 34) if finger != "thumb" else (6, 14, 14)):
                pb = arm.pose.bones[finger + joint + s]
                pb.rotation_mode = "XYZ"
                pb.rotation_euler = (math.radians(deg), 0, 0)
    bpy.context.view_layer.update()


def bake(h):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(h.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    h.modifiers.clear()
    h.data = me


def merge_weights(h):
    groups = h.vertex_groups
    for finger in FINGERS:
        for joint in ("_01", "_02", "_03"):
            for s in SIDES:
                src = groups.get(finger + joint + s)
                if src is None:
                    continue
                hand = groups["hand" + s]
                for v in h.data.vertices:
                    for g in v.groups:
                        if g.group == src.index:
                            hand.add([v.index], g.weight, "ADD")
    for g in list(groups):
        if g.name not in KEPT or g.name == "Root":
            groups.remove(g)


def rest_of(arm, scale):
    out = {}
    for name in KEPT:
        b = arm.data.bones[name]
        out[name] = {"head": b.head_local * scale, "tail": b.tail_local * scale, "matrix": b.matrix_local.copy()}
    return out


def canonical_skeleton(arm, rests):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    edit = arm.data.edit_bones
    for b in list(edit):
        if b.name not in KEPT:
            edit.remove(b)
    for name in KEPT:
        edit[name].head = sum((r[name]["head"] for r in rests), Vector()) / len(rests)
        edit[name].tail = sum((r[name]["tail"] for r in rests), Vector()) / len(rests)
    for b in edit:
        if b.name != "Root" and b.parent and (b.head - b.parent.tail).length < 1e-4:
            b.head = b.parent.tail
    bpy.ops.object.mode_set(mode="OBJECT")
    arm.name = "pedestrian"
    arm.data.name = "pedestrian"
    return arm


def rebase(h, rest, arm, scale):
    me = h.data
    names = {g.index: g.name for g in h.vertex_groups}
    moves = {}
    for name in KEPT:
        if name == "Root":
            continue
        canon = arm.data.bones[name]
        r = rest[name]
        rot = r["matrix"].to_quaternion().to_matrix().to_4x4()
        src = Matrix.Translation(r["head"]) @ rot
        stretch = Matrix.Identity(4)
        stretch[1][1] = canon.length / max((r["tail"] - r["head"]).length, 1e-5)
        moves[name] = canon.matrix_local @ stretch @ src.inverted()
    for v in me.vertices:
        co = v.co * scale
        total = 0.0
        out = Vector()
        for g in v.groups:
            name = names.get(g.group)
            if name in moves and g.weight > 0:
                out += (moves[name] @ co) * g.weight
                total += g.weight
        v.co = out / total if total else co


def soften_and_decimate(h):
    groups = h.vertex_groups
    head = groups["head"].index
    foot = {groups["foot_l"].index, groups["foot_r"].index, groups["ball_l"].index, groups["ball_r"].index}
    soft = groups.new(name="soft")
    shoe = groups.new(name="shoe")
    for v in h.data.vertices:
        w = sum(g.weight for g in v.groups if g.group == head)
        soft.add([v.index], 1 - w * 0.75, "REPLACE")
        shoe.add([v.index], sum(g.weight for g in v.groups if g.group in foot), "REPLACE")
    melt = h.modifiers.new("melt", "SMOOTH")
    melt.factor = 1.0
    melt.iterations = 30
    melt.vertex_group = "shoe"
    sm = h.modifiers.new("soften", "SMOOTH")
    sm.factor = 0.7
    sm.iterations = 10
    sm.vertex_group = "soft"
    dec = h.modifiers.new("reduce", "DECIMATE")
    dec.decimate_type = "COLLAPSE"
    dec.ratio = DECIMATE
    dec.use_symmetry = True
    dec.symmetry_axis = "X"
    bake(h)
    for name in ("soft", "shoe"):
        groups.remove(groups[name])


class Shape:
    def __init__(self, arm):
        self.b = arm.data.bones

    def head(self, name):
        return self.b[name].head_local.copy()

    def tail(self, name):
        return self.b[name].tail_local.copy()

    def along(self, name, co):
        h, t = self.head(name), self.tail(name)
        d = t - h
        return (co - h).dot(d) / d.length_squared

    def point(self, name, t):
        return self.head(name).lerp(self.tail(name), t)

    def axis(self, name):
        return (self.tail(name) - self.head(name)).normalized()


def hair_plane(shape):
    h = shape.head("head")
    return h + Vector((0, -0.075, 0.075)), Vector((0, 0.62, 0.78)).normalized()


def dominant(v, dl, names):
    best, bw = "", 0.0
    for gi, w in v[dl].items():
        if w > bw and gi in names:
            best, bw = names[gi], w
    return best


def face_bone(f, dl, names):
    votes = {}
    for v in f.verts:
        n = dominant(v, dl, names)
        votes[n] = votes.get(n, 0) + 1
    return max(votes, key=votes.get)


def part_of(bone):
    return bone.rsplit("_", 1)[0] if bone.endswith(SIDES) else bone


def paint(h, style, shape):
    me = h.data
    bm = bmesh.new()
    bm.from_mesh(me)
    for layer in list(bm.loops.layers.uv.values()):
        bm.loops.layers.uv.remove(layer)
    bmesh.ops.dissolve_degenerate(bm, dist=0.003, edges=bm.edges[:])
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    dl = bm.verts.layers.deform.verify()
    names = {g.index: g.name for g in h.vertex_groups}

    def cut(co, no, parts):
        faces = [f for f in bm.faces if part_of(face_bone(f, dl, names)) in parts]
        verts = list({v for f in faces for v in f.verts})
        edges = list({e for f in faces for e in f.edges})
        bmesh.ops.bisect_plane(bm, geom=verts + edges + faces, dist=1e-5, plane_co=co, plane_no=no)

    neck = shape.point("neck_01", 0.3)
    hp, hn = hair_plane(shape)
    hem = style["hem"]
    trunk = ("pelvis", "spine_01", "spine_02", "spine_03", "clavicle", "thigh")
    sleeve_part, sleeve = style["sleeve"]
    legs_part, legs = style["legs"]
    cut(neck, Vector((0, 0, 1)), ("head", "neck_01", "spine_03", "clavicle"))
    cut(hp, hn, ("head",))
    cut(Vector((0, 0, hem)), Vector((0, 0, 1)), ("pelvis", "spine_01", "thigh"))
    cut(Vector((0, 0, SHOE_TOP)), Vector((0, 0, 1)), ("calf", "foot", "ball"))
    for s in SIDES:
        cut(shape.point(sleeve_part + s, sleeve), shape.axis(sleeve_part + s), ("upperarm", "lowerarm", "hand"))
        cut(shape.point(legs_part + s, legs), shape.axis(legs_part + s), ("thigh", "calf"))
    jaw_z = shape.head("head").z + 0.005
    if "beard" in style["wear"]:
        cut(Vector((0, 0, jaw_z)), Vector((0, 0, 1)), ("head",))
    panel = style["panel"][0]
    if panel == "zip":
        for x in (-0.016, 0.016):
            cut(Vector((x, 0, 0)), Vector((1, 0, 0)), trunk)
    elif panel == "yoke":
        cut(Vector((0, 0, YOKE)), Vector((0, 0, 1)), trunk + ("upperarm",))
    elif panel == "belt":
        for z in BELT:
            cut(Vector((0, 0, z)), Vector((0, 0, 1)), trunk)
    elif panel == "pocket":
        for z in POCKET:
            cut(Vector((0, 0, z)), Vector((0, 0, 1)), trunk)
        for x in (-0.1, 0.1):
            cut(Vector((x, 0, 0)), Vector((1, 0, 0)), trunk)

    def arm_zone(side, c, part):
        if sleeve_part == "upperarm":
            covered = part in ("upperarm", "clavicle") and shape.along("upperarm" + side, c) < sleeve
        else:
            covered = part in ("upperarm", "clavicle") or shape.along("lowerarm" + side, c) < sleeve
        if not covered:
            return "skin"
        return "accent" if panel == "yoke" and c.z > YOKE else "top"

    def leg_zone(side, c):
        if c.z < SHOE_TOP:
            return "shoes"
        if legs_part == "thigh":
            return "skin" if shape.along("thigh" + side, c) > legs else "bottom"
        return "skin" if shape.along("calf" + side, c) > legs else "bottom"

    def zone(f):
        c = f.calc_center_median()
        bone = face_bone(f, dl, names)
        part = part_of(bone)
        side = bone[-2:] if bone.endswith(SIDES) else ""
        if part == "head" or part == "neck_01":
            if c.z < neck.z:
                return "top"
            if part == "head" and (c - hp).dot(hn) > 0:
                return "hair"
            if part == "head" and "beard" in style["wear"] and c.z < jaw_z and c.y < shape.head("head").y + 0.02:
                return "hair"
            return "skin"
        if part in ("clavicle", "upperarm", "lowerarm", "hand"):
            return arm_zone(side, c, part)
        if c.z < hem:
            if part in ("pelvis", "spine_01"):
                return "bottom"
            return leg_zone(side or ("_l" if c.x > 0 else "_r"), c)
        if panel == "zip" and abs(c.x) < 0.016 and c.y < -0.04:
            return "accent"
        if panel == "belt" and BELT[0] < c.z < BELT[1]:
            return "accent"
        if panel == "pocket" and POCKET[0] < c.z < POCKET[1] and c.y < 0.0 and abs(c.x) < 0.1:
            return "accent"
        if panel == "yoke" and c.z > YOKE:
            return "accent"
        return "top"

    feet = [f for f in bm.faces if f.calc_center_median().z < SHOE_TOP]
    bmesh.ops.delete(bm, geom=feet, context="FACES_ONLY")
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context="VERTS")
    uv = bm.loops.layers.uv.new("UV")
    puff = {}
    for f in bm.faces:
        name = zone(f)
        at = zone_uv(name)
        for loop in f.loops:
            loop[uv].uv = at
            puff[loop.vert] = max(puff.get(loop.vert, 0.0), PUFF[name])
    bm.normal_update()
    for v, out in puff.items():
        flare = 0.0
        if out == PUFF["top"] or out == PUFF["accent"]:
            flare = 0.018 * smooth((hem + 0.14 - v.co.z) / 0.14)
        elif out == PUFF["bottom"] and v.co.z < 0.5:
            flare = 0.016 * smooth((0.5 - v.co.z) / 0.35)
        v.co += v.normal * (out + flare)
    clothed = [v for v, out in puff.items() if out > 0.0]
    bmesh.ops.smooth_vert(bm, verts=clothed, factor=0.35, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.to_mesh(me)
    bm.free()


def zone_uv(name):
    return ((Z[name] + 0.5) / len(ZONES), 1 - 0.5 / len(OUTFITS))


def solid(arm, name, bm, zone, bones):
    uv = bm.loops.layers.uv.new("UV")
    for f in bm.faces:
        at = zone_uv(zone(f) if callable(zone) else zone)
        for loop in f.loops:
            loop[uv].uv = at
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    for bone in set(bones if isinstance(bones, list) else [bones]):
        ob.vertex_groups.new(name=bone)
    for v in me.vertices:
        bone = bones[v.index] if isinstance(bones, list) else bones
        ob.vertex_groups[bone].add([v.index], 1.0, "REPLACE")
    return ob


def ellipsoid(arm, name, centre, radii, zone, bone, tilt=0.0, seg=10, rings=7):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    m = Matrix.Translation(centre) @ Matrix.Rotation(math.radians(tilt), 4, "X") @ Matrix.Diagonal((*radii, 1))
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return solid(arm, name, bm, zone, bone)


def loft(arm, name, rings, zone, n=8):
    bm = bmesh.new()
    loops = []
    bones = []
    for centre, (rx, ry), bone in rings:
        ring = []
        for j in range(n):
            a = j / n * math.tau
            ring.append(bm.verts.new(Vector(centre) + Vector((rx * math.cos(a), ry * math.sin(a), 0))))
            bones.append(bone)
        loops.append(ring)
    for a, b in zip(loops, loops[1:]):
        for i in range(n):
            bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    bm.faces.new(loops[0])
    bm.faces.new(loops[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.verts.index_update()
    return solid(arm, name, bm, zone, bones)


def shoe(arm, shape, s):
    ankle = shape.head("foot" + s)
    ball = shape.head("ball" + s)
    bm = bmesh.new()
    rings = []
    bones = []
    n = 12
    for y, w, low, high, bone in SHOE:
        ring = []
        for j in range(n):
            a = j / n * math.tau
            cx, cz = math.cos(a), math.sin(a)
            px = math.copysign(abs(cx) ** 0.7, cx)
            pz = math.copysign(abs(cz) ** 0.6, cz)
            x = ankle.x + (ball.x - ankle.x) * max(-y, 0.0) / 0.2
            ring.append(bm.verts.new((x + px * w, ankle.y + y, (low + high) / 2 + pz * (high - low) / 2)))
            bones.append(bone + s)
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    bm.faces.new(rings[0])
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.verts.index_update()
    return solid(arm, "shoe", bm, lambda f: "dark" if f.calc_center_median().z < 0.018 else "shoes", bones)


def wear(arm, style, shape, eye):
    head = shape.head("head")
    top = shape.tail("head")
    centre = head.lerp(top, 0.55) + Vector((0, 0.005, 0))
    back = shape.tail("spine_03")
    parts = []
    for sx in (1, -1):
        at = Vector((sx * abs(eye.x), eye.y, eye.z))
        parts.append(ellipsoid(arm, "eye", at + Vector((0, 0.002, 0)), (0.019, 0.012, 0.012), "white", "head", seg=8, rings=5))
        parts.append(ellipsoid(arm, "iris", at + Vector((0, -0.0085, 0)), (0.008, 0.004, 0.0085), "dark", "head", seg=8, rings=5))
        parts.append(ellipsoid(arm, "brow", at + Vector((0, -0.009, 0.021)), (0.017, 0.006, 0.0035), "hair", "head", seg=6, rings=4))
    items = style["wear"]
    parts += [shoe(arm, shape, s) for s in SIDES]
    if "long_hair" in items:
        parts.append(loft(arm, "hair", [
            ((0, 0.055, centre.z + 0.05), (0.075, 0.055), "head"),
            ((0, 0.075, centre.z - 0.05), (0.09, 0.05), "head"),
            ((0, 0.085, centre.z - 0.16), (0.085, 0.04), "neck_01"),
            ((0, 0.09, centre.z - 0.3), (0.075, 0.028), "spine_03"),
            ((0, 0.085, centre.z - 0.4), (0.03, 0.012), "spine_03"),
        ], "hair"))
    if "bob" in items:
        parts.append(loft(arm, "hair", [
            ((0, 0.05, centre.z + 0.05), (0.08, 0.06), "head"),
            ((0, 0.05, centre.z - 0.03), (0.098, 0.068), "head"),
            ((0, 0.05, centre.z - 0.1), (0.098, 0.066), "head"),
            ((0, 0.05, centre.z - 0.15), (0.075, 0.05), "head"),
        ], "hair"))
    if "bun" in items:
        parts.append(ellipsoid(arm, "bun", top + Vector((0, 0.055, -0.005)), (0.05, 0.05, 0.045), "hair", "head"))
    if "ponytail" in items:
        parts.append(ellipsoid(arm, "tie", centre + Vector((0, 0.1, 0.03)), (0.026, 0.026, 0.026), "accent", "head", seg=8, rings=5))
        parts.append(loft(arm, "tail", [
            ((0, 0.115, centre.z + 0.03), (0.022, 0.022), "head"),
            ((0, 0.135, centre.z - 0.05), (0.036, 0.03), "head"),
            ((0, 0.135, centre.z - 0.16), (0.032, 0.026), "neck_01"),
            ((0, 0.125, centre.z - 0.28), (0.012, 0.01), "spine_03"),
        ], "hair", n=8))
    if "scarf" in items:
        parts.append(ellipsoid(arm, "scarf", shape.point("neck_01", 0.15) + Vector((0, -0.005, 0)), (0.092, 0.092, 0.042), "accent", "neck_01"))
    if "cap" in items:
        parts.append(ellipsoid(arm, "cap", centre + Vector((0, 0.002, 0.036)), (0.1, 0.112, 0.07), "accent", "head"))
        parts.append(ellipsoid(arm, "brim", centre + Vector((0, -0.095, 0.03)), (0.075, 0.052, 0.008), "accent", "head", tilt=-6))
    if "hood" in items:
        parts.append(ellipsoid(arm, "hood", back + Vector((0, 0.075, 0.03)), (0.125, 0.06, 0.08), "top", "spine_03"))
    if "backpack" in items:
        at = shape.point("spine_03", 0.1) + Vector((0, 0.145, 0))
        parts.append(loft(arm, "pack", [
            ((at.x, at.y - 0.01, at.z - 0.2), (0.07, 0.03), "spine_03"),
            ((at.x, at.y, at.z - 0.16), (0.125, 0.07), "spine_03"),
            ((at.x, at.y, at.z + 0.06), (0.13, 0.08), "spine_03"),
            ((at.x, at.y - 0.01, at.z + 0.16), (0.105, 0.06), "spine_03"),
            ((at.x, at.y - 0.02, at.z + 0.2), (0.05, 0.025), "spine_03"),
        ], "accent", n=12))
    return parts


def limit_weights(h):
    groups = h.vertex_groups
    for v in h.data.vertices:
        pairs = sorted(((g.group, g.weight) for g in v.groups if g.weight > 0.02), key=lambda p: -p[1])[:4]
        total = sum(w for _, w in pairs) or 1.0
        keep = {gi for gi, _ in pairs}
        for g in list(v.groups):
            if g.group not in keep:
                groups[g.group].remove([v.index])
        for gi, w in pairs:
            groups[gi].add([v.index], w / total, "REPLACE")


def palette():
    img = bpy.data.images.new("pedestrian_palette", len(ZONES), len(OUTFITS), alpha=False)
    px = []
    for row in reversed(OUTFITS):
        for hexa in (*row, DARK, WHITE):
            px += [int(hexa[i : i + 2], 16) / 255 for i in (0, 2, 4)] + [1.0]
    img.pixels = px
    img.update()
    img.pack()
    m = bpy.data.materials.new("pedestrian")
    m.use_nodes = True
    nodes = m.node_tree.nodes
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Closest"
    m.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 1.0
    return m


def finish(h, arm, parts, mat, name):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in parts:
        o.select_set(True)
    h.select_set(True)
    bpy.context.view_layer.objects.active = h
    bpy.ops.object.join()
    me = h.data
    limit_weights(h)
    me.materials.clear()
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    h.name = "pedestrian_" + name
    me.name = "pedestrian_" + name
    h.parent = arm
    md = h.modifiers.new("Armature", "ARMATURE")
    md.object = arm
    return h


def build():
    made = []
    rests = []
    for name, style in BODIES.items():
        h, arm = make_human(style["macro"])
        eye = eye_centres(h)
        arm_mod = next(m for m in h.modifiers if m.type == "ARMATURE")
        arm_mod.show_viewport = False
        dg = bpy.context.evaluated_depsgraph_get()
        native = max((h.matrix_world @ v.co).z for v in h.evaluated_get(dg).to_mesh().vertices)
        h.evaluated_get(dg).to_mesh_clear()
        scale = HEIGHT / native
        arm_mod.show_viewport = True
        curl_fingers(arm)
        bake(h)
        for pb in arm.pose.bones:
            pb.matrix_basis = Matrix.Identity(4)
        merge_weights(h)
        rests.append(rest_of(arm, scale))
        made.append({"name": name, "h": h, "arm": arm, "eye": eye * scale, "native": native, "scale": scale})
    canon = canonical_skeleton(made[0]["arm"], rests)
    for rec, rest in zip(made, rests):
        rebase(rec["h"], rest, canon, rec["scale"])
    for rec in made[1:]:
        bpy.data.objects.remove(rec["arm"])
    for pb in canon.pose.bones:
        pb.rotation_mode = "QUATERNION"
    shape = Shape(canon)
    mat = palette()
    bodies = []
    for rec in made:
        style = BODIES[rec["name"]]
        h = rec["h"]
        soften_and_decimate(h)
        paint(h, style, shape)
        parts = wear(canon, style, shape, rec["eye"])
        bodies.append(finish(h, canon, parts, mat, rec["name"]))
        tris = sum(len(p.vertices) - 2 for p in h.data.polygons)
        print("BODY", rec["name"], "tris", tris, "verts", len(h.data.vertices), "height", round(rec["native"], 3))
    return bodies, canon


def export(bodies, arm):
    os.makedirs(MODELS, exist_ok=True)
    for o in bpy.context.scene.objects:
        o.select_set(o is arm or o in bodies)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(MODELS, "pedestrians.glb"),
        use_selection=True,
        export_apply=False,
        export_yup=True,
        export_skins=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_force_sampling=True,
        export_optimize_animation_size=False,
        export_morph=False,
    )


def camera(name, loc, target, lens=None, ortho=None):
    cam = bpy.data.cameras.new(name)
    if ortho:
        cam.type = "ORTHO"
        cam.ortho_scale = ortho
    else:
        cam.lens = lens
    ob = bpy.data.objects.new(name, cam)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return ob


def setup_render(w, h):
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.world = sc.world or bpy.data.worlds.new("w")
    sc.world.color = (0.09, 0.1, 0.13)
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sh = sc.display.shading
    sh.light = "FLAT"
    sh.color_type = "TEXTURE"
    sh.show_object_outline = True
    sh.show_cavity = True
    sh.cavity_type = "SCREEN"
    sh.curvature_ridge_factor = 0.4
    sh.curvature_valley_factor = 1.6
    sh.show_shadows = True
    cube = bpy.data.objects.get("Cube")
    if cube:
        cube.hide_render = True


def snapshot(h, name, at, row=0):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(h.evaluated_get(dg))
    if row:
        for d in me.uv_layers.active.data:
            d.uv.y -= row / len(OUTFITS)
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.location = at
    return o


def show_bodies(bodies, arm, path):
    sc = bpy.context.scene
    setup_render(1800, 1100)
    arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    from pedestrian_clips import Poser, stand_pose

    stand_pose(Poser(arm))
    made = []
    for i, h in enumerate(bodies):
        for j in range(4):
            at = (j * 1.0 + (i % 2) * 4.4, 0, (2 - i // 2) * 2.1)
            made.append(snapshot(h, f"s{i}{j}", at, row=(i * 2 + j) % len(OUTFITS)))
        made.append(snapshot(h, f"c{i}", (20 + i * 1.1, 0, 0), row=i))
    for h in bodies:
        h.hide_render = True
    arm.hide_render = True
    views = {
        "front": ((3.7, -26, 3.0), (3.7, 0, 3.0), 88),
        "back": ((3.7, 26, 3.0), (3.7, 0, 3.0), 88),
        "close": ((22.75, -7.5, 1.3), (22.75, 0, 1.0), 36),
    }
    for name, (loc, target, lens) in views.items():
        cam = camera(name, loc, target, lens=lens)
        sc.camera = cam
        sc.render.filepath = f"{path}-{name}.png"
        bpy.ops.render.render(write_still=True)
        bpy.data.objects.remove(cam)
    for o in made:
        bpy.data.objects.remove(o)
    for h in bodies:
        h.hide_render = False


def show_strips(body, arm, actions, path):
    sc = bpy.context.scene
    setup_render(1900, 560)
    for clip, frames in clip_frames(actions).items():
        arm.animation_data.action = actions[clip]
        count = min(12, len(frames))
        made = []
        for k in range(count):
            f = frames[int(k * (len(frames) - 1) / max(count - 1, 1))]
            sc.frame_set(f)
            made.append(snapshot(body, f"f{k}", (k * 1.0, 0, 0)))
        for o in sc.objects:
            if o.type == "MESH" and not o.name.startswith("f"):
                o.hide_render = True
        mid = (count - 1) * 0.5
        cam = camera("strip", (mid, -22, 0.95), (mid, 0, 0.95), ortho=count + 1.0)
        sc.camera = cam
        sc.render.filepath = f"{path}-front-{clip}.png"
        bpy.ops.render.render(write_still=True)
        for o in made:
            o.rotation_euler = (0, 0, math.radians(-90))
        sc.render.filepath = f"{path}-side-{clip}.png"
        bpy.ops.render.render(write_still=True)
        bpy.data.objects.remove(cam)
        for o in made:
            bpy.data.objects.remove(o)
        for o in sc.objects:
            if o.type == "MESH":
                o.hide_render = False


def film(bodies, arm, actions, path):
    sc = bpy.context.scene
    setup_render(1600, 620)
    for h in bodies:
        h.hide_render = True
    arm.hide_render = True
    cam = camera("film", (7.2, -9.4, 1.6), (3.0, 0, 0.82), lens=46)
    sc.camera = cam
    for clip, frames in clip_frames(actions).items():
        arm.animation_data.action = actions[clip]
        os.makedirs(f"{path}/{clip}", exist_ok=True)
        for f in frames:
            sc.frame_set(f)
            made = [snapshot(h, f"film{i}", (i * 1.2, 0, 0), row=i * 3 % len(OUTFITS)) for i, h in enumerate(bodies)]
            sc.render.filepath = f"{path}/{clip}/{f:04d}.png"
            bpy.ops.render.render(write_still=True)
            for o in made:
                bpy.data.objects.remove(o)
    bpy.data.objects.remove(cam)


def clip_frames(actions):
    return {clip: list(range(int(a.frame_range[0]), int(a.frame_range[1]) + 1)) for clip, a in actions.items()}


if __name__ == "__main__":
    bodies, arm = build()
    stores = author(arm)
    actions = key_clips(arm, stores)
    report(arm, bodies, actions, stores)
    export(bodies, arm)
    if "show" in ARGS:
        os.makedirs(PREVIEWS, exist_ok=True)
        path = os.path.join(PREVIEWS, "pedestrians")
        show_bodies(bodies, arm, path)
        show_strips(bodies[0], arm, actions, path)
        print("PREVIEWS", path)
    if "film" in ARGS:
        film(bodies, arm, actions, os.path.join(PREVIEWS, "film"))
