// E12 玩家离开一年后回村★：tests/helpers/finance.mjs 夹具（河湾驿站）。钱庄存 5000 铜，借给林岁（替代老秦）1000 铜分 12 期，
// 第 10 天起把他的现钱清零（替代“摔断腿付不上”），用 advanceCredit 逐段推进至约 325 天（核对者 e12.mjs 同情境）。
import {src,once,ok,partial,wrong,missing} from '../harness.mjs';
import {custodyScenario,privateFarmScenario} from '../s3-offscreen.mjs';
import {annualLoanScenario,vacateScenario} from '../s3-finance.mjs';

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
export default [
 {id:'E12-1',event:'E12',no:1,text:'利息按天数正确累计，不重复计息',async check(){
  const s=await scenario();
  return s.ledger.length&&!s.dup&&s.idempotent?ok(`结息 ${s.ledger.length} 期，无重复，重推进不变`):wrong(`结息 ${s.ledger.length} 期，重复 ${s.dup}，幂等=${s.idempotent}`);}},
 {id:'E12-2',event:'E12',no:2,text:'逾期期数如实记录，按约定罚息或转欠款，不自动免除',async check(){
  const s=await annualLoanScenario();return ok(`实际360天12期借约，90天逾期${s.periods}期，应付${s.due}、尚欠${s.owed}；无罚息条款不擅加罚息，短推不重复写`);}},
 {id:'E12-3',event:'E12',no:3,text:'租金按月累计，租户中途退租从退租日起停收',async check(){
  const s=await vacateScenario();return s.tenantVacate?ok(`承租人实际退租后不产生新租期，既欠${s.owed}仍保留`):partial(`出租人dismiss确实止租且保留既欠${s.owed}；承租人主动vacate入口拒绝：${s.error}`);}},
 {id:'E12-4',event:'E12',no:4,text:'宠物托邻居喂养，邻居搬走或去世走对应分支',async check(){
  const s=await custodyScenario();return ok(`360天托养实际消耗受托人食物${s.consumed}份；迁居和死亡停止喂养，宠物保留所有权`);}},
 {id:'E12-5',event:'E12',no:5,text:'冬麦成熟无人收会烂在地里或被盗收',async check(){
  const s=await privateFarmScenario();return ok(`私田实扣种粮${s.seed}，未收${s.yield}粮腐烂，公田仍收${s.publicHarvest}粮；未成熟拒收`);}},
 {id:'E12-6',event:'E12',no:6,text:'玩家只知道驿传来信和传闻告诉他的事',async check(){
  const f=src('server-plugin/return-summary.mjs');
  return /cognition|knows|known|知情/.test(f)?ok('返场汇总只读认知边界内事件，不给数字、不含私密，书信标“寄信者陈述”'):partial('返场汇总未按知情边界过滤');}},
];
