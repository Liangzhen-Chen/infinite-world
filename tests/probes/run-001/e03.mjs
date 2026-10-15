// E03 玩家当村长、升镇、被罢免★：榆坡替代柳溪；注入村长官职与任命的管事，再注入升镇与免职（核对者 e03.mjs 同情境）。
import {setup,imp,DAY,once,ok,partial,wrong,missing} from '../harness.mjs';

const sid='loc_bs_yupo',steward='npc_yp_gaoxin';
const scenario=once(async()=>{
 const {personOffices}=await imp('server-plugin/entity-view.mjs');
 const {playerOffices}=await imp('server-plugin/governance.mjs');
 const {promotionConditions}=await imp('server-plugin/promotion.mjs');
 const {engine,doc}=setup();const c=structuredClone(doc),now=c.state.minute;
 const k=`governance_office:${sid}:office_village_head:player`;
 c.state.records[k]={category:'governance_office',id:k,holder:'player',settlement:sid,office:'office_village_head',name:'村长',status:'在任',since:now,until:now+360*DAY,nextReview:now+90*DAY};
 c.state.records['housing_steward:p']={category:'housing_steward',id:'housing_steward:p',steward,grantor:'player',settlement:sid,createdAt:now,expires:now+360*DAY,hall:'bld_yp_hall'};
 const show=()=>({player:playerOffices(c.state,{},engine).map(o=>({name:o.name,quota:o.monthlyQuotaD,budget:o.monthlyBudgetCopper,salary:o.monthlySalaryCopper,tax:JSON.stringify(o.taxBps)})),
  steward:personOffices(engine,c.state,steward).map(e=>({name:e.value.name,salary:e.value.monthlySalaryCopper}))});
 // 两处与集市、驿站无关的公共设施（凉亭、水井）是否就能满足升格的设施条件
 const facilityState=structuredClone(c.state);facilityState.created??={};
 for(const [i,name]of['凉亭','水井'].entries())facilityState.created[`probe_fac_${i}`]={id:`probe_fac_${i}`,name,purpose:'公共设施',scope:sid};
 const conditions=promotionConditions(engine,facilityState,sid);
 const village=show();
 c.state.records[`settlement_rank:${sid}`]={category:'settlement_rank',id:`settlement_rank:${sid}`,settlement:sid,level:'镇',superior:'loc_bs',since:now};
 const town=show();
 c.state.records[k]={...c.state.records[k],status:'已免职',removedAt:now};
 const removed=show();
 return {village,town,removed,conditions};
});

export default [
 {id:'E03-1',event:'E03',no:1,text:'升格后俸禄、公库额度、可任命职位数按镇级计算',async check(){
  const {village,town}=await scenario(),v=village.player[0],t=town.player[0];
  if(!v||!t)return missing('无玩家官职');
  return t.quota>v.quota&&t.budget>v.budget&&t.salary>v.salary?ok(`村 ${v.quota}/${v.budget}/${v.salary} → 镇 ${t.quota}/${t.budget}/${t.salary}（读取时派生）`):wrong(`升格后数值未变：${JSON.stringify(t)}`);}},
 {id:'E03-2',event:'E03',no:2,text:'税率和税基按镇级重新计算',async check(){
  const {village,town}=await scenario();
  return village.player[0]?.tax!==town.player[0]?.tax?ok(`税上限 ${village.player[0]?.tax} → ${town.player[0]?.tax}`):wrong('税率未随级别变化');}},
 {id:'E03-3',event:'E03',no:3,text:'升格须先满足设施条件，集市和驿站没完工不能通过',async check(){
  const {conditions}=await scenario(),f=conditions.checks?.facilities??null;
  const reasons=(conditions.reasons??[]).join('；');
  if(/集市|驿站/.test(reasons))return ok(`缺集市/驿站被拒：${reasons}`);
  return f&&f.have>=f.need?partial(`凉亭+水井即满足“公共设施 ${f.have}/${f.need}”，不区分设施种类`):partial(`设施条件只按个数：${reasons}`);}},
 {id:'E03-4',event:'E03',no:4,text:'罢免当天收回任免权和公库权限',async check(){
  const {removed}=await scenario();
  return removed.player.length===0?ok('免职后 playerOffices 立即为空（公库支取依赖它）'):wrong(`免职后仍有官职 ${JSON.stringify(removed.player)}`);}},
 {id:'E03-5',event:'E03',no:5,text:'罢免后他任命的人默认留任，由新任改任',async check(){
  const {town,removed}=await scenario();
  if(removed.steward.length)return /村管事/.test(removed.steward[0].name)?partial(`管事留任，但升镇后名称仍为 ${removed.steward[0].name}`):ok(`管事留任：${removed.steward[0].name}`);
  return wrong(`任命人被免后管事随之失职（免前 ${JSON.stringify(town.steward)}）`);}},
];
