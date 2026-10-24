// The model-free form search uses the same catalog and offered slot values as
// tools/a3-score.mjs. It never executes a candidate or guesses an NPC's consent.
import {primitiveRuntime} from './primitives-runtime.mjs';
import {personTeaching} from './entity-view.mjs';

// The composition root supplies the current-world menu projection. Native
// intent matching must not import the presentation layer (or its open router).
let worldActions;
export function registerIntentMenu(provider){worldActions=provider;}

const mentions=(text,value)=>typeof value==='string'&&value.length>1&&text.includes(value);
const namesOf=(engine,row)=>[row.name,row.label?.replace(/（.*$/,''),row.id,row.value,...row.aliases??[],...engine.byId.get(row.id??row.value)?.aliases??[]].filter(Boolean);
const named=(engine,text,row)=>namesOf(engine,row).some(value=>mentions(text,value));
function actionWords(action){
 const label=action.label?.split(/[（(]/)[0];
 const speciesVerb=action.slots?.some(row=>row.name==='species')&&/(?:动物|灵物)$/.test(label)?label.slice(0,-2):null;
 const activities=action.call?.tool==='world_time'?action.slots?.find(row=>row.name==='activity')?.options??[]:[];
 return [...new Set([label,speciesVerb,action.verb,...action.synonyms??[],...activities,...action.call?.tool==='world_learn'?['学','教']:[]])].filter(Boolean);
}
function positiveWords(action,text){
 return actionWords(action).flatMap(word=>{
  let start=0,index;while((index=text.indexOf(word,start))!==-1){
   if(!/(?:不|没|未|别|禁止)[^，。；,;]*$/.test(text.slice(0,index)))return [word];
   start=index+word.length;
  }
  // Separable catalog verbs such as 上课 may surround an offered subject and
  // a measure phrase. This is evidence for a partial candidate, not permission
  // to ignore the remaining request at confirmation.
  if(action.call?.tool==='world_learn'&&word.length===2){
   const match=new RegExp(`${word[0]}[^，。；,;]{1,24}${word[1]}`).exec(text);
   if(match&&!/(?:不|没|未|别|禁止)[^，。；,;]*$/.test(text.slice(0,match.index)))return [match[0]];
  }
  return [];
 });
}
function numberValue(raw){
 if(raw==='半')return .5;
 if(/^\d+$/.test(raw))return Number(raw);
 const digits='零一二三四五六七八九';let total=0,digit=0;
 for(const char of raw.replaceAll('两','二')){if(digits.includes(char))digit=digits.indexOf(char);else {const unit={十:10,百:100,千:1000}[char];if(!unit)return NaN;total+=(digit||1)*unit;digit=0;}}
 return total+digit;
}
function numericSlots(action,text){
 const slots={},fragments=[];
 for(const slot of action.slots??[]){
  const unit=slot.name==='minutes'?'分钟|分|小时':slot.name==='quantity'?'个|份|件|只|块|枚|条|瓶|罐|把':null;
  if(!unit)continue;
  const matches=[...text.matchAll(new RegExp(`([0-9零一二两三四五六七八九十百千半]+)(${unit})`,'g'))];
  if(slot.name==='quantity'&&matches.length>1)fragments.push(...matches.map(row=>row[0]));
  if(matches.length===1){const value=numberValue(matches[0][1])*(matches[0][2]==='小时'?60:1);if(Number.isSafeInteger(value)&&value>0){slots[slot.name]=value;fragments.push(matches[0][0]);}}
 }
 return {slots,fragments};
}
function timeSlots(action,text,document){
 if(action.call?.tool!=='world_time')return {};
 const slots={};
 const activities=action.slots.find(row=>row.name==='activity')?.options??[];
 const activity=activities.find(value=>positiveWords({label:value},text).length);
 if(activity)slots.activity=activity;
 const clock=/到(?:今[天日]|明天|后天)?(?:早上|上午|下午|晚上|中午)?([0-9零一二两三四五六七八九十]+)点(?:(半)|([0-9零一二两三四五六七八九十]+)分?)?/.exec(text);
 if(clock){
  let hour=numberValue(clock[1]),minute=clock[2]?30:clock[3]?numberValue(clock[3]):0;
  if(/下午|晚上/.test(clock[0])&&hour<12)hour+=12;
  let dayOffset=clock[0].includes('后天')?2:clock[0].includes('明天')?1:0;
  if(dayOffset===0&&!/今[天日]/.test(clock[0])&&hour*60+minute<=document.state.minute%1440)dayOffset=1;
  if(hour>=0&&hour<24&&minute>=0&&minute<60)slots.until={dayOffset,hour,minute};
 }
 return slots;
}
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
function completeCommand(action,text,entities,engine){
 // Form search has no semantic judge (the scoring harness does). Do not
 // silently execute a matching fragment of a larger, unsupported request.
 const normalize=value=>String(value).normalize('NFKC').toLowerCase().replace(/[\s，。！？、：；,.!?:;]/g,'');
 let command=normalize(text);
 for(const fragment of numericSlots(action,text).fragments)command=command.replace(normalize(fragment),'');
 if(formSlots(action,text))return true;
 const activities=action.call?.tool==='world_time'?action.slots?.find(slot=>slot.name==='activity')?.options??[]:[];
 return [...actionWords(action),...activities].filter(Boolean).some(word=>{
  const phrase=normalize(word);if(!command.includes(phrase))return false;
  if(action.call?.tool==='world_trade'){
   const prefix=text.slice(0,text.indexOf(word)),instrument=prefix.slice(prefix.lastIndexOf('用')+1);
   if(prefix.includes('用')&&entities.some(row=>row.kind==='item'&&named(engine,instrument,row)))return false;
  }
  if(action.slots?.some(s=>s.required&&['text','content'].includes(s.name)))return true;
  let rest=command.replace(phrase,'');
  if(action.call?.tool==='world_trade')rest=rest.replace(/以及|和|与/g,'');
  if(action.call?.tool==='world_time')rest=rest.replace(/原地|这里/g,'');
  for(const name of entities.flatMap(row=>namesOf(engine,row)).sort((a,b)=>b.length-a.length))rest=rest.replaceAll(normalize(name),'');
  // A named destination may include the person the player wants to find.
  if(action.call?.tool==='world_move'){
   for(const label of Object.values(action.slots?.find(row=>row.name==='mode')?.optionLabels??{}))rest=rest.replaceAll(normalize(label),'');
   for(const person of engine.world.npcs??[])for(const name of [person.name,...person.aliases??[]])rest=rest.replaceAll(`找${normalize(name)}`,'');
   rest=rest.replace(/走进|走回|走到|回到|进|回/g,'');
  }
  return !rest.replace(/我想要|我想|我要|请|尝试|自己|本人|进行|一下|付钱|把|将|对|向|用|在|的|我/g,'');
 });
}
export function constructIntent(engine,document,proposal,context){
 if(!worldActions)throw Error('Intent menu provider is not installed');
 const registry=primitiveRuntime.registry(engine),text=proposal.intent;
 const entities=context.entities??[],explicit=proposal.target??proposal.participants?.target;
 const targets=explicit!==undefined?[context.resolve(explicit).value??explicit]:entities.filter(e=>named(engine,text,e)).map(e=>e.id);
 // Hints describe limitations, not commands: matching "观察" in a warning
 // must not turn an observation into carrying silt or loading a fire.
 const actions=registry.actions.filter(a=>!a.readOnly&&!a.projection&&a.call?.tool!=='world_propose'&&a.id!=='open:leave_mark'&&(context.partial?positiveWords(a,text).length:completeCommand(a,text,entities,engine)));
 const candidates=[],seen=new Set();
 for(const definition of actions){
 const merchant=definition.slots?.some(slot=>slot.name==='seller'&&slot.fill==='target');
 const namedPeople=targets.filter(id=>entities.some(row=>row.id===id&&['person','npc'].includes(row.kind)));
 const targetSlot=definition.slots?.find(slot=>slot.fill==='target');
 const typedTargets=targetSlot?targets.filter(id=>entities.some(row=>row.id===id&&(!targetSlot.entity||targetSlot.entity==='entity'||row.kind===targetSlot.entity||targetSlot.entity==='person'&&['person','npc','creature'].includes(row.kind)))):targets.filter(id=>context.kindOf(id));
 const choices=merchant&&!explicit&&!namedPeople.length?worldActions(engine,document,{limit:0,candidatePreview:true}).objects.people.filter(row=>row.sells).map(row=>row.id):typedTargets;
 for(const target of choices.length?choices:[null]){
  const travel=definition.call?.tool==='world_move'&&target&&context.resolveDestination?.(target).value===target;
  const combatIntent=definition.call?.tool==='world_combat'?definition.slots.find(row=>row.name==='intent')?.options.find(value=>mentions(text,definition.slots.find(row=>row.name==='intent').optionLabels?.[value])):null;
  const evidence={...proposal,...(combatIntent?{means:{...proposal.means,manner:combatIntent}}:{}),effects:travel?[{op:'move',entity:context.actor,to:target}]:[]};
  if(!context.visible(definition,{actor:context.actor,...(target?{target}:{})},evidence))continue;
  const menu=worldActions(engine,document,{query:definition.id,target,limit:1,candidatePreview:true});
  const action=menu.actions.find(a=>a.id===definition.id);if(!action)continue;
  const inferred={...context.slotsFor(definition,{...evidence,...(target?{target}:{}),effects:[]}),...numericSlots(definition,text).slots,...timeSlots(definition,text,document)};
  if(travel)inferred.destination=target;
  const form=formSlots(definition,text);
  let combinations=[{...action.fill}],missing=[];
  for(const slot of action.slots??[]){
   let choices;
   const container=definition.call?.tool==='world_environment'&&definition.call.operation==='draw_water'&&slot.name==='container'?(proposal.means?.item??proposal.means?.tools?.[0]):undefined;
   const supplied=proposal.means?.[slot.name]??container??action.fill?.[slot.name]??inferred[slot.name];
   if(supplied!==undefined)choices=[supplied];
   else if(form?.[slot.name])choices=(slot.options??[]).filter(o=>namedOption(form[slot.name],o)).map(o=>o.value);
   else if(['intent','text','content'].includes(slot.name))choices=[text];
   else if(slot.default!==undefined)choices=[slot.default];
   else {
    const offered=slot.options??[],selected=offered.filter(o=>named(engine,text,o));
    if(selected.length)choices=selected.map(o=>slot.multiple?[o.value]:o.value);
    else if(!slot.required)choices=[undefined];
    else if(offered.length)choices=offered.map(o=>slot.multiple?[o.value]:o.value);
    else if(slot.kind==='entity')choices=entities.filter(e=>(!slot.entity||slot.entity==='entity'||slot.entity===e.kind||slot.entity==='npc'&&e.kind==='person')&&named(engine,text,e)).map(e=>e.id);
    else if(Number.isFinite(slot.min))choices=[slot.min];
    else choices=[];
   }
   if(!choices.length){missing.push(slot.name);continue;}
   if(combinations.length*choices.length>24){missing.push(slot.name);continue;}
   combinations=combinations.flatMap(slots=>choices.map(value=>value===undefined?slots:{...slots,[slot.name]:value}));
  }
  for(const slots of combinations){
   if(definition.call?.tool==='world_learn'&&slots.entity){
    slots.kind??=['skill','spell','recipe'].find(kind=>(engine.world[`${kind}s`]??[]).some(row=>row.id===slots.entity));
    const sources=action.slots.find(row=>row.name==='source')?.options??[];
    const teachers=sources.filter(row=>personTeaching(engine,document.state,row.value,slots.entity)||engine.byId.get(row.value)?.book?.teaches?.includes(slots.entity));
    if(!slots.source&&teachers.length===1)slots.source=teachers[0].value;
    if(slots.source&&!teachers.some(row=>row.value===slots.source))continue;
   }
   if(definition.call?.tool==='world_trade'&&slots.item){
    // Bind each count to its own offered item, never to another item in a list.
    for(const name of namesOf(engine,{id:slots.item,name:engine.byId.get(slots.item)?.name})){
     const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
     const match=new RegExp(`([0-9零一二两三四五六七八九十百千]+)(?:个|份|件|只|块|枚|条|瓶|罐|把)${escaped}`).exec(text);
     if(match){slots.quantity=numberValue(match[1]);break;}
    }
   }
   const required=[...new Set([...missing,...context.requiredSlots?.(definition,slots)??[],...definition.signature?.bareIntent?.means??[],...definition.call?.tool==='world_learn'?['entity','source','kind']:[]])].filter(name=>slots[name]===undefined&&!(name==='minutes'&&slots.until));
   const key=JSON.stringify([action.id,slots,required]);if(seen.has(key))continue;seen.add(key);
   candidates.push({id:action.id,label:action.label,slots,missing:required});
  }
 }
 }
 if(candidates.length===1&&!candidates[0].missing.length){
  const candidate=candidates[0],resolved=primitiveRuntime.resolve(engine,{args:{action:candidate.id,slots:candidate.slots}});
  return {candidate,effects:resolved.effects??null};
 }
 return {candidates,missing:[...new Set(candidates.flatMap(c=>c.missing))],status:candidates.length?'needs_slots':'needs_alternative',
  reason:candidates.length?'当前有多种做法或尚缺行动条件，请选择具体动作和对象':'当前可感知的对象和已掌握的手段中，没有能实现这个意图的动作；需要实际可用的材料、技能或规则来源'};
}

// This is a read-only shortlist, not an execution plan. Keep unmatched scene
// shortcuts visible, but never let the selector substitute one for the intent.
export function turnCandidates(engine,document,playerText,context){
 const sceneMenu=worldActions(engine,document,{limit:24,candidatePreview:true});
 const registry=primitiveRuntime.registry(engine);
 const entities=[...context.entities??[]];
 // Reuse the routing layer's known-map resolver: a multi-edge destination is
 // a valid travel reference even when it is not an adjacent exit card.
 for(const place of engine.world.locations??[])if(named(engine,playerText,place)&&context.resolveDestination?.(place.id).value===place.id&&!entities.some(row=>row.id===place.id))entities.push({id:place.id,name:place.name,aliases:place.aliases,kind:'place'});
 const addOptions=action=>{
  for(const slot of action?.slots??[])for(const option of slot.options??[]){
   if(!engine.byId.has(option.value)||entities.some(row=>row.id===option.value))continue;
   entities.push({id:option.value,name:engine.byId.get(option.value)?.name??option.label,kind:slot.entity??slot.name});
  }
 };
 // Offered subjects include public teaching and recipes not yet learned by the
 // player. They are not in the routing context's owned-skill index.
 for(const definition of registry.actions.filter(row=>!row.readOnly&&!row.projection&&positiveWords(row,playerText).length)){
  addOptions(worldActions(engine,document,{query:definition.id,limit:1,candidatePreview:true}).actions.find(row=>row.id===definition.id));
 }
 for(const person of sceneMenu.objects.people.filter(row=>row.sells)){
  const menu=worldActions(engine,document,{query:'core:trade.buy',target:person.id,limit:1,candidatePreview:true});
  for(const option of menu.actions.find(row=>row.id==='core:trade.buy')?.slots.find(slot=>slot.name==='item')?.options??[]){
   if(!entities.some(row=>row.id===option.value))entities.push({id:option.value,name:option.label.replace(/（.*$/,''),kind:'item'});
  }
 }
 context={...context,entities};
 const parsed=constructIntent(engine,document,{intent:playerText},context);
 let matched=parsed.candidate?[parsed.candidate]:parsed.candidates??[];
 if(matched.length>1&&matched.every(row=>row.id==='core:trade.buy'&&!row.missing.length)){
  const items=new Set(matched.map(row=>row.slots.item)),sellers=new Set(matched.map(row=>row.slots.seller));
  if(items.size>1){
   if(items.size===matched.length&&sellers.size===1&&matched.length<=5)matched=[{id:'sequence',label:matched.map(row=>row.label).join(' → '),slots:{},missing:[],steps:matched.map(row=>({action:row.id,slots:row.slots}))}];
   else matched=[]; // Several sellers/items still need clarification, not a partial purchase.
  }
 }
 if(!matched.length){
  const clauses=playerText.split(/[，,；;。]|然后/).map(row=>row.trim()).filter(Boolean);
  if(clauses.length>1&&clauses.length<=5){
   const steps=clauses.map(intent=>{const row=constructIntent(engine,document,{intent},context);return row.candidate??(row.candidates?.length===1?row.candidates[0]:null);});
   if(steps.every(row=>row&&!row.missing.length))matched=[{id:'sequence',label:steps.map(row=>row.label).join('，'),slots:{},missing:[],steps:steps.map(row=>({action:row.id,slots:row.slots}))}];
  }
 }
 const rows=matched.slice(0,5).map(row=>{
  const definitions=(row.steps??[{action:row.id}]).map(step=>registry.byId.get(step.action));
  const expressions=[...new Set(definitions.flatMap(action=>[action.label,...action.synonyms??[]]).filter(word=>playerText.includes(word)))];
  const named=entities.filter(entity=>mentions(playerText,entity.name)).map(entity=>entity.name);
  return {...row,match:{input:playerText,complete:true,basis:{expressions,entities:named,slots:'current scene options and explicit quantities; entire command consumed'}}};
 });
 if(rows.length<5){
  const partial=constructIntent(engine,document,{intent:playerText},{...context,partial:true});
  const alternatives=partial.candidate?[partial.candidate]:partial.candidates??[];
  const score=row=>{
   const action=registry.byId.get(row.id),expressions=positiveWords(action,playerText);
   const values=Object.values(row.slots).filter(value=>typeof value==='string'&&(engine.byId.has(value)||entities.some(entity=>entity.id===value))&&named(engine,playerText,entities.find(entity=>entity.id===value)??{id:value}));
   return Math.min(4,Math.max(0,...expressions.map(word=>word.length)))+values.length*4-row.missing.length*2;
  };
  for(const row of alternatives.sort((a,b)=>score(b)-score(a))){
   if(rows.length>=5)break;
   if(rows.some(old=>old.id===row.id&&JSON.stringify(old.slots)===JSON.stringify(row.slots)))continue;
   rows.push({...row,match:{input:playerText,complete:false,basis:{expressions:positiveWords(registry.byId.get(row.id),playerText),entities:entities.filter(entity=>named(engine,playerText,entity)).map(row=>row.name),unresolved:'Only part of the request matches; conditions, means or remaining clauses need an open proposal.'}}});
  }
 }
 if(rows.length<3){
  const menu=sceneMenu;
  for(const action of menu.actions){
   if(rows.length>=3)break;
   if(action.readOnly||action.id.startsWith('open:')||rows.some(row=>row.id===action.id))continue;
   rows.push({id:action.id,label:action.label,slots:{...action.fill},missing:(action.slots??[]).filter(slot=>slot.required&&action.fill?.[slot.name]===undefined).map(slot=>slot.name),
    match:{input:playerText,complete:false,basis:'scene shortcut only; does not cover the complete player request'}});
  }
 }
 const moreTargets=sceneMenu.objects.people.filter(row=>named(engine,playerText,row));
 return {status:matched.length===1&&!matched[0].missing.length?'candidate':parsed.status,missing:parsed.missing??[],unresolved:!matched.length,
  candidates:rows.map((row,index)=>({...row,ref:`c${index+1}`})),
  choices:[{ref:'more',label:'查更多',...(moreTargets.length===1?{target:moreTargets[0].id}:{})},{ref:'clarify',label:'澄清'},{ref:'none',label:'都不是（开放提案）'},{ref:'no_action',label:'纯闲聊/观察，无行动'}]};
}
