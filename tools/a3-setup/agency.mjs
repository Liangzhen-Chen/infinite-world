import {worldEvent} from '../../server-plugin/world-events.mjs';
import {registerSetupLoader} from './index.mjs';
import {executeProtocolPrimitive} from '../../server-plugin/transition.mjs';
import {skillGrade} from '../../server-plugin/engine.mjs';
import {knowledgeProficiency} from '../../server-plugin/education-state.mjs';
import {personCareer,personTeaching} from '../../server-plugin/entity-view.mjs';
import {prepareSummon,applySummon,validateSummonCatalog} from '../../server-plugin/summons.mjs';

const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const fields=['abilitiesByActor','vocations','reading','practiceState','knowledge','mapKnowledge','demonstrations','combats','conversations','summons','rites'];
const shape=(v,keys)=>object(v)&&Object.keys(v).every(k=>keys.includes(k));
const integer=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const fail=message=>{throw Error(message);};
const requireActor=(ctx,id)=>{id=ctx.ref(id);if(typeof id!=='string'||!ctx.actor(id))fail('missing actor');return id;};
const state=ctx=>ctx.document.state;
const sourceEvent=(ctx,alias)=>{
 if(typeof alias!=='string'||!Object.hasOwn(ctx.bindings,alias))fail('unresolved source event binding (05 §5.6; history loader required)');
 const id=ctx.ref(alias),s=state(ctx),event=worldEvent(s,id);
 if(!event||!integer(event.minute??event.at)||((event.minute??event.at)>s.minute))fail('missing or future native source event');
 return event;
};
const protocol=(ctx,d,p,id)=>executeProtocolPrimitive(d,ctx.engine,p,{eventId:`a3-agency:${id}`,entity:'player'});
const initialFact=(ctx,d,path,value,id)=>protocol(ctx,d,{op:'fact.set',path,value},id);
function array(ctx,setup,field,keys,load){
 if(!Array.isArray(setup[field])){ctx.unmet(field,'expected an array');return;}
 for(const [i,row] of setup[field].entries()){
  const item=`${field}[${i}]`;
  if(!shape(row,keys)){ctx.unmet(item,'invalid declaration or unsupported field');continue;}
  // ctx.native discards the whole draft on failure, including partial writes.
  ctx.native(item,d=>load(row,item,d));
 }
}
function abilities(ctx,setup){
 if(!object(setup.abilitiesByActor)){ctx.unmet('abilitiesByActor','expected actor to ability mapping');return;}
 for(const [alias,row] of Object.entries(setup.abilitiesByActor)){
  const item=`abilitiesByActor.${alias}`;
  if(!shape(row,['skills','spells','recipes','literacy','teaches','spokenLanguages','writtenLanguages','practicalKnowledge'])){ctx.unmet(item,'invalid ability declaration');continue;}
  let actor;try{actor=requireActor(ctx,alias);}catch(error){ctx.unmet(item,error.message);continue;}
  const path=actor==='player'?['state']:['state','npcs',actor];
  if(actor!=='player'&&!state(ctx).npcs?.[actor]){ctx.unmet(item,'abilities require a person, not a creature');continue;}
  if(row.skills!==undefined&&!object(row.skills))ctx.unmet(`${item}.skills`,'expected registered skill to proficiency mapping');
  else for(const [skill,value] of Object.entries(row.skills??{}))ctx.native(`${item}.skills.${skill}`,d=>{
   if(!ctx.engine.world.skills.some(s=>s.id===skill)||!integer(value,0,2699))fail('unknown skill or proficiency outside 0..2699');
   const old=d.get(...path,'skills',skill),previous=typeof old==='object'?old:{};
   // Explicit initial abilities, like the built-in abilities field: no lesson,
   // proficiency gain, certification, consent or success event is manufactured.
   initialFact(ctx,d,[...path,'skills',skill],{...previous,proficiency:value,grade:skillGrade(value),daily:previous.daily??{},breakthroughs:previous.breakthroughs??[]},item);
  });
  if(row.literacy!==undefined)ctx.native(`${item}.literacy`,d=>{
   const value=typeof row.literacy==='boolean'?(row.literacy?ctx.engine.rules.books.minimumLiteracy:0):row.literacy;
   if(!integer(value,0,2699)||row.skills?.skill_literacy!==undefined&&row.skills.skill_literacy!==value)fail('invalid or conflicting literacy');
   const old=d.get(...path,'skills','skill_literacy');
   initialFact(ctx,d,[...path,'skills','skill_literacy'],{...(typeof old==='object'?old:{}),proficiency:value,grade:skillGrade(value),daily:old?.daily??{},breakthroughs:old?.breakthroughs??[]},item);
  });
  for(const partition of ['spells','recipes'])if(row[partition]!==undefined){
   if(!Array.isArray(row[partition])){ctx.unmet(`${item}.${partition}`,'expected registered IDs');continue;}
   for(const [i,id] of row[partition].entries())ctx.native(`${item}.${partition}[${i}]`,d=>{
    const def=ctx.engine.world[partition].find(s=>s.id===id);
    if(!def||!ctx.engine.world.skills.some(s=>s.id===def.skill))fail('unknown knowledge or supporting skill');
    initialFact(ctx,d,[...path,partition,id],d.get(...path,partition,id)??{learnedAt:d.get('state','minute')},item);
    if(d.get(...path,'skills',def.skill)===undefined)initialFact(ctx,d,[...path,'skills',def.skill],{proficiency:0,grade:skillGrade(0),daily:{},breakthroughs:[]},item);
   });
  }
  if(row.teaches!==undefined){
   if(!Array.isArray(row.teaches))ctx.unmet(`${item}.teaches`,'expected registered teaching subjects');
   else for(const [i,subject] of row.teaches.entries())ctx.native(`${item}.teaches[${i}]`,()=>{
    if(typeof subject!=='string'||!ctx.engine.byId.has(subject))fail('unknown teaching subject');
    const career=personCareer(ctx.engine,state(ctx),actor).value,def=ctx.engine.byId.get(subject),skill=def.skill?ctx.engine.byId.get(def.skill):def;
    // Ability survives unconsciousness; availability/consent are separate gates.
    const careerTeaches=career.services.includes(subject)||career.roles.some(role=>(ctx.engine.byId.get(role)?.skillTree??[]).includes(skill.id));
    if(!careerTeaches&&!personTeaching(ctx.engine,state(ctx),actor,subject))fail('no native initial teaching qualification writer (05 §5.4/§5.7); teaches cannot confer a profession');
   });
  }
  for(const field of ['spokenLanguages','writtenLanguages','practicalKnowledge'])if(row[field]!==undefined){
   const value=row[field];
   if(!Array.isArray(value)||value.some(v=>typeof v!=='string'||!v))ctx.unmet(`${item}.${field}`,'expected an array of knowledge IDs');
   else if(field!=='practicalKnowledge'||value.length)ctx.unmet(`${item}.${field}`,field==='practicalKnowledge'?'no native practical-knowledge registry/initialization interface (05 §5.6)':'no native per-actor spoken/written language initializer or river/coast registry mapping (05 §5.6/§5.7; conversationLanguage reads catalog languages)');
  }
 }
}
registerSetupLoader({fields,order:80,load(ctx,setup,selected){
 for(const field of selected){
  if(field==='abilitiesByActor'){abilities(ctx,setup);continue;}
  if(field==='practiceState')array(ctx,setup,field,['actor','subject','practicedToday','dailyLimitReached'],(r)=>{
   const actor=requireActor(ctx,r.actor),s=state(ctx),raw=actor==='player'?s.skills?.[r.subject]:s.npcs?.[actor]?.skills?.[r.subject],skill=ctx.engine.world.skills.find(x=>x.id===r.subject);
   if(!skill||raw===undefined||!['practicedToday','dailyLimitReached'].some(k=>Object.hasOwn(r,k))||['practicedToday','dailyLimitReached'].some(k=>Object.hasOwn(r,k)&&r[k]!==false))fail('expected a known skill and explicit unpracticed/unlimited premise');
   const row=typeof raw==='number'?{proficiency:raw}:raw,today=row.daily?.[String(Math.floor(s.minute/1440))],gain=today?.gain??0;
   if(r.practicedToday===false&&(gain>0||Object.values(today?.targets??{}).some(n=>n>0)))fail('existing practice cannot be erased');
   if(r.dailyLimitReached===false&&gain>=ctx.engine.rules.practice.dailyCaps[Math.floor(row.proficiency/300)])fail('existing daily practice cap is reached');
  });
  if(field==='reading')array(ctx,setup,field,['reader','item','canRead','source'],r=>{
   const actor=requireActor(ctx,r.reader),id=ctx.ref(r.item),s=state(ctx),unit=s.itemInstances?.[id],def=ctx.engine.byId.get(unit?.item??id),d=ctx.engine.primitiveDraft(ctx.document);
   if(typeof r.canRead!=='boolean'||r.source!=='setup.facts'||!def||!unit||unit.owner!==actor||unit.status!=='持有'||ctx.engine.quantity(d,actor,unit.item)<1)fail('reading requires the same held native item instance');
   const canRead=knowledgeProficiency(ctx.engine,s,actor,'skill_literacy')>=ctx.engine.rules.books.minimumLiteracy&&unit.durability!==0&&Boolean(unit.book??def.book);
   if(canRead!==r.canRead)fail('reading premise conflicts with native literacy/book state (05 §5.4); no canRead override');
  });
  if(field==='knowledge')array(ctx,setup,field,['holder','event','source','only','currentOutsideWeather'],(r,item,d)=>{
   const holder=requireActor(ctx,r.holder),event=sourceEvent(ctx,r.event);
   if(!['direct_observation','own_action'].includes(r.source)||r.source==='own_action'&&event.actor!==holder||r.source==='direct_observation'&&event.observer!==holder&&!event.witnesses?.includes(holder))fail('source event does not establish this observer knowledge');
   if(r.only!==undefined&&!Array.isArray(r.only)||r.currentOutsideWeather!==undefined&&r.currentOutsideWeather!==false)fail('invalid knowledge scope');
   if(r.only!==undefined)fail('no native scoped event-knowledge projection for only (05 §5.6 / S6)');
   protocol(ctx,d,{op:'learn',observer:holder,event,id:`a3-knowledge:${holder}:${event.id}`},item);
  });
  if(field==='mapKnowledge')array(ctx,setup,field,['holder','destination','source','route'],(r,item,d)=>{
   const holder=requireActor(ctx,r.holder),destination=ctx.ref(r.destination),place=ctx.engine.world.locations.find(p=>p.id===destination);
   if(holder!=='player'||!place||!['known_map','known_path'].includes(r.source))fail('unknown map destination/source or unsupported map holder (05 §5.6)');
   if(r.route!==undefined){
    const route=r.route;
    if(!shape(route,['from','to','useExistingWorldRoute','passable'])||route.useExistingWorldRoute!==true||route.passable!==true||ctx.ref(route.to)!==destination)fail('invalid existing route declaration');
    ctx.engine.route(ctx.ref(route.from),destination,'walk',state(ctx).minute,ctx.document.randomSeed);
   }
   // A map memory grants knowledge only. No discovery/visit, local position,
   // remote contact, route override, authorization or travel is fabricated.
   ctx.engine.remember(d,{subject:destination,key:`a3-map:${r.source}`,content:place.name,source:r.source},`a3-agency:${item}`);
  });
  if(field==='summons')array(ctx,setup,field,['id','name','spell','summonType','owner','location','active','sourceEvent'],(r,item,d)=>{
   const owner=requireActor(ctx,r.owner),event=sourceEvent(ctx,r.sourceEvent),catalog=ctx.engine.world.spells.find(s=>s.id===r.spell);
   if(typeof r.id!=='string'||!r.id||r.name!==undefined&&(typeof r.name!=='string'||!r.name.trim())||ctx.bindings[r.id]||d.get('state','effects',r.id)||r.active!==true||owner!=='player'||r.location!==state(ctx).location||event.actor!==owner||ctx.ref(event.subject)!==ctx.ref(r.id)||event.spell!==r.spell||event.verb!=='summoned'||catalog?.effectSpec?.kind!=='summon'||catalog.effectSpec.summonType!==r.summonType||validateSummonCatalog(catalog).length)fail('invalid summon or incompatible historical source');
   // Work/guard summons need their actual assignment/medium, absent here.
   if(!['water_cup','fire_projection'].includes(r.summonType))fail('missing native summon assignment/medium premise (13 §13.5)');
   const at=event.minute??event.at,now=d.get('state','minute');
   if(at+catalog.duration<=now||at+catalog.effectSpec.upkeepMinutes<=now)fail('historical summon requires elapsed upkeep reconciliation (13 §13.5)');
   initialFact(ctx,d,['state','minute'],at,item);
   const prepared=prepareSummon.call(ctx.engine,d,catalog,{target:'player'}),result=applySummon.call(ctx.engine,d,prepared,r.id);
   if(result.effectFailed)fail(result.effectFailed);
   if(r.name!==undefined)initialFact(ctx,d,['state','effects',result.summon,'name'],r.name,item);
   initialFact(ctx,d,['state','minute'],now,item);
   // Bind only after every potentially failing native operation has succeeded.
   ctx.bindings[r.id]=result.summon;
  });
  if(field==='vocations')array(ctx,setup,field,['actor','id','sourceEvent','conflictOfInterest'],r=>{
   const actor=requireActor(ctx,r.actor);sourceEvent(ctx,r.sourceEvent);
   if(!ctx.engine.rules.npcGrowth.vocations.some(v=>v.id===r.id)||typeof r.conflictOfInterest!=='boolean')fail('invalid vocation');
   fail('no native initial vocation/conflict-of-interest restoration interface; switchVocation performs a new change and enforces tenure (05 §5.4/§5.7)');
  });
  if(field==='demonstrations')array(ctx,setup,field,['id','actor','subject','workstation','fromMinute','toMinute','teaching'],r=>{
   requireActor(ctx,r.actor);
   if(typeof r.id!=='string'||!ctx.engine.byId.has(r.subject)||!ctx.engine.byId.has(r.workstation)||!integer(r.fromMinute)||!integer(r.toMinute,r.fromMinute+1)||r.teaching!==false)fail('invalid demonstration premise');
   fail('no native timed demonstration initializer with workstation binding; observe reads practicing/activity but has no source/window lifecycle (05 §5.4/§5.7)');
  });
  if(field==='combats'||field==='conversations')array(ctx,setup,field,field==='combats'?['id','participants','active','playerActedThisRound']:['id','participants','active','mainTopicFinished'],r=>{
   if(typeof r.id!=='string'||!r.id||!Array.isArray(r.participants)||r.participants.length<2||new Set(r.participants.map(ctx.ref)).size!==r.participants.length||r.active!==true)fail('invalid active activity declaration');
   for(const participant of r.participants)requireActor(ctx,participant);
   if(field==='combats'&&r.playerActedThisRound!==false||field==='conversations'&&r.mainTopicFinished!==true)fail('invalid pending activity flags');
   fail(field==='combats'?'no native unfinished encounter/round initializer; combat resolves the encounter (05 §5.4; 06 §6.8)':'no native active conversation/topic-completion initializer; dialogue stores individual replies (05 §5.7; 06 §6.8)');
  });
  if(field==='rites')array(ctx,setup,field,['id','name','location','host','start','end','hostAuthorized','offerings','sourceEvent'],r=>{
   requireActor(ctx,r.host);sourceEvent(ctx,r.sourceEvent);
   if(typeof r.id!=='string'||!ctx.engine.world.locations.some(l=>l.id===r.location)||!integer(r.start)||!integer(r.end,r.start+1)||r.hostAuthorized!==true||!Array.isArray(r.offerings)||r.offerings.some(o=>!shape(o,['item','quantity'])||!ctx.engine.world.items.some(i=>i.id===o.item)||!integer(o.quantity,1)))fail('invalid rite premise');
   fail('no native initializer for an existing hosted rite with schedule, authority and unconsumed offerings; faith_rite executes and consumes, rite_project requires a registered action (13 §13.5; 06 §6.8)');
  });
 }
}});
