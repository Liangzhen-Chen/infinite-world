// 批次 2：每户每日烧柴/自采的逐持有人累计记录（state.family.upkeep[户键].burned / .gathered）与行动记录（spent.materials / spent.returned）、
// 账本流水逐项对得上：任一持有人的木头变化 = −Σ(行动 materials − returned) − 烧柴 + 自采入库。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {openLedger,auditLedger} from '../server-plugin/ledger.mjs';
import {advanceHouseholdMeals} from '../server-plugin/npc-life.mjs';
import {npcCraft} from '../server-plugin/npc-autonomy.mjs';
const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const A='npc_hw_luowei',B='npc_hw_duanyan',home='loc_hw_northwood',WOOD='item_wood';
function fixture({capacity=2000,separate=false,owned=false,location=home,settlement='loc_hw',food=0,fullClock=false}={}){
 const w=structuredClone(world);
 w.rules.householdSubsistence.portionsPerKm2=capacity;
 if(!fullClock)w.rules.wildlife.habitats=w.rules.wildlife.habitats.filter(h=>h.location===location);
 // Arithmetic fixtures isolate one reachable commons, including plant-only
 // terrain: other published places remain in the catalog for I6 references.
 if(!fullClock)w.routes=w.routes.filter(edge=>[home,location,settlement].includes(edge.from)&&[home,location,settlement].includes(edge.to));
 w.locations.find(l=>l.id===location).areaKm2=1;
 if(owned)w.locations.find(l=>l.id===location).owner='player';
 w.households=separate?[{id:'forage-a',members:[A],settlement,homeLocation:location},{id:'forage-b',members:[B],settlement,homeLocation:location}]:[{id:'forage',members:[A,B],settlement,homeLocation:location}];
 // Work is assigned only at existing routine edges, not an invented08:00
 // boundary inside a single all-day fixture slot.
 for(const n of w.npcs){delete n.tier;n.schedule={default:[[0,480],[480,720],[720,780],[780,1020],[1020,1440]].map(([start,end])=>({start,end,location,activity:start===720?'午饭':start===0||start===1020?'睡眠':'日常起居',services:[]}))};}
 const e=new WorldEngine(w),doc=e.createCharacter(legacy,{},'k16-forage');
 doc.state.npcs=Object.fromEntries([A,B].map(id=>[id,{...doc.state.npcs[id],inventory:{...(id===A&&food?{item_wild_food:food}:{}),...(id===A?{item_wood:1000}:{})},coins:0,location,status:'正常'}]));
 delete doc.state.records['agriculture:loc_hw'];
 doc.state.settlements={...(fullClock?doc.state.settlements:{}),[settlement]:{...doc.state.settlements[settlement],granary:false,population:2,food:0}};
 doc.state.minute=0;doc.ledger=openLedger(e,doc);return {e,doc,d:e.primitiveDraft(doc)};
}

const held=(f,id)=>f.e.quantity(f.d,id,WOOD);
const counter=(f,field,id)=>Object.values(f.d.get('state','family','upkeep')??{}).reduce((n,row)=>n+(row[field]?.[id]?.[WOOD]??0),0);
const sinkFlow=f=>f.d.get('ledger','flows','sink:consume|item_wood|fuel')??0;

test('两户各自烧柴、制作失败有退料、有自采：每人木头变化 = −行动净扣料 − 烧柴 + 自采入库，逐项对上记录与账本',()=>{
 const f=fixture({separate:true});
 // B 手里没有柴：要靠自采；A 有 1000 件，只烧不采。
 const start={[A]:held(f,A),[B]:held(f,B)},flow0=sinkFlow(f);
 assert.equal(start[B],0);
 // A 做一批会失败并退料的制作（逐个事件编号试，骰点由事件编号确定）：只统计制作记录里的净扣料。
 let net=0,returned=0;
 for(let i=0;i<40;i++){
  const made=npcCraft(f.d,f.e,A,'recipe_wooden_pegs',{start:0,at:20,actionId:`b2-craft-${i}`,location:home,minutes:20});
  const used=made.spent.materials.filter(m=>m.item===WOOD).reduce((n,m)=>n+m.amount,0),back=(made.spent.returned??[]).filter(m=>m.item===WOOD).reduce((n,m)=>n+m.amount,0);
  net+=used-back;returned+=back;
 }
 assert.ok(returned>0,'试 40 次里至少有一次失败并退回了木头');
 assert.equal(held(f,A),start[A]-net,'制作后：行囊变化 = −(materials − returned)');
 const afterCraft={[A]:held(f,A),[B]:held(f,B)};
 for(let day=0;day<6;day++)advanceHouseholdMeals(f.d,f.e,day);
 const burned={[A]:counter(f,'burned',A),[B]:counter(f,'burned',B)},gathered={[A]:counter(f,'gathered',A),[B]:counter(f,'gathered',B)};
 assert.ok(burned[A]>0,'有柴的一户烧了柴');assert.ok(gathered[B]>0,'没柴的一户自采了柴');
 for(const id of [A,B])assert.equal(held(f,id)-afterCraft[id],-burned[id]+gathered[id],`${id}：六天内变化 = −烧柴 + 自采`);
 // 与账本一致：两户记录的烧柴总件数 = 账本 sink:consume|item_wood|fuel 的流水增量（制作的料走 sink:consume|item_wood|craft，不混在里面；本夹具里只有 npc-life 往 fuel 汇写木头）。
 assert.equal(burned[A]+burned[B],sinkFlow(f)-flow0);
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});
