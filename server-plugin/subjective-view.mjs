// A2 / I25. No cross-world cache: every projection belongs to this document.
import {personCareer} from './entity-view.mjs';
import {recordsWhere,recordsMemo} from './storage.mjs';
const ownedAccounts=Symbol('subjective own accounts');
const ownedHoldings=Symbol('subjective own holdings');

const copy=x=>structuredClone(x);
const active=o=>['待履行','进行中','在任','有效'].includes(o.status);
const actor=(s,id)=>id==='player'?s.player:s.npcs?.[id];
const location=(s,id)=>id==='player'?s.location:actor(s,id)?.location;
const base=(e,s,id)=>s.created?.[id]??s.family?.people?.[id]??e.byId.get(id)??{};
const dimensions=['trust','affection','respect','fear','romance','competition'];
export function subjectiveView(engine,document,observer){
 const s=document.state,n=actor(s,observer);if(!n)throw Error('观察者不存在');
 const b=base(engine,s,observer),here=location(s,observer),now=s.minute??0;
 const present=id=>Boolean(here&&location(s,id)===here&&!actor(s,id)?.scheduleTravel&&!actor(s,id)?.cognitionTravel);
 const registeredRumors=[...(engine.world.rumors??[]),...(engine.world.settlementProfiles??[]).flatMap(p=>p.details?.rumors??[])];
 const seeds=registeredRumors.filter(r=>r.source===observer||r.carriers?.includes(observer)).map(r=>({id:`rumor_seed:${r.id}:${observer}`,rootMemoryId:`rumor_seed:${r.id}:${r.source}`,rumor:r.id,rumorSource:r.source,sourceEvent:`rumor_registration:${r.id}`,kind:'rumor',minute:0,occurredAt:0,content:r.claim,sourceType:'传闻',salience:2,participants:[],reliability:'未证实',transmissionChain:observer===r.source?[]:[{from:r.source,to:observer,minute:0,channel:'registered',content:r.claim,distortion:'仅由已登记的携带者版本'}]}));
 // Memories already delivered to this observer are versions, never pointers
 // dereferenced against the current truth. Written clauses retain their text.
 const events=recordsWhere(s.records,'category','world_event');
 const witnessed=events.filter(r=>r.actor===observer||r.witnesses?.includes(observer)).map(e=>({id:e.id,sourceEvent:e.id,kind:e.verb,minute:e.minute,content:e.summary??e.verb,sourceType:'目击',participants:[e.actor,e.target].filter(Boolean)}));
 const memories=[...seeds,...witnessed,...Object.values(document.memories??{}).filter(m=>m.subject===observer),...(n.memoryStream??[]),...(b.knowledgeSeeds??[]),...recordsWhere(s.records,'category','knowledge').filter(r=>r.observer===observer)]
  .filter(m=>(m.minute??0)<=now&&m.recall!==0&&(!m.private||m.subject===observer||m.participants?.includes(observer)||(m.knownBy??m.permittedRecipients??[]).includes(observer)))
  .map(m=>n.cognition?.blurred?.[m.id]?{...copy(m),content:n.cognition.blurred[m.id].content,blurred:true}:copy(m));
 const beliefs=memories.filter(m=>m.kind==='belief'&&!m.retracted);
 const facts={};
 const quality=m=>(m.kind==='belief'?1:['亲历','目击','见证','reveal'].includes(m.sourceType??m.kind)?4:m.sourceType==='传闻'?2:3)*(m.credence??1);
 const ranked=new Map();
 for(const m of memories.filter(m=>!m.retracted)){
  const key=m.proposition??m.key??m.id;if(!key)continue;
  const old=ranked.get(key);if(!old||quality(m)>quality(old)||quality(m)===quality(old)&&(m.minute??0)>=(old.minute??0))ranked.set(key,m);
 }
 for(const [key,m]of ranked)facts[key]={value:copy(m.value??m.content??null),source:m.sourceEvent??m.id??key,kind:m.kind??'knowledge',credence:m.credence??1};
 const relations={};
 for(const id of new Set(['player',...Object.keys(n.relationships??{}),...(b.relationships??[]).map(r=>r.with)])){
  const r=n.relationships?.[id]??b.relationships?.find(r=>r.with===id)??(id==='player'?n:{});
  relations[id]=Object.fromEntries(dimensions.map(k=>[k,r[k]??0]));relations[id].favors=copy(r.favors??[]);
 }
 const signedParty=(o,side)=>o.inheritedEndpoints?.includes(side)?o.inheritanceFrom:o[side];
 const clauses=Object.values(s.obligations??{}).filter(o=>o.recall!==0&&(o.debtor?
  [signedParty(o,'debtor'),signedParty(o,'creditor')].includes(observer)||memories.some(m=>m.obligation===o.id&&m.participants?.includes(observer)):
  [o.promisor,o.promisee].includes(observer))).map(o=>{
  if(o.debtor)return {id:o.id,type:o.kind,promisor:signedParty(o,'debtor'),promisee:signedParty(o,'creditor'),content:o.content??o.terms?.service,signingPlace:o.terms?.signingPlace,signingMinute:o.terms?.signingMinute};
  const {id,type,promisor,promisee,content,start,deadline,coins,item,quantity,destination,location}=o;
  // A remote counterparty's settlement, disappearance or breach isn't sensed.
  return Object.fromEntries(Object.entries({id,type,promisor,promisee,content,start,deadline,coins,item,quantity,destination,location}).filter(([,v])=>v!==undefined));
 });
 const obligations=Object.values(s.obligations??{}).filter(o=>[o.promisor,o.promisee,o.debtor,o.creditor].includes(observer)&&present(o.promisor??o.debtor)&&present(o.promisee??o.creditor)).map(copy);
 const byHolder=recordsMemo(document.holdings?.rows,ownedHoldings,()=>{
  const groups=new Map();for(const h of Object.values(document.holdings?.rows??{})){
   if(!groups.has(h.holder))groups.set(h.holder,[]);groups.get(h.holder).push(h);
  }return groups;
 });
 const holdings=(byHolder.get(observer)??[]).filter(h=>present(h.subject)).map(copy);
 const people=Object.keys(s.npcs??{}).filter(present).map(id=>{
  const p=actor(s,id),def=base(engine,s,id);
  return {id,name:p.name??def.name??id,status:p.status,activity:p.activity??'',services:personCareer(engine,s,id).value.services};
 });
 const ownEvents=events.filter(e=>e.actor===observer).map(copy);
 const byOwner=recordsMemo(document.ledger?.accounts,ownedAccounts,()=>{
  const groups=new Map();for(const entry of Object.entries(document.ledger?.accounts??{})){
   const [owner,,purpose]=entry[0].split('|');if(!['purse','inventory'].includes(purpose))continue;
   if(!groups.has(owner))groups.set(owner,[]);groups.get(owner).push(entry);
  }return groups;
 });
 const accounts=Object.fromEntries((byOwner.get(observer)??[]).map(([key,balance])=>[key,{balance,lots:(document.ledger?.lots?.[key]??[]).map(l=>l.purports?{...copy(l.purports),amount:l.amount}:copy(l))}]));
 const busyUntil=Math.max(now,...Object.values(s.npcAutonomy?.tasks??{}).filter(t=>t.status==='进行中'&&t.npc===observer&&t.start<=now).map(t=>t.finish));
 const self={id:observer,name:n.name??b.name??observer,status:n.status,location:here,coins:n.coins??0,inventory:copy(observer==='player'?s.inventory??{}:n.inventory??{}),
  mental:copy(n.mental??{}),activity:n.activity??'',traits:copy(b.personality??{}),redLines:copy(b.redLines??[]),minor:Boolean(b.flags?.minor||(n.age??b.age??100)<18),culture:b.culture??'common',
  body:{hp:n.hp??null,mp:n.mp??null,status:n.status??null},accounts,relations,goals:copy(n.goals??b.goals??{}),plan:copy(n.plan??null),busyUntil,clauses,obligations,holdings,events:ownEvents};
 const observable={location:here,people,season:engine.calendar?.(now)?.season??null,weather:copy(s.weather?.[here]??null),quotes:copy(s.marketReports?.[here]??null),
  services:people.flatMap(p=>p.services.map(service=>({provider:p.id,name:p.name,service})))};
 const prior=copy(b.priors??{});
 return {observer,minute:now,self,observable,knowledge:{memories,beliefs,facts},prior};
}
export function subjectiveFact(view,key){return view.knowledge.facts[key]??(Object.hasOwn(view.prior,key)?{value:view.prior[key],kind:'prior',credence:0.5}:null);}
export const knownActiveObligations=view=>view.self.obligations.filter(active);

// Shared spoken-language/interpreter check for conversations and admission.
export function conversationLanguage(view,engine,d){
 const b=engine.byId.get(view.observer),player=d.get('state','player');
 const a=player.languages??engine.rules.languages?.default??['lang:common'],n=b.languages??['lang:common'];
 const ids=x=>Array.isArray(x)?x:Object.keys(x).filter(k=>x[k]>0);
 if(ids(a).some(x=>ids(n).includes(x)))return {degree:2,interpreter:null};
 const interpreter=view.observable.people.find(p=>{const langs=ids(engine.byId.get(p.id)?.languages??[]);return p.id!==view.observer&&langs.some(l=>ids(a).includes(l))&&langs.some(l=>ids(n).includes(l));});
 return interpreter?{degree:1,interpreter:interpreter.id}:null;
}
