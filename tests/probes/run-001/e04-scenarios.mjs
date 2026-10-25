import assert from 'node:assert/strict';
import {fixture,host,worker,clerk} from '../../helpers/finance.mjs';
import {mineEmployment} from '../../../server-plugin/extraction.mjs';
import {recipeInputCost} from '../../../server-plugin/manufacturing.mjs';
import {regionalTradePrice} from '../../../server-plugin/settlement-trade.mjs';
import {openLedger} from '../../../server-plugin/ledger.mjs';
import {reconcile} from '../../helpers/ledger-audit.mjs';
import {generateCounty,remoteWorld} from '../../../server-plugin/remote-generation.mjs';
import {WorldEngine} from '../../../server-plugin/engine.mjs';
import {legalCodeAt,miningJurisdiction,codePenalty} from '../../../server-plugin/law-codes.mjs';
import {applyPatches} from '../../../server-plugin/storage.mjs';
import {standing} from '../../../server-plugin/standing.mjs';
import {applyIntentSetup} from '../../../tools/a3-score.mjs';

function job(f,{location=f.doc.state.location,item='item_iron'}={}){
 const row={id:'e04-mining',category:'contract',kind:'workshop',owner:host,worker,location,item,task:'矿脉开采',
  starts:0,createdAt:0,deadline:30*1440,status:'生效',attendance:{0:480}};
 f.doc.state.records[row.id]=row;
 const tool=f.e.rules.extraction.mining.tool;
 f.doc.state.npcs[worker].inventory[tool]={quantity:1,durability:100};
 f.doc.state.npcs[worker].attributes={力量:1000,敏捷:1000,智力:1000};
 return row;
}
function balanced(d,e){
 assert.deepEqual(reconcile(e,d.document),{mismatches:[],lots:[],drift:[],audit:[]});
}
export async function materialScenario(){
 const f=fixture({at:'bld_hw_forge'}),item='item_iron',location=f.doc.state.location;
 f.e.byId.get(location).minerals=[{item:'item_iron_ore',reserve:30,owner:host}];
 const row=job(f,{item:'item_iron_ore'}),recipe=f.w.recipes.find(r=>r.id==='recipe_forge_nails');assert.ok(recipe);
 const smelt=f.w.recipes.find(r=>r.id==='recipe_smelt_iron');assert.ok(smelt);
 const secondJob={...row,id:'e04-second-miner',worker:clerk};f.doc.state.records[secondJob.id]=secondJob;
 f.doc.state.npcs[clerk].attributes=structuredClone(f.doc.state.npcs[worker].attributes);
 f.doc.state.npcs[clerk].inventory[f.e.rules.extraction.mining.tool]={quantity:1,durability:100};
 // 15 §15.2: native iron now prices its own goods class. With only two
 // bars, demand10/stock2 already hits the scarcity ceiling3, hiding later
 // supply changes. Four is an unrelated opening-stock premise, not a quote.
 const opening=applyIntentSetup(f.e,f.doc,{facts:[{path:['state','npcs',host,'inventory'],value:{...f.doc.state.npcs[host].inventory,[item]:{quantity:4}}}]});
 assert.deepEqual(opening.setupUnmet,[]);f.doc=opening.document;
 f.doc.state.settlements.loc_hw.iron=0;
 f.doc.state.inventory.item_charcoal={quantity:20};
 const smith='npc_hw_duanyan';
 f.doc.state.npcs[smith]={...f.doc.state.npcs[host],inventory:{},location,status:'正常'};
 for(const tool of recipe.tools)f.doc.state.inventory[tool]={quantity:1,durability:100};
 f.doc.state.skills[recipe.skill]={proficiency:1000,grade:'中级1等',daily:{}};
 f.doc.state.recipes??={};f.doc.state.recipes[recipe.id]={learnedAt:0,source:'师授'};
 f.doc.state.recipes[smelt.id]={learnedAt:0,source:'师授'};
 f.doc.state.player.attributes={...f.doc.state.player.attributes,力量:100};
 f.doc.ledger=openLedger(f.e,f.doc);
 let d=f.draft();const mined=mineEmployment(d,f.e,row,600,480),other=mineEmployment(d,f.e,secondJob,600,480);
 assert.ok(mined.obtained[0].quantity+other.obtained[0].quantity>=14);d.done();
 assert.equal(mined.illegal,false);
 const low=regionalTradePrice(f.draft(),f.e,item,location),before=recipeInputCost(f.draft(),f.e,recipe);
 const first=await f.act({seller:host,item,quantity:1},'e04-first-iron');
 // Shelf maximum8 + reserve2 gives D10; local iron S4. Published base12
 // × scarcity2.5 × depth/quality/spread/regard/corrections1 = 30 copper.
 assert.equal(first.cost,30);assert.equal(first.pricing.scarcity,2.5);
 let craft=await f.e.reduce(f.doc,{tool:'world_craft',args:{recipe:recipe.id},eventId:'e04-first-forge'});
 f.doc=applyPatches(f.doc,craft.patches);const crafted=craft.result;
 assert.equal(crafted.spent.materials.find(m=>m.item===item).quantity,1);
 d=f.draft();d.set(['state','records',row.id,'status'],'罢工');
 d.set(['state','records',secondJob.id,'status'],'罢工');
 const snapshot=structuredClone(d.document);
 assert.equal(mineEmployment(d,f.e,row,1000,480),null);assert.equal(mineEmployment(d,f.e,secondJob,1000,480),null);assert.deepEqual(d.document,snapshot);d.done();
 await f.act({seller:host,item:'item_iron_ore',quantity:smelt.materials.find(m=>m.item==='item_iron_ore').amount},'e04-buy-ore');
 craft=await f.e.reduce(f.doc,{tool:'world_craft',args:{recipe:smelt.id},eventId:'e04-smelt-iron'});
 f.doc=applyPatches(f.doc,craft.patches);assert.equal(craft.result.success,true);assert.equal(craft.result.produced[0].item,item);
 await f.act({seller:'player',buyer:host,item,quantity:1},'e04-sell-smelted-iron');
 // Smelting replaced the first consumed bar. Buy and actually forge one
 // more bar so native effective supply falls from4 to3 (rather than merely
 // moving an unchanged bar between holders). No expected-price function is
 // used, and both original regional input-cost assertions above stay strict.
 await f.act({seller:host,item,quantity:1},'e04-consume-iron');
 const consumed=await f.e.reduce(f.doc,{tool:'world_craft',args:{recipe:recipe.id},eventId:'e04-consume-forge'});
 f.doc=applyPatches(f.doc,consumed.patches);assert.equal(consumed.result.spent.materials.find(m=>m.item===item).quantity,1);
 const working=f.draft();working.set(['state','records',row.id,'status'],'生效');
 const continued=mineEmployment(working,f.e,row,1000,60);assert.equal(continued.obtained[0].quantity,1);
 // Unified goods pricing no longer recursively prices bars from ore. In
 // the continuing-production fork, actually buy the mined ore and smelt it
 // into a bar before comparing bar supply. Preserve the strict inequality.
 const forkBuy=await f.e.reduce(working.document,{tool:'world_trade',args:{seller:host,item:'item_iron_ore',quantity:smelt.materials.find(m=>m.item==='item_iron_ore').amount},eventId:'e04-working-ore'});
 const forkSmelt=await f.e.reduce(applyPatches(working.document,forkBuy.patches),{tool:'world_craft',args:{recipe:smelt.id},eventId:'e04-working-smelt'});
 assert.equal(forkSmelt.result.success,true);
 const fork=applyPatches(applyPatches(working.document,forkBuy.patches),forkSmelt.patches),forkRead={document:fork,get:(...p)=>p.reduce((v,k)=>v?.[k],fork)};
 const workingPrice=regionalTradePrice(forkRead,f.e,item,location);d=f.draft();
 const high=regionalTradePrice(d,f.e,item,location),after=recipeInputCost(d,f.e,recipe);
 assert.ok(high>low);assert.ok(high>workingPrice,'同样消耗下，继续生产的供给与价格须优于停工分支');assert.ok(after.copper>before.copper);d.done();
 const second=await f.act({seller:host,item,quantity:1},'e04-second-iron');
 assert.equal(second.pricing.scarcity,3,'10/3 clamps at the published upper bound3');
 assert.ok(second.cost>first.cost,'同日成交必须读取新账户供给');
 assert.equal(first.receivingCases,undefined);assert.equal(second.receivingCases,undefined,'合法矿石交易不能产生收赃案');
 // 15 §15.2: preserve all three real sales as history, never saved quotes.
 assert.equal(Object.values(f.doc.state.records).filter(r=>r.category==='market_trade'&&r.seller===host&&r.buyer==='player'&&r.item===item).length,3,'动态报价须保留此前成交');
 craft=await f.e.reduce(f.doc,{tool:'world_craft',args:{recipe:recipe.id},eventId:'e04-second-forge'});
 f.doc=applyPatches(f.doc,craft.patches);d=f.draft();const next=craft.result;
 assert.ok(d.get('state','crafted',next.receipt,'inputCost','copper')>d.get('state','crafted',crafted.receipt,'inputCost','copper'));
 balanced(d,f.e);
 return `真实开采矿石${mined.obtained[0].quantity+other.obtained[0].quantity}份，停工无产出；实际买矿冶炼成铁，铁价${low}→${high}，同日采购${first.cost}→${second.cost}，配方投入估值${before.copper}→${after.copper}；冶炼与打造实际扣料、账本守恒`;
}
export async function stolenScenario(){
 const location='site_ms_ll_adit',f=fixture({at:location}),county='county_xichui_huancheng';
 const skeleton=generateCounty(f.w,county,'e04-court');
 f.doc.state.remote??={};f.doc.state.remote[county]={county,skeleton,profiles:{}};
 for(const n of skeleton.people)f.doc.state.npcs[n.id]={status:'正常',location:n.location,activity:'办公',occupation:n.occupation,coins:1000,inventory:{}};
 const e=new WorldEngine(remoteWorld(f.w,f.doc.state)),row=job(f,{item:'item_iron_ore'});
 const jurisdiction=miningJurisdiction(e,f.doc.state,location);assert.equal(jurisdiction.kind,'code');
 assert.ok(jurisdiction.code.court&&jurisdiction.code.judges.length&&jurisdiction.code.officers.length);
 const victim='npc_ms_ll_yayue';
 f.doc.state.npcs[victim]={status:'正常',location:jurisdiction.code.court,activity:'等候',coins:0,inventory:{}};
 const owner=f.w.npcs.find(n=>n.id===victim);delete owner.tier;
 owner.schedule={default:[{start:0,end:1440,location:jurisdiction.code.court,activity:'等候',services:['trade']}]};
 f.doc.ledger=openLedger(e,f.doc);
 const regard=standing(e,f.doc.state,jurisdiction.custom.faction,worker);
 let d=f.draft();const mined=mineEmployment(d,e,row,600,60);assert.equal(mined.success,true);
 assert.equal(standing(e,d.get('state'),jurisdiction.custom.faction,worker),regard+jurisdiction.custom.rule.standing,'上级法院受理不能抹掉当地仍有效的自治规矩');
 const theft=d.get('state','records',mined.case);assert.equal(theft.offense,'illegal_mining');assert.equal(theft.reported,false);
 const unit=theft.stolen.unit;assert.equal(d.get('state','itemInstances',unit,'stolenOrigin','victim'),'npc_ms_ll_yayue');d.done();
 const out=await f.e.reduce(f.doc,{tool:'world_trade',args:{seller:host,item:'item_iron_ore',quantity:1,instances:[unit]},eventId:'e04-receive'});
 f.doc=applyPatches(f.doc,out.patches);d=f.draft();
 const id=out.result.receivingCases[0],received=d.get('state','records',id);
 assert.equal(received.offense,'receiving_stolen');assert.equal(received.offender,'player');assert.equal(received.reported,false);
 assert.equal(received.law,jurisdiction.law);assert.equal(d.get('state','itemInstances',unit,'owner'),'player');
 assert.equal(d.get('state','itemInstances',unit,'stolenOrigin','case'),mined.case);
 assert.deepEqual(JSON.parse(JSON.stringify(d.get('state','itemInstances',unit))),d.get('state','itemInstances',unit),'赃物来源与单件登记须完整跨 JSON 存档保存');
 const code=legalCodeAt(e,location,d.get('state')),officer=code.officers[0];
 d.set(['state','location'],code.court);
 for(const person of [clerk,officer])d.set(['state','npcs',person,'location'],code.court);
 d.done();const report=await f.e.reduce(f.doc,{tool:'world_law',args:{operation:'report',case:id,reporter:clerk,authority:officer},eventId:'e04-report'});
 f.doc=applyPatches(f.doc,report.patches);d=f.draft();const reported=report.result;
 assert.equal(reported.reported,true);assert.equal(reported.convicted,false);
 const action=async(operation,args={})=>{
  const out=await f.e.reduce(f.doc,{tool:'world_law',args:{operation,case:id,authority:officer,...args},eventId:`e04-${operation}`});
  f.doc=applyPatches(f.doc,out.patches);return out.result;
 };
 await action('confess');
 const heard=await action('hear',{authority:code.judges[0]}),penalty=codePenalty(e,code,'receiving_stolen');
 assert.equal(heard.judgment.fine,penalty.baseFine+received.value*penalty.valueMultiplier);
 await action('pay');const claimed=await action('claim',{claimant:victim});
 assert.deepEqual(claimed.units,[unit]);assert.equal(f.doc.state.itemInstances[unit].owner,victim);
 assert.ok(Number.isSafeInteger(f.doc.state.itemInstances[unit].stolenOrigin.recoveredAt));d=f.draft();
 balanced(d,e);
 return `矿口派生${jurisdiction.law}，盗采案${mined.case}；收赃案${id}经亲见者报案、自认、按当地条文裁判及实际付款，原主从法院领回矿石，解除赃物状态；未自动定罪，账本守恒`;
}
