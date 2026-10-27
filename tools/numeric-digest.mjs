// W5 cross-version check. Run the same command under each Node version and compare the printed JSON:
//   TEMP=F:/dnd-tmp TMP=F:/dnd-tmp node tools/numeric-digest.mjs
// Prints (1) sha256 of the final state of two fixed-seed advance scenarios (same steps as tests/advance-registry
// and F:/dnd-tools/golden-diff), (2) the output of every replaced numeric function on fixed inputs, as a hash
// plus a short sample, and (3) the Node/V8 versions. Equal "state" and "functions" digests = equal results.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,canonical} from '../server-plugin/storage.mjs';
import * as D from '../server-plugin/det-math.mjs';
import {daylightAt} from '../server-plugin/weather.mjs';
import {bm25TermScore} from '../server-plugin/retrieval.mjs';
import {tribalSettlementSkeleton} from '../server-plugin/tribal-awakening.mjs';

const root=path.resolve(import.meta.dirname,'..'),DAY=1440;
const sha=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const num=v=>Object.is(v,-0)?'-0':String(v);

const world=await loadWorld(),legacy=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/legacy/seed.json'),'utf8'));
const scenarios={
 full:{seed:'advance-registry',steps:[DAY,DAY,DAY,17*60+13,5*DAY]},
 quiet:{seed:'advance-quiet',quiet:true,steps:[DAY,DAY,14*DAY,37]},
};
const state={};
for(const [name,{seed,quiet,steps}] of Object.entries(scenarios)){
 const w=structuredClone(world);if(quiet)for(const n of w.npcs){delete n.schedule;delete n.tier;}
 const engine=new WorldEngine(w);let doc=engine.createCharacter(legacy,{},seed);
 for(const [i,minutes] of steps.entries()){const r=await engine.reduce(doc,{tool:'world_time',args:{minutes},eventId:`step_${i}`});doc=applyPatches(doc,r.patches);}
 state[name]=sha(canonical?canonical(doc.state):doc.state);
}
const out={};
const grid=n=>Array.from({length:n},(_,i)=>(i-n/2)*0.1731+0.0137);
const fns={
 exp:()=>grid(80).map(x=>D.exp(x/3)),ln:()=>grid(80).map(x=>D.ln(Math.abs(x)+0.01)),
 sin:()=>grid(80).map(D.sin),cos:()=>grid(80).map(D.cos),tan:()=>grid(80).map(x=>D.tan(x/4)),
 atan2:()=>grid(80).map((x,i)=>D.atan2(x,grid(80)[(i*7)%80]+0.3)),acos:()=>grid(80).map(x=>D.acos(Math.max(-1,Math.min(1,x/7)))),
 sqrt:()=>grid(80).map(x=>D.sqrt(Math.abs(x)*13)),hypot:()=>grid(80).map((x,i)=>D.hypot(x,grid(80)[(i*3)%80])),
 pow:()=>grid(80).map(x=>D.pow(0.9+Math.abs(x)/100,x*3)),
 daylightAt:()=>[-60,-30,0,23.5,45,60].flatMap(lat=>[0,90,180,270,359].map(day=>Object.values(daylightAt(lat,day)))),
 bm25TermScore:()=>[1,2,5].flatMap(tf=>[1,10,100].map(df=>bm25TermScore(tf,df,500,40+tf*9,55))),
 tribalSettlementSkeleton:()=>['a','b','c'].map(seed=>tribalSettlementSkeleton(seed,{id:'d1',settlementNames:['x','y','z'],species:'s',home:'loc_x'},{population:90,minute:0,home:{coordinates:[12.34,56.78]}}).coordinates),
};
for(const [name,f] of Object.entries(fns)){const v=f().flat(2);out[name]={sha:sha(v.map(num).join(',')),sample:v.slice(0,3).map(num)};}
console.log(JSON.stringify({node:process.version,v8:process.versions.v8,state,functions:out},null,1));
