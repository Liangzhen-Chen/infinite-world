import {createActionPrimitiveFrame} from './action-authority.mjs';
import {primitiveContext,mirrorPrimitiveTransfer} from './primitives-runtime.mjs';
import {commitPrimitives,planPrimitives,recordResourceCosts} from './primitives.mjs';
import {accountKey} from './ledger.mjs';
import {createEntity,setLocation,endEntity,ensureHoldings,declareHoldingWriter} from './holdings.mjs';
import {digest} from './storage.mjs';
import {reject} from './primitive-policy.mjs';
import {physicalLocation} from './items.mjs';
import {reactToMark} from './mark-reactions.mjs';

declareHoldingWriter('mark-actions',{entities:['mark'],locations:true});
const text=(v,max,label)=>{if(typeof v!=='string'||!v.trim()||v.length>max)reject('E-MARK-FACT',`${label}须是有内容的文字`);return v.trim();};
function rulesFor(engine){
 const rules=engine.world.openActionRules?.mark,tags=engine.world.openTagging?.tags;
 if(!rules||!Array.isArray(tags)||!Number.isSafeInteger(rules.maximumPerAuthorPlace)||rules.maximumPerAuthorPlace<1||!Number.isSafeInteger(rules.minutes)||rules.minutes<1||!Number.isSafeInteger(rules.reactionWindow)||rules.reactionWindow<1)reject('E-MARK-DATA','缺少存档中的留痕规则');
 return {rules,tags,traits:engine.world.openTagging.traits??[]};
}
function location(document,actor){return actor==='player'?document.state.location:document.state.npcs?.[actor]?.location;}

// Material declarations refer to transfers in this transaction; they cannot
// provide a second way to consume or manufacture inventory.
export function prepareMarkEffects(engine,document,effects,{actor='player'}={}){
 if(!effects.some(effect=>effect.op==='create'&&effect.kind==='mark'))return effects;
 const available=new Map();
 for(const effect of effects)if(effect.op==='transfer'&&effect.from.startsWith(`${actor}|`)&&effect.to.startsWith('sink:consume|')){
  const resource=effect.from.split('|')[1];available.set(resource,(available.get(resource)??0)+effect.qty);
 }
 return effects.map(effect=>{
  if(effect.op!=='create'||effect.kind!=='mark')return effect;
  const facts=effect.facts??{},at=location(document,actor);
  if(facts.location!==undefined&&facts.location!==at)reject('E-MARK-LOCATION','只能在当前所在位置留下痕迹');
  if(facts.author!==undefined&&![actor,'self','$actor'].includes(facts.author))reject('E-MARK-FACT','不能冒署他人之名');
  if(facts.carrier!==undefined){
   const item=engine.world.items.find(row=>row.id===facts.carrier),key=item&&accountKey(actor,item.id,'inventory');
   if(!item||(document.ledger?.accounts?.[key]??0)<1)reject('E-MARK-MATERIAL','所用载体须是实际持有的物品');
  }
  const materials=effect.materials??[],{rules}=rulesFor(engine);
  if(!Array.isArray(materials)||materials.length>rules.maximumMaterials)reject('E-MARK-MATERIAL','材料列表无效');
  for(const material of materials){
   if(!material||Object.keys(material).some(k=>!['resource','item','qty'].includes(k))||material.resource&&material.item&&material.resource!==material.item)reject('E-MARK-MATERIAL','材料无效');
   const resource=material.resource??material.item,qty=material.qty;
   if(!engine.world.items.some(row=>row.id===resource)||!Number.isSafeInteger(qty)||qty<1||(available.get(resource)??0)<qty)reject('E-MARK-MATERIAL','所用材料须由同一次行动实际消耗');
   available.set(resource,available.get(resource)-qty);
  }
  return {...effect,materials:[],facts:Object.fromEntries(Object.entries(facts).filter(([key])=>!['location','author','carrier'].includes(key)))};
 });
}

// Called by the primitive runtime for create(kind:mark). The native frame owns
// actor/location and transfer costs; mark facts cannot provide numeric effects.
export function applyMarkPrimitive(d,engine,effect,{frame,child=`${frame.eventId}:mark`}={}){
 const {rules,tags,traits}=rulesFor(engine);
 if(effect.op!=='create'||effect.kind!=='mark')reject('E-MARK-KIND','这里只能留下痕迹');
 if(effect.template!==undefined||effect.population!==undefined||effect.materials?.length)reject('E-MARK-MATERIAL','材料须先在同一事务中真实转出');
 const facts=effect.facts??{};
 if(Object.keys(facts).some(k=>!['intent','form','zone','object','support'].includes(k)))reject('E-MARK-FACT','留痕不能附带资源、账户或数值能力');
 const intent=text(facts.intent,2000,'意图'),form=text(facts.form,40,'形态');
 const at=location(d.document,frame.actor);if(!at)reject('E-MARK-LOCATION','无法在旅途中留下固定痕迹');
 const references={};
 if(facts.support!==undefined&&facts.object===undefined)reject('E-MARK-FACT','支撑物须与实际摆放的原物件一起指定');
 for(const field of ['object','support'])if(facts[field]!==undefined){
  const id=facts[field],entity=typeof id==='string'&&d.get('holdings','entities',id),position=entity&&d.get('holdings','locations',id);
  if(!entity||entity.goneAt!==undefined||physicalLocation(d,engine,id)!==at)reject('E-MARK-LOCATION','纪念物及支撑物必须真实存在于当前地点');
  if(field==='object'&&(entity.kind!=='item'||position?.mode!=='place'||position.at!==at))reject('E-MARK-FACT','纪念物必须是实际放下的原物件');
  if(field==='support'){
   const contact=engine.primitiveTargetFacts(d,frame.actor,id);
   // Physical objects may carry an authored local reachability fact without
   // coordinates. A concrete sight/range result takes precedence when present.
   const reachable=contact?contact.lineOfSight&&Number.isFinite(contact.distanceMeters)&&contact.distanceMeters>=0&&contact.distanceMeters<=1.5:entity.facts?.reachable===true;
   if(!reachable)reject('E-MARK-LOCATION','支撑物必须在伸手可及处');
  }
  references[field]=id;
 }
 const restriction=engine.byId.get(at)?.primitiveLimits?.create;
 if(restriction===false||restriction==='forbidden'||restriction?.allowed===false)reject('E-PRIMITIVE-PLACE','这里不允许留下新的固定痕迹');
 const zone=facts.zone??null;
 if(zone!==null){
  const zones=engine.byId.get(at)?.zones??engine.byId.get(at)?.areas??[];
  if(typeof zone!=='string'||!zones.some(z=>(typeof z==='string'?z:z.id)===zone))reject('E-MARK-ZONE','该处没有这个已知分区');
 }
 let selected=effect.tags??[];
 if(!Array.isArray(selected)||selected.length>8||new Set(selected).size!==selected.length||selected.some(t=>!tags.includes(t)&&!traits.includes(t)))reject('E-MARK-TAG','请选择已登记的留痕或性状标签');
 if(!selected.some(t=>tags.includes(t)))selected=[engine.world.openTagging.default,...selected];
 const id=`mark_${digest({eventId:frame.eventId,child}).slice(0,32)}`,now=d.get('state','minute');
 const previous=Object.values(d.get('state','records')??{}).filter(r=>r.category==='mark'&&r.author===frame.actor&&r.location===at&&r.active).sort((a,b)=>a.minute-b.minute||a.id.localeCompare(b.id));
 const replaced=previous.length>=rules.maximumPerAuthorPlace?previous[0]:null;
 if(replaced){
  endEntity(d,{id:replaced.id,basis:'destruction',writer:'mark-actions',eventId:child});
  d.remove(['state','created',replaced.id]);d.set(['state','records',`mark:${replaced.id}`],{...replaced,active:false,replacedBy:id});
 }
 const mark={id,intent,form,location:at,zone,author:frame.actor,tags:[...selected],...references};
 createEntity(d,{id,kind:'mark',facts:mark,source:frame.source.id,writer:'mark-actions',eventId:child});
 setLocation(d,{entity:id,at,mode:'place',writer:'mark-actions',eventId:child,engine});
 d.set(['state','created',id],{...mark,kind:'mark',name:`${form}：${intent.slice(0,40)}`});
 d.set(['state','records',`mark:${id}`],{category:'mark',...mark,minute:now,active:true,replaced:replaced?.id??null,suppressed:Boolean(replaced)});
 return {entity:id,location:at,replaced:replaced?.id??null,suppressed:Boolean(replaced)};
}

// Native registered-action adapter. No caller-supplied actor, source, result or
// time is forwarded. Public world_act dispatch is composed by A3-A.
export function executeLeaveMark(engine,document,input,{actor='player',preview=false}={}){
 const {rules}=rulesFor(engine),args=input.args?.slots??input.args??{};
 if(Object.keys(args).some(k=>!['intent','form','zone','tags','materials'].includes(k)))reject('E-MARK-FACT','留痕参数包含未登记字段');
 const materials=args.materials??[];
 if(!Array.isArray(materials)||materials.length>rules.maximumMaterials)reject('E-MARK-MATERIAL','材料列表无效');
 const resources=materials.map(row=>{
  if(!row||Object.keys(row).some(k=>!['item','qty'].includes(k))||!engine.byId.has(row.item)||!engine.world.items.some(i=>i.id===row.item)||!Number.isSafeInteger(row.qty)||row.qty<1)reject('E-MARK-MATERIAL','须使用真实物品与正整数数量');
  return {op:'transfer',from:accountKey(actor,row.item,'inventory'),to:accountKey('sink:consume',row.item,'action'),qty:row.qty};
 });
 const effect={op:'create',kind:'mark',facts:{intent:args.intent,form:args.form,...(args.zone!==undefined?{zone:args.zone}:{})},...(args.tags?{tags:args.tags}:{})};
 let result;
 const frame=createActionPrimitiveFrame(primitiveContext(engine,document),{actor,eventId:input.eventId,source:{kind:'catalog',id:'open:leave_mark'},engine,
  identity:{args},createDraft:doc=>{const d=engine.primitiveDraft(doc);ensureHoldings(d,engine);return d;},
  mirrorTransfer:(d,e)=>mirrorPrimitiveTransfer(d,engine,e),
  executePrimitive:(d,e,meta)=>{result=applyMarkPrimitive(d,engine,e,{...meta,child:`${input.eventId}:${meta.index}`});return result;},
  finish:(d,{receipt})=>{
   const mark=d.get('state','created',result.entity),reaction=reactToMark(d,engine,mark,{eventId:input.eventId,suppressed:result.suppressed});
   receipt.mark={...result,...reaction};receipt.fallback={originalIntentFulfilled:false,entity:result.entity};
   engine.advance(d,rules.minutes,`${input.eventId}:cost`);receipt.cost={time:rules.minutes};recordResourceCosts(receipt,resources,{requested:resources});
  }});
 return preview?planPrimitives(document,[...resources,effect],frame):commitPrimitives(document,[...resources,effect],frame);
}
