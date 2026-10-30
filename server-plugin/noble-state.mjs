// Read-only jurisdiction views. Grants and occupation changes are facts; scope is derived.
import {regionOf} from './regions.mjs';
import {adminLevel} from './promotion-view.mjs';
import {isEffective} from './lifecycle-state.mjs';
import {registerAdvanceHook} from './advance-hooks.mjs';
import {recordsWhere} from './storage.mjs';

export const nobleRules=e=>e.rules.governance?.sovereignty;
export const highTitle=t=>['男爵','子爵','伯爵','侯爵','公爵'].includes(t?.title)&&['受封','停俸'].includes(t.status);
export const titlesOf=(s,who)=>Object.values(s.records??{}).filter(r=>r.category==='title'&&r.holder===who&&r.status!=='已除爵');
// The authored county lord keeps the outline's title until an explicit successor or dismissal.
export function nobleLords(e,s){
 const out=Object.values(s.records??{}).filter(highTitle),seen=new Set(out.map(t=>t.holder));
 for(const [county,record]of Object.entries(s.remote??{})){
  const region=e.world.regions?.find(c=>c.id===county),title=['男爵','子爵','伯爵','侯爵','公爵'].find(t=>region?.ruler?.title?.includes(t));if(!title)continue;
  const row=record.skeleton?.offices?.find(o=>o.level==='郡'&&o.source==='outline'),person=record.skeleton?.people?.find(p=>p.id===row?.holder);
  if(!person||seen.has(person.id)||!s.npcs?.[person.id]||!isEffective(e,s,person.id))continue;
  if(Object.values(s.records??{}).some(t=>t.category==='title'&&t.holder===person.id&&t.status==='已除爵'))continue;
  if(s.records?.[`territory:${county}`]&&s.records[`territory:${county}`].ruler!==person.id)continue;
  out.push({category:'title',holder:person.id,title,status:'受封',fief:county,domains:[county],source:`T142:${county}.ruler + current county office`});seen.add(person.id);
 }
 return out;
}
export const nationRows=s=>recordsWhere(s.records,'category','nation');
export const liveNation=(s,id)=>nationRows(s).find(n=>n.id===id&&['独立待定','独立','谈判中','内乱'].includes(n.status));
registerAdvanceHook('liveNation',liveNation);
export const rulerNation=(s,who)=>nationRows(s).find(n=>n.ruler===who&&liveNation(s,n.id));
export const localLevel=(e,s,id)=>adminLevel(e,s,id)?.level??e.world.settlementProfiles?.find(p=>p.id===id)?.level??e.world.regions?.find(r=>r.id===id)?.level??null;
const settlementIds=(e,s)=>[...new Set([...(e.world.settlementProfiles??[]).map(p=>p.id),...Object.keys(e.rules.governance?.promotion?.jurisdiction??{}),...Object.keys(s.settlements??{})])];
const royal=c=>c?.control==='human'&&c.ruler?.polity?.startsWith('王国');
export function containsDomain(e,s,domain,place){
 if(domain===place)return true;
 const r=e.world.regions?.find(r=>r.id===domain),regionalPlace=e.world.regions?.find(r=>r.id===place&&r.category==='county'),where=regionalPlace?{county:regionalPlace,province:e.world.regions.find(r=>r.id===regionalPlace.province)}:regionOf(e.world,place);
 if(r?.category==='county')return where?.county.id===domain;
 if(r?.category==='province')return where?.province.id===domain;
 const seen=new Set();for(let at=place;at&&!seen.has(at);at=e.byId.get(at)?.parent){if(at===domain)return true;seen.add(at);}
 for(let at=place;at&&!seen.has(`rank:${at}`);at=adminLevel(e,s,at)?.superior){if(at===domain)return true;seen.add(`rank:${at}`);}
 return false;
}
export function domainSettlements(e,s,domains){
 return settlementIds(e,s).filter(id=>domains.some(d=>containsDomain(e,s,d,id))&&!e.byId.get(id)?.monsterSociety&&!e.world.settlementProfiles?.find(p=>p.id===id)?.council);
}
export function currentDomains(e,s,who){
 if(!isEffective(e,s,who))return [];
 const nation=rulerNation(s,who);if(nation)return nation.domains.filter(id=>!s.records?.[`territory:${id}`]||s.records[`territory:${id}`].ruler===nation.id);
 const out=[];
 for(const t of titlesOf(s,who))if(highTitle(t))out.push(...t.domains??[t.fief].filter(Boolean));
 for(const t of nobleLords(e,s))if(t.holder===who)out.push(...t.domains??[t.fief].filter(Boolean));
 for(const r of Object.values(s.records??{})){
  if(r.category==='governance_office'&&r.holder===who&&r.office==='office_village_head'&&r.status==='在任'&&(r.until??Infinity)>s.minute)out.push(r.settlement);
  if(r.category==='territory'&&r.ruler===who)out.push(r.county);
 }
 return [...new Set(out)].filter(id=>{const ruler=s.records?.[`territory:${id}`]?.ruler;return !ruler||ruler===who||titlesOf(s,who).some(t=>highTitle(t)&&t.grantor===ruler&&(t.domains??[t.fief]).includes(id));});
}
export function fiefCandidates(e,s,title,who='player'){
 if(!nobleRules(e))return [];
 const owned=currentDomains(e,s,who),all=settlementIds(e,s).map(id=>e.world.settlementProfiles?.find(p=>p.id===id)??{id}).filter(p=>royal(regionOf(e.world,p.id)?.county)&&!e.byId.get(p.id)?.monsterSociety&&!p.council);
 const counties=(e.world.regions??[]).filter(c=>c.category==='county'&&royal(c));
 let candidates=[];
 if(title==='男爵'||title==='子爵')candidates=all.filter(p=>(title==='男爵'?['镇','城']:['城']).includes(localLevel(e,s,p.id))).map(p=>({id:p.id,domains:[p.id],level:localLevel(e,s,p.id)}));
 if(title==='伯爵')candidates=counties.map(c=>({id:c.id,domains:[c.id],level:'郡'}));
 if(title==='侯爵'||title==='公爵')candidates=(e.world.regions??[]).filter(p=>p.category==='province').flatMap(p=>{
  const children=counties.filter(c=>c.province===p.id);if(!children.length||title==='公爵'&&children.length!==p.counties.length)return [];
  const controlled=children.filter(c=>owned.some(d=>containsDomain(e,s,d,c.id)));
  return [{id:p.id,domains:title==='公爵'?[p.id]:controlled.map(c=>c.id),level:'省',counties:children.map(c=>c.id)}];
 });
 return candidates.map(c=>({...c,source:'T142九省郡县、当前聚落级别与任命/战后控制',eligible:c.domains.length>=(title==='侯爵'?2:1)&&c.domains.every(id=>owned.some(d=>containsDomain(e,s,d,id)))&&
  !nobleLords(e,s).some(t=>t.holder!==who&&(t.domains??[t.fief]).some(d=>c.domains.some(id=>containsDomain(e,s,d,id)||containsDomain(e,s,id,d))))}));
}
export function appointmentSource(e,s,settlement){
 const level=localLevel(e,s,settlement),r=e.world.regions?.find(r=>r.id===settlement),county=r?.category==='county'?r:regionOf(e.world,settlement)?.county;
 if(!nobleRules(e)||!['镇','城','郡','省'].includes(level)||!(r?.category==='province'?(r.counties??[]).every(id=>royal(e.world.regions.find(c=>c.id===id))):royal(county)))return null;
 return {id:level==='镇'?`county-appointments:${county.id}`:'auth_capital_domain_registry',institution:level==='镇'?`${county.name}任免院`:'王都版籍署',seat:level==='镇'?county.seat?.location??'loc_capital':'loc_capital',channel:'bld_bs_office',level,settlement,decisionDays:nobleRules(e).appointmentDays,source:'T142辖属与U16任免章'};
}
export function domainPopulation(e,s,domains){
 // Count current settlement ledgers only, never T142's approximate prose population.
 return domainSettlements(e,s,domains).reduce((sum,id)=>sum+Math.max(0,s.settlements?.[id]?.population??0),0);
}
export function territoryController(e,s,place){
 const territories=Object.values(s.records??{}).filter(t=>t.category==='territory'&&containsDomain(e,s,t.county,place));
 return territories.sort((a,b)=>containsDomain(e,s,a.county,b.county)?1:containsDomain(e,s,b.county,a.county)?-1:(b.minute??0)-(a.minute??0))[0]?.ruler??null;
}
export function nationAt(e,s,place){return nationRows(s).find(n=>liveNation(s,n.id)&&n.domains.some(id=>containsDomain(e,s,id,place))&&
 (!territoryController(e,s,place)||territoryController(e,s,place)===n.id))??null;}
export function domainAuthority(e,s,who,settlement,power){
 if(!settlement||!['housing','steward','public_project','tax'].includes(power)||!isEffective(e,s,who))return null;
 const n=rulerNation(s,who),t=nobleLords(e,s).find(t=>t.holder===who);if(!n&&!t)return null;
 const controller=territoryController(e,s,settlement);if(controller&&controller!==(n?.id??who)&&controller!==t?.grantor)return null;
 if(!currentDomains(e,s,who).some(id=>containsDomain(e,s,id,settlement))||e.byId.get(settlement)?.monsterSociety||e.world.settlementProfiles?.find(p=>p.id===settlement)?.council)return null;
 const def=e.rules.governance.authority.offices.office_village_head,rank=upperOffice(e,s,{office:def.id,settlement},def);
 return {id:`domain-authority:${who}:${settlement}`,holder:who,settlement,office:'upper_lord',powers:['housing','steward','public_project','tax'],monthlyBudgetCopper:rank.monthlyBudgetCopper,monthlyQuotaD:0,source:n?`nation:${n.id}`:t.source??t.id};
}
export function upperOffice(e,s,row,base){
 const level=localLevel(e,s,row.settlement),r=nobleRules(e);if(!r||!r.officeBudget[level])return base;
 if(row.office!=='office_village_head')return base;
 return {...base,name:{镇:'镇长',城:'城主',郡:'郡守',省:'省督'}[level],monthlyQuotaD:e.rules.quests.monthlyQuotaD[{镇:'townHead',城:'cityHeadFirstBaron',郡:'countyHead',省:'provinceHead'}[level]],monthlyBudgetCopper:r.officeBudget[level],taxBps:{min:0,max:level==='镇'?1000:r.maxTaxBps}};
}
