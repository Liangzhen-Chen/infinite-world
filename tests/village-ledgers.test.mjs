// 注意（合入顺序）：本文件的新期望（登记里不再有公共仓期初粮食，approvedProfiles 经修订回执取代）是“INITFOOD 修订批发布后才成立”的状态；
// 发布前会红是预期的。它与发布提交（world/drafts/initfood/ 整个目录、settlements.json 的删除）一起进入 master，不改断言。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {validateWorld} from '../tools/validate-world.mjs';
import {approvedProfiles} from '../tools/w1-village-profiles-content.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {advanceAgriculture,agricultureView} from '../server-plugin/agriculture.mjs';
import {planAgricultureMigration} from '../server-plugin/agriculture-migration.mjs';
import {planWorldUpgrade,compatibleWorld} from '../server-plugin/world-upgrade.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {toolDefinitions,modelToolCall} from '../extension/tools.mjs';
const world=await loadWorld(),profiles=await approvedProfiles({world}),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json'));
const configs=world.rules.agriculture.settlements.filter(p=>p.opening);
// 开局存粮 = 开局日目标持有，按规律手推：min(ceil(人口 × (距下次收获 + reserveDays)), 容量 − 种粮)；距下次收获 = sowDays[1] + growthDays（开局日 0）。
const ruleOpeningFood=(engine,p,population)=>{const crop=engine.rules.agriculture.crop;return Math.min(Math.ceil(population*(crop.sowDays[1]+crop.growthDays+p.reserveDays)),p.granaryCapacity-p.initialSeed);};
function setup(){
 const isolated=structuredClone(world);for(const n of isolated.npcs){delete n.schedule;delete n.tier;}
 const engine=new WorldEngine(isolated),doc=engine.createCharacter(legacy,{},'village-ledgers');doc.state.player.coins=1000;
 const run=async(c,args,eventId,tool='world_field')=>{const out=await engine.reduce(c,{tool,args,eventId});return{document:applyPatches(c,out.patches),result:out.result,patches:out.patches};};
 return{engine,doc,run};
}
function record(doc,id){return doc.state.records[`agriculture:${id}`];}
function conservation(doc,id){
 const r=record(doc,id),s=doc.state.settlements[id],l=r.ledger;
 assert.equal(r.batches.reduce((n,b)=>n+b.amount,0),s.food);
 assert.equal(r.field.seedBatches.reduce((n,b)=>n+b.amount,0),r.field.seedBank);
 assert.equal(l.openingFood+l.openingSeed+l.freshProduced+l.harvested+l.donated+l.seedDonated,s.food+r.field.seedBank+l.eaten+l.spoiled+l.overflow+l.seedSpent+l.sold);
 assert.ok(s.food+r.field.seedBank<=r.granary.capacity);
}
function totalCash(doc){return doc.state.player.coins+Object.values(doc.state.settlements).reduce((n,s)=>n+s.treasury,0)+Object.values(doc.state.npcs).reduce((n,p)=>n+p.coins,0);}
function at(doc,p){doc.state.location=p.counter;doc.state.minute=540;doc.state.npcs[p.manager].location=p.counter;doc.state.npcs[p.manager].status='正常';doc.state.npcs[p.manager].activity='办公';}
function tradeArgs(p,phase='pickup'){return{operation:'farm_settle_trade',contract:p.tradeContract.id,phase,authority:p.manager};}
test('四村年粮守恒，产量单位与周期有来源，期初不冒充期末',()=>{
 const{engine,doc}=setup();assert.equal(validateWorld(world,{stage:'release'}).ok,true);
 assert.equal(configs.length,4);
 const d={document:doc,get(...keys){return keys.reduce((value,key)=>value?.[key],doc);},set(keys,value){const target=keys.slice(0,-1).reduce((value,key)=>value[key],doc);target[keys.at(-1)]=value;}};
 // 登记里不再手填公共仓期初粮食；开局存粮 = 开局日目标持有，按规律手推：min(ceil(人口 × (距下次收获 + reserveDays)), 容量 − 种粮)，
 // 距下次收获 = sowDays[1] + growthDays（开局日 0），餐口按人口（同一物种构成）。例：榆坡 80 人 × (25+180+90) = 23600，容量 50000 − 种粮 2160 未受限。
 for(const p of configs){const detail=profiles.find(d=>d.id===p.settlement);
  assert.equal(detail.economy.publicStock.food,undefined);
  assert.equal(doc.state.settlements[p.settlement].food,ruleOpeningFood(engine,p,detail.population));assert.equal(detail.economy.production[0].cycleDays,360);assert.equal(detail.economy.production[0].unitKg,.5);assert.equal(detail.economy.publicStock.closing,null);conservation(doc,p.settlement);}
 for(let day=0;day<360;day++){doc.state.minute=day*1440;for(const p of configs){const out=advanceAgriculture(d,engine,p.settlement,doc.state.settlements[p.settlement],day);doc.state.settlements[p.settlement]=out.settlement;doc.state.settlements[p.settlement].wood+=out.woodProduced;conservation(doc,p.settlement);}}
 // 农事账的开局存粮就是开局日目标持有（initialFood 已删，不再有写死的开局存量）：按同一条规律手推。
 for(const p of configs){assert.ok(record(doc,p.settlement).ledger.harvested>0);assert.equal(record(doc,p.settlement).lastDay,359);assert.equal(record(doc,p.settlement).ledger.openingFood,ruleOpeningFood(engine,p,profiles.find(d=>d.id===p.settlement).population));assert.throws(()=>advanceAgriculture(d,engine,p.settlement,doc.state.settlements[p.settlement],359),/日结顺序/);}
});
test('四村粮约经过真实路线两端交割；在途预款和税款分开，粮钱双方守恒且重放幂等',async()=>{
 for(const p of configs){
  const{engine,doc,run}=setup(),buyer=configs.find(row=>row.settlement===p.tradeContract.buyer);at(doc,p);
  const startCash=totalCash(doc),playerCash=doc.state.player.coins,sourceFood=doc.state.settlements[p.settlement].food,buyerFood=doc.state.settlements[buyer.settlement].food;
  const before=structuredClone(doc),pickup=await run(doc,tradeArgs(p),'pickup');assert.deepEqual(doc,before);
  assert.deepEqual(await run(doc,tradeArgs(p),'pickup'),pickup);
  let c=pickup.document;assert.equal(totalCash(c),startCash);assert.equal(c.state.settlements[p.settlement].food,sourceFood-20);assert.equal(c.state.inventory.item_oats.quantity,20);
  const key=`village-trade:${p.tradeContract.id}`,fiscalKey=`village-fiscal:${p.settlement}`;
  assert.equal(c.state.records[key].status,'in-transit');assert.equal(c.state.records[key].paidCopper,0);assert.equal(c.state.records[key].prepaidCopper,60);assert.equal(c.state.records[key].taxCopper,0);assert.equal(c.state.records[fiscalKey].salesGrossCopper,0);assert.equal(c.state.records[fiscalKey].taxReceiptsCopper,0);
  assert.deepEqual((await run(c,tradeArgs(p),'pickup-again')).document,c);assert.deepEqual(applyPatches(c,pickup.patches),c);
  const startDay=c.state.records[key].batches[0].expiresDay;
  for(const destination of [p.settlement,'loc_bs',buyer.settlement,buyer.counter])c=(await run(c,{destination},`walk-${destination}`,'world_move')).document;
  c.state.npcs[buyer.manager].location=buyer.counter;c.state.npcs[buyer.manager].status='正常';c.state.npcs[buyer.manager].activity='办公';
  const delivered=await run(c,{...tradeArgs(p,'deliver'),authority:buyer.manager},'deliver');c=delivered.document;
  assert.equal(totalCash(c),startCash);assert.equal(c.state.player.coins,playerCash);assert.equal(c.state.settlements[buyer.settlement].food,buyerFood+20);assert.equal(c.state.inventory.item_oats?.quantity??0,0);
  assert.equal(c.state.records[key].status,'delivered');assert.equal(c.state.records[key].paidCopper,60);assert.equal(c.state.records[key].receivedCopper,60);assert.equal(c.state.records[key].prepaidCopper,0);assert.equal(c.state.records[key].taxCopper,3);
  assert.equal(c.state.records[fiscalKey].advanceCopper,0);assert.equal(c.state.records[fiscalKey].salesNetCopper+c.state.records[fiscalKey].taxReceiptsCopper,c.state.records[fiscalKey].salesGrossCopper);
  assert.equal(c.state.records[`village-fiscal:${buyer.settlement}`].purchasesCopper,60);assert.equal(c.state.records[fiscalKey].exportedFood,c.state.records[`village-fiscal:${buyer.settlement}`].importedFood);
  assert.equal(record(c,buyer.settlement).batches.at(-1).expiresDay,startDay);conservation(c,p.settlement);conservation(c,buyer.settlement);
  assert.deepEqual((await run(c,{...tradeArgs(p,'deliver'),authority:buyer.manager},'deliver-again')).document,c);assert.deepEqual(applyPatches(c,delivered.patches),c);
  assert.equal(agricultureView(engine,c).contracts.find(row=>row.id===p.tradeContract.id).settlement.status,'delivered');
 }
});
test('无权协调者、缺席官员、假合同、隔空收货及缺真实货钱均拒绝且不改输入',async()=>{
 const{doc,run}=setup(),p=configs[0],buyer=configs.find(row=>row.settlement===p.tradeContract.buyer);at(doc,p);const normal=profiles[0].governance.coordinators[1];doc.state.npcs[normal].location=p.counter;
 for(const [edit,args,pattern] of [
  [()=>{}, {...tradeArgs(p),authority:normal},/税章权限/],
  [c=>c.state.npcs[p.manager].location=p.settlement,tradeArgs(p),/在场/],
  [()=>{},{...tradeArgs(p),contract:'invented'},/未登记/],
  [()=>{},tradeArgs(p,'deliver'),/本阶段/],
  [c=>c.state.player.coins=0,tradeArgs(p),/实际支付/],
  [c=>{c.state.settlements[p.settlement].food=0;record(c,p.settlement).batches=[];},tradeArgs(p),/实际可出口/]
 ]){const c=structuredClone(doc);edit(c);const before=structuredClone(c);await assert.rejects(run(c,args,'refused'),pattern);assert.deepEqual(c,before);}
 let c=(await run(doc,tradeArgs(p),'pickup')).document;c.state.location=buyer.counter;c.state.npcs[buyer.manager].location=buyer.counter;
 const noCargo=structuredClone(c);delete noCargo.state.inventory.item_oats;await assert.rejects(run(noCargo,{...tradeArgs(p,'deliver'),authority:buyer.manager},'no-cargo'),/携带粮物不足/);
 const badLedger=structuredClone(c);badLedger.state.records[`village-fiscal:${p.settlement}`].advanceCopper++;await assert.rejects(run(badLedger,{...tradeArgs(p,'deliver'),authority:buyer.manager},'bad-ledger'),/不守恒/);
 const noCash=structuredClone(c);noCash.state.settlements[buyer.settlement].treasury=0;await assert.rejects(run(noCash,{...tradeArgs(p,'deliver'),authority:buyer.manager},'no-cash'),/实际铜钱/);
});
test('本村法典不能把普通协调者授予搜查权，官方必须在场且不得跨区',async()=>{
 const{doc,run}=setup(),p=configs[0],d=profiles[0],normal=d.governance.coordinators[1],officer=d.governance.enforcers[0],code=world.rules.law.codes.find(c=>c.id===d.governance.appointment.lawCode);at(doc,p);
 doc.state.npcs[normal].location=p.counter;doc.state.npcs[officer].location=p.counter;
 // U5后非玩家被告的案件只能接赏缉拿；搜查的对象是玩家本人，本例核对的是搜查者资格。
 doc.state.records['case-village']={category:'legal_case',id:'case-village',law:code.id,reported:true,status:'已报案',offender:'player',evidence:[]};
 const before=structuredClone(doc);await assert.rejects(run(doc,{operation:'search',case:'case-village',authority:normal},'unauthorized','world_law'),/资格/);assert.deepEqual(doc,before);
 const absent=structuredClone(doc);absent.state.npcs[officer].location=p.settlement;await assert.rejects(run(absent,{operation:'search',case:'case-village',authority:officer},'absent','world_law'),/不在场/);
 assert.equal(code.locations.includes('loc_bs'),false);
});
test('旧测试档升级及重复重放不追加四村粮钱；耗尽公共仓保留，源开局不重复补给',()=>{
 const{engine,doc}=setup();const old=engine.initialFromLegacy(legacy,'old',{prepare:false});old.state.settlements.loc_hw.food=0;old.state.settlements.loc_hw.treasury=0;old.state.player.coins=17;const before=structuredClone(old);
 const patches=planAgricultureMigration(old,world.rules),after=applyPatches(old,patches);assert.deepEqual(old,before);assert.deepEqual(after.state.settlements,old.state.settlements);assert.equal(after.state.player.coins,17);assert.deepEqual(planAgricultureMigration(after,world.rules),[]);assert.deepEqual(applyPatches(after,patches),after);
 for(const p of configs){assert.equal(after.state.settlements[p.settlement],undefined);assert.equal(after.state.records[`agriculture:${p.settlement}`],undefined);}
 const spent=structuredClone(doc);for(const p of configs){spent.state.settlements[p.settlement].food=0;record(spent,p.settlement).batches=[];spent.state.settlements[p.settlement].treasury=0;}
 const incoming=compatibleWorld(world,world).world,plan=planWorldUpgrade(spent,world,incoming,{worldHash:'ledger-repeat',eventId:'upgrade'});const upgraded=applyPatches(spent,plan.patches);assert.deepEqual(upgraded.state.settlements,spent.state.settlements);assert.deepEqual(applyPatches(upgraded,plan.patches),upgraded);
});
test('严格schema和L1拒绝null账、无期末来源、错单位、错税率、未审核权限及运行规则篡改',()=>{
 for(const mutate of [p=>p.economy.production=null,p=>p.economy.publicStock.closing={food:99999},p=>p.economy.production[0].unitKg=1,p=>p.economy.tax.rateBps=9999,p=>p.governance.head=p.governance.coordinators[1]]){
  const bad=structuredClone(world);mutate(bad.settlementProfiles.find(p=>p.details).details);assert.equal(validateWorld(bad,{stage:'release'}).ok,false);
 }
 // 负例：运行农事规则与审核开局账不符（initialFood 已删，改动仍在的 initialSeed；开局账登记同一个种粮）。
 const bad=structuredClone(world);bad.rules.agriculture.settlements.find(p=>p.opening).initialSeed++;assert.equal(validateWorld(bad,{stage:'release'}).ok,false);
 const tools=toolDefinitions();assert.equal(tools.length,27);assert.equal(modelToolCall('world_farm',{operation:'settle_trade'}).args.operation,'farm_settle_trade');
});
