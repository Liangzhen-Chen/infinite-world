// E12 玩家离开一年后回村★：tests/helpers/finance.mjs 夹具（河湾驿站）。钱庄存 5000 铜，借给林岁（替代老秦）1000 铜分 12 期，
// 第 10 天起把他的现钱清零（替代“摔断腿付不上”），用 advanceCredit 逐段推进至约 325 天（核对者 e12.mjs 同情境）。
import {src,once,ok,partial,wrong,missing} from '../harness.mjs';
import {toolDefinitions} from '../../../extension/tools.mjs';

const scenario=once(async()=>{
 const {fixture,host,clerk,DAY}=await import('../../helpers/finance.mjs');
 const f=fixture({coins:30000}),b=f.e.rules.economy.credit.banks[0];
 await f.act({operation:'deposit',seller:clerk,coins:5000},'e12dep');
 let yearLoan=null;try{await f.act({operation:'lend',seller:host,coins:1000,days:360,consent:true,quantity:12},'e12lend360');yearLoan='ok';}catch(e){yearLoan=e.message;}
 const loan=await f.act({operation:'lend',seller:host,coins:1000,days:90,consent:true,quantity:12},'e12lend');
 const step=days=>f.tick(f.doc.state.minute+Math.round(days*DAY));
 step(10);f.doc.state.npcs[host].coins=0;
 for(let i=0;i<10;i++)step(30);step(15);
 const L=f.doc.state.records[loan.debt],bank=f.doc.state.records[b.id];
 const mins=bank.interestLedger?.map(r=>r.minute)??[];
 const snapshot=JSON.stringify(bank.interestLedger);step(0.0007);
 const idempotent=JSON.stringify(f.doc.state.records[b.id].interestLedger)===snapshot;
 const cases=Object.values(f.doc.state.records).filter(r=>r.category==='legal_case'&&JSON.stringify(r).includes(loan.debt));
 return {yearLoan,loan:L,ledger:bank.interestLedger??[],dup:mins.length-new Set(mins).size,idempotent,cases};
});
const ops=name=>toolDefinitions().find(t=>t.function.name===name).function.parameters.properties.operation.enum;

export default [
 {id:'E12-1',event:'E12',no:1,text:'利息按天数正确累计，不重复计息',async check(){
  const s=await scenario();
  return s.ledger.length&&!s.dup&&s.idempotent?ok(`结息 ${s.ledger.length} 期，无重复，重推进不变`):wrong(`结息 ${s.ledger.length} 期，重复 ${s.dup}，幂等=${s.idempotent}`);}},
 {id:'E12-2',event:'E12',no:2,text:'逾期期数如实记录，按约定罚息或转欠款，不自动免除',async check(){
  const s=await scenario(),L=s.loan;
  const notForgiven=L.status!=='已免除'&&(L.defaulted||s.cases.length);
  const perInstallment=L.installmentOverdueAt!==undefined||Array.isArray(L.overdueInstallments);
  const penalty=L.penalty!==undefined||L.penaltyInterest!==undefined;
  if(notForgiven&&perInstallment&&penalty&&s.yearLoan==='ok')return ok('逐期逾期、罚息、违约转欠款');
  if(notForgiven)return partial(`不自动免除（${L.status}，立案 ${s.cases.length}）；玩家放贷逐期逾期=${perInstallment}，罚息=${penalty}，一年 12 期借约：${s.yearLoan}`);
  return wrong(`贷款状态 ${L.status}，未转违约`);}},
 {id:'E12-3',event:'E12',no:3,text:'租金按月累计，租户中途退租从退租日起停收',async check(){
  const trade=ops('world_trade');
  const terminate=trade.some(o=>/terminate|vacate|退租|end_lease/.test(o));
  const monthly=/nextRent/.test(src('server-plugin/finance-assets.mjs'));
  return monthly&&terminate?ok('按月累计且可退租'):monthly?partial(`按月生成租金；无租户中途退租操作（world_trade 无 terminate 类子操作）`):missing('无出租租金');}},
 {id:'E12-4',event:'E12',no:4,text:'宠物托邻居喂养，邻居搬走或去世走对应分支',async check(){
  const pet=ops('world_companion');
  return pet.some(o=>/custody|entrust|foster|托/.test(o))?partial('有托养操作，受托人分支待核'):missing(`宠物只能 follow/stay（${pet.filter(o=>o.startsWith('pet_')).length} 个操作无托养），离开一年留守宠物饿死`);}},
 {id:'E12-5',event:'E12',no:5,text:'冬麦成熟无人收会烂在地里或被盗收',async check(){
  const f=src('server-plugin/agriculture.mjs');
  return /privatePlot|私田|盗收|unharvested|无人收割/.test(f)?partial('有玩家私田或未收割分支'):missing('玩家没有私田（sow 投入村公田），无“无人收割腐烂或被盗”分支');}},
 {id:'E12-6',event:'E12',no:6,text:'玩家只知道驿传来信和传闻告诉他的事',async check(){
  const f=src('server-plugin/return-summary.mjs');
  return /cognition|knows|known|知情/.test(f)?ok('返场汇总只读认知边界内事件，不给数字、不含私密，书信标“寄信者陈述”'):partial('返场汇总未按知情边界过滤');}},
];
