import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {withLedger,accountKey,auditLedger} from '../server-plugin/ledger.mjs';
import {openHoldings} from '../server-plugin/holdings.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {readBodyNeed} from '../server-plugin/primitives-body.mjs';
import {trackSingleItem} from '../server-plugin/items.mjs';
import {dieOf} from './helpers/daily-b2.mjs';
import '../server-plugin/primitives-runtime.mjs';

const original=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const INN='bld_hw_qingdeng',SELLER='npc_hw_linsui',BREAD='item_oat_flatbread',STEW='item_mutton_turnip_stew';
const stack=quantity=>({quantity,quality:'木',durability:100,weight:.2});
function fixture(){
 const world=structuredClone(original);
 for(const n of world.npcs){n.tier='fixture';delete n.schedule;}
 for(const key of ['weather','settlementTrade','worldClock','hazardClock','factionClock'])delete world.rules[key];
 for(const f of world.factions)delete f.clock;
 const seller=world.npcs.find(n=>n.id===SELLER);
 seller.schedule={default:[{start:0,end:1440,location:INN,activity:'营业',services:['trade']}]};
 world.items.find(r=>r.id===BREAD).basePrice=8;world.items.find(r=>r.id===STEW).basePrice=15;
 const engine=new WorldEngine(world),document=engine.initialFromLegacy(seed,'a3-daily');
 document.state.location=INN;document.state.player.coins=60;
 document.state.player.body={satiety:{value:30,asOf:document.state.minute,activity:'rest'}};
 Object.assign(document.state.npcs[SELLER],{location:INN,status:'正常',activity:'营业',goals:{}});
 document.state.npcs[SELLER].inventory[BREAD]=stack(4);document.state.npcs[SELLER].inventory[STEW]=stack(4);
 return {world,engine,document};
}
function book(f){f.document=withLedger(f.engine,f.document).document;f.document.holdings=openHoldings(f.engine,f.document);return f;}
async function act(f,action,slots,eventId){
 const out=await f.engine.reduce(f.document,{tool:'world_act',args:{action,slots},eventId});
 return {out,after:applyPatches(f.document,out.patches)};
}
const qty=(f,d,owner,item)=>f.engine.quantity(f.engine.primitiveDraft(d),owner,item);

test('A3 D05: ordering real cooked dishes costs 23 coins and 25 minutes, eats purchased food and preserves old supplies',async()=>{
 const f=fixture();f.document.state.inventory[BREAD]=stack(1);book(f);
 const registration=f.engine.primitiveDraft(f.document),unit=trackSingleItem(registration,f.engine,'player',BREAD,'old-bread');
 f.document=applyPatches(f.document,registration.patches);const before=structuredClone(f.document);
 const slots={subject:SELLER,item:BREAD,side:STEW},input='a3-order-meal';
 const {out,after}=await act(f,'core:eat.order',slots,input);
 assert.equal(out.result.paid,23);assert.equal(after.state.player.coins,37);
 const event=after.state.records[`world_event:${input}`];
 assert.equal(event.verb,'trade');assert.equal(event.target,SELLER);assert.equal(event.value,23);
 assert.equal(after.state.npcs[SELLER].coins-before.state.npcs[SELLER].coins,23);
 assert.equal(after.state.minute-before.state.minute,25);assert.equal(out.result.cost.time,25);
 for(const item of [BREAD,STEW]){
  assert.equal(qty(f,after,'player',item),qty(f,before,'player',item));
  assert.equal(qty(f,before,SELLER,item)-qty(f,after,SELLER,item),1);
  assert.equal(after.ledger.flows[accountKey('sink:consume',item,'meal')],1);
 }
 assert.deepEqual(after.state.itemInstances[unit],before.state.itemInstances[unit]);
 assert.ok(readBodyNeed(f.engine,after,'player','satiety')>90);
 assert.deepEqual(auditLedger(after.ledger),[]);assert.deepEqual(f.document,before);
 f.document=JSON.parse(JSON.stringify(after));const replay=await act(f,'core:eat.order',slots,input);
 assert.deepEqual(replay.out.patches,[]);assert.equal(replay.out.result.duplicate,true);
 await assert.rejects(act(f,'core:eat.order',{subject:SELLER,item:BREAD},input),/同一事件编号/);
});

test('A3 D05: a second unavailable dish or insufficient cash rolls back the entire order; raw meat is not a cooked meal',async()=>{
 for(const fault of ['stock','coins','raw']){
  const f=fixture();if(fault==='stock')delete f.document.state.npcs[SELLER].inventory[STEW];
  if(fault==='coins')f.document.state.player.coins=20;
  book(f);const before=structuredClone(f.document);
  await assert.rejects(act(f,'core:eat.order',{subject:SELLER,item:BREAD,side:fault==='raw'?'item_mutton':STEW},`order-${fault}`));
  assert.deepEqual(f.document,before);
 }
});

test('A3 daily entry cannot hide real elapsed work inside remember to bypass a prior reservation',async()=>{
 const f=fixture(),now=f.document.state.minute;
 f.document.state.inventory.item_bread=stack(1);
 f.document.state.obligations.busy={id:'busy',reservationVersion:1,type:'会面',promisor:'player',promisee:SELLER,start:now,deadline:now+60,departures:{player:now,[SELLER]:now},status:'进行中',location:INN};
 book(f);const before=structuredClone(f.document);
 for(const [action,slots]of [['core:eat.meal',{item:'item_bread'}],['core:eat.order',{subject:SELLER,item:BREAD,side:STEW}]])
  await assert.rejects(act(f,action,slots,`busy-${action}`),/时段冲突/);
 assert.deepEqual(f.document,before);
});

test('A3 D16: the actual fish broth recipe takes half a shichen, consumes exact ingredients, wears tools and charges body once',async()=>{
 const f=fixture(),recipe=f.world.recipes.find(r=>r.id==='recipe_w3_fish_broth'),s=f.document.state;
 for(const [item,n] of [['item_fish',2],['item_water',2],['item_salt',3],['item_wood_shavings',3]])s.inventory[item]=stack(n);
 for(const item of recipe.tools)s.inventory[item]=stack(1);
 s.skills[recipe.skill]={proficiency:300,daily:{},breakthroughs:[]};
 s.recipes[recipe.id]={source:{type:'teacher',id:SELLER}};
 book(f);const before=structuredClone(f.document),id=Array.from({length:100},(_,i)=>`a3-fish-broth-${i}`).find(id=>dieOf(f.document.randomSeed,id)>=15);
 const {out,after}=await act(f,'core:craft.manufacture',{recipe:recipe.id},id);
 assert.equal(out.result.success,true);assert.equal(recipe.minutes,60,'D16 half a shichen = 60 minutes');
 assert.equal(after.state.minute-before.state.minute,recipe.minutes);
 assert.equal(out.result.spent.minutes,recipe.minutes);assert.equal(out.result.cost.time,recipe.minutes);
 for(const row of recipe.materials)assert.equal(qty(f,before,'player',row.item)-qty(f,after,'player',row.item),row.amount);
 assert.ok(qty(f,after,'player','item_salt')>0);
 assert.equal(qty(f,after,'player',recipe.output.item)-qty(f,before,'player',recipe.output.item),1);
 assert.equal(before.state.player.coins-after.state.player.coins,3);
 for(const item of recipe.tools)assert.equal(before.state.inventory[item].durability-after.state.inventory[item].durability,recipe.toolWear);
 assert.equal(readBodyNeed(f.engine,after,'player','stamina'),92);
 assert.equal(readBodyNeed(f.engine,after,'player','satiety'),26);
 assert.deepEqual(auditLedger(after.ledger),[]);
 const oldReceipt={...out.result};delete oldReceipt.cost;
 const replayed=await f.engine.reduce(before,{tool:'world_craft',args:{operation:'manufacture',recipe:recipe.id},eventId:id},{replay:true,result:oldReceipt});
 const oldAfter=applyPatches(before,replayed.patches);
 assert.deepEqual(oldAfter.state.player.body,before.state.player.body,'pre-A3 craft replay does not acquire new body costs');
 assert.equal(Object.hasOwn(replayed.result,'cost'),false);
});

test('A3 D22: buying a drink really gives it to the speaker; 15 minutes includes purchase, with versioned rumor and conserved money',async()=>{
 const f=fixture(),speaker='npc_hw_hezhou',rumor={id:'rumor_a3_ox',claim:'东头丢了一头牛。',source:speaker,carriers:[speaker],fact:'不能告诉玩家的作者真相'};
 f.world.rumors.push(rumor);f.world.items.find(r=>r.id==='item_milk').basePrice=5;
 f.document.state.npcs[SELLER].inventory.item_milk=stack(2);
 Object.assign(f.document.state.npcs[speaker],{location:INN,status:'正常',activity:'交谈',goals:{}});
 book(f);const before=structuredClone(f.document),slots={subject:speaker,seller:SELLER,item:'item_milk',rumor:rumor.id};
 const {out,after}=await act(f,'core:dialogue.treat_rumor',slots,'a3-treat');
 assert.equal(before.state.player.coins-after.state.player.coins,5);
 assert.equal(after.state.npcs[SELLER].coins-before.state.npcs[SELLER].coins,5);
 assert.equal(qty(f,after,'player','item_milk'),qty(f,before,'player','item_milk'));
 assert.equal(qty(f,after,speaker,'item_milk')-qty(f,before,speaker,'item_milk'),1);
 assert.equal(qty(f,before,SELLER,'item_milk')-qty(f,after,SELLER,'item_milk'),1);
 assert.equal(after.state.minute-before.state.minute,15);assert.equal(out.result.cost.time,15);
 const memory=after.memories[`player::${rumor.id}::${speaker}`];
 assert.equal(memory.source,speaker);assert.equal(memory.reliability,'未核实');
 assert.ok(memory.content.includes(rumor.claim));assert.ok(!JSON.stringify(memory).includes(rumor.fact));
 assert.deepEqual(auditLedger(after.ledger),[]);
 f.document=after;assert.deepEqual((await act(f,'core:dialogue.treat_rumor',slots,'a3-treat')).out.patches,[]);
 await assert.rejects(act(f,'core:dialogue.treat_rumor',{...slots,rumor:'unknown-secret'},'a3-false-rumor'),/没有这条登记传闻/);
});

test('A3 D23: accepting a real posted task takes seven minutes, preserves escrow and cannot be accepted twice',async()=>{
 const f=fixture();f.document.state.location='loc_hw';
 f.document.state.npcs[SELLER].location='loc_hw';book(f);
 const posted=await act(f,'core:quest.publish',{publisher:SELLER,personal:true,grade:'D',reward:20,content:'到磨坊察看',objective:{type:'visit',location:'bld_hw_mill'}},'a3-offer');
 f.document=posted.after;const before=structuredClone(f.document),quest='quest_a3-offer';
 const {out,after}=await act(f,'core:quest.accept',{quest},'a3-take');
 assert.equal(after.state.minute-before.state.minute,7);assert.equal(out.result.cost.time,7);
 assert.equal(after.state.quests[quest].taker,'player');assert.equal(after.state.quests[quest].status,'进行中');
 assert.equal(after.state.quests[quest].escrow,before.state.quests[quest].escrow);
 assert.deepEqual(after.ledger,before.ledger);assert.equal(after.state.player.coins,before.state.player.coins);
 const replayed=await f.engine.reduce(before,{tool:'world_quest',args:{operation:'accept',quest},eventId:'a3-take'},{replay:true,result:{quest,status:'进行中'}});
 const legacy=applyPatches(before,replayed.patches);
 assert.equal(legacy.state.minute,before.state.minute,'pre-A3 accepted events retain their old zero-minute replay');
 assert.deepEqual(legacy.state.player.body,before.state.player.body);assert.equal(Object.hasOwn(replayed.result,'cost'),false);
 f.document=after;await assert.rejects(act(f,'core:quest.accept',{quest},'a3-retake'),/不能接受/);
 assert.equal(f.document.state.minute,after.state.minute);
});

test('A3 dialogue cost: asking uses 15 real minutes, while an archived pre-A3 ask retains its old clock and body',async()=>{
 const f=book(fixture()),before=structuredClone(f.document),slots={subject:SELLER,content:'unknown-topic'};
 const {out,after}=await act(f,'core:dialogue.ask',slots,'a3-ask');
 assert.equal(after.state.minute-before.state.minute,15);assert.equal(out.result.cost.time,15);
 assert.match(out.result.dialogue.text,/不知道/);
 const oldResult={...out.result};delete oldResult.cost;
 const replayed=await f.engine.reduce(before,{tool:'world_remember',args:{key:'dialogue:ask',...slots},eventId:'a3-ask'},{replay:true,result:oldResult});
 const legacy=applyPatches(before,replayed.patches);
 assert.equal(legacy.state.minute,before.state.minute);assert.deepEqual(legacy.state.player.body,before.state.player.body);
 assert.equal(Object.hasOwn(replayed.result,'cost'),false);
});
