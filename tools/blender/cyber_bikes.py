"""Build three original cyber sport bikes: blender -b --python-exit-code 1 -P tools/blender/cyber_bikes.py."""
import json
import math
import os
import sys
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from common import B, join
from cyber_parts import colours, linear, mechanics, wheel, fender, labels
from cyber_bodywork import upper, fairings, aero, tank_tail

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/art/cyber-bike-options'
DESIGNS=[
 dict(id='seraph',name='Ostra Seraph RR',reference='Aprilia RSV4',body='FF294C',accent='22E5FF',number='01',
      description='Low split nose, widely spaced horizontal lamps, a short wraparound screen and stacked wings.'),
 dict(id='ghost',name='Kairo Ghost R',reference='Yamaha YZF-R1',body='E9F2F5',accent='1CDDF0',number='02',
      description='Narrow spear nose, vertical lamps, a tall blade screen and upright canards.'),
 dict(id='oni',name='Vanta Oni X',reference='Kawasaki Ninja H2',body='303949',accent='EAFF38',number='03',
      description='Broad armoured face, one continuous visor light, a low slab screen and a vented jaw.')]


def put_in(obj,collection):
    for coll in list(obj.users_collection):coll.objects.unlink(obj)
    collection.objects.link(obj)


def toon_material(source):
    mat=source.copy();mat.name='Studio '+source.name
    nodes=mat.node_tree.nodes;nodes.clear();links=mat.node_tree.links
    output=nodes.new('ShaderNodeOutputMaterial');emission=nodes.new('ShaderNodeEmission')
    base=source.diffuse_color[:3]
    if source.name.startswith('light_'):
        emission.inputs['Color'].default_value=(*base,1);emission.inputs['Strength'].default_value=2.4
    else:
        diffuse=nodes.new('ShaderNodeBsdfDiffuse');diffuse.inputs['Color'].default_value=(1,1,1,1)
        rgb=nodes.new('ShaderNodeShaderToRGB');ramp=nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.interpolation='CONSTANT'
        shadow=tuple(c*.29+v for c,v in zip(base,(.005,.006,.018)))
        ramp.color_ramp.elements[0].position=0
        ramp.color_ramp.elements[0].color=(*shadow,1)
        ramp.color_ramp.elements[1].position=.65
        ramp.color_ramp.elements[1].color=(*base,1)
        links.new(diffuse.outputs[0],rgb.inputs[0]);links.new(rgb.outputs[0],ramp.inputs[0]);links.new(ramp.outputs[0],emission.inputs[0])
    links.new(emission.outputs[0],output.inputs['Surface'])
    return mat


def studio(objects):
    scene=bpy.context.scene
    coll=bpy.data.collections.new('Studio presentation');scene.collection.children.link(coll)
    ink=bpy.data.materials.new('Ink outline');ink.diffuse_color=(.003,.003,.007,1);ink.use_nodes=True;ink.use_backface_culling=True
    nd=ink.node_tree.nodes;nd.clear();e=nd.new('ShaderNodeEmission');e.inputs[0].default_value=(.002,.002,.006,1);out=nd.new('ShaderNodeOutputMaterial');ink.node_tree.links.new(e.outputs[0],out.inputs[0])
    mats={}
    for obj in objects:
        obj.hide_render=True
        show=obj.copy();show.data=obj.data.copy();show.name='Preview '+obj.name;coll.objects.link(show);show.hide_render=False
        for i,mat in enumerate(show.data.materials):
            if mat.name not in mats:mats[mat.name]=toon_material(mat)
            show.data.materials[i]=mats[mat.name]
        hull=obj.copy();hull.data=obj.data.copy();hull.name='Ink '+obj.name;coll.objects.link(hull);hull.hide_render=False
        slots=[mat.name for mat in hull.data.materials]
        bm=bmesh.new();bm.from_mesh(hull.data);bm.normal_update()
        unseen=set(bm.verts)
        excluded=[]
        while unseen:
            pending=[unseen.pop()];component=[]
            while pending:
                vertex=pending.pop();component.append(vertex)
                for edge in vertex.link_edges:
                    neighbour=edge.other_vert(vertex)
                    if neighbour in unseen:unseen.remove(neighbour);pending.append(neighbour)
            faces={face for vertex in component for face in vertex.link_faces}
            emissive=any(slots[face.material_index].startswith('light_') for face in faces)
            spans=[max(v.co[axis] for v in component)-min(v.co[axis] for v in component) for axis in range(3)]
            if emissive or min(spans)<.008:excluded.extend(component)
        bmesh.ops.delete(bm,geom=excluded,context='VERTS')
        hull.data.materials.clear();hull.data.materials.append(ink)
        for v in bm.verts:v.co+=v.normal*.0016
        bmesh.ops.reverse_faces(bm,faces=list(bm.faces));bm.to_mesh(hull.data);bm.free()
        for p in hull.data.polygons:p.material_index=0
    scene.render.engine='BLENDER_EEVEE'
    scene.render.resolution_x=1500;scene.render.resolution_y=1050;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    scene.render.film_transparent=False
    scene.world=bpy.data.worlds.new('Night studio');scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.07,.09,.16,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.18
    scene.view_settings.view_transform='Standard'
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.009));floor=bpy.context.object;floor.name='Studio floor';put_in(floor,coll)
    mat=bpy.data.materials.new('Floor');mat.diffuse_color=(*linear('080C16'),1);mat.use_nodes=True
    p=mat.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*linear('080C16'),1);p.inputs['Roughness'].default_value=.95;floor.data.materials.append(mat)
    for name,location,power,size in [('Key',(-3,-4,6),800,5),('Rim',(3,2,4),400,3),('Fill',(-1,4,3),200,4)]:
        data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
        ob=bpy.data.objects.new(name,data);coll.objects.link(ob);ob.location=location;ob.rotation_euler=(Vector((0,0,.5))-ob.location).to_track_quat('-Z','Y').to_euler()
    data=bpy.data.cameras.new('Camera');data.type='ORTHO';data.ortho_scale=2.65
    camera=bpy.data.objects.new('Camera',data);coll.objects.link(camera);scene.camera=camera
    return camera


def view(folder,name,location,scale=2.65,target=(0,.55,0)):
    scene=bpy.context.scene;camera=scene.camera;camera.location=B(*location)
    camera.rotation_euler=(B(*target)-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=scale
    scene.render.filepath=str(folder/f'{name}.png');bpy.ops.render.render(write_still=True)



def neutral_front(folder):
    scene=bpy.context.scene
    engine=scene.render.engine
    scene.render.engine='BLENDER_WORKBENCH'
    shading=scene.display.shading
    shading.light='STUDIO';shading.studio_light='paint.sl'
    shading.color_type='SINGLE';shading.single_color=(.52,.52,.52)
    shading.show_cavity=True;shading.cavity_type='BOTH'
    shading.show_object_outline=True;shading.object_outline_color=(.01,.01,.015)
    shading.background_type='WORLD';scene.world.color=(.025,.025,.03)
    hidden=[]
    for obj in scene.objects:
        if obj.name.startswith('Ink ') and not obj.hide_render:
            obj.hide_render=True;hidden.append(obj)
    view(folder,'front-neutral',(0,1.1,-4),2.1)
    view(folder,'front-detail-neutral',(0,.98,-4),1.2,(0,.98,0))
    for obj in hidden:obj.hide_render=False
    scene.render.engine=engine


def build(design):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
    bpy.context.preferences.filepaths.save_version=0
    parts=[upper(design['id']),fairings(design['id']),aero(design['id']),tank_tail(design['id']),mechanics(design['id']),fender(design['id'])]
    for part in parts:
        for modifier in part.modifiers:
            if modifier.type=='BEVEL':modifier.segments=1
    colours(design['body'],design['accent'])
    parts+=labels(design['id'])
    editable=bpy.data.collections.new('Editable bodywork');scene.collection.children.link(editable)
    for part in parts:
        copy=part.copy();copy.data=part.data.copy();editable.objects.link(copy)
    editable.hide_render=True;editable.hide_viewport=True
    body=join('bike_body',parts)
    light_mesh=bmesh.new();light_mesh.from_mesh(body.data);light_mesh.normal_update()
    for face in light_mesh.faces:
        slot=body.data.materials[face.material_index].name
        if slot in ('light_head','light_tail'):
            centre=face.calc_center_median()
            outward=Vector((1 if centre.x>0 else -1,-1 if slot=='light_head' else 1,0))
            if face.normal.dot(outward)<0:face.normal_flip()
    light_mesh.to_mesh(body.data);light_mesh.free();body.data.update()
    objects=[body,wheel('wheel_f',.293,.118,-.69,design['id']),wheel('wheel_r',.306,.18,.69,design['id'])]
    colours(design['body'],design['accent'])
    game=bpy.data.collections.new('Game export');scene.collection.children.link(game)
    counts={}
    for obj in objects:
        put_in(obj,game);obj.data.calc_loop_triangles();counts[obj.name]=len(obj.data.loop_triangles)
        assert all(math.isfinite(axis) for v in obj.data.vertices for axis in v.co)
        assert all(t.area>1e-12 for t in obj.data.loop_triangles),obj.name
        obj.select_set(True)
    assert sum(counts.values())<18500,counts
    folder=OUT/design['id'];folder.mkdir(parents=True,exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(folder/f"{design['id']}.glb"),use_selection=True,export_apply=True,export_yup=True,export_texcoords=False,export_cameras=False,export_lights=False)
    stats={**design,'triangles':sum(counts.values()),'parts':counts,'glbBytes':(folder/f"{design['id']}.glb").stat().st_size,'textures':0,'wheelbaseMetres':1.38}
    (folder/'metrics.json').write_text(json.dumps(stats,indent=2)+'\n')
    game.hide_viewport=True
    studio(objects)
    for obj in bpy.context.scene.objects:obj.select_set(False)
    view(folder,'hero',(-3.0,1.7,-3.9),2.65)
    view(folder,'side',(-4,1.00,0),2.60)
    view(folder,'rear',(-2.8,1.6,3.5),2.65)
    view(folder,'front',(0,1.1,-4),2.1)
    view(folder,'front-detail',(0,.98,-4),1.2,(0,.98,0))
    neutral_front(folder)
    camera=scene.camera;camera.location=B(-3.0,1.7,-3.9);camera.rotation_euler=(B(0,.55,0)-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=2.65
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':area.spaces.active.region_3d.view_perspective='CAMERA';area.spaces.active.shading.type='RENDERED'
    bpy.ops.wm.save_as_mainfile(filepath=str(folder/f"{design['id']}.blend"))
    print('BIKE_RESULT',json.dumps(stats),flush=True)
    return stats


if __name__=='__main__':
    OUT.mkdir(parents=True,exist_ok=True)
    chosen=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    for design in DESIGNS:
        if not chosen or design['id'] in chosen:build(design)
    results=[json.loads((OUT/d['id']/'metrics.json').read_text()) for d in DESIGNS if (OUT/d['id']/'metrics.json').exists()]
    (OUT/'catalogue.json').write_text(json.dumps(results,indent=2)+'\n')
