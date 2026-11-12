// Explicit allow-list: author rumor seeds/truth, hidden places and proposed
// solutions stay private. Registered contracts retain their settlement status.
import {placeView,personName} from './entity-view.mjs';
import {beginHouseholdReads} from './npc-state.mjs';
import {openingStockFood} from './farm-target.mjs';
import {worldEntityRows} from './world-entities.mjs';
function settlementReader(world,document){
 // byId 与 WorldEngine 同一份实体全集（含 monsters 等物种表），开局存粮的餐口按物种代谢推导才与运行时一致。
 const engine={world,rules:world.rules,byId:new Map([...worldEntityRows(world),...Object.values(document?.state.created??{})].map(e=>[e.id,e]))};
 engine.advanceHouseholds=beginHouseholdReads(engine);return engine;
}
const pick=(row,keys)=>Object.fromEntries(keys.filter(key=>row?.[key]!==undefined).map(key=>[key,structuredClone(row[key])]));
export function publicSettlement(world,id,document=null,reader=null){
 const p=world.settlementProfiles?.find(p=>p.id===id),d=p?.details;if(!p)return null;
 // An authored settlement publishes a public entry only with its reviewed
 // details; a settlement generated at runtime (remote county, tribal site) has
 // no authored prose and shows its derived population and governance instead.
 if(!d&&!p.generated)return null;
 const engine=reader??settlementReader(world,document);
 const name=id=>personName(engine,document?.state??{},id).value??engine.byId.get(id)?.name??id;
 const currentView=document?placeView(engine,document.state,id):null;
 if(!d)return {id,name:name(id),population:currentView?.population.population.value??p.population,householdCount:currentView?.population.householdCount.value??p.householdCount,
  governance:{head:currentView?.government.head.value?{id:currentView.government.head.value,name:name(currentView.government.head.value)}:null,permissions:{head:currentView?.government.powers.value??[]}}};
 const person=id=>({id,name:name(id)}),e=d.economy,g=d.governance,foodUnitKg=world.rules?.agriculture?.foodUnitKg;
 // 公共仓期初粮食不再手填进世界数据：登记里没有 food 时，按运行时同一条目标持有规律推导；登记了就照登记（旧数据）。
 // “期初库存”按世界定义在登记日计算（openingStockFood：登记人口、基础容量、开局种粮），不读存档当前状态：无存档视图也有此项，游戏进行中数字不随人口变动。
 const farmProfile=world.rules?.agriculture?.settlements?.find(s=>s.settlement===id);
 const withOpeningFood=stock=>{if(stock.food===undefined&&farmProfile&&stock.openingDay!==undefined)stock.food=openingStockFood(engine,farmProfile,stock.openingDay);return stock;};
 const economy={status:e.status,source:e.source,period:pick(e.period,['startDay','endDay','status','calendar']),
  units:{food:'粮单位',foodUnitKg,seed:'粮单位',treasury:'铜币',wood:'木料单位',iron:'铁料单位'},
  production:(e.production??[]).map(row=>pick(row,['name','location','item','areaHa','quantity','unit','unitKg','cycleDays','seasonFactors','status','source'])),
  publicStock:withOpeningFood(pick(e.publicStock,['openingDay','food','seed','treasuryCopper','wood','iron','source','closing','closingReason'])),
  priceFactor:pick(e.priceFactor,['region','transport','season','shop','source']),
  tax:pick(e.tax,['basis','rateBps','collector','recipient','openingReceiptsCopper','source','note']),
  tradePartners:[...e.tradePartners??[]],tradeContracts:(e.tradeContracts??[]).map(row=>({...pick(row,['id','seller','buyer','item','quantity','unitPriceCopper','taxBps','status','source','deliveryDays']),unit:'粮单位',unitKg:foodUnitKg})),
  tradeLedger:pick(e.tradeLedger,['openingPaidCopper','openingReceivedCopper','openingExportedFood','openingImportedFood','status','source'])};
 const current=document?.state?.settlements?.[id],records=document?.state?.records??{},farm=records[`agriculture:${id}`];
 if(current){economy.currentStock={asOfMinute:document.state.minute,lastSettlementDay:farm?.lastDay??null,food:current.food,seed:farm?.field?.seedBank??null,treasuryCopper:current.treasury,wood:current.wood,iron:current.iron,note:'当前账面数量；期初登记和潜在产量不等于可领取库存。'};
  economy.currentFiscal={asOfMinute:document.state.minute,...pick(records[`village-fiscal:${id}`],['salesGrossCopper','salesNetCopper','taxReceiptsCopper','advanceCopper','purchasesCopper','exportedFood','importedFood'])};
  for(const contract of economy.tradeContracts){const actual=records[`village-trade:${contract.id}`];if(actual)contract.settlement={asOfMinute:document.state.minute,...pick(actual,['status','prepaidCopper','paidCopper','receivedCopper','taxCopper'])};}
 }
 const government=currentView?.government,head=government?government.head.value:g.head;
 return {id:p.id,name:d.name,population:currentView?.population.population.value??p.population,householdCount:currentView?.population.householdCount.value??p.householdCount,terrain:d.terrain,climate:d.climate,
  industries:[...e.industries],economy,coordination:{people:g.coordinators.map(person),place:g.meetingPlace,meeting:g.meeting,customs:[...g.customs],authority:g.authority},
  governance:{head:head?person(head):null,enforcers:(government?.enforcers.value??g.enforcers??[]).map(person),appointment:pick(government?.appointment.value??g.appointment,['source','effectiveDay','lawCode','appointedAt','until']),jurisdiction:[...g.jurisdiction??[]],
   permissions:{head:government?.powers.value??[...g.permissions?.head??[]],enforcers:[...g.permissions?.enforcers??[]],coordinators:[...g.permissions?.coordinators??[]]},limits:[...g.limits??[]],referral:pick(g.referral,['institution','location','matters','status','note'])},
  issues:d.problems.map(p=>({id:p.id,title:p.title,location:p.location,status:'有待当事人协商；查到资料不代表此刻都在现场',people:p.stakeholders.map(s=>({id:s.person,name:name(s.person),position:s.position}))})),
  market:{days:[...d.calendar.marketDays],location:d.calendar.marketLocation},
  festivals:d.calendar.festivals.map(f=>({name:f.name,month:f.month,day:f.day,location:f.location,practice:f.practice,note:'当地节俗；当天是否举办和谁来参与须向在场者核实。'}))};
}
// Only the public view supplies search text. Author rumors and proposals never
// become search records; acquired claims remain in actual chat/memory entries.
export function publicSettlementEntries(world,document=null,profiles=world.settlementProfiles){
 const reader=document?settlementReader(world,document):null;
 const rows=[],name=id=>world.locations.find(row=>row.id===id)?.name??world.npcs.find(row=>row.id===id)?.name??id;
 for(const profile of profiles??[]){if(!profile.details)continue;const p=publicSettlement(world,profile.id,document,reader);if(!p?.economy)continue;
  const add=(key,text,keywords=[])=>rows.push({id:`settlement_${p.id}_${key}`,scope:p.id,entities:[p.id],source:'公开聚落资料',text:`${p.name}：${text}`,keywords:[p.name,...keywords]});
  add('industries',`地方产业：${p.industries.join('；')}。地形：${p.terrain}；气候：${p.climate}`,['产业']);
  for(const [i,r]of p.economy.production.entries())add(`production_${i}`,`生产登记：${r.name}，潜在产量${r.quantity}${r.unit}／${r.cycleDays}日${r.unitKg?`，每粮单位${r.unitKg}千克`:''}；${r.areaHa?`田地${r.areaHa}公顷；`:''}实际产量受天气、劳力和仓储影响，登记值尚未成为库存。`,['生产','产量','收成','年粮']);
  const stock=p.economy.publicStock,u=p.economy.units;
  if(stock.openingDay!==undefined)add('opening',`公共仓期初库存，第${stock.openingDay}日登记：粮食${stock.food}粮单位，种粮${stock.seed}粮单位，每粮单位${u.foodUnitKg}千克，公款${stock.treasuryCopper}铜币，木料${stock.wood}木料单位，铁料${stock.iron}铁料单位；登记期第${p.economy.period.startDay}至${p.economy.period.endDay}日，期末尚未结算。`,['库存','粮仓','期初']);
  if(p.economy.currentStock){const c=p.economy.currentStock;add('current',`当前公共仓账面库存，时点第${c.asOfMinute}分钟，农事最后结算日${c.lastSettlementDay??'未登记'}：粮食${c.food}粮单位，种粮${c.seed??'未登记'}粮单位，每粮单位${u.foodUnitKg}千克，公款${c.treasuryCopper}铜币，木料${c.wood}木料单位，铁料${c.iron}铁料单位。${c.note}`,['库存','结算','粮仓']);}
  const tax=p.economy.tax;if(tax.rateBps!==undefined)add('tax',`税章：${tax.basis}，税率${tax.rateBps/100}%，收税登记人${name(tax.collector)}，归属${name(tax.recipient)}；期初实收${tax.openingReceiptsCopper}铜币。${tax.note}${p.economy.currentFiscal?.taxReceiptsCopper!==undefined?`当前第${p.economy.currentFiscal.asOfMinute}分钟实收税款${p.economy.currentFiscal.taxReceiptsCopper}铜币。`:''}`,['税款','征税','税率']);
  const price=p.economy.priceFactor;if(price.region!==undefined)add('price',`公共粮约价格系数：地区${price.region}，运输${price.transport}，季节${price.season}，商店${price.shop}。${price.source}`,['价格','系数','运价']);
  const ledger=p.economy.tradeLedger;if(ledger.openingPaidCopper!==undefined)add('tradeLedger',`公共贸易期初账：实付${ledger.openingPaidCopper}铜币，实收${ledger.openingReceivedCopper}铜币，出口${ledger.openingExportedFood}粮单位，进口${ledger.openingImportedFood}粮单位；${ledger.source}。登记来源：${p.economy.source}。`,['贸易','期初','收付','进口','出口']);
  for(const [i,c]of p.economy.tradeContracts.entries())add(`trade_${i}`,`公共粮食贸易合同：${name(c.seller)}向${name(c.buyer)}约定${c.quantity}${c.unit}，每粮单位${c.unitKg}千克，单价${c.unitPriceCopper}铜币，交货期${c.deliveryDays}日；开局未履约，提粮与送达分阶段结算，约定不等于已交割。${c.settlement?`当前第${c.settlement.asOfMinute}分钟状态${c.settlement.status}，预付${c.settlement.prepaidCopper??0}铜币，实付${c.settlement.paidCopper??0}铜币，实收${c.settlement.receivedCopper??0}铜币，实收税${c.settlement.taxCopper??0}铜币。`:''}`,['贸易','粮约','交割']);
  add('governance',`村级治理权限：头人${p.governance.head?.name??'未登记'}；执法者${p.governance.enforcers.map(r=>r.name).join('、')}。${p.coordination.authority}头人权限：${p.governance.permissions.head.join('；')}；执法权限：${p.governance.permissions.enforcers.join('；')}；协调者权限：${p.governance.permissions.coordinators.join('；')}。执法区域：${p.governance.jurisdiction.map(name).join('、')}。${p.governance.limits.join('；')}。转交：${p.governance.referral.institution??'未登记'}，${p.governance.referral.matters?.join('；')??''}。${p.governance.referral.note??''}任命生效第${p.governance.appointment.effectiveDay??'未登记'}日，来源${p.governance.appointment.source??'未登记'}。`,['治理','搜查','拘押','协调','申诉']);
  for(const issue of p.issues)add(`issue_${issue.id}`,`地方问题：${issue.title}，地点${name(issue.location)}；当事人立场：${issue.people.map(r=>`${r.name}：${r.position}`).join('；')}。${issue.status}。`,['地方问题','争议']);
  add('market',`集市集日：每月${p.market.days.join('、')}日，地点${name(p.market.location)}；日历登记不代表此刻已开集或当事人已到场。`,['集日','集市','赶集']);
  for(const [i,f]of p.festivals.entries())add(`festival_${i}`,`节日节俗：${f.name}，${f.month}月${f.day}日，地点${name(f.location)}，${f.practice}。${f.note}`,['节日','节俗','日历']);
 }
 return rows;
}
export function settlementScene(engine,document){
 let location=engine.byId.get(document.state.location);const seen=new Set();
 while(location&&!seen.has(location.id)){seen.add(location.id);const p=publicSettlement(engine.world,location.id,document);if(p?.economy){const e=p.economy,r=e.production[0],s=e.currentStock??e.publicStock;return `【本地事务】${p.name}：${p.issues.map(i=>i.title).join('；')}。协调处：${engine.byId.get(p.coordination.place)?.name??p.coordination.place}；头人${p.governance.head?.name??'未登记'}，执法者${p.governance.enforcers.map(r=>r.name).join('、')}；相关人员须以实际在场为准。${p.coordination.authority}【公共经济】${r?`登记潜在产量${r.quantity}${r.unit}／${r.cycleDays}日；`:''}${e.currentStock?`当前第${s.asOfMinute}分钟账面`:`第${s.openingDay??0}日期初登记`}粮食${s.food??'未登记'}粮单位，每粮单位${e.units.foodUnitKg??'未登记'}千克；公款${s.treasuryCopper??'未登记'}铜币。潜在产量不等于库存，粮约提粮与送达分阶段结算。集日每月${p.market.days.join('、')}日；节俗日历不等于节日实际举办。`; }location=engine.byId.get(location.parent);}
 return '';
}
