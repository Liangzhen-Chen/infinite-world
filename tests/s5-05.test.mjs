import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';
import {creatureTraits} from '../server-plugin/traits.mjs';
import {accrueStock} from '../server-plugin/stock.mjs';
import {forestView} from '../server-plugin/forest-water.mjs';
import {isGone,isPhysicallyDead} from '../server-plugin/holdings.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const id='private-farm:loc_hw_fields',account='loc_hw_fields|item_wheat_grain|crop';
function setup(engine,document,facts){
 const out=applyIntentSetup(engine,document,facts);assert.deepEqual(out.setupUnmet,[]);return out.document;
}
async function run(engine,document,tool,args,eventId){
 const out=await engine.reduce(document,{tool,args,eventId});return {document:applyPatches(document,out.patches),result:out.result};
}
async function field(modifier=1){
 const w=structuredClone(world);
 // Installed rule modifiers exercise the production slot; no new content or interface.
 if(modifier!==1)w.derived.modifiers.push({id:'field-yield',pack:'core',target:'economy:yield',stage:'mul',value:modifier,when:"subject == 'loc_hw_fields'"});
 const engine=new WorldEngine(w),initial=engine.createCharacter(seed,{},'s505-field');
 let document=setup(engine,initial,{location:'loc_hw_fields',inventory:{item_wheat_seed:20,item_oats:20,item_hoe:1,item_sickle:1},facts:[
  {path:['state','buildings'],value:{...initial.state.buildings,loc_hw_fields:{...initial.state.buildings.loc_hw_fields,owner:'player',condition:100}}}
 ]});
 document=(await run(engine,document,'world_time',{minutes:6*1440},'spring')).document;
 return {engine,document};
}
async function sown(modifier=1,collision=false){
 const f=await field(modifier),before=f.document;
 const eventId=collision?before.state.records['agriculture:loc_hw'].field.cohorts[0].id:'plant';
 const out=await run(f.engine,before,'world_farm',{operation:'private_sow',areaMu:2,item:collision?'item_oats':'item_wheat_seed'},eventId);
 assert.equal(before.state.inventory[collision?'item_oats':'item_wheat_seed'].quantity-out.document.state.inventory[collision?'item_oats':'item_wheat_seed'].quantity,collision?16:4);
 assert.equal(out.result.farm.seed,collision?16:4);assert.equal(out.result.farm.areaMu,2);
 // D05 5.5 / approved S505C: actual wheat seed is distinct from edible grain.
 // Oats: (2/15) ha * 120 seed portions/ha = 16; wheat: 4 seeds below.
 // Published units: 2 mu × 2 jin/mu × .5 kg/jin ÷ .5 kg/portion = 4 seeds;
 // 2 mu × 100 area units/ha ÷ 15 mu/ha = 13.333333333333334 area units.
 assert.equal(out.result.farm.areaUnits,13.333333333333334);
 return {...f,document:out.document};
}
function nearlyRipe(f){
 // The elapsed growing season is not under examination here. The final native
 // clock tick must create stock, from a cohort produced by the real sow action.
 const old=f.document.state.records[id],days=world.rules.agriculture.crop.growthDays-1;
 return setup(f.engine,f.document,{facts:[{path:['state','records',id],value:{...old,grownDays:days,qualityDays:days,qualitySum:days}}]});
}
async function ripe(modifier=1){
 const f=await sown(modifier);f.document=nearlyRipe(f);
 f.document=(await run(f.engine,f.document,'world_time',{minutes:2*1440},'ripen')).document;
 assert.equal(f.document.state.records[id].status,'ready');
 return f;
}

test('未播种无私田产量；真实播种按同一份种子与面积换算，重播失败零写入',async()=>{
 const f=await field(),before=structuredClone(f.document);
 assert.equal(f.document.state.records[id],undefined);assert.equal(f.document.ledger.accounts[account]??0,0);
 await assert.rejects(run(f.engine,f.document,'world_farm',{operation:'private_harvest'},'empty'),/成熟/);
 assert.deepEqual(f.document,before);
 const planted=await sown(),snapshot=structuredClone(planted.document);
 await assert.rejects(run(planted.engine,planted.document,'world_farm',{operation:'private_sow',areaMu:2},'twice'),/未收/);
 assert.deepEqual(planted.document,snapshot);
});

test('成熟入田地账户；收割只转移存量，同一批不能重复采收',async()=>{
 const f=await ripe(),before=f.document,yielded=before.state.records[id].yield;
 // 2 mu × 150 jin/mu × .5 kg/jin ÷ .5 kg/portion × (179 + .9)/180
 // = 299.8333... portions (day 6 is clear, cropMultiplier .9); floor = 299.
 assert.equal(yielded,299);assert.equal(before.ledger.accounts[account],299);
 const out=await run(f.engine,before,'world_farm',{operation:'private_harvest'},'harvest');
 assert.equal(out.result.harvested,yielded);assert.equal(out.document.ledger.accounts[account],0);
 assert.equal((out.document.state.inventory.item_wheat_grain?.quantity??0)-(before.state.inventory.item_wheat_grain?.quantity??0),yielded);
 assert.equal(out.document.ledger.flows['src:regrowth|item_wheat_grain|private_crop'],before.ledger.flows['src:regrowth|item_wheat_grain|private_crop']);
 assert.deepEqual(reconcile(f.engine,out.document).mismatches,[]);
 const snapshot=structuredClone(out.document);
 await assert.rejects(run(f.engine,out.document,'world_farm',{operation:'private_harvest'},'again'),/成熟/);
 assert.deepEqual(out.document,snapshot);
});

test('未收腐坏扣除真实田地库存，不在腐坏时生成粮食',async()=>{
 const f=await ripe(),old=f.document.state.records[id];
 // The same 299 mature portions must leave the field, not be newly generated.
 assert.equal(old.yield,299);
 // Expiry date is not the subject: settle an already mature, expiring batch.
 f.document=setup(f.engine,f.document,{facts:[{path:['state','records',id],value:{...old,expiresDay:Math.floor(f.document.state.minute/1440)}}]});
 const before=f.document,out=await run(f.engine,before,'world_time',{minutes:1440},'decay');
 assert.equal(out.document.state.records[id].status,'rotted');assert.equal(out.document.ledger.accounts[account],0);
 assert.equal(out.document.ledger.flows['sink:decay|item_wheat_grain|unharvested'],old.yield);
 assert.equal(out.document.ledger.flows['src:regrowth|item_wheat_grain|private_crop'],before.ledger.flows['src:regrowth|item_wheat_grain|private_crop']);
 assert.deepEqual(reconcile(f.engine,out.document).mismatches,[]);
});

test('同一田地的公私批次共用账户，私田收割不挪用公共作物',async()=>{
 // Client event IDs may equal an automatic public cohort ID; lots stay distinct.
 const account='loc_hw_fields|item_oats|crop'; // Explicit oats share the public oats account.
 const f=await sown(1,true);f.document=nearlyRipe(f);
 const key='agriculture:loc_hw',publicFarm=f.document.state.records[key],days=world.rules.agriculture.crop.growthDays-1;
 assert.ok(publicFarm.field.cohorts.length>0,'公共作物也来自真实春播');
 f.document=setup(f.engine,f.document,{facts:[{path:['state','records',key],value:{...publicFarm,
  tools:{...publicFarm.tools,condition:0}, // 非考查对象：停止公共劳力自动收割。
  field:{...publicFarm.field,cohorts:publicFarm.field.cohorts.map(c=>({...c,grownDays:days,qualityDays:days,qualitySum:days}))}
 }}]});
 const before=(await run(f.engine,f.document,'world_time',{minutes:2*1440},'shared-ripe')).document;
 assert.ok(before.state.records[key].field.cohorts.every(c=>c.harvestedUnits===0));
 const privateYield=before.state.records[id].yield,publicYield=before.state.records[key].field.cohorts.reduce((n,c)=>n+c.grownFood,0);
 // Public: 144 area units × 1700/100 × 179.9/180 = 2446.64 -> 2446.
 // Private oats: (2/15 ha)*1700*179.9/180 = 226.54 -> 226.
 // Same field/crop account: 2446 + 226 = 2672 portions.
 assert.equal(publicYield,2446);assert.equal(privateYield,226);assert.equal(before.ledger.accounts[account],2672);
 const out=await run(f.engine,before,'world_farm',{operation:'private_harvest'},'private-only');
 assert.equal(out.result.harvested,privateYield);assert.equal(out.document.ledger.accounts[account],publicYield);
 assert.ok(out.document.ledger.lots[account].every(l=>l.id.startsWith('public:')));
 assert.equal(out.document.ledger.lots[account].reduce((n,l)=>n+l.qty,0),publicYield);
 const audit=reconcile(f.engine,out.document);assert.deepEqual(audit.mismatches,[]);assert.deepEqual(audit.lots,[]);assert.deepEqual(audit.drift,[]);
});

test('economy:yield 修正作用于真实成熟入账，收割不会再乘一次',async()=>{
 const normal=await ripe(),boost=await ripe(2);
 // D05 §5.5 / S5-05: correct the unrounded yield, then round once at entry.
 // Doubling an already rounded normal harvest would lose its fractional part.
 // 300 × 179.9/180 = 299.8333...; floor after ×2 is 599, not 299×2.
 assert.equal(normal.document.state.records[id].yield,299);
 assert.equal(boost.document.state.records[id].yield,599);
 const out=await run(boost.engine,boost.document,'world_farm',{operation:'private_harvest'},'boost-harvest');
 assert.equal(out.result.harvested,boost.document.ledger.accounts[account]);
});

test('30次逐日与一次30日推进：作物、库存及再生总量完全一致',async()=>{
 const f=await sown();f.document=nearlyRipe(f);
 const long=(await run(f.engine,f.document,'world_time',{minutes:30*1440},'month')).document;
 let split=f.document;
 for(let day=0;day<30;day++)split=(await run(f.engine,split,'world_time',{minutes:1440},`day:${day}`)).document;
 // Mature 299 portions have a 180-day shelf life, so all 299 remain at day 30.
 assert.equal(long.ledger.accounts[account],299);assert.equal(split.ledger.accounts[account],299);
 assert.deepEqual(long.state.records[id],split.state.records[id]);assert.deepEqual(long.ledger.accounts,split.ledger.accounts);
 assert.deepEqual(long.ledger.flows,split.ledger.flows);assert.deepEqual(long.state.settlements,split.state.settlements);
});

test('有限钓饵实际耗尽后停止捕鱼，拒绝操作零写入',async()=>{
 const engine=new WorldEngine(world),initial=engine.createCharacter(seed,{},'s505-bait');
 const fish=world.monsters.filter(s=>s.wildlife&&creatureTraits(s).tags.includes('fish'));
 const habitat=world.rules.wildlife.habitats.find(h=>fish.some(s=>initial.state.records[`ecology:${h.id}`]?.populations[s.id]?.count>0));
 assert.ok(habitat,'使用世界中真实的鱼类栖地');
 const rule=world.rules.extraction.fishing;
 const before=setup(engine,initial,{location:habitat.location,inventory:{[rule.tool]:1,[rule.bait.item]:rule.bait.quantity,item_water:2},facts:[
  // Ability is non-examined: agility 30 gives +10, native d20=4 totals 14 >= 10.
  // Do not bypass the production profession cap by writing an unlicensed skill.
  {path:['state','player','attributes'],value:{...initial.state.player.attributes,'敏捷':30,'智慧':30}}
 ]});
 const out=await run(engine,before,'world_field',{operation:'wildlife_fish'},'one-bait');
 // D05 5.5 / approved S505C: a live catch consumes 1 bait and transfers 1 fish.
 // Cleaning water is spent by cooking, so both original water portions remain.
 assert.equal(out.result.success,true,JSON.stringify(out.result));assert.equal(out.result.obtained[0].quantity,1);
 assert.equal(out.document.state.inventory.item_water.quantity,2);
 const reserve=`${habitat.location}|item_live_fish|reserve`;
 assert.equal(before.ledger.accounts[reserve]-out.document.ledger.accounts[reserve],1);
 assert.equal(out.document.ledger.flows['src:harvest|item_fish|fishing']??0,0);
 assert.equal(out.document.state.inventory[rule.bait.item]?.quantity??0,0);
 assert.equal(out.result.obtained.reduce((n,r)=>n+r.quantity,0),out.result.success?1:0);
 if(out.result.success){
  const species=out.result.species,key=`ecology:${habitat.id}`;
  assert.equal(out.document.state.records[key].populations[species].withdrawn-before.state.records[key].populations[species].withdrawn,1);
 }
 const snapshot=structuredClone(out.document);
 await assert.rejects(run(engine,out.document,'world_field',{operation:'wildlife_fish'},'no-bait'),/钓饵不足/);
 assert.deepEqual(out.document,snapshot);
 // D05 5.5: pool -1 -> the same real held item +1; release reverses it.
 // Both moves have zero genesis, regrowth and consumption of live fish.
 const unitId=out.result.obtained[0].instances[0],unit=out.document.state.itemInstances[unitId];
 assert.equal(unit.item,'item_live_fish');assert.equal(unit.living,true);assert.equal(unit.species,out.result.species);assert.equal(unit.caughtAt,habitat.id);
 assert.equal(out.document.state.inventory.item_live_fish.instances.length,1);
 // Published live-fish shelf life is 1 day=1440 minutes. An already expired
 // catch is a non-examined age fact; it must never seed a live population.
 const expired=setup(engine,out.document,{facts:[{path:['state','itemInstances',unitId,'minute'],value:out.document.state.minute-1440}]}),expiredBefore=structuredClone(expired);
 await assert.rejects(run(engine,expired,'world_field',{operation:'wildlife_release',target:unitId},'expired-return'),/held living fish/);
 assert.deepEqual(expired,expiredBefore);
 const returned=await run(engine,out.document,'world_field',{operation:'wildlife_release',target:unitId},'return-fish');
 assert.equal(returned.result.quantity,1);assert.equal(returned.document.state.inventory.item_live_fish?.quantity??0,0);
 assert.equal(returned.document.ledger.accounts[reserve],before.ledger.accounts[reserve]);
 assert.equal(returned.document.state.itemInstances[unitId].status,'已放归');
 assert.equal(isGone(engine,returned.document,unitId),true);assert.equal(isPhysicallyDead(engine,returned.document,unitId),false);
 for(const source of ['src:genesis|item_live_fish|population','src:birth|item_live_fish|population','src:regrowth|item_live_fish|population','sink:death|item_live_fish|population','sink:consume|item_live_fish|population'])assert.equal(returned.document.ledger.flows[source]??0,before.ledger.flows[source]??0);
 assert.deepEqual(reconcile(engine,returned.document).mismatches,[]);
 const stable=structuredClone(returned.document);
 await assert.rejects(run(engine,returned.document,'world_field',{operation:'wildlife_release',target:unitId},'return-twice'),/held living fish/);
 assert.deepEqual(returned.document,stable);
 // Individualizing the same species moves exactly one into its own account,
 // and returning that actual creature moves exactly one back. Neither is birth.
 // Tracking ability is not examined: this fixed native event rolls 10; +10
 // wisdom reaches 20 against difficulty10, without overriding any check.
 const tracked=await run(engine,returned.document,'world_field',{operation:'wildlife_track',species:unit.species},'wild-fish-contact');
 assert.equal(tracked.result.success,true);const actor=tracked.result.found.id,individual=`${actor}|item_live_fish|reserve`;
 assert.equal(tracked.document.ledger.accounts[individual],1);
 assert.equal(returned.document.ledger.accounts[reserve]-tracked.document.ledger.accounts[reserve],1);
 // A fish which has awakened is an individual person, not anonymous stock.
 // Declare awakening as non-examined; release must reject with no writes.
 const awakened=setup(engine,tracked.document,{facts:[{path:['state','creatures',actor],value:{...tracked.document.state.creatures[actor],mind:{...tracked.document.state.creatures[actor].mind,awakened:true}}}]}),awakenedBefore=structuredClone(awakened);
 await assert.rejects(run(engine,awakened,'world_field',{operation:'wildlife_release',target:actor},'awake-return'),/unowned living fish/);
 assert.deepEqual(awakened,awakenedBefore);
 const restored=await run(engine,tracked.document,'world_field',{operation:'wildlife_release',target:actor},'return-individual');
 assert.equal(restored.document.ledger.accounts[individual],0);assert.equal(restored.document.ledger.accounts[reserve],before.ledger.accounts[reserve]);
 assert.equal(restored.document.state.creatures[actor],undefined);
 assert.equal(isGone(engine,restored.document,actor),true);assert.equal(isPhysicallyDead(engine,restored.document,actor),false);
 assert.deepEqual(restored.document.ledger.flows,tracked.document.ledger.flows);
 assert.deepEqual(reconcile(engine,restored.document).mismatches,[]);
 // The other native outcome of that real encounter is death, not a transfer
 // of a living body to a treasury. HP/attack ability are non-examined setup.
 let fought=setup(engine,tracked.document,{facts:[
  {path:['state','creatures',actor,'hp'],value:1},
  {path:['state','player','hp'],value:100},
  {path:['state','player','maxHp'],value:100},
  {path:['state','player','attributes'],value:{...tracked.document.state.player.attributes,'力量':30}}
 ]});
 const liveBefore=fought.ledger.flows['sink:death|item_live_fish|individual']??0;
 for(let n=0;n<5&&fought.state.creatures[actor].hp>0;n++)fought=(await run(engine,fought,'world_combat',{target:actor,intent:'attack'},`fish-body-death:${n}`)).document;
 assert.equal(fought.state.creatures[actor].hp,0);assert.ok(fought.state.creatures[actor].corpse);
 assert.equal(fought.ledger.accounts[individual],0);
 assert.equal(fought.ledger.flows['sink:death|item_live_fish|individual']-liveBefore,1);
 assert.deepEqual(reconcile(engine,fought).mismatches,[]);
});

test('药草按累计工时取整，同一资源账户扣量，拆成30分钟不损失余数',async()=>{
 const engine=new WorldEngine(world),initial=engine.createCharacter(seed,{},'s505-herbs');
 let opening=setup(engine,initial,{location:'loc_hw_northwood'});
 opening=(await run(engine,opening,'world_field',{operation:'site_enter'},'enter')).document;
 const key='site:loc_hw_northwood:nw_herb|item_herb|reserve';
 assert.equal(opening.ledger.accounts[key],20);
 const long=await run(engine,opening,'world_field',{operation:'site_gather',target:'nw_herb',minutes:240},'long-herbs');
 let split=opening,quantity=0;
 for(let n=0;n<8;n++){
  const out=await run(engine,split,'world_field',{operation:'site_gather',target:'nw_herb',minutes:30},`herb:${n}`);
  split=out.document;quantity+=out.result.quantity;
 }
 // Published gather:herb = 20 plants/480-minute workday: 240 minutes = 10;
 // eight 30-minute shifts = 8 × 1.25 = 10, not 8 × floor(1.25) = 8.
 assert.equal(long.result.quantity,10);assert.equal(quantity,10);
 assert.equal(long.document.ledger.accounts[key],10);assert.equal(split.ledger.accounts[key],10);
 assert.equal(long.document.state.inventory.item_herb.quantity-(opening.state.inventory.item_herb?.quantity??0),10);
 const audit=reconcile(engine,split);assert.deepEqual(audit.mismatches,[]);assert.deepEqual(audit.drift,[]);
});

test('渔获派生槽的半份余数跨真实投饵累计，第二次才转移一条鱼',async()=>{
 const w=structuredClone(world),probe=new WorldEngine(w),initial=probe.createCharacter(seed,{},'s505-fish-half');
 const fish=w.monsters.filter(s=>s.wildlife&&creatureTraits(s).tags.includes('fish'));
 const habitat=w.rules.wildlife.habitats.find(h=>fish.some(s=>initial.state.records[`ecology:${h.id}`]?.populations[s.id]?.count>0));
 w.derived.modifiers.push({id:'half-fish',pack:'core',target:'economy:yield',stage:'mul',value:0.5,when:`subject == '${habitat.location}'`});
 const engine=new WorldEngine(w),rule=w.rules.extraction.fishing;
 const opening=setup(engine,initial,{location:habitat.location,inventory:{[rule.tool]:1,[rule.bait.item]:2,item_water:3},facts:[
  {path:['state','player','attributes'],value:{...initial.state.player.attributes,'敏捷':30}}
 ]});
 // 2 successful casts × (base 1 fish × yield .5) = 1 fish, after 2 bait.
 const first=await run(engine,opening,'world_field',{operation:'wildlife_fish'},'half-first');
 assert.equal(first.result.check.success,true);assert.equal(first.document.state.inventory.item_live_fish?.quantity??0,0);
 const second=await run(engine,first.document,'world_field',{operation:'wildlife_fish'},'half-two');
 assert.equal(second.result.check.success,true);assert.equal(second.document.state.inventory.item_live_fish.quantity,1);
 assert.equal(second.document.state.inventory[rule.bait.item]?.quantity??0,0);
 const key=`${habitat.location}|item_live_fish|reserve`;
 assert.equal(opening.ledger.accounts[key]-second.document.ledger.accounts[key],1);
 assert.deepEqual(reconcile(engine,second.document).mismatches,[]);
});

test('林木低年率的累计取整：30日一次与逐日账户完全相同',async()=>{
 const w=structuredClone(world);
 // Configure the existing forest producer with the published ancient-tree
 // annual rate, not a new location, item, test runtime, or mutable campaign yield.
 const annual=world.balance.ecology.rows.find(r=>r.key==='r:ancientTree').r;
 assert.equal(annual,0.01);
 w.rules.forestWater.forest.species.broadleaf.growthPerDay=annual/360;
 const engine=new WorldEngine(w),initial=engine.createCharacter(seed,{},'s505-ancient');
 const settlements=Object.fromEntries(Object.entries(initial.state.settlements).map(([id,s])=>[id,{...s,woodPerDay:0}]));
 const opening=setup(engine,initial,{location:'loc_hw_northwood',facts:[
  // Historical depletion and unrelated village woodcutters are non-examined.
  {path:['state','settlements'],value:settlements},
  {path:['state','records'],value:{...initial.state.records,'forest:loc_hw_northwood':{category:'forest',location:'loc_hw_northwood',initial:60000,reserve:30000,grown:0,harvested:30000,updatedAt:0}}}
 ]});
 const long=(await run(engine,opening,'world_time',{minutes:30*1440},'ancient-month')).document;
 let split=opening;
 for(let day=0;day<30;day++){
  split=(await run(engine,split,'world_time',{minutes:1440},`ancient:${day}`)).document;
  // D05 5.5: floor(60000/(1+exp(-.01/360)))=30000 after day 1.
  if(day===0)assert.equal(split.ledger.accounts['forest:loc_hw_northwood|item_wood|reserve'],30000);
 }
 // D05 5.5: floor(60000/(1+exp(-.01*30/360)))=30012, adding 12.
 const key='forest:loc_hw_northwood|item_wood|reserve';
 assert.equal(long.ledger.accounts[key],30012);assert.equal(split.ledger.accounts[key],30012);
 assert.equal(long.state.records['forest:loc_hw_northwood'].grown,12);
 assert.deepEqual(long.state.records['forest:loc_hw_northwood'],split.state.records['forest:loc_hw_northwood']);
 assert.deepEqual(reconcile(engine,split).mismatches,[]);
});

test('矿脉实际采得物从资源账户转移，失败与空矿不造矿石',async()=>{
 const engine=new WorldEngine(world),initial=engine.createCharacter(seed,{},'s505-mineral');
 const opening=setup(engine,initial,{location:'loc_wild_lq_adit',inventory:{item_mining_pick:1},facts:[
  // Non-examined strength 30 gives +10; native d20=7 totals 17 >= 15.
  {path:['state','player','attributes'],value:{...initial.state.player.attributes,'力量':30}}
 ]});
 const out=await run(engine,opening,'world_field',{operation:'site_mine'},'s505-dig');
 // Published earth deposit: 4 ore units. One successful native dig transfers 1,
 // so reserve is 4-1=3; recovery is 1 unit per 60 days (not a daily reset).
 assert.equal(out.result.success,true,JSON.stringify(out.result));assert.equal(out.result.obtained[0].quantity,1);assert.equal(out.result.reserve,3);
 const key='mineral:loc_wild_lq_adit:item_iron_ore|item_iron_ore|reserve';
 assert.equal(out.document.ledger.accounts[key],3);assert.equal(out.document.state.inventory.item_iron_ore.quantity,1);
 assert.deepEqual(reconcile(engine,out.document).mismatches,[]);
 const snapshot=structuredClone(opening);
 const noTool=setup(engine,initial,{location:'loc_wild_lq_adit',inventory:{item_mining_pick:0}}),before=structuredClone(noTool);
 await assert.rejects(run(engine,noTool,'world_field',{operation:'site_mine'},'missing-pick'),/工具/);
 assert.deepEqual(noTool,before);assert.deepEqual(opening,snapshot);
});

test('累计取整保留微量水损和十进制余数，期间乘法不提前取整',()=>{
 // W1: floor(30 × .99999969)=29, not 30 × floor(.99999969)=0.
 // Decimal .1 × 10 = 1 exactly; the decimal accumulator must not lose it.
 const a={},b={},tenths={};let daily=0,decimal=0;
 for(let n=0;n<30;n++)daily+=accrueStock(a,'water-adjusted-food',0.99999969);
 const long=accrueStock(b,'water-adjusted-food',0.99999969,30);
 for(let n=0;n<10;n++)decimal+=accrueStock(tenths,'fraction',0.1);
 assert.equal(daily,29);assert.equal(long,29);assert.equal(decimal,1);assert.deepEqual(a,b);
 const before=structuredClone(a);assert.throws(()=>accrueStock(a,'invalid',NaN),/无效/);assert.deepEqual(a,before);
});


test('ancient age class: native clock uses annual logistic growth without rounding drift',async()=>{
 const w=structuredClone(world);
 // loadWorld keeps authoritative balance metadata non-enumerable.
 Object.defineProperty(w,'balance',{value:world.balance});
 const engine=new WorldEngine(w),initial=engine.createCharacter(seed,{},'s505-oldwood');
 const settlements=Object.fromEntries(Object.entries(initial.state.settlements).map(([id,s])=>[id,{...s,woodPerDay:0}]));
 const record='forest:loc_hw_northwood',account='forest:loc_hw_northwood|item_wood|reserve';
 const opening=setup(engine,initial,{location:'loc_hw_northwood',facts:[
  // Historical age mix and unrelated village cutters are not under examination.
  {path:['state','settlements'],value:settlements},
  {path:['state','records'],value:{...initial.state.records,[record]:{
   category:'forest',location:'loc_hw_northwood',initial:60000,reserve:57000,grown:0,harvested:3000,updatedAt:0,
   ancient:{initial:6000,reserve:3000,grown:0,harvested:3000}
  }}}
 ]});
 // D05 5.5: K_old=60000*(6000/60000)=6000, opening old N=3000.
 // r=.01/year; N(t)=6000/(1+exp(-.01*t/360)).
 // Day 1: 3000.041666... -> 3000; day 30: 3001.249999... -> 3001.
 // Ordinary stock is full at 54000; aggregate at day 30 is 54000+3001=57001.
 const long=(await run(engine,opening,'world_time',{minutes:30*1440},'old-month')).document;
 let split=opening;
 for(let day=0;day<30;day++){
  split=(await run(engine,split,'world_time',{minutes:1440},`old:${day}`)).document;
  if(day===0)assert.equal(split.state.records[record].ancient.reserve,3000);
 }
 assert.equal(long.ledger.accounts[account],57001);assert.equal(split.ledger.accounts[account],57001);
 assert.equal(long.state.records[record].ancient.grown,1);
 assert.deepEqual(long.state.records[record],split.state.records[record]);
 // At day 360: 6000/(1+exp(-.01))=3014.999875... -> 3014 old,
 // plus 54000 ordinary = 57014. This native read projection must be pure.
 const snapshot=structuredClone(opening);
 assert.equal(forestView(engine,{...opening.state,minute:360*1440},'loc_hw_northwood').reserve,57014);
 assert.deepEqual(opening,snapshot);
 assert.deepEqual(reconcile(engine,split).mismatches,[]);
});


test('rational workday conversion preserves fifteen native 32-minute shifts',async()=>{
 const engine=new WorldEngine(world),initial=engine.createCharacter(seed,{},'s505-herb-thirds');
 let opening=setup(engine,initial,{location:'loc_hw_northwood'});
 opening=(await run(engine,opening,'world_field',{operation:'site_enter'},'enter-thirds')).document;
 const long=await run(engine,opening,'world_field',{operation:'site_gather',target:'nw_herb',minutes:480},'whole-day');
 let split=opening,quantity=0;
 for(let n=0;n<15;n++){
  const out=await run(engine,split,'world_field',{operation:'site_gather',target:'nw_herb',minutes:32},`third:${n}`);
  split=out.document;quantity+=out.result.quantity;
 }
 // Published 20 plants/workday, workday=480 minutes. 32*15=480;
 // 20*32*15/480=20 exactly. Flooring rounded binary 4/3 would lose one.
 const key='site:loc_hw_northwood:nw_herb|item_herb|reserve';
 assert.equal(long.result.quantity,20);assert.equal(quantity,20);
 assert.equal(long.document.ledger.accounts[key],0);assert.equal(split.ledger.accounts[key],0);
 assert.equal(split.state.inventory.item_herb.quantity-(opening.state.inventory.item_herb?.quantity??0),20);
 assert.deepEqual(reconcile(engine,split).mismatches,[]);
});


test('ancient wood harvest debits its subset and the same resource account',async()=>{
 const engine=new WorldEngine(world),initial=engine.createCharacter(seed,{},'s505-old-harvest');
 const record='forest:loc_hw_northwood',account='forest:loc_hw_northwood|item_wood|reserve';
 const opening=setup(engine,initial,{location:'loc_hw_northwood',inventory:{item_singlebit_axe:1},facts:[
  // Tool eligibility is not examined: the published silver axe requires level 20.
  {path:['state','player','level'],value:20},
  {path:['state','player','attributes'],value:{...initial.state.player.attributes,'力量':30}},
  // Prior depletion is not examined: all 54000 ordinary units and 3000 old
  // units were harvested. The remaining 3000 units are the ancient subset.
  {path:['state','records'],value:{...initial.state.records,[record]:{
   category:'forest',location:'loc_hw_northwood',initial:60000,reserve:3000,grown:0,harvested:57000,updatedAt:0,
   ancient:{initial:6000,reserve:3000,grown:0,harvested:3000}
  }}}
 ]});
 const out=await run(engine,opening,'world_field',{operation:'site_woodcut',quantity:2},'old-cut');
 // Before midnight no whole ancient unit regrows: floor(N(t)) remains 3000.
 // Cutting 2 gives reserve 2998, old harvested 3002, aggregate harvested 57002.
 assert.equal(out.result.success,true,JSON.stringify(out.result));assert.equal(out.result.obtained[0].quantity,2);
 assert.equal(out.document.ledger.accounts[account],2998);
 assert.equal(out.document.state.records[record].ancient.reserve,2998);
 assert.equal(out.document.state.records[record].ancient.harvested,3002);
 assert.equal(out.document.state.records[record].harvested,57002);
 assert.equal(out.document.state.inventory.item_wood.quantity-(opening.state.inventory.item_wood?.quantity??0),2);
 assert.deepEqual(reconcile(engine,out.document).mismatches,[]);
});

test('native mineral, herb and ordinary forest regeneration use the same closed anchors for 30 daily steps',async()=>{
 const w=structuredClone(world);
 // D05 §5.5 / S5-06: live controls now compress K. This S5-05 case examines
 // the published K60 closed growth anchor, not territory suppression. Declare
 // that premise via the production slot; retain every 33-fish/3-birth assertion.
 w.derived.modifiers.push({id:'regeneration-capacity-premise',pack:'core',target:'ecology:territoryCapacity',stage:'max',value:1,when:"subject == 'loc_hw_dock'"});
 const engine=new WorldEngine(w),initial=engine.createCharacter(seed,{},'s505-regeneration');
 const herb='site:site_root_hollow',mineral='mineral:loc_wild_lq_adit:item_iron_ore',forest='forest:loc_hw_northwood';
 const water=world.rules.wildlife.habitats.find(h=>h.id==='habitat_hw_water'),ecology=`ecology:${water.id}`,perch='monster_black_fin_perch';
 const opening=setup(engine,initial,{location:'loc_capital',facts:[
  // Historical depletion, continuous growth before this observation, entrance
  // clearance and village woodcutters are not being examined. No new content.
  {path:['state','settlements'],value:Object.fromEntries(Object.entries(initial.state.settlements).map(([id,s])=>[id,{...s,woodPerDay:0}]))},
  {path:['state','records'],value:{...initial.state.records,
   // Other species' predation is not examined: historical removal is declared
   // with the existing withdrawal counter. Keep the real perch's published 30.
   [ecology]:{...initial.state.records[ecology],populations:Object.fromEntries(Object.entries(initial.state.records[ecology].populations).map(([id,p])=>[id,id===perch?p:{...p,withdrawn:p.withdrawn+p.count,count:0}]))},
   [herb]:{category:'site',site:'site_root_hollow',remaining:{rh_herb:1,rh_sand_take:3},mechanisms:{rh_roots:{status:'已解除'}},changes:{rh_regrow:0},growthAnchors:{rh_regrow:{minute:-60*1440,reserve:1,capacity:3,rate:1/60}}},
   [mineral]:{category:'mineral',location:'loc_wild_lq_adit',item:'item_iron_ore',initial:4,reserve:1,extracted:3,recovered:0,updatedAt:0,growthAnchors:{mineral:{minute:-250*1440,reserve:1,capacity:4,rate:1/240}}},
   [forest]:{category:'forest',location:'loc_hw_northwood',initial:60000,reserve:33000,harvested:27000,grown:0,updatedAt:0,ancient:{initial:6000,reserve:6000,grown:0,harvested:0}}
  }}
 ]});
 const long=(await run(engine,opening,'world_time',{minutes:30*1440},'resources-month')).document;
 let split=opening;for(let day=0;day<30;day++)split=(await run(engine,split,'world_time',{minutes:1440},`resources:${day}`)).document;
 // D05 5.5, published root-hollow: K=3,quantity=1,everyDays=20,
 // r=1/(3*20)=1/60. After 60+30 days, floor(3/(1+2*exp(-90/60)))=2.
 // Ore K=4,amount=1/60 days -> r=1/240. After 250+30 days,
 // floor(4/(1+3*exp(-280/240)))=2. Both grow from 1 to 2, sourcing 1.
 // Ordinary forest K=54000,N=27000,r=.0008: day30 floor=27323;
 // old stock remains full at6000, so aggregate reserve=33323, growth=323.
 // Perch N=30,K=60,recovery=3/week: r=3/(60*7)=1/140 per day.
 // floor(60/(1+exp(-30/140)))=33; exactly 3 real births, not 4*3=12.
 for(const doc of [long,split]){
  assert.equal(doc.ledger.accounts['site:site_root_hollow:rh_herb|item_herb|reserve'],2);
  assert.equal(doc.ledger.accounts['mineral:loc_wild_lq_adit:item_iron_ore|item_iron_ore|reserve'],2);
  assert.equal(doc.ledger.accounts['forest:loc_hw_northwood|item_wood|reserve'],33323);
  assert.equal(doc.state.records[mineral].recovered,1);assert.equal(doc.state.records[forest].grown,323);
  assert.equal(doc.state.records[ecology].populations[perch].count,33);
  assert.equal(doc.state.records[ecology].populations[perch].born,3);
  assert.equal(doc.ledger.accounts[`${water.location}|item_live_fish|reserve`],33);
  assert.equal((doc.ledger.flows['src:regrowth|item_herb|site']??0)-(opening.ledger.flows['src:regrowth|item_herb|site']??0),1);
  assert.equal((doc.ledger.flows['src:regrowth|item_iron_ore|mineral']??0)-(opening.ledger.flows['src:regrowth|item_iron_ore|mineral']??0),1);
 }
 for(const id of [herb,mineral,forest,ecology])assert.deepEqual(long.state.records[id],split.state.records[id]);
 assert.deepEqual(long.ledger.accounts,split.ledger.accounts);assert.deepEqual(long.ledger.flows,split.ledger.flows);
 assert.deepEqual(reconcile(engine,split).mismatches,[]);
});
