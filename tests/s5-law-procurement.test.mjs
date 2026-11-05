import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fixture,host,worker,inn,DAY} from './helpers/finance.mjs';
import {withLedger} from '../server-plugin/ledger.mjs';
import {autonomyCandidates} from '../server-plugin/autonomy-candidates.mjs';
import {subjectiveView} from '../server-plugin/subjective-view.mjs';
import {advanceNpcAutonomy} from '../server-plugin/npc-autonomy.mjs';
import {advanceNpcSchedules,scheduleAt} from '../server-plugin/npc-schedule.mjs';
import {householdWorkTime,marketTimeWindows} from '../server-plugin/npc-state.mjs';
import {CampaignStorage} from '../server-plugin/storage.mjs';
import {conservation,reconcile} from './helpers/ledger-audit.mjs';
import {tmpRoot} from '../tools/tmp-root.mjs';

const market='loc_bs';
function scenario({known=true}={}){
 const f=fixture({at:inn});delete f.w.rules.weather;f.doc.state.location='loc_hw';
 Object.assign(f.w.rules.facilities.maintenance,{horizonDays:14,delayMaxPermille:0,stubbornPermille:0,noisePermille:0});
 f.e.byId.get(inn).lodging.rooms=20;f.e.byId.get(inn).fixtures=[];// K5：去掉设备即没有工位
 f.w.rules.economy.rentalCopperPerNight=10;f.w.rules.economy.dailyIncomeBySkillStage[0]=[1,1];
 f.doc.state.buildings[inn].condition=59;
 f.doc.state.npcs=Object.fromEntries([host,worker].map(id=>[id,f.doc.state.npcs[id]]));
 f.e.byId.get(host).relationships=[];
 f.e.byId.get(worker).workplace={location:market};
 f.e.byId.get(worker).schedule={default:[{start:0,end:1440,location:market,activity:'营业',services:['trade']}]};
 f.doc.state.npcs[worker].location=market;
 f.doc.state.npcs[host].inventory={};f.doc.state.npcs[worker].inventory={item_wood:{quantity:20},item_stone:{quantity:20}};
 f.w.routes=[{id:'procurement-road',from:inn,to:market,modes:['walk'],lengthKm:2,terrainMultiplier:1,toll:2,closedSeasons:[]}];
 if(known)f.doc.state.npcs[host].memoryStream=['item_wood','item_stone'].map(item=>({id:`observed:${item}`,key:`market:${market}:${item}`,kind:'knowledge',minute:0,location:market,sourceType:'亲历',value:{unitPrice:2},content:'见过的市场报价'}));
 f.doc=withLedger(f.e,f.doc).document;return f;
}
const candidates=f=>autonomyCandidates(f.e,subjectiveView(f.e,f.doc,host),{document:f.doc}).filter(c=>c.legacy?.kind==='procure_inputs');
function choose(f,day=0){
 const d=f.draft(),at=day*DAY+600;d.set(['state','minute'],at);advanceNpcSchedules(d,f.e,at-1,at);
 advanceNpcAutonomy(d,f.e,at,at,`choose:${day}`,{beforeState:d.get('state')});d.done();
 return f.doc.state.npcAutonomy?.tasks?.[`npc_daily_${day}_${host}`]??null;
}
function finish(f,at){
 const d=f.draft(),before=d.get('state','minute');d.set(['state','minute'],at);advanceNpcSchedules(d,f.e,before,at);
 advanceNpcAutonomy(d,f.e,before,at,`finish:${at}`);d.done();
}

test('木4石2：真实往返60分钟、服务10分钟、路费4，取货返回后四班施工完工',()=>{
 // Walking2km at4km/h =30 each way; wood4+stone2 at known2 =12.
 // Trip70min, toll4; no goods move before service ends at640. Service loss
 // avoided:20 rooms×10×1/2×(14−4 shifts−1 buying day)=900. Known goods12
 // +toll4+repair labor2+trip labor1=19, so zero-noise utility=881.
 const f=scenario(),before=structuredClone(f.doc),c=candidates(f)[0];
 assert.ok(c);assert.deepEqual(c.legacy.inputs,[{item:'item_wood',quantity:4},{item:'item_stone',quantity:2}]);
 assert.equal(c.legacy.returnAt-c.legacy.departAt,70);assert.equal(c.legacy.travelCoins,4);
 assert.equal(c.cost.coins,16);assert.equal(c.utility,881);
 const task=choose(f);assert.equal(task?.action.kind,'procure_inputs');
 assert.equal(f.doc.state.npcs[host].coins,496);assert.equal(f.e.quantity({document:f.doc,get:(...p)=>p.reduce((v,k)=>v?.[k],f.doc)},host,'item_wood'),0);
 assert.equal(f.doc.state.npcs[host].plan.steps[0].done,false);
 assert.equal(scheduleAt(f.e,host,610,f.doc.state).location,null);
 assert.equal(marketTimeWindows(f.doc.state,host)[0].end,670);
 finish(f,639);assert.equal(f.doc.state.npcs[host].inventory.item_wood,undefined);
 assert.equal(f.doc.state.npcs[host].location,market);
 finish(f,640);
 assert.equal(f.doc.state.npcAutonomy.tasks[task.id].status,'已完成',f.doc.state.npcAutonomy.tasks[task.id].reason);
 assert.equal(f.doc.state.npcs[host].inventory.item_wood.quantity,4);
 assert.equal(f.doc.state.npcs[host].inventory.item_stone.quantity,2);
 assert.equal(f.doc.state.buildings[inn].condition,59);
 assert.equal(f.doc.state.npcs[host].plan.steps[0].done,true);
 finish(f,670);assert.equal(f.doc.state.npcs[host].location,inn);
 for(let day=1;day<=4;day++){
  assert.equal(choose(f,day)?.action.kind,'repair_building');finish(f,day*DAY+840);
 }
 assert.equal(f.doc.state.buildings[inn].condition,100);
 assert.equal(f.doc.state.npcs[host].plan.status,'completed');
 assert.equal(Object.values(f.doc.state.projects).find(p=>p.creator===host).minutesDone,960);
 assert.deepEqual(conservation(f.e,before,f.doc),[]);assert.deepEqual(reconcile(f.e,f.doc),{audit:[],drift:[],lots:[],mismatches:[]});
});

test('未知市场不读远方库存：记录供应约束，公库木石与建筑保持原值',()=>{
 // Stock20 each is remote truth, not knowledge; public wood28/stone12 are
 // not owned by this buyer and cannot fund even one unit of repair.
 const f=scenario({known:false}),before=structuredClone(f.doc.state.settlements);
 assert.deepEqual(candidates(f),[]);choose(f);
 const row=f.doc.state.records[`input_constraint:${host}:repair:${inn}`];
 assert.ok(row);assert.ok(row.blocked.includes('no_known_supply'));
 assert.equal(f.doc.state.buildings[inn].condition,59);assert.deepEqual(f.doc.state.settlements,before);
 assert.equal(f.doc.state.npcs[host].coins,500);
});

test('拒售或到店无货不交付、不扣货款，已发生路费与往返时间仍保留',()=>{
 // A visit costs4 even if sale fails; the quoted12 never becomes payment.
 for(const reason of ['refuse','empty','absent']){
  const f=scenario(),task=choose(f);assert.ok(task);
  if(reason==='refuse')f.e.byId.get(worker).redLines=['sell'];
  if(reason==='empty'){const d=f.draft();d.set(['state','npcs',worker,'inventory'],{});d.done();}
  if(reason==='absent'){const d=f.draft();d.set(['state','npcs',worker,'status'],'患病');d.done();}
  finish(f,640);
  assert.equal(f.doc.state.npcAutonomy.tasks[task.id].status,'失败');
  assert.equal(f.doc.state.npcs[host].coins,496);assert.deepEqual(f.doc.state.npcs[host].inventory,{});
  assert.equal(f.doc.state.npcs[worker].coins,500);assert.equal(f.doc.state.buildings[inn].condition,59);
  finish(f,670);assert.equal(f.doc.state.npcs[host].location,inn);
 }
});

test('整体筹料篮子受负重、预算、义务与照料工时约束',()=>{
 // Wood4×100kg exceeds the actual body limit; cash0 cannot pay toll4.
 // No travel or stock grant is an acceptable substitute for these gates.
 for(const reason of ['carry','cash','care','levy','obligation']){
  const f=scenario();
  if(reason==='carry')f.e.byId.get('item_wood').weight=100;
  if(reason==='cash')f.doc.state.npcs[host].coins=0;
  if(reason==='care')f.doc.state.npcs[host].caring={location:inn,illness:'dependent'};
  if(reason==='levy')f.doc.state.npcs[host].levy={location:inn};
  if(reason==='obligation')f.doc.state.obligations.busy={id:'busy',kind:'promise',reservationVersion:1,type:'会面',promisor:host,promisee:worker,start:620,deadline:680,status:'待履行',departures:{[host]:620,[worker]:620},attendance:{},location:inn};
  f.doc=withLedger(f.e,f.doc).document;
  assert.equal(choose(f),null,reason);assert.equal(f.doc.state.buildings[inn].condition,59);
 }
});

test('筹料时间进入K04劳动预算，采购窗口排斥并发用工',()=>{
 // Real70-minute visit600..670 overlaps the morning work window in full.
 const f=scenario(),before=householdWorkTime(f.e,f.doc.state,host,600);choose(f);
 const after=householdWorkTime(f.e,f.doc.state,host,600);
 assert.equal(before.workMinutes-after.workMinutes,70);
 assert.throws(()=>f.e.assertNpcObligationAction({document:f.doc,get:(...p)=>p.reduce((v,k)=>v?.[k],f.doc)},[host],{start:650,minutes:1,kind:'autonomy'}),/赶集/);
});

test('途中存读档和同种子重放保持完整计划、付款与交付一致',async t=>{
 // Save before arrival:0 wood. Resume the same640 service boundary exactly
 // once:4 wood/2stone and one payment basket, then return at670.
 const a=scenario(),b=scenario();choose(a);choose(b);finish(a,620);finish(b,620);
 const integers=value=>{if(typeof value==='number')assert.ok(Number.isSafeInteger(value));else if(value&&typeof value==='object')for(const child of Object.values(value))integers(child);};
 integers(a.doc.state.npcs[host].plan);integers(a.doc.state.npcAutonomy.tasks);
 const dir=await fs.mkdtemp(path.join(tmpRoot(),'k14-procurement-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const store=new CampaignStorage(dir,{reducer:a.e.reduce.bind(a.e)});
 await store.create({id:'procurement',worldVersion:a.w.version??'test',document:a.doc});
 a.doc=(await new CampaignStorage(dir,{reducer:a.e.reduce.bind(a.e)}).read('procurement')).document;
 for(const at of [640,670]){finish(a,at);finish(b,at);}
 assert.deepEqual(a.doc,b.doc);
 assert.equal(Object.values(a.doc.state.records).filter(r=>r.category==='market_trade'&&r.buyer===host).length,2);
});

test('已学制作配方也用同一筹料路径，返回后才按原配方消耗投入和检定',()=>{
 // A wooden-pegs batch needs1 wood and20 real workstation minutes. Knife
 // ownership and an available station remain required; no output is granted
 // by buying the wood. The original craft die still determines its outcome.
 const f=scenario(),recipe=f.e.byId.get('recipe_wooden_pegs');
 f.doc.state.buildings[inn].condition=100;
 f.doc.state.npcs[host].recipes={[recipe.id]:true};
 for(const tool of recipe.tools)f.doc.state.npcs[host].inventory[tool]={quantity:1,durability:100};
 // K5：搭一张木作台（公开、不收费、属于店主），代替手写工位。
 f.e.byId.get(inn).fixtures=[{fixture:'workbench',id:'station_test_woodworking',owner:host,fee:0}];
 f.e.byId.get(recipe.output.item).basePrice=100;
 f.doc.ledger=undefined;f.doc=withLedger(f.e,f.doc).document;
 const task=choose(f);assert.equal(task?.action.kind,'procure_inputs');assert.equal(task.action.purpose,`craft:${recipe.id}`);
 assert.deepEqual(task.action.inputs,[{item:'item_wood',quantity:1}]);
 finish(f,task.finish);finish(f,task.action.returnAt);
 assert.equal(f.doc.state.npcs[host].inventory.item_wood.quantity,1);
 assert.equal(f.doc.state.npcs[host].inventory[recipe.output.item],undefined);
 const craft=choose(f,1);assert.equal(craft?.action.kind,'craft');assert.equal(craft.action.recipe,recipe.id);
 finish(f,craft.finish);
 const row=f.doc.state.npcAutonomy.actions[craft.id];assert.equal(row.spent.minutes,20);
 assert.equal(row.spent.materials[0].amount,1);assert.equal(f.doc.state.npcs[host].inventory.item_wood?.quantity??0,0);
 assert.equal(f.doc.state.npcs[host].inventory[recipe.output.item]?.quantity??0,row.outcome.success?4:0);
 assert.deepEqual(reconcile(f.e,f.doc),{audit:[],drift:[],lots:[],mismatches:[]});
});

test('真实引擎推进整段和切段均沿原调度器完成同一到店交付和返回',()=>{
 // Starting599: decision600, arrival630, purchase640, return670. Querying
 // or splitting at630 must not skip a physical leg or settle the basket twice.
 const a=scenario(),b=scenario();
 for(const f of [a,b])f.doc.state.minute=599;
 const da=a.e.primitiveDraft(a.doc),db=b.e.primitiveDraft(b.doc);
 a.e.advance(da,71,'native-roundtrip');
 b.e.advance(db,31,'native-arrival');
 assert.equal(db.get('state','npcs',host,'location'),market);
 assert.equal(db.get('state','npcs',host,'inventory','item_wood'),undefined);
 b.e.advance(db,40,'native-return');
 assert.equal(da.get('state','npcs',host,'inventory','item_wood','quantity'),4);
 assert.equal(da.get('state','npcs',host,'location'),inn);
 assert.deepEqual(da.get('state','npcs',host),db.get('state','npcs',host));
 assert.deepEqual(da.get('state','npcAutonomy'),db.get('state','npcAutonomy'));
 assert.deepEqual(da.document.ledger,db.document.ledger);
});

test('异地库存与他人私密报价不改变未知者的候选，已知者仍只使用收到的报价',()=>{
 // Remote stock0 versus200 is invisible to a buyer at home. A private
 // memory belonging to someone else is not a source of even one offer.
 const unknown=scenario({known:false});
 unknown.doc.state.npcs[host].memoryStream.push({id:'private-price',key:`market:${market}:item_wood`,kind:'knowledge',minute:0,location:market,private:true,subject:worker,participants:[worker],value:{unitPrice:1}});
 assert.deepEqual(candidates(unknown),[]);
 const known=scenario(),before=structuredClone(candidates(known));
 known.doc.state.npcs[worker].inventory={};
 assert.deepEqual(candidates(known),before);
 assert.deepEqual(candidates(known),before); // A query consumes no seed or state.
});

test('路线不能越过私宅许可；未能出发的行程不冻结计划或付款',()=>{
 // A known price and positive utility cannot grant private entry. Denial
 // consumes0 coins, reserves0 trips and leaves0 stale timed plan steps.
 const f=scenario();f.e.byId.get(market).access={mode:'private',requiresConsent:true};
 assert.equal(choose(f),null);
 assert.equal(f.doc.state.npcs[host].coins,500);
 assert.equal(f.doc.state.npcs[host].plan??null,null);
 assert.deepEqual(marketTimeWindows(f.doc.state,host),[]);
 assert.ok(f.doc.state.records[`input_constraint:${host}:repair:${inn}`].reason);
});
