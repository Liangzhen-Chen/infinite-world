// Current normative facts, read only. These declarations are world/organization
// data, never fields in a proposal or a caller-supplied actedAs receipt.
import {aliveHoldings} from './holdings.mjs';
import {effective} from './holding-kinds.mjs';
import {organizationState} from './organization-state.mjs';
import {actionReader,capacity} from './action-capacity.mjs';
import {digest} from './storage.mjs';
import {institutionOffices,officeOnDuty} from './entity-view.mjs';

const live=(row,now)=>row&&!row.revoked&&row.endedAt===undefined&&(row.since??row.createdAt??0)<=now&&(row.until??row.expires??Infinity)>now;
const matches=(scope,op,target)=>Array.isArray(scope)&&scope.some(p=>typeof p==='string'?p===op:p?.op===op&&(p.target===undefined||p.target===target));
const civil=new Set(['transfer','holding.transfer','fact.set','destroy','move','obligation.create','obligation.settle','obligation.cancel']);

export function normativeAuthoritySources(context,{actor,op,target,code,roles=[],source=null,identity=null,eventId=null}){
 const {engine,document}=context,state=document.state,d=actionReader(document),now=state.minute,sources=[];
 const held=aliveHoldings(d,{holder:actor}).filter(h=>effective(d,h.id,{alive:id=>capacity(context,id,op).level!=='none',impaired:id=>capacity(context,id,op).level==='none'}));
 const sourceOf=(kind,id,facts,extra={})=>({kind,id,source:id,version:digest(facts),allowed:true,...extra});
 for(const office of institutionOffices(engine,state)){
  if(office.holder!==actor||!officeOnDuty(engine,state,office,actor)||!held.some(h=>h.kind==='holds_office'&&h.subject===office.id))continue;
  const powers=office.authority?.operations??[];
  // An institutional operation concerns this seat or its own organization,
  // never an arbitrary treasury, person or another organization's property.
  if(powers.includes(op)&&[office.id,office.organization].includes(target))sources.push(sourceOf('charter',office.id,office,{organization:office.organization,office:office.id}));
 }
 // A law delegation names a person, current role or current office and an
 // explicit op x target scope. Being a resident is not a delegation.
 for(const [index,row] of (Array.isArray(code?.delegation)?code.delegation:[]).entries()){
  if(!live(row,now)||!matches(row.scope,op,target))continue;
  if(!(row.actor===actor||row.role&&roles.includes(row.role)||row.office&&held.some(h=>h.kind==='holds_office'&&h.subject===row.office)))continue;
  sources.push(sourceOf('delegation',`${code.id}:delegation:${row.id??index}`,row,{law:code.id}));
 }
 // Issuer recognition is queryable by RX; it does not open src:* to proposals.
 const issuerKind=op==='mint'?'mint':op==='issue'?'notes':null;
 if(issuerKind){
  const issuers=code?.recognition?.issuers?.[issuerKind];
  if(Array.isArray(issuers)&&issuers.some(id=>id===actor||held.some(h=>h.kind==='holds_office'&&h.subject===id)))sources.push(sourceOf('recognition',`${code.id}:recognition:issuers:${issuerKind}`,issuers,{law:code.id}));
 }
 for(const holding of held.filter(h=>h.kind==='holds_office')){
  const office=document.holdings?.entities?.[holding.subject]?.facts??engine.byId.get(holding.subject),orgId=office?.org;
  if(!orgId)continue;
  const organization=organizationState(engine,state,orgId),facts=document.holdings?.entities?.[orgId]?.facts;
  const charter=organization?.charter??facts?.charter??engine.byId.get(orgId)?.charter;
  if(!charter)continue;
  const controls=target===orgId||aliveHoldings(d,{holder:orgId,subject:target}).some(h=>['owns','operates','administers'].includes(h.kind)&&effective(d,h.id));
  if(!controls)continue;
  const officeId=office.role??holding.subject;
  const powers=(charter.offices??[]).find(o=>o.id===officeId||o.id===holding.subject)?.powers??[];
  const declared=Array.isArray(charter.authority)?charter.authority:[];
  const grants=declared.filter(row=>live(row,now)&&row.offices?.some(id=>id===officeId||id===holding.subject));
  const exact=powers.includes(op)||grants.some(row=>matches(row.scope,op,target));
  const extra=exact?{}:civil.has(op)&&(powers.length||grants.length)?{tags:['ultra_vires']}:null;
  const charterSource=extra?sourceOf('charter',`${orgId}:authority:${holding.subject}`,{charter,holding},{organization:orgId,office:holding.subject,...extra}):null;
  // Executing a resolution requires today's office, organization control,
  // approved phase, and precisely the approved registered action and slots.
  let resolved=false;
  for(const motion of source?.kind==='catalog'&&identity&&powers.includes('execute')?Object.values(document.holdings?.entities??{}):[]){
   const row=motion.kind==='motion'&&motion.facts,resolution=row?.resolution;
   if(!row||row.body!==orgId||!(row.phase==='approved'||row.phase==='executing'&&eventId&&row.executionEvent===eventId)||!live(row,now)||resolution?.kind!=='execute'||resolution.action!==source.id||digest(resolution.args??{})!==digest(identity.slots??{}))continue;
   sources.push(sourceOf('resolution',motion.id,{row,holding,charter},{organization:orgId,office:holding.subject}));
   resolved=true;
  }
  if(charterSource&&(!resolved||exact))sources.push(charterSource);
 }
 return sources;
}
