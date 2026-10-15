// E08 昏迷者能不能施治疗术★：榆坡无未成年人，成人目标用赵枫（设为昏迷），未成年目标用河湾 16 岁的段禾；
// 治疗术取 effectSpec.kind=heal 的第一条法术（核对者 e08.mjs 同情境）。
import {setup,imp,world,src,draft,once,ok,partial,wrong,missing,codeHas} from '../harness.mjs';

const adult='npc_yp_zhaofeng',minor='npc_hw_duanhe';
const scenario=once(async()=>{
 const mc=await imp('server-plugin/magic-consent.mjs');
 const {engine,doc}=setup();
 const heal=world.spells.find(s=>s.effectSpec?.kind==='heal');
 let c=structuredClone(doc);const loc=c.state.npcs[adult]?.location??engine.byId.get(adult).location;c.state.location=loc;
 c.state.npcs[adult]={...c.state.npcs[adult],location:loc,status:'昏迷'};
 const comatose=mc.personSpellConsent(engine,c.state,adult,'healing');
 let unconsented=null;try{mc.assertSpellConsent(draft(c),engine,{...heal,location:loc},{},adult,'healing');}catch(e){unconsented=e.message;}
 let forced=null;try{mc.assertSpellConsent(draft(c),engine,{...heal,location:loc},{force:true},adult,'healing');forced='通过';}catch(e){forced=e.message;}
 const d=draft(c);mc.recordSpellViolation(d,engine,{...heal,location:loc},{force:true},adult,'e08ev');
 const violation=d.get('state','records','legal_case:e08ev');
 const m=structuredClone(doc);const mloc=m.state.npcs[minor]?.location??engine.byId.get(minor).location;m.state.location=mloc;
 m.state.npcs[minor]={...m.state.npcs[minor],location:mloc,status:'正常'};
 const minorDecision=mc.personSpellConsent(engine,m.state,minor,'healing');
 return {heal,comatose,unconsented,forced,violation,minorDecision};
});

export default [
 {id:'E08-1',event:'E08',no:1,text:'昏迷的人无法表示同意，不能视为已同意',async check(){
  const s=await scenario();
  return s.comatose?.decision==='refuse'||s.unconsented?ok(`昏迷：${JSON.stringify(s.comatose).slice(0,80)}；无同意施法被拒：${s.unconsented}`):wrong(`昏迷被视为同意：${JSON.stringify(s.comatose)}`);}},
 {id:'E08-2',event:'E08',no:2,text:'未成年由监护人代为同意；叔叔同意无效，除非法典有紧急救治条款',async check(){
  const s=await scenario(),f=src('server-plugin/magic-consent.mjs');
  const guardian=/guardian|监护/.test(f),coma=world.rules.law.emergencyHealing.statuses.includes('昏迷');
  if(guardian&&coma)return ok('监护人可代为同意，紧急条款覆盖昏迷');
  return partial(`同意只能由本人给出（叔叔无效，符合）；未成年判定 ${JSON.stringify(s.minorDecision).slice(0,60)}，监护人代为同意${guardian?'已支持':'不支持'}；紧急条款状态=${world.rules.law.emergencyHealing.statuses.join('/')}`);}},
 {id:'E08-3',event:'E08',no:3,text:'不经同意强行施法按本地法典构成违法，家属可以起诉',async check(){
  const s=await scenario();
  return s.violation?ok(`强施入法：${s.violation.law} ${s.violation.offense} ${s.violation.status}`):missing(`强施后未立案（force=${s.forced}）`);}},
 {id:'E08-4',event:'E08',no:4,text:'在场医师用常规医术施救不受这条限制',async check(){
  const f=src('server-plugin/medicine.mjs');
  if(!f)return missing('无非魔法诊疗');
  const emergency=/急救|emergency/.test(f)&&!/诊疗须病人自愿求医/.test(f);
  return emergency?ok('常规医术可对昏迷者急救'):partial('RW-06 日常诊疗已有，但须病人本人自愿求医，昏迷者无急救或代为同意路径');}},
 {id:'E08-5',event:'E08',no:5,text:'救活后一家好感上升并沿亲属传播',async check(){
  const care=src('server-plugin/magic-care.mjs')+src('server-plugin/magic.mjs');
  return /adjustStanding|recordStanding|kinBenefit/.test(care)?ok('治疗调用立场传导'):partial('“亲友受惠”传导底座存在（standing），施治疗术不调用它');}},
];
