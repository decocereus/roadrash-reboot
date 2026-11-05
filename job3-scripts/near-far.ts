import { benchRun } from "/var/tmp/rushline-r4-b/tools/perf/src/scenarios.ts";
import fs from "node:fs";
const log = JSON.parse(fs.readFileSync("/var/tmp/rushline-round4/job3/frames/landing/stress/ticklog.json","utf8"));
const count=(h)=>Object.entries(h).filter(([k])=>Number(k)>90000).reduce((a,[,v])=>a+v,0);
const far=(h)=>h["12000"]??0;
const byTick=new Map(log.map(([t,h])=>[t,h]));
const run = benchRun("stress");
let prev=null;
for (let i=0;i<2870;i++){run.step();const v=run.view;const h=byTick.get(v.tick);if(!h)continue;const n=count(h),f=far(h);
 if(prev!==null && (n!==prev.n)&&v.tick>1950){const p=v.riders[0];
  const crashed=v.riders.filter(r=>r.mode!=="riding"&&r.id!==p.id).map(r=>`${r.id}:${r.mode}:${Math.round(r.s-p.s)}m`);
  console.log(v.tick,"near",prev.n,"->",n,"far",prev.f,"->",f,crashed.join(" "));}
 prev={n,f};}
