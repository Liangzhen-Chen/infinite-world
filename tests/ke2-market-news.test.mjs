// 卡 E2 第三轮：行情会传开（market-news）、人家的日用缺口是收货需求（market.upkeepWants）、决策里工时只算一次。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {placeSettlement,personHousehold} from '../server-plugin/entity-view.mjs';
import {knownMarket,marketKey} from '../server-plugin/market-news.mjs';
import {subjectiveView} from '../server-plugin/subjective-view.mjs';
import {upkeepWants} from '../server-plugin/market.mjs';
import {householdUsage} from '../server-plugin/household-budget.mjs';
import {npcDecision} from '../server-plugin/npc-decision.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const DAY=1440;
const home=(engine,s,id)=>personHousehold(engine,s,id).value?.settlement??placeSettlement(engine,s,s.npcs[id]?.location).value;
const news=(s,id)=>(s.npcs[id].memoryStream??[]).filter(m=>String(m.key??'').startsWith('market:')&&m.value?.values);

test('行情见闻：作息里到过外聚落的人记下那里的行情（带过期时刻），也带着自家的行情；见闻经交谈传给熟人，听的人知道那里的价',{timeout:600000},async()=>{
 const engine=new WorldEngine(structuredClone(world));let doc=engine.createCharacter(seed,{},'ke2-news');
 const step=async h=>{const out=await engine.reduce(doc,{tool:'world_time',args:{minutes:60},eventId:`ke2news${h}`});if(out.patches?.length)doc=applyPatches(doc,out.patches);};
 await step(0);
 const s=doc.state,cycle=engine.rules.economy.tradeCycleDays*DAY;
 // 开局的见闻由作息派生：有人当天的作息到了外聚落，就有那里的亲历见闻；没有人是凭空撒的。
 const seen=Object.keys(s.npcs).filter(id=>news(s,id).some(m=>m.sourceType==='亲历'&&m.value.settlement!==home(engine,s,id)));
 assert.ok(seen.length>0,'有人见过外聚落的行情');
 for(const id of seen){
  for(const m of news(s,id).filter(m=>m.sourceType==='亲历')){
   assert.equal(m.value.expires-m.value.minute,cycle,'见闻过一个交易周期过期');
   assert.ok(Object.values(m.value.values).every(v=>Number.isFinite(v)&&v>0));
  }
  assert.ok(news(s,id).some(m=>m.value.settlement===home(engine,s,id)),'出门的人也带着自家聚落的行情');
 }
 // 见闻按本人所知读取：没过期的才算；过期了就不再当现价。
 const who=seen[0],there=news(s,who).find(m=>m.value.settlement!==home(engine,s,who)).value.settlement;
 assert.ok(knownMarket(subjectiveView(engine,doc,who),there));
 const later={...doc,state:{...doc.state,minute:doc.state.minute+cycle+1}};
 assert.equal(knownMarket(subjectiveView(engine,later,who),there),null);
 // 两天后，听来的见闻带着价（转述保留了数量），且是熟人当面转述的。
 for(let h=1;h<48;h++)await step(h);
 const heard=Object.keys(doc.state.npcs).flatMap(id=>news(doc.state,id).filter(m=>m.sourceType==='听说').map(m=>({id,m})));
 assert.ok(heard.length>0,'有人听说了别处的行情');
 for(const {id,m} of heard){
  assert.equal(m.key,marketKey(m.value.settlement));
  assert.equal(m.transmissionChain.at(-1).to,id);
  assert.notEqual(m.heardFrom,id);
 }
});

test('人家的日用缺口是收货需求：按缺的件数扣掉家里已有的，只记在户里编号最小的成员名下',()=>{
 const engine=new WorldEngine(structuredClone(world)),doc=engine.createCharacter(seed,{},'ke2-upkeep'),s=doc.state;
 const h=engine.world.households.find(x=>x.members.length>1&&x.members.every(m=>s.npcs[m]));
 assert.ok(h,'有多人家户');
 const members=[...h.members].sort();
 // 每个用度类都连着缺了三天，家里一点存货也没有。
 s.family??={};s.family.upkeep??={};
 s.family.upkeep[h.id]=Object.fromEntries(householdUsage(engine,s,members).map(u=>[`${u.cls}ShortDays`,3]));
 for(const m of members)for(const item of Object.keys(s.npcs[m].inventory??{}))s.npcs[m].inventory[item]=0;
 const wants=upkeepWants(s,engine,members[0]);
 assert.ok(wants.length>0,'缺柴缺盐的户有要买的日用');
 assert.deepEqual(upkeepWants(s,engine,members[1]),[],'只记在编号最小的成员名下');
 // 家里已经有了一部分，要买的就少这一部分。
 const row=wants[0];s.npcs[members[1]].inventory[row.item]=1;
 const again=upkeepWants(s,engine,members[0]).find(w=>w.item===row.item);
 assert.equal(again?again.quantity:0,row.quantity-1);
});

test('决策里工时只算一次：请求自己按工价给出时间值多少时，不再按分钟另折',()=>{
 const engine=new WorldEngine(structuredClone(world)),doc=engine.createCharacter(seed,{},'ke2-time');
 const who=Object.keys(doc.state.npcs).sort().find(id=>engine.byId.get(id));
 const view=subjectiveView(engine,doc,who);
 const priced=npcDecision(view,{kind:'labor',cost:{coins:0,value:10,timeValue:5,minutes:6000},needSatisfaction:16});
 const plain=npcDecision(view,{kind:'labor',cost:{coins:0,value:15,minutes:0},needSatisfaction:16});
 const costOf=r=>r.trace.find(t=>t.stage==='cost_benefit').basis.cost;
 assert.equal(costOf(priced),costOf(plain),'按工价给出的时间成本与同额货值一样，分钟数不再另计');
});
