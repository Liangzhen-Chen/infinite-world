import {assertActionRejected} from './helpers/action-refusal.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {prepareOpenAction} from '../server-plugin/open-actions.mjs';
import {createRoutingContext,resolveProposalEntities} from '../server-plugin/action-router.mjs';
import {openLedger,auditLedger} from '../server-plugin/ledger.mjs';
import {openHoldings} from '../server-plugin/holdings.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {readBodyNeed} from '../server-plugin/primitives-body.mjs';
import {openObligation,closeObligation} from '../server-plugin/obligation-protocol.mjs';
import {obligationView} from '../server-plugin/obligation-state.mjs';
import {derivedBankAt} from '../server-plugin/finance-bank.mjs';
import {initialThermalState} from '../server-plugin/magic-object.mjs';
import '../server-plugin/primitives-runtime.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const inn='bld_hw_qingdeng',host='npc_hw_linsui';
const stack=quantity=>({quantity,quality:'木',durability:100});
function fixture(location=inn){
 const local=structuredClone(world);
 for(const npc of local.npcs){npc.tier='fixture';delete npc.schedule;}
 const engine=new WorldEngine(local),document=engine.initialFromLegacy(seed,'a3-routing-intents');
 document.state.location=location;document.state.minute=600;document.state.player.coins=200;
 document.state.inventory={};document.state.player.body={satiety:{value:30,asOf:600,activity:'rest'},hydration:{value:50,asOf:600,activity:'rest'}};
 Object.assign(document.state.npcs[host],{location,status:'正常',activity:'闲逛',goals:{},scheduleTravel:null,cognitionTravel:null});
 return {engine,document};
}
function book(f){f.document.ledger=openLedger(f.engine,f.document);f.document.holdings=openHoldings(f.engine,f.document);return f;}
const consume=item=>({op:'transfer',resource:item,from:'self',to:'sink:consume',qty:1});
async function act(f,args,eventId){
 const before=structuredClone(f.document),input={tool:'world_propose',args,eventId};
 const preview=await f.engine.previewAction(f.document,input);assert.deepEqual(f.document,before);
 const out=await f.engine.reduce(f.document,input),after=applyPatches(f.document,out.patches);
 assert.deepEqual(f.document,before);assert.deepEqual(auditLedger(after.ledger),[]);
 return {input,preview,out,after};
}

test('A3 ordinary intent: eating a ration uses real nutrition and consumes only one owned portion',async()=>{
 const f=fixture();f.document.state.inventory.item_ration=stack(1);book(f);
 const result=await act(f,{intent:'把自己的干粮吃掉',effects:[consume('item_ration'),{op:'vital',target:'self',type:'body:satiety',delta:999}]},'ration-route');
 assert.equal(result.preview.receipt.routing.routed,'core:eat.meal');
 assert.equal(f.engine.quantity(f.engine.primitiveDraft(result.after),'player','item_ration'),0);
 const satiety=readBodyNeed(f.engine,result.after,'player','satiety');assert.ok(satiety>55&&satiety<=60);
 const replay=await f.engine.reduce(JSON.parse(JSON.stringify(result.after)),result.input);assert.deepEqual(replay.patches,[]);
 await assert.rejects(f.engine.reduce(result.after,{...result.input,eventId:'ration-again'}));
});

test('A3 ordinary intent: drinking needs the same real portion, bounds hydration and rolls back when water is gone',async()=>{
 const f=fixture();f.document.state.inventory.item_water=stack(1);book(f);
 const args={intent:'把自己的清水喝掉',effects:[consume('item_water'),{op:'vital',target:'self',type:'body:hydration',delta:999}]};
 const result=await act(f,args,'water-route');assert.equal(result.preview.receipt.routing.status,'open');
 assert.equal(result.out.result.receipt.applied.find(e=>e.op==='vital').delta,25);
 assert.equal(f.engine.quantity(f.engine.primitiveDraft(result.after),'player','item_water'),0);
 const hydration=readBodyNeed(f.engine,result.after,'player','hydration');assert.ok(hydration>70&&hydration<=75);
 const before=structuredClone(result.after);await assert.rejects(f.engine.reduce(result.after,{...result.input,eventId:'water-again'}),{code:'E-TRANSFER-BALANCE'});assert.deepEqual(result.after,before);
 const noFood=prepareOpenAction(f.engine,f.document,{intent:'凭空解渴',effects:args.effects.slice(1)});assert.equal(noFood.status,'needs_alternative');
});

test('A3 ordinary intent: lodging and bank deposits use their registered prices, principal and keeper',async()=>{
 const f=book(fixture()),lodge={intent:'租一晚床位',target:host,effects:[{op:'transfer',resource:'coin',from:'self',to:host,qty:999},{op:'holding.open',holdingKind:'lodges',holder:'self',subject:inn,terms:{nights:1},grantedBy:host}]};
 const result=await act(f,lodge,'lodge-route');assert.equal(result.preview.receipt.routing.routed,'core:trade.lodge');
 assert.equal(result.after.state.player.coins,194);
 const bank=fixture('bld_hw_post');Object.assign(bank.document.state.npcs.npc_hw_shendu,{location:'bld_hw_post',status:'正常',activity:'闲逛'});book(bank);
 const args={intent:'把一百铜存进去',target:'bank_hw_post',effects:[{op:'transfer',resource:'coin',from:'self',to:'bank_hw_post',qty:100},{op:'transfer',resource:'coin',from:'self',to:'bank_hw_post',qty:1},{op:'obligation.create',obligationKind:'deposit',debtor:'bank_hw_post',creditor:'self',terms:{principal:100,resource:'coin'}}]};
 const deposit=await act(bank,args,'deposit-route');assert.equal(deposit.preview.receipt.routing.routed,'core:trade.deposit');
 assert.equal(deposit.after.state.player.coins,99);assert.equal(deposit.after.state.records.bank_hw_post.accounts.player,100);
 const short=structuredClone(bank.document);short.state.player.coins=100;short.ledger=openLedger(bank.engine,short);
 const before=structuredClone(short);await assertActionRejected(bank.engine.reduce(short,{...deposit.input,eventId:'deposit-too-poor'}));assert.deepEqual(short,before);
});

test('A3 ordinary intent: real debt references bind uniquely; absent and conflicting debt references stay questions',()=>{
 const f=fixture();f.document.state.records.actual_debt={id:'actual_debt',category:'debt',debtor:'player',creditor:host,amount:30,paid:0,status:'待偿还'};book(f);
 const args={intent:'把欠她的钱还清',target:host,effects:[{op:'transfer',resource:'coin',from:'self',to:host,qty:30},{op:'obligation.settle',id:'本人唯一三十铜欠款',amount:30}]};
 let p=prepareOpenAction(f.engine,f.document,args);assert.equal(p.routed,'core:trade.repay');assert.equal(p.slots.debt,'actual_debt');assert.equal(p.slots.seller,host);
 f.document.state.records.other_debt={...f.document.state.records.actual_debt,id:'other_debt'};
 p=prepareOpenAction(f.engine,f.document,args);assert.deepEqual(p.needsSlots.missing,['debt']);
 delete f.document.state.records.other_debt;delete f.document.state.records.actual_debt;
 p=prepareOpenAction(f.engine,f.document,args);assert.deepEqual(p.needsSlots.missing,['debt']);
});

// fix3-world: 白石镇有了合法镇长后，派生钱庄设在首长席位（finance-bank bankSite → settlementGovernment seat = bld_bs_office），不再是镇口商旅代理的柜面。
const TOWN_BANK='bld_bs_office';
test('A3 ordinary intent: named remittance creates the recipient claim and pays only that person at the destination bank',async()=>{
 const f=fixture('bld_hw_post'),banker='npc_hw_shendu';
 Object.assign(f.document.state.npcs[banker],{location:'bld_hw_post',status:'正常',activity:'闲逛',scheduleTravel:null,cognitionTravel:null});
 f.document.state.npcs[host].location='loc_hw';book(f);
 const recipientCash=f.document.state.npcs[host].coins;
 const issued=await act(f,{intent:'寄五十铜给收款人，按汇票走',target:'bank_hw_post',effects:[{op:'transfer',resource:'coin',from:'self',to:'bank_hw_post',qty:50},{op:'transfer',resource:'coin',from:'self',to:'bank_hw_post',qty:999},{op:'obligation.create',obligationKind:'bill',debtor:'bank_hw_post',creditor:host,terms:{principal:50,resource:'coin',destination:TOWN_BANK}}]},'named-remittance');
 assert.equal(issued.preview.receipt.routing.slots.buyer,host);assert.equal(issued.after.state.npcs[host].coins,recipientCash);
 const bill=Object.values(issued.after.state.records).find(row=>row.category==='bank_bill'&&row.beneficiary===host);assert.ok(bill?.payable);
 assert.equal(obligationView(issued.after.state,bill.payable).owed,50);assert.equal(issued.after.state.player.coins,149);
 f.document=JSON.parse(JSON.stringify(issued.after));const dest=derivedBankAt(f.engine,f.document.state,TOWN_BANK),keeper=dest.keepers[0];
 // 镇长是名册外按需落档的人物：与河湾钱庄掌柜同形地补一份落档（不改世界）。
 if(!f.document.state.npcs[keeper])f.document.state.npcs[keeper]={...structuredClone(f.document.state.npcs[banker]),id:keeper,name:f.engine.byId.get(keeper).name,coins:f.engine.byId.get(keeper).coins,inventory:structuredClone(f.engine.byId.get(keeper).inventory)};
 f.document.state.location=dest.location;Object.assign(f.document.state.npcs[keeper],{location:dest.location,status:'正常',activity:'闲逛',scheduleTravel:null,cognitionTravel:null});
 const funded=await f.engine.reduce(f.document,{tool:'world_act',args:{action:'core:trade.deposit',slots:{seller:keeper,coins:101}},eventId:'fund-destination'});f.document=applyPatches(f.document,funded.patches);
 const call={tool:'world_act',args:{action:'core:trade.cash_bill',slots:{seller:keeper,contract:bill.payable.replace(/:payable$/,'')}} ,eventId:'named-cash'};
 const absent=structuredClone(f.document);await assertActionRejected(f.engine.reduce(f.document,call),/实际收款/);assert.deepEqual(f.document,absent);
 f.document.state.npcs[host].location=dest.location;const cash=await f.engine.reduce(f.document,call),after=applyPatches(f.document,cash.patches);
 assert.equal(after.state.npcs[host].coins,recipientCash+50);assert.equal(after.state.player.coins,48);assert.equal(obligationView(after.state,bill.payable).owed,0);
 assert.deepEqual(auditLedger(after.ledger),[]);assert.deepEqual((await f.engine.reduce(JSON.parse(JSON.stringify(after)),call)).patches,[]);
 await assertActionRejected(f.engine.reduce(after,{...call,eventId:'named-cash-again'}),/汇票/);
});

test('A3 ordinary intent: extinguishing routes to actual heat and water state, consumes water once and rolls back insufficient water',async()=>{
 const f=fixture(),place=f.engine.byId.get(inn),bucket=structuredClone(place.features.find(row=>row.id==='feature_hw_kitchen_bucket'));
 Object.assign(bucket,{id:'feature_test_bucket',name:'自有试验水桶',owner:'player',position:[0,0]});bucket.state.waterMl=500;
 const model={heatCapacityJPerC:1000,maximumC:1000,ambientC:20,passiveExchangeJPerMinute:50,burnMgPerMinute:1000,fuelJPerMg:20,efficiencyPermille:900,ashPermille:50,ignitionMaximumMg:5000,ignitable:true,dryable:true,fuels:[]};
 const thermal=initialThermalState({temperatureC:40,fuelMg:1000},model,600);thermal.burning=true;
 const target={id:'feature_test_fire',name:'自有试验木架',kind:'object',owner:'player',access:'consent',position:[0,0],thermalModel:model,state:{thermal}};
 place.features.push(bucket,target);book(f);
 const args={intent:'把现成水泼上去灭火',means:{tools:[bucket.id],manner:'douse'},effects:[consume('item_water'),{op:'fact.set',entity:target.id,field:'fire_intensity',value:0}]};
 const result=await act(f,args,'douse-route');assert.equal(result.preview.receipt.routing.routed,'core:environment.douse_fire');
 assert.equal(result.after.state.records[`physical_feature:${bucket.id}`].state.waterMl,250);
 assert.equal(result.after.state.records[`physical_feature:${target.id}`].state.thermal.burning,false);
 assert.equal(result.after.state.inventory.item_water,undefined,'physical source is used, not a second bag portion');
 const dry=structuredClone(f.document);dry.state.records[`physical_feature:${bucket.id}`]={id:bucket.id,category:'physical_feature',location:inn,state:{...bucket.state,waterMl:0}};
 const before=structuredClone(dry);await assertActionRejected(f.engine.reduce(dry,{...result.input,eventId:'douse-dry'}),/水量不足/);assert.deepEqual(dry,before);
});

test('A3 ordinary intent: only the creditor can actually waive an earned debt; ordinary cancellation retains it and no cash is fabricated',async()=>{
 const f=book(fixture()),d=f.engine.primitiveDraft(f.document);
 openObligation(d,f.engine,{id:'owed_to_player',kind:'loan',debtor:host,creditor:'player',actor:host,amount:10,terms:{principal:10},deadline:900},'signed-loan');
 f.document=applyPatches(f.document,d.patches);
 const cancel=f.engine.primitiveDraft(f.document);closeObligation(cancel,f.engine,{id:'owed_to_player',actor:host,reason:'terminated'},'normal-cancel');
 assert.equal(obligationView(applyPatches(f.document,cancel.patches).state,'owed_to_player').owed,10);
 const illegal=f.engine.primitiveDraft(f.document);assert.throws(()=>closeObligation(illegal,f.engine,{id:'owed_to_player',actor:host,reason:'creditor_waiver'},'debtor-waiver'),/Only the current creditor/);
 const before=structuredClone(f.document),result=await act(f,{intent:'免掉这笔欠我的债',target:host,effects:[{op:'obligation.cancel',id:'本人唯一债权',reason:'creditor_waiver'}]},'waive-claim');
 assert.equal(result.preview.receipt.routing.routed,'open:waive_debt');assert.equal(obligationView(result.after.state,'owed_to_player').owed,0);
 assert.equal(result.after.state.obligations.owed_to_player.waiver.amount,10);
 assert.equal(result.after.state.obligations.owed_to_player.paid??0,0);
 assert.deepEqual(result.after.ledger,before.ledger);assert.equal(result.after.state.player.coins,before.state.player.coins);
 const replay=await f.engine.reduce(result.after,result.input);assert.deepEqual(replay.patches,[]);
});

test('A3 ordinary intent: a crude object requires known craft, matching tool and exactly paid materials, never becomes a catalog resource',async()=>{
 const f=fixture();f.document.state.skills.skill_life_6_core={proficiency:100};f.document.state.player.attributes.敏捷=30;
 for(const id of ['item_wood','item_flax_cord','item_whittling_knife'])f.document.state.inventory[id]=stack(1);book(f);
 const args={intent:'用木料绳子扎个粗架子',means:{skill:'skill_life_6_core',tools:['item_whittling_knife']},effects:[consume('item_wood'),consume('item_flax_cord'),{op:'create',kind:'item',template:'thing',facts:{name:'临时小架子',quality:'crude',author:'self',location:'self'},materials:[{resource:'item_wood',qty:1},{resource:'item_flax_cord',qty:1}]}]};
 const eventId=Array.from({length:200},(_,i)=>`crude-route-${i}`).find(id=>createHash('sha256').update(`${f.document.randomSeed}:${id}:action-check:d20`).digest().readUInt32LE(0)%20+1===15);assert.ok(eventId);
 const result=await act(f,args,eventId);assert.equal(result.preview.receipt.routing.status,'open');
 const created=result.out.result.receipt.applied.find(e=>e.op==='create');assert.ok(created,JSON.stringify(result.out.result.receipt.check));
 const id=created.result.entity;assert.equal(result.after.state.created[id].quality,'crude');assert.equal(result.after.state.created[id].durability,10);
 assert.equal(f.engine.world.items.some(row=>row.id===id),false);assert.equal(result.after.state.inventory[id],undefined);
 for(const material of ['item_wood','item_flax_cord'])assert.equal(f.engine.quantity(f.engine.primitiveDraft(result.after),'player',material),0);
 for(const fault of ['skill','tool','material','mismatch']){
  const bad=structuredClone(args);if(fault==='skill')delete bad.means.skill;if(fault==='tool')bad.means.tools=[];if(fault==='material')bad.effects.splice(1,1);
  if(fault==='mismatch'){bad.effects[0].resource='item_water';bad.effects[2].materials[0].resource='item_water';}
  assert.throws(()=>prepareOpenAction(f.engine,f.document,bad),{code:'E-OPEN-CRAFT'});
 }
});

test('A3 ordinary intent: asking about guidance records a decision without signing a route or inventing a destination',async()=>{
 const f=book(fixture()),before=structuredClone(f.document.state.obligations);
 const result=await act(f,{intent:'请你带我去熟悉的渡口，先问愿不愿意',target:host,effects:[{op:'emit',actor:'self',target:host,verb:'request',visibility:'present',payload:{kind:'guide',terms:{destination:'熟悉的渡口'}}}]},'guide-question');
 assert.equal(result.preview.receipt.routing.routed,'core:dialogue.guide_request');assert.ok(result.out.result.dialogue.decision);
 assert.deepEqual(result.after.state.obligations,before);assert.equal(result.after.state.minute,615);
});

test('A3 ordinary intent: a scheduled question fires once, and an absent person is checked again when due',async()=>{
 for(const present of [true,false]){
  const f=book(fixture());const args={intent:'安排明早再当面询问',target:host,effects:[{op:'schedule',at:605,action:'core:dialogue.ask',args:{actor:'self',subject:host,topic:'是否愿意带路'},via:'npc-autonomy'}]};
  const result=await act(f,args,`question-${present}`);assert.equal(result.preview.receipt.routing.status,'open');
  assert.deepEqual(result.out.result.receipt.applied.map(e=>e.op),['schedule','emit']);
  const after=JSON.parse(JSON.stringify(result.after));if(!present)after.state.npcs[host].location='loc_bs';
  const advanced=await f.engine.reduce(after,{tool:'world_time',args:{minutes:6},eventId:`question-due-${present}`}),settled=applyPatches(after,advanced.patches);
  const terminal=Object.values(settled.state.records).filter(row=>row.category==='primitive_schedule_result');assert.equal(terminal.length,1);
  assert.equal(terminal[0].status,present?'committed':'rejected',JSON.stringify(terminal[0]));
  if(present)assert.equal(terminal[0].receipt.applied[0].payload.text,'是否愿意带路');
  const again=await f.engine.reduce(settled,{tool:'world_time',args:{minutes:1},eventId:`question-after-${present}`});
  assert.equal(Object.values(applyPatches(settled,again.patches).state.records).filter(row=>row.category==='primitive_schedule_result').length,1);
 }
});

test('A3 ordinary intent: visible local features bind by native alias, absent zones remain questions, combat owns shove direction',()=>{
 const f=book(fixture()),feature=f.engine.byId.get(inn).features.find(row=>row.id==='feature_hw_kitchen_bucket');assert.ok(feature);
 const context=createRoutingContext(f.engine,f.document),r=resolveProposalEntities({intent:'走到水桶边',effects:[{op:'move',entity:'self',to:feature.name,mode:'walk'}]},context);
 assert.deepEqual(r.ambiguities,[]);assert.equal(r.proposal.effects[0].to,feature.id);
 const noZone=resolveProposalEntities({intent:'走到墙根',effects:[{op:'move',entity:'self',to:'没有登记的墙根',mode:'walk'}]},context);assert.equal(noZone.ambiguities.length,1);
 const shove=prepareOpenAction(f.engine,f.document,{intent:'把他推离门口',target:host,means:{manner:'shove'},effects:[{op:'move',entity:host,to:'门口旁相邻空位',mode:'shove'}]});
 assert.equal(shove.routed,'core:combat');assert.equal(shove.slots.target,host);assert.equal(shove.slots.intent,'shove');
});

test('A3 ordinary intent: a current accepted duel supplies its opponent, a bystander alone does not',()=>{
 const f=book(fixture()),witness='npc_hw_ayan';Object.assign(f.document.state.npcs[witness],{location:inn,status:'正常',activity:'闲逛',scheduleTravel:null,cognitionTravel:null});
 const args={intent:'用木杖防守护住自己',means:{manner:'guard'},effects:[{op:'status',target:'self',status:'combat_defense',duration:1,magnitude:1}]};
 let plan=prepareOpenAction(f.engine,f.document,args);assert.deepEqual(plan.needsSlots.missing,['target']);
 f.document.state.records.duel={category:'duel',id:'duel',status:'已接受',challenger:'player',target:host,witness,location:inn,expires:900,rule:'touch'};
 plan=prepareOpenAction(f.engine,f.document,args);assert.equal(plan.routed,'core:combat',JSON.stringify(plan.nearest));assert.equal(plan.slots.target,host);assert.equal(plan.slots.intent,'defend');
 f.document.state.npcs[witness].location='loc_bs';plan=prepareOpenAction(f.engine,f.document,args);assert.deepEqual(plan.needsSlots.missing,['target']);
});
