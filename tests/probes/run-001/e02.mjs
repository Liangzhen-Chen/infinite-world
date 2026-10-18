// E02 镇长暴毙★：用榆坡头人赵枫替代周廷（核对者 e02b.mjs 同情境）：推进到月末前，注入玩家借给他的分期贷款，
// recordEntityDeath 猝死，再推进 35 天。
import {setup,imp,DAY,recs,draft,once,ok,partial,wrong,missing} from '../harness.mjs';

const sid='loc_bs_yupo',head='npc_yp_zhaofeng',ward='npc_hw_duanhe';
const scenario=once(async()=>{
 const {recordEntityDeath}=await imp('server-plugin/npc-life.mjs');
 const {settlementGovernment}=await imp('server-plugin/entity-view.mjs');
 const {syncHoldingRecord}=await imp('server-plugin/holding-sources.mjs');
 const {scheduleAt}=await imp('server-plugin/npc-schedule.mjs');
 const {personOffices}=await imp('server-plugin/entity-view.mjs');
 const {currentEmployment}=await imp('server-plugin/employment-state.mjs');
 const {snapshotContractTerms}=await imp('server-plugin/contract-state.mjs');
 const {openLedger}=await imp('server-plugin/ledger.mjs');
 const {openHoldings}=await imp('server-plugin/holdings.mjs');
 const {transition,advanceProcedure}=await imp('server-plugin/transition.mjs');
 const S=setup({schedules:true});
 let doc=await S.wait(S.doc,Math.max(0.1,(29*DAY+600-S.doc.state.minute)/DAY),'e02a');
 doc.state.records.debt_lend_probe={category:'debt',kind:'player_loan',debtor:head,representative:head,creditor:'player',principal:3000,interest:300,monthlyInterest:0.02,amount:3300,paid:0,status:'待偿还',
  installments:10,nextInstallment:1,createdAt:doc.state.minute,deadline:doc.state.minute+20*DAY,nextPayment:doc.state.minute+2*DAY,location:sid,source:'probe',signedTerms:{}};
 doc.state.npcs[head].coins=5000;
 const shopLocation=S.w.locations.find(p=>p.id.startsWith('bld_')&&p.parent===sid)?.id??doc.state.npcs[head].location;
 const workers=Object.keys(doc.state.npcs).filter(id=>id!==head&&!S.engine.byId.get(id)?.flags?.minor&&(S.engine.byId.get(id)?.age??0)>=18&&!personOffices(S.engine,doc.state,id).length&&!currentEmployment(doc.state,id)).slice(0,4);
 if(workers.length!==4)throw Error('E02 requires four real adult employees');
 doc.state.buildings[shopLocation]={...doc.state.buildings[shopLocation],owner:head,condition:100};
 doc.state.records.business_e02_distillery={id:'business_e02_distillery',category:'business',owner:head,location:shopLocation,status:'营业',createdAt:doc.state.minute};
 for(const [i,worker]of workers.entries()){
  Object.assign(doc.state.npcs[worker],{location:shopLocation,activity:'酒坊清扫与搬运',status:'正常'});
  const id=`workshop:e02:${i}`,nextWork=Math.floor(doc.state.minute/DAY)*DAY+1020;
  doc.state.records[id]=snapshotContractTerms({id,category:'contract',kind:'workshop',laborMarket:1,owner:head,worker,parties:[worker,head],location:shopLocation,task:'酒坊清扫与搬运',wage:20,starts:doc.state.minute,createdAt:doc.state.minute,deadline:doc.state.minute+40*DAY,nextWork,status:'有效',paid:0,produced:0,targetQuantity:100000,workedMinutes:0,attendance:{},shifts:[],source:'e02-distillery'});
 }
 // 监护：赵枫代管河湾 16 岁的段禾（替代“10 岁侄子”）
 doc.state.records['guardianship:probe']={category:'guardianship',id:'guardianship:probe',ward:ward,guardian:head,status:'代管中',since:doc.state.minute-DAY,expires:null,source:'probe'};
 // Open fixture records and balances together, as for a loaded legacy save.
 doc.ledger=openLedger(S.engine,doc);doc.holdings=openHoldings(S.engine,doc);
 const unclaimed=draft(JSON.parse(JSON.stringify(doc)));unclaimed.engine=S.engine;
 const unclaimedTransition=transition(unclaimed,S.engine,{entity:head,basis:'death',origin:'death_rule',successors:[],law:{noHeir:{mode:'seal',recipient:sid,notice:1}}});
 advanceProcedure(unclaimed,S.engine,unclaimedTransition.successor);
 unclaimed.set(['state','minute'],unclaimed.get('state','minute')+1);advanceProcedure(unclaimed,S.engine,unclaimedTransition.successor);
 const sealed=unclaimed.get('state','records','business_e02_distillery');
 const deathMinute=doc.state.minute,d=draft(doc);d.engine=S.engine;
 syncHoldingRecord(d,S.engine,'guardianship:probe',{writer:'family-inheritance',eventId:'e02:guardianship'});
 const death=recordEntityDeath(d,S.engine,head,deathMinute,'猝死');
 let c=d.document;
 const heirCoins=Object.fromEntries((death.estate?.heirs??[]).map(h=>[h,c.state.npcs[h]?.coins]));
 const govAfterDeath=settlementGovernment(S.engine,c.state,sid).head.value;
 c=await S.wait(c,35,'e02b');
 return {S,death,deathMinute,heirCoins,govAfterDeath,c,sealed,workers,shopLocation,gov35:settlementGovernment(S.engine,c.state,sid).head.value,
  salaries:recs(c,'office_salary').filter(([,r])=>r.holder===head),loan:c.state.records.debt_lend_probe,
  guardianship:c.state.records['guardianship:probe'],cases:recs(c,'legal_case').map(([k,r])=>({k,...r})),npc:c.state.npcs[head],schedule:scheduleAt(S.engine,head,c.state.minute,c.state)};
});

export default [
 {id:'E02-1',event:'E02',no:1,text:'镇长职位空缺，由副职代理或大会补选，俸禄从死亡当日停发',async check(){
  const s=await scenario();
  const stopped=s.salaries.every(([,r])=>(r.minute??r.createdAt??0)<=s.deathMinute);
  if(s.gov35&&s.gov35!==head&&stopped)return ok(`35 天后主官=${JSON.stringify(s.gov35)}，死后无俸禄=${stopped}`);
  return stopped?partial('死后俸禄停发，但主官空缺 35 天无人代理或补选'):wrong('主官空缺且死后仍发俸禄');}},
 {id:'E02-2',event:'E02',no:2,text:'酒坊归继承人；无继承人时官府封存，雇工工资照常累计、到期不发就停工',async check(){
  const s=await scenario();
  const ended=s.workers.map((_,i)=>[`workshop:e02:${i}`,s.c.state.records[`workshop:e02:${i}`]]);
  const accruing=ended.every(([,r])=>r.substitutedAt!==undefined&&r.owner!==head);
  // A contract's label or a source-code keyword is not wage evidence. The
  // scenario must contain the actual workshop and four attended wage records.
  const workers=ended.filter(([,r])=>r.kind==='workshop'&&r.workedMinutes>0&&r.shifts?.length);
  const receipt=Object.values(s.c.state.family?.deaths??{}).find(r=>r.id===s.death.id);
  const property=(receipt?.estate?.allocations??[]).some(r=>r.assets?.includes(s.shopLocation));
  if(accruing&&property&&s.sealed.status==='封存'&&workers.length>=4&&workers.every(([,r])=>r.paid>0||recs(s.c,'debt').some(([,debt])=>debt.contract===r.id&&debt.kind==='wage')))return ok('实有酒坊和四名到岗雇工，承接后的已付或欠薪有实际账据；无继承人对照已封存');
  return missing(`酒坊继承=${property}，无继承人封存=${s.sealed.status}，合同承接=${accruing}，到岗=${workers.length}/4；${JSON.stringify(ended.map(([,r])=>({id:r.id,owner:r.owner,status:r.status,minutes:r.workedMinutes,paid:r.paid,shifts:r.shifts.length,reason:r.reason})))}`);}},
 {id:'E02-3',event:'E02',no:3,text:'贷款先从遗产清偿，不转嫁侄子',async check(){
  const s=await scenario();
  const paid=s.loan?.paid??0,defaultCase=s.cases.some(c=>[c.offender,c.defendant].includes(head)&&/default|违约/.test(`${c.offense}${c.k}`));
  if(paid>=s.loan?.amount&&!defaultCase)return ok(`遗产清偿 ${paid}/${s.loan.amount}，未对死者立案`);
  if(defaultCase||paid<(s.loan?.amount??0))return wrong(`遗产分给继承人 ${JSON.stringify(s.heirCoins)}，贷款仅还 ${paid}/${s.loan?.amount}${defaultCase?'，且对死者立违约案':''}`);
  return partial('');}},
 {id:'E02-4',event:'E02',no:4,text:'侄子的监护权按族谱转给下一顺位亲属',async check(){
  const s=await scenario(),g=s.guardianship;
  if(g?.status==='代管中'&&g.guardian&&g.guardian!==head)return ok(`监护改由 ${g.guardian}`);
  if(g?.status==='待指定')return partial('监护人死亡后记录改为“待指定”，不按族谱顺位改指定');
  return wrong(`监护记录 ${JSON.stringify(g)?.slice(0,160)}`);}},
 {id:'E02-5',event:'E02',no:5,text:'死者日程立即终止，不再出现在工作地',async check(){
  const s=await scenario();
  return s.schedule===null&&s.npc.status==='死亡'&&!s.npc.scheduleTravel&&!s.npc.cognitionTravel&&!/工作|营业|值守/.test(s.npc.activity??'')?ok(`status=${s.npc.status} schedule=null activity=${s.npc.activity}`):wrong(`status=${s.npc.status} schedule=${JSON.stringify(s.schedule)} activity=${s.npc.activity}`);}},
];
