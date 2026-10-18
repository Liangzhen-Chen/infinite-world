import {isPhysicallyDead} from './lifecycle-state.mjs';
import {bagStock} from './stock.mjs';
import {allFacilities,facilityView,facilityKind} from './facility-state.mjs';
import {currentEmployment,employmentActive} from './employment-state.mjs';
import {contractTerms} from './contract-state.mjs';
import {recordsWhere} from './storage.mjs';
// Consultations, stock use and appointments are facts; staff and capacity are views.
export const MEDICAL_SKILL='skill_life_19_core';
export const medicineFresh=e=>!e.replaying||e.replayResult?.medicineVersion===1;
export const medicineRows=s=>recordsWhere(s.records,'category','medicine_visit');
export const medicineReservation=(s,id,start,minutes=1)=>medicineRows(s).find(r=>r.status==='预约'&&[r.patient,r.doctor,...r.assistants??[]].includes(id)&&start<r.end&&start+Math.max(1,minutes)>r.depart);
export function medicalSkill(e,s,id){
 const n=s.npcs?.[id],b=s.created?.[id]??e.byId.get(id),v=id==='player'?s.skills?.[MEDICAL_SKILL]:n?.skills?.[MEDICAL_SKILL]??b?.proficiencies?.[MEDICAL_SKILL];
 return typeof v==='number'?v:v?.proficiency??0;
}
export function medicalRole(e,s,id,job=currentEmployment(s,id)){
 const n=s.npcs?.[id],b=s.created?.[id]??e.byId.get(id),v=n?.vocation,def=e.rules.npcGrowth?.vocations?.find(r=>r.id===v?.id);
 return job?job.task??'':v?def?.name??v.name??'':n?.occupation??b?.occupation??'';
}
export function medicineSites(e,s){
 const out=[];
 // One pass over the records gives each person's current job (the first active
 // row, as currentEmployment reads it); the facility loop reads it per person
 // instead of rescanning the records per facility and person.
 const minute=s.minute??0,jobs=new Map();
 for(const raw of recordsWhere(s.records,'kind','workshop')){const r=contractTerms(raw,minute);if(employmentActive(r,s)&&r.createdAt<=minute&&minute<r.deadline&&!jobs.has(r.worker))jobs.set(r.worker,r);}
 for(const p of allFacilities(e,s)){
  if(facilityKind(p)!=='clinic'&&!/药草院/.test(p.name??''))continue;
  const view=facilityView(e,s,p.id),asset=s.buildings?.[p.id],members={};
  for(const id of Object.keys(s.npcs??{})){
   const n=s.npcs[id],b=s.created?.[id]??e.byId.get(id),job=jobs.get(id)??null,role=medicalRole(e,s,id,job);
   const workplace=job?.location??n.workplace?.location??n.residence?.workplace??b?.workplace?.location;
   if(workplace!==p.id||isPhysicallyDead(e,s,id)||['濒死','昏迷','患病'].includes(n.status)||job?.status==='罢工')continue;
   if(/医师|药师/.test(role)&&medicalSkill(e,s,id)>0)members[id]={position:'医师',joinedAt:job?.createdAt??null,arrears:0};
   else if(/药童|药工/.test(role))members[id]={position:'药童',joinedAt:job?.createdAt??null,arrears:0};
  }
  const doctors=Object.keys(members).filter(id=>members[id].position==='医师').sort(),owner=asset?.owner??p.owner??doctors[0]??null;
  out.push({id:`clinic:${p.id}`,name:p.name,kind:/药铺|药草院/.test(p.name)?'药铺':'医馆',seat:p.id,owner,leader:doctors[0]??null,members,doctors,assistants:Object.keys(members).filter(id=>members[id].position==='药童'),capacity:view?.capacity??0,factor:view?.factor??0});
 }
 return out;
}
export function medicalConditions(s,id){
 const a=id==='player'?s.player:s.npcs?.[id];
 return [...Object.values(s.family?.illnesses??{}).filter(r=>r.patient===id&&r.status==='患病中').map(r=>({kind:'illness',id:r.id,severity:r.severity,record:r})),...(a?.medical?.wounds??[]).filter(w=>!w.healed&&(!w.closed||w.infected)).map(w=>({kind:'wound',id:w.id,severity:w.infected||w.depthMm>3?'重':'轻',record:w}))];
}
// RW-04 may publish exposures without giving medicine ownership of hydrology.
export function waterDiseaseExposure(s,location){
 return Object.values(s.records??{}).filter(r=>r.category==='water_exposure'&&r.location===location&&r.since<=s.minute&&(r.until??Infinity)>s.minute&&r.disease&&r.risk>0);
}
export function medicinePriceFactor(e,s,item,location,books=null){
 if(item!=='item_herb')return 1;
 const pending=medicineRows(s).filter(r=>r.status==='预约'&&r.clinic===`clinic:${location}`).length;
 if(!pending)return 1;
 const supply=medicineSites(e,s).filter(c=>c.seat===location).reduce((sum,c)=>sum+[c.owner,...c.doctors].filter((id,i,a)=>id&&a.indexOf(id)===i).reduce((n,id)=>n+(!s.npcs?.[id]?0:bagStock(books,e,{point:'medicine.herb',id,item,legacy:()=>{const q=s.npcs?.[id]?.inventory?.[item];return typeof q==='number'?q:q?.quantity??0;}})),0),0);
 return Math.min(2,1+pending/(supply+pending));
}
