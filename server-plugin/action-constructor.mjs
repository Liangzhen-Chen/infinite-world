// The model-free form search uses the same catalog and offered slot values as
// tools/a3-score.mjs. It never executes a candidate or guesses an NPC's consent.
import {worldActions} from './action-affordances.mjs';
import {searchActions} from './action-registry.mjs';
import {primitiveRuntime} from './primitives-runtime.mjs';

const mentions=(text,value)=>typeof value==='string'&&value.length>1&&text.includes(value);
function formSlots(action,text){
 for(const form of action.signature?.intentForms??[]){
  const names=[],parts=form.split(/(\{[a-zA-Z]+\})/).map(part=>{
   if(/^\{[a-zA-Z]+\}$/.test(part)){names.push(part.slice(1,-1));return '(.+?)';}
   return part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  });
  const match=new RegExp(`^${parts.join('')}$`).exec(text.trim().replace(/[。！？!?]$/,''));
  if(match)return Object.fromEntries(names.map((name,index)=>[name,match[index+1]]));
 }
 return null;
}
function namedOption(text,option){
 const value=String(text).trim(),label=String(option.label??option.value).replace(/（.*?）|×\d+/g,'');
 return value===option.value||label.includes(value)||value.length>=2&&/^[\u3400-\u9fff]+$/.test(value)&&[...value].every(ch=>label.includes(ch));
}
function completeCommand(action,text,entities){
 // Form search has no semantic judge (the scoring harness does). Do not
 // silently execute a matching fragment of a larger, unsupported request.
 const normalize=value=>String(value).normalize('NFKC').toLowerCase().replace(/[\s，。！？、：；,.!?:;]/g,'');
 const command=normalize(text);
 if(formSlots(action,text))return true;
 return [action.label,action.verb,...action.synonyms??[]].filter(Boolean).some(word=>{
  const phrase=normalize(word);if(!command.includes(phrase))return false;
  if(action.slots?.some(s=>s.required&&['text','content'].includes(s.name)))return true;
  let rest=command.replace(phrase,'');
  for(const entity of [...entities].sort((a,b)=>b.name.length-a.name.length))for(const name of [entity.name,entity.id])rest=rest.replaceAll(normalize(name),'');
  return !rest.replace(/我想要|我想|我要|请|尝试|自己|本人|进行|一下|把|将|对|向|用|在|的/g,'');
 });
}
export function constructIntent(engine,document,proposal,context){
 const registry=primitiveRuntime.registry(engine),text=proposal.intent;
 const entities=context.entities??[],explicit=proposal.target??proposal.participants?.target;
 const targets=explicit!==undefined?[context.resolve(explicit).value??explicit]:entities.filter(e=>mentions(text,e.name)||mentions(text,e.id)).map(e=>e.id);
 // Hints describe limitations, not commands: matching "观察" in a warning
 // must not turn an observation into carrying silt or loading a fire.
 const actions=searchActions({...registry,actions:registry.actions.map(a=>({...a,hint:''}))},text,{limit:24}).filter(a=>!a.readOnly&&!a.projection&&a.call?.tool!=='world_propose'&&a.id!=='open:leave_mark'&&completeCommand(a,text,entities));
 const candidates=[],seen=new Set();
 for(const definition of actions)for(const target of targets.length?targets:[null]){
  if(!context.visible(definition,{actor:context.actor,...(target?{target}:{})},{...proposal,effects:[]}))continue;
  const menu=worldActions(engine,document,{query:definition.id,target,limit:1,candidatePreview:true});
  const action=menu.actions.find(a=>a.id===definition.id);if(!action)continue;
  const inferred=context.slotsFor(definition,{...proposal,...(target?{target}:{}),effects:[]})??{};
  const form=formSlots(definition,text);
  let combinations=[{...action.fill}],missing=[];
  for(const slot of action.slots??[]){
   let choices;
   const container=definition.call?.tool==='world_environment'&&definition.call.operation==='draw_water'&&slot.name==='container'?(proposal.means?.item??proposal.means?.tools?.[0]):undefined;
   const supplied=proposal.means?.[slot.name]??container??inferred[slot.name];
   if(supplied!==undefined)choices=[supplied];
   else if(form?.[slot.name])choices=(slot.options??[]).filter(o=>namedOption(form[slot.name],o)).map(o=>o.value);
   else if(['intent','text','content'].includes(slot.name))choices=[text];
   else if(slot.default!==undefined)choices=[slot.default];
   else {
    const offered=slot.options??[],named=offered.filter(o=>mentions(text,o.label)||mentions(text,o.value));
    if(named.length)choices=named.map(o=>slot.multiple?[o.value]:o.value);
    else if(!slot.required)choices=[undefined];
    else if(offered.length)choices=offered.map(o=>slot.multiple?[o.value]:o.value);
    else if(slot.kind==='entity')choices=entities.filter(e=>(!slot.entity||slot.entity==='entity'||slot.entity===e.kind||slot.entity==='npc'&&e.kind==='person')&&(mentions(text,e.name)||mentions(text,e.id))).map(e=>e.id);
    else if(Number.isFinite(slot.min))choices=[slot.min];
    else choices=[];
   }
   if(!choices.length){missing.push(slot.name);continue;}
   if(combinations.length*choices.length>24){missing.push(slot.name);continue;}
   combinations=combinations.flatMap(slots=>choices.map(value=>value===undefined?slots:{...slots,[slot.name]:value}));
  }
  for(const slots of combinations){
   const required=[...new Set([...missing,...context.requiredSlots?.(definition,slots)??[],...definition.signature?.bareIntent?.means??[]])].filter(name=>slots[name]===undefined);
   const key=JSON.stringify([action.id,slots,required]);if(seen.has(key))continue;seen.add(key);
   candidates.push({id:action.id,label:action.label,slots,missing:required});
  }
 }
 if(candidates.length===1&&!candidates[0].missing.length){
  const candidate=candidates[0],resolved=primitiveRuntime.resolve(engine,{args:{action:candidate.id,slots:candidate.slots}});
  return {candidate,effects:resolved.effects??null};
 }
 return {candidates,missing:[...new Set(candidates.flatMap(c=>c.missing))],status:candidates.length?'needs_slots':'needs_alternative',
  reason:candidates.length?'当前有多种做法或尚缺行动条件，请选择具体动作和对象':'当前可感知的对象和已掌握的手段中，没有能实现这个意图的动作；需要实际可用的材料、技能或规则来源'};
}
