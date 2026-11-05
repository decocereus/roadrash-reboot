import json,gzip,hashlib,math,subprocess,statistics
ID='gpu-2026-11-05T13-01-24-628Z-4a3249a-4a3249a'
R=f'tools/perf/results/{ID}'
r=json.load(open(f'{R}/result.json')); samples=json.load(open(f'{R}/samples.json'))
FLOOR_NOTE="Intel's floor, owner accepted 2026-11-05, not the 60 fps cap"
F={'frame.interval.p50':1.1,'frame.interval.p95':1.15,'frame.interval.p99':1.2}
b=json.load(open('tools/perf/budgets.json')); s=json.load(open('tools/perf/baselines/post-step8.json'))
obs={(o['metric'],o['scenario']):o for o in r['observations']}
new_obs=[]; table=[]
for lim in b['limits']:
    if lim['environment']!='gpu-chromium-intel': continue
    o=obs[(lim['metric'],lim['scenario'])]; m=lim['metric']; A=o['runs']['a']; B=o['runs']['b']; worst=max(A+B); side='A+B'
    if m in F:
        base=worst; val=F[m]*worst; der=f"{F[m]} x the worst window: {FLOOR_NOTE}"
    elif m=='frame.missedFraction':
        base=worst; val=min(1,1.2*worst); der=f"1.2 x the worst window, capped at 1: {FLOOR_NOTE}"
    elif m.startswith('main.longTask'):
        base=worst; val=worst+1 if worst else 0; der=f"the worst window + 1 if nonzero, else 0: {FLOOR_NOTE}"
    elif m in('render.calls.max','render.triangles.max'):
        base=worst; val=math.ceil(1.05*worst); der="ceil(1.05 x baseline maximum over both sides' windows)"
    elif m in('render.programs.max','render.textures.max'):
        base=worst; val=worst+1; der="baseline maximum over both sides' windows + 1"
    elif m=='riders.cpu.p95':
        base=max(B); val=2*max(B); der="2 x the worst B window of the first Intel campaign"; side='B'
    else: raise SystemExit('unknown '+m)
    lim.update(baseline=base,value=val,derivation=der,source=ID)
    new_obs.append({'environment':'gpu-chromium-intel','metric':m,'scenario':lim['scenario'],'side':side,'source':ID,'value':base})
s['observations'].extend(new_obs)
page=r['display']['page']['B']
s['runs'].append({'environment':'gpu-chromium-intel','facts':{
 'machine':'vimaan, Intel Core i7-9750H, Intel UHD Graphics 630 (CFL GT2), 8 GiB of RAM',
 'os':'Linux 7.2.8-9-omarchy, Mesa 26.2.5, Hyprland 0.56.2, Chromium 155.0.8059.84',
 'power':'AC power, battery not charging',
 'display':'Built-in panel eDP-1 at 1920x1080, 60.056 Hz, driven by the Hyprland session rv started; requestAnimationFrame measured 60 Hz on both sides',
 'frameRate':'game setting 60 (rushline.settings.v1), so every vsync is drawn',
 'browser':'/usr/lib/chromium/chromium, windowed through Xwayland on the Intel GPU, rv slots 0 and 1, RUSHLINE_BROWSER_HOST=linux-intel; the sandbox stays on',
 'renderer':'ANGLE (Intel, Mesa Intel(R) UHD Graphics 630 (CFL GT2), OpenGL 4.6)',
 'build':'rv up: NODE_ENV=development vite build --mode development, served by vite preview; doctor build is current on both sides',
 'page':f"{page['width']}x{page['height']} CSS at device pixel ratio {page['dpr']}, ?stress&rung=0 and ?stress=reference&rung=0, the lean preset, cpu x1, network off",
 'pairs':'5 alternating pairs per scenario after one warm-up per scenario and side; the idle side parked on /kit',
 'wallMs':str(r['wallMs']),
 'order':json.dumps(r['order']),
 'quiet':'the desktop and the bench lock were free at the start; no other process ran a bench during the campaign',
 'doctorAfter':'the lane read FAIL doctor-after on both sides: rv doctor stopped at FileSystem.writeFile on /tmp/rushline-verify/desktop.lock. All 20 samples had been captured and passed their workload checks by then',
 'sideA':"A's clone was in /var/tmp because /tmp here is a small tmpfs, and it ran under B's rv",
},'id':ID,'lanes':['gpu'],'sides':{'A':r['sides']['A']['revision'],'B':r['sides']['B']['revision']}})
raw='tools/perf/baselines/uhd630.vimaan.gpu-chromium-intel.json.gz'
blob=json.dumps({'campaign':ID,'note':'every sample the lane read on vimaan, as the campaign\'s samples.json holds them','samples':samples}).encode()
with open(raw,'wb') as f:
    f.write(gzip.compress(blob,9,mtime=0))
b['baseline']['raw'].append({'file':raw,'sha256':hashlib.sha256(open(raw,'rb').read()).hexdigest()})
json.dump(s,open('tools/perf/baselines/post-step8.json','w'),indent=2); open('tools/perf/baselines/post-step8.json','a').write('\n')
json.dump(b,open('tools/perf/budgets.json','w'),indent=2); open('tools/perf/budgets.json','a').write('\n')
subprocess.run(['pnpm','exec','oxfmt','tools/perf/baselines/post-step8.json','tools/perf/budgets.json'],check=True)
b=json.load(open('tools/perf/budgets.json'))
b['baseline']['summarySha256']=hashlib.sha256(open('tools/perf/baselines/post-step8.json','rb').read()).hexdigest()
json.dump(b,open('tools/perf/budgets.json','w'),indent=2); open('tools/perf/budgets.json','a').write('\n')
subprocess.run(['pnpm','exec','oxfmt','tools/perf/budgets.json'],check=True)
# Table
print('canvases',sorted({(round(x['capture']['viewport']['width']*f['pixelRatio']),round(x['capture']['viewport']['height']*f['pixelRatio']),round(f['pixelRatio'],4)) for x in samples for f in x['capture']['frames']}))
for sc in ('reference-v1','pack-riding-v1'):
  for side in 'BA':
    ws=[x for x in samples if x['scenario']==sc and x['side']==side]
    iv=[f['interval'] for x in ws for f in x['capture']['frames']]
    fps=[1000*len(x['capture']['frames'])/sum(f['interval'] for f in x['capture']['frames']) for x in ws]
    print(sc,side,'fps pooled %.1f, windows %.1f-%.1f, frames %d'%(1000*len(iv)/sum(iv),min(fps),max(fps),len(iv)))
for lim in sorted((l for l in b['limits'] if l['environment']=='gpu-chromium-intel'),key=lambda l:(l['scenario'],l['metric'])):
    o=obs[(lim['metric'],lim['scenario'])]
    print(lim['scenario'],lim['metric'],'B',o['value'],'A',max(o['runs']['a']),'baseline',lim['baseline'],'limit',lim['value'],'paired',lim['paired'],o['paired'])
