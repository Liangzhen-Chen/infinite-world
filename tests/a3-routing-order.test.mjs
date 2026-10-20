import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {prepareOpenAction} from '../server-plugin/open-actions.mjs';
import {openLedger,auditLedger} from '../server-plugin/ledger.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const shop='npc_hw_linsui',place='bld_hw_qingdeng';
function fixture(){
 const engine=new WorldEngine(structuredClone(world)),document=engine.createCharacter(seed,{},'routing-order');
 document.state.location=place;document.state.minute=600;document.state.player.coins=100;
 document.state.inventory={};
 Object.assign(document.state.npcs[shop],{location:place,status:'正常',activity:'闲逛',scheduleTravel:null,cognitionTravel:null});
 document.ledger=openLedger(engine,document);
 return {engine,document};
}
const buy=()=>({intent:'买两块面包',target:shop,effects:[{op:'transfer',resource:'coin',from:'self',to:shop,qty:4},{op:'transfer',resource:'item_bread',from:shop,to:'self',qty:2}]});
const meal=()=>({...buy(),intent:'先买两块面包，再吃一块',effects:[...buy().effects,{op:'transfer',resource:'item_bread',from:'self',to:'sink:consume',qty:1},{op:'vital',target:'self',type:'body:satiety',delta:99}]});

test('A3 route order: trade and manufacture select programs before account/sink checks',async()=>{
 const {engine,document}=fixture(),before=structuredClone(document);
 const trade=prepareOpenAction(engine,document,buy());
 assert.equal(trade.routed,'core:trade.buy');assert.equal(trade.slots.item,'item_bread');assert.equal(trade.slots.quantity,2);
 const craft={intent:'按配方削木楔',means:{recipe:'recipe_wooden_pegs'},effects:[{op:'transfer',resource:'item_wood',from:'self',to:'sink:craft',qty:999}]};
 const plan=prepareOpenAction(engine,document,craft);assert.equal(plan.routed,'core:craft.manufacture');assert.equal(plan.slots.recipe,'recipe_wooden_pegs');
 await assert.rejects(engine.previewAction(document,{tool:'world_propose',eventId:'route-unknown-recipe',args:craft}),/尚未学会这个配方/);
 assert.deepEqual(document,before);
});

test('A3 route order: unknown practice reports its source failure without teaching a skill',async()=>{
 const {engine,document}=fixture();delete document.state.skills.skill_monk_combat_01;
 const before=structuredClone(document),args={intent:'练一遍吐纳',means:{skill:'skill_monk_combat_01'},effects:[{op:'learn',entity:'self',subject:'skill_monk_combat_01',learningSource:'practice',amount:2699}]};
 const plan=prepareOpenAction(engine,document,args);assert.equal(plan.routed,'core:practice');assert.equal(plan.slots.skill,'skill_monk_combat_01');
 await assert.rejects(engine.previewAction(document,{tool:'world_propose',eventId:'route-unknown-practice',args}),{code:'E-LEARN-SOURCE'});
 assert.deepEqual(document,before);
});

test('A3 route order: loan consent and unauthored transfers retain real authority checks',async()=>{
 const {engine,document}=fixture(),before=structuredClone(document),args={intent:'借给对方五铜',target:shop,effects:[{op:'transfer',resource:'coin',from:'self',to:shop,qty:5},{op:'obligation.create',obligationKind:'loan',debtor:shop,creditor:'self',terms:{resource:'coin',principal:5,days:10,interest:0}}]};
 const plan=prepareOpenAction(engine,document,args);assert.equal(plan.routed,'core:trade.lend');assert.equal(plan.slots.coins,5);assert.equal(plan.slots.days,10);assert.equal(plan.slots.seller,shop);
 assert.equal(plan.slots.quantity,undefined); // Copper is not an installment count.
 await assert.rejects(engine.previewAction(document,{tool:'world_propose',eventId:'route-no-loan-consent',args}),/明确同意/);
 assert.throws(()=>prepareOpenAction(engine,document,{intent:'xyzzy',effects:[{op:'transfer',resource:'coin',from:shop,to:'self',qty:5}]}),{code:'E-OPEN-TRANSFER'});
 assert.deepEqual(document,before);
});

test('A3 route order: sale direction wins over incidental buyer wording, price is not item quantity',()=>{
 const {engine,document}=fixture();document.state.inventory.item_whittling_knife={quantity:1};
 const args={intent:'买家在面前，我偷偷卖掉这把刀',target:shop,means:{tools:['item_whittling_knife'],manner:'secret_sale'},effects:[{op:'holding.transfer',holding:'原物主的有效所有权',newHolder:shop},{op:'transfer',resource:'coin',from:shop,to:'self',qty:3}]};
 const plan=prepareOpenAction(engine,document,args);assert.equal(plan.routed,'core:trade.sell_to');assert.equal(plan.slots.quantity,1);assert.equal(plan.slots.item,'item_whittling_knife');
 const ordinary=prepareOpenAction(engine,document,{intent:'买家在面前，我卖给他一把刀',target:shop,effects:[{op:'transfer',resource:'item_whittling_knife',from:'self',to:shop,qty:1},{op:'transfer',resource:'coin',from:shop,to:'self',qty:3}]});
 assert.equal(ordinary.routed,'core:trade.sell_to');assert.equal(ordinary.slots.quantity,1);
});

test('A3 route order: request fields are extracted, missing teacher and unknown price remain questions',()=>{
 const {engine,document}=fixture();
 const certify=prepareOpenAction(engine,document,{intent:'申请职业认证',target:place,effects:[{op:'emit',verb:'request',actor:'self',target:place,payload:{kind:'certification',terms:{profession:'profession_life_6'}},visibility:'present'}]});
 assert.equal(certify.needsSlots.action,'core:profession.certify');assert.deepEqual(certify.needsSlots.missing,['teacher']);assert.equal(certify.nearest.slots.profession,'profession_life_6');
 const haggle={intent:'能便宜两铜吗',target:shop,effects:[{op:'emit',verb:'request',actor:'self',target:shop,payload:{kind:'haggle',terms:{discountCopper:2}},visibility:'present'}]};
 const unknown=prepareOpenAction(engine,document,haggle);assert.deepEqual(unknown.needsSlots,{action:'core:dialogue.haggle',missing:['content','source']});
 document.state.records.quote={category:'trade_quote',seller:shop,item:'item_bread',day:0,listPrice:5};
 const quoted=prepareOpenAction(engine,document,haggle);assert.equal(quoted.routed,'core:dialogue.haggle');assert.equal(quoted.slots.content,'3');assert.equal(quoted.slots.source,'item_bread');
});

test('A3 route order: scene observation is a read with no patches, costs or proposed effects',async()=>{
 const {engine,document}=fixture(),before=structuredClone(document),input={tool:'world_propose',eventId:'route-observe',args:{intent:'看看四周',target:place,effects:[]}};
 const preview=await engine.previewAction(document,input);assert.equal(preview.receipt.routing.routed,'core:look');assert.ok(preview.receipt.scene);assert.equal(preview.receipt.cost.time,0);
 const result=await engine.reduce(document,input);assert.deepEqual(result.patches,[]);assert.equal(result.result.receipt.status,'committed');assert.deepEqual(result.result.receipt.applied,[]);assert.deepEqual(document,before);
});

test('A3 route order: buy then eat uses fresh inventory, native nutrition, conservation and idempotency',async()=>{
 const {engine,document}=fixture(),before=structuredClone(document),input={tool:'world_propose',eventId:'route-buy-eat',args:meal()};
 const plan=prepareOpenAction(engine,document,input.args);assert.equal(plan.status,'sequence');assert.deepEqual(plan.steps.map(s=>s.action),['core:trade.buy','core:eat.meal']);
 const preview=await engine.previewAction(document,input);assert.equal(preview.receipt.status,'preview');assert.equal(preview.receipt.steps.length,2);assert.deepEqual(document,before);
 const result=await engine.reduce(document,input),next=applyPatches(document,result.patches);
 assert.equal(next.state.inventory.item_bread.quantity,1);assert.equal(next.state.player.coins,before.state.player.coins-4);
 assert.equal(result.result.receipt.steps[1].legacy.eaten,1);assert.ok(result.result.receipt.steps[1].legacy.nutrition.satiety<99);
 assert.deepEqual(auditLedger(next.ledger),[]);assert.deepEqual(reconcile(engine,next),{mismatches:[],lots:[],drift:[],audit:[]});
 const duplicate=await engine.reduce(JSON.parse(JSON.stringify(next)),input);assert.deepEqual(duplicate.patches,[]);assert.equal(duplicate.result.receipt.duplicate,true);assert.deepEqual(document,before);
});

test('A3 route order: failed later sequence step returns no partial purchase',async()=>{
 const {engine,document}=fixture(),before=structuredClone(document);
 const args=meal();
 // Remove the food registration so the purchase can succeed before the native
 // meal fails. The caller's satiety effect cannot make an item edible.
 engine.world.items.find(i=>i.id==='item_bread').nutrition=null;
 await assert.rejects(engine.reduce(document,{tool:'world_propose',eventId:'route-late-failure',args}),/可食用/);
 assert.deepEqual(document,before);
});

test('A3 route order: chained repayments select debt programs and reject absent real debts',async()=>{
 const {engine,document}=fixture(),other='npc_hw_wushuo';Object.assign(document.state.npcs[other],{location:place,scheduleTravel:null,cognitionTravel:null});
 const before=structuredClone(document),args={intent:'收回五十铜再还三十铜',target:other,effects:[{op:'transfer',resource:'coin',from:other,to:'self',qty:50},{op:'obligation.settle',id:'对方欠本人的唯一借款',amount:50,partial:false},{op:'transfer',resource:'coin',from:'self',to:shop,qty:30},{op:'obligation.settle',id:'本人欠店主的唯一借款',amount:30,partial:false}]};
 const plan=prepareOpenAction(engine,document,args);assert.equal(plan.status,'sequence');assert.deepEqual(plan.steps.map(s=>s.action),['core:trade.collect','core:trade.repay']);
 await assert.rejects(engine.previewAction(document,{tool:'world_propose',eventId:'route-no-real-debt',args}),{code:'E-OPEN-OBLIGATION'});assert.deepEqual(document,before);
});
