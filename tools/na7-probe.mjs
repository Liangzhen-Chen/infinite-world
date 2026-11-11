// NPCAUTO-7 只读探针：不写盘、不改世界文件，只在内存里复现 tests/npc-autonomy.test.mjs 第 7 项（:56-61）的场景并打印 JSON 证据。
// 场景参数出处：seed=tests/fixtures/legacy/seed.json、actor='npc_hw_ayan'（该测试 :11）；setup 同该测试 :12-14（minute=540、location=loc_capital、draft 助手 :12）；
// advance/part 同该测试 :15-26；第 7 项先 advance 到 600、取 actor 的任务、再 d.set(location 或 status)、advance 到 task.finish（:56-61）。
// 不 import 测试文件（测试文件会注册测试并执行）。用法：node tools/na7-probe.mjs
import fs from 'node:fs/promises';
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {advanceNpcSchedules} from '../server-plugin/npc-schedule.mjs';
import {marketScheduleAt} from '../server-plugin/npc-state.mjs';
import {advanceNpcAutonomy,nextNpcAutonomyMinute,npcAutonomyBusy} from '../server-plugin/npc-autonomy.mjs';
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),actor='npc_hw_ayan';
function draft(document){return {document,get(...p){return p.reduce((x,k)=>x?.[k],this.document);},set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);},remove(path){this.document=applyPatches(this.document,[{op:'delete',path}]);}};}
async function setup(){const world=await loadWorld(),engine=new WorldEngine(world),document=engine.initialFromLegacy(seed,'autonomy-test');document.state.minute=540;document.state.location='loc_capital';return {engine,d:draft(document)};}
function part(d,engine,to,event){
 const before=d.get('state','minute'),snapshot=structuredClone(d.get('state'));d.set(['state','minute'],to);
 engine.npcScheduleReservations=new Set(Object.keys(snapshot.npcs).filter(id=>npcAutonomyBusy(snapshot,id,before)||snapshot.npcs[id].cognitionTravel));
 advanceNpcSchedules(d,engine,before,to);engine.npcScheduleReservations=undefined;
 return advanceNpcAutonomy(d,engine,before,to,event,{beforeState:snapshot});
}
function advance(d,engine,to,event='advance',onStep){
 while(d.get('state','minute')<to){const until=Math.min(to,nextNpcAutonomyMinute(d.get('state'),d.get('state','minute')));part(d,engine,until,event);onStep?.();}
}
const body=(d)=>{const n=d.get('state','npcs',actor);return {minute:d.get('state','minute'),location:n.location,status:n.status,activity:n.activity,scheduleTravel:n.scheduleTravel??null,slot:marketScheduleAt(d.get('state'),actor,d.get('state','minute'))};};
const out={};
for(const change of ['location','status']){
 const {engine,d}=await setup();advance(d,engine,600);
 const task=Object.values(d.get('state','npcAutonomy','tasks')).find(t=>t.npc===actor);
 if(!task){out[change]={task:null};continue;}
 if(change==='location')d.set(['state','npcs',actor,'location'],'loc_hw');else d.set(['state','npcs',actor,'status'],'昏迷');
 const trace=[body(d)];
 // 每 10 分钟取一次身体与作息段（推进本身仍按任务边界分段，与原测试一致）。
 for(let m=d.get('state','minute')+10;m<task.finish;m+=10){advance(d,engine,m);trace.push(body(d));}
 advance(d,engine,task.finish);trace.push(body(d));
 const after=d.get('state','npcAutonomy','tasks',task.id);
 out[change]={task:{id:task.id,kind:task.action.kind,itinerary:Boolean(task.itinerary),presence:task.presence,start:task.start,finish:task.finish},trace,result:{status:after.status,reason:after.reason??null,hasActionRecord:Boolean(d.get('state','npcAutonomy','actions',task.id))}};
}
console.log(JSON.stringify(out,null,1));
