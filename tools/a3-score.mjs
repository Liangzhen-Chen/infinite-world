import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {loadWorld} from './load-world.mjs';
import {WorldEngine,skillGrade} from '../server-plugin/engine.mjs';
import '../server-plugin/primitives-runtime.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {PRIMITIVE_IDS,PrimitiveRejected} from '../server-plugin/primitive-policy.mjs';
import {worldActions} from '../server-plugin/action-affordances.mjs';
import {ActionBuilder,builderStep} from '../extension/action-builder.mjs';
import {builderToolCall} from '../extension/tools.mjs';
import {openLedger,auditLedger} from '../server-plugin/ledger.mjs';
import {isGone,isPhysicallyDead,bookHoldingsUpgrade,openHoldings,aliveHoldings,declareHoldingWriter,holdingSet,createEntity,updateEntity,openHolding,setLocation,ensureHoldings} from '../server-plugin/holdings.mjs';
import {initialNpcState} from '../server-plugin/npc-state.mjs';
import {monsterStats} from '../server-plugin/combat.mjs';
import {spiritStateFor} from '../server-plugin/creature-nature.mjs';
import {applyMagicStatus} from '../server-plugin/magic-status.mjs';
import {createRoutingContext} from '../server-plugin/action-router.mjs';
import {canonicalActionId,findAction} from '../server-plugin/action-registry.mjs';
import {primitiveRuntime,actionEffects} from '../server-plugin/primitives-runtime.mjs';
import {resolvePrimitiveTransfer} from '../server-plugin/primitive-accounts.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const setupWriter='a3-score-setup';
declareHoldingWriter(setupWriter,{kinds:['*'],entities:['office'],locations:true});
export const oldCorpusPath=path.join(root,'tests/fixtures/a3-intents.json');
export const v2CorpusPath=path.join(root,'tests/fixtures/a3-intents-v2.json');
export async function loadCorpus({corpusPath}={}){
 let selected=corpusPath??v2CorpusPath,raw;
 try{raw=await fs.readFile(selected,'utf8');}
 catch(error){if(corpusPath||error.code!=='ENOENT')throw error;selected=oldCorpusPath;raw=await fs.readFile(selected,'utf8');}
 return {rows:JSON.parse(raw.replace(/^\uFEFF/,'')),corpusPath:selected};
}
const receiptOf=value=>value?.result?.receipt??value?.receipt??null;
const unique=values=>[...new Set(values)].sort();
const clarifyStates=new Set(['needs_entities','needs_slots']);
const routeName=(route,registry)=>canonicalActionId(registry,({拒绝:'reject',rejected:'reject',refuse:'reject',澄清:'clarify',clarification:'clarify'}[route]??route));

// Fixture construction before the measured action, using the same balance
// construction + openLedger approach as tests/helpers/ledger-sync.mjs.
// status: player status string, {entityId: statusString}, or an array of
// {target, status, power, duration} for the native magic status writer.
// facts: [{path:['state', ...existingFieldPath], value: ...}].
// abilities are initial player knowledge, not successful learning actions:
// skills/literacy -> state.skills; spells/recipes -> their native partitions;
// profession licenses -> state.professions + the native holding projection.
export function applyIntentSetup(engine,initial,setup){
 let document=structuredClone(initial),s=document.state;
 const setupUnmet=[],notes=[],bindings={};
 if(setup===undefined)return {document,setupUnmet};
 const unmet=(item,reason)=>setupUnmet.push({item,reason});
 const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
 const actor=id=>id==='player'||id==='self'?s.player:Object.hasOwn(s.npcs??{},id)?s.npcs[id]:Object.hasOwn(s.creatures??{},id)?s.creatures[id]:null;
 if(!object(setup)){unmet('setup','expected an object');return {document,setupUnmet};}
 const native=(item,write)=>{
  try{const d=engine.primitiveDraft(document);if(!ensureHoldings(d,engine))throw Error('unsupported holdings version');write(d);document=d.document;s=document.state;return true;}
  catch(error){unmet(item,error.message);return false;}
 };
 const ref=id=>bindings[id]??(id==='self'?'player':id);
 for(const key of Object.keys(setup))if(!['location','present','inventory','coins','minute','status','facts','abilities','instances','holdings'].includes(key))unmet(key,'unsupported setup field');
 if(Object.hasOwn(setup,'minute')){
  if(Number.isSafeInteger(setup.minute)&&setup.minute>=0)s.minute=setup.minute;
  else unmet('minute','expected a nonnegative safe integer');
 }
 const move=(id,body,location)=>{
  if(id==='player')s.location=location;else body.location=location;
  if(document.holdings?.locations?.[id])Object.assign(document.holdings.locations[id],{at:location,mode:'place',since:s.minute});
 };
 if(Object.hasOwn(setup,'location')){
  if(engine.world.locations.some(l=>l.id===setup.location))move('player',s.player,setup.location);
  else unmet('location',`unknown location: ${setup.location}`);
 }
 // 01 §1.2 / A.15.7: instantiate a declared individual from its world
 // definition, not by capturing another wild animal or inventing a species.
 if(Object.hasOwn(setup,'instances')){
  if(!Array.isArray(setup.instances))unmet('instances','expected an array');
  else for(const [index,row] of setup.instances.entries()){
   const item=`instances[${index}]`;
   if(!object(row)||typeof row.id!=='string'||!row.id.trim()||row.name!==undefined&&(typeof row.name!=='string'||!row.name.trim())){unmet(item,'missing instance ID or invalid name');continue;}
   if(actor(row.id)||bindings[row.id]||Object.hasOwn(s.created??{},row.id)){unmet(item,'instance ID already exists');continue;}
   if(!engine.world.locations.some(l=>l.id===row.location)&&row.kind!=='office'){unmet(item,'unknown instance location');continue;}
   const allowed={creature:['id','template','kind','species','name','location','facts'],person:['id','source','template','kind','name','age','culture','faction','location'],office:['id','template','kind','name','organization','seat','authority']}[row.kind];
   if(!allowed||Object.keys(row).some(k=>!allowed.includes(k))||row.template!==(row.kind==='office'?'office':'agent')){unmet(item,'unsupported instance template or field');continue;}
   if(row.kind==='creature'){
    const species=engine.world.monsters.find(m=>m.id===row.species),facts=row.facts??{};
    if(!species||!object(facts)||Object.keys(facts).some(k=>!['hunger','trust','following'].includes(k))||Object.hasOwn(facts,'hunger')&&(!Number.isSafeInteger(facts.hunger)||facts.hunger<0||facts.hunger>100)||Object.hasOwn(facts,'trust')&&(!Number.isSafeInteger(facts.trust)||facts.trust<0||facts.trust>100)||Object.hasOwn(facts,'following')&&facts.following!=='player'){
     unmet(item,'unknown species or unsupported creature facts');continue;
    }
    native(item,d=>{
     const level=species.levelRange[0],stats=monsterStats({level,template:species.template},engine.rules);
     holdingSet(d,engine,['state','created',row.id],{id:row.id,name:row.name??species.name,aliases:[],monster:species.id,template:species.template,scope:row.location},setupWriter);
     holdingSet(d,engine,['state','creatures',row.id],{name:row.name??species.name,species:species.id,location:row.location,level,hp:stats.maxHp,maxHp:stats.maxHp,status:'正常',owner:null,...spiritStateFor(species),since:s.minute,
      ...(Object.hasOwn(facts,'hunger')||Object.hasOwn(facts,'trust')?{care:{version:1,hunger:facts.hunger??20,fatigue:0,mood:60,loyalty:50,sickness:false,sickHours:0,neglectHours:0,nextTick:s.minute+60,bond:facts.trust??0,contactDay:-1,feedDay:-1,groomDay:-1,trainDay:-1,skills:{},experience:0}}:{})},setupWriter);
     setLocation(d,{entity:row.id,at:row.location,mode:'place',writer:setupWriter,engine});
    });
   }else if(row.kind==='person'){
    const person=(engine.world.factionPeople??[]).find(p=>p.id===row.id)??engine.world.npcs.find(p=>p.id===row.id)??engine.world.residents?.find(p=>p.id===row.id);
    if(!person||row.source!==undefined&&row.source!=='world/lore/factionPeople.json'||['name','age','culture','faction'].some(k=>Object.hasOwn(row,k)&&row[k]!==person[k])){unmet(item,'missing world person or conflicting authored identity');continue;}
    native(item,d=>{
     const definition={...structuredClone(person),location:row.location};
     holdingSet(d,engine,['state','created',row.id],definition,setupWriter);
     holdingSet(d,engine,['state','npcs',row.id],initialNpcState(definition),setupWriter);
     setLocation(d,{entity:row.id,at:row.location,mode:'place',writer:setupWriter,engine});
    });
   }else{
    if(typeof row.name!=='string'||!engine.world.locations.some(l=>l.id===row.seat)||!engine.world.locations.some(l=>l.id===row.organization)&&!engine.world.factions.some(f=>f.id===row.organization)){unmet(item,'invalid office name, organization or seat');continue;}
    const id=row.id.startsWith('office_')?row.id:`office_${row.id}`;
    if(native(item,d=>{
     const {id:alias,template,kind,...facts}=row;
     createEntity(d,{id,kind:'office',facts:{...facts,aliases:[alias]},source:`${setupWriter}:${alias}`,writer:setupWriter});
     setLocation(d,{entity:id,at:row.seat,mode:'place',writer:setupWriter,engine});
    }))bindings[row.id]=id;
   }
  }
 }
 // 01 §1.3 / A.15.24: native IDs and variants remain authoritative. Corpus
 // IDs are aliases for references such as abilities.licenses, never row IDs.
 if(Object.hasOwn(setup,'holdings')){
  if(!Array.isArray(setup.holdings))unmet('holdings','expected an array');
  else for(const [index,row] of setup.holdings.entries()){
   const item=`holdings[${index}]`;
   if(!object(row)||typeof row.id!=='string'||bindings[row.id]||Object.keys(row).some(k=>!['id','name','kind','holder','subject','terms','grantedBy'].includes(k))||row.terms!==undefined&&!object(row.terms)){unmet(item,'invalid holding declaration');continue;}
   const terms=structuredClone(row.terms??{}),variant=row.kind==='guest_of'?terms.mode:null;
   if(row.kind==='guest_of'&&terms.regime!==undefined&&terms.regime!=='custody.default'){unmet(item,'unknown custody regime');continue;}
   // The native canAct/effective readers implement custody.default when the
   // regime override is absent. Preserve the registered reference as a note.
   if(terms.regime==='custody.default')delete terms.regime;
   let id;
   if(native(item,d=>{
    if(row.kind==='tamed_by'&&d.get('state','creatures',row.subject)){
     if(Object.keys(terms).length||row.grantedBy!==undefined)throw Error('unsupported tamed_by terms');
     if(d.get('state','creatures',row.subject,'owner'))throw Error('creature already has a keeper');
     // Use the same owner writer as native tame(), which opens the tamed_by
     // ledger edge via its registered source adapter. No taming roll is run.
     holdingSet(d,engine,['state','creatures',row.subject,'owner'],ref(row.holder),setupWriter);
     id=aliveHoldings(d,{kind:'tamed_by',holder:ref(row.holder),subject:row.subject}).find(h=>h.source===`tamed:${row.subject}`)?.id;
     if(!id)throw Error('native tamed_by source did not establish the holding');
    }else id=openHolding(d,{kind:row.kind,variant,holder:ref(row.holder),subject:ref(row.subject),terms,grantedBy:ref(row.grantedBy),source:`${setupWriter}:${row.id}`,writer:setupWriter,engine});
   })){
    bindings[row.id]=id;
    if(row.terms?.regime==='custody.default')notes.push(`${item}.terms.regime: custody.default uses the native default canAct/effective policy`);
   }
  }
 }
 for(const [index,row] of (Array.isArray(setup.instances)?setup.instances:[]).entries())if(row?.kind==='creature'&&row.facts?.following!==undefined){
  native(`instances[${index}].facts.following`,d=>{
   const holder=ref(row.facts.following),rights=aliveHoldings(d,{holder,subject:row.id}),species=engine.world.monsters.find(m=>m.id===row.species);
   if(!d.get('state','creatures',row.id)||!rights.some(h=>h.kind==='owns')||!rights.some(h=>h.kind==='tamed_by')||!species?.tamingRule)throw Error('following requires loaded owns/tamed_by holdings and a native pet rule');
   holdingSet(d,engine,['state','pets',row.id],{petFormat:1,creature:row.id,category:species.tamingRule.category,status:'活跃',following:true,acquired:s.minute,source:setupWriter},setupWriter);
  });
 }
 if(Object.hasOwn(setup,'present')){
  if(!Array.isArray(setup.present))unmet('present','expected an array of existing actor IDs');
  else for(const [index,id] of setup.present.entries()){
   // Active catalog residents can enter the simulated scene on demand. Remote
   // faction rosters still require an explicit instances declaration.
   if(!actor(id)){
    const person=engine.world.npcs.find(p=>p.id===id)??engine.world.residents?.find(p=>p.id===id);
    if(person)native(`present[${index}]`,d=>{
     holdingSet(d,engine,['state','npcs',id],initialNpcState({...person,location:s.location}),setupWriter);
     setLocation(d,{entity:id,at:s.location,mode:'place',writer:setupWriter,engine});
    });
   }
   const body=actor(id);
   if(typeof id!=='string'||!body||['self','player'].includes(id)){unmet(`present[${index}]`,`missing NPC/creature instance: ${id}`);continue;}
   if(isGone(engine,document,id)||isPhysicallyDead(engine,document,id)||body.hp<=0){unmet(`present[${index}]`,`actor is dead or gone: ${id}`);continue;}
   move(id,body,s.location);
   Object.assign(body,{status:'正常',activity:'闲逛',scheduleTravel:null,cognitionTravel:null});
   delete body.capacity;
   for(const [key,effect] of Object.entries(s.effects??{}))if(effect.target===id&&(effect.capacity==='none'||['capacity:none','昏迷','失能','睡眠'].includes(effect.status)))delete s.effects[key];
  }
 }
 if(Object.hasOwn(setup,'inventory')){
  if(!object(setup.inventory))unmet('inventory','expected item ID to quantity mapping');
  else for(const [id,quantity] of Object.entries(setup.inventory)){
   const item=engine.world.items.find(i=>i.id===id);
   if(!item||!Number.isSafeInteger(quantity)||quantity<0){unmet(`inventory.${id}`,'unknown item or invalid quantity');continue;}
   s.inventory[id]={...s.inventory[id],quantity,quality:item.quality,durability:item.durability,weight:item.weight};
  }
 }
 if(Object.hasOwn(setup,'coins')){
  if(Number.isSafeInteger(setup.coins)&&setup.coins>=0)s.player.coins=setup.coins;
  else unmet('coins','expected a nonnegative safe integer');
 }
 if(Object.hasOwn(setup,'abilities')){
  const a=setup.abilities,validProficiency=value=>Number.isSafeInteger(value)&&value>=0&&value<=2699;
  const setSkill=(id,value,item)=>{
   if(!engine.world.skills.some(row=>row.id===id)||!validProficiency(value)){unmet(item,'unknown skill or proficiency outside 0..2699');return;}
   s.skills??={};
   s.skills[id]={...s.skills[id],proficiency:value,grade:skillGrade(value),daily:s.skills[id]?.daily??{},breakthroughs:s.skills[id]?.breakthroughs??[]};
  };
  if(!object(a))unmet('abilities','expected an object');
  else{
   for(const key of Object.keys(a))if(!['skills','spells','recipes','literacy','licenses'].includes(key))unmet(`abilities.${key}`,'unsupported ability field');
   if(Object.hasOwn(a,'skills')){
    if(!object(a.skills))unmet('abilities.skills','expected skill ID to proficiency mapping');
    else for(const [id,value] of Object.entries(a.skills))setSkill(id,value,`abilities.skills.${id}`);
   }
   if(Object.hasOwn(a,'literacy')){
    const value=typeof a.literacy==='boolean'?(a.literacy?engine.rules.books.minimumLiteracy:0):a.literacy;
    if(Object.hasOwn(a.skills??{},'skill_literacy')&&a.skills.skill_literacy!==value)unmet('abilities.literacy','conflicts with abilities.skills.skill_literacy');
    else setSkill('skill_literacy',value,'abilities.literacy');
   }
   for(const partition of ['spells','recipes'])if(Object.hasOwn(a,partition)){
    if(!Array.isArray(a[partition]))unmet(`abilities.${partition}`,'expected an array of registered IDs');
    else for(const [index,id] of a[partition].entries()){
     const definition=engine.world[partition].find(row=>row.id===id);
     if(!definition||!engine.world.skills.some(row=>row.id===definition.skill)){unmet(`abilities.${partition}[${index}]`,'unknown knowledge or supporting skill');continue;}
     s[partition]??={};s[partition][id]={...s[partition][id],learnedAt:s[partition][id]?.learnedAt??s.minute};
     // Native learn() creates a zero proficiency skill if it is absent. Do not
     // invent proficiency, certification, teachers or successful study records.
     if(!s.skills?.[definition.skill])setSkill(definition.skill,0,`abilities.${partition}[${index}]`);
    }
   }
   if(Object.hasOwn(a,'licenses')){
    if(!Array.isArray(a.licenses))unmet('abilities.licenses','expected an array of profession or loaded license holding IDs');
    else for(const [index,id] of a.licenses.entries()){
     const role=engine.world.professions.find(row=>row.id===id),item=`abilities.licenses[${index}]`;
     if(!role){
      // Non-profession IDs must name an already loaded native right. A string
      // in abilities cannot create an office, authorization or consent event.
      const rights=aliveHoldings(engine.primitiveDraft(document));
      if(!rights.some(row=>row.id===ref(id)&&(['certified','holds_office'].includes(row.kind)&&row.holder==='player'||row.kind==='permit'&&row.subject==='player')))unmet(item,'unknown profession or missing active player license holding');
      continue;
     }
     if(!['combat','life'].includes(role.kind)){unmet(item,'expected a combat/life profession certification');continue;}
     s.professions??={combat:'',life:[],hidden:[]};
     if(role.kind==='combat'){
      if(s.professions.combat&&s.professions.combat!==id){unmet(item,'combat profession slot already occupied');continue;}
      s.professions.combat=id;
     }else if(!s.professions.life.includes(id)){
      if(s.professions.life.length>=2){unmet(item,'life profession slots already occupied');continue;}
      s.professions.life.push(id);
     }
    }
   }
  }
 }
 if(Object.hasOwn(setup,'status')){
  if(Array.isArray(setup.status)){
   for(const [index,effect] of setup.status.entries()){
    const target=effect?.target==='self'?'player':effect?.target;
    if(!actor(target)||isGone(engine,document,target)){unmet(`status[${index}]`,'missing or gone status target');continue;}
    try{
     const d=engine.primitiveDraft(document),result=applyMagicStatus(d,{...effect,target,source:'a3-score:setup'},`a3-score:setup-status:${index}`);
     if(result.resisted)unmet(`status[${index}]`,'status resisted by the existing target state');
     else s.effects=structuredClone(d.document.state.effects);
    }catch(error){unmet(`status[${index}]`,error.message);}
   }
  }else{
  const entries=typeof setup.status==='string'?[['player',setup.status]]:object(setup.status)?Object.entries(setup.status):null;
  if(!entries)unmet('status','expected status string or actor ID to status mapping');
  else for(const [id,status] of entries){
   const body=actor(id);
   if(!body){unmet(`status.${id}`,'missing actor');continue;}
   if(typeof status==='string'&&status.trim()){body.status=status;continue;}
   if(!object(status)){unmet(`status.${id}`,'expected status string or registered status mapping');continue;}
   // Empty mappings assert no additional effects. They do not turn confinement
   // into incapacity, clear existing effects or grant a release (A.3/A.15.24).
   for(const [key,value] of Object.entries(status)){
    const item=`status.${id}.${key}`;
    if(key==='onDuty'){
     const d=engine.primitiveDraft(document),offices=aliveHoldings(d,{kind:'holds_office',holder:ref(id)});
     if(typeof value!=='boolean'||offices.length!==1||!d.get('holdings','entities',offices[0].subject)){unmet(item,'onDuty requires exactly one loaded native office and a boolean');continue;}
     // Duty is a fact of the existing office, not a new license or authority.
     native(item,d=>updateEntity(d,{id:offices[0].subject,facts:{onDuty:value},writer:setupWriter}));
    }else if(object(value)&&Object.keys(value).every(k=>['magnitude','remainingMinutes'].includes(k))){
     native(item,d=>{
      const result=applyMagicStatus(d,{target:ref(id),status:key,power:value.magnitude,duration:value.remainingMinutes,source:setupWriter},`${setupWriter}:status:${id}:${key}`);
      if(result.resisted)throw Error('status resisted by the existing target state');
     });
    }else unmet(item,'unknown status field or ambiguous status shape');
   }
  }
  }
 }
 if(Object.hasOwn(setup,'facts')){
  if(!Array.isArray(setup.facts))unmet('facts','expected [{path:["state",...],value}]');
  else for(const [index,fact] of setup.facts.entries()){
   // Free-text facts are the corpus author's narrative preconditions (spec: “其它前提，文字说明”); keep them as notes, never as unmet structure.
   if(typeof fact==='string'){notes.push(`facts[${index}]: ${fact}`);continue;}
   const p=fact?.path;
   if(!Array.isArray(p)||p.length<2||p[0]!=='state'||p.some(k=>typeof k!=='string'||['__proto__','prototype','constructor'].includes(k))||!Object.hasOwn(fact,'value')){unmet(`facts[${index}]`,'invalid state field path/value');continue;}
   const parent=p.slice(0,-1).reduce((v,k)=>v?.[k],document),key=p.at(-1);
   if(!object(parent)||!Object.hasOwn(parent,key)){unmet(`facts[${index}]`,`unknown state field: ${p.join('.')}`);continue;}
   parent[key]=structuredClone(fact.value);
  }
 }
 for(const id of Array.isArray(setup.present)?setup.present:[]){
  const body=actor(id);
  if(body&&(body.location!==s.location||['死亡','昏迷','失能'].includes(body.status)||/睡|昏迷/.test(body.activity??'')||body.capacity==='none'||isGone(engine,document,id)))unmet(`present.${id}`,'actor is not awake and present after setup');
 }
 try{document.ledger=openLedger(engine,document);for(const reason of auditLedger(document.ledger))unmet('ledger',reason);}
 catch(error){unmet('ledger',error.message);}
 // Keep certification holdings in sync with the same native adapter used by
 // engine.reduce; no generic "licenses" state field is read by the engine.
 let prepared=document;
 if(Array.isArray(setup.abilities?.licenses)&&setup.abilities.licenses.length)try{
  prepared=applyPatches(document,bookHoldingsUpgrade({...initial,holdings:document.holdings},document,engine.world));
  prepared.holdings??=openHoldings(engine,prepared);
 }catch(error){unmet('abilities.licenses',error.message);}
 return {document:prepared,setupUnmet,notes,bindings};
}

// routing.signature describes requested effects. Only committed applied effects
// are evidence; the legacy corpus also includes exact entity/field/tag tokens.
// Runtime resource costs are prepended to applied, and explicitly repeated in
// cost.resources (primitives-runtime). actedAs is authority, NOT derivation.
// Match each cost once; never infer cost from a negative delta or sink account.
export function signatureEffects(effects,receipt={},requested=receipt.routing?.proposal?.effects??[]){
 const costs=[...receipt.cost?.resources??[]],excluded=[];
 const selected=effects.filter(effect=>{
  const index=costs.findIndex(cost=>Object.keys(cost).length>0&&Object.entries(cost).every(([key,value])=>JSON.stringify(effect[key])===JSON.stringify(value)));
  if(index<0||effect.role!=='additional_cost')return true;
  // Explicitly requested consumption remains part of the adopted signature,
  // even if the registered action implements it as a resource cost.
  const owner=value=>selfId(value?.split('|')[0]);
  const resource=value=>value==='coin'?'coin_river':value;
  const requestedCost=requested.some(request=>request.op==='transfer'&&effect.op==='transfer'&&owner(request.from)===owner(effect.from)&&owner(request.to)===owner(effect.to)&&resource(request.resource??request.from?.split('|')[1])===resource(effect.resource??effect.from?.split('|')[1]));
  if(requestedCost){costs.splice(index,1);return true;}
  excluded.push(effect);costs.splice(index,1);return false;
 });
 return {effects:selected,excluded,unmatchedCosts:costs};
}
const signatureOp=value=>PRIMITIVE_IDS.find(op=>value===op||value.startsWith(`${op}(`));
const selfId=value=>value==='self'?'player':value;
function legacyQualifierMatches(qualifier,effect){
 if(qualifier.includes('+'))return qualifier.split('+').every(q=>legacyQualifierMatches(q,effect));
 if((effect.tags??[]).includes(qualifier))return true;
 if([effect.type,effect.field,effect.verb,effect.status,effect.kind,effect.reason,effect.mode,effect.to,effect.subject].includes(qualifier))return true;
 const [head,...tail]=qualifier.split(':');
 return tail.length>0&&head===effect.verb&&tail.join(':')===effect.payload?.kind;
}
// V2 qualifiers are descriptions, not literal effect values. Extract registered
// world IDs (longest first, including IDs in teacher_/book_ descriptions) and
// self/player references; require ALL of them in ONE adopted effect of this op.
// Direction is an additional from/to check, never an unordered reference check.
// Prose, authority and results are not evidence. Other descriptive words are
// ignored for scoring; expected.signature remains verbatim in every report.
const referenceCatalogs=new WeakMap();
const resourceIds=JSON.parse(await fs.readFile(path.join(root,'world/ontology/resources.json'),'utf8')).entries.map(row=>row.id);
function referenceCatalog(world){
 if(referenceCatalogs.has(world))return referenceCatalogs.get(world);
 const ids=new Set(resourceIds);
 for(const key of ['npcs','residents','items','skills','spells','recipes','locations','monsters','bosses','factions','households']){
  for(const row of world[key]??[])if(row.id)ids.add(row.id);
 }
 const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const pattern=new RegExp(`(?<![A-Za-z0-9])(?:${[...ids].sort((a,b)=>b.length-a.length).map(escape).join('|')}|self|player|coin)(?![A-Za-z0-9])`,'g');
 referenceCatalogs.set(world,pattern);return pattern;
}
const endpointToken=value=>value.trim().replace(/^(person|creature|thing|collective|org|holding|obligation|resource):/,'').replace(/:(?:\d.*|requested_.*|bounded_output)$/,'');
function recipeEndpoint(value,world){
 const token=endpointToken(value);
 return (world.recipes??[]).find(recipe=>token===recipe.id||token===`${recipe.id}的产出来源`||token===`${recipe.name}的产出来源`)?.id;
}
// 01 §1.6 / §1.12: one table, exact owners/purposes and native recipe metadata.
const endpointRules=[
 {accepts:token=>token.startsWith('sink:'),matches:(token,account)=>account[0]?.startsWith('sink:')&&(account[2]===token.slice(5)||token==='sink:consume'&&account[0]===token)},
 {accepts:(token,world)=>Boolean(recipeEndpoint(token,world)),matches:(token,account,effect,receipt,world)=>account[0]==='src:craft'&&account[2]==='craft'&&recipeEndpoint(token,world)===(effect.recipe??receipt.legacy?.recipe)},
 {accepts:()=>true,matches:(token,account,effect,receipt,world,normalize)=>account[0]===normalize(token)},
];
function qualifierMatches(qualifier,effect,receipt,world){
 const actor=receipt.actor??'player';
 const normalize=value=>['self','player'].includes(value)?actor:value==='coin'?'coin_river':value;
 const actualId=value=>value==='self'?actor:value==='coin'?'coin_river':value;
 const recipeSource=qualifier.includes('->')?recipeEndpoint(qualifier.split('->')[0],world):null;
 const references=[...qualifier.matchAll(referenceCatalog(world))].map(m=>normalize(m[0])).filter(id=>id!==recipeSource);
 const atoms=[];
 function collect(value){
  if(typeof value==='string')atoms.push(...value.split('|').map(actualId));
  else if(Array.isArray(value))value.forEach(collect);
  else if(value&&typeof value==='object')for(const [key,child] of Object.entries(value)){
   if(!['text','intent','description','narration','reason','actedAs','result','signatureKind'].includes(key))collect(child);
  }
 }
 collect(effect);
 if(!references.every(id=>atoms.includes(id)))return false;
 if(qualifier.includes('->')){
  const parts=qualifier.split('->');
  if(parts.length!==2)return false;
  const matches=(value,account)=>{
   const token=endpointToken(value),rule=endpointRules.find(rule=>rule.accepts(token,world));
   return rule.matches(token,typeof account==='string'?account.split('|').map(actualId):[],effect,receipt,world,normalize);
  };
  if(!matches(parts[0],effect.from)||!matches(parts[1],effect.to))return false;
 }
 return true;
}
export function signatureMatches(expected,effects,receipt={},requested,world){
 const adopted=effects,excluded=signatureEffects(effects,receipt,requested).excluded;
 const matches=(value,effect)=>{
  const op=signatureOp(value);
  if(!op)return legacyQualifierMatches(value,effect);
  if(effect.op!==op)return false;
  if(value===op)return true;
  if(!value.endsWith(')'))return false;
  const qualifiers=value.slice(op.length+1,-1).split(',').map(q=>q.trim());
  if(!world)throw new TypeError('Qualified signature matching requires the scored world');
  return qualifiers.every(q=>qualifierMatches(q,effect,receipt,world));
 };
 if(!expected.filter(value=>!signatureOp(value)).every(value=>adopted.some(effect=>matches(value,effect))))return false;
 const required=expected.filter(signatureOp),candidates=required.map(value=>adopted.flatMap((effect,i)=>matches(value,effect)?[i]:[]));
 const mandatory=adopted.flatMap((effect,i)=>excluded.includes(effect)||companionEffect(effect,receipt)?[]:[i]);
 if(mandatory.length>required.length||candidates.some(list=>!list.length))return false;
 // First cover every non-companion, then fill the remaining requirements.
 // Augmenting paths preserve that coverage and handle overlapping qualifiers
 // without factorial enumeration of repeated primitive names (up to 64).
 const assigned=required.map(()=>-1);
 const cover=(effect,seen)=>{
  for(let r=0;r<required.length;r++)if(!seen.has(r)&&candidates[r].includes(effect)){
   seen.add(r);
   if(assigned[r]<0||cover(assigned[r],seen)){assigned[r]=effect;return true;}
  }
  return false;
 };
 if(!mandatory.every(effect=>cover(effect,new Set())))return false;
 const owners=new Map(assigned.flatMap((effect,r)=>effect<0?[]:[[effect,r]]));
 const fill=(r,seen)=>{
  for(const effect of candidates[r])if(!seen.has(effect)){
   seen.add(effect);const owner=owners.get(effect);
   if(owner===undefined||fill(owner,seen)){owners.set(effect,r);assigned[r]=effect;return true;}
  }
  return false;
 };
 return assigned.every((effect,r)=>effect>=0||fill(r,new Set()));
}

function companionEffect(effect,receipt){
 const actor=receipt.actor??'player',target=effect.target??effect.entity??effect.actor;
 if(effect.op==='learn'&&target===actor){
  const source=effect.learningSource??(typeof effect.source==='string'?effect.source:effect.source?.type)??effect.mode;
  return ['doing','practice'].includes(source)&&effect.result?.path?.[1]==='skills';
 }
 if(effect.op==='fact.set'&&effect.field==='durability'){
  return (receipt.legacy?.spent?.toolWear??[]).some(row=>row.item===effect.entity&&row.before===effect.result?.before&&row.after===effect.value&&row.after<row.before);
 }
 if(effect.op==='time')return effect.minutes>0&&effect.minutes===receipt.cost?.time;
 if(effect.op==='vital'&&target===actor&&effect.type===`body:${effect.need}`){
  const drain=['stamina','satiety','hydration'].includes(effect.need)&&effect.delta<0||effect.need==='fatigue'&&effect.delta>0;
  return Boolean(drain&&receipt.cost?.time>0&&effect.result?.after);
 }
 return false;
}

// Start each intention from the same campaign: rows cannot spend each other's
// money, move observers or exhaust a later row's daily bounds.
export async function executeIntent(engine,initial,row){
 let {document,setupUnmet}=applyIntentSetup(engine,initial,row.setup),preview=null,receipt=null,adopted=null,error=null,refused=false,clarified=false,submitted=null;
 const before=document;
 const signatureContext=engine.byId?createRoutingContext(engine,document):null;
 const previews=[];
 const calls=[],eventId=`a3-score-${row.id}`;
 const input=row.input??(row.action?{tool:'world_act',args:typeof row.action==='string'?{action:row.action,slots:row.slots??{}}:row.action}:{tool:'world_propose',args:row.proposal});
 const invokePreview=async call=>{
  calls.push({phase:'preview',tool:call.tool,action:call.args?.action,eventId:call.eventId});
  try{
   const value=await engine.previewAction(document,call),r=receiptOf(value),routing=value.prepared??r?.routing??value.routing;
   previews.push({status:r?.status??null,reason:r?.reason??routing?.reason??routing?.fallback?.reason??null,ambiguities:r?.ambiguities??routing?.ambiguities??value.ambiguities??null,routingStatus:routing?.status??null});
   return value;
  }catch(error){
   previews.push({status:error instanceof PrimitiveRejected?'rejected':'error',reason:error.message,ambiguities:null,code:error.code??null});throw error;
  }
 };
 const commit=async call=>{
  calls.push({phase:'confirm',tool:call.tool,action:call.args?.action,eventId:call.eventId});
  const reduced=await engine.reduce(document,call);
  document=applyPatches(document,reduced.patches);
  submitted=call;
  // Legacy adapters without a primitive receipt have no provable effect set.
  receipt=receiptOf(reduced)??{...receiptOf(preview),status:'committed',applied:[]};
  adopted=receipt.routed??receipt.source?.id??reduced.result?.action??(call.tool==='world_act'?call.args.action:'open:proposal');
  return {ok:reduced.result?.ok!==false,result:{...reduced.result,receipt}};
 };
 async function construct(actionId,slots,id){
  const target=slots.target??slots.seller??slots.buyer;
  const offered=worldActions(engine.scoped(document),document,{query:actionId,target,limit:100}).actions.find(a=>a.id===actionId);
  if(!offered)return {ok:false,error:'动作未出现在当前构造器目录',steps:[]};
  const steps=[0];
  const builder=new ActionBuilder({newEventId:()=>id,
   preview:async(action,values,event)=>({...await invokePreview({...builderToolCall(action,values),eventId:event}),reference:{sequence:0}}),
   act:async(action,values,{eventId:event,expectedSequence})=>expectedSequence!==0?{ok:false,stale:true}:commit({...builderToolCall(action,values),eventId:event})});
  const fill=(action,values)=>{
   builder.choose(action);
   if(builder.action)for(const step of [1,2,3]){
    builder.step=step;steps.push(step);
    for(const slot of action.slots??[])if(builderStep(slot)===step&&Object.hasOwn(values,slot.name))builder.setSlot(slot.name,values[slot.name]);
   }
  };
  builder.intent=row.intent;fill(offered,slots);
  let quote=builder.action?await builder.preview():null;
  // Model the UI's explicit “leave a trace” choice, then select a form actually
  // offered by the current scene. Requested fictional forms are not enum IDs.
  // A rejected fictional mark is still eligible for the UI's explicit trace
  // choice. The original call keeps its rejection; this is a separate action.
  const rejectedMark=actionId==='open:proposal'&&previews.at(-1)?.code==='E-MARK-FACT'&&slots.effects?.some(e=>e.op==='create'&&e.kind==='mark');
  const fallback=builder.feedback?.fallback??(rejectedMark?{available:true,action:'open:leave_mark'}:null);
  if(!quote&&fallback?.available){
   const mark=worldActions(engine.scoped(document),document,{query:fallback.action,target,limit:100}).actions.find(a=>a.id===fallback.action);
   if(mark){
    const requestedMark=slots.effects?.find(e=>e.op==='create'&&e.kind==='mark');
    const forms=mark.slots.find(s=>s.name==='form')?.options??[];
    const form=forms.find(f=>f.value===requestedMark?.facts?.form)?.value??forms[0]?.value;
    fill(mark,{intent:slots.intent??row.intent,form,tags:requestedMark?.tags??[engine.world.openTagging.default]});
    quote=await builder.preview();
   }
  }
  if(!quote)return {ok:false,error:builder.error,steps};
  preview=quote.result;
  const result=await builder.confirm();
  return {ok:result?.ok===true&&receipt?.status==='committed',error:builder.error,steps};
 }
 let builderResult=null,prepared=null;
 try{
  if(setupUnmet.length){const missing=new Error('Unable to establish setup');missing.code='A3-SCORE-SETUP';throw missing;}
  if(!row.builder&&!row.input&&!row.action&&!row.proposal){
   const missing=new Error('语料仅有自然语言；缺少独立生成的 proposal/input/action/builder，不使用 expected 构造执行输入');
   missing.code='A3-SCORE-INPUT';throw missing;
  }
  if(row.builder)builderResult=await construct(row.builder.action,row.builder.slots??{},eventId);
  else{
   const call={...input,eventId};preview=await invokePreview(call);receipt=receiptOf(preview);
   prepared=preview.prepared??receipt?.routing??preview.routing;
   clarified=clarifyStates.has(prepared?.status);refused=receipt?.status==='rejected';
   if(receipt?.status==='preview')await commit(prepared?.status==='routed'?{tool:'world_act',eventId,args:{action:prepared.routed,slots:prepared.slots}}:call);
   else if(prepared?.status==='needs_alternative'&&prepared.fallback?.available){
    // Accept the native alternative explicitly; availability earns no credit.
    const mark=(input.args?.effects??[]).find(e=>e.op==='create'&&e.kind==='mark');
    const slots={intent:prepared.fallback.intent,form:mark?.facts?.form??engine.world.openActionRules.mark.forms[0],tags:mark?.tags??[engine.world.openTagging.default]};
    const fallback={tool:'world_act',eventId:`${eventId}-mark`,args:{action:prepared.fallback.action,slots}};
    preview=await invokePreview(fallback);
    if(receiptOf(preview)?.status==='preview')await commit(fallback);
   }
  }
  refused ||= receipt?.status==='rejected';
 }catch(caught){error={code:caught.code??null,message:caught.message};refused=caught instanceof PrimitiveRejected;}
 const committed=receipt?.status==='committed',effects=committed||receipt?.status==='rejected'?(receipt.applied??[]).map(effect=>{
  const created=effect.op==='create'&&document.state.created?.[effect.result?.entity];
  const subject=effect.target??effect.entity??effect.subject??effect.actor;
  const signatureKind=signatureContext?.kindOf(selfId(subject))??null;
  return {...effect,...(signatureKind?{signatureKind}:{}),...(created?{tags:created.tags??effect.tags}:{})};
 }):[];
 const entityId=receipt?.mark?.entity??receipt?.fallback?.entity??effects.find(e=>e.op==='create'&&e.kind==='mark')?.result?.entity;
 const entity=entityId&&document.state.created?.[entityId],holding=entityId&&document.holdings?.entities?.[entityId];
 const reactions=(receipt?.mark?.reactions??effects.find(e=>e.op==='create'&&e.kind==='mark')?.result?.reactions??[]).filter(reaction=>{
  const event=document.state.records?.[`world_event:${reaction.event}`];
  return event?.category==='world_event'&&event.verb==='tell'&&event.payload?.kind==='mark_reaction'&&event.payload.mark===entityId&&event.actor===reaction.observer&&event.tags?.includes(reaction.tag);
 });
 const fallback=Boolean(committed&&entity?.tags?.length&&holding?.kind==='mark'&&holding.goneAt===undefined&&reactions.length);
 const traceOnly=receipt?.fallback?.originalIntentFulfilled===false;
 const requested=(row.proposal??(row.input?.tool==='world_propose'?row.input.args:null))?.effects;
 const measured=signatureEffects(effects,receipt??{},requested);
 const actual={route:committed?adopted:clarified?'clarify':refused?'reject':null,status:receipt?.status??null,signature:unique(measured.effects.map(e=>e.op)),signatureEffects:measured.effects,excludedCosts:measured.excluded,unmatchedCosts:measured.unmatchedCosts,refused,clarified,committed,fallback,traceOnly,entity:entityId??null,reactions:reactions.length,error,calls,builder:builderResult};
 Object.assign(actual,{setupUnmet,preview:previews[0]??null,previews});
 return {actual,receipt,document,before,preview,prepared,effects,submitted,setupUnmet,requested};
}

const dieFor=(seed,id,label)=>createHash('sha256').update(`${seed}:${id}:${label}`).digest().readUInt32LE(0)%20+1;
function intentChecks(run,row){
 const prefix=`a3-score-${row.id}`;
 return Object.entries(run.document.state.checks??{}).filter(([id,value])=>([prefix,`${prefix}:action-check`,`${prefix}:rite-check`,`${prefix}_escape`].includes(id)||id.startsWith(`${prefix}:batch:`)&&/^\d+$/.test(id.slice(`${prefix}:batch:`.length)))&&Number.isInteger(value.die));
}
// Select the existing document seed input, never override check()/its result.
// Both extremes include advantage/disadvantage and the opposing die. Keep the
// same event IDs in preview, confirmation and constructor replay.
function branchSeed(initial,checks,outcome){
 const wanted=outcome==='success'?20:1,opposed=21-wanted;
 for(let nonce=0;nonce<1000000;nonce++){
  const seed=`${initial.randomSeed}:a3:${outcome}:${nonce}`;
  if(checks.every(([id,check])=>dieFor(seed,id,'d20')===wanted&&(!(check.rolls?.length>1)||dieFor(seed,id,'second')===wanted)&&(!check.opponent||dieFor(seed,id,'opponent:d20')===opposed)))return seed;
 }
 return null;
}
const sameValue=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// The other branch has no corpus signature. Check its native outcome contract,
// raw effects and books rather than treating any committed receipt as success.
export function validateCheckBranch(engine,run,row,outcome){
 const issues=[],{receipt,actual,document}=run,success=outcome==='success';
 const checks=intentChecks(run,row);
 if(!actual.committed||actual.error)issues.push('branch did not commit');
 if(!checks.length||checks.some(([,check])=>check.success!==success))issues.push('requested check outcome is impossible at the selected dice extreme');
 if(auditLedger(document.ledger).length)issues.push('ledger audit failed');
 const preview=receiptOf(run.preview);
 if(preview&&preview.status==='preview'&&!sameValue(preview.applied,receipt?.applied))issues.push('preview and committed effects differ');
 if(!receipt)return {ok:false,issues};
 const selected=signatureEffects(run.effects,receipt,[]).effects;
 const legacy=receipt.legacy,action=findAction(primitiveRuntime.registry(engine),actual.route);
 if(legacy?.recipe){
  const recipe=engine.world.recipes.find(r=>r.id===legacy.recipe),batches=legacy.results??[legacy];
  if(!recipe)issues.push('missing native recipe');
  else for(const batch of batches){
   const record=document.state.crafted?.[batch.receipt];
   if(!record||record.recipe!==recipe.id||record.quantity!==(success?(batch.produced??[]).find(p=>p.item===recipe.output.item)?.amount??0:0))issues.push('craft receipt/output mismatch');
   if(!success&&((batch.produced??[]).length||(batch.instances??[]).length||(record?.byproducts??[]).length))issues.push('failed craft granted products');
   const products=[{item:recipe.output.item,amount:recipe.output.quantity},...recipe.byproducts??[]];
   if((batch.produced??[]).some(product=>!products.some(p=>p.item===product.item&&product.amount<=p.amount)))issues.push('craft output exceeds recipe');
   for(const salvage of batch.salvage??[]){
    const input=(batch.spent?.materials??[]).find(m=>m.item===salvage.item);
    if(!input||salvage.amount>Math.floor(input.quantity*(recipe.failure?.recoverFraction??0)))issues.push('craft salvage exceeds recipe');
   }
  }
  const records=(document.ledger.crafts??[]).filter(c=>c.eventId===receipt.eventId||c.eventId?.startsWith(`${receipt.eventId}:batch:`));
  const output=new Map();
  for(const record of records)for(const [item,qty] of Object.entries(record.outputs))output.set(item,(output.get(item)??0)+qty);
  for(const effect of selected.filter(e=>e.op==='transfer'&&e.from?.split('|')[0]==='src:craft')){
   const item=effect.resource??effect.from.split('|')[1];output.set(item,(output.get(item)??0)-effect.qty);
  }
  if([...output.values()].some(n=>n!==0))issues.push('craft source transfers exceed recorded outputs');
  if(!success)for(const effect of selected){
   if(companionEffect(effect,receipt))continue;
   if(effect.op==='transfer'&&(effect.to?.split('|')[0].startsWith('sink:')||effect.from?.split('|')[0]==='src:craft'))continue;
   if(effect.op==='vital'&&effect.target==='player'&&effect.need==='hp'&&effect.delta<0&&-effect.delta<=batches.length*(recipe?.failure?.injury??0))continue;
   issues.push(`failed craft granted ${effect.op}`);
  }
 }else if(!legacy&&receipt.outcome){
  if(!success&&(!action?.outcomes||Array.isArray(action.outcomes))){
   const originals=(receipt.trimmed??[]).filter(t=>t.reason==='check_failed').map(t=>t.effect);
   const harm=originals.find(e=>e.op==='vital'&&e.delta<0);
   for(const effect of selected){
    if(companionEffect(effect,receipt))continue;
    if(effect.op==='emit'&&effect.payload?.kind==='action_exposed'&&effect.payload.action===receipt.source.id)continue;
    if(receipt.outcome==='fumble'&&harm&&effect.op==='vital'&&effect.target===receipt.actor&&effect.delta===-Math.max(1,Math.floor(Math.abs(harm.delta)/4)))continue;
    issues.push(`failed action granted ${effect.op}`);
   }
  }else{
   let declared=action?.outcomes;
   if(declared&&!Array.isArray(declared))declared=declared[receipt.outcome]??(success?declared.success??declared.accepted??[]:[]);
   declared??=run.prepared?.proposal?.effects??run.requested;
   if(!declared)issues.push('no native branch program available');
   else{
    const specs=actionEffects({outcomes:declared},run.submitted?.args?.slots??{},receipt.actor).map(spec=>resolvePrimitiveTransfer(engine,run.before,spec,{actor:receipt.actor}));
    for(const effect of selected){
     const index=specs.findIndex(spec=>spec.op===effect.op&&Object.entries(spec).every(([key,value])=>{
      if(key==='delta'&&receipt.outcome==='critical'&&effect.op==='vital'&&value<0)return effect.delta===Math.floor(value*engine.rules.combat.criticalMultiplier);
      return sameValue(value==='self'?receipt.actor:value,effect[key]);
     }));
     if(index>=0)specs.splice(index,1);
     else if(!companionEffect(effect,receipt))issues.push(`undeclared branch effect: ${effect.op}`);
    }
   }
  }
 }else if(!success&&legacy){
  const route=actual.route;
  if(route==='core:learn'){
   const subject=legacy.entity;
   if(document.state.learning?.[receipt.eventId]?.success!==false)issues.push('failed learning has no failed attempt');
   if(selected.some(e=>!companionEffect(e,receipt)&&(e.op!=='learn'||e.subject!==subject||e.result?.path?.[1]!=='learning'||e.result?.after?.success!==false)))issues.push('failed learning granted unrelated effect');
   for(const partition of ['skills','recipes','spells'])if(!sameValue(run.before.state[partition]?.[subject],document.state[partition]?.[subject]))issues.push('failed learning granted knowledge');
  }else if(route==='core:cast'){
   for(const effect of selected){
    if(companionEffect(effect,receipt))continue;
    if(effect.op==='vital'&&effect.target==='player'&&['hp','mp'].includes(effect.need)&&effect.delta<0)continue;
    issues.push(`failed cast granted ${effect.op}`);
   }
  }else if(!['core:dialogue.persuade','core:combat'].includes(route))issues.push('no native failure contract available');
 }
 return {ok:issues.length===0,issues:unique(issues)};
}

async function executeCheckedIntent(engine,initial,row){
 const first=await executeIntent(engine,initial,row),checks=intentChecks(first,row);
 if(!checks.length||first.setupUnmet.length)return {...first,branches:null,branchesOK:true};
 const runs={},branches={};
 for(const outcome of ['success','failure']){
  const randomSeed=branchSeed(initial,checks,outcome);
  if(!randomSeed){branches[outcome]={ok:false,issues:['unable to select deterministic dice'],impossible:false};continue;}
  const document={...initial,randomSeed},run=await executeIntent(engine,document,row);
  const validation=validateCheckBranch(engine,run,row,outcome),actualChecks=intentChecks(run,row);
  runs[outcome]=run;
  branches[outcome]={...validation,randomSeed,checks:actualChecks.map(([id,check])=>({id,...check})),impossible:actualChecks.some(([,check])=>check.success!==(outcome==='success')),actual:run.actual};
 }
 const selected=row.expected.checkOutcome==='failure'?'failure':'success',run=runs[selected]??first;
 return {...run,branches,branchesOK:Object.values(branches).every(branch=>branch.ok)};
}

export async function scoreRows(rows,{world,seed,document:initial}={}){
 world??=await loadWorld();seed??=JSON.parse(await fs.readFile(path.join(root,'tests/fixtures/legacy/seed.json'),'utf8'));
 const engine=new WorldEngine(world);initial??=engine.createCharacter(seed,{},'a3-score-independent');
 const registry=primitiveRuntime.registry(engine),normalizeRoute=route=>routeName(route,registry);
 const results=[];
 for(const row of rows){
  const run=await executeCheckedIntent(engine,initial,row),{actual}=run,expectedRoute=row.expected.route??row.expected.action;
  const ready=run.setupUnmet.length===0;
  const route=ready&&(Array.isArray(expectedRoute)?expectedRoute.some(r=>normalizeRoute(r)===normalizeRoute(actual.route)):normalizeRoute(expectedRoute)===normalizeRoute(actual.route));
  // Rejection signatures describe the REQUEST, not an adopted effect set.
  // Credit requires an actual refusal and zero raw applied effects, including
  // costs (do not let cost filtering or a rejected receipt hide mutations).
  // Out-of-bounds requests come in two forms (06 §6.7): a reject route must be
  // refused outright; a concrete route is a bounded outcome that must commit
  // only the clipped effects its signature names.
  const routeRejects=Array.isArray(expectedRoute)?expectedRoute.every(r=>normalizeRoute(r)==='reject'):normalizeRoute(expectedRoute)==='reject';
  const bounded=row.expected.outOfBounds===true&&!routeRejects;
  const expectsRejection=!bounded&&(row.expected.outOfBounds===true||routeRejects);
  const signature=ready&&run.branchesOK&&(expectsRejection
   ?actual.refused&&!actual.committed&&(run.receipt?.applied??[]).length===0&&run.effects.length===0
   :(!actual.error||actual.refused)&&signatureMatches(row.expected.signature,run.effects,run.receipt??{},run.requested,world));
  let constructor=false,builder=actual.builder;
  if(ready&&row.expected.constructor){
   if(builder)constructor=builder.ok&&route&&signature&&(!row.expected.fallback||actual.fallback);
   else{
    // Replay the independently supplied input through the same four-step form
    // and tool adapter as the UI. Open proposals are editable dynamic duties,
    // not world_act slots, and a failed non-builder run must not suppress them.
    const input=row.input??(row.action?{tool:'world_act',args:typeof row.action==='string'?{action:row.action,slots:row.slots??{}}:row.action}:row.proposal?{tool:'world_propose',args:row.proposal}:null);
    const action=input?.tool==='world_propose'?'open:proposal':input?.tool==='world_act'?input.args.action:null;
    const slots=input?.tool==='world_propose'?input.args:input?.args?.slots;
    if(action&&slots){
     const built=await executeCheckedIntent(engine,initial,{...row,id:`${row.id}-builder`,builder:{action,slots}});
     builder={...built.actual.builder,route:built.actual.route,signature:built.actual.signature,signatureEffects:built.actual.signatureEffects,fallback:built.actual.fallback,traceOnly:built.actual.traceOnly,calls:built.actual.calls,previews:built.actual.previews,checkBranches:built.branches};
     const builtRoute=Array.isArray(expectedRoute)?expectedRoute.some(r=>normalizeRoute(r)===normalizeRoute(built.actual.route)):normalizeRoute(expectedRoute)===normalizeRoute(built.actual.route);
     constructor=Boolean(built.branchesOK&&builtRoute&&builder?.ok&&signatureMatches(row.expected.signature,built.effects,built.receipt??{},built.requested,world)&&(!row.expected.fallback||built.actual.fallback));
    }
   }
  }
  const supported=bounded?actual.committed&&signature:row.expected.outOfBounds?actual.refused:normalizeRoute(expectedRoute)==='clarify'?actual.clarified:actual.committed&&(row.expected.fallback?actual.fallback:run.receipt?.fallback?.originalIntentFulfilled!==false);
  results.push({id:row.id,text:row.intent,expected:row.expected,bounded,setupUnmet:run.setupUnmet,actual:{...actual,builder},checkBranches:run.branches,scores:{route,signature,outOfBounds:ready&&(bounded?actual.committed&&signature:actual.refused===row.expected.outOfBounds),supported:ready&&run.branchesOK&&supported,constructor},repair:row.expected.repair});
 }
 const total=rows.length,tricky=rows.filter(r=>r.tricky).length,rate=(key,denominator=total)=>denominator?results.filter(r=>r.scores[key]).length/denominator:1;
 const fallbackExpected=rows.filter(r=>r.expected.fallback).length,fallbackReacted=results.filter(r=>r.expected.fallback&&r.actual.fallback).length,constructorExpected=rows.filter(r=>r.expected.constructor).length;
 // Preserve the acceptance gate's conservative definition: every expected
 // rejection must really be rejected. Applied violations are reported apart
 // from clarification/failure; those cannot earn rejection credit.
 return {setupUnmet:results.filter(r=>r.setupUnmet.length).map(r=>({id:r.id,items:r.setupUnmet})),setupUnmetCount:results.filter(r=>r.setupUnmet.length).length,total,tricky,trickyRate:total?tricky/total:0,route:rate('route'),signature:rate('signature'),outOfBoundsLeaks:results.filter(r=>r.expected.outOfBounds&&!r.setupUnmet.length&&(r.bounded?!r.scores.outOfBounds:!r.actual.refused)).map(r=>r.id),outOfBoundsApplied:results.filter(r=>r.expected.outOfBounds&&r.actual.committed&&!r.actual.traceOnly&&!(r.bounded&&r.scores.signature)).map(r=>r.id),outOfBoundsUnverified:results.filter(r=>r.expected.outOfBounds&&(r.setupUnmet.length||(!r.actual.committed&&!r.actual.refused&&!r.actual.clarified))).map(r=>r.id),inputMissing:results.filter(r=>r.actual.error?.code==='A3-SCORE-INPUT').map(r=>r.id),unsupported:results.filter(r=>!r.scores.supported).map(r=>r.id),fallbackExpected,fallbackReacted,fallbackReactionRate:fallbackExpected?fallbackReacted/fallbackExpected:1,constructorExpected,constructor:rate('constructor',constructorExpected),results};
}
export async function scoreCorpus(options={}){const {rows,corpusPath}=await loadCorpus(options);return {...await scoreRows(rows,options),corpusPath};}
// Importing the scorer performs no run and emits no output.
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const index=process.argv.indexOf('--corpus'),corpusPath=index>=0?process.argv[index+1]:process.argv.slice(2).find(arg=>!arg.startsWith('--'));
 const report=await scoreCorpus(corpusPath?{corpusPath}:{});
 console.log(JSON.stringify(process.argv.includes('--summary')?{...report,results:undefined}:report,null,2));
}
export default scoreCorpus;
