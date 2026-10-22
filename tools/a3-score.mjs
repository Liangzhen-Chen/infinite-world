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
import {facilityView} from '../server-plugin/facility-state.mjs';
import {heldUnit} from '../server-plugin/items.mjs';
import {runSetupLoaders,setupLoaderFields,setupRowLoader} from './a3-setup/index.mjs';
import {localWeather} from '../server-plugin/weather.mjs';
import './a3-setup/loaders.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const setupWriter='a3-score-setup';
// Review 10-22 P1: the corpus premise writer may open only the relationship
// kinds that the generic setup fields declare (01 §1.3 registered writers),
// never a wildcard. Offices themselves are created by the governance writer
// after catalog validation (tools/a3-setup/institutions.mjs); this writer may
// only record duty/authority references on an already loaded office.
export const SETUP_HOLDING_KINDS=Object.freeze(['owns','tamed_by','lodges','pledged','guest_of','share','wanted','guardian_of','holds_office']);
declareHoldingWriter(setupWriter,{kinds:SETUP_HOLDING_KINDS,entities:['office'],locations:true});
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
 const unmet=(item,reason)=>setupUnmet.push({item,reason}),afterDomain=[],spatialPending=[];
 const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
 const actor=id=>id==='player'||id==='self'?s.player:Object.hasOwn(s.npcs??{},id)?s.npcs[id]:Object.hasOwn(s.creatures??{},id)?s.creatures[id]:null;
 if(!object(setup)){unmet('setup','expected an object');return {document,setupUnmet};}
 const native=(item,write)=>{
  try{const d=engine.primitiveDraft(document);if(!ensureHoldings(d,engine))throw Error('unsupported holdings version');write(d);document=d.document;s=document.state;return true;}
  catch(error){unmet(item,error.message);return false;}
 };
 const ref=id=>bindings[id]??(id==='self'?'player':id);
 for(const key of Object.keys(setup))if(!['location','present','inventory','coins','minute','status','facts','abilities','instances','holdings',...setupLoaderFields()].includes(key))unmet(key,'unsupported setup field');
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
   // Review 10-22 P1: rows owned by a domain loader (offices, institutional
   // inputs, quest instruments) are loaded there by the same selector that
   // runSetupLoaders uses; the generic loop never half-loads or rejects them.
   if(setupRowLoader('instances',row))continue;
   if(!object(row)||typeof row.id!=='string'||!row.id.trim()||row.name!==undefined&&(typeof row.name!=='string'||!row.name.trim())){unmet(item,'missing instance ID or invalid name');continue;}
   if(actor(row.id)||bindings[row.id]||Object.hasOwn(s.created??{},row.id)){unmet(item,'instance ID already exists');continue;}
   if(!engine.world.locations.some(l=>l.id===row.location)){unmet(item,'unknown instance location');continue;}
   const allowed={creature:['id','template','kind','species','name','location','facts'],person:['id','source','template','kind','name','age','culture','faction','location']}[row.kind];
   if(!allowed||Object.keys(row).some(k=>!allowed.includes(k))||row.template!=='agent'){unmet(item,'unsupported instance template or field');continue;}
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
   }else{
    const person=(engine.world.factionPeople??[]).find(p=>p.id===row.id)??engine.world.npcs.find(p=>p.id===row.id)??engine.world.residents?.find(p=>p.id===row.id);
    if(!person||row.source!==undefined&&row.source!=='world/lore/factionPeople.json'||['name','age','culture','faction'].some(k=>Object.hasOwn(row,k)&&row[k]!==person[k])){unmet(item,'missing world person or conflicting authored identity');continue;}
    native(item,d=>{
     const definition={...structuredClone(person),location:row.location};
     holdingSet(d,engine,['state','created',row.id],definition,setupWriter);
     holdingSet(d,engine,['state','npcs',row.id],initialNpcState(definition),setupWriter);
     setLocation(d,{entity:row.id,at:row.location,mode:'place',writer:setupWriter,engine});
    });
   }
  }
 }
 // 01 §1.3 / A.15.24: native IDs and variants remain authoritative. Corpus
 // IDs are aliases for references such as abilities.licenses, never row IDs.
 const deferredHoldings=[];
 const resolveRefs=value=>Array.isArray(value)?value.map(resolveRefs):object(value)?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,resolveRefs(v)])):typeof value==='string'?ref(value):value;
 const loadHoldings=entries=>{
  for(const [index,row] of entries){
   const item=`holdings[${index}]`;
   if(!object(row)||typeof row.id!=='string'||bindings[row.id]||Object.keys(row).some(k=>!['id','name','kind','holder','subject','terms','grantedBy'].includes(k))||row.terms!==undefined&&!object(row.terms)){unmet(item,'invalid holding declaration');continue;}
   if(object(row.holder)){unmet(item,'no uniquely resolved native existing_legal_town_head selector (05 §5.4/§5.7; S4); cannot substitute the present clerk or create an incumbent');continue;}
   const terms=resolveRefs(row.terms??{}),variant=row.kind==='guest_of'?terms.mode:null;
   if(row.kind==='guest_of'&&terms.regime!==undefined&&terms.regime!=='custody.default'){unmet(item,'unknown custody regime');continue;}
   // The native canAct/effective readers implement custody.default when the
   // regime override is absent. Preserve the registered reference as a note.
   if(terms.regime==='custody.default')delete terms.regime;
   if(!SETUP_HOLDING_KINDS.includes(row.kind)){unmet(item,`holding kind ${row.kind} is not a declared setup premise`);continue;}
   let id;
   if(native(item,d=>{
    // An appointment premise needs an office that the domain stage loaded and
    // validated against its organization's office catalog (05 §5.3).
    if(row.kind==='holds_office'){const office=d.get('holdings','entities',ref(row.subject));if(office?.kind!=='office'||office.goneAt!==undefined)throw Error('holds_office requires a loaded catalog office');}
    if(row.kind==='tamed_by'&&d.get('state','creatures',row.subject)){
     if(Object.keys(terms).length||row.grantedBy!==undefined)throw Error('unsupported tamed_by terms');
     if(d.get('state','creatures',row.subject,'owner'))throw Error('creature already has a keeper');
     // Use the same owner writer as native tame(), which opens the tamed_by
     // ledger edge via its registered source adapter. No taming roll is run.
     holdingSet(d,engine,['state','creatures',row.subject,'owner'],ref(row.holder),setupWriter);
     id=aliveHoldings(d,{kind:'tamed_by',holder:ref(row.holder),subject:row.subject}).find(h=>h.source===`tamed:${row.subject}`)?.id;
     if(!id)throw Error('native tamed_by source did not establish the holding');
    }else{
     const existing=aliveHoldings(d,{kind:row.kind,holder:ref(row.holder),subject:ref(row.subject)}).find(h=>(h.variant??null)===variant&&JSON.stringify(h.terms??{})===JSON.stringify(terms)&&h.grantedBy===ref(row.grantedBy));
     id=existing?.id??openHolding(d,{kind:row.kind,variant,holder:ref(row.holder),subject:ref(row.subject),terms,grantedBy:ref(row.grantedBy),source:`${setupWriter}:${row.id}`,writer:setupWriter,engine});
    }
   })){
    bindings[row.id]=id;
    if(row.terms?.regime==='custody.default')notes.push(`${item}.terms.regime: custody.default uses the native default canAct/effective policy`);
   }
  }
 };
 if(Object.hasOwn(setup,'holdings')){
  if(!Array.isArray(setup.holdings))unmet('holdings','expected an array');
  else{
   // Domain-owned instances (offices, institutional inputs) load in the
   // domain stage, so holdings that cite them are deferred until after it.
   const claimedInstances=(Array.isArray(setup.instances)?setup.instances:[]).filter(r=>setupRowLoader('instances',r)).map(r=>r?.id);
   const declared=new Set([...['itemInstances','objects','obligations','documents','cases'].flatMap(field=>Array.isArray(setup[field])?setup[field].map(r=>r?.id):[]),...claimedInstances]);
   const early=[];
   for(const entry of setup.holdings.entries()){
    if(setupRowLoader('holdings',entry[1]))continue;
    (declared.has(entry[1]?.holder)||declared.has(entry[1]?.subject)?deferredHoldings:early).push(entry);
   }
   loadHoldings(early);
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
   // Review 10-22 P1: presence is a premise to verify, not a state rewrite.
   // A travelling, sleeping or incapacitated actor stays so and is reported
   // as setupUnmet below; only the scene placement itself is written.
   if(body.scheduleTravel||body.cognitionTravel){unmet(`present[${index}]`,`actor is travelling: ${id}`);continue;}
   move(id,body,s.location);
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
      // Offices load in the domain stage, so the check runs after it.
      afterDomain.push(()=>{
       const rights=aliveHoldings(engine.primitiveDraft(document));
       if(!rights.some(row=>row.id===ref(id)&&(['certified','holds_office'].includes(row.kind)&&row.holder==='player'||row.kind==='permit'&&row.subject==='player')))unmet(item,'unknown profession or missing active player license holding');
      });
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
    if(key==='onDuty'){afterDomain.push(()=>{
     const d=engine.primitiveDraft(document),held=aliveHoldings(d,{kind:'holds_office',holder:ref(id)});
     // A person can hold several genuine offices. At a declared counter,
     // on-duty refers to that seat; two offices at the same seat remain
     // ambiguous and a boolean still cannot create an appointment.
     const offices=held.length===1?held:held.filter(h=>d.get('holdings','entities',h.subject)?.facts?.seat===s.location);
     if(typeof value!=='boolean'||offices.length!==1||!d.get('holdings','entities',offices[0].subject)){unmet(item,'onDuty requires exactly one loaded native office and a boolean');return;}
     // Duty is a fact of the existing office, not a new license or authority.
     native(item,d=>updateEntity(d,{id:offices[0].subject,facts:{onDuty:value},writer:setupWriter}));
    });}else if(object(value)&&Object.keys(value).every(k=>['magnitude','remainingMinutes'].includes(k))){
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
 // Domain premises (tools/a3-setup/) run after built-in scene fields and before
 // presence and ledger audits.
 const ctx={engine,setup,bindings,ref,actor,unmet,note:text=>notes.push(text),spatial:entry=>spatialPending.push(entry),native,get document(){return document;},set document(value){document=value;s=value.state;}};
 runSetupLoaders(ctx,setup);
 loadHoldings(deferredHoldings);
 for(const check of afterDomain)check();
 // Office authority may cite history/case aliases loaded by domain modules.
 for(const row of Array.isArray(setup.instances)?setup.instances:[])if(row?.template==='office'&&bindings[row.id]&&row.authority){
  const authority=resolveRefs(row.authority);
  if(JSON.stringify(authority)!==JSON.stringify(row.authority))native(`instances.${row.id}.authority`,d=>updateEntity(d,{id:ref(row.id),facts:{authority},writer:setupWriter}));
 }
 for(const id of Array.isArray(setup.present)?setup.present:[]){
  const body=actor(id);
  const explicitStatus=object(setup.status)&&typeof setup.status[id]==='string'?setup.status[id]:null;
  if(body&&(body.location!==s.location||isGone(engine,document,id)||isPhysicallyDead(engine,document,id)||!explicitStatus&&(['死亡','昏迷','失能'].includes(body.status)||/睡|昏迷/.test(body.activity??'')||body.capacity==='none')))unmet(`present.${id}`,'actor is not awake and present after setup');
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
 return {document:prepared,setupUnmet,notes,bindings,spatialPending};
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
// ---- Structured qualifier vocabulary (review 10-22 P0; 06 §6.7) ----
// A v2 signature op(q0,q1,...) is parsed into typed tokens. q0 names the
// effect's subject (`world`, `<type>:<ref>`, `resource:<ref>`, or the party
// flow of obligation.create); later qualifiers are flows (`A->B[:qty]`) or
// descriptors from the vocabulary of that primitive. Every token has a
// structural predicate over ONE adopted effect and the native records:
// quantity, direction, sign and description words are all checked. Prose,
// authority and results are never evidence. A token the vocabulary cannot
// recognise never matches; signatureDiagnostics names it instead of
// silently ignoring it. expected.signature remains verbatim in every report.
const TYPE_LABELS=new Set(['person','creature','thing','collective','org','place','holding','obligation','resource']);
const HOLDING_OPS=new Set(['holding.open','holding.close','holding.transfer','holding.rescale']);
const OBLIGATION_OPS=new Set(['obligation.create','obligation.settle','obligation.cancel']);
const resourceIds=JSON.parse(await fs.readFile(path.join(root,'world/ontology/resources.json'),'utf8')).entries.map(row=>row.id);
const catalogs=new WeakMap();
function catalog(world){
 if(catalogs.has(world))return catalogs.get(world);
 const ids=new Set(resourceIds),names=new Map(),people=new Map();
 for(const key of ['npcs','residents','factionPeople','items','skills','spells','recipes','locations','monsters','bosses','factions','households','professions']){
  for(const row of world[key]??[]){
   if(!row?.id)continue;
   ids.add(row.id);
   if(['npcs','residents','factionPeople'].includes(key)&&!people.has(row.id))people.set(row.id,row);
   if(key==='items'&&typeof row.name==='string')names.set(row.name,[...names.get(row.name)??[],row.id]);
  }
 }
 const banks=new Set((world.rules?.economy?.credit?.banks??[]).map(bank=>bank.id));
 for(const id of banks)ids.add(id);
 const features=new Map();
 for(const place of world.locations??[])for(const feature of place.features??[])features.set(feature.id,{...feature,location:feature.location??place.id});
 const value={ids,names,people,banks,features,
  parents:new Map((world.locations??[]).map(l=>[l.id,l.parent??null])),locations:new Set((world.locations??[]).map(l=>l.id)),
  monsters:new Set([...(world.monsters??[]),...(world.bosses??[])].map(m=>m.id)),items:new Set((world.items??[]).map(i=>i.id)),
  skills:new Map((world.skills??[]).map(s=>[s.id,s])),spells:new Map((world.spells??[]).map(s=>[s.id,s])),recipes:new Set((world.recipes??[]).map(r=>r.id)),
  professions:new Map((world.professions??[]).map(p=>[p.id,p])),factions:new Set((world.factions??[]).map(f=>f.id)),
  households:new Set((world.households??[]).map(h=>h.id)),routes:new Map((world.routes??[]).map(r=>[r.id,r]))};
 catalogs.set(world,value);return value;
}
function signatureScope(receipt,world,document,context={}){
 const before=context.before??null;
 return {actor:receipt.actor??'player',receipt,world,document:document??null,before,bindings:context.bindings??{},engine:context.engine??null,
  bounds:context.bounds??null,roles:context.roles??{},docs:[document,before].filter(doc=>doc?.state),catalog:catalog(world)};
}
const stateOf=doc=>doc?.state??{};
const prior=S=>S.before??S.document;
// Registered IDs, setup aliases, self, catalog item names and the catalog's own
// item_/skill_/spell_/recipe_ naming (only when exactly one ID matches).
function resolveToken(token,S,{short=true}={}){
 if(typeof token!=='string'||!token)return null;
 if(token==='self'||token==='player')return S.actor;
 if(token==='coin')return 'coin_river';
 if(Object.hasOwn(S.roles,token))return S.roles[token];
 if(Object.hasOwn(S.bindings,token))return S.bindings[token];
 if(S.catalog.ids.has(token))return token;
 const named=S.catalog.names.get(token);
 if(named?.length===1)return named[0];
 if(!short)return null;
 const forms=['item_','skill_','spell_','recipe_'].map(prefix=>prefix+token).filter(id=>S.catalog.ids.has(id));
 return forms.length===1?forms[0]:null;
}
const resolveCompound=(token,S)=>token.split(':').map(part=>part==='self'?S.actor:Object.hasOwn(S.bindings,part)?S.bindings[part]:part).join(':');
function sameEntity(actual,expected,S){
 if(actual===undefined||actual===null||expected===null||expected===undefined)return false;
 if(actual===expected)return true;
 return S.docs.some(doc=>stateOf(doc).itemInstances?.[actual]?.item===expected||doc.holdings?.entities?.[actual]?.facts?.item===expected);
}
function entityLocation(id,doc,S,depth=0){
 const s=stateOf(doc);
 if(!id||depth>4)return null;
 if(id===S.actor&&id==='player')return s.location??null;
 const body=s.npcs?.[id]??s.creatures?.[id];
 if(body)return body.location??null;
 const placed=doc?.holdings?.locations?.[id];
 if(placed)return placed.mode==='carried'?entityLocation(placed.at,doc,S,depth+1):placed.at??null;
 const unit=s.itemInstances?.[id];
 if(unit)return unit.carriedBy?entityLocation(unit.carriedBy,doc,S,depth+1):unit.location??null;
 if(S.actor==='player'&&s.inventory?.[id]?.quantity>0)return s.location??null;
 if(s.effects?.[id]?.location)return s.effects[id].location;
 return S.catalog.features.get(id)?.location??null;
}
const CASE_PARTIES=['victim','offender','accused','defendant','claimant','plaintiff','appellant'];
function ownedBy(id,S){
 const doc=prior(S),s=stateOf(doc),actor=S.actor;
 if(!id||!doc)return false;
 if(Object.values(doc.holdings?.rows??{}).some(h=>h.kind==='owns'&&h.holder===actor&&h.subject===id&&h.until===undefined))return true;
 if(actor==='player'&&s.inventory?.[id]?.quantity>0)return true;
 const record=s.records?.[id];
 if(record?.category==='legal_case'&&(Array.isArray(record.parties)&&record.parties.includes(actor)||CASE_PARTIES.some(key=>record[key]===actor)))return true;
 return s.itemInstances?.[id]?.owner===actor||s.creatures?.[id]?.owner===actor||s.effects?.[id]?.owner===actor;
}
const aliveRows=(S,filter)=>S.docs.flatMap(doc=>Object.values(doc.holdings?.rows??{})).filter(h=>h.until===undefined&&Object.entries(filter).every(([k,v])=>h[k]===v));
function officeSeat(id,S){
 return S.docs.some(doc=>Object.entries(doc.holdings?.entities??{}).some(([key,entity])=>entity.kind==='office'&&entity.goneAt===undefined&&entity.facts?.seat===id&&aliveRows(S,{kind:'holds_office',subject:key}).length>0));
}
function locationChain(id,S){const chain=[];for(let at=id;at&&!chain.includes(at)&&chain.length<16;at=S.catalog.parents.get(at))chain.push(at);return chain;}
// Reference words for people, creatures, things and places. Modifiers
// (noun:false) only narrow; a reference also needs a noun or an embedded ID.
const ENTITY_WORDS={
 own:{noun:false,test:(id,S)=>ownedBy(id,S)},
 present:{noun:false,test:(id,S)=>{const at=entityLocation(S.actor,prior(S),S);return Boolean(at)&&entityLocation(id,prior(S),S)===at;}},
 remote:{noun:false,test:(id,S)=>{const at=entityLocation(S.actor,prior(S),S),there=entityLocation(id,prior(S),S);return Boolean(at&&there)&&there!==at;}},
 local:{noun:false,test:(id,S)=>{
  const at=entityLocation(S.actor,prior(S),S),place=S.catalog.locations.has(id)?id:entityLocation(id,prior(S),S);
  return Boolean(at&&place)&&(locationChain(at,S).includes(place)||locationChain(place,S).includes(at));
 }},
 pet:{noun:true,test:(id,S)=>Boolean(stateOf(prior(S)).pets?.[id])&&stateOf(prior(S)).creatures?.[id]?.owner===S.actor},
 summon:{noun:true,test:(id,S)=>stateOf(prior(S)).effects?.[id]?.kind==='summon'},
 enemy:{noun:true,test:(id,S)=>{const exchange=S.receipt.legacy?.exchange;return Boolean(exchange)&&exchange.actor===S.actor&&exchange.target===id;}},
 officer:{noun:true,test:(id,S)=>aliveRows(S,{kind:'holds_office',holder:id}).length>0},
 merchant:{noun:true,test:(id,S)=>(S.catalog.people.get(id)?.serviceCatalog??[]).some(row=>row.kind==='trade')},
 bank:{noun:true,test:(id,S)=>S.catalog.banks.has(id)},
 authority:{noun:true,test:(id,S)=>officeSeat(id,S)},
 case:{noun:true,test:(id,S)=>S.docs.some(doc=>stateOf(doc).records?.[id]?.category==='legal_case')},
};
// Split a descriptive reference into embedded IDs (longest first) and words.
// A single token that is a vocabulary word is a word, never an ID short form.
function parseDescribed(ref,S,words){
 const parts=ref.split('_'),embedded=[],plain=[];
 for(let i=0;i<parts.length;){
  let found=null,end=i+1;
  for(let j=parts.length;j>i;j--){
   const token=parts.slice(i,j).join('_');
   if(j-i===1&&Object.hasOwn(words,token))break;
   const id=resolveToken(token,S,{short:j-i===1});
   if(id){found=id;end=j;break;}
  }
  if(found){embedded.push(found);i=end;}else{plain.push(parts[i]);i++;}
 }
 return {embedded,plain};
}
function describedMatches(ref,S,words,{embedded:embeddedTest,word:dynamicWord=()=>false}){
 const {embedded,plain}=parseDescribed(ref,S,words);
 const known=w=>Object.hasOwn(words,w)||dynamicWord(w);
 if(!plain.every(known))return false;
 if(!embedded.length&&!plain.some(w=>dynamicWord(w)||words[w]?.noun))return false;
 return embedded.every(embeddedTest)&&plain.every(w=>dynamicWord(w)||words[w].test());
}
function entityRef(ref,id,S){
 if(id===undefined||id===null||typeof ref!=='string')return false;
 const direct=resolveToken(ref,S);
 if(direct)return sameEntity(id,direct,S);
 const words=Object.fromEntries(Object.entries(ENTITY_WORDS).map(([w,row])=>[w,{noun:row.noun,test:()=>row.test(id,S)}]));
 return describedMatches(ref,S,words,{embedded:e=>sameEntity(id,e,S)});
}
const KIND_LABELS={person:['person'],npc:['person'],creature:['creature'],item:['thing'],feature:['thing'],object:['thing'],place:['place'],location:['place'],office:['org','collective']};
function typeLabels(id,effect,S){
 const labels=new Set(),states=S.docs.map(stateOf),c=S.catalog;
 if(id===S.actor||id==='player'||c.people.has(id)||states.some(s=>s.npcs?.[id]))labels.add('person');
 if(c.monsters.has(id)||states.some(s=>s.creatures?.[id]||s.effects?.[id]?.kind==='summon'))labels.add('creature');
 if(c.items.has(id)||c.features.has(id)||states.some(s=>s.itemInstances?.[id]||s.inventory?.[id])||S.docs.some(doc=>['item','object','mark'].includes(doc.holdings?.entities?.[id]?.kind)))labels.add('thing');
 if(c.locations.has(id))labels.add('place');
 if(c.factions.has(id)||c.households.has(id)||c.banks.has(id)||officeSeat(id,S)||states.some(s=>s.records?.[id]?.category==='legal_case'||s.projects?.[id])||
  S.docs.some(doc=>['office','organization','collective'].includes(doc.holdings?.entities?.[id]?.kind))){labels.add('org');labels.add('collective');}
 if((effect.target??effect.entity)===id)for(const label of KIND_LABELS[effect.signatureKind]??[])labels.add(label);
 return labels;
}
function legalCaseOf(effect,S){
 const id=S.receipt.legacy?.request,row=stateOf(S.document).records?.[id];
 return row?.category==='legal_request'&&row.sourceEvent===S.receipt.eventId&&row.verb===effect.verb&&row.target===effect.target?row.case??null:null;
}
function referents(effect,ref,S){
 switch(effect.op){
  case 'emit':return ref==='self'?[effect.actor]:[effect.target,legalCaseOf(effect,S)];
  case 'holding.open':return [effect.holder];
  case 'schedule':return [effect.args?.target??effect.target];
  case 'vital':case 'status':case 'learn':return [effect.target??effect.entity];
  default:return [effect.entity??effect.target];
 }
}
function holdingRef(ref,effect,S){
 const direct=resolveToken(ref,S,{short:false});
 if(direct)return effect.holding===direct;
 const variant=effect.variant??effect.terms?.mode??effect.result?.before?.variant??effect.result?.before?.terms?.mode;
 const words={own:{noun:false,test:()=>effect.holder===S.actor||ownedBy(effect.subject,S)},self:{noun:false,test:()=>effect.holder===S.actor}};
 return describedMatches(ref,S,words,{embedded:e=>sameEntity(effect.subject,e,S)||effect.holder===e,word:w=>w===effect.holdingKind||w===variant});
}
function obligationRef(ref,effect,S){
 const direct=resolveToken(ref,S,{short:false});
 if(direct)return effect.id===direct;
 const debtor=effect.debtor??effect.from,creditor=effect.creditor??effect.to,record=effect.result?.before??stateOf(prior(S)).obligations?.[effect.id];
 const summon=id=>stateOf(prior(S)).effects?.[id]?.kind==='summon';
 const words={own:{noun:false,test:()=>debtor===S.actor||creditor===S.actor},self:{noun:false,test:()=>debtor===S.actor},
  debt:{noun:true,test:()=>record?.category==='debt'},summon:{noun:false,test:()=>summon(creditor)||summon(effect.subject)}};
 return describedMatches(ref,S,words,{embedded:e=>[debtor,creditor,effect.subject].includes(e),word:w=>w===effect.obligationKind});
}
function resourceRef(ref,effect,S){
 const from=typeof effect.from==='string'?effect.from.split('|'):[];
 // The moved resource is the effect's resource, else the debited account's.
 const resource=effect.resource??from[1]??null,direct=resolveToken(ref,S);
 if(direct)return resource===direct;
 const words={own:{noun:false,test:()=>from[0]===S.actor&&((prior(S)?.ledger?.accounts?.[effect.from]??0)>0||stateOf(prior(S)).inventory?.[resource]?.quantity>0)}};
 const {embedded}=parseDescribed(ref,S,words);
 return embedded.length>0&&describedMatches(ref,S,words,{embedded:e=>resource===e});
}
const recipeEndpoint=(token,world)=>(world.recipes??[]).find(recipe=>token===recipe.id||token===`${recipe.id}的产出来源`||token===`${recipe.name}的产出来源`)?.id;
// 01 §1.6 / §1.12: one table, exact owners/purposes and native recipe metadata.
const endpointRules=[
 {accepts:token=>token.startsWith('sink:'),matches:(token,account)=>account[0]?.startsWith('sink:')&&(account[2]===token.slice(5)||token==='sink:consume'&&account[0]===token)},
 {accepts:(token,S)=>Boolean(recipeEndpoint(token,S.world)),matches:(token,account,effect,S)=>account[0]==='src:craft'&&account[2]==='craft'&&recipeEndpoint(token,S.world)===(effect.recipe??S.receipt.legacy?.recipe)},
 {accepts:token=>['bank','local_bank','pawnshop','buyer','seller','court','authorized_collector','creditor','recipient'].includes(token),matches:(token,account,effect,S)=>{
  const endpoint=roleEndpoint(token,S.receipt);
  if(!endpoint||account[0]!==endpoint.owner)return false;
  if(effect.op!=='transfer')return true;
  if(endpoint.account)return account.join('|')===endpoint.account;
  return endpoint.purposes.includes(account[2])&&(!['buyer','seller'].includes(token)||account[2]===(account[1]==='coin_river'?'purse':'inventory'));
 }},
 {accepts:token=>['existing_channel','adjacent_field','summon'].includes(token),matches:(token,account,effect,S)=>account[0]===nativeEffectEndpoint(token,effect,S.receipt,S.world)},
 {accepts:token=>['authorized_channel','own_bucket'].includes(token),matches:(token,account,effect,S)=>{
  const {source,destination}=effect.result??{};
  if(effect.op!=='transfer'||effect.resource!=='water'||effect.unit!=='litre'||!(effect.qty>0)||
   source?.path?.[2]!==`physical_feature:${effect.from}`||destination?.path?.[2]!==`physical_feature:${effect.to}`||
   source.before?.waterMl-source.after?.waterMl!==effect.qty*1000||destination.after?.waterMl-destination.before?.waterMl!==effect.qty*1000)return false;
  const features=(S.world.locations??[]).flatMap(place=>place.features??[]);
  if(token==='authorized_channel')return account[0]===effect.from&&features.some(row=>row.kind==='channel'&&row.links?.source===effect.from);
  return account[0]===effect.to&&effect.destinationOwner===S.actor&&features.some(row=>row.id===effect.to&&row.kind==='container');
 }},
 {accepts:()=>true,matches:(token,account,effect,S)=>{
  const id=resolveToken(token,S)??(token.includes(':')?resolveCompound(token,S):null);
  return id!==null?account[0]===id:entityRef(token,account[0],S);
 }},
];
function roleEndpoint(role,receipt){
 const legacy=receipt.legacy??{},route=receipt.routed??receipt.source?.id;
 const payment=legacy.payment,accounts=legacy.accounts??payment?.accounts;
 if(['court','authorized_collector'].includes(role)){
  if(route!=='core:law.pay'||!payment?.creditor||role==='authorized_collector'&&!payment.collector)return null;
  const account=accounts?.to;
  return account===`${payment.creditor}|coin_river|legal_treasury`?{owner:payment.creditor,account}:null;
 }
 if(['bank','local_bank','pawnshop'].includes(role)){
  if(!['core:trade.deposit','core:trade.withdraw','core:trade.redeem','core:trade.remit'].includes(route)||role==='pawnshop'&&route!=='core:trade.redeem')return null;
  const owner=legacy.bank??(route==='core:trade.withdraw'?payment?.debtor:route==='core:trade.redeem'?payment?.creditor:null);
  return owner?{owner,purposes:['vault']}:null;
 }
 if(role==='creditor')return payment?.creditor&&accounts?.to?{owner:payment.creditor,account:accounts.to}:null;
 if(role==='recipient')return route==='core:trade.remit'&&legacy.beneficiary?{owner:legacy.beneficiary,purposes:['purse']}:null;
 if(!['core:trade.sell_to','core:trade.buy','core:trade.sell'].includes(route))return null;
 // Requested slots are not evidence that the native action resolved a party.
 const owner=legacy[role];
 return owner?{owner,purposes:['purse','inventory']}:null;
}
// Descriptive endpoints still require native identities and state evidence.
// The channel conducts water; its linked source is the debited endpoint.
function nativeEffectEndpoint(token,effect,receipt,world){
 if(token==='summon'){
  const row=effect.result?.after;
  return effect.op==='obligation.create'&&effect.obligationKind==='upkeep'&&row?.category==='summon_contract'&&
   row.owner===(receipt.actor??'player')&&effect.from===row.owner&&effect.to===row.effect&&
   effect.result.path?.[1]==='records'&&effect.result.path[2]===effect.id&&effect.result.before===null?row.effect:null;
 }
 const {source,destination}=effect.result??{};
 if(effect.op!=='transfer'||effect.resource!=='water'||effect.unit!=='litre'||!(effect.qty>0)||
  source?.path?.[2]!==`physical_feature:${effect.from}`||destination?.path?.[2]!==`physical_feature:${effect.to}`||
  source.before?.waterMl-source.after?.waterMl!==effect.qty*1000||destination.after?.waterMl-destination.before?.waterMl!==effect.qty*1000)return null;
 const features=(world.locations??[]).flatMap(place=>place.features??[]),channel=features.find(f=>f.kind==='channel'&&f.links?.source===effect.from&&f.links?.destination===effect.to);
 if(!channel)return null;
 return token==='existing_channel'?effect.from:features.find(f=>f.id===effect.to&&f.kind==='soil'&&f.location===channel.location)?.id??null;
}
// `A->B` names the debited and credited endpoints in that order; a trailing
// `:N` on the destination is the exact quantity. Requested/bounded markers are
// verified only by the bounded-outcome audit; any other suffix is unknown.
function splitEndpoint(raw){
 const token=raw.trim().replace(/^(person|creature|thing|collective|org|holding|obligation|resource|place):/,'');
 const parts=token.split(':'),head=['sink','src','pledge'].includes(parts[0])&&parts.length>1?2:1;
 return {endpoint:parts.slice(0,head).join(':'),rest:parts.length>head?parts.slice(head).join(':'):null};
}
const QUANTITY=/^\d+(?:\.\d+)?$/,BOUNDED_MARKER=/^(?:requested_[a-z0-9_]+|bounded_output)$/;
function flowMatches(q,effect,S){
 const parts=q.split('->');
 if(parts.length!==2)return false;
 const from=splitEndpoint(parts[0]),to=splitEndpoint(parts[1]);
 if(from.rest!==null)return false;
 if(effect.op==='move'){
  if(to.rest!==null)return false;
  return entityRef(from.endpoint,effect.from,S)&&entityRef(to.endpoint,effect.to,S);
 }
 const account=value=>typeof value==='string'?value.split('|'):[];
 const endpoint=(token,value)=>endpointRules.find(rule=>rule.accepts(token,S)).matches(token,account(value),effect,S);
 if(!endpoint(from.endpoint,effect.from)||!endpoint(to.endpoint,effect.to))return false;
 if(to.rest===null)return true;
 if(QUANTITY.test(to.rest))return effect.qty===Number(to.rest);
 if(BOUNDED_MARKER.test(to.rest))return Boolean(S.bounds?.(effect));
 return false;
}
function partyFlow(label,ref,effect,S){
 if(!ref.includes('->')||!flowMatches(ref,effect,S))return false;
 // Obligation parties are legal persons: a person label admits organizations.
 return [effect.from,effect.to].every(id=>{const labels=typeLabels(id,effect,S);return labels.has(label)||label==='person'&&labels.has('org');});
}
const CREATE_LABELS={mark:['thing'],item:['thing'],object:['thing'],project:['thing','collective','org'],case:['collective','org'],creature:['creature'],organization:['collective','org'],office:['collective','org']};
function createdRecord(effect,S){
 const path=effect.result?.path,record=path?.[0]==='state'&&path[1]==='records'&&path.length===3?path[2]:null;
 if(record)return stateOf(S.document).records?.[record]??null;
 const id=effect.entity??effect.result?.entity;
 return id?S.docs.map(doc=>stateOf(doc).created?.[id]??stateOf(doc).effects?.[id]??stateOf(doc).projects?.[id]??doc.holdings?.entities?.[id]).find(Boolean)??null:null;
}
// Created-entity words beyond tags: a civil claim is a native case that
// carries a civil matter (law.mjs civilMatter), not a criminal offense.
const CREATE_WORDS={civil_claim:record=>record?.category==='legal_case'&&typeof record.civilMatter==='string'};
function createSubject(label,noun,effect,S){
 if(!(CREATE_LABELS[effect.kind]??[]).includes(label))return false;
 if(noun===effect.kind)return true;
 const record=createdRecord(effect,S);
 return Boolean(record)&&[record.kind,record.template,record.summonType,record.monster,record.species].includes(noun);
}
function subjectMatches(q,effect,S){
 if(q==='world')return effect.op==='time'&&effect.target===undefined&&(effect.entity===undefined||effect.entity==='world');
 const found=/^([a-z]+):(.+)$/.exec(q??'');
 if(!found||!TYPE_LABELS.has(found[1]))return false;
 const [,label,ref]=found;
 if(effect.op==='transfer')return label==='resource'&&resourceRef(ref,effect,S);
 if(label==='resource')return false;
 if(effect.op==='obligation.create')return partyFlow(label,ref,effect,S);
 if(OBLIGATION_OPS.has(effect.op))return label==='obligation'&&obligationRef(ref,effect,S);
 if(HOLDING_OPS.has(effect.op)&&effect.op!=='holding.open')return label==='holding'&&holdingRef(ref,effect,S);
 if(label==='holding'||label==='obligation')return false;
 if(effect.op==='create')return createSubject(label,ref,effect,S);
 return referents(effect,ref,S).some(id=>id!==undefined&&id!==null&&typeLabels(id,effect,S).has(label)&&entityRef(ref,id,S));
}
const camel=word=>word.replace(/_([a-z])/g,(_,c)=>c.toUpperCase());
const literal=raw=>raw==='true'?true:raw==='false'?false:/^-?\d+(?:\.\d+)?$/.test(raw)?Number(raw):raw;
const split=q=>{const [head,...rest]=q.split(':');return [head,rest.length?rest.join(':'):null];};
// Field vocabulary: `condition` is the native durability field; other field
// words are the camelCase native field name.
const FIELD_WORDS={condition:'durability'};
const VERB_WORDS={greeting:'greet'};
// Identifier-like strings outside prose fields are structured evidence.
const PROSE_KEYS=new Set(['text','content','intent','description','narration','reason','purpose','remedy','incident','summary','note','notes','why','name','title','label']);
function structuredStrings(value,out=[]){
 if(typeof value==='string'){if(/^[A-Za-z0-9_:|.-]+$/.test(value))out.push(value);}
 else if(Array.isArray(value))for(const entry of value)structuredStrings(entry,out);
 else if(value&&typeof value==='object')for(const [key,entry] of Object.entries(value))if(!PROSE_KEYS.has(key))structuredStrings(entry,out);
 return out;
}
const evidenceOf=payload=>[...(Array.isArray(payload.evidence)?payload.evidence:[]),...(Array.isArray(payload.terms?.evidence)?payload.terms.evidence:[])];
const TOPIC_SUFFIXES={
 quote:payload=>payload.quoteOnly===true||payload.terms?.quoteOnly===true,
 with_evidence:payload=>evidenceOf(payload).length>0,
 with_document:(payload,S)=>evidenceOf(payload).some(id=>S.docs.some(doc=>stateOf(doc).itemInstances?.[id]?.document||doc.holdings?.entities?.[id]?.facts?.document)),
};
function topicMatches(topic,effect,S){
 const payload=effect.payload??{},fields=[payload.kind,payload.subject,payload.terms?.subject,payload.terms?.kind].filter(x=>typeof x==='string');
 if(fields.includes(topic))return true;
 const refs=new Set(structuredStrings(payload));
 const id=resolveToken(topic,S,{short:false});
 if(id&&refs.has(id))return true;
 return fields.some(field=>{
  if(!topic.startsWith(`${field}_`))return false;
  const rest=topic.slice(field.length+1);
  if(Object.hasOwn(TOPIC_SUFFIXES,rest))return TOPIC_SUFFIXES[rest](payload,S);
  const ref=resolveToken(rest,S,{short:false});
  return Boolean(ref)&&refs.has(ref);
 });
}
function emitDescriptor(q,effect,S){
 const payload=effect.payload??{},[head,arg]=split(q);
 const verb=word=>{const value=VERB_WORDS[word]??word;return effect.verb===value||payload.kind===value;};
 if(arg===null)return verb(head);
 if(typeof literal(arg)!=='string')return [effect,payload,payload.terms].some(row=>row&&Object.hasOwn(row,head)&&row[head]===literal(arg));
 return verb(head)&&topicMatches(arg,effect,S)||head==='request'&&effect.verb===arg;
}
function vitalDescriptor(q,effect,S){
 const [head,arg]=split(q);
 if(head==='body')return arg!==null&&effect.type===`body:${arg}`;
 if(head==='harm')return effect.type==='harm'&&effect.delta<0&&(arg===null||harmMeans(arg,effect,S));
 if(arg!==null)return false;
 if(head==='heal')return effect.delta>0&&(effect.type==='heal'||effect.need==='hp');
 if(head==='hp')return effect.need==='hp';
 if(head==='magic_cost')return effect.need==='mp'&&effect.delta<0&&(effect.target??effect.entity)===S.actor;
 return false;
}
function harmMeans(means,effect,S){
 const id=resolveToken(means,S),exchange=S.receipt.legacy?.exchange,spell=S.catalog.spells.get(effect.spell??S.receipt.legacy?.spell);
 if(id&&[effect.weapon,effect.spell,exchange?.target===effect.target?exchange.weapon:undefined].includes(id))return true;
 return [effect.element,spell?.element,spell?.effectSpec?.element].includes(means);
}
function statusDescriptor(q,effect){
 const [status,arg]=split(q);
 if(effect.status!==status)return false;
 if(arg===null)return effect.removed!==true&&!(effect.magnitude<0);
 if(arg==='reduce')return effect.removed===true||effect.magnitude<0||Number.isFinite(effect.result?.before?.power)&&(effect.result?.after?.power??0)<effect.result.before.power;
 return false;
}
const LEARN_SOURCES=new Set(['practice','teacher','book','observation']);
function learnSource(part,effect,S){
 if(BOUNDED_MARKER.test(part))return Boolean(S.bounds?.(effect));
 const [mode,...tail]=part.split('_'),ref=tail.join('_');
 if(!LEARN_SOURCES.has(mode))return null;
 const actual=effect.mode??(effect.learningSource==='practice'?'practice':null);
 if(actual!==mode)return false;
 if(!ref)return true;
 const id=resolveToken(ref,S);
 return Boolean(id)&&sameEntity(effect.learningSource,id,S);
}
function learnSubject(part,effect,S){
 const subject=effect.subject,id=resolveToken(part,S);
 if(id)return subject===id;
 const s=stateOf(prior(S)),skill=S.catalog.skills.get(subject),known=Boolean(s.skills?.[subject]||s.recipes?.[subject]||s.spells?.[subject]);
 const words={known:{noun:false,test:()=>known},new:{noun:false,test:()=>!known},
  skill:{noun:true,test:()=>Boolean(skill)},recipe:{noun:true,test:()=>S.catalog.recipes.has(subject)},spell:{noun:true,test:()=>S.catalog.spells.has(subject)},
  // A cultivation technique is a skill taught by a combat profession.
  cultivation:{noun:false,test:()=>S.catalog.professions.get(skill?.profession)?.kind==='combat'}};
 return describedMatches(part,S,words,{embedded:e=>subject===e});
}
function learnDescriptor(q,effect,S){
 return q.split(':').every(part=>learnSource(part,effect,S)??learnSubject(part,effect,S));
}
function atDawn(effect,S){
 const arrival=effect.result?.after,doc=prior(S);
 if(!S.engine||!doc||!Number.isSafeInteger(arrival)||!effect.until)return false;
 const sunrise=localWeather(S.engine,doc,stateOf(doc).location,arrival)?.sunriseMinute;
 return Number.isSafeInteger(sunrise)&&arrival%1440===sunrise;
}
function timeDescriptor(q,effect,S){
 const [head,arg]=split(q);
 if(head==='until')return arg==='dawn'&&atDawn(effect,S);
 if(head==='minutes')return QUANTITY.test(arg??'')&&effect.minutes===Number(arg);
 return arg===null&&effect.mode===head;
}
function moveDescriptor(q,effect,S){
 if(q.includes('->'))return flowMatches(q,effect,S);
 const [head,arg]=split(q);
 if(head==='place'&&arg!==null)return entityRef(arg,effect.to,S);
 if(arg!==null)return false;
 const id=resolveToken(q,S);
 if(id)return effect.to===id;
 const route=Array.isArray(effect.route)&&effect.route.length>0;
 const words={reachable:{noun:false,test:()=>route&&effect.route.every(r=>S.catalog.routes.get(r)?.modes?.includes('walk'))},
  escape:{noun:false,test:()=>['disengage','flee'].includes(effect.mode)},
  route:{noun:true,test:()=>route&&S.catalog.locations.has(effect.to)},
  push:{noun:true,test:()=>effect.mode==='push'}};
 const {embedded}=parseDescribed(q,S,words);
 return !embedded.length&&describedMatches(q,S,words,{embedded:()=>false});
}
function factDescriptor(q,effect){
 const [head,arg]=split(q);
 if(effect.field!==(FIELD_WORDS[head]??camel(head)))return false;
 return arg===null||sameValue(effect.value,literal(arg));
}
function createDescriptor(q,effect,S){
 const record=createdRecord(effect,S),tags=new Set([...(effect.tags??[]),...(record?.tags??[])]);
 if(Object.hasOwn(CREATE_WORDS,q))return CREATE_WORDS[q](record);
 return q.split('+').every(tag=>tags.has(tag));
}
function holdingOpenDescriptor(q,effect,S){
 const [kind,arg]=split(q);
 if(effect.holdingKind!==kind)return false;
 if(arg===null)return true;
 const variant=effect.variant??effect.terms?.mode??effect.result?.after?.variant??effect.result?.after?.terms?.mode;
 return arg===variant||entityRef(arg,effect.subject,S);
}
function holdingDescriptor(q,effect,S){
 const [head,arg]=split(q);
 if(head==='new_holder'&&arg!==null){
  const token=splitEndpoint(arg).endpoint;
  return endpointRules.find(rule=>rule.accepts(token,S)).matches(token,[effect.newHolder??effect.to],effect,S);
 }
 if(head==='subject'&&arg!==null)return effect.subject===resolveCompound(arg,S);
 if(head==='reason'&&arg!==null)return effect.reason===arg;
 return arg===null&&effect.reason===head;
}
function obligationDescriptor(q,effect){
 const [head,arg]=split(q),after=effect.result?.after;
 const remaining=after?.remaining??(Number.isFinite(after?.amount)&&Number.isFinite(after?.paid)?after.amount-after.paid:effect.result?.remaining);
 if(effect.op==='obligation.create')return arg===null&&effect.obligationKind===head;
 if(head==='amount')return QUANTITY.test(arg??'')&&effect.amount===Number(arg);
 if(head==='partial')return QUANTITY.test(arg??'')&&effect.amount===Number(arg)&&remaining>0;
 if(head==='full')return arg===null&&remaining===0;
 return arg===null&&effect.reason===head;
}
function descriptorMatches(q,effect,S){
 if(!q)return false;
 switch(effect.op){
  case 'transfer':return q.includes('->')&&flowMatches(q,effect,S);
  case 'emit':return emitDescriptor(q,effect,S);
  case 'vital':return vitalDescriptor(q,effect,S);
  case 'status':return statusDescriptor(q,effect);
  case 'learn':return learnDescriptor(q,effect,S);
  case 'time':return timeDescriptor(q,effect,S);
  case 'move':return moveDescriptor(q,effect,S);
  case 'fact.set':return factDescriptor(q,effect);
  case 'create':return createDescriptor(q,effect,S);
  case 'holding.open':return holdingOpenDescriptor(q,effect,S);
  case 'holding.close':case 'holding.transfer':case 'holding.rescale':return holdingDescriptor(q,effect,S);
  case 'obligation.create':case 'obligation.settle':case 'obligation.cancel':return obligationDescriptor(q,effect);
  case 'transition':{const [to,reason]=split(q);return effect.to===to&&(reason===null||effect.reason===reason||effect.basis===reason);}
  default:return false;
 }
}
function parseSignature(value){
 const op=signatureOp(value);
 if(!op)return null;
 if(value===op)return {op,qualifiers:[]};
 if(value[op.length]!=='('||!value.endsWith(')'))return null;
 return {op,qualifiers:value.slice(op.length+1,-1).split(',').map(q=>q.trim())};
}
// The first qualifier is the subject when it has subject form; a signature
// may also omit the subject, and then every qualifier is a descriptor.
const subjectForm=q=>q==='world'||TYPE_LABELS.has(/^([a-z]+):/.exec(q??'')?.[1]);
function qualifierFailures(parsed,effect,S){
 if(!parsed.qualifiers.length)return [];
 const [first,...rest]=parsed.qualifiers,subject=subjectForm(first)?first:null,descriptors=subject?rest:parsed.qualifiers;
 return [...(subject===null||subjectMatches(subject,effect,S)?[]:[subject]),...descriptors.filter(q=>!descriptorMatches(q,effect,S))];
}
// Conditional consequences (05 §5.2.7 / 06 §6.7) never turn a submitted
// accusation, appeal or bribe offer into an accepted outcome. The request kind
// and the decision are read from the native request and decision records the
// receipt points to; no signature wording is mapped to a request kind.
function conditionalSignature(value){
 const found=value.match(/(?:,\s*|_)if_(authority_accepts|accepted)\)$/);
 return found?{condition:found[1],value:value.slice(0,found.index)+')'}:null;
}
function legalSubmission(effect,receipt,document){
 const result=effect.result,id=result?.path?.[2],row=document?.state?.records?.[id];
 if(effect.op!=='emit'||result?.path?.length!==3||result.path[0]!=='state'||result.path[1]!=='records'||
  result.before!==null||row?.category!=='legal_request'||receipt.legacy?.request!==id||receipt.legacy?.submitted!==true||
  row.actor!==(receipt.actor??'player')||row.sourceEvent!==receipt.eventId||row.verb!==effect.verb||row.target!==effect.target||
  !row.receiver||row.payload?.receiver!==row.receiver||row.request?.kind!==effect.payload?.kind||
  JSON.stringify(result.after)!==JSON.stringify(row)||JSON.stringify(row.payload)!==JSON.stringify(effect.payload))return null;
 return {id,row};
}
function legalAcceptance(submission,document){
 const {id,row}=submission;
 // An acceptance is the recipient's decision about THIS submission. A
 // judgment may also record that decision; an old judgment of the case cannot.
 const events=Object.entries(document.state.records??{}).filter(([key,event])=>
  event.category==='world_event'&&key===`world_event:${event.id}`&&
  (event.verb==='accept'||event.verb==='judged'&&event.payload?.accepted===true)&&
  event.actor===row.receiver&&event.target===row.actor&&event.payload?.request===id&&
  event.payload?.kind===row.request.kind&&event.minute>=row.minute&&event.minute<=document.state.minute&&
  (!row.case||event.payload.case===row.case));
 return events[0]?.[1]??null;
}
// The accepted consequence is the native result of that decision: a record it
// created (sourceEvent = the decision, same requested kind, parties drawn from
// the request), a change to a record the decision names, or a personal-account
// payment of exactly the requested terms from requester to recipient.
const RECORD_PARTIES=['victim','offender','claimant','respondent','debtor','creditor','appellant'];
function legalConsequence(effect,submission,acceptance,document){
 const {row}=submission,request=row.request,result=effect.result;
 if(effect.op==='transfer'){
  const terms=request.terms??{},resource=terms.resource==='coin'?'coin_river':terms.resource,personal=resource==='coin_river'?'purse':'inventory';
  return Number.isFinite(terms.amount)&&effect.qty===terms.amount&&effect.resource===resource&&
   effect.from===`${row.actor}|${resource}|${personal}`&&effect.to===`${row.receiver}|${resource}|${personal}`;
 }
 if(result?.path?.[0]!=='state'||result.path[1]!=='records'||typeof result.path[2]!=='string')return false;
 const id=result.path[2],native=document.state.records?.[id];
 if(!native||!sameValue(result.path.slice(3).reduce((value,key)=>value?.[key],native),result.after))return false;
 if(result.before===null&&result.path.length===3){
  const parties=new Set([row.actor,row.receiver,...structuredStrings(request)]);
  return native.sourceEvent===acceptance.id&&(native.offense??native.kind)===request.kind&&RECORD_PARTIES.every(key=>native[key]===undefined||parties.has(native[key]));
 }
 return result.before!==null&&(effect.entity??id)===id&&Object.values(acceptance.payload??{}).includes(id);
}
export function signatureMatches(expected,effects,receipt={},requested,world,document,context={}){
 return signatureCheck(expected,effects,receipt,requested,world,document,context).ok;
}
// Why a signature did not match: the first unmet requirement and, for an
// effect of the right primitive, the qualifiers the vocabulary could not verify.
export function signatureDiagnostics(expected,effects,receipt={},requested,world,document,context={}){
 return signatureCheck(expected,effects,receipt,requested,world,document,context).diagnostics;
}
function signatureCheck(expected,effects,receipt,requested,world,document,context){
 const S=world?signatureScope(receipt,world,document,context):null,diagnostics=[];
 const adopted=effects,{excluded}=signatureEffects(effects,receipt,requested);
 const failures=(value,effect,scope=S)=>{
  const op=signatureOp(value);
  if(!op)return legacyQualifierMatches(value,effect)?[]:[value];
  if(effect.op!==op)return [value];
  const parsed=parseSignature(value);
  if(!parsed)return [value];
  if(!parsed.qualifiers.length)return [];
  if(!world)throw new TypeError('Qualified signature matching requires the scored world');
  return qualifierFailures(parsed,effect,scope);
 };
 const matches=(value,effect,scope)=>failures(value,effect,scope).length===0;
 const fail=(value,reason)=>{diagnostics.push({value,reason});return {ok:false,diagnostics};};
 for(const value of expected.filter(value=>!signatureOp(value)))if(!adopted.some(effect=>matches(value,effect)))return fail(value,'no adopted effect carries this legacy token');
 // Review 10-22 P0: companions and receipt-proven costs accompany the
 // request; they never satisfy a required signature effect.
 const eligible=adopted.flatMap((effect,i)=>excluded.includes(effect)||companionEffect(effect,receipt)?[]:[i]);
 const required=[],candidates=[];
 for(const value of expected.filter(signatureOp)){
  const conditional=conditionalSignature(value);
  if(!conditional){required.push(value);candidates.push(eligible.filter(i=>matches(value,adopted[i])));continue;}
  if(!document)return fail(value,'conditional consequence needs native world records');
  const submissions=adopted.flatMap(effect=>{
   if(!expected.some(signature=>!conditionalSignature(signature)&&signatureOp(signature)==='emit'&&matches(signature,effect)))return [];
   const found=legalSubmission(effect,receipt,document);
   return found?[found]:[];
  });
  if(submissions.length!==1)return fail(value,`${submissions.length} native legal submissions carry the condition`);
  const submission=submissions[0],acceptance=legalAcceptance(submission,document);
  // Role words in the consequence denote the submission's native recipient.
  const scoped={...S,roles:{...S.roles,officer:submission.row.receiver,receiver:submission.row.receiver}};
  const parsed=parseSignature(conditional.value);
  if(!acceptance){
   // Even a companion/cost-labelled consequence is forbidden before acceptance:
   // the subject and direction alone identify it.
   if(adopted.some(effect=>effect.op===parsed.op&&(!subjectForm(parsed.qualifiers[0])||subjectMatches(parsed.qualifiers[0],effect,scoped))&&parsed.qualifiers.filter(q=>q.includes('->')&&!subjectForm(q)).every(q=>flowMatches(q,effect,scoped))))
    return fail(value,'consequence committed before the recipient accepted');
   continue;
  }
  required.push(conditional.value);
  candidates.push(eligible.filter(i=>matches(conditional.value,adopted[i],scoped)&&legalConsequence(adopted[i],submission,acceptance,document)));
 }
 for(const [r,list] of candidates.entries())if(!list.length){
  const op=signatureOp(required[r]),same=eligible.filter(i=>adopted[i].op===op);
  const closest=same.map(i=>failures(required[r],adopted[i])).sort((a,b)=>a.length-b.length)[0];
  return fail(required[r],closest?`unverified qualifiers: ${closest.join(' | ')}`:`no non-companion ${op} effect`);
 }
 if(eligible.length!==required.length){
  const extra=eligible.filter(i=>!candidates.some(list=>list.includes(i))).map(i=>adopted[i].op);
  return fail(null,`${eligible.length} non-companion effects for ${required.length} required${extra.length?`; unrequested: ${extra.join(', ')}`:''}`);
 }
 // Required effects are a multiset: each takes a distinct adopted effect.
 const owner=new Map();
 const assign=(r,seen)=>{
  for(const i of candidates[r])if(!seen.has(i)){
   seen.add(i);
   if(!owner.has(i)||assign(owner.get(i),seen)){owner.set(i,r);return true;}
  }
  return false;
 };
 for(let r=0;r<required.length;r++)if(!assign(r,new Set()))return fail(required[r],'competes with another requirement for the same adopted effect');
 return {ok:true,diagnostics};
}

const timePassingActions=new Set((await Promise.all((await fs.readdir(path.join(root,'world/actions'))).filter(f=>f.endsWith('.json')).map(async f=>JSON.parse((await fs.readFile(path.join(root,'world/actions',f),'utf8')).replace(/^﻿/,''))))).flatMap(file=>file.actions??[]).filter(action=>action.call?.tool==='world_time').map(action=>action.id));
// Spatial needs are declared by the action catalog (world/actions `spatial`,
// main-session ruling 10-22): an entry applies unconditionally, for listed
// values of one slot, or when the run requests/commits one of the listed
// primitives. An unknown slot value counts as applying.
const catalogActions=(await Promise.all((await fs.readdir(path.join(root,'world/actions'))).filter(f=>f.endsWith('.json')).map(async f=>JSON.parse((await fs.readFile(path.join(root,'world/actions',f),'utf8')).replace(/^﻿/,''))))).flatMap(file=>file.actions??[]);
const spatialCatalog=new Map(catalogActions.filter(action=>Array.isArray(action.spatial)).map(action=>[action.id,action.spatial]));
const DISTANCE_NEEDS=new Set(['range','reach','lineOfSight']);
const featureIds=new Set();
export function spatialNeeds(actionIds,run){
 if(!featureIds.size)for(const place of run.world?.locations??[])for(const feature of place.features??[])featureIds.add(feature.id);
 const actor=run.receipt?.actor??'player',states=[run.document?.state,run.before?.state].filter(Boolean);
 const kinds=effect=>{
  const id=effect.op==='move'?effect.to:effect.target??effect.entity,out=new Set();
  if(id&&!['self','player',actor].includes(id))out.add('other');
  if(id==='player'||states.some(s=>s.npcs?.[id]||s.creatures?.[id]))out.add('agent');
  if(featureIds.has(id))out.add('feature');
  return out;
 };
 const effects=[...(run.requested??[]),...(run.effects??[])].filter(effect=>effect?.op);
 const slots=run.submitted?.args?.slots??{};
 const needs=new Map();
 for(const id of actionIds)for(const entry of spatialCatalog.get(id)??[]){
  const need=typeof entry==='string'?entry:entry.need;
  const applies=typeof entry==='string'||(!entry.slot||!Object.hasOwn(slots,entry.slot)||entry.values?.includes(slots[entry.slot]))&&
   (!entry.effects||effects.some(effect=>entry.effects.includes(effect.op)&&(!entry.targets||entry.targets.some(kind=>kinds(effect).has(kind)))));
  if(applies)needs.set(need,[...(needs.get(need)??[]),id]);
 }
 return needs;
}
// Pending distance premises (no native measurement) become S4 setupUnmet for
// an evaluated action that reads distance or sight; otherwise they stand as
// co-location and perception only, with the number recorded as unbuilt S4.
export function settleSpatial(pending,actionIds,run){
 const unmet=[],notes=[];
 if(!pending?.length)return {unmet,notes};
 const needs=[...spatialNeeds(actionIds,run)].filter(([need])=>DISTANCE_NEEDS.has(need));
 for(const row of pending){
  if(needs.length)unmet.push({item:row.item,reason:`S4：${needs.map(([need,ids])=>`${unique(ids).join('/')} 读取 ${need}`).join('；')}，声明距离 ${row.distanceMeters} 米无原生测量（docs/A3-接点归属.md 接点3）`});
  else notes.push(`${row.item}: 距离 ${row.distanceMeters} 米 S4 未建立、本题动作不读取；仅以原生同地与可感知为前提`);
 }
 return {unmet,notes};
}
function companionEffect(effect,receipt){
 const actor=receipt.actor??'player',target=effect.target??effect.entity??effect.actor;
 const exchange=receipt.routed==='core:combat'?receipt.legacy?.exchange:null;
 if(exchange){
  const vital=exchange.vitals?.[target],path=target==='player'?['state','player']:['state',effect.signatureKind==='creature'?'creatures':'npcs',target];
  // Native retaliation and defensive counterstrikes accompany the requested
  // intent. Require the exact committed HP pair, never all combat harm.
  if(effect.op==='vital'&&effect.need==='hp'&&effect.type==='harm'&&vital&&
   (target===exchange.actor||exchange.intent==='defend'&&target===exchange.target)&&
   effect.delta===vital.after-vital.before&&effect.delta<0&&
   sameValue(effect.result?.path,[...path,'hp'])&&effect.result?.before===vital.before&&effect.result?.after===vital.after)return true;
  if(effect.op==='status'&&target===exchange.actor&&exchange.received>0&&vital?.after===0&&
   effect.status===exchange.actorStatus&&sameValue(effect.result?.path,[...path,'status'])&&effect.result?.after===effect.status)return true;
 }
 if(effect.op==='learn'&&target===actor){
  const source=effect.learningSource??(typeof effect.source==='string'?effect.source:effect.source?.type)??effect.mode;
  return ['doing','practice'].includes(source)&&effect.result?.path?.[1]==='skills';
 }
 if(effect.op==='fact.set'&&effect.field==='durability'){
  return (receipt.legacy?.spent?.toolWear??[]).some(row=>row.item===effect.entity&&row.before===effect.result?.before&&row.after===effect.value&&row.after<row.before);
 }
 // Elapsed time accompanies an action, except for the catalog's time-passing
 // actions (adapter world_time), whose passage of time is the request itself.
 if(effect.op==='time')return effect.minutes>0&&effect.minutes===receipt.cost?.time&&!timePassingActions.has(receipt.routed??receipt.source?.id);
 if(effect.op==='vital'&&target===actor&&effect.type===`body:${effect.need}`){
  const drain=['stamina','satiety','hydration'].includes(effect.need)&&effect.delta<0||effect.need==='fatigue'&&effect.delta>0;
  return Boolean(drain&&receipt.cost?.time>0&&effect.result?.after);
 }
 return false;
}

// Start each intention from the same campaign: rows cannot spend each other's
// money, move observers or exhaust a later row's daily bounds.
export async function executeIntent(engine,initial,row){
 let {document,setupUnmet,notes=[],bindings={},spatialPending=[]}=applyIntentSetup(engine,initial,row.setup),preview=null,receipt=null,adopted=null,error=null,refused=false,clarified=false,submitted=null;
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
   if(mark&&!mark.blocked&&mark.permission?.allowed!==false){
    const requestedMark=slots.effects?.find(e=>e.op==='create'&&e.kind==='mark');
    const forms=mark.slots.find(s=>s.name==='form')?.options??[];
    const form=forms.find(f=>f.value===requestedMark?.facts?.form)?.value??forms[0]?.value;
    fill(mark,{intent:slots.intent??row.intent,form,...(requestedMark?.facts?.zone!==undefined?{zone:requestedMark.facts.zone}:{}),tags:requestedMark?.tags??[engine.world.openTagging.default]});
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
   if(receipt?.status==='preview')await commit(call);
   else if(prepared?.status==='needs_alternative'&&prepared.fallback?.available){
    // Accept the native alternative explicitly; availability earns no credit.
    const mark=(input.args?.effects??[]).find(e=>e.op==='create'&&e.kind==='mark');
    const slots={intent:prepared.fallback.intent,form:mark?.facts?.form??engine.world.openActionRules.mark.forms[0],...(mark?.facts?.zone!==undefined?{zone:mark.facts.zone}:{}),tags:mark?.tags??[engine.world.openTagging.default]};
    const fallback={tool:'world_act',eventId:`${eventId}-mark`,args:{action:prepared.fallback.action,slots}};
    preview=await invokePreview(fallback);
    if(receiptOf(preview)?.status==='preview')await commit(fallback);
   }
  }
  refused ||= receipt?.status==='rejected';
 }catch(caught){error={code:caught.code??null,message:caught.message,...(Number.isInteger(caught.index)?{index:caught.index}:{})};refused=caught instanceof PrimitiveRejected;}
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
 // Read the refusal contract; a routed refusal never earns execution credit.
 Object.assign(actual,{routed:receipt?.routed??null,reasonCode:receipt?.code??null,reason:receipt?.reason??null,missing:receipt?.missing??[],repair:receipt?.repair??[],setupUnmet,notes,preview:previews[0]??null,previews});
 return {actual,receipt,document,before,preview,prepared,effects,submitted,setupUnmet,requested,notes,bindings,spatialPending};
}

const dieFor=(seed,id,label)=>createHash('sha256').update(`${seed}:${id}:${label}`).digest().readUInt32LE(0)%20+1;
function intentChecks(run,row){
 const prefix=`a3-score-${row.id}`;
 const children=new Set((run.receipt?.steps??[]).flatMap(step=>[step.eventId,`${step.eventId}:action-check`,`${step.eventId}:rite-check`,`${step.eventId}_escape`]));
 return Object.entries(run.document.state.checks??{}).filter(([id,value])=>(children.has(id)||[prefix,`${prefix}:action-check`,`${prefix}:rite-check`,`${prefix}_escape`].includes(id)||id.startsWith(`${prefix}:batch:`)&&/^\d+$/.test(id.slice(`${prefix}:batch:`.length)))&&Number.isInteger(value.die));
}
// Select the existing document seed input, never override check()/its result.
// Both extremes include advantage/disadvantage and the opposing die. Keep the
// same event IDs in preview, confirmation and constructor replay.
function branchSeed(initial,checks,outcome,target){
 for(let nonce=0;nonce<1000000;nonce++){
  const seed=`${initial.randomSeed}:a3:${outcome}:${nonce}`;
  if(checks.every(([id,check])=>{
   const wanted=outcome==='success'||target&&id!==target?20:1,opposed=21-wanted;
   return dieFor(seed,id,'d20')===wanted&&(!(check.rolls?.length>1)||dieFor(seed,id,'second')===wanted)&&(!check.opponent||dieFor(seed,id,'opponent:d20')===opposed);
  }))return seed;
 }
 return null;
}
const sameValue=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function validateRepairFailure(engine,run,issues){
 const {receipt,document,before}=run,legacy=receipt.legacy,plan=engine.rules.repairs?.find(p=>p.id===legacy.plan);
 const record=document.state.records?.[legacy.receipt],unit=document.state.itemInstances?.[legacy.instance];
 if(!plan||!record||record.category!=='repair'||record.plan!==plan.id){issues.push('missing native repair plan/record');return;}
 const held=before.state.inventory?.[legacy.item],old=before.state.itemInstances?.[legacy.instance]??held;
 const durability=old?.durability??engine.byId.get(legacy.item)?.durability,maxDurability=old?.maxDurability??engine.byId.get(legacy.item)?.durability;
 const unchanged={durability,maxDurability};
 if(legacy.success!==false||record.success!==false||legacy.restored!==0||!sameValue(legacy.before,unchanged)||!sameValue(legacy.after,unchanged)||!sameValue(record.before,unchanged)||!sameValue(record.after,unchanged)||unit?.durability!==durability||unit?.maxDurability!==maxDurability)issues.push('failed repair changed target durability');
 const stations=facilityView(engine,before.state,before.state.location)?.workstations??engine.byId.get(before.state.location)?.workstations;
 const station=stations?.find(s=>s.kind===plan.workstation),fee=station?.fee??0;
 if(record.station!==(station?.id??null))issues.push('repair native workstation mismatch');
 if(record.fee!==fee||legacy.spent?.feePaid!==fee||record.minutes!==plan.minutes||legacy.spent?.minutes!==plan.minutes)issues.push('repair native fee/time mismatch');
 const materials=new Map();for(const m of plan.materials??[])materials.set(m.item,(materials.get(m.item)??0)+m.amount);
 const expected=[...materials].map(([item,qty])=>({from:`player|${item}|inventory`,to:`sink:consume|${item}|repair`,qty}));
 if(fee)expected.push({from:'player|coin_river|purse',to:station?.owner?.startsWith('npc_')?`${station.owner}|coin_river|purse`:`${record.station}|coin_river|fund`,qty:fee});
 for(const effect of run.effects){
  if(effect.op==='transfer'){
   const index=expected.findIndex(e=>e.from===effect.from&&e.to===effect.to&&e.qty===effect.qty);
   if(index<0)issues.push('failed repair has undeclared transfer');else expected.splice(index,1);
  }else if(!companionEffect(effect,receipt))issues.push(`failed repair granted ${effect.op}`);
 }
 if(expected.length)issues.push('repair native materials/fee missing');
 if(!sameValue([...materials].map(([item,quantity])=>({item,quantity})),(legacy.spent?.materials??[]).map(({item,quantity})=>({item,quantity}))))issues.push('repair material receipt mismatch');
 const wear=legacy.spent?.toolWear??[];
 if(wear.length!==plan.tools.length)issues.push('repair tool wear missing');
 for(const tool of plan.tools){
  const oldTool=heldUnit(engine.primitiveDraft(before),engine,'player',tool),instance=oldTool?.instance;
  const start=oldTool?.durability??engine.byId.get(tool)?.durability,end=Math.max(0,start-plan.toolWear);
  const row=wear.find(w=>w.item===tool),current=instance?document.state.itemInstances?.[instance]:document.state.inventory?.[tool];
  if(row?.before!==start||row?.after!==end||current?.durability!==end||start!==end&&!run.effects.some(e=>e.op==='fact.set'&&e.entity===tool&&e.field==='durability'&&e.value===end))issues.push('repair native tool wear mismatch');
 }
}
// The other branch has no corpus signature. Check its native outcome contract,
// raw effects and books rather than treating any committed receipt as success.
export function validateCheckBranch(engine,run,row,outcome,target){
 const issues=[],{receipt,actual,document}=run,success=outcome==='success';
 const checks=intentChecks(run,row);
 if(!actual.committed||actual.error)issues.push('branch did not commit');
 if(!checks.length||checks.some(([id,check])=>check.success!==(success||Boolean(target&&id!==target)))||target&&!checks.some(([id])=>id===target))issues.push('requested check outcome is impossible at the selected dice extreme');
 if(auditLedger(document.ledger).length)issues.push('ledger audit failed');
 const preview=receiptOf(run.preview);
 if(preview&&preview.status==='preview'&&!sameValue(preview.applied,receipt?.applied))issues.push('preview and committed effects differ');
 if(!receipt)return {ok:false,issues};
 if(receipt.steps){
  const canonical=({signatureKind,...effect})=>({...effect,index:0,stepIndex:0,stepEffectIndex:0,costIndex:0,stepCostIndex:0});
  const flattened=receipt.steps.flatMap(step=>(step.applied??[]).map(canonical));
  const rootEffects=run.effects.map(canonical);
  if(!sameValue(flattened,rootEffects))issues.push('sequence effects differ from child receipts');
  for(const [index,step] of receipt.steps.entries()){
   const childChecks=checks.filter(([id])=>id===step.eventId||id.startsWith(`${step.eventId}:`));
   if(!childChecks.length)continue;
   const childSuccess=childChecks.every(([,check])=>check.success);
   const child={...run,receipt:step,effects:step.applied??[],preview:{receipt:receiptOf(run.preview)?.steps?.[index]},actual:{...actual,route:step.routed??step.source?.id},submitted:{args:{slots:receipt.routing?.steps?.[index]?.slots??{}}}};
   const result=validateCheckBranch(engine,child,{...row,id:step.eventId.slice('a3-score-'.length)},childSuccess?'success':'failure');
   issues.push(...result.issues.map(issue=>`step ${index}: ${issue}`));
  }
  return {ok:issues.length===0,issues:unique(issues)};
 }
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
   const paidLesson=e=>e.op==='transfer'&&e.resource==='coin_river'&&e.from===`${receipt.actor??'player'}|coin_river|purse`&&
    e.to===`${legacy.source?.id}|coin_river|purse`&&e.qty===legacy.cost&&legacy.cost>0&&(receipt.cost?.resources??[]).some(cost=>sameValue(cost,e));
   if(document.state.learning?.[receipt.eventId]?.success!==false)issues.push('failed learning has no failed attempt');
   if(selected.some(e=>!companionEffect(e,receipt)&&!paidLesson(e)&&(e.op!=='learn'||e.subject!==subject||e.result?.path?.[1]!=='learning'||e.result?.after?.success!==false)))issues.push('failed learning granted unrelated effect');
   for(const partition of ['skills','recipes','spells'])if(!sameValue(run.before.state[partition]?.[subject],document.state[partition]?.[subject]))issues.push('failed learning granted knowledge');
  }else if(route==='core:craft.repair'){
   validateRepairFailure(engine,run,issues);
  }else if(route==='core:profession.certify'){
   // professions.profession charges and writes certification only on success;
   // a failed native check still consumes the catalog's examination time.
   const role=engine.byId.get(legacy.profession),before=run.before;
   if(!role||!['combat','life'].includes(role.kind)||legacy.certified!==false||legacy.success!==false)issues.push('failed certification has no native failed attempt');
   const minutes=role?.entry?.minutes??120;
   if(receipt.cost?.time!==minutes||document.state.minute-before.state.minute!==minutes)issues.push('failed certification native time mismatch');
   if(!sameValue(before.state.professions,document.state.professions)||
    !sameValue(before.state.careers?.[legacy.profession]?.certification,document.state.careers?.[legacy.profession]?.certification))issues.push('failed certification granted career');
   const rights=doc=>Object.entries(doc.holdings?.rows??{}).filter(([,h])=>h.kind==='certified'&&h.holder==='player'&&h.subject===`office_cert:${legacy.profession}`);
   if(!sameValue(rights(before),rights(document)))issues.push('failed certification wrote certification holding');
   if(document.state.player.coins!==before.state.player.coins||
    document.ledger.accounts['player|coin_river|purse']!==before.ledger.accounts['player|coin_river|purse'])issues.push('failed certification charged fee');
   // 05 §5.7 / 06 §6.6: a failed examination still leaves the native
   // application record (one request emit to the examining institution the
   // receipt names: office organization, mentor's faction or the mentor), but
   // nothing else.
   const application=legacy.institution?{teacher:legacy.teacher,institution:legacy.institution}:null;
   let applications=0;
   for(const effect of run.effects){
    if(companionEffect(effect,receipt))continue;
    if(application&&effect.op==='emit'&&effect.verb==='request'&&effect.payload?.kind==='certification'&&effect.target===application.institution&&
     effect.payload?.receiver===application.teacher&&effect.payload?.terms?.profession===legacy.profession&&++applications===1)continue;
    issues.push(`failed certification granted ${effect.op}`);
   }
  }else if(route==='core:cast'){
   for(const effect of selected){
    if(companionEffect(effect,receipt))continue;
    if(effect.op==='vital'&&effect.target==='player'&&['hp','mp'].includes(effect.need)&&effect.delta<0)continue;
    issues.push(`failed cast granted ${effect.op}`);
   }
  }else if(canonicalActionId(primitiveRuntime.registry(engine),route)==='core:dialogue.persuade'){
   // dialogue.mjs contested persuasion (review 10-22 P1): a failed judgement
   // leaves exactly the utterance to the person addressed and nothing else.
   const dialogue=legacy.dialogue;
   if(dialogue?.judgement?.success!==false)issues.push('failed persuasion has no native failed judgement');
   let utterances=0;
   for(const effect of run.effects){
    if(companionEffect(effect,receipt))continue;
    if(effect.op==='emit'&&dialogue&&effect.target===dialogue.npc&&effect.payload?.kind===dialogue.action&&++utterances===1)continue;
    issues.push(`failed persuasion granted ${effect.op}`);
   }
   if(utterances!==1)issues.push('failed persuasion has no native utterance');
  }else if(route==='core:combat'){
   // combat exchange: a failed check never harms or affects the opponent.
   // Retaliation and practice are companions; the only other effect is the
   // actor's own weapon wear recorded by the exchange.
   const exchange=legacy.exchange;
   if(!exchange)issues.push('failed combat has no native exchange');
   for(const effect of run.effects){
    if(companionEffect(effect,receipt))continue;
    if(effect.op==='fact.set'&&effect.field==='durability'&&effect.entity===exchange?.weapon&&effect.result?.after<effect.result?.before)continue;
    // A failed escape's movement is checked against the encounter below.
    if(exchange?.intent==='flee'&&effect.op==='move')continue;
    issues.push(`failed combat granted ${effect.op}`);
   }
   if(exchange&&exchange.intent!=='flee'&&exchange.vitals?.[exchange.target]&&exchange.vitals[exchange.target].after!==exchange.vitals[exchange.target].before)issues.push('failed combat changed the opponent');
  }else issues.push('no native failure contract available');
 }
 if(actual.route==='core:combat'&&legacy?.exchange?.intent==='flee'){
  const exchange=legacy.exchange,record=document.state.records?.[`combat_encounter:${legacy.encounter?.id}`];
  if(exchange.escaped!==success||!record||!sameValue(record.lastRound?.movement??null,exchange.movement??null)||record.lastRound?.sourceEvent!==receipt.eventId)issues.push('escape check and native encounter differ');
  const moves=selected.filter(e=>e.op==='move');
  if(!success&&(moves.length||exchange.movement||document.state.location!==run.before.state.location))issues.push('failed escape moved the actor');
  if(exchange.movement&&(moves.length!==1||moves[0].to!==exchange.movement.destination||document.state.location!==exchange.movement.destination||record.active))issues.push('successful escape has no actual arrival');
 }
 return {ok:issues.length===0,issues:unique(issues)};
}

async function executeCheckedIntent(engine,initial,row){
 const first=await executeIntent(engine,initial,row),checks=intentChecks(first,row);
 if(!checks.length||first.setupUnmet.length)return {...first,branches:null,branchesOK:true};
 const runs={},branches={};
 const sequence=Boolean(first.receipt?.steps);
 const cases=[{key:'success',outcome:'success',checks}];
 if(!sequence)cases.push({key:'failure',outcome:'failure',checks});
 for(let index=0;index<cases.length;index++){
  const {key,outcome,checks:branchChecks,target}=cases[index];
  const randomSeed=branchSeed(initial,branchChecks,outcome,target);
  if(!randomSeed){branches[key]={ok:false,issues:['unable to select deterministic dice'],impossible:false};continue;}
  const document={...initial,randomSeed},run=await executeIntent(engine,document,row);
  const actualChecks=intentChecks(run,row);
  // A failed first child can hide later checks. Discover them on the native
  // successful replay, then fail each child with its predecessors succeeding.
  if(sequence&&key==='success'){
   const discovered=actualChecks.filter(([id])=>!branchChecks.some(([old])=>old===id));
   if(discovered.length){cases.push({key:'success',outcome:'success',checks:actualChecks});continue;}
   for(const [child,idCheck] of actualChecks.entries())cases.push({key:`failure:${child}`,outcome:'failure',target:idCheck[0],checks:actualChecks.slice(0,child+1)});
  }
  const validation=validateCheckBranch(engine,run,row,outcome,target);
  runs[key]=run;
  branches[key]={...validation,randomSeed,...(target?{target}:{}),checks:actualChecks.map(([id,check])=>({id,...check})),impossible:actualChecks.some(([id,check])=>check.success!==(outcome==='success'||Boolean(target&&id!==target))),actual:run.actual};
 }
 const selected=row.expected.checkOutcome==='failure'?(sequence?'failure:0':'failure'):'success',run=runs[selected]??first;
 return {...run,branches,branchesOK:Object.values(branches).every(branch=>branch.ok)};
}

// Bounded outcomes (06 §6.7, review 10-22 P0): a clipped result is asserted
// against the rule tables, not merely accepted because it committed. Learning
// gains obey the practice table (daily cap of the starting stage, global
// maximum); spending never exceeds the opening balance of the account spent;
// recipe outputs never exceed output-per-batch times the batches the opening
// materials allow.
export function boundedIssues(engine,run){
 const issues=[],before=run.before,actor=run.receipt?.actor??'player',accounts=before?.ledger?.accounts??{},practice=engine.rules.practice;
 const spent=new Map(),produced=new Map();
 for(const effect of run.effects??[]){
  if(effect.op==='learn'){
   const result=effect.result??{},after=result.after?.proficiency??result.proficiency;
   const start=result.before?.proficiency??(Number.isFinite(result.proficiency)&&Number.isFinite(result.gain)?result.proficiency-result.gain:undefined);
   if(!Number.isFinite(after)&&!Number.isFinite(start))continue;
   if(!Number.isFinite(after)||!Number.isFinite(start)){issues.push(`learn ${effect.subject}: proficiency change is not recorded`);continue;}
   if(after>practice.maximum)issues.push(`learn ${effect.subject}: ${after} exceeds the proficiency maximum ${practice.maximum}`);
   const source=[effect.learningSource,effect.mode,result.sourceKind,result.source?.type];
   if(source.includes('practice')){
    const cap=practice.dailyCaps[Math.min(Math.floor(start/practice.stageSize),practice.dailyCaps.length-1)];
    if(after-start>cap)issues.push(`learn ${effect.subject}: practice gain ${after-start} exceeds the daily cap ${cap}`);
   }
  }
  if(effect.op==='transfer'&&typeof effect.from==='string'){
   if(effect.from.split('|')[0]===actor)spent.set(effect.from,(spent.get(effect.from)??0)+effect.qty);
   if(effect.from.startsWith('src:craft|'))produced.set(effect.resource,(produced.get(effect.resource)??0)+effect.qty);
  }
 }
 for(const [account,qty] of spent)if(qty>(accounts[account]??0))issues.push(`${account}: spends ${qty} from an opening balance of ${accounts[account]??0}`);
 const recipe=engine.world.recipes.find(r=>r.id===run.receipt?.legacy?.recipe);
 if(produced.size&&!recipe)issues.push('craft output without a native recipe');
 if(recipe){
  const batches=Math.min(...(recipe.materials??[]).map(m=>Math.floor((accounts[`${actor}|${m.item}|inventory`]??0)/m.amount)));
  const perBatch=new Map([[recipe.output.item,recipe.output.quantity],...(recipe.byproducts??[]).map(b=>[b.item,b.amount])]);
  for(const [item,qty] of produced){
   const limit=(perBatch.get(item)??0)*batches;
   if(qty>limit)issues.push(`${item}: produced ${qty} exceeds ${limit} (${batches} feasible batches)`);
  }
 }
 return unique(issues);
}
// A credited refusal must give a reason about the requested boundary: the
// native code names a domain (vocabulary below) that the expected request
// contains, and an indexed rejection points at a requested effect of that
// domain. Codes outside the vocabulary (e.g. schema errors) earn no credit.
const REJECTION_DOMAINS={TRANSFER:['transfer'],LEARN:['learn'],MOVE:['move'],OBLIGATION:[...OBLIGATION_OPS],FACT:['fact.set'],REPAIR:['fact.set'],
 TIME:['time'],DURATION:['time','status'],HOLDING:[...HOLDING_OPS],AUTHORITY:[...HOLDING_OPS,'transfer','fact.set','move','obligation.create'],
 PERMIT:[...HOLDING_OPS,'transfer','move'],VITAL:['vital'],STATUS:['status'],SCHEDULE:['schedule'],MARK:['create'],CONSENT:'*',ENTITY:'*',EFFECTS:[]};
export function rejectionReason(signature,actual,requested=[]){
 const code=actual.error?.code??actual.reasonCode??actual.preview?.code??null;
 if(typeof code!=='string')return {ok:false,code,reason:'refusal carries no native reason code'};
 const domain=code.replace(/^E-/,'').split('-').map(part=>REJECTION_DOMAINS[part]).find(Boolean);
 if(!domain)return {ok:false,code,reason:'reason code is outside the rejection vocabulary'};
 const ops=new Set(signature.map(signatureOp).filter(Boolean));
 if(domain==='*')return {ok:true,code};
 if(!domain.length)return ops.size?{ok:false,code,reason:'refused as an empty request although effects were requested'}:{ok:true,code};
 if(!ops.size)return {ok:true,code};
 if(!domain.some(op=>ops.has(op)))return {ok:false,code,reason:`reason concerns ${domain.join('/')} but the request is ${[...ops].join('/')}`};
 const index=actual.error?.index,effect=Number.isInteger(index)?requested?.[index]:null;
 if(effect&&!(domain.includes(effect.op)&&ops.has(effect.op)))return {ok:false,code,reason:`the refused request effect ${index} (${effect.op}) is not in the expected request`};
 return {ok:true,code};
}
// ---- Model-free constructor (06 §6.4/§6.9, 标杆 B07.4, review 10-22) ----
// The metric asks whether a player WITHOUT a model can compose the intent with
// the four-step form. The intent text is the form's local catalog search
// (找相近的动作 = searchActions over labels and synonyms, once per
// perceivable target); slots take only what the form offers: listed options,
// declared defaults, scene entities for entity slots, the intent text for
// free-text slots and the slot minimum for counts. The corpus proposal, input
// and expected never fill a slot; expected only judges the committed result.
// Free primitive composition (open:proposal's effect editor) is not
// enumerated, and an automatic trace alternative earns no credit (不经兜底).
export const CONSTRUCTOR_LIMITS=Object.freeze({attempts:24,combosPerAction:4,searchResults:24});
// The player reads option labels: options whose label or value occurs in the
// intent text are tried first, the rest keep their offered order.
const mentioned=(option,row)=>[option.label,option.value].some(text=>typeof text==='string'&&text.length>=2&&row.intent?.includes(text));
function slotChoices(slot,row,entities){
 if(slot.name==='consent'&&slot.kind!=='object')return [undefined];
 const allowed=(slot.options??[]).filter(option=>option.permission?.allowed!==false);
 const offered=[...allowed.filter(o=>mentioned(o,row)),...allowed.filter(o=>!mentioned(o,row))].map(option=>slot.multiple?[option.value]:option.value);
 if(offered.length)return slot.required?offered:[...offered,undefined];
 if(slot.default!==undefined)return [undefined];
 if(['intent','text','content'].includes(slot.name))return [row.intent];
 if(slot.kind==='text')return slot.required?[row.intent]:[undefined];
 if(slot.kind==='entity')return slot.required?entities:[undefined,...entities];
 if(['quantity','coins','minutes','days'].includes(slot.kind)||Number.isFinite(slot.min))return slot.required?[slot.min??1]:[undefined];
 return slot.required?[]:[undefined];
}
function* slotCombos(slots,lists,limit){
 if(lists.some(list=>!list.length))return;
 const index=lists.map(()=>0);
 for(let produced=0;produced<limit;produced++){
  yield Object.fromEntries(slots.map((slot,i)=>[slot.name,lists[i][index[i]]]).filter(([,value])=>value!==undefined));
  let k=lists.length-1;
  for(;k>=0;k--){index[k]++;if(index[k]<lists[k].length)break;index[k]=0;}
  if(k<0)return;
 }
}
export function constructorCandidates(engine,document,row,limits=CONSTRUCTOR_LIMITS){
 const errors=[];
 // A catalog projection that throws offers the player nothing to choose; the
 // error is reported with the row instead of aborting the corpus.
 let scoped=null;
 try{scoped=engine.scoped(document);}catch(error){errors.push(error.message);}
 const offer=options=>{if(!scoped)return {actions:[],objects:{}};try{return worldActions(scoped,document,options);}catch(error){errors.push(error.message);return {actions:[],objects:{}};}};
 const here=offer({limit:1});
 const entities=[...new Set([...(here.objects?.people??[]).map(p=>p.id),...(here.objects?.items??[]).map(i=>i.id),...(here.objects?.exits??[]).map(e=>e.id)])];
 const candidates=[],seen=new Set();
 const mentions=action=>(action.slots??[]).flatMap(slot=>slot.options??[]).filter(option=>mentioned(option,row)).length;
 const add=(action,target)=>{
  if(!action||action.readOnly||action.blocked||action.inputTool==='world_propose')return;
  const key=`${action.id}|${target??''}`;
  if(seen.has(key))return;
  seen.add(key);candidates.push({action,target,mentions:mentions(action)});
 };
 // 找相近的动作 with 留下点什么 always beside it (06 §6.9.5), then the scene
 // menu and each target's object menu; menu actions whose offered option
 // labels occur in the intent come first.
 for(const target of [null,...entities])for(const action of offer({query:row.intent,target,limit:limits.searchResults}).actions)add(action,target);
 add(offer({query:'open:leave_mark',limit:1}).actions.find(a=>a.id==='open:leave_mark'),null);
 const menu=[];
 for(const target of [null,...entities])for(const action of offer({target,limit:limits.searchResults}).actions)menu.push({action,target,mentions:mentions(action)});
 for(const {action,target} of menu.filter(m=>m.mentions>0).sort((a,b)=>b.mentions-a.mentions))add(action,target);
 for(const {action,target} of menu.filter(m=>!m.mentions))add(action,target);
 return {candidates,entities,errors};
}
export async function constructWithoutModel(engine,initial,row,judge,limits=CONSTRUCTOR_LIMITS){
 const setup=applyIntentSetup(engine,initial,row.setup);
 if(setup.setupUnmet.length)return {ready:false,attempts:[],matched:null};
 const base=setup.document,{candidates,entities,errors}=constructorCandidates(engine,base,row,limits),attempts=[],pending=setup.spatialPending??[];
 const bare={id:row.id,intent:row.intent,expected:row.expected};
 for(const {action,target,mentions} of candidates){
  const slots=action.slots??[];
  // Without a mentioned option the player tries the form's first choice only.
  for(const values of slotCombos(slots,slots.map(slot=>slotChoices(slot,row,entities)),mentions?limits.combosPerAction:1)){
   if(attempts.length>=limits.attempts)return {ready:true,attempts,matched:null,truncated:true,errors};
   const chosen={...structuredClone(action.fill??{}),...values};
   const run=await executeCheckedIntent(engine,base,{...bare,id:`${row.id}-ctor-${attempts.length}`,builder:{action:action.id,slots:chosen}});
   Object.assign(run,{before:base,bindings:setup.bindings,notes:setup.notes});
   // A trace alternative taken automatically after a failed preview is 兜底.
   const fallbackTaken=run.actual.calls.some(call=>call.action!==action.id);
   // A chosen action that reads distance cannot rely on an unmeasured premise.
   const spatialGap=settleSpatial(pending,unique([action.id,run.actual.route].filter(Boolean)),{...run,world:engine.world}).unmet.length>0;
   const verdict=spatialGap?{ok:false,forbidden:false,stop:false}:judge(run,{fallbackTaken});
   attempts.push({action:action.id,target,slots:chosen,route:run.actual.route,committed:run.actual.committed,fallbackTaken,ok:verdict.ok,forbidden:verdict.forbidden??false});
   if(verdict.stop)return {ready:true,attempts,matched:attempts.at(-1),errors};
  }
 }
 return {ready:true,attempts,matched:null,errors};
}

export async function scoreRows(rows,{world,seed,document:initial}={}){
 world??=await loadWorld();seed??=JSON.parse(await fs.readFile(path.join(root,'tests/fixtures/legacy/seed.json'),'utf8'));
 const engine=new WorldEngine(world);initial??=engine.createCharacter(seed,{},'a3-score-independent');
 const registry=primitiveRuntime.registry(engine),normalizeRoute=route=>routeName(route,registry);
 const results=[];
 for(const row of rows){
  const run=await executeCheckedIntent(engine,initial,row),{actual}=run,expectedRoute=row.expected.route??row.expected.action;
  // Evaluated actions: the expected route(s) and the route actually taken.
  const evaluated=unique([...[].concat(expectedRoute),actual.route].filter(r=>typeof r==='string').flatMap(r=>[r,normalizeRoute(r)]));
  const spatial=settleSpatial(run.spatialPending,evaluated,{...run,world});
  run.setupUnmet=[...run.setupUnmet,...spatial.unmet];run.notes=[...(run.notes??[]),...spatial.notes];
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
  const expectsClarification=!expectsRejection&&(Array.isArray(expectedRoute)?expectedRoute.every(r=>normalizeRoute(r)==='clarify'):normalizeRoute(expectedRoute)==='clarify');
  const zeroEffects=!actual.committed&&(run.receipt?.applied??[]).length===0&&run.effects.length===0;
  const contextOf=r=>({before:r.before,bindings:r.bindings,engine,bounds:bounded?effect=>boundedIssues(engine,{...r,effects:[effect]}).length===0:null});
  const boundIssues=bounded&&ready?boundedIssues(engine,run):[];
  const rejection=expectsRejection&&ready&&actual.refused?rejectionReason(row.expected.signature,actual,run.requested):null;
  const matched=!expectsRejection&&!expectsClarification&&ready&&(!actual.error||actual.refused)?signatureCheck(row.expected.signature,run.effects,run.receipt??{},run.requested,world,run.document,contextOf(run)):null;
  const signature=ready&&run.branchesOK&&(expectsRejection
   ?actual.refused&&zeroEffects&&rejection.ok
   :expectsClarification?actual.clarified&&!actual.refused&&!actual.error&&zeroEffects
   :Boolean(matched?.ok)&&boundIssues.length===0);
  // 标杆 B07.4 / review 10-22 P1: constructor credit comes from the model-free
  // form (constructWithoutModel), never from replaying the corpus proposal or
  // builder input, and every corpus row is in the denominator. A refusal or
  // clarification row succeeds when no form choice commits the request.
  const routeMatches=r=>Array.isArray(expectedRoute)?expectedRoute.some(e=>normalizeRoute(e)===normalizeRoute(r)):normalizeRoute(expectedRoute)===normalizeRoute(r);
  const refusing=expectsRejection||expectsClarification;
  const formed=ready?await constructWithoutModel(engine,initial,row,(attempt,{fallbackTaken})=>{
   if(refusing){
    const forbidden=row.expected.signature.length>0&&attempt.actual.committed&&signatureMatches(row.expected.signature,attempt.effects,attempt.receipt??{},attempt.requested,world,attempt.document,contextOf(attempt));
    return {ok:!forbidden,forbidden,stop:forbidden};
   }
   const ok=!fallbackTaken&&attempt.branchesOK&&attempt.actual.committed&&routeMatches(attempt.actual.route)&&
    signatureMatches(row.expected.signature,attempt.effects,attempt.receipt??{},attempt.requested,world,attempt.document,contextOf(attempt))&&
    (!bounded||boundedIssues(engine,attempt).length===0)&&(!row.expected.fallback||attempt.actual.fallback);
   return {ok,stop:ok};
  }):{ready:false,attempts:[],matched:null};
  const constructor=formed.ready&&(refusing?!formed.attempts.some(a=>a.forbidden):Boolean(formed.matched));
  const constructorSearch={method:'model-free form',matched:formed.matched,attempts:formed.attempts.length,truncated:Boolean(formed.truncated),catalogErrors:formed.errors??[],tried:formed.attempts.map(a=>`${a.action}${a.target?`@${a.target}`:''}${a.ok&&!refusing?' ✓':''}${a.forbidden?' ✗':''}`)};
  const supported=bounded?actual.committed&&signature:row.expected.outOfBounds?actual.refused:normalizeRoute(expectedRoute)==='clarify'?actual.clarified:actual.committed&&(row.expected.fallback?actual.fallback:run.receipt?.fallback?.originalIntentFulfilled!==false);
  results.push({id:row.id,text:row.intent,expected:row.expected,bounded,setupUnmet:run.setupUnmet,notes:run.notes??[],signatureDiagnostics:matched?.diagnostics??[],boundIssues,rejection,constructorSearch,actual,checkBranches:run.branches,scores:{route,signature,outOfBounds:ready&&(bounded?actual.committed&&signature:actual.refused===row.expected.outOfBounds),supported:ready&&run.branchesOK&&supported,constructor},repair:row.expected.repair});
 }
 const total=rows.length,tricky=rows.filter(r=>r.tricky).length,rate=(key,denominator=total)=>denominator?results.filter(r=>r.scores[key]).length/denominator:1;
 const fallbackExpected=rows.filter(r=>r.expected.fallback).length,fallbackReacted=results.filter(r=>r.expected.fallback&&r.actual.fallback).length,constructorExpected=total;
 // Preserve the acceptance gate's conservative definition: every expected
 // rejection must really be rejected. Applied violations are reported apart
 // from clarification/failure; those cannot earn rejection credit.
 return {setupUnmet:results.filter(r=>r.setupUnmet.length).map(r=>({id:r.id,items:r.setupUnmet})),setupUnmetCount:results.filter(r=>r.setupUnmet.length).length,total,tricky,trickyRate:total?tricky/total:0,route:rate('route'),signature:rate('signature'),outOfBoundsLeaks:results.filter(r=>r.expected.outOfBounds&&!r.setupUnmet.length&&(r.bounded?!r.scores.outOfBounds:!r.actual.refused)).map(r=>r.id),outOfBoundsApplied:results.filter(r=>r.expected.outOfBounds&&r.actual.committed&&!r.actual.traceOnly&&!(r.bounded&&r.scores.signature)).map(r=>r.id),outOfBoundsUnverified:results.filter(r=>r.expected.outOfBounds&&(r.setupUnmet.length||(!r.actual.committed&&!r.actual.refused&&!r.actual.clarified))).map(r=>r.id),inputMissing:results.filter(r=>r.actual.error?.code==='A3-SCORE-INPUT').map(r=>r.id),unsupported:results.filter(r=>!r.scores.supported).map(r=>r.id),fallbackExpected,fallbackReacted,fallbackReactionRate:fallbackExpected?fallbackReacted/fallbackExpected:1,constructorExpected,constructorMethod:'model-free form search over the catalog (标杆 B07.4)',constructor:rate('constructor',constructorExpected),results};
}
export async function scoreCorpus(options={}){const {rows,corpusPath}=await loadCorpus(options);return {...await scoreRows(rows,options),corpusPath};}
// Importing the scorer performs no run and emits no output.
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const index=process.argv.indexOf('--corpus'),corpusPath=index>=0?process.argv[index+1]:process.argv.slice(2).find(arg=>!arg.startsWith('--'));
 const report=await scoreCorpus(corpusPath?{corpusPath}:{});
 console.log(JSON.stringify(process.argv.includes('--summary')?{...report,results:undefined}:report,null,2));
}
export default scoreCorpus;
