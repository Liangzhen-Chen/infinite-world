// S5CT: premises declare resources/skills; the examined claims, food, crops,
// site stock and delivery state are created only by production game actions.
import assert from 'node:assert/strict';
import {WorldEngine} from '../../server-plugin/engine.mjs';
import {readBodyNeed} from '../../server-plugin/primitives-body.mjs';
import {createTransportAsset} from '../../server-plugin/transport.mjs';
import {applyPatches} from '../../server-plugin/storage.mjs';
import {uiSession} from './ui-script.mjs';
import {variant,scene,stack,tool,monthDayMinute,primed,held,conserved,safeEventId,baseEngine} from './daily-b2.mjs';

const INN='bld_hw_qingdeng',KEEPER='npc_hw_linsui';
export async function meal(t){
 const ui=await uiSession(t,{mutate:scene(INN,600,s=>{
  s.player.coins=100;s.player.body={satiety:{value:30,asOf:600,activity:'rest'}};
  s.npcs[KEEPER].inventory.item_mutton_turnip_stew=stack(5);
 })}),before=await primed(ui);
 const out=await ui.choose('eat.order',{subject:KEEPER,item:'item_oat_flatbread',side:'item_mutton_turnip_stew'},{target:KEEPER,search:true});assert.ok(out.ok,out.error);
 const after=await ui.read();
 // One portion of each purchased dish is consumed, never added to old supplies.
 for(const id of ['item_oat_flatbread','item_mutton_turnip_stew']){
  assert.equal(held(after.state.inventory,id),held(before.state.inventory,id));
  assert.equal(after.ledger.flows[`sink:consume|${id}|meal`]-(before.ledger?.flows[`sink:consume|${id}|meal`]??0),1);
 }
 const paid=out.result.purchases.reduce((n,p)=>n+p.cost,0);
 assert.equal(before.state.player.coins-after.state.player.coins,paid);
 assert.equal(after.state.npcs[KEEPER].coins-before.state.npcs[KEEPER].coins,paid);
 assert.ok(readBodyNeed(baseEngine,after,'player','satiety')>30);conserved(before,after,'S5CT D05');
}

export async function herbs(t){
 const ui=await uiSession(t,{mutate:scene('loc_hw_northwood',monthDayMinute(3,10,9),s=>{s.skills.skill_life_9_core={proficiency:10,breakthroughs:[],daily:{}};})});
 assert.ok((await ui.choose('site.enter',{}, {search:true})).ok);
 const before=await primed(ui),out=await ui.choose('site.gather_session',{target:'nw_plantain',minutes:120},{search:true});assert.ok(out.ok,out.error);
 const after=await ui.read();
 // Spring plantain: 20 portions / 480 minutes * 120 = 5, site 20 -> 15.
 assert.equal(held(after.state.inventory,'item_plantain')-held(before.state.inventory,'item_plantain'),5);
 assert.equal(before.state.records['site:loc_hw_northwood'].remaining.nw_plantain,20);
 assert.equal(after.state.records['site:loc_hw_northwood'].remaining.nw_plantain,15);
 assert.equal(after.state.minute-before.state.minute,120);conserved(before,after,'S5CT D14');
}

export async function cooking(t){
 const recipe=baseEngine.byId.get('recipe_w3_fish_broth');
 const ui=await uiSession(t,{mutate:scene(INN,600,s=>{
  s.inventory.item_fish=stack(2);s.inventory.item_water=stack(2);s.inventory.item_salt=stack(3);s.inventory.item_wood_shavings=stack(3);
  for(const id of recipe.tools)s.inventory[id]=tool('铁');
  s.skills[recipe.skill]={proficiency:300,daily:{},breakthroughs:[]};s.recipes[recipe.id]={source:{type:'teacher',id:KEEPER}};
 })}),before=await primed(ui);
 const out=await ui.choose('craft.manufacture',{recipe:recipe.id},{search:true,eventId:safeEventId('s5ct-cook')});assert.ok(out.ok,out.error);assert.equal(out.result.success,true);
 const after=await ui.read();
 // Fish1 + water2 + salt1 + shavings1 -> soup1, 60 minutes and stove fee3.
 for(const [id,n] of [['item_fish',1],['item_water',2],['item_salt',1],['item_wood_shavings',1]])assert.equal(held(before.state.inventory,id)-held(after.state.inventory,id),n);
 assert.equal(held(after.state.inventory,'item_fish_broth')-held(before.state.inventory,'item_fish_broth'),1);
 assert.equal(after.state.minute-before.state.minute,60);assert.equal(before.state.player.coins-after.state.player.coins,3);
 conserved(before,after,'S5CT D16');
 const eaten=await ui.choose('eat.meal',{item:'item_fish_broth'},{search:true});assert.ok(eaten.ok,eaten.error);
 const end=await ui.read();assert.equal(held(after.state.inventory,'item_fish_broth')-held(end.state.inventory,'item_fish_broth'),1);
 assert.ok(readBodyNeed(baseEngine,end,'player','satiety')>readBodyNeed(baseEngine,after,'player','satiety'));
}

export async function crop(t){
 // Short growth window is a world rule variant, not a ready-crop snapshot.
 const world=variant(w=>{delete w.rules.weather;w.rules.agriculture.crop.growthDays=2;w.rules.agriculture.crop.sowDays=[0,359];});
 const engine=new WorldEngine(world),ui=await uiSession(t,{world,mutate:scene('bld_hw_council',monthDayMinute(1,8,9),s=>{
  s.player.coins=1000;s.inventory.item_wheat_seed=stack(20);s.inventory.item_hoe=tool();s.inventory.item_sickle=tool();
 })});
 const rented=await ui.choose('trade.rent_in',{location:'loc_hw_fields',quantity:1,item:'item_wheat_seed',days:7},{search:true});assert.ok(rented.ok,rented.error);
 const move=await ui.choose('move',{destination:'loc_hw_fields'},{search:true});assert.ok(move.ok,move.error);
 const before=await primed(ui),sown=await ui.choose('farm.private_sow',{areaMu:1},{search:true});assert.ok(sown.ok,sown.error);
 const planted=await ui.read(),farm=planted.state.records['private-farm:loc_hw_fields'];
 // One mu uses2 wheat seed, .5 workday *480 =240 labor minutes.
 assert.equal(farm.lease,rented.result.contract);assert.equal(farm.seed,2);assert.equal(sown.result.laborMinutes,240);
 assert.equal(held(before.state.inventory,'item_wheat_seed')-held(planted.state.inventory,'item_wheat_seed'),2);
 assert.ok((await ui.choose('time',{minutes:3*1440})).ok);
 const mature=await ui.read();assert.equal(mature.state.records['private-farm:loc_hw_fields'].status,'ready');
 const harvested=await ui.choose('farm.private_harvest',{}, {search:true});assert.ok(harvested.ok,harvested.error);
 const after=await ui.read(),key='loc_hw_fields|item_wheat_grain|crop';
 // One mu: 150 jin *.5 kg / .5 kg per portion =150; pack accepts part,
 // all harvested grain is transferred from this same mature field account.
 assert.equal(mature.state.records['private-farm:loc_hw_fields'].yield,150);
 assert.ok(harvested.result.harvested>0);
 assert.equal(mature.ledger.accounts[key]-after.ledger.accounts[key],harvested.result.harvested);
 assert.equal(held(after.state.inventory,'item_wheat_grain')-held(mature.state.inventory,'item_wheat_grain'),harvested.result.harvested);
 conserved(before,after,'S5CT D12/D13',engine);
}

export async function shipping(t){
 // Raw materials and the driver's presence are premises; make the cart through
 // the actual transport action rather than importing an asset or a delivery.
 const driver='npc_hw_zhengshuisheng',ui=await uiSession(t,{mutate:scene('loc_hw',monthDayMinute(9,15,8),(s,doc)=>{
  s.player.coins=100;s.inventory.item_oats=stack(5,{weight:.5});
  s.npcs[driver].location='loc_hw';s.npcs[driver].status='正常';s.npcs[driver].activity='营业';
  s.npcs[driver].inventory.item_wood=stack(30);s.npcs[driver].inventory.item_iron=stack(10);
  const d=baseEngine.primitiveDraft(doc);createTransportAsset(d,baseEngine,{owner:driver,kind:'cart'},'s5ct-cart');Object.assign(doc,applyPatches(doc,d.patches));
 })});
 // The cart above consumes real stock through the same asset constructor.
 const opening=await ui.read(),asset=Object.values(opening.state.records).find(r=>r.category==='transport_asset'&&r.owner===driver&&r.location==='loc_hw');
 assert.ok(asset,'existing carrier cart');
 const args={operation:'transport',contract:asset.id,location:'loc_bs',item:'item_oats',quantity:2};
 const before=await primed(ui),out=await ui.server.api('execute',{campaignId:ui.campaignId,tool:'world_trade',args:{...args,task:'book'},eventId:'s5ct-shipping',anchor:null,expectedSequence:(await ui.server.api('read',{campaignId:ui.campaignId})).reference.sequence});
 assert.equal(out.result.ok,true);const mid=await ui.read(),trip=mid.state.records[out.result.id];
 // Five held minus two booked =3; the only other two are on the real manifest.
 assert.equal(held(mid.state.inventory,'item_oats'),3);assert.deepEqual(trip.cargo.map(c=>[c.item,c.quantity]),[['item_oats',2]]);
 assert.equal(before.state.player.coins-mid.state.player.coins,trip.freight+trip.tariff+trip.toll);
 assert.ok((await ui.choose('time',{minutes:trip.estimatedArrivalAt-mid.state.minute+1})).ok);
 const arrived=await ui.read();assert.equal(arrived.state.records[trip.id].status,'arrived');assert.equal(held(arrived.state.inventory,'item_oats'),3);
 assert.ok((await ui.choose('move',{destination:'loc_bs'},{search:true})).ok);
 const view=await ui.server.api('read',{campaignId:ui.campaignId});
 const taken=await ui.server.api('execute',{campaignId:ui.campaignId,tool:'world_trade',args:{operation:'transport',task:'collect',business:trip.id},eventId:'s5ct-collect',anchor:null,expectedSequence:view.reference.sequence});
 assert.equal(taken.result.ok,true);const after=await ui.read();assert.equal(held(after.state.inventory,'item_oats'),5);assert.equal(after.state.records[trip.id].status,'delivered');conserved(before,after,'S5CT D26');
}
