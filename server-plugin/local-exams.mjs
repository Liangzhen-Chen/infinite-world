import {isPhysicallyDead} from './lifecycle-state.mjs';
import {knowledgeProficiency} from './education-state.mjs';
import {settlementHead,personRegistrar,personAge,personConstraint} from './entity-view.mjs';
import {assertNpcService,advanceWithNpcParticipants} from './npc-schedule.mjs';
import {npcEntryCheck} from './checks.mjs';
import {profession} from './professions.mjs';
import {digest,persistable} from './storage.mjs';
import {npcServices} from './npc-state.mjs';
import {aliveHoldings} from './holdings.mjs';
import {installFacilityRuntime} from './facility-state.mjs';

const seatKey=id=>`examination_seat:${id}`;
export function qualifiedExaminers(engine,state,profession,location){
 return Object.keys(state.npcs??{}).filter(id=>state.npcs[id].location===location&&awake(engine,state,id,state.npcs[id])&&!personConstraint(engine,state,id)&&npcServices(engine,state,id).includes(profession));
}
export function bookExaminationSeat(d,engine,row,{actor=row.registrar}={}){
 const state=d.get('state'),role=engine.byId.get(row.profession);
 if(actor!==row.registrar||!state.npcs?.[actor]||typeof row.id!=='string'||!row.id||d.get('state','records',seatKey(row.id))||!role||!qualifiedExaminers(engine,state,row.profession,row.location).includes(row.examiner)||!Number.isSafeInteger(row.minutes)||row.minutes<1||!Number.isSafeInteger(row.fee)||row.fee<0||typeof row.available!=='boolean'||row.passed!==false)throw Error('Invalid pending examination or unqualified examiner');
 const offices=aliveHoldings(d,{kind:'holds_office',holder:actor}).map(h=>d.get('holdings','entities',h.subject)?.facts??state.created?.[h.subject]??engine.byId.get(h.subject));
 if(actor!==row.examiner&&!offices.some(o=>o?.seat===row.location&&o.authority?.profession===row.profession&&o.authority.operations?.includes('refer_examiner')))throw Error('Registrar lacks examination referral authority');
 if(row.minutes!==(role.entry?.minutes??120)||row.fee!==role.fee)throw Error('Examination seat must retain the native examination fee and duration');
 const value={...persistable(row),category:'examination_seat'};
 d.set(['state','records',seatKey(row.id)],value);
 d.set(['state','records',`${seatKey(row.id)}:source`],{category:'examination_seat_receipt',digest:digest(value)});
 return value;
}
export function examinationSeats(engine,state,profession){
 return Object.values(state.records??{}).filter(r=>r.category==='examination_seat'&&r.profession===profession&&state.records[`${seatKey(r.id)}:source`]?.digest===digest(r)&&qualifiedExaminers(engine,state,r.profession,r.location).includes(r.examiner));
}
export function assertExaminationSeat(d,engine,args){
 if((args.operation??'certify')!=='certify'||!args.profession)return null;
 const role=engine.resolve(args.profession,'profession'),rows=Object.values(d.get('state','records')??{}).filter(r=>r.category==='examination_seat'&&r.profession===role);
 if(!rows.length)return null;
 const teacher=engine.resolve(args.teacher,'npc'),seat=examinationSeats(engine,d.get('state'),role).find(r=>r.available&&r.examiner===teacher&&r.location===d.get('state','location')&&!d.get('state','records',`${seatKey(r.id)}:used`));
 if(!seat)throw Error('No available real examination seat for this examiner');
 return seat;
}
export function consumeExaminationSeat(d,seat,eventId){if(seat)d.set(['state','records',`${seatKey(seat.id)}:used`],{category:'examination_seat_used',seat:seat.id,sourceEvent:eventId});}
installFacilityRuntime({examinationSeats,assertExaminationSeat,consumeExaminationSeat});
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
  if(!awake(e,d.get('state'),teacher,d.get('state','npcs',teacher)))throw Error('考官中途失去行动能力');
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
