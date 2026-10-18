// E03 uses sourced appointment, promotion decision, and protocol dismissal.
import {DAY,once,ok,wrong} from '../harness.mjs';
import {setup} from '../../helpers/u16.mjs';
import {governanceAction,advanceOffices,playerOffices,spendPublic} from '../../../server-plugin/governance.mjs';
import {promotionAction,advancePromotion,promotionConditions} from '../../../server-plugin/promotion.mjs';
import {personOffices} from '../../../server-plugin/entity-view.mjs';
import {advanceOfficeSalaries} from '../../../server-plugin/office-salary.mjs';
import {resyncBooks} from '../../helpers/ledger-sync.mjs';
import {openHoldings} from '../../../server-plugin/holdings.mjs';

const sid='loc_bs_yupo',steward='npc_yp_gaoxin';
export const scenario=once(async()=>{
 const {e:engine,d}=setup(),a=engine.rules.governance.authority,charter=a.superiors.auth_bs_office_charter;
 d.set(['holdings'],openHoldings(engine,d.document));d.engine=engine;
 const g=engine.world.settlementProfiles.find(p=>p.id===sid).details.governance;
 d.set(['state','location'],charter.seat);
 const clerk=engine.world.npcs.find(n=>n.workplace?.location===charter.seat&&charter.registrars.occupations.includes(n.occupation)).id;
 d.set(['state','npcs',clerk,'location'],charter.seat);d.set(['state','npcs',clerk,'activity'],'递件');
 d.set(['state','records',`civic_citizen:${sid}:player`],{category:'civic_citizen',subject:'player',settlement:sid,status:'已登记'});
 d.set(['state','records','civic_source:probe'],{category:'civic_contribution',subject:'player',settlement:sid,points:120,sourceEvent:'probe'});
 d.set(['state','records',`standing:${g.head}:player`],{category:'standing',holder:g.head,target:'player',value:60,history:[]});
 const filed=governanceAction.call(engine,d,{operation:'governance_apply',settlement:sid,name:'office_village_head'},'e03-apply');
 const due=d.get('state','records',filed.application,'due');d.set(['state','minute'],due);advanceOffices(d,engine,{after:due});
 d.set(['state','location'],g.meetingPlace);d.set(['state','npcs',steward,'location'],g.meetingPlace);d.set(['state','npcs',steward,'activity'],'议事');
 const delegated=governanceAction.call(engine,d,{operation:'governance_grant',settlement:sid,authority:'player',action:'housing',steward,consent:true},'e03-steward');
 const show=()=>({player:playerOffices(d.get('state'),{settlement:sid},engine).map(o=>({name:o.name,quota:o.monthlyQuotaD,budget:o.monthlyBudgetCopper,salary:o.monthlySalaryCopper,tax:JSON.stringify(o.taxBps)})),
  steward:personOffices(engine,d.get('state'),steward).map(e=>({name:e.value.name,salary:e.value.monthlySalaryCopper}))});
 const village=show(),q=engine.rules.governance.promotion.steps[0].requires;
 d.set(['state','settlements',sid,'population'],q.population+20);
 for(let i=0;i<q.housing;i++)d.set(['state','created',`bld_e03_house_${i}`],{id:`bld_e03_house_${i}`,type:'bld',scope:sid,parent:sid,purpose:'私宅'});
 for(let i=0;i<q.industries;i++)d.set(['state','records',`e03_business:${i}`],{category:'business',id:`e03_business:${i}`,status:'营业',location:sid});
 const unrelated=structuredClone(d.get('state'));
 for(const [i,name]of ['凉亭','水井'].entries())unrelated.created[`bld_e03_false_${i}`]={id:`bld_e03_false_${i}`,type:'bld',name,purpose:'公共设施',scope:sid,parent:sid};
 const conditions=promotionConditions(engine,unrelated,sid);
 for(const [i,name]of ['集市','驿站'].entries())d.set(['state','created',`bld_e03_service_${i}`],{id:`bld_e03_service_${i}`,type:'bld',name,purpose:'公共设施',scope:sid,parent:sid});
 const building=structuredClone(d.get('state'));building.projects.e03={id:'e03',building:'bld_e03_service_1',status:'施工中'};
 const underConstruction=promotionConditions(engine,building,sid);
 const ruined=structuredClone(d.get('state'));ruined.buildings.bld_e03_service_1={condition:0};
 const damaged=promotionConditions(engine,ruined,sid);
 d.set(['state','location'],charter.seat);d.set(['state','npcs',clerk,'location'],charter.seat);
 const promotion=promotionAction.call(engine,d,{operation:'promotion_petition',settlement:sid},'e03-promote');
 const at=d.get('state','records',promotion.petition,'due');d.set(['state','minute'],at);advancePromotion(d,engine,{before:at-1,after:at});
 const town=show(),office=Object.values(d.get('state','records')).find(r=>r.category==='governance_office'&&r.holder==='player'&&r.settlement===sid);
 d.set(['state','records','legal_case:e03'],{category:'legal_case',offender:'player',judgment:{effect:'fine'}});
 advanceOffices(d,engine,{after:at});const removed=show();
 let spendingDenied=false;try{spendPublic(d,engine,{settlement:sid,copper:1,power:'public_project',sourceEvent:'e03-illegal'});}catch(error){spendingDenied=/没有在任官职/.test(error.message);}
 resyncBooks(engine,d.document);const salaryAt=(Math.floor(at/(30*DAY))+1)*30*DAY;d.set(['state','minute'],salaryAt);
 advanceOfficeSalaries(d,engine,{before:salaryAt-1,after:salaryAt});
 const noNewSalary=!Object.values(d.get('state','records')).some(r=>r.category==='office_salary'&&r.holder==='player'&&r.assessedAt===salaryAt);
 return {village,town,removed,conditions,underConstruction,damaged,spendingDenied,noNewSalary,delegated,office,document:d.document};
});
export default [
 {id:'E03-1',event:'E03',no:1,text:'升格后俸禄、公库额度、可任命职位数按镇级计算',async check(){const {village,town}=await scenario(),v=village.player[0],t=town.player[0];return v&&t&&t.quota>v.quota&&t.budget>v.budget&&t.salary>v.salary?ok(`真实升格后额度/预算/月俸 ${v.quota}/${v.budget}/${v.salary} → ${t.quota}/${t.budget}/${t.salary}`):wrong('真实升格没有派生新权利');}},
 {id:'E03-2',event:'E03',no:2,text:'税率和税基按镇级重新计算',async check(){const {village,town}=await scenario();return village.player[0]?.tax!==town.player[0]?.tax?ok('真实审批后税率上限随镇级改变'):wrong('税率未改变');}},
 {id:'E03-3',event:'E03',no:3,text:'升格须先满足设施条件，集市和驿站没完工不能通过',async check(){const {conditions,underConstruction,damaged,town}=await scenario();return !conditions.ok&&!underConstruction.ok&&!damaged.ok&&town.player[0]?.name==='镇长'?ok('凉亭水井、施工驿站和毁损驿站均拒绝；集市驿站可用后才批准'):wrong('设施正反例不满足');}},
 {id:'E03-4',event:'E03',no:4,text:'罢免当天收回任免权和公库权限',async check(){const {removed,spendingDenied,noNewSalary}=await scenario();return !removed.player.length&&spendingDenied&&noNewSalary?ok('真实复核免职后权限为空、实际支款被拒、不再新增月俸'):wrong('免职后仍可行使权利或新增俸禄');}},
 {id:'E03-5',event:'E03',no:5,text:'罢免后他任命的人默认留任，由新任改任',async check(){const {removed}=await scenario();return removed.steward.some(o=>o.name==='镇管事')?ok('通过住房授权流程任命的管事在原任免职后继续任职，并派生镇级名称'):wrong('合法下级任命丢失或级别错误');}}
];
