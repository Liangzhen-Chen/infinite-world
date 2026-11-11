import assert from 'node:assert/strict';
import {setup,DAY,draft,once,world} from './harness.mjs';
import {advancePets} from '../../server-plugin/pets.mjs';
import {recordEntityDeath} from '../../server-plugin/npc-life.mjs';

export function custodyFixture(){
 const S=setup({coins:10000}),{engine,doc}=S,keeper='npc_hw_linsui',id='s3_custody_animal';
 const definition={id,name:'托养岸犬',intelligence:1,tamingRule:{category:'support',food:[{item:'item_ration',hungerRelief:50}],skills:[]}};
 engine.byId.set(id,definition);doc.state.creatures??={};doc.state.pets??={};
 doc.state.location=doc.state.npcs[keeper].location;
 doc.state.creatures[id]={name:definition.name,hp:30,maxHp:30,level:1,status:'正常',owner:'player',location:doc.state.location,
  care:{version:1,hunger:20,fatigue:0,mood:60,loyalty:70,sickness:false,sickHours:0,neglectHours:0,nextTick:doc.state.minute+60,bond:30,skills:{},experience:0}};
 doc.state.pets[id]={petFormat:1,creature:id,category:'support',status:'活跃',following:true};
 doc.state.npcs[keeper].inventory.item_ration={quantity:10000};doc.state.npcs[keeper].status='正常';
 return{...S,keeper,id};
}
export const privateFarmScenario=once(async()=>{
 const S=setup(),p=S.engine.rules.agriculture.settlements.find(p=>p.settlement==='loc_hw'),crop=S.engine.rules.agriculture.crop;
 // Retain the participants' published shop/workshop duty for real shopping
 // and derived recipe teaching; leave unrelated NPCs as in the original fixture.
 for(const id of ['npc_hw_ayan','npc_hw_duanyan'])
  S.engine.byId.get(id).schedule=structuredClone(world.npcs.find(n=>n.id===id).schedule);
 let doc=S.doc;
 doc.state.buildings[p.fieldLocation]={...doc.state.buildings[p.fieldLocation],owner:'player',condition:100};
 // W8-E1 负重：原夹具燕麦 100 份 = 50 公斤，开局即超安全负重 30 公斤，之后买木料被拒。播种只要 16 份，带 17 份（多 1 份让播后存量仍可核对）= 8.5 公斤。
 doc.state.inventory.item_oats={quantity:17};
 // Published stock includes a soil_work pick, but no ready-made sickle.
 // Buy from the actual owners, then learn and forge the harvest tool: every
 // attempt applies its real fees, time, material consumption and tool wear.
 doc=(await S.run(doc,'world_move',{destination:'bld_hw_mill'},'private-tools-mill')).document;
 doc=(await S.run(doc,'world_trade',{seller:'npc_hw_ayan',item:'item_wood',quantity:5},'private-tools-wood')).document;
 doc=(await S.run(doc,'world_move',{destination:'bld_hw_forge'},'private-tools-forge')).document;
 // S5-02: buy the same physical inputs in native retail lots (<=5), respecting each lot's market depth.
 // W8-E1 负重：材料原各 6 套（6 次制作机会），连同燕麦与工具共 30.5 公斤超限；改各 5 套：
 // 2.6 随身 + 燕麦 8.5 + 木料 5×2 + 镐 2.8 + 锤 1.2 + 钳 0.7 + 铁屑 5×0.2 + 木炭 5×0.25 = 28.05 公斤 ≤ 30。
 for(const [item,total]of [['item_mining_pick',1],['item_smith_hammer',1],['item_smith_tongs',1],['item_iron_scrap',5],['item_charcoal',5]])
  for(let left=total;left>0;left-=Math.min(5,left))doc=(await S.run(doc,'world_trade',{seller:'npc_hw_duanyan',item,quantity:Math.min(5,left)},`private-tools-buy:${item}:${left}`)).document;
 for(let attempt=0;!doc.state.recipes.recipe_sickle&&attempt<6;attempt++)
  doc=(await S.run(doc,'world_learn',{entity:'recipe_sickle',source:'npc_hw_duanyan'},`private-tools-learn:${attempt}`)).document;
 assert.ok(doc.state.recipes.recipe_sickle,'真实学习取得铁镰配方');
 for(let attempt=0;!doc.state.inventory.item_sickle&&attempt<5;attempt++)
  doc=(await S.run(doc,'world_craft',{recipe:'recipe_sickle'},`private-tools-craft:${attempt}`)).document;
 assert.ok(doc.state.inventory.item_sickle,'真实材料与工时制成收割工具');
 doc=(await S.run(doc,'world_move',{destination:p.fieldLocation},'private-tools-field')).document;
 if(doc.state.minute<crop.sowDays[0]*DAY)doc=await S.wait(doc,crop.sowDays[0]-doc.state.minute/DAY,'spring-private');
 const before=doc.state.inventory.item_oats.quantity;
 // D05 §5.5 / 已审 S505：播种按亩选择真实种子。2亩÷15亩/ha×120份/ha=16份燕麦种；不能用 quantity 代替面积。
 doc=(await S.run(doc,'world_farm',{operation:'private_sow',areaMu:2,item:'item_oats'},'private-sow')).document;
 const farm=doc.state.records[`private-farm:${p.fieldLocation}`];assert.equal(farm.seed,16);assert.equal(doc.state.inventory.item_oats.quantity,before-16);
 assert.equal(farm.areaUnits,13.333333333333334,'2亩×100面积单位/ha÷15亩/ha');
 assert.equal(doc.state.records['agriculture:loc_hw'].field.areaUnits+farm.capacityUnits,p.areaUnits,'公私田总面积守恒，不能重复耕作同一份土地');
 await assert.rejects(S.run(doc,'world_farm',{operation:'private_harvest'},'private-early'),/没有可收割/);
 doc=(await S.run(doc,'world_move',{destination:'loc_hw',mode:'walk'},'private-leave')).document;
 const awayAt=doc.state.minute;doc=await S.wait(doc,360,'private-away');assert.equal(doc.state.minute,awayAt+360*DAY);
 const end=doc.state.records[farm.id];assert.equal(end.status,'rotted');assert.ok(end.yield>0);
 assert.equal(doc.state.inventory.item_oats.quantity,before-farm.seed);
 assert.ok(doc.state.records['agriculture:loc_hw'].ledger.harvested>0);
 return{yield:end.yield,seed:farm.seed,publicHarvest:doc.state.records['agriculture:loc_hw'].ledger.harvested};
});
export const custodyScenario=once(async()=>{
 const S=custodyFixture();
 // The positive case isolates feeding from random illness; death is exercised
 // below through the actual lifecycle entry, and migration through its route.
 S.engine.rules.npcLife.health.bands=S.engine.rules.npcLife.health.bands.map(b=>({...b,illnessPerYear:0,suddenDeathPerYear:0}));
 let doc=(await S.run(S.doc,'world_pet',{operation:'custody',target:S.id,keeper:S.keeper,days:360,consent:true},'custody-sign')).document;
 const before=doc.state.npcs[S.keeper].inventory.item_ration.quantity;
 doc=(await S.run(doc,'world_move',{destination:doc.state.location==='loc_hw'?'bld_hw_council':'loc_hw',mode:'walk'},'custody-leave')).document;
 const awayAt=doc.state.minute;doc=await S.wait(doc,360,'custody-year');assert.equal(doc.state.minute,awayAt+360*DAY);
 assert.ok(doc.state.creatures[S.id].hp>0);assert.equal(doc.state.creatures[S.id].owner,'player');
 const consumed=before-doc.state.npcs[S.keeper].inventory.item_ration.quantity;assert.ok(consumed>0);
 for(const status of ['迁居','死亡']){
  let c=(await S.run(S.doc,'world_pet',{operation:'custody',target:S.id,keeper:S.keeper,days:360,consent:true},`custody-${status}`)).document;
  const cursor=draft(c);
  if(status==='死亡')recordEntityDeath(cursor,S.engine,S.keeper,c.state.minute,'托养受托人死亡');else{
   cursor.set(['state','npcs',S.keeper,'location'],null);cursor.set(['state','npcs',S.keeper,'scheduleTravel'],{migration:'custody-relocation',depart:c.state.minute,arrive:c.state.minute+DAY});
  }
  const food=S.engine.quantity(cursor,S.keeper,'item_ration');advancePets(cursor,S.engine,c.state.minute+60);c=cursor.document;
  assert.equal(c.state.pets[S.id].custody.status,'interrupted');assert.equal(S.engine.quantity(cursor,S.keeper,'item_ration'),food);assert.ok(c.state.creatures[S.id].hp>0);
 }
 return{consumed};
});
