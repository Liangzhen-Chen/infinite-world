// 诊断：npc_hw_gucen 在 officeScene 摆位后、一次 world_act 推进时间期间，出行安排是怎么产生的。
// 只用公共入口（loadWorld/WorldEngine/applyIntentSetup/reduce），与 tests/s4-filing.test.mjs 的 scene()+steal() 同序列。
//   node tools/probe-gucen-travel.mjs [摆位人物 id ...]   缺省：gucen、linsui、hezhou（s4-filing 的摆位）；
//   a3-owner2-R 的摆位是 npc_hw_linsui npc_hw_gucen npc_hw_yanzhe
// 输出：摆位时 gucen 的状态（含 coins）、推进中 engine.route 的每次调用（谁、从哪到哪、什么时刻、费用、当时的 coins），
// 推进后 gucen 的 scheduleTravel 与路费账。
import fs from 'node:fs/promises';
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {applyIntentSetup} from './a3-score.mjs';
import {scheduleAt} from '../server-plugin/npc-schedule.mjs';

const G='npc_hw_gucen',PRESENT=process.argv.length>2?process.argv.slice(2):[G,'npc_hw_linsui','npc_hw_hezhou'],root=new URL('../',import.meta.url);
const world=await loadWorld(),seed=JSON.parse(await fs.readFile(new URL('tests/fixtures/legacy/seed.json',root),'utf8'));
const engine=new WorldEngine(world),initial=engine.createCharacter(seed,{},'s406-filing');
const loaded=applyIntentSetup(engine,initial,{location:'bld_hw_qingdeng',minute:600,present:PRESENT,coins:100});
let document=loaded.document;
const show=(tag,d)=>{for(const id of PRESENT){const n=d.state.npcs[id];console.log(tag,id,JSON.stringify({minute:d.state.minute,location:n.location,activity:n.activity,coins:n.coins,scheduleTravel:n.scheduleTravel??null}));}};
show('setup',document);
// 各在场人物在摆位时刻按作息应在哪里（不一致者，会在下一次无关的时钟节拍里被派出行）。
for(const id of PRESENT){const slot=scheduleAt(engine,id,600,document.state);console.log('scheduled@600',id,JSON.stringify(slot&&{location:slot.location,activity:slot.activity,until:slot.until}),'actual',document.state.npcs[id]?.location);}
const route=engine.route.bind(engine);
engine.route=(from,to,mode,minute,...rest)=>{const r=route(from,to,mode,minute,...rest);if(from==='bld_hw_qingdeng'||to==='loc_hw_gate'||from==='loc_hw_gate')console.log('route',JSON.stringify({from,to,minute,cost:r.cost,minutes:r.minutes,gucenCoinsAtStart:document.state.npcs[G].coins}));return r;};
// 跳过出行的各个闸门：自治工作占用、日程预订、认知出行、受理拘留。每次调用只记 gucen，结果去重。
const seen=new Set(),note=(k,v)=>{const line=k+' '+JSON.stringify(v);if(!seen.has(line)){seen.add(line);console.log('gate',line);}};
if(engine.npcAutonomyBusy){const f=engine.npcAutonomyBusy.bind(engine);engine.npcAutonomyBusy=(st,id,...r)=>{const v=f(st,id,...r);if(id===G)note('npcAutonomyBusy',v??null);return v;};}
if(engine.npcScheduleReservations)note('npcScheduleReservations.has(gucen)',engine.npcScheduleReservations.has(G));
globalThis.__LEDGER_TRACE__=[];
for(let i=0;i<30;i++){
 const out=await engine.reduce(document,{tool:'world_act',eventId:`filing-theft-${i}`,args:{action:'core:crime.steal',slots:{target:'npc_hw_linsui',coins:1}}});
 const next=applyPatches(document,out.patches);
 if(out.result.success||i===0){show(`after steal#${i}`,next);
  console.log('ledger(gucen)',JSON.stringify(globalThis.__LEDGER_TRACE__.filter(t=>JSON.stringify(t).includes(G))));
  const w=out.patches.filter(p=>JSON.stringify(p.path??p).includes(G)&&JSON.stringify(p).includes('scheduleTravel'));
  console.log('patches touching gucen scheduleTravel',JSON.stringify(w).slice(0,600));break;}
}
