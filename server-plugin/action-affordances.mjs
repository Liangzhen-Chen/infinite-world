// A1 可做之事（06 §6.9.1、08 §8.2【可做之事】，L3 投影）：由注册表与玩家此刻能感知的场景派生
// “此处可做”、对象菜单（人/物/地点）与快捷栏，并把槽位的可选项（出路、对方存货、行囊、配方、欠账）填好。
// 这里的前置只决定菜单里出不出现；做得成做不成仍由引擎结算，拒绝时引擎给世界内原因。
import {loadActionRegistry,findAction,catalogRow,searchActions,CONSENT_PENDING} from './action-registry.mjs';
import {npcSchedule} from './npc-state.mjs';
import {exitsFrom,presentPeople,sceneLines,distanceText,loadTemplates} from './action-text.mjs';
import {derivedBankAt} from './finance-bank.mjs';
import {weatherTravel} from './weather.mjs';
import {currentShops} from './shop.mjs';
import {obligationRows,obligationView} from './obligation-state.mjs';
import {settlementPresent} from './obligation-presence.mjs';
import {primitiveActionRuntime} from './primitives.mjs';
import {actionSchema} from './primitive-schema.mjs';
import {environmentFeatures,localPlayerPoint,localSightClear} from './environment.mjs';
import {isPhysicallyDead} from './lifecycle-state.mjs';

const qty=value=>typeof value==='number'?value:value?.quantity??0;
export const QUICK=['交易','移动','等待','制作','账目','休息','观察'];
const CHOICES={walk:'步行',horse:'骑马',cart:'乘车',boat:'乘船',cash:'现付',credit:'赊账',repay:'还账',attack:'攻击',defend:'防守',flee:'脱离',shove:'推搡'};
const MARK_LABELS={'mark:insult':'侮辱','mark:satire':'讽刺','mark:defacement':'毁损标记','mark:graffiti':'涂鸦','mark:warning':'警告','mark:sacred_symbol':'神圣符号','mark:offering':'供奉','mark:memorial':'纪念','mark:petition':'请愿','mark:public_display':'公开展示','mark:art':'艺术','mark:custom':'自定含义','mark:invention':'发明设想','mark:boundary':'边界','mark:trap':'陷阱般的布置','mark:decoy':'诱饵般的布置','mark:shelter':'庇护记号','mark:omen':'征兆','mark:sword_carving':'剑刻',flammable:'易燃',wood:'木',paper:'纸',cloth:'布',fiber:'纤维',stone:'石',metal:'金属',wet:'湿润',frozen:'结冰'};

// A dynamic duty of world_actions/world_act, never a new static model tool.
// This only describes input; the native proposal pipeline owns validation.
function openProposalOffer(ctx){
 const select=rows=>({type:'string',enum:rows.map(r=>r.value),enumLabels:rows.map(r=>r.label)});
 const people=[{value:'player',label:'自己'},...ctx.people.map(p=>({value:p.id,label:p.name})),...ctx.creatures];
 const entities=[...people,{value:ctx.s.location,label:ctx.name(ctx.s.location)},...featureOptions(ctx),...ctx.inventory.map(i=>({value:i.id,label:i.name}))];
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
 return {id:'open:proposal',label:'组合自己的做法',hint:'选择效果并预览；实际能力、同意、代价和法律后果由引擎裁决。',readOnly:false,inputTool:'world_propose',fill:{},slots:[
  {name:'intent',kind:'text',required:true},
  {name:'target',kind:'entity',entity:'entity',builderStep:1,options:entities},
  {name:'consent',kind:'object',builderStep:1,inputSchema:{type:'object',properties:{from:select(entities),scope:{type:'string'},onRefusal:{type:'string',enum:['abort','contest']}}}},
  {name:'participants',kind:'object',builderStep:1,inputSchema:{type:'object',properties:{target:select(entities)}}},
  {name:'means',kind:'object',builderStep:2,inputSchema:{type:'object',properties:{item:select(items),skill:select(skills),spell:select(Object.keys(ctx.s.spells??{}).map(id=>({value:id,label:ctx.name(id)}))),manner:{type:'string',enum:['careful','quick','forceful','stealthy','clever','sleep','rest','guard','attack','retreat','shove']}}}},
  {name:'effects',kind:'object',required:true,inputSchema:{type:'array',minItems:1,maxItems:63,items:{oneOf:variants}}},
  {name:'context',kind:'object',inputSchema:{type:'object',properties:{modifier:{type:'integer',minimum:-5,maximum:5},reason:{type:'string'}}}}
 ]};
}

// These are declared public areas, not invented coordinates or a second layout.
function zoneOptions(ctx){
 return (ctx.place?.zones??ctx.place?.areas??[]).filter(zone=>typeof zone==='string'||zone&&zone.hidden!==true&&zone.private!==true&&zone.visible!==false&&zone.accessible!==false)
  .map(zone=>typeof zone==='string'?{value:zone,label:zone}:{value:zone.id,label:zone.name??zone.label??zone.id}).filter(zone=>typeof zone.value==='string');
}
function featureOptions(ctx){
 const d={get:(...path)=>path.reduce((value,key)=>value?.[key],ctx.document)},origin=localPlayerPoint(d);
 return environmentFeatures(ctx.engine).filter(row=>row.location===ctx.s.location&&!row.hidden&&!row.private&&row.visible!==false&&localSightClear(d,ctx.engine,ctx.s.location,origin,row.position))
  .map(row=>({value:row.id,label:row.name}));
}

function context(engine,document){
 const s=document.state,place=engine.byId.get(s.location),templates=loadTemplates();
 const name=id=>s.npcs?.[id]?.name??s.created?.[id]?.name??engine.byId.get(id)?.name??id;
 const people=presentPeople(engine,s),present=new Set(people.map(p=>p.id));
 const stations=new Set((place?.workstations??[]).map(w=>w.kind));
 const recipes=(engine.world.recipes??[]).filter(r=>(!r.learningRequired||s.recipes?.[r.id])&&(!r.workstation||stations.has(r.workstation)));
 let bank=null;try{bank=derivedBankAt(engine,s,s.location);}catch{bank=null;}
 const debts=obligationRows(s).filter(r=>r.debtor==='player'&&(!r.resource||['coin_river','core:coin_river'].includes(r.resource))&&obligationView(s,r).owed>0)
  .map(r=>{const seller=r.bank&&r.bank===bank?.id?bank.keepers.find(id=>present.has(id)):r.creditor;
   return{id:r.legacyRecord??r.id,creditor:r.creditor,seller,reachable:Boolean(seller&&present.has(seller)&&settlementPresent(engine,s,'player',r.creditor)),remaining:obligationView(s,r).owed};});
 const lodging=place?.lodging?.host&&(place.lodging.rooms??0)>0?place.lodging:null;
 // 路况：本季封路、天气封路或当下天气（与地图同一算法），步行计。
 const season=engine.calendar(s.minute).season;
 const exits=exitsFrom(engine,s,templates).map(e=>{const edge=engine.world.routes.find(r=>r.id===e.route);if(!edge?.lengthKm)return e;
  let w={};try{w=weatherTravel(engine,document.randomSeed,edge,'walk',s.minute)??{};}catch{w={};}
  return {...e,condition:edge.closedSeasons?.includes(season)?'本季封路':w.closed?'天气封路':w.weather??null};});
 return {engine,s,place,name,people,present,recipes,debts,bank,lodging,exits,templates,
  inventory:Object.entries(s.inventory??{}).filter(([,v])=>qty(v)>0).map(([id,v])=>({id,name:name(id),quantity:qty(v)})),
  skills:Object.keys(s.skills??{}).map(id=>({id,name:name(id)})),
  creatures:Object.entries(s.creatures??{}).filter(([id,row])=>row.location===s.location&&!row.scheduleTravel&&!row.cognitionTravel&&!isPhysicallyDead(null,s,id)).map(([id,row])=>({value:id,label:row.name??name(id)}))};
}
function stockOf(ctx,npc){return Object.entries(ctx.s.npcs?.[npc]?.inventory??{}).filter(([,v])=>qty(v)>0).map(([id,v])=>({id,name:ctx.name(id),quantity:qty(v)}));}
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
  if(slot.fill==='host'&&ctx.lodging)fill[slot.name]=ctx.lodging.host;
  if(slot.fill==='banker'&&ctx.bank?.keepers?.[0])fill[slot.name]=ctx.bank.keepers[0];
  let choices=typeof slot.options==='string'?options(ctx,slot.options,target):Array.isArray(slot.options)?slot.options.map(v=>({value:v,label:slot.optionLabels?.[v]??CHOICES[v]??v})):null;
  if(choices===null&&(slot.kind==='zone'||slot.name==='zone'))choices=zoneOptions(ctx);
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
  if(action.id.startsWith('core:environment.')&&['target','destination'].includes(slot.name)){
   const local=featureOptions(ctx);
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
 for(const slot of slots)if(slot.options&&!slot.multiple)for(const option of slot.options){
  const check=actionPermission(ctx,action,{...selected,[slot.name]:option.value,...option.fill});
  if(check)option.permission=check;
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
const kindOf=(ctx,engine,id)=>ctx.present.has(id)?'npc':ctx.inventory.some(r=>r.id===id)?'item':id===ctx.s.location||ctx.exits.some(e=>e.id===id)?'place':null;
// world_actions / /actions：此处可做（无 target）、对某对象可做（target）、按关键词检索（query）。
export function worldActions(engine,document,{target=null,query=null,limit=24,registry=null}={}){
 registry??=primitiveActionRuntime()?.registry?.(engine)??loadActionRegistry();
 const ctx={...context(engine,document),document};
 let id=null;
 if(target){try{id=engine.resolve(String(target));}catch{id=ctx.people.find(p=>p.name===target)?.id??ctx.inventory.find(r=>r.name===target)?.id??null;}}
 const kind=id?kindOf(ctx,engine,id):null;
 // A globally resolvable name is not evidence of current access. In particular
 // search must not use a remote person's private stock to populate selectors.
 if(!kind)id=null;
 const visible=a=>(a.preconditions??[]).every(c=>holds(ctx,c,id));
 let actions;
 if(query)actions=searchActions(registry,query,{limit,include:['quick','here','target:npc','target:place','target:item','search','llm']}).map(a=>offer(ctx,a,id));
 else if(id)actions=registry.actions.filter(a=>a.visibility.catalog===`target:${kind}`&&visible(a)).map(a=>offer(ctx,a,id));
 else actions=registry.actions.filter(a=>(a.visibility.catalog==='here'||a.visibility.catalog==='quick'||a.ui?.quick)&&visible(a)).map(a=>offer(ctx,a,null));
 const openActions=document.state.records?.action_config?.openActions??'full';
 if(query==='open:proposal'||query==='world_propose')actions=actions.filter(a=>a.id==='open:proposal');
 if(openActions==='off')actions=actions.filter(a=>a.inputTool!=='world_propose');
 if(openActions!=='off'&&registry.actions.some(a=>a.id==='open:leave_mark'||a.call?.tool==='world_propose')&&(!query||query==='open:proposal'||query==='world_propose')){
  actions=actions.filter(action=>action.id!=='open:proposal');actions.unshift(openProposalOffer(ctx));
 }
 const quick=QUICK.map(label=>{const a=registry.actions.find(x=>x.ui?.quick===label);return a?{label,action:a.id,available:visible(a)||a.ui.quick==='交易'}:null;}).filter(Boolean);
 return {location:{id:ctx.s.location,name:ctx.name(ctx.s.location)},...(id?{target:{id,kind,name:ctx.name(id),...(kind==='npc'?{soldOut:restockNotes(engine,ctx,id)}:{})}}:{}),
  scene:sceneLines(engine,document),actions:actions.slice(0,limit),quick,configuration:{openActions,writable:false},texts:{refused:ctx.templates.effects.refused},
  objects:{people:ctx.people.map(p=>({id:p.id,name:p.name,activity:p.activity,sells:stockOf(ctx,p.id).length>0})),
   exits:ctx.exits.map(e=>{const move=registry.byId?.get('core:move'),permission=move?actionPermission(ctx,move,{destination:e.id,mode:'walk'}):null;return {id:e.id,name:e.name,direction:e.direction,distance:e.relation==='route'?distanceText(e.km,ctx.templates):'',modes:e.modes,...(e.condition?{condition:e.condition}:{}),...(permission?{permission}:{})};}),
   items:ctx.inventory}};
}
export {findAction};
