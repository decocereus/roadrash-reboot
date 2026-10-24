"""Shared mechanical kit for the three standalone cyber sport-bike studies."""
import math
import bpy
import bmesh
from mathutils import Vector, Matrix
from common import B, MI, box, tube, lathe, ring_loft, finish


def linear(hex_colour):
    values = [int(hex_colour[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in values)


def colours(body, accent):
    palette = dict(body=body, accent=accent, dark="202333", metal="8A9BAE", gold="E2AD57",
                   tyre="10121A", glass="122337", seat="171B28", plate="E4E9F0",
                   light_head="D0F7FF", light_tail="FF2756", light_ind="FFC34A")
    for name, colour in palette.items():
        mat = bpy.data.materials[name]
        col = linear(colour)
        mat.diffuse_color = (*col, 1)
        p = mat.node_tree.nodes.get("Principled BSDF")
        p.inputs["Base Color"].default_value = (*col, 1)
        p.inputs["Roughness"].default_value = 0.32 if name in ("body", "metal", "glass") else 0.65
        p.inputs["Metallic"].default_value = 0.55 if name in ("metal", "gold") else 0.0
        if name.startswith("light_"):
            p.inputs["Emission Color"].default_value = (*col, 1)
            p.inputs["Emission Strength"].default_value = 1.8
    return palette


def plate(bm, points, mat, thickness=0.012):
    positions=[B(*p) for p in points]
    normal=(positions[1]-positions[0]).cross(positions[2]-positions[0])
    centre=sum(positions,Vector())/len(positions)
    if normal.dot(centre-Vector((0,0,.55)))<0:positions.reverse()
    front = [bm.verts.new(p) for p in positions]
    face = bm.faces.new(front)
    face.material_index = MI[mat]
    normal = (front[1].co - front[0].co).cross(front[2].co - front[0].co).normalized()
    back = [bm.verts.new(v.co - normal * thickness) for v in front]
    f = bm.faces.new(list(reversed(back))); f.material_index = MI["dark"]
    for i in range(len(front)):
        j = (i + 1) % len(front)
        f = bm.faces.new((front[i], front[j], back[j], back[i])); f.material_index = MI[mat]


def mirrored(bm, points, mat, thickness=0.012):
    for s in (-1, 1):
        pts = [(s * x, y, z) for x, y, z in points]
        plate(bm,pts,mat,thickness)


def stripe(bm, pts, mat="accent", width=0.005):
    tube(bm, pts, [width], mat, n=4, cap=True)


def wheel(name, radius, width, z, style):
    bm = bmesh.new()
    rim = 0.212
    profile = []
    for i in range(9):
        angle = math.radians(-92 + 184 * i / 8)
        profile.append((rim + (radius - rim) * max(0, math.cos(angle)) ** 0.58, width * 0.5 * math.sin(angle)))
    lathe(bm, (0, radius, z), profile, "tyre", steps=48)
    lathe(bm, (0, radius, z), [(rim + .002, -width*.43), (rim+.002, width*.43),
          (rim-.018, width*.43), (rim-.025, width*.15), (rim-.025, -width*.15),
          (rim-.018,-width*.43)], "dark", steps=40, closed=True)
    for s in (-1, 1):
        x=s*width*.46
        lathe(bm, (x,radius,z), [(rim-.009,0),(rim+.002,0)], "accent", steps=48)
        for i in range(3):
            start=i*math.tau/3+.15
            for k in range(4):
                a=start+k*.075
                pts=[(x+s*.001,radius+r*math.cos(t),z+r*math.sin(t)) for r,t in [(rim-.025,a),(rim-.014,a),(rim-.014,a+.04),(rim-.025,a+.04)]]
                plate(bm,pts,"plate",.001)
    if style == "oni":
        for side in (-1,1):
            x=side*width*.35
            for j in range(5):
                a=j*math.tau/5
                verts=[(x,radius+r*math.cos(a+t),z+r*math.sin(a+t)) for r,t in [(.043,-.35),(.19,-.25),(.195,.18),(.1,.48)]]
                plate(bm,verts,"dark",.012)
                stripe(bm,[verts[1],verts[2]],"accent",.004)
    else:
        spokes=5 if style=="seraph" else 6
        for j in range(spokes):
            for split in (-1,1):
                a=j*math.tau/spokes
                tube(bm,[(0,radius+.043*math.cos(a),z+.043*math.sin(a)),
                    (0,radius+.12*math.cos(a+.10),z+.12*math.sin(a+.10)),
                    (0,radius+.197*math.cos(a+split*.13),z+.197*math.sin(a+split*.13))],
                    [(.009,.018)],"metal" if style=="seraph" else "accent",n=5,up=(1,0,0))
    lathe(bm,(0,radius,z),[(0,-width*.55),(.046,-width*.55),(.046,width*.55),(0,width*.55)],"metal",steps=16)
    for side in ([-1,1] if name=="wheel_f" else [1]):
        x=side*(width*.55+.008)
        outer=.153 if name=="wheel_f" else .115
        lathe(bm,(x,radius,z),[(outer-.034,-.002),(outer,-.002),(outer,.002),(outer-.034,.002)],"metal",steps=40,closed=True)
        for j in range(10):
            a=j*math.tau/10
            p=(x,radius+(outer-.017)*math.cos(a),z+(outer-.017)*math.sin(a))
            lathe(bm,p,[(0,side*.003),(.004,side*.003)],"dark",steps=5)
        for j in range(5):
            a=j*math.tau/5
            tube(bm,[(x,radius+.04*math.cos(a),z+.04*math.sin(a)),
                (x,radius+(outer-.03)*math.cos(a+.16),z+(outer-.03)*math.sin(a+.16))],
                [(.009,.004)],"dark",n=4,up=(1,0,0))
    return finish(name,bm,angle=40)


def mechanics(style):
    bm=bmesh.new()
    for s in (-1,1):
        tube(bm,[(s*.105,.293,-.69),(s*.105,.58,-.572)],[.023],"metal",n=12)
        tube(bm,[(s*.105,.55,-.584),(s*.105,.97,-.412)],[.031],"gold" if style!="oni" else "metal",n=12)
        tube(bm,[(s*.105,.97,-.412),(s*.24,.965,-.39),(s*.34,.94,-.355)],[.013],"dark",n=8)
        tube(bm,[(s*.25,.963,-.387),(s*.355,.936,-.35)],[.021],"seat",n=10)
        tube(bm,[(s*.25,.94,-.423),(s*.36,.918,-.4)],[.006],"metal",n=6)
        for y in (.70,.94):
            box(bm,(0,y,-.52+(y-.7)*.43),(.28,.025,.075),"dark")
        tube(bm,[(s*.13,.39,.13),(s*.13,.306,.69)],[ (.043,.025)],"metal",n=6)
        tube(bm,[(s*.13,.67,.14),(s*.13,.40,.52)],[.018],"metal",n=8)
        tube(bm,[(s*.09,.78,-.38),(s*.16,.52,-.06),(s*.115,.66,.30),(s*.09,.78,-.38)],
             [.021],"accent" if style=="oni" else "metal",n=6,cap=False)
        tube(bm,[(s*.14,.40,.20),(s*.24,.40,.20)],[.017],"metal",n=8)
        box(bm,(s*.14,.30,-.60),(.055,.105,.07),"gold")
    lathe(bm,(0,.41,.05),[(0,-.155),(.115,-.155),(.118,-.14),(.118,.14),(.115,.155),(0,.155)],"dark",steps=20)
    for s in (-1,1):
        lathe(bm,(s*.16,.41,.05),[(0,0),(.083,0),(.083,s*.007),(0,s*.007)],"metal",steps=20)
        for i in range(6):
            a=i*math.tau/6
            lathe(bm,(s*.17,.41+.093*math.cos(a),.05+.093*math.sin(a)),[(0,0),(.005,0)],"plate",steps=6)
    box(bm,(0,.57,-.18),(.25,.22,.24),"dark")
    for x in (-.09,-.03,.03,.09):
        tube(bm,[(x,.52,-.31),(x,.28,-.35),(x,.20,-.1),(x,.23,.25)],[.018],"gold",n=6,cap=False)
    tube(bm,[(-.10,.24,.16),(-.22,.30,.38),(-.25,.47,.78)],[(.035,.035),(.055,.07),(.06,.075)],"dark",n=8)
    tube(bm,[(-.25,.47,.78),(-.255,.49,.82)],[(.05,.063)],"metal",n=8,cap=False)
    tube(bm,[(-.25,.471,.785),(-.255,.492,.824)],[(.035,.045)],"tyre",n=8)
    for j in range(7):
        y=.42+j*.032;z=.34-j*.018
        tube(bm,[(.035,y,z),(-.035,y+.012,z+.008)],[.008],"accent",n=6)
    box(bm,(0,.99,-.49),(.14,.06,.025),"dark")
    box(bm,(0,.995,-.474),(.117,.038,.004),"accent")
    return finish("mechanical_kit",bm,angle=35,bevel=.0015)


def fender(style):
    bm=bmesh.new()
    sections=[]
    for z in (-.98,-.91,-.82,-.70,-.58,-.49,-.44):
        y=.293+math.sqrt(max(0,.323**2-(z+.69)**2))
        sections.append((z,[(0,y+.016),(.045,y+.012),(.068,y-.01),(.072,y-.052),(0,y-.025)]))
    ring_loft(bm,sections,"body" if style!="oni" else "accent",seg_mat=lambda j:"dark" if j>=3 else ("body" if style!="oni" else "accent"))
    for s in (-1,1):
        stripe(bm,[(s*.064,.49,-.97),(s*.071,.59,-.85),(s*.072,.617,-.70)],"accent" if style!="oni" else "dark",.004)
    return finish("fender",bm,bevel=.001)


def labels(style):
    objs=[]
    for s in (-1,1):
        for text,size,y,z in [(dict(seraph="01",ghost="02",oni="03")[style],.075,.52,-.22),
                              (dict(seraph="OSTRA",ghost="KAIRO",oni="VANTA")[style],.021,.45,-.25)]:
            curve=bpy.data.curves.new("livery","FONT");curve.body=text;curve.size=size;curve.extrude=.0002
            curve.align_x="CENTER";curve.resolution_u=2
            ob=bpy.data.objects.new("livery",curve);bpy.context.scene.collection.objects.link(ob)
            ob.location=B(s*.291,y,z)
            ob.rotation_euler=Matrix(((0,0,s),(s,0,0),(0,1,0))).to_euler()
            curve.materials.append(bpy.data.materials["plate" if style!="ghost" else "dark"])
            bpy.context.view_layer.objects.active=ob;ob.select_set(True);bpy.ops.object.convert(target="MESH");ob.select_set(False)
            objs.append(ob)
    return objs
