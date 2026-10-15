import {nationAt,nationRows,liveNation} from './noble-state.mjs';
// Executable jurisdictions are views of current places, rulers and offices.
import {regionOf} from './regions.mjs';
import {standing} from './standing.mjs';
import {personOffices,personCareer,settlementHead} from './entity-view.mjs';
import {adminLevel} from './promotion-view.mjs';

export const legalTemplate=(world,county)=>world.rules.law?.templates?.find(t=>t.polity===(county.ruler.polity.startsWith('王国')?'王国':county.ruler.polity)&&(!t.province||t.province===county.province));
export const legalStaffing=level=>level==='村'?1:level==='镇'?2:3;
const places=world=>new Map(world.locations.map(l=>[l.id,l]));
function settlementOf(world,id){const byId=places(world),seen=new Set();for(let at=id;at&&!seen.has(at);at=byId.get(at)?.parent){seen.add(at);if(world.settlementProfiles?.some(s=>s.id===at))return at;}return id;}
function authorities(world,state,settlement,kind){
 const engine={world,rules:world.rules,byId:new Map([...world.npcs,...world.residents??[],...world.locations].map(n=>[n.id,n]))};
 const office=Object.values(state?.records??{}).filter(r=>r.category==='governance_office'&&r.settlement===settlement);
 const current=office.filter(r=>personOffices(engine,state,r.holder,{settlement,power:kind}).length).map(r=>r.holder);
 const head=settlementHead(engine,state,settlement).value;
 if(kind==='judge'&&head)current.push(head);
 const pool=[...world.npcs,...world.residents??[]];
 const generated=pool.filter(n=>n.generated==='remote'&&n.settlement===settlement&&n.remoteRole==='official'&&
  (!n.judicialRole||kind==='judge'&&n.judicialRole!=='officer'||kind==='officer'&&n.judicialRole==='officer')&&
  personCareer(engine,state,n.id).value.occupation===n.occupation&&(!n.office||head===n.id)).map(n=>n.id);
 return [...new Set([...current,...generated])].filter(id=>!state?.records?.[`legal_dismissal:${id}`]&&!['死亡','濒死'].includes(state?.npcs?.[id]?.status));
}
const geometry=new WeakMap();
export function legalCodes(world,state={}){
 const original=world.rules.law?.codes??[];
 if(!world.rules.law?.templates?.length||!world.remoteCounties?.length)return nationLegalCodes(world,state,original);
 let groups=geometry.get(world);
 if(!groups){groups=new Map();const occupied=new Set(original.flatMap(c=>c.locations));
 for(const l of world.locations){if(occupied.has(l.id))continue;const region=regionOf(world,l.id),t=region&&world.remoteCounties.includes(region.county.id)&&legalTemplate(world,region.county);if(!t)continue;
  const own=settlementOf(world,l.id),sid=world.settlementProfiles?.some(s=>s.id===own)?own:world.settlementProfiles?.find(s=>s.county===region.county.id&&s.kind==='seat')?.id??own;
  const key=`${t.id}:${sid}`;if(!groups.has(key))groups.set(key,{template:t,county:region.county,sid,locations:[]});groups.get(key).locations.push(l.id);
 }
 geometry.set(world,groups);}
 const derived=[];
 for(const {template:t,county,sid,locations}of groups.values()){
  const court=world.locations.find(l=>l.scope===sid&&/官署|议事区/.test(l.purpose??''))?.id??(locations.includes(sid)?sid:locations[0]);
  const level=adminLevel({world,rules:world.rules},state,sid)?.level??world.settlementProfiles?.find(p=>p.id===sid)?.level??'村';
  derived.push({...t,id:`${t.id}:${sid}`,template:t.id,derived:true,county:county.id,province:county.province,settlement:sid,
   faction:county.ruler.faction??null,polity:t.polity,locations,court,
   judges:authorities(world,state,sid,'judge'),officers:authorities(world,state,sid,'officer').slice(0,legalStaffing(level))});
 }
 return nationLegalCodes(world,state,[...original,...derived]);
}
function nationLegalCodes(world,state,codes){
 if(!nationRows(state).some(n=>liveNation(state,n.id)))return codes;
 const engine={world,rules:world.rules,byId:new Map([...world.locations,...world.npcs].map(r=>[r.id,r]))},out=[];
 for(const code of codes){
  const grouped=new Map();for(const loc of code.locations){const n=nationAt(engine,state,loc),key=n?.id??null;if(!grouped.has(key))grouped.set(key,{n,locations:[]});grouped.get(key).locations.push(loc);}
  for(const {n,locations}of grouped.values()){if(!n){out.push({...code,locations});continue;}
   out.push({...code,id:`nationlaw:${n.id}:${code.id}`,nation:n.id,originalCode:code.id,polity:n.id,faction:n.id,locations,penalties:{...code.penalties,...n.amendments},judges:[...new Set([n.ruler,...authorities(world,state,code.settlement??locations[0],'judge')])],officers:code.officers});
  }
 }return out;
}
export function legalCodeAt(engine,location,state={}){return legalCodes(engine.world,state).find(c=>c.locations.includes(location))??null;}
export function legalCodeById(engine,id,state={}){return legalCodes(engine.world,state).find(c=>c.id===id)??engine.rules.law?.codes?.find(c=>c.id===id)??null;}
export function courtHierarchy(engine,state,code){
 if(code.nation)return [{level:0,name:'本国初审',court:code.court,judges:code.judges,code:code.id},{level:1,name:'本国复审',court:liveNation(state,code.nation)?.capital,judges:[liveNation(state,code.nation)?.ruler].filter(Boolean),code:code.id}];
 const all=legalCodes(engine.world,state),county=engine.world.regions?.find(r=>r.id===(code.county??regionOf(engine.world,code.court)?.county.id));
 const t=code.template?engine.rules.law.templates.find(t=>t.id===code.template):county&&legalTemplate(engine.world,county);
 if(!t)return null;
 // A home county has authored villages and is not regenerated. Its province's
 // seat accepts their appellate papers through the existing county office there.
 const province=engine.world.regions?.find(r=>r.id===county?.province);
 const countySeat=county?.seat?.location??state.remote?.[county?.id]?.skeleton.seat??(t.polity==='王国'?province?.seat?.location:null);
 const second=all.find(c=>c.locations.includes(countySeat));
 const final=t.polity==='王国'?all.find(c=>c.locations.includes('loc_capital')):all.find(c=>c.polity===t.polity&&c.county===county?.id&&c.locations.includes(countySeat));
 return [code,second,final].map((c,index)=>({level:index,name:t.courts[index],court:c?.court??(index===2&&t.polity==='王国'?'loc_capital':countySeat),
  judges:!c?[]:index===0?c.judges:c.judges.filter(id=>engine.byId.get(id)?.judicialRole===(index===1?'review':'final')),code:c?.id??null}));
}
export function courtFacilities(engine,state,settlement){
 const code=legalCodeAt(engine,settlement,state);if(!code)return null;
 const level=adminLevel(engine,state,settlement)?.level??engine.world.settlementProfiles?.find(p=>p.id===settlement)?.level??'村';
 return{court:code.court,name:code.courts?.[0]??'地方初审',level,officers:code.officers,judges:code.judges,law:code.id,
  staffing:legalStaffing(level),vacancies:Math.max(0,legalStaffing(level)-code.officers.length),source:'当前聚落级别、职业与任职派生'};
}
export function legalCooperation(engine,state,from,to){
 if(from.id===to.id)return{notices:true,extradition:true,reason:'本辖区'};
 const ar=regionOf(engine.world,from.court)?.county,br=regionOf(engine.world,to.court)?.county;
 const a=from.faction??ar?.ruler.faction??ar?.id??from.settlement??from.id,b=to.faction??br?.ruler.faction??br?.id??to.settlement??to.id;
 const pair=[a,b].sort().join(':');
 const sidesA=[a,ar?.id],sidesB=[b,br?.id];
 const war=Object.values(state.records??{}).find(w=>w.category==='war'&&['交战','停战'].includes(w.status)&&
  (sidesA.includes(w.aggressor)&&sidesB.includes(w.defender)||sidesB.includes(w.aggressor)&&sidesA.includes(w.defender)));
 const score=Math.min(standing(engine,state,a,b),standing(engine,state,b,a));
 if(war||score<=-30)return{notices:false,extradition:false,reason:war?'交战或停战，司法协作暂停':'敌对立场'};
 const same=(from.polity??'王国')===(to.polity??'王国'),ally=state.records?.[`diplomacy:${pair}`]?.status==='结盟';
 const explicit=engine.rules.law?.polities?.find(p=>p.law===from.id)?.cooperates?.includes(to.id);
 return{notices:same||ally||score>=10||Boolean(explicit),extradition:same||ally||score>=30||Boolean(explicit),reason:same?'同政体司法协作':ally?'结盟司法协作':'双方立场'};
}
// The polity template a code belongs to: its own template, or (five original
// village codes) the L1 code of the county ruler where its court sits.
export function codeTemplate(engine,code){
 if(!code)return null;const templates=engine.rules.law?.templates??[];
 if(code.template)return templates.find(t=>t.id===code.template)??null;
 const county=regionOf(engine.world,code.court??code.settlement??code.locations?.[0])?.county;
 return county?legalTemplate(engine.world,county)??null:null;
}
// A code's sentence for an offense: the code itself, then its polity's L1 code.
export function codePenalty(engine,code,offense){return code?.penalties?.[offense]??codeTemplate(engine,code)?.penalties?.[offense]??null;}
// R10A: who judges unlicensed mining here, derived from where the place is now.
// A registered code (or its settlement's) files a case under the local polity's
// sentence; autonomous settlements answer to their own council's custom; polity
// land without a staffed court reads the polity's L1 code but has no executor.
// Missing data is an error, never a borrowed village code.
export function miningJurisdiction(engine,state,location,offense='illegal_mining'){
 const world=engine.world,byId=new Map(world.locations.map(l=>[l.id,l])),profiles=new Map((world.settlementProfiles??[]).map(p=>[p.id,p]));
 const codes=legalCodes(world,state);let code=codes.find(c=>c.locations.includes(location))??null;
 const chain=[];for(let at=location,seen=new Set();at&&!seen.has(at);at=byId.get(at)?.parent){seen.add(at);chain.push(at);}
 if(!code)for(const at of chain){code=codes.find(c=>c.settlement===at)??null;if(code)break;if(profiles.has(at))break;}
 if(code){
  const penalty=codePenalty(engine,code,offense),template=codeTemplate(engine,code);
  if(!penalty)throw Error(`法典 ${code.id} 缺少${offense}罪名`);
  return{kind:'code',code,law:code.id,polity:code.polity??(template?.polity??null),template:template?.id??null,penalty,stance:template?.stances?.mining??null,executable:true};
 }
 const autonomy=engine.rules.law?.autonomy;
 for(const at of chain){
  const place=byId.get(at),profile=profiles.get(at);
  const tribal=profile?.generated==='tribal'?profile.council:null;
  const society=place?.monsterSociety?(world.factions??[]).find(f=>f.kind==='聚居地议事'&&f.contactAnchor===at)?.id:null;
  if(!tribal&&!society)continue;
  const holder=society??tribal,rule=(society?autonomy?.factions?.[society]:autonomy?.tribal)?.offenses?.[offense];
  if(!rule)throw Error(`自治地 ${at} 的所属势力 ${holder} 缺少${offense}规矩`);
  return{kind:'faction',settlement:at,faction:holder,rule,executable:false};
 }
 const county=regionOf(world,location)?.county,template=county&&legalTemplate(world,county);
 if(!template)throw Error(`${location} 无法派生所属政体法典`);
 const penalty=template.penalties?.[offense];if(!penalty)throw Error(`法典 ${template.id} 缺少${offense}罪名`);
 return{kind:'polity',law:template.id,polity:template.polity,template:template.id,county:county.id,penalty,stance:template.stances?.mining??null,executable:false};
}
