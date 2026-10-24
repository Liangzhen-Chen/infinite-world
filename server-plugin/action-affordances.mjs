// A1 可做之事（06 §6.9.1、08 §8.2【可做之事】，L3 投影）：由注册表与玩家此刻能感知的场景派生
// “此处可做”、对象菜单（人/物/地点）与快捷栏，并把槽位的可选项（出路、对方存货、行囊、配方、欠账）填好。
// 这里的前置只决定菜单里出不出现；做得成做不成仍由引擎结算，拒绝时引擎给世界内原因。
import {loadActionRegistry,findAction,catalogRow,searchActions,CONSENT_PENDING,learningSlotDescription} from './action-registry.mjs';
import {npcSchedule} from './npc-state.mjs';
import {exitsFrom,presentPeople,sceneLines,distanceText,loadTemplates} from './action-text.mjs';
import {derivedBankAt} from './finance-bank.mjs';
import {weatherTravel} from './weather.mjs';
import {currentShops} from './shop.mjs';
import {obligationRows,obligationView} from './obligation-state.mjs';
import {settlementPresent} from './obligation-presence.mjs';
import {primitiveActionRuntime} from './primitives.mjs';
import {actionSchema} from './primitive-schema.mjs';
import {environmentFeatures} from './environment.mjs';
import {visibleEntity} from './perception.mjs';
import {isPhysicallyDead} from './lifecycle-state.mjs';
import {deriveOpenSourceLimits,limitOpenEffects} from './action-limits.mjs';
import {routeAction} from './action-router.mjs';
import {createOpenActionContext} from './open-actions.mjs';
import {refusalProjection,isDomainRejection} from './action-rejection.mjs';
import {heldUnit,physicalItem,physicalLocation,useTool} from './items.mjs';
import {canAct,actionReader} from './action-capacity.mjs';
import {authority} from './action-authority.mjs';
import {standing,standingWords} from './standing.mjs';
import {mechanismRule,domainRules} from './domain-rules.mjs';
import {knowsPracticalKnowledge} from './education-state.mjs';
import {readBodyState} from './primitives-body.mjs';
import {markFallback} from './action-boundary.mjs';
import {personTeaching} from './entity-view.mjs';
import {layoutView} from './place-layout.mjs';
import {speciesInHabitat} from './wildlife-range.mjs';

const qty=value=>typeof value==='number'?value:value?.quantity??0;
const publicRow=row=>!row?.hidden&&!row?.private&&row?.visible!==false;
const mechanismAction=rule=>rule?.operation==='disarm'?'core:site.disarm':rule?.operation==='unlock'?'core:environment.unlock':null;
const knownMechanism=(ctx,facts)=>{const rule=mechanismRule(ctx.engine,facts.mechanism);return rule?.requiresIdentified&&facts.identified!==true?null:rule;};
// Only externally observable fields. Contents, toxin tests, mental state,
// ownership proofs and other people's relationships never become card state.
const STATE_FIELDS=['open','closed','locked','condition','durability','maxDurability','material','moisture','fireIntensity','integrity','turned','deployed','torn','blockagePercent','waterMl','capacityMl'];
function knownState(facts){return Object.fromEntries(STATE_FIELDS.filter(key=>facts[key]!==undefined).map(key=>[key,structuredClone(facts[key])]));}
export const QUICK=['交易','移动','等待','制作','账目','休息','观察'];
const CHOICES={walk:'步行',horse:'骑马',cart:'乘车',boat:'乘船',cash:'现付',credit:'赊账',repay:'还账',attack:'攻击',defend:'防守',flee:'脱离',shove:'推搡'};
const MARK_LABELS={'mark:insult':'侮辱','mark:satire':'讽刺','mark:defacement':'毁损标记','mark:graffiti':'涂鸦','mark:warning':'警告','mark:sacred_symbol':'神圣符号','mark:offering':'供奉','mark:memorial':'纪念','mark:petition':'请愿','mark:public_display':'公开展示','mark:art':'艺术','mark:custom':'自定含义','mark:invention':'发明设想','mark:boundary':'边界','mark:trap':'陷阱般的布置','mark:decoy':'诱饵般的布置','mark:shelter':'庇护记号','mark:omen':'征兆','mark:sword_carving':'剑刻',flammable:'易燃',wood:'木',paper:'纸',cloth:'布',fiber:'纤维',stone:'石',metal:'金属',wet:'湿润',frozen:'结冰'};

// A dynamic duty of world_actions/world_act, never a new static model tool.
// This only describes input; the native proposal pipeline owns validation.
function openProposalOffer(ctx){
 const select=rows=>({type:'string',enum:rows.map(r=>r.value),enumLabels:rows.map(r=>r.label)});
 const people=[{value:'player',label:'自己'},...ctx.people.map(p=>({value:p.id,label:p.name})),...ctx.creatures];
 const entities=[...new Map([...people,{value:ctx.s.location,label:ctx.name(ctx.s.location)},...featureOptions(ctx),...ctx.inventory.map(i=>({value:i.id,label:i.name})),...(ctx.inspected?[ctx.inspected]:[])].map(row=>[row.value,row])).values()];
 const items=ctx.inventory.map(i=>({value:i.id,label:i.name})),skills=ctx.skills.map(i=>({value:i.id,label:i.name}));
 const primitive=actionSchema.$defs.primitive;
 const fields={transfer:['resource','from','to','qty'],move:['to','mode'],emit:['verb','target','visibility','payload'],
  vital:['target','type','delta'],status:['target','status','duration','magnitude'],learn:['subject','learningSource','minutes'],
  time:['minutes'],create:['kind','template','facts','tags','materials'],destroy:['entity'],
  'fact.set':['entity','field','value','delta'],'holding.open':['holdingKind','holder','subject','terms'],
  'holding.close':['holding','reason'],'holding.transfer':['holding','newHolder','reason'],'holding.rescale':['holdingKind','subject','shares'],
  'obligation.create':['id','obligationKind','debtor','creditor','amount','deadline','terms'],
  'obligation.settle':['id','amount'],'obligation.cancel':['id','reason'],schedule:['at','action','args'],transition:['entity','kind','cause']};
 const allowed=ctx.document.state.records?.action_config?.openActions??'full';
 const variants=Object.entries(fields).filter(([op])=>allowed!=='limited'||['fact.set','vital','move','emit','learn','create'].includes(op)).map(([op,keys])=>{
  const properties={op:{const:op,type:'string'}};
  for(const key of keys){
   let schema=structuredClone(primitive.properties[key]??{type:'string'});
   if(['target','entity','holder','newHolder','debtor','creditor'].includes(key))schema=select(entities);
   if(['from','to'].includes(key))schema=select(op==='transfer'?[...people,{value:'sink:consume',label:'消耗材料'}]:[...entities,...ctx.exits.map(e=>({value:e.id,label:e.name}))]);
   if(key==='subject')schema=select(op==='learn'?skills:entities);
   if(key==='resource')schema=select([{value:'coin_river',label:'铜钱'},...items]);
   if(key==='value')schema={oneOf:[{type:'number',title:'数值'},{type:'string',title:'文字'},{type:'boolean',title:'是或否'}]};
   if(key==='learningSource')schema={type:'string',enum:['practice','teaching','book']};
   if(key==='mode')schema={type:'string',enum:['walk','horse','cart','boat']};
   if(key==='verb')schema={type:'string',enum:allowed==='limited'?['request','tell']:['request','tell','claim']};
   if(key==='payload')schema={type:'object',properties:{text:{type:'string'},content:{type:'string'},kind:{type:'string'},version:{type:'string'},source:{type:'string'},location:select(entities),terms:{type:'object'}}};
   if(key==='facts')schema={type:'object',required:['intent','form'],properties:{intent:{type:'string'},form:{type:'string',enum:ctx.engine.world.openActionRules?.mark?.forms??[]},zone:select(zoneOptions(ctx))}};
   if(key==='kind'&&op==='create')schema={type:'string',enum:['mark']};
   if(key==='tags')schema={type:'array',items:select([...ctx.engine.world.openTagging?.tags??[],...ctx.engine.world.openTagging?.traits??[]].map(value=>({value,label:MARK_LABELS[value]??value})))};
   if(key==='materials')schema={type:'array',maxItems:ctx.engine.world.openActionRules?.mark?.maximumMaterials??0,items:{type:'object',required:['item','qty'],properties:{item:select(items),qty:{type:'integer',minimum:1}}}};
   properties[key]=schema;
  }
  const required=primitive.allOf.find(row=>row.if?.properties?.op?.const===op)?.then?.required??[];
  return {title:op,type:'object',properties,required:['op',...required]};
 });
 return {id:'open:proposal',label:'组合自己的做法',hint:'可只填 intent，由引擎判定；实际能力、同意、代价和法律后果由引擎裁决。',readOnly:false,inputTool:'world_propose',fill:{},slots:[
  {name:'intent',kind:'text',required:true},
  {name:'target',kind:'entity',entity:'entity',builderStep:1,options:entities},
  {name:'consent',kind:'object',builderStep:1,inputSchema:{type:'object',properties:{from:select(entities),scope:{type:'string'},onRefusal:{type:'string',enum:['abort','contest']}}}},
  {name:'participants',kind:'object',builderStep:1,inputSchema:{type:'object',properties:{target:select(entities)}}},
  {name:'means',kind:'object',builderStep:2,inputSchema:{type:'object',properties:{item:select(items),tools:{type:'array',maxItems:1,items:select(items)},skill:select(skills),spell:select(Object.keys(ctx.s.spells??{}).map(id=>({value:id,label:ctx.name(id)}))),manner:{type:'string',enum:['careful','quick','forceful','stealthy','clever','sleep','rest','guard','attack','retreat','shove']}}}},
  // Public submission limits/fields come from the production proposal schema.
  // oneOf supplies local builder controls, not a second structural contract.
  {name:'effects',kind:'object',inputSchema:{...structuredClone(actionSchema.$defs.proposal.properties.effects),items:{...structuredClone(primitive),oneOf:variants}}},
  {name:'context',kind:'object',inputSchema:{type:'object',properties:{modifier:{type:'integer',minimum:-5,maximum:5},reason:{type:'string'}}}}
 ]};
}

// These are declared public areas, not invented coordinates or a second layout.
function zoneOptions(ctx){
 return (ctx.place?.zones??ctx.place?.areas??[]).filter(zone=>typeof zone==='string'||zone&&zone.hidden!==true&&zone.private!==true&&zone.visible!==false&&zone.accessible!==false)
  .map(zone=>typeof zone==='string'?{value:zone,label:zone}:{value:zone.id,label:zone.name??zone.label??zone.id}).filter(zone=>typeof zone.value==='string');
}
function featureOptions(ctx){
 return environmentFeatures(ctx.engine,ctx.document).filter(row=>row.location===ctx.s.location&&!row.hidden&&!row.private&&row.visible!==false&&visibleEntity(ctx.engine,ctx.document,row.id))
  .map(row=>({value:row.id,label:row.name}));
}

function context(engine,document){
 const s=document.state,place=engine.byId.get(s.location),templates=loadTemplates();
 const name=id=>s.npcs?.[id]?.name??s.created?.[id]?.name??document.holdings?.entities?.[id]?.facts?.name??engine.byId.get(id)?.name??id;
 const d=actionReader(document),perceptible=id=>publicRow(engine.byId.get(id))&&publicRow(s.created?.[id])&&publicRow(s.npcs?.[id])&&publicRow(s.creatures?.[id])&&publicRow(physicalItem(d,engine,id));
 const people=presentPeople(engine,s,document).filter(p=>perceptible(p.id)),present=new Set(people.map(p=>p.id));
 const stations=new Set((place?.workstations??[]).map(w=>w.kind));
 const recipes=(engine.world.recipes??[]).filter(r=>(!r.learningRequired||s.recipes?.[r.id])&&(!r.workstation||stations.has(r.workstation)));
 let bank=null;try{bank=derivedBankAt(engine,s,s.location);}catch{bank=null;}
 const debts=obligationRows(s).filter(r=>r.debtor==='player'&&(!r.resource||['coin_river','core:coin_river'].includes(r.resource))&&obligationView(s,r).owed>0)
  .map(r=>{const seller=r.bank&&r.bank===bank?.id?bank.keepers.find(id=>present.has(id)):r.creditor;
   return{id:r.legacyRecord??r.id,creditor:r.creditor,seller,reachable:Boolean(seller&&present.has(seller)&&settlementPresent(engine,s,'player',r.creditor)),remaining:obligationView(s,r).owed};});
 const lodging=place?.lodging?.host&&(place.lodging.rooms??0)>0?place.lodging:null;
 // 路况：本季封路、天气封路或当下天气（与地图同一算法），步行计。
 const season=engine.calendar(s.minute).season;
 const exits=exitsFrom(engine,s,templates).filter(e=>publicRow(engine.byId.get(e.id))&&publicRow(engine.world.routes.find(r=>r.id===e.route))).map(e=>{const edge=engine.world.routes.find(r=>r.id===e.route);if(!edge?.lengthKm)return e;
  let w={};try{w=weatherTravel(engine,document.randomSeed,edge,'walk',s.minute)??{};}catch{w={};}
  return {...e,condition:edge.closedSeasons?.includes(season)?'本季封路':w.closed?'天气封路':w.weather??null};});
 const layout=layoutView(engine,document);
 exits.push(...layout.zones.filter(z=>!z.current).map(z=>({...z,relation:'zone',modes:['walk'],condition:z.reachable?null:'没有可通行的邻接路径'})));
 return {engine,s,place,name,people,present,recipes,debts,bank,lodging,exits,templates,layout,
  inventory:Object.entries(s.inventory??{}).filter(([id,v])=>qty(v)>0&&perceptible(id)).map(([id,v])=>({id,name:name(id),quantity:qty(v)})),
  skills:Object.keys(s.skills??{}).map(id=>({id,name:name(id)})),
  creatures:Object.entries(s.creatures??{}).filter(([id,row])=>perceptible(id)&&row.location===s.location&&!row.scheduleTravel&&!row.cognitionTravel&&!isPhysicallyDead(null,s,id)&&visibleEntity(engine,document,id)).map(([id,row])=>({value:id,label:row.name??name(id)}))};
}
function stockOf(ctx,npc){return Object.entries(ctx.s.npcs?.[npc]?.inventory??{}).filter(([id,v])=>qty(v)>0&&publicRow(v)&&publicRow(ctx.engine.byId.get(id))).map(([id,v])=>({id,name:ctx.name(id),quantity:qty(v)}));}
// Named projection checks used by registry preconditions.
function holds(ctx,condition,target){
 switch(condition){
  case 'present(target)':return Boolean(target&&ctx.present.has(target));
  case 'sells(target)':return Boolean(target&&stockOf(ctx,target).length);
  case 'hasItems':return ctx.inventory.length>0;
  case 'lodging(here)':return Boolean(ctx.lodging);
  case 'bank(here)':return Boolean(ctx.bank);
  case 'knowsRecipe':return ctx.recipes.length>0;
  case 'hasDebt':return ctx.debts.some(r=>r.reachable);
  case 'playerObligation':return obligationRows(ctx.s).some(r=>[r.debtor,r.creditor,r.promisor,r.promisee].includes('player'));
  case 'pendingMedicalVisit':return Object.values(ctx.s.records??{}).some(r=>r.patient==='player'&&(r.status==='排队'||r.status==='预约'&&r.start>ctx.s.minute));
  case 'investmentCounterparty':return ctx.people.length>0;
  case 'hasSkill':return ctx.skills.length>0;
  case 'outdoors(here)':return !String(ctx.s.location).startsWith('bld_');
  case 'exit(destination)':return ctx.exits.length>0;
  default:return true;// unknown names never hide an action; the engine decides
 }
}
function options(ctx,source,target){
 switch(source){
  case 'exits':return ctx.exits.map(e=>({value:e.id,label:`${e.name}（${e.direction}${e.relation==='route'?distanceText(e.km,ctx.templates):''}${e.condition?`，${e.condition}`:''}）`}));
  case 'target.stock':return target?stockOf(ctx,target).map(r=>({value:r.id,label:`${r.name}（存${r.quantity}）`})):[];
  case 'inventory':return ctx.inventory.map(r=>({value:r.id,label:`${r.name}×${r.quantity}`}));
  case 'water_sources':return environmentFeatures(ctx.engine,ctx.document).filter(r=>r.location===ctx.s.location&&!r.hidden&&!r.private&&['water','container'].includes(r.kind)&&visibleEntity(ctx.engine,ctx.document,r.id)&&((ctx.s.records?.[`physical_feature:${r.id}`]?.state??r.state)?.waterMl??0)>0).map(r=>({value:r.id,label:r.name}));
  case 'liquid_containers':return ctx.inventory.flatMap(r=>{
   const d=actionReader(ctx.document),held=ctx.s.inventory[r.id],ids=(held.instances??[]).filter(id=>ctx.s.itemInstances?.[id]?.owner==='player'&&ctx.s.itemInstances[id].status==='持有');
   const rows=ids.map(id=>({value:id,label:ids.length>1?`${r.name}（${id}）`:r.name}));
   if(r.quantity>ids.length)rows.push({value:r.id,label:r.name});
   return rows.filter(row=>physicalItem(d,ctx.engine,row.value).tags?.includes('liquid_container'));
  });
  case 'recipes':return ctx.recipes.map(r=>({value:r.id,label:r.name}));
  case 'skills':return ctx.skills.map(r=>({value:r.id,label:r.name}));
  case 'debts':return ctx.debts.filter(r=>r.reachable).map(r=>({value:r.id,label:`欠${ctx.name(r.creditor)} ${r.remaining}文`,fill:{seller:r.seller}}));
  default:return null;
 }
}
// A catalog row for the interface: slot choices resolved here, the target slot pre-filled.
// An action that needs the other party's agreement is shown but not executable until A2's NPC decision,
// unless the legacy path decides by itself: a host on trade duty rents rooms, a bank desk lends against a pledge.
function consentPending(ctx,action,fill){
 if(!action.consent)return false;
 if(action.consent.from==='self')return false;// the player is the one acted on: their own consent, nobody else's
 if(action.consent.from==='party')return fill[action.consent.slot]!==undefined&&fill[action.consent.slot]!=='player';
 if(action.id==='core:trade.lodge'&&fill.seller){let schedule=null;try{schedule=npcSchedule(ctx.engine,ctx.s,fill.seller);}catch{schedule=null;}return Boolean(schedule)&&!JSON.stringify(schedule).includes('"trade"');}
 if(action.id==='core:trade.borrow'&&ctx.bank&&fill.seller===ctx.bank.keepers?.[0])return false;
 return true;
}
function actionPermission(ctx,action,slots){
 const runtime=primitiveActionRuntime();
 if(typeof runtime?.actionPermission!=='function'||action.readOnly||action.projection)return null;
 if(action.slots.some(slot=>slot.required&&!slot.consent&&slots[slot.name]===undefined))return null;
 // A3-A7 owns normalization, capacity, custody and legacy restrictions.
 // Missing connectors are visible query failures, never invented denials.
 // /actions already supplies a scoped engine. Use A7's native implementation
 // directly, since the WorldEngine wrapper scopes a root engine once more.
 try{return runtime.actionPermission(ctx.engine,ctx.document,{action:action.id,slots});}
 catch(error){return {allowed:null,error:error.message};}
}
function offer(ctx,action,target){
 const fill={};
 const slots=action.slots.map(slot=>{
  const row={name:slot.name,kind:slot.kind,...(slot.entity?{entity:slot.entity}:{}),...(slot.required?{required:true}:{}),...(slot.consent?{consent:true}:{}),...(slot.default!==undefined?{default:slot.default}:{}),...(slot.presets?{presets:slot.presets}:{}),...(Number.isFinite(slot.min)?{min:slot.min}:{}),...(Number.isFinite(slot.max)?{max:slot.max}:{})};
  if(action.call?.tool==='world_propose'&&actionSchema.$defs.proposal.properties[slot.name]){
   row.inputSchema=structuredClone(actionSchema.$defs.proposal.properties[slot.name]);
   if(slot.name==='effects')row.inputSchema.items=structuredClone(actionSchema.$defs.primitive);
  }
  if(slot.fill==='target'&&target)fill[slot.name]=target;
  if(target&&slot.name==='target'&&(action.id.startsWith('core:environment.')||action.id==='core:site.disarm'))fill.target=target;
  if(target&&slot.name==='location'&&action.id.startsWith('core:farm.private_'))fill.location=target;
  // The registered host is public service information, not a claim that the
  // player can currently see them. Trying to book still checks real presence
  // and the host's service window in the native executor.
  if(slot.fill==='host'&&ctx.lodging&&[ctx.engine.byId.get(ctx.lodging.host),ctx.s.npcs?.[ctx.lodging.host],ctx.s.created?.[ctx.lodging.host]].every(publicRow))fill[slot.name]=ctx.lodging.host;
  if(slot.fill==='banker'&&ctx.bank?.keepers?.some(id=>ctx.present.has(id)))fill[slot.name]=ctx.bank.keepers.find(id=>ctx.present.has(id));
  let choices=typeof slot.options==='string'?options(ctx,slot.options,target):Array.isArray(slot.options)?slot.options.map(v=>({value:v,label:slot.optionLabels?.[v]??CHOICES[v]??v})):null;
  if(slot.name==='species'&&action.id.startsWith('core:wildlife.')){
   const habitat=ctx.engine.rules.wildlife?.habitats?.find(row=>row.location===ctx.s.location);
   choices=habitat?speciesInHabitat(ctx.engine.rules,ctx.engine.world.monsters,habitat.id).filter(publicRow).map(row=>({value:row.id,label:row.name})):[];
  }
  if(action.call?.tool==='world_learn'){
   row.description=learningSlotDescription(slot.name);
   if(slot.name==='entity')choices=[...ctx.engine.world.skills??[],...ctx.engine.world.spells??[],...ctx.engine.world.recipes??[]].filter(subject=>publicRow(subject)&&ctx.people.some(person=>(!target||person.id===target)&&personTeaching(ctx.engine,ctx.s,person.id,subject.id))||publicRow(subject)&&ctx.inventory.some(item=>ctx.engine.byId.get(item.id)?.book?.teaches?.includes(subject.id))).map(subject=>({value:subject.id,label:subject.name}));
   if(slot.name==='source')choices=[...ctx.people.map(person=>({value:person.id,label:person.name})),...ctx.inventory.filter(item=>ctx.engine.byId.get(item.id)?.book).map(item=>({value:item.id,label:item.name})),...Object.entries(ctx.s.projects??{}).filter(([,project])=>project.type==='研究'&&project.stage==='打磨').map(([value,project])=>({value,label:project.name??value}))];
   if(slot.name==='student')choices=[{value:'player',label:'自己'},...ctx.people.map(person=>({value:person.id,label:person.name}))];
  }
  if(choices===null&&(slot.kind==='zone'||slot.name==='zone'))choices=zoneOptions(ctx);
  if(slot.kind==='zone'||slot.name==='zone')row.description='省略表示当前位置；若填，只用options中的分区编号';
  if(action.id==='open:leave_mark'){
   if(slot.name==='tags'){
    const tagging=ctx.engine.world.openTagging;
    choices=[...new Set([...(tagging?.tags??[]),...(tagging?.traits??[])])].map(value=>({value,label:MARK_LABELS[value]??value}));row.multiple=true;
   }
   if(slot.name==='materials'){
    // Exact input contract of B's executeLeaveMark, using this archived world's
    // material limit and the player's current inventory. No JSON text entry.
    const maximum=ctx.engine.world.openActionRules?.mark?.maximumMaterials;
    if(Number.isSafeInteger(maximum)&&maximum>=0)row.inputSchema={type:'array',maxItems:maximum,items:{type:'object',required:['item','qty'],properties:{
     item:{type:'string',enum:ctx.inventory.map(item=>item.id),enumLabels:ctx.inventory.map(item=>item.name)},qty:{type:'integer',minimum:1}
    }}};
   }
  }
  // Entity selectors are a projection of what the player can reach, never an
  // invitation to type a hidden catalogue id. Explicit stock/recipe lists win.
  if(choices===null&&slot.kind==='entity'){
   if(['person','npc','agent'].includes(slot.entity))choices=ctx.people.map(p=>({value:p.id,label:p.name}));
   else if(slot.entity==='item')choices=ctx.inventory.map(i=>({value:i.id,label:`${i.name}×${i.quantity}`}));
   else if(['place','location'].includes(slot.entity))choices=ctx.exits.map(e=>({value:e.id,label:`${e.direction} ${e.name}`}));
   else if(slot.entity==='skill')choices=ctx.skills.map(s=>({value:s.id,label:s.name}));
   else if(slot.entity==='spell')choices=Object.keys(ctx.s.spells??{}).map(id=>({value:id,label:ctx.name(id)}));
   else if(slot.entity==='recipe')choices=ctx.recipes.map(recipe=>({value:recipe.id,label:recipe.name}));
  }
  // S0's shared world_field schema calls these targets "person"/"place";
  // the actual environment handlers take local feature ids for these fields.
  if((action.id.startsWith('core:environment.')||action.id==='core:site.disarm')&&['target','destination'].includes(slot.name)){
   const local=featureOptions(ctx);
   if(slot.name==='target'&&ctx.inspected)local.push(ctx.inspected);
   if(slot.name==='target'&&['core:environment.inspect','core:environment.inspect_marks','core:environment.inspect_heat','core:environment.warm_touch','core:environment.douse_fire'].includes(action.id))local.push(...ctx.inventory.map(item=>({value:item.id,label:item.name})));
   choices=[...new Map([...(choices??[]),...local].map(option=>[option.value,option])).values()];
  }
  if(action.id==='core:cast'&&slot.name==='target')choices=[{value:'player',label:'自己'},...ctx.people.map(person=>({value:person.id,label:person.name})),...ctx.creatures,...featureOptions(ctx),...ctx.inventory.map(item=>({value:item.id,label:item.name}))];
  if(action.id==='core:combat'&&slot.name==='target')choices=[...(choices??[]),...ctx.creatures];
  // Existing array inputs use only currently reachable people and owned units.
  if(slot.kind==='object'){
   if(['helpers','workers','guests','beneficiaries'].includes(slot.name))choices=ctx.people.map(p=>({value:p.id,label:p.name}));
   else if(slot.name==='skills')choices=ctx.skills.map(s=>({value:s.id,label:s.name}));
   else if(slot.name==='tools')choices=ctx.inventory.map(i=>({value:i.id,label:i.name}));
   else if(slot.name==='instances')choices=ctx.inventory.flatMap(i=>(ctx.s.inventory[i.id]?.instances??[]).filter(id=>ctx.s.itemInstances?.[id]?.owner==='player'&&ctx.s.itemInstances[id].status==='持有').map(id=>({value:id,label:`${i.name}（${id}）`})));
   if(choices!==null)row.multiple=true;
  }
  if(choices)row.options=choices;
  return row;
 });
 const selected={...fill};
 for(const slot of action.slots)if(selected[slot.name]===undefined&&slot.default!==undefined&&slot.default!=='dawn')selected[slot.name]=slot.default;
 const permission=actionPermission(ctx,action,selected);
 // Only options of slots the permission actually reads are checked one by one;
 // an independent slot's options share one check (same result for any value).
 const runtime=primitiveActionRuntime(),dependent=typeof runtime?.actionPermissionSlots==='function'?runtime.actionPermissionSlots(ctx.engine,action):null;
 for(const slot of slots)if(slot.options&&!slot.multiple){
  let shared;
  for(const option of slot.options){
   const independent=dependent&&![slot.name,...Object.keys(option.fill??{})].some(name=>dependent.has(name));
   const check=independent?(shared===undefined?(shared=actionPermission(ctx,action,{...selected,[slot.name]:option.value})):shared):actionPermission(ctx,action,{...selected,[slot.name]:option.value,...option.fill});
   if(check)option.permission=check;
  }
 }
 return {...catalogRow(action),slots,fill,...(action.call?.tool&&slots.some(slot=>slot.kind==='object'&&!slot.multiple)?{inputTool:action.call.tool}:{}),...(permission?{permission}:{}),...(action.ui?.quick?{quick:action.ui.quick}:{}),
  ...(permission?.allowed===false?{blocked:permission.reason}:consentPending(ctx,action,fill)?{blocked:CONSENT_PENDING}:{})};
}
// A keeper's sold-out restock goods and the day the next delivery comes (shop cycle data; L4 何时到货).
function restockNotes(engine,ctx,keeper){
 let shop=null;try{shop=currentShops(engine,ctx.s).find(row=>row.keeper===keeper)??null;}catch{shop=null;}
 if(!shop)return [];
 const today=Math.floor(ctx.s.minute/1440),stock=ctx.s.npcs?.[keeper]?.inventory??{};
 let next=today+1;while((next-shop.firstDay)%shop.cycleDays!==0||next<shop.firstDay)next++;
 return shop.restock.filter(r=>qty(stock[r.item])===0).map(r=>({item:r.item,name:ctx.name(r.item),nextMinute:next*1440,next:engine.calendar(next*1440).text.replace(/ \d\d:\d\d$/,'')}));
}
function targetView(ctx,id){
 const d={...actionReader(ctx.document),document:ctx.document},facts={...physicalItem(d,ctx.engine,id),...ctx.document.holdings?.entities?.[id]?.facts};
 if(!publicRow(facts)||!publicRow(ctx.s.created?.[id])||!publicRow(ctx.s.npcs?.[id])||!publicRow(ctx.s.creatures?.[id]))return null;
 if(id==='player')return {kind:'self',facts:ctx.s.player};
 if(ctx.present.has(id))return {kind:'npc',facts:ctx.s.npcs[id]};
 if(ctx.inventory.some(r=>r.id===id))return {kind:'item',facts:{...facts,...heldUnit(d,ctx.engine,'player',id)}};
 if(id===ctx.s.location||ctx.exits.some(e=>e.id===id))return {kind:'place',facts:{...facts,...ctx.s.buildings?.[id]}};
 const feature=environmentFeatures(ctx.engine,ctx.document).find(row=>row.id===id);
 if(feature&&featureOptions(ctx).some(row=>row.value===id))return {kind:'feature',facts:{...feature,...feature.state,...ctx.s.records?.[`physical_feature:${id}`]?.state}};
 const entity=ctx.document.holdings?.entities?.[id],unit=ctx.s.itemInstances?.[id];
 if(entity?.goneAt!==undefined)return null;
 if(!entity&&!unit&&!ctx.s.creatures?.[id])return null;
 const placement=ctx.document.holdings?.locations?.[id];
 if(placement?.mode==='carried'&&placement.at==='player')return {kind:entity?.kind??'item',facts};
 // The existing physical inspector exposes local objects without inventing
 // contact coordinates. Interaction still needs the native reach proof.
 if(ctx.s.records?.[`physical_item:${id}`]&&physicalLocation(d,ctx.engine,id)===ctx.s.location)return {kind:entity?.kind??'item',facts};
 const contact=ctx.engine.primitiveTargetFacts(d,'player',id);
 if(physicalLocation(d,ctx.engine,id)!==ctx.s.location||contact?.lineOfSight!==true)return null;
 return {kind:ctx.s.creatures?.[id]?'creature':entity?.kind??'item',facts};
}
function entityCard(ctx,id,view,actions,openActions,fallback){
 const {engine,document,s}=ctx,d={...actionReader(document),document},state=knownState(view.facts);
 const projectRefusal=details=>refusalProjection({...details,reason:details.reason??details.message,fallback});
 if(view.kind==='npc'){
  state.present=true;
  state.awake=!/睡|昏|濒死|死亡/.test(`${view.facts.activity??''} ${view.facts.status??''}`);
  state.stance=standingWords(standing(engine,s,id,'player'));
 }
 const primitives=[],blocked=[];
 const add=(effect,means={})=>{
  const proposal={intent:'查看当前手段',means,effects:[effect]},source=deriveOpenSourceLimits(engine,document,proposal,effect);
  if(!source)return;
  if(means.item&&source.id!==means.item||means.skill&&source.id!==means.skill)return;
  let bounds=source.bounds;
  // Reward ceilings also depend on repetition, daily usage and a registered
  // neighbour. Reuse the submission path rather than advertise the raw cap.
  if(source.rewardFields?.length){
   const maximum={...effect};
   for(const [field,cap] of Object.entries(bounds))maximum[field]=Math.sign(effect[field]??1)*cap;
   const probe={...proposal,effects:[maximum]},native=createOpenActionContext(engine,document,probe),routing=routeAction(probe,primitiveActionRuntime().registry(engine),native.routing);
   const limited=limitOpenEffects(probe,native.limits(document,routing.nearest,routing.candidates));
   bounds=Object.fromEntries(Object.keys(bounds).map(field=>[field,Math.abs(limited.effects[0]?.[field]??0)]));
  }
  const ability={effect,means,source,bounds,scope:'single_effect',requirements:{...source.requirements,...(source.rangeMeters!==undefined?{rangeMeters:source.rangeMeters}:{})},...(means.item?{tool:means.item}:{})};
  const permission=canAct({engine,document},'player',effect.op==='emit'?'talk':effect.op);
  let refusal=!permission.allowed?projectRefusal({code:'E-CAPACITY',reason:permission.reason}):null;
  if(!refusal&&['fact.set','move'].includes(effect.op)&&!authority({engine,document},'player',effect.op,id,{effect}).allowed)refusal=projectRefusal({code:'E-AUTHORITY',reason:'尚无对该对象的操作权限'});
  const contact=id==='player'||document.holdings?.locations?.[id]?.at==='player'?{lineOfSight:true,distanceMeters:0}:engine.primitiveTargetFacts(d,'player',id);
  if(!refusal&&source.rangeMeters!==undefined&&(!contact?.lineOfSight||contact.distanceMeters>source.rangeMeters))refusal=projectRefusal({code:'E-REACH',reason:'当前视线或距离不足，需先靠近'});
  if(!refusal&&(source.requirements?.mp??0)>(s.player.mp??0))refusal=projectRefusal({reason:'当前灵力不足',missing:['足够的灵力']});
  if(!refusal&&(source.requirements?.stamina??0)>readBodyState(engine,document,'player','stamina').value)refusal=projectRefusal({reason:'当前体力不足',missing:['足够的体力']});
  if(!refusal&&source.requirements?.materials?.some(row=>engine.quantity(d,'player',row.item)<row.amount))refusal=projectRefusal({code:'E-MATERIAL',reason:'当前缺少来源所需的实际材料',missing:['足量的施法材料']});
  if(!refusal&&Object.values(bounds??{}).some(value=>value===0))refusal=projectRefusal({reason:'当前来源可用上限为零'});
  if(openActions==='off'||openActions==='limited'&&effect.op==='status')refusal=projectRefusal({reason:'当前行动配置需通过注册动作办理此效果'});
  if(refusal)ability.blocked=refusal;
  primitives.push(ability);
 };
 const items=ctx.inventory.filter(row=>{const held=heldUnit(d,engine,'player',row.id),base=engine.byId.get(row.id);return (held?.tags??base?.tags??[]).some(tag=>['tool','weapon'].includes(tag));}).map(row=>({item:row.id}));
 const sources=[{},...items];
 if(['self','npc','creature'].includes(view.kind))for(const means of [...sources,...ctx.skills.map(row=>({skill:row.id}))])add({op:'vital',target:id,type:'physical',delta:-1},means);
 if(['self','npc'].includes(view.kind))for(const verb of ['tell','request'])add({op:'emit',verb,target:id,visibility:'private',payload:{text:'说明自己的意思'}});
 const entity=document.holdings?.entities?.[id];
 if(entity?.kind==='item'&&document.holdings?.locations?.[id]?.mode==='carried'&&document.holdings.locations[id].at==='player')add({op:'move',entity:id,to:s.location,mode:'place'});
 for(const [field,value] of Object.entries(state))if(Number.isSafeInteger(value)&&engine.world.primitiveFacts?.[entity?.kind]?.[field]?.type==='number')for(const means of sources)add({op:'fact.set',entity:id,field,delta:-1},means);
 for(const spellId of Object.keys(s.spells??{})){
  const spell=engine.byId.get(spellId),spec=spell?.effectSpec,means={spell:spellId};
  if(!['self','npc','creature'].includes(view.kind))continue;
  if(['damage','heal'].includes(spec?.kind))add({op:'vital',target:id,type:spec.kind==='heal'?'healing':spec.damageType??'physical',delta:spec.kind==='heal'?1:-1},means);
  if(spec?.kind==='status')add({op:'status',target:id,status:spec.status,duration:1,magnitude:1},means);
 }
 // De-duplicate body fallbacks from irrelevant/broken items or skills.
 const unique=[...new Map(primitives.map(row=>[JSON.stringify([row.effect,row.source.id]),row])).values()];
 const relatedActions=actions.filter(row=>row.id!=='open:proposal').map(row=>{
  const out={id:row.id,label:row.label,slots:row.slots,fill:row.fill};
  if(row.permission?.allowed===false||row.blocked)out.blocked=projectRefusal({reason:row.permission?.reason??row.blocked});
  const mechanism=knownMechanism(ctx,view.facts);
  const use=mechanism&&row.id===mechanismAction(mechanism)?mechanism.requiresUse:row.id==='core:farm.private_sow'?domainRules(engine).privateField?.sowRequiresUse:row.id==='core:farm.private_harvest'?domainRules(engine).privateField?.harvestRequiresUse:null;
  if(use)try{out.tool=useTool(d,engine,use);out.fill={...out.fill,tool:out.tool};}catch(error){if(!isDomainRejection(error))throw error;out.blocked=projectRefusal(error);}
  if(mechanism&&row.id===mechanismAction(mechanism)){
   if(view.facts[mechanism.state]!==true||mechanism.requiresIdentified&&view.facts.identified!==true)out.blocked=projectRefusal({reason:'机关已经解除，或尚未辨认其操作结构'});
   if(mechanism.practicalKnowledge&&!knowsPracticalKnowledge(engine,s,'player',mechanism.practicalKnowledge))out.blocked=projectRefusal({reason:'尚未学会此机关的拆解工序',missing:['实际学会的机关拆解知识']});
   if(!authority({engine,document},'player','fact.set',id).allowed&&!authority({engine,document},'player',mechanism.operation,id).allowed)out.blocked=projectRefusal({code:'E-AUTHORITY',reason:'尚无对该对象的操作权限'});
   const held=document.holdings?.locations?.[id],contact=held?.mode==='carried'&&held.at==='player'?{lineOfSight:true,distanceMeters:0}:engine.primitiveTargetFacts(d,'player',id);
   if(!contact?.lineOfSight||!Number.isFinite(contact.distanceMeters)||contact.distanceMeters>1.5)out.blocked=projectRefusal({code:'E-REACH',reason:'尚不能看清并触及物品'});
  }
  return out;
 });
 if(!unique.length)blocked.push(projectRefusal({reason:'当前没有可直接施加的开放原语来源',missing:['可作用于此对象的实际手段'],repair:['先查看相关注册动作，或取得相应工具、技能后重新查询']}));
 return {state,primitives:unique,relatedActions,blocked};
}
// world_actions / /actions：此处可做（无 target）、对某对象可做（target）、按关键词检索（query）。
export function worldActions(engine,document,{target=null,query=null,limit=24,registry=null,candidatePreview=false}={}){
 registry??=primitiveActionRuntime()?.registry?.(engine)??loadActionRegistry();
 const ctx={...context(engine,document),document};
 let id=null;
 if(target){try{id=engine.resolve(String(target));}catch{id=String(target);}}
 let view=id?targetView(ctx,id):null;
 if(!view&&target){
  const candidates=[...ctx.people.map(row=>({value:row.id,label:row.name})),...ctx.inventory.map(row=>({value:row.id,label:row.name})),...featureOptions(ctx),...Object.values(document.holdings?.entities??{}).map(row=>({value:row.id,label:row.facts?.name}))].filter(row=>row.label===target&&targetView(ctx,row.value));
  if(candidates.length===1){id=candidates[0].value;view=targetView(ctx,id);}
 }
 const kind=view?.kind;
 // A globally resolvable name is not evidence of current access. In particular
 // search must not use a remote person's private stock to populate selectors.
 if(!kind)id=null;
 if(id)ctx.inspected={value:id,label:view.facts.name??ctx.name(id)};
 const visible=a=>(a.preconditions??[]).every(c=>holds(ctx,c,id));
 let actions;
 if(query)actions=searchActions(registry,query,{limit,include:['quick','here','target:npc','target:place','target:item','search','llm']}).map(a=>offer(ctx,a,id));
 else if(id)actions=registry.actions.filter(a=>{
  const mechanism=knownMechanism(ctx,view.facts);
  if(a.id==='core:environment.unlock'&&a.id!==mechanismAction(mechanism))return false;
  return (a.visibility.catalog===`target:${kind}`||['feature','item','building'].includes(kind)&&(a.id.startsWith('core:environment.')||a.id===mechanismAction(mechanism))||kind==='place'&&a.id.startsWith('core:farm.private_'))&&visible(a);
 }).map(a=>offer(ctx,a,id));
 else actions=registry.actions.filter(a=>(a.visibility.catalog==='here'||a.visibility.catalog==='quick'||a.ui?.quick)&&visible(a)).map(a=>offer(ctx,a,null));
 // The constructor only needs offered slots and visible names. Avoid building
 // the entity primitive inspector, open-proposal schema and scene prose for
 // every candidate lookup. Execution permissions still come from offer().
 if(candidatePreview)return {actions:actions.slice(0,limit),objects:{people:ctx.people.map(p=>({id:p.id,name:p.name,sells:stockOf(ctx,p.id).length>0})),items:ctx.inventory}};
 const openActions=document.state.records?.action_config?.openActions??'full';
 if(query==='open:proposal'||query==='world_propose')actions=actions.filter(a=>a.id==='open:proposal');
 // Candidate discovery grants no execution permission, even for registered
 // actions whose implementation uses the open primitive gateway.
 if(openActions==='off'&&!candidatePreview)actions=actions.filter(a=>a.inputTool!=='world_propose');
 // Keep the creative path beside search results, including empty/blocked targets.
 // Exact open-action lookups retain their single-action contract for the builder.
 const exactOpen=['open:proposal','world_propose','open:leave_mark'].includes(query);
 const mark=registry.actions.find(a=>a.id==='open:leave_mark');
 const fallback=mark?markFallback(engine,document,'留下自己的心意'):null;
 // Registered actions come first; the open paths follow them and are never cut by the limit.
 const openRows=[];
 if(openActions!=='off'&&(mark||registry.actions.some(a=>a.call?.tool==='world_propose'))&&(!exactOpen||query!=='open:leave_mark')){
  actions=actions.filter(action=>action.id!=='open:proposal');
  openRows.push(openProposalOffer(ctx));
 }
 if(mark&&(!exactOpen||query==='open:leave_mark')){
  actions=actions.filter(action=>action.id!=='open:leave_mark');
  const row={...offer(ctx,mark,id),available:fallback.available,missing:fallback.missing};
  if(!fallback.available)row.blocked=fallback.reason??fallback.missing.join('、');
  openRows.push(row);
 }
 const quick=QUICK.map(label=>{const a=registry.actions.find(x=>x.ui?.quick===label);return a?{label,action:a.id,available:visible(a)||a.ui.quick==='交易'}:null;}).filter(Boolean);
 const sceneEngine=Object.create(engine);
 sceneEngine.world={...engine.world,locations:engine.world.locations.filter(publicRow),routes:engine.world.routes.filter(row=>publicRow(row)&&[row.from,row.to].every(key=>publicRow(engine.byId.get(key))))};
 return {location:{id:ctx.s.location,name:ctx.name(ctx.s.location),zone:ctx.layout.current},...(id?{target:{id,kind,name:view.facts.name??ctx.name(id),...entityCard(ctx,id,view,actions,openActions,fallback),...(kind==='npc'?{soldOut:restockNotes(engine,ctx,id)}:{})}}:{}),
  scene:sceneLines(sceneEngine,{...document,state:{...ctx.s,npcs:Object.fromEntries(Object.entries(ctx.s.npcs??{}).filter(([key])=>ctx.present.has(key)))}}),actions:[...actions.slice(0,limit),...openRows],quick,configuration:{openActions,writable:false},texts:{refused:ctx.templates.effects.refused},
  objects:{people:ctx.people.map(p=>({id:p.id,name:p.name,activity:p.activity,sells:stockOf(ctx,p.id).length>0})),
   zones:ctx.layout.zones,
   exits:ctx.exits.map(e=>{const move=registry.byId?.get('core:move'),permission=e.relation==='zone'&&!e.reachable?{allowed:false,reason:e.condition}:move?actionPermission(ctx,move,{destination:e.id,mode:'walk'}):null;return {id:e.id,name:e.name,direction:e.direction,distance:e.relation==='route'?distanceText(e.km,ctx.templates):e.relation==='zone'&&e.metres!==null?`${e.metres}米`:'',modes:e.modes,...(e.relation==='zone'?{zone:true}:{}),...(e.condition?{condition:e.condition}:{}),...(permission?{permission}:{})};}),
   items:ctx.inventory}};
}
export {findAction};
