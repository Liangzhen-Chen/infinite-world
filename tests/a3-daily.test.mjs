import {assertActionRejected} from './helpers/action-refusal.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {withLedger,accountKey,auditLedger} from '../server-plugin/ledger.mjs';
import {openHoldings} from '../server-plugin/holdings.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {readBodyNeed,bodyRule} from '../server-plugin/primitives-body.mjs';
import {trackSingleItem} from '../server-plugin/items.mjs';
import {facilityRuntime} from '../server-plugin/facility-state.mjs';
import {dieOf,scene} from './helpers/daily-b2.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';
import '../server-plugin/primitives-runtime.mjs';

const original=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const INN='bld_hw_qingdeng',SELLER='npc_hw_linsui',BREAD='item_oat_flatbread',STEW='item_mutton_turnip_stew';
const stack=quantity=>({quantity,quality:'木',durability:100,weight:.2});
function fixture(){
 const world=structuredClone(original);
 for(const n of world.npcs){n.tier='fixture';delete n.schedule;}
 // Like the removed NPC schedules, household errands must not displace the
 // explicitly placed speakers in these isolated action-cost anchors.
 for(const key of ['weather','settlementTrade','worldClock','hazardClock','factionClock','householdSubsistence'])delete world.rules[key];
 for(const f of world.factions)delete f.clock;
 const seller=world.npcs.find(n=>n.id===SELLER);
 seller.schedule={default:[{start:0,end:1440,location:INN,activity:'营业',services:['trade']}]};
 // S5-02: reserve ceil(2*60/35)=4 stew; fifth portion remains saleable. Meal = trunc(8*.5)+trunc(15*.5*depth)=4+7=11.
 world.items.find(r=>r.id===BREAD).basePrice=8;world.items.find(r=>r.id===STEW).basePrice=15;
 const engine=new WorldEngine(world),document=engine.initialFromLegacy(seed,'a3-daily');
 document.state.location=INN;document.state.player.coins=60;
 document.state.player.body={satiety:{value:30,asOf:document.state.minute,activity:'rest'}};
 Object.assign(document.state.npcs[SELLER],{location:INN,status:'正常',activity:'营业',goals:{}});
 document.state.npcs[SELLER].inventory[BREAD]=stack(4);document.state.npcs[SELLER].inventory[STEW]=stack(5);
 return {world,engine,document};
}
function book(f){f.document=withLedger(f.engine,f.document).document;f.document.holdings=openHoldings(f.engine,f.document);return f;}
async function act(f,action,slots,eventId){
 const out=await f.engine.reduce(f.document,{tool:'world_act',args:{action,slots},eventId});
 return {out,after:applyPatches(f.document,out.patches)};
}
const qty=(f,d,owner,item)=>f.engine.quantity(f.engine.primitiveDraft(d),owner,item);

test('A3 D05: ordering real cooked dishes costs the two quoted prices and 25 minutes, eats purchased food and preserves old supplies',async()=>{
 const f=fixture();f.document.state.inventory[BREAD]=stack(1);book(f);
 const registration=f.engine.primitiveDraft(f.document),unit=trackSingleItem(registration,f.engine,'player',BREAD,'old-bread');
 f.document=applyPatches(f.document,registration.patches);const before=structuredClone(f.document);
 const slots={subject:SELLER,item:BREAD,side:STEW},input='a3-order-meal';
 const {out,after}=await act(f,'core:eat.order',slots,input);
 // 应付 = 两道菜依次各买一份的现价之和：第一道取前态现价，第二道取“第一道成交后”的现价（同一卖家的供需随成交变化，不能都按前态报价；
 // 第一道成交后的状态由只点第一道的真实订餐得到）。WATER-1B/卖家预留随炖菜水分派生而变，总价由旧值 11 变为现价；期望从引擎报价读，不手改数字。
 const quoteOf=(doc,item)=>facilityRuntime().currentTradeQuote(f.engine,doc,{buyer:'player',seller:SELLER,item,quantity:1,location:INN}).totalCoins;
 const firstOnly=await act(f,'core:eat.order',{subject:SELLER,item:BREAD},'a3-order-first');
 const quoted=quoteOf(before,BREAD)+quoteOf(firstOnly.after,STEW);
 assert.equal(out.result.paid,quoted);assert.equal(after.state.player.coins,before.state.player.coins-quoted);
 const event=after.state.records[`world_event:${input}`];
 assert.equal(event.verb,'trade');assert.equal(event.target,SELLER);assert.equal(event.value,quoted);
 assert.equal(after.state.npcs[SELLER].coins-before.state.npcs[SELLER].coins,quoted);
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
  if(fault==='coins')f.document.state.player.coins=10;
  book(f);const before=structuredClone(f.document);
  await assertActionRejected(act(f,'core:eat.order',{subject:SELLER,item:BREAD,side:fault==='raw'?'item_mutton':STEW},`order-${fault}`));
  assert.deepEqual(f.document,before);
 }
});

test('A3 daily entry cannot hide real elapsed work inside remember to bypass a prior reservation',async()=>{
 const f=fixture(),now=f.document.state.minute;
 f.document.state.inventory.item_bread=stack(1);
 f.document.state.obligations.busy={id:'busy',reservationVersion:1,type:'会面',promisor:'player',promisee:SELLER,start:now,deadline:now+60,departures:{player:now,[SELLER]:now},status:'进行中',location:INN};
 book(f);const before=structuredClone(f.document);
 for(const [action,slots]of [['core:eat.meal',{item:'item_bread'}],['core:eat.order',{subject:SELLER,item:BREAD,side:STEW}]])
  await assertActionRejected(act(f,action,slots,`busy-${action}`),/时段冲突/);
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
 assert.equal(out.result.success,true);
 assert.equal(recipe.minutes,60,'D16.5 half a shichen = 60 minutes (events.md D16.5; A3-astra-plan section 4 D16.5)');
 assert.equal(after.state.minute-before.state.minute,recipe.minutes);
 assert.equal(out.result.spent.minutes,recipe.minutes);assert.equal(out.result.cost.time,recipe.minutes);
 for(const row of recipe.materials)assert.equal(qty(f,before,'player',row.item)-qty(f,after,'player',row.item),row.amount);
 assert.ok(qty(f,after,'player','item_salt')>0);
 assert.equal(qty(f,after,'player',recipe.output.item)-qty(f,before,'player',recipe.output.item),1);
 assert.equal(before.state.player.coins-after.state.player.coins,3);
 for(const item of recipe.tools)assert.equal(before.state.inventory[item].durability-after.state.inventory[item].durability,recipe.toolWear);
 // Manufacturing is heavy work (manufacturing.mjs beginActionActivity 'heavy'):
 // the expected body change is derived from the body table and the recipe
 // minutes, not pinned to one recipe duration.
 for(const need of ['stamina','satiety']){
  const drain=bodyRule(f.engine,need).drainPerHour.heavy*recipe.minutes/60;
  assert.ok(Math.abs(readBodyNeed(f.engine,before,'player',need)-drain-readBodyNeed(f.engine,after,'player',need))<1e-9,need);
 }
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
 // S5-02: hydration reserve ceil(2*72/25)=6 milk; seventh is saleable, trunc(5*.5)=2.
 f.document.state.npcs[SELLER].inventory.item_milk=stack(7);
 Object.assign(f.document.state.npcs[speaker],{location:INN,status:'正常',activity:'交谈',goals:{}});
 book(f);const before=structuredClone(f.document),slots={subject:speaker,seller:SELLER,item:'item_milk',rumor:rumor.id};
 const {out,after}=await act(f,'core:dialogue.treat_rumor',slots,'a3-treat');
 assert.equal(before.state.player.coins-after.state.player.coins,2);
 assert.equal(after.state.npcs[SELLER].coins-before.state.npcs[SELLER].coins,2);
 assert.equal(qty(f,after,'player','item_milk'),qty(f,before,'player','item_milk'));
 assert.equal(qty(f,after,speaker,'item_milk')-qty(f,before,speaker,'item_milk'),1);
 assert.equal(qty(f,before,SELLER,'item_milk')-qty(f,after,SELLER,'item_milk'),1);
 assert.equal(after.state.minute-before.state.minute,15);assert.equal(out.result.cost.time,15);
 const memory=after.memories[`player::${rumor.id}::${speaker}`];
 assert.equal(memory.source,speaker);assert.equal(memory.reliability,'未核实');
 assert.ok(memory.content.includes(rumor.claim));assert.ok(!JSON.stringify(memory).includes(rumor.fact));
 assert.deepEqual(auditLedger(after.ledger),[]);
 f.document=after;assert.deepEqual((await act(f,'core:dialogue.treat_rumor',slots,'a3-treat')).out.patches,[]);
 await assertActionRejected(act(f,'core:dialogue.treat_rumor',{...slots,rumor:'unknown-secret'},'a3-false-rumor'),/没有这条登记传闻/);
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
 f.document=after;await assertActionRejected(act(f,'core:quest.accept',{quest},'a3-retake'),/不能接受/);
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

function joinFixture({trust=30,absent=false,foreign=false,redLine=false}={}){
 const f=fixture(),state=f.document.state;
 state.records['organization:org_a3_join']={category:'organization',id:'org_a3_join',source:'created',name:'入会测试行会',kind:'行会',seat:INN,
  founder:SELLER,foundedAt:0,leader:SELLER,members:{[SELLER]:{position:'会长',joinedAt:0,arrears:0}},removed:{},
  charter:{mode:'leader',approval:true,fee:20,dues:0,rules:[]},treasury:0,ledger:[],sourceEvent:'fixture'};
 Object.assign(state.npcs[SELLER],{trust,affection:trust,goals:{},...(absent?{location:'loc_hw'}:{})});
 const npc=f.world.npcs.find(n=>n.id===SELLER);
 if(foreign){npc.languages=['lang:a3-isolated'];state.player.languages=['lang:common'];}
 if(redLine)npc.redLines=['org.join'];
 return book(f);
}
const joinSlots={org:'org_a3_join'};

test('A3 D36: in-person A2 admission executes once in 15 minutes, transfers the charter fee to the treasury and reloads idempotently',async()=>{
 const f=joinFixture(),before=structuredClone(f.document),{out,after}=await act(f,'core:settlement.org_join',joinSlots,'a3-join');
 assert.equal(out.result.joined,true);assert.equal(out.result.decision.outcome,'agree');
 assert.equal(after.state.minute-before.state.minute,15);assert.equal(out.result.cost.time,15);
 assert.equal(after.state.player.coins,before.state.player.coins-20);
 assert.equal(after.state.npcs[SELLER].coins,before.state.npcs[SELLER].coins);
 assert.equal(after.state.records['organization:org_a3_join'].treasury,20);
 assert.equal(after.state.records['organization:org_a3_join'].members.player.position,'成员');
 const proposal=after.state.records[out.result.proposal];assert.equal(proposal.status,'通过');
 assert.equal(proposal.votes[0].voter,SELLER);assert.equal(proposal.votes[0].decision.trace.length,5);
 assert.ok(readBodyNeed(f.engine,after,'player','stamina')<readBodyNeed(f.engine,before,'player','stamina'));
 assert.deepEqual(reconcile(f.engine,after).mismatches,[]);assert.deepEqual(auditLedger(after.ledger),[]);
 f.document=JSON.parse(JSON.stringify(after));const duplicate=await act(f,'core:settlement.org_join',joinSlots,'a3-join');
 assert.deepEqual(duplicate.out.patches,[]);assert.equal(duplicate.out.result.duplicate,true);
 await assertActionRejected(act(f,'core:settlement.org_join',joinSlots,'a3-join-twice'),/已是成员/);
});

test('A3 D36: conditional, red-line and language decisions never admit the player or charge the charter fee',async()=>{
 for(const [options,expected] of [[{trust:0},'conditional'],[{redLine:true},'refuse'],[{foreign:true},'defer']]){
  const f=joinFixture(options),before=structuredClone(f.document),{out,after}=await act(f,'core:settlement.org_join',joinSlots,`a3-join-${expected}`);
  assert.equal(out.result.decision.outcome,expected);assert.equal(out.result.joined,false);
  assert.equal(after.state.minute-before.state.minute,15);assert.equal(out.result.cost.time,15);
  assert.equal(after.state.records['organization:org_a3_join'].members.player,undefined);
  assert.equal(after.state.records['organization:org_a3_join'].treasury,0);assert.equal(after.state.player.coins,before.state.player.coins);
  assert.deepEqual(after.ledger,before.ledger);assert.deepEqual(reconcile(f.engine,after).mismatches,[]);
  assert.equal(Object.values(after.state.records).filter(r=>r.category==='organization_proposal').length,0,'条件未被接受，不能留下会在次日自行批准的议案');
 }
});

test('A3 D36: absent leaders retain actual pending proposals; archived zero-time admission replays without new A2 or body costs',async()=>{
 const f=joinFixture({absent:true}),before=structuredClone(f.document),pending=await act(f,'core:settlement.org_join',joinSlots,'a3-remote-join');
 assert.equal(pending.out.result.joined,false);assert.equal(pending.out.result.status,'议事中');
 assert.equal(pending.after.state.minute,before.state.minute);assert.equal(pending.after.state.player.coins,before.state.player.coins-20);
 assert.deepEqual(reconcile(f.engine,pending.after).mismatches,[]);
 const old=joinFixture(),oldBefore=structuredClone(old.document);
 const replay=await old.engine.reduce(old.document,{tool:'world_settlement',args:{operation:'org_join',...joinSlots},eventId:'a3-old-join'},{replay:true,result:{joined:false,status:'议事中'}});
 const after=applyPatches(old.document,replay.patches);
 assert.equal(replay.result.joined,false);assert.equal(after.state.minute,oldBefore.state.minute);
 assert.deepEqual(after.state.player.body,oldBefore.state.player.body);assert.equal(Object.hasOwn(replay.result,'cost'),false);
 assert.equal(after.state.player.coins,oldBefore.state.player.coins-20);assert.deepEqual(reconcile(old.engine,after).mismatches,[]);
});

test('A3 D36: insufficient charter fees roll back the entire conversation, time, body and membership',async()=>{
 const f=joinFixture();f.document.state.player.coins=1;
 // Opening fixture changed its purse: re-open the fixture books before executing.
 delete f.document.ledger;book(f);const before=structuredClone(f.document);
 await assertActionRejected(act(f,'core:settlement.org_join',joinSlots,'a3-poor-join'),/入会费不足/);
 assert.deepEqual(f.document,before);assert.deepEqual(reconcile(f.engine,f.document).mismatches,[]);
});


async function gatherFixture(){
 const f=fixture(),skill='skill_life_9_core';
 // A3-A must pin yields with the other primitive tables for archived worlds.
 // Supply that actual source table, without substituting an expected yield.
 f.world.primitiveTables.yields=structuredClone(original.balance.yields);
 f.document.state.location='loc_hw_northwood';
 f.document.state.skills[skill]={proficiency:10,breakthroughs:[],daily:{}};
 book(f);
 const entered=await act(f,'core:site.enter',{},'a3-enter-herbs');f.document=entered.after;
 return f;
}
test('A3 D14: two hours at the real local herb reserve transfers five herbs and gives capped, decaying work practice',async()=>{
 const f=await gatherFixture(),before=structuredClone(f.document),skill='skill_life_9_core',slots={target:'nw_herb',minutes:120};
 const {out,after}=await act(f,'core:site.gather_session',slots,'a3-herbs');
 assert.equal(after.state.minute-before.state.minute,120);assert.equal(out.result.cost.time,120);
 assert.equal(qty(f,after,'player','item_herb')-qty(f,before,'player','item_herb'),5);
 assert.equal(after.state.records['site:loc_hw_northwood'].remaining.nw_herb,15);
 assert.equal(after.state.skills[skill].proficiency-before.state.skills[skill].proficiency,3);
 assert.equal(after.state.skills[skill].practiceCarry,.4);
 assert.equal(out.result.training.learningSource,'practice');assert.equal(out.result.training.context,'work');
 // gather.* is light work: body.stamina drainPerHour.light=3, once for 2h.
 assert.equal(readBodyNeed(f.engine,after,'player','stamina'),94);
 assert.equal(after.state.player.coins,before.state.player.coins);assert.deepEqual(auditLedger(after.ledger),[]);
 assert.deepEqual(reconcile(f.engine,after).mismatches,[]);
 f.document=JSON.parse(JSON.stringify(after));const repeat=await act(f,'core:site.gather_session',slots,'a3-herbs');
 assert.deepEqual(repeat.out.patches,[]);assert.equal(repeat.out.result.duplicate,true);
 await assert.rejects(act(f,'core:site.gather_session',{...slots,minutes:240},'a3-herbs'),/同一事件编号/);
 const second=await act(f,'core:site.gather_session',slots,'a3-herbs-second');
 assert.equal(second.after.state.skills[skill].proficiency-after.state.skills[skill].proficiency,2);
 assert.equal(second.after.state.skills[skill].practiceCarry,.1);
 f.document=second.after;const day=String(Math.floor(f.document.state.minute/1440));
 f.document.state.skills[skill].daily[day].gain=f.engine.rules.practice.dailyCaps[0];
 const capped=await act(f,'core:site.gather_session',slots,'a3-herbs-cap');
 assert.equal(capped.out.result.training.gain,0);assert.equal(capped.out.result.quantity,5);
});
test('A3 D14: duration, local presence, season, stock and prior commitments remain real gates',async()=>{
 for(const fault of ['short','long','quantity','legacy_quantity','stock','winter','busy','elsewhere']){
  const f=await gatherFixture(),slots={target:'nw_herb',minutes:120},state=f.document.state;
  if(fault==='short')slots.minutes=29;if(fault==='long')slots.minutes=481;if(fault==='quantity')slots.quantity=100;
  if(fault==='legacy_quantity'){delete slots.minutes;slots.quantity=20;}
  if(fault==='stock')state.records['site:loc_hw_northwood'].remaining.nw_herb=0;
  if(fault==='winter')scene('loc_hw_northwood',(9*30+3)*1440+9*60)(state,f.document);
  if(fault==='elsewhere')state.location=INN;
  if(fault==='busy')state.obligations.busy={id:'busy',reservationVersion:1,type:'等待',promisor:'player',promisee:SELLER,start:state.minute,deadline:state.minute+180,departures:{player:state.minute,[SELLER]:state.minute},status:'待履行',location:state.location};
  const before=structuredClone(f.document);await assertActionRejected(act(f,fault==='legacy_quantity'?'core:site.gather':'core:site.gather_session',slots,`a3-herbs-${fault}`));
  assert.deepEqual(f.document,before);
 }
});
// K6 (c60b2a62, legality is a consequence): the owner's permission is a legal gate, not a physical one.
// Gathering in another's reserve still happens with the same real time and stock, and is committed as
// illegal harvest against the owner under this act's event.
test('A3 D14: gathering in a reserve without the owner permission happens and is committed as illegal harvest',async()=>{
 const f=await gatherFixture(),slots={target:'nw_herb',minutes:120};
 f.world.locations.find(p=>p.id==='loc_hw_northwood').site.owner=SELLER;
 const before=structuredClone(f.document),{out,after}=await act(f,'core:site.gather_session',slots,'a3-herbs-permission');
 assert.equal(after.state.minute-before.state.minute,120);assert.equal(qty(f,after,'player','item_herb')-qty(f,before,'player','item_herb'),5);
 assert.equal(after.state.records['site:loc_hw_northwood'].remaining.nw_herb,15);
 const rows=Object.values(after.state.records).filter(r=>r.category==='offense'&&r.sourceEvent==='a3-herbs-permission');
 // Going onto the private site is its entry breach too (sites.mjs entryBreach): trespass and illegal harvest.
 assert.deepEqual(rows.map(r=>r.offense).sort(),['illegal_harvest','trespass']);
 for(const r of rows){assert.equal(r.victim,SELLER);assert.equal(r.offender,'player');}
 const harvest=rows.find(r=>r.offense==='illegal_harvest');assert.deepEqual(harvest.stolen,{item:'item_herb',quantity:5});assert.ok(harvest.value>0);
 assert.deepEqual(auditLedger(after.ledger),[]);assert.deepEqual(reconcile(f.engine,after).mismatches,[]);
});
test('A3 D14: both duration endpoints execute, and depleted herbs stay empty through the old alias',async()=>{
 for(const [minutes,quantity]of [[30,1],[480,20]]){
  const f=await gatherFixture(),before=structuredClone(f.document),gathered=await act(f,'core:site.gather_session',{target:'nw_herb',minutes},`a3-endpoint-${minutes}`);
  assert.equal(gathered.after.state.minute-before.state.minute,minutes);assert.equal(gathered.out.result.quantity,quantity);
  assert.equal(qty(f,gathered.after,'player','item_herb')-qty(f,before,'player','item_herb'),quantity);
  assert.deepEqual(reconcile(f.engine,gathered.after).mismatches,[]);
  if(minutes===480){
   f.document=gathered.after;const empty=structuredClone(f.document);
   await assertActionRejected(act(f,'core:site.gather',{target:'nw_herb'},'a3-empty-legacy'),/存量|不足/);assert.deepEqual(f.document,empty);
  }
 }
});

function readingFixture(){
 const f=fixture(),place=f.world.locations.find(p=>p.id===INN);
 place.notices=[{id:'notice_d38',text:'四月初一起每户春税50文。',author:SELLER}];
 place.publicConversations=[{id:'speech_d38',speaker:SELLER,rumor:'rumor_d38',label:'村口闲谈'}];
 f.world.rumors.push({id:'rumor_d38',claim:'东头丢了一头牛。',source:SELLER,carriers:[SELLER],fact:'未在公开交谈提及的秘密'});
 return book(f);
}
test('A3 D38: read the actual notice then overhear a registered public conversation in fifteen minutes, without spending money or revealing truth',async()=>{
 const f=readingFixture(),before=structuredClone(f.document);
 const read=await act(f,'core:read.notice',{notice:'notice_d38'},'a3-read');f.document=read.after;
 assert.equal(read.out.result.content,'四月初一起每户春税50文。');assert.equal(read.out.result.cost.time,5);
 const notice=read.after.memories[read.out.result.memoryId];assert.equal(notice.source,'notice_d38');assert.equal(notice.channel,'read');
 assert.equal(notice.content,read.out.result.content);
 const heard=await act(f,'core:talk.overhear',{conversation:'speech_d38'},'a3-overhear'),after=heard.after;
 assert.equal(heard.out.result.cost.time,10);assert.equal(after.state.minute-before.state.minute,15);
 const memory=after.memories[heard.out.result.memoryId];assert.equal(memory.sourceLabel,'村口闲谈');assert.equal(memory.source,SELLER);
 assert.equal(memory.channel,'overhear');assert.equal(memory.reliability,'未核实');
 assert.equal(memory.transmissionChain.at(-1).channel,'overhear');assert.ok(memory.content.includes('东头丢了一头牛'));
 assert.ok(!JSON.stringify(after.memories).includes('未在公开交谈提及的秘密'));
 assert.equal(after.state.player.coins,before.state.player.coins);assert.deepEqual(after.ledger,before.ledger);
 // Reading proves the announced text, while S4's tax enactment is still separate.
 assert.deepEqual(after.state.settlements,before.state.settlements);
 f.document=JSON.parse(JSON.stringify(after));assert.deepEqual((await act(f,'core:talk.overhear',{conversation:'speech_d38'},'a3-overhear')).out.patches,[]);
 assert.deepEqual((await act(f,'core:read.notice',{notice:'notice_d38'},'a3-read')).out.patches,[]);
 await assert.rejects(act(f,'core:read.notice',{notice:'other'},'a3-read'),/同一事件编号/);
});
test('A3 D38: remote, missing, expired, future, private and absent-speaker sources cannot create knowledge',async()=>{
 for(const fault of ['remote','expired','future','private','absent','busy']){
  const f=readingFixture(),place=f.world.locations.find(p=>p.id===INN),now=f.document.state.minute;
  let action='core:read.notice',slots={notice:'notice_d38'};
  if(fault==='remote')f.document.state.location='loc_hw';
  if(fault==='expired')place.notices[0].until=now;
  if(fault==='future')place.notices[0].postedAt=now+1;
  if(fault==='private'||fault==='absent'){action='core:talk.overhear';slots={conversation:fault==='private'?'unpublished':'speech_d38'};}
  if(fault==='absent')f.document.state.npcs[SELLER].location='loc_hw';
  if(fault==='busy')f.document.state.obligations.busy={id:'busy',reservationVersion:1,type:'等待',promisor:'player',promisee:SELLER,start:now,deadline:now+60,departures:{player:now,[SELLER]:now},status:'待履行',location:INN};
  const before=structuredClone(f.document);await assertActionRejected(act(f,action,slots,`a3-read-${fault}`));assert.deepEqual(f.document,before);
 }
});

async function festivalFixture(){
 const f=fixture(),state=f.document.state;
 // Real plan/authorization/attendance/clock paths produce the held record.
 const cal=f.engine.calendar(state.minute),dayStart=Math.floor(state.minute/1440)*1440;
 const start=19*60;
 const festival={id:'festival_d35',name:'灯会测试场',calendar:{month:cal.month,day:cal.day},venue:{location:INN,precision:'existing_location'},custom:'在场观灯',resourceNeeds:[],runtime:{status:'active',host:SELLER,kind:'market',startMinute:start,durationMinutes:120,minimumParticipants:1}};
 f.world.festivals=[festival];f.world.items.find(p=>p.id===BREAD).basePrice=6;state.player.coins=50;
 f.engine=new WorldEngine(f.world);book(f);
 const run=async(action,slots,id)=>{const r=await act(f,action,slots,id);f.document=r.after;return r;};
 await run('core:trade.buy',{seller:SELLER,item:BREAD,quantity:2},'a3-festival-bread');
 const planned=await run('core:settlement.festival_plan',{festival:festival.id,cost:0},'a3-festival-plan'),id=planned.out.result.festival;
 // Reuse festival-runtime's existing native authorization fixture. A3's
 // catalogue still blocks client-filled NPC consent; its migration is separate.
 const authorized=await f.engine.reduce(f.document,{tool:'world_settlement',args:{operation:'festival_authorize',festival:id,speaker:SELLER,consent:true},eventId:'a3-festival-authorize'});
 f.document=applyPatches(f.document,authorized.patches);
 await run('core:settlement.festival_join',{festival:id,speaker:'player',consent:true},'a3-festival-join');
 const out=await f.engine.reduce(f.document,{tool:'world_time',args:{minutes:dayStart+start-f.document.state.minute},eventId:'a3-festival-start'});
 f.document=applyPatches(f.document,out.patches);assert.equal(f.document.state.records[id].status,'held');
 return {...f,id};
}
test('A3 D35: watching a real held festival advances to its actual endsAt and cannot replay time or awards',async()=>{
 const f=await festivalFixture(),before=structuredClone(f.document),event=before.state.records[f.id];
 const watched=await act(f,'core:settlement.festival_watch',{festival:f.id},'a3-watch');
 assert.equal(watched.after.state.minute,event.endsAt);assert.equal(watched.out.result.cost.time,event.endsAt-before.state.minute);
 assert.equal(watched.after.state.minute%1440,21*60);assert.equal(watched.out.result.cost.time,120);
 // S5-02: festival base6 * scarcity.5 * neutral factors * 2 = 6; purse50-6=44.
 assert.equal(qty(f,watched.after,'player',BREAD),2);assert.equal(watched.after.state.player.coins,44);
 assert.deepEqual(watched.after.state.inventory,before.state.inventory);assert.equal(watched.after.state.player.coins,before.state.player.coins);
 assert.equal(watched.after.state.records[f.id].paidCopper,event.paidCopper);assert.deepEqual(auditLedger(watched.after.ledger),[]);
 f.document=JSON.parse(JSON.stringify(watched.after));assert.deepEqual((await act(f,'core:settlement.festival_watch',{festival:f.id},'a3-watch')).out.patches,[]);
 await assertActionRejected(act(f,'core:settlement.festival_watch',{festival:f.id},'a3-watch-ended'),/没有正在举行/);
 const remote=await festivalFixture();remote.document.state.location='loc_hw';const original=structuredClone(remote.document);
 await assertActionRejected(act(remote,'core:settlement.festival_watch',{festival:remote.id},'a3-watch-remote'),/没有正在举行/);assert.deepEqual(remote.document,original);
});
