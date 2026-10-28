// A real new character, one campaign, public menu/execute actions only; no AI,
// world variants, imported premises or state writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {facilityRuntime} from '../server-plugin/facility-state.mjs';
import {scheduleAt} from '../server-plugin/npc-schedule.mjs';
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

test('S5 一局：集日买卖 → 租田种收并卖自产粮 → 存钱与具名存单 → 存档重放',async t=>{
 const ui=await characterUiSession(t,{seed:'s5-playthrough'});
 const opening=await ui.read();
 assert.equal(opening.state.player.level,0);
 assert.equal(opening.state.location,'loc_hw');
 assert.deepEqual(opening.state.skills,{});
 let current=opening;const committedClicks=new Set();
 async function step(action,slots={},options={}){
  const before=current,out=await ui.choose(action,slots,options);
  assert.ok(out.ok,`${action}: ${out.error??''} (cash ${before.state.player.coins})`);
  assert.equal(out.result.ok,true,`${action}: native result`);
  // Site entry persists presence without an activity receipt; verify that
  // native result instead. Timed and financial clicks retain receipt checks.
  if(action==='site.enter')assert.equal(out.result.entered,true);
  else if(action==='site.gather_session')assert.equal(out.result.actionScope.minutes,slots.minutes);
  else if(action==='farm.buy')assert.equal(out.result.quantity,slots.quantity);
  else if(action==='farm.private_sow')assert.equal(out.result.farm.status,'growing');
  else if(action==='farm.private_harvest')assert.ok(Number.isSafeInteger(out.result.harvested)&&out.result.harvested>0);
  else if(action==='promise.settle')assert.equal(out.result.transferred,slots.coins);
  else assert.equal(out.result.receipt.status,'committed',`${action}: committed receipt`);
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
 // W8-E8: a real rural smith now stocks the already approved sickle.
 await step('time',{until:{dayOffset:1,hour:9}});
 await step('move',{destination:'bld_hw_forge'},{target:'bld_hw_forge'});
 for(const item of ['item_mining_pick','item_sickle']){
  const quote=facilityRuntime().currentTradeQuote(engine,current,{seller:'npc_hw_duanyan',item,quantity:1});
  const bought=await step('trade.buy',{item,quantity:1},{target:'npc_hw_duanyan'});
  assert.equal(bought.result.cost,Math.trunc(quote.exactTotal));
  assert.equal(qty(bought.after.state.inventory[item])-qty(bought.before.state.inventory[item]),1);
 }
 await step('move',{destination:'bld_hw_council'},{target:'bld_hw_council'});
 const grain=await step('farm.buy',{quantity:8},{search:true});
 assert.equal(qty(grain.after.state.inventory.item_oats)-qty(grain.before.state.inventory.item_oats),8);
 const rentMenu=await ui.menu();assert.ok(rentMenu.actions.some(a=>a.id==='core:trade.rent_in'));
 const rentBefore=current,proposal=await ui.choose('trade.rent_in',{location:'loc_hw_fields',days:240,deadline:current.state.minute+210*1440});
 let rent;
 if(proposal.ok){
  assert.equal(proposal.result.receipt.status,'committed');committedClicks.add(proposal.eventId);
  current=await ui.read();balanced(rentBefore,current,'deferred rent');
  rent={before:rentBefore,after:current,result:proposal.result};
 }else{
  assert.match(proposal.error,/出租人未接受延期交租.*付不起首期租金/);
  assert.deepEqual(await ui.read(),rentBefore,'refused credit and unaffordable cash leave no debt or lease');
  // Respect the refusal: raise actual cash from finite unowned herbs.
  for(const resource of ['nw_herb','nw_plantain','nw_honeysuckle']){
   if(current.state.player.coins>=140)break;
   await step('time',{until:{dayOffset:1,hour:6}});
   await step('move',{destination:'loc_hw_northwood'},{target:'loc_hw_northwood'});
   await step('site.enter',{}, {search:true});
   const gathered=await step('site.gather_session',{target:resource,minutes:480});
   assert.ok(gathered.result.quantity>0);
   let left=gathered.result.quantity;
   for(const buyer of ['npc_hw_duanyan','npc_hw_ayan','npc_hw_taozhi','npc_hw_linsui']){
    if(!left)break;
    for(let closed=0;!scheduleAt(engine,buyer,current.state.minute,current.state)?.services?.includes('trade')&&closed<3;closed++)await step('time',{until:{dayOffset:1,hour:13}});
    const place=current.state.npcs[buyer].location;
    await step('move',{destination:place},{target:place});
    const count=Math.min(left,5),sold=await step('trade.sell_to',{item:gathered.result.item,quantity:count},{target:buyer});
    assert.equal(sold.after.state.player.coins-sold.before.state.player.coins,sold.result.cost);left-=count;
   }
   assert.equal(left,0);
  }
  assert.ok(current.state.player.coins>=140,`chief refused deferred rent and real cash is still insufficient: ${current.state.player.coins}; ${proposal.error}`);
  await step('time',{until:{dayOffset:1,hour:9}});
  await step('move',{destination:'bld_hw_council'},{target:'bld_hw_council'});
  rent=await step('trade.rent_in',{location:'loc_hw_fields',days:240});
 }
 // Existing monthly rent 35*4=140; deferred credit never forgives later months.
 assert.equal(rent.result.rent,140);assert.equal(rent.result.owner,'loc_hw');
 assert.equal(rent.result.paid,rent.result.rentDueAt===undefined?140:0);
 assert.equal(rent.before.state.player.coins-rent.after.state.player.coins,rent.result.paid);
 assert.equal(rent.after.state.settlements.loc_hw.treasury-rent.before.state.settlements.loc_hw.treasury,rent.result.paid);
 await step('move',{destination:'loc_hw_fields'},{target:'loc_hw_fields'});
 const planted=await step('farm.private_sow',{areaMu:1,item:'item_oats'},{search:true});
 // Native acreage is whole mu: 1/15 ha, 100/15 area units, ceil(120/15)=8 seed.
 assert.equal(planted.result.farm.areaUnits,100/15);assert.equal(planted.result.farm.seed,8);
 assert.equal(qty(planted.before.state.inventory.item_oats)-qty(planted.after.state.inventory.item_oats),8);

 const farmId=planted.result.farm.id;
 // Growth counts qualified weather days, not merely elapsed calendar days.
 await step('time',{until:{dayOffset:180,hour:11}});
 for(let day=0;current.state.records[farmId].status==='growing'&&day<45;day++)await step('time',{until:{dayOffset:1,hour:11}});
 const ripe=current.state.records[farmId];assert.equal(ripe.status,'ready');
 assert.equal(ripe.grownDays,180);assert.equal(ripe.qualityDays,180);
 // 1/15 ha * 1700 portions/ha, multiplied by observed mean quality.
 assert.equal(ripe.yield,Math.floor((1700/15)*ripe.qualitySum/ripe.qualityDays));
 assert.ok(current.state.minute<rent.result.deadline,'harvest within the signed lease');
 let harvested=0,cropSale=0,trips=0;
 while(harvested<ripe.yield){
  await step('move',{destination:'loc_hw_fields'},{target:'loc_hw_fields'});
  const capacity=Math.floor((30-carryLoad(engine,current).carriedKg+1e-9)/0.5);
  const cut=await step('farm.private_harvest',{}, {search:true});
  assert.equal(cut.result.harvested,Math.min(ripe.yield-harvested,capacity));
  harvested+=cut.result.harvested;trips++;
  assert.equal(cut.result.remaining,ripe.yield-harvested);
  assert.equal(cut.result.laborMinutes,Math.ceil(480*cut.result.harvested/ripe.yield));
  await step('move',{destination:'bld_hw_qingdeng'},{target:'bld_hw_qingdeng'});
  const count=cut.result.harvested;
  const offer=facilityRuntime().currentTradeQuote(engine,current,{seller:'player',buyer:'npc_hw_linsui',item:'item_oats',quantity:count});
  const sold=await step('trade.sell_to',{item:'item_oats',quantity:count},{target:'npc_hw_linsui'});
  assert.equal(sold.result.cost,Math.trunc(offer.exactTotal),'round the actual full quote once');
  assert.equal(sold.after.state.player.coins-sold.before.state.player.coins,sold.result.cost);
  assert.equal(qty(sold.before.state.inventory.item_oats)-qty(sold.after.state.inventory.item_oats),count);
  cropSale+=sold.result.cost;
 }
 assert.ok(trips>1,'carrying capacity requires real separate trips');
 assert.equal(current.state.records[farmId].harvestedQty,ripe.yield);
 assert.equal(current.state.records[farmId].status,'harvested');
 assert.ok(cropSale>1,'home-grown grain really sold for money');

 if(rent.result.rentDueAt!==undefined){
  if(current.state.minute<rent.result.rentDueAt)await step('time',{minutes:rent.result.rentDueAt-current.state.minute});
  await step('move',{destination:'loc_hw'},{target:'loc_hw'});
  const claims=Object.values(current.state.obligations).filter(o=>o.contract===rent.result.contract&&o.kind==='rent'&&o.amount>o.paid);
  const owed=claims.reduce((n,o)=>n+o.amount-o.paid,0);
  // Deferral preserves every accrued month: initial 140 plus 140 for each
  // monthly boundary before the end of the 240-day lease, never a rent waiver.
  assert.equal(claims.reduce((n,o)=>n+o.amount,0),140*(1+Math.floor((current.state.minute-rent.after.state.records[rent.result.contract].createdAt)/(30*1440))));
  assert.ok(current.state.player.coins>=owed,'actual crop proceeds must cover the signed rent; no bank deposit of fictitious net profit');
  for(const claim of claims){
   const amount=claim.amount-claim.paid,paid=await step('promise.settle',{obligation:claim.id,coins:amount},{search:true});
   assert.equal(paid.after.state.obligations[claim.id].paid,claim.amount);
   assert.equal(paid.after.state.settlements.loc_hw.treasury-paid.before.state.settlements.loc_hw.treasury,amount);
  }
 }

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

 // A separate deposit preserves the original named five-copper claim checks.
 // This second claim explicitly uses the proceeds from the real crop above.
 const cropDepositCoins=Math.min(cropSale,current.state.player.coins);
 assert.ok(cropDepositCoins>1,'some crop proceeds remain after real tuition and paper costs');
 const cropDeposit=await step('trade.deposit',{coins:cropDepositCoins},{eventId:'s5-homegrown-deposit'});
 assert.equal(cropDeposit.result.deposited,cropDepositCoins-1);assert.equal(cropDeposit.result.fee,1);
 assert.equal(cropDeposit.before.state.player.coins-cropDeposit.after.state.player.coins,cropDepositCoins);
 assert.equal(cropDeposit.after.state.records[BANK].coins-cropDeposit.before.state.records[BANK].coins,cropDepositCoins);

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
