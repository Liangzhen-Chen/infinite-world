import {isPhysicallyDead} from './lifecycle-state.mjs';
import {knowledgeProficiency} from './education-state.mjs';
import {settlementHead,personRegistrar,personAge,personConstraint} from './entity-view.mjs';
import {assertNpcService,advanceWithNpcParticipants} from './npc-schedule.mjs';
import {npcEntryCheck} from './checks.mjs';
import {profession} from './professions.mjs';
import {digest} from './storage.mjs';
const path=id=>['state','records',id];
const awake=(engine,state,id,n)=>n&&!n.scheduleTravel&&!n.cognitionTravel&&!isPhysicallyDead(engine,state,id)&&!['濒死','昏迷','患病'].includes(n.status)&&!/睡眠|睡觉|熟睡/.test(n.activity??'');
function policy(e,s,settlement){
 const p=e.world.settlementProfiles?.find(p=>p.id===settlement),head=settlementHead(e,s,settlement).value;
 const culture=p?.culture??e.byId.get(head)?.culture??p?.details?.culture;
 return e.rules.education?.examinations.find(r=>r.culture===culture);
}
export function localExamination(d,args,id){
 const e=this,s=d.get('state'),mode=args.choice??'civil',teacher=e.resolve(args.teacher,'npc'),student=args.student?e.resolve(args.student,'npc'):'player';
 const settlement=e.resolve(args.institution,'loc'),rule=policy(e,s,settlement);
 if(!rule||args.rule&&args.rule!==rule.id)throw Error('本地没有这项已登记考核制度');
 if(!['civil','guild','sect'].includes(mode))throw Error('考核类别须为civil、guild或sect');
 let result;
 if(mode!=='civil'){
  const role=e.resolve(args.profession,'profession');
  if(mode==='sect'&&!e.rules.training?.institutions.some(r=>r.profession===role&&r.teacher===teacher))throw Error('没有该导师的登记师承考核');
  // The original entry task owns fees, skill thresholds, career slots and time.
  result=profession.call(e,d,{profession:role,teacher,...(student!=='player'?{student}:{})},id);
 }else{
  if(student===teacher||!awake(e,s,teacher,s.npcs[teacher])||s.npcs[teacher].location!==s.location||personConstraint(e,s,teacher))throw Error('考官须实际清醒在场');
  const place=e.byId.get(s.location),local=place?.scope===settlement||place?.parent===settlement||s.location===settlement||e.world.settlementProfiles?.find(p=>p.id===settlement)?.details?.governance?.meetingPlace===s.location;
  const registrars=e.rules.governance?.authority?.superiors?.auth_bs_office_charter?.registrars?.occupations??[];
  if(!local||teacher!==settlementHead(e,s,settlement).value&&!personRegistrar(e,s,teacher,s.location,registrars))throw Error('须由本地现任头人或在岗登记人主持');
  if((personAge(e,s,student)?.value??0)<18||knowledgeProficiency(e,s,student,rule.skill)<rule.minimumProficiency)throw Error('报考须成年并满足识字能力要求');
  if(student!=='player'&&(!awake(e,s,student,s.npcs[student])||s.npcs[student].location!==s.location||personConstraint(e,s,student)))throw Error('考生须实际清醒在场');
  e.assertNpcObligationAction?.(d,[student,teacher],{minutes:rule.minutes,kind:'exam'});e.assertNpcAutonomyAction?.(s,[student,teacher],{minutes:rule.minutes});
  assertNpcService(d,e,teacher,'register',rule.minutes);
  const check=student==='player'?e.check(d,{attribute:'智力',skill:rule.skill,difficulty:rule.difficulty},id):npcEntryCheck(d,e,student,{attribute:'智力',skill:rule.skill,difficulty:rule.difficulty},id);
  advanceWithNpcParticipants(d,e,rule.minutes,id,[teacher,...student==='player'?[]:[student]]);
  if(!awake(engine,d.get('state'),teacher,d.get('state','npcs',teacher)))throw Error('考官中途失去行动能力');
  result={...check,task:rule.task};
 }
 const success=result.success===true||result.certified===true,row={category:'education_qualification',id:`education_qualification:${id}`,student,teacher,settlement,rule:rule.id,culture:rule.culture,form:mode==='civil'?rule.form:mode==='guild'?'行会考核':'门派考核',mode,profession:mode==='civil'?null:e.resolve(args.profession,'profession'),success,minute:d.get('state','minute'),sourceEvent:id,task:result.task??result.entryTask};
 d.set(path(row.id),row);d.set(path(`education_qualification_source:${id}`),{category:'education_qualification_receipt',qualification:structuredClone(row)});
 return {...result,success,qualification:row.id,name:rule.name,mode};
}
export function qualificationForApplication(e,s,id,settlement){
 const row=s.records?.[id],source=row&&s.records?.[`education_qualification_source:${row.sourceEvent}`];
 if(row?.category!=='education_qualification'||row.mode!=='civil'||!row.success||row.student!=='player'||row.settlement!==settlement||row.minute>s.minute||!source?.qualification||digest(row)!==digest(source.qualification)||policy(e,s,settlement)?.id!==row.rule)throw Error('任职考核凭据没有真实通过来源或不属本地');
 return row.id;
}
