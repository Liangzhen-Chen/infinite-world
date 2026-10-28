// A real new character, one campaign, public menu/execute actions only; no AI,
// world variants, imported premises or state writes. Unreachable steps stay todo.
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {facilityRuntime} from '../server-plugin/facility-state.mjs';
import {carryLoad} from '../server-plugin/carry.mjs';
import {characterUiSession,qty} from './helpers/ui-script.mjs';
import {conservation,reconcile} from './helpers/ledger-audit.mjs';

const world=await loadWorld(),engine=new WorldEngine(world);
const TRADER='npc_hw_yanzhe',GRAIN='item_wheat_grain',BANK='bank_hw_post';

function balanced(before,after,label){
 assert.deepEqual(conservation(engine,before,after),[],`${label}: money and every stock resource conserve registered sources/sinks`);
 const books=reconcile(engine,after);
 assert.deepEqual(books.mismatches,[],`${label}: legacy balances match ledger`);
 assert.deepEqual(books.lots,[],`${label}: stock batches match ledger`);
 assert.deepEqual(books.audit,[],`${label}: ledger balances`);
 const load=carryLoad(engine,after);
 assert.ok(load.carriedKg<=10+2*after.state.player.attributes['力量'],`${label}: safe carrying capacity`);
}

test('S5 一局：集日买卖议价 → 私田入口缺口 → 卖粮款存入、具名存单部分支取 → 存档重放',async t=>{
 const ui=await characterUiSession(t,{seed:'s5-playthrough'});
 const opening=await ui.read();
 assert.equal(opening.state.player.level,0);
 assert.equal(opening.state.location,'loc_hw');
 assert.deepEqual(opening.state.skills,{});
 let current=opening;const committedClicks=new Set();
 async function step(action,slots={},options={}){
  const before=current,out=await ui.choose(action,slots,options);
  assert.ok(out.ok,`${action}: ${out.error??''}`);
  assert.equal(out.result.ok,true,`${action}: native result`);
  assert.equal(out.result.receipt.status,'committed',`${action}: committed receipt`);
  committedClicks.add(out.eventId);
  current=await ui.read();balanced(before,current,action);
  return {before,after:current,result:out.result,eventId:out.eventId};
 }

 // Day 5 is a real market day. The travelling merchant comes to loc_hw at 11.
 await step('time',{until:{dayOffset:4,hour:11}});
 assert.equal(current.state.npcs[TRADER].location,current.state.location);
 const buy=await step('trade.buy',{item:GRAIN,quantity:4},{target:TRADER});
 // 5 baseline × .5 scarcity × 1.2 ask spread × depth 1.00248… × 4
 // = 12.0298…; truncate once => 12 copper (no fabricated stock or quotes).
 assert.equal(buy.result.cost,12);
 assert.equal(buy.before.state.player.coins-buy.after.state.player.coins,12);
 assert.equal(buy.after.state.npcs[TRADER].coins-buy.before.state.npcs[TRADER].coins,12);
 assert.equal(qty(buy.after.state.inventory[GRAIN])-qty(buy.before.state.inventory[GRAIN]),4);
 assert.equal(qty(buy.before.state.npcs[TRADER].inventory[GRAIN])-qty(buy.after.state.npcs[TRADER].inventory[GRAIN]),4);
 const sale=await step('trade.sell_to',{item:GRAIN,quantity:4},{target:TRADER});
 // 5 × .5 × .6 bid spread × depth 1.00727… × regard 1.00105 × 4
 // = 6.04998… => 6 copper: round-trip loss = 12 - 6 = 6.
 assert.equal(sale.result.cost,6);
 assert.equal(sale.after.state.player.coins-sale.before.state.player.coins,6);
 assert.equal(sale.before.state.npcs[TRADER].coins-sale.after.state.npcs[TRADER].coins,6);
 assert.equal(qty(sale.before.state.inventory[GRAIN])-qty(sale.after.state.inventory[GRAIN]),4);
 assert.equal(qty(sale.after.state.npcs[TRADER].inventory[GRAIN])-qty(sale.before.state.npcs[TRADER].inventory[GRAIN]),4);
 assert.ok(sale.result.pricing.spread<buy.result.pricing.spread);

 const item='item_tanned_leather';
 const quote=facilityRuntime().currentTradeQuote(engine,current,{seller:TRADER,item,quantity:1});
 const offered=Math.ceil(quote.listPrice*world.rules.economy.priceFactorLimits.bargain[0]);
 const deal=await step('trade.trade',{seller:TRADER,item,quantity:1,unitPrice:offered},{target:TRADER,search:true});
 assert.ok(offered<quote.listPrice,'price reduced within the existing bargaining interval');
 assert.equal(deal.result.cost,offered);
 assert.equal(deal.before.state.player.coins-deal.after.state.player.coins,offered);
 assert.equal(deal.after.state.npcs[TRADER].coins-deal.before.state.npcs[TRADER].coins,offered);
 assert.equal(qty(deal.after.state.inventory[item])-qty(deal.before.state.inventory[item]),1);
 assert.equal(qty(deal.before.state.npcs[TRADER].inventory[item])-qty(deal.after.state.npcs[TRADER].inventory[item]),1);
 await t.test('店主自主还价并明确同意：现有成交接口只校验报价区间，缺 NPC 议价往返，归 A2 对话决策', {todo:true});

 await step('move',{destination:'loc_hw_fields'},{target:'loc_hw_fields'});
 const fieldBefore=current;
 const sow=await ui.choose('farm.private_sow',{areaMu:0.01},{search:true});
 assert.equal(sow.ok,false,'public field must not become the player’s private farm');
 assert.match(sow.error,/本人合法持有/);
 current=await ui.read();assert.deepEqual(current,fieldBefore,'rejected sow changes neither state nor books');
 // No legal acquisition route exists for this registered field. Do not forge
 // ownership, crop yield, tools or seeds to make the playthrough appear complete.
 await t.test('私田取得→播种→成熟→负重内采收→卖自产粮：缺玩家买田/租入登记田地入口，归 S5 资产与农事接点', {todo:true});

 // Named deposit originals require literacy and real blank paper. Acquire both
 // through school services; the original helper’s mutate option is never used.
 await step('move',{destination:'bld_hw_school'},{target:'bld_hw_school'});
 await step('time',{until:{dayOffset:0,hour:13}});
 let learned=false;
 for(let attempt=0;attempt<3&&!learned;attempt++){
  const lesson=await step('learn',{entity:'skill_literacy',source:'npc_hw_luqing',kind:'skill'},{search:true,eventId:`s5-literacy-${attempt}`});
  learned=lesson.result.success;
 }
 assert.equal(learned,true,'school actually teaches literacy');
 await step('trade.buy',{item:'item_parchment',quantity:1},{target:'npc_hw_luqing'});
 for(let day=0;day<12&&current.state.skills.skill_literacy.proficiency<100;day++){
  await step('practice.session',{skill:'skill_literacy',minutes:480});
  if(current.state.skills.skill_literacy.proficiency<100)await step('time',{until:{dayOffset:1,hour:9}});
 }
 assert.ok(current.state.skills.skill_literacy.proficiency>=100,'learned the required literacy, no ability fixture');
 await step('time',{until:{dayOffset:1,hour:11}});
 await step('move',{destination:'bld_hw_post'},{target:'bld_hw_post'});
 const dep=await step('trade.deposit',{coins:sale.result.cost},{eventId:'s5-grain-deposit'});
 // All 6 copper of the real grain sale enter the vault; 1 fee => 5 principal.
 assert.equal(dep.result.deposited,5);assert.equal(dep.result.fee,1);
 assert.equal(dep.before.state.player.coins-dep.after.state.player.coins,6);
 // Before first use the vault already exists in the ledger, while its legacy
 // bank record is materialized only by the deposit (money.legacyMoney contract).
 assert.equal(dep.after.state.records[BANK].coins-dep.before.ledger.accounts[`${BANK}|coin_river|vault`],6);
 const claim=dep.result.claim;
 const issued=await step('documents:issue',{source:dep.eventId,paper:'item_parchment',kind:'receipt'},{search:true});
 const paper=issued.result.document,original=current.state.itemInstances[paper];
 assert.equal(original.represents,claim);assert.equal(original.document.namedHolder,'player');
 assert.equal(original.document.issuer,BANK);assert.equal(original.document.certifier,'npc_hw_shendu');
 assert.equal(original.document.valid,true);assert.equal(current.state.obligations[claim].terms.requiresInstrument,paper);
 assert.equal(current.holdings.locations[paper].at,'player');
 assert.equal(qty(current.state.inventory.item_parchment),qty(issued.before.state.inventory.item_parchment),'one blank becomes the same written sheet');
 await step('time',{until:{dayOffset:3,hour:11}});
 const inspected=await step('trade.bank_inspect');
 // Three days on principal 5: even the 8% monthly loan-rate ceiling gives
 // 5 × .08 × 4/29 < 1 copper; deposit spread only reduces it. Integer interest
 // is therefore 0 (fraction carried), not a fictional positive payout.
 assert.equal(inspected.result.balance,5);
 const out=await step('trade.withdraw',{coins:2,debt:claim});
 assert.equal(out.result.withdrawn,2);
 assert.equal(out.after.state.player.coins-out.before.state.player.coins,2);
 assert.equal(out.before.state.records[BANK].coins-out.after.state.records[BANK].coins,2);
 assert.equal(out.after.state.obligations[claim].paid,2);
 assert.equal(out.after.state.obligations[claim].interest??0,0);
 assert.equal(out.after.state.records[BANK].accounts.player,3);
 assert.equal(out.after.state.obligations[claim].terms.requiresInstrument,paper);
 assert.equal(out.after.state.itemInstances[paper].document.valid,true);

 const bundle=await ui.server.api('export',{campaignId:ui.campaignId});
 assert.deepEqual(bundle.initial.state,opening.state,'creation state was never replaced with a fixture');
 assert.ok(bundle.events.length>0);
 // index.mjs stores world_act aliases as their native calls for compatibility.
 // Match every durable event to an actual successful public click instead of
 // incorrectly requiring the stored tool name to remain world_act.
 assert.equal(bundle.events.length,committedClicks.size,'one durable event per successful click; no injected setup events');
 assert.ok(bundle.events.every(event=>committedClicks.has(event.input.eventId.replace(/#\d+$/,''))),'all recorded events originate in public menu/tool clicks');
 const {reference}=await ui.server.api('import',{bundle});
 const loaded=await ui.server.api('read',{campaignId:reference.campaignId});
 assert.deepEqual(loaded.document,current,'full event replay restores the identical document, including stock, claims and ledger');
});
