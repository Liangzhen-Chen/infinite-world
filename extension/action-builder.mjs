// Local, model-free composition. Only action ids and declared slots cross the
// execution boundary; a preview receipt is never executable input.
import {memberDefinitions,toolDefinitions} from './tools.mjs';
const inputSchemas=new Map([...memberDefinitions(),...toolDefinitions()].map(row=>[row.function.name,row.function.parameters]));
export const builderSlotSchema=(action,slot)=>slot.inputSchema??inputSchemas.get(action.inputTool)?.properties?.[slot.name]??null;
export const BUILDER_STEPS=['做什么','对谁或何物','用什么','怎么做'];
const implementsSlot=new Set(['item','weapon','skill','spell','recipe','instance','tool','material','materials']);
const effectNames={transfer:'交付物品或款项',move:'移动',learn:'学习',vital:'身体变化',time:'时间推进',status:'状态变化',emit:'表达或请求',create:'留下实体','fact.set':'对象变化','holding.open':'建立关系','holding.close':'结束关系','obligation.create':'订立约定','obligation.fulfill':'履行约定','obligation.close':'结束约定',schedule:'预约行动',transition:'身份变化',invoke:'施展能力'};
export async function findBuilderActions(api,{query,target}){
 const result=await api('actions',{query,target,limit:24});
 // A partial text match does not remove the creative path or mark alternative.
 const extra=await Promise.all(['open:proposal','open:leave_mark'].filter(id=>!result.actions?.some(a=>a.id===id)).map(async id=>{
  const found=await api('actions',{query:id,target,limit:1});return found.actions.filter(a=>a.id===id&&!a.readOnly);
 }));
 return [...result.actions??[],...extra.flat()];
}
export function builderStep(slot){
 if([1,2,3].includes(slot.builderStep))return slot.builderStep;
 if(implementsSlot.has(slot.name)||['instances','tools','skills'].includes(slot.name))return 2;
 if(slot.multiple&&['helpers','workers','guests','beneficiaries'].includes(slot.name))return 1;
 if(slot.kind==='entity'||['zone','direction'].includes(slot.kind)||['zone','direction'].includes(slot.name))return 1;
 return 3;
}
export function slotLabel(slot){
 const names={participants:'作用对象',means:'采用的手段',effects:'希望产生的效果',context:'情境与理由',seller:'向谁',buyer:'交给谁',target:'对象',destination:'去处',item:'物品',weapon:'武器',skill:'技能',spell:'法术',recipe:'配方',instance:'哪一件',
 quantity:'数量',coins:'钱数（文）',minutes:'时长（分钟）',days:'天数',mode:'走法',intent:'出手方式',activity:'做什么',payment:'付款方式',creditMinutes:'赊账期限（分钟）',until:'等到',debt:'哪笔账',zone:'位置',direction:'朝哪个方向',tags:'痕迹的含义与材质',materials:'使用的材料',form:'留下什么形态'};
 const compound={helpers:'帮手',workers:'参与者',guests:'同行者',beneficiaries:'受益者',instances:'具体物件',tools:'工具',skills:'技能',attributes:'分配属性点',data:'详细设置',objective:'约定目标',materials:'材料',output:'产出'};
 return names[slot.name]??compound[slot.name]??slot.name;
}
export function previewLines(result,{label='这样做',startMinute,names={}}={}){
 const receipt=result?.receipt??result?.result?.receipt;
 if(!receipt)return ['尚未取得预览，不能确认。'];
 if(['rejected','not_submitted'].includes(receipt.status)){
  const refusal=receipt.routing??receipt;
  return [receipt.reason??refusal.reason??'原方案尚未执行',...(refusal.missing?.length?[`还需要：${refusal.missing.join('、')}`]:[]),...(refusal.repair??[])];
 }
 const legacy=receipt.legacy,lines=[`这相当于：${label}`,`路由：${receipt.routed?`已登记动作（${label}）`:'尚未确定'}`];
 const elapsed=receipt.cost?.time??legacy?.elapsed??legacy?.minutes??(Number.isSafeInteger(startMinute)&&Number.isSafeInteger(legacy?.minute)?legacy.minute-startMinute:null);
 lines.push(`耗时：${Number.isFinite(elapsed)?`${elapsed}分钟`:'尚未提供'}`);
 if(Number.isFinite(receipt.cost?.coins??legacy?.cost))lines.push(`费用：${receipt.cost?.coins??legacy.cost}文`);
 else if(receipt.cost?.resources?.length)lines.push(`资源代价：${receipt.cost.resources.map(r=>{const resource=r.resource??r.item??(typeof r.from==='string'?r.from.split('|')[1]:null);return `${r.qty??r.quantity??''} ${names[resource]??'物品或款项'}`;}).join('；')}`);
 else lines.push('费用：以确认时的实际裁决为准');
 const check=receipt.check;
 if(receipt.permission)lines.push(`行为限制：${receipt.permission.allowed===false?receipt.permission.reason:receipt.permission.allowed===true?'当前制度允许发起；确认时仍需校验':'尚未取得预判'}`);
 if(receipt.consent){const permission=receipt.consent;lines.push(`同意：${permission.allowed?({given:'本人同意',proxy:'有效代理',emergency:'紧急依据'}[permission.kind]??'已有依据'):'未取得'}${permission.reason?`（${permission.reason}）`:''}`);}
 if(Array.isArray(receipt.witnesses))lines.push(`已知见证：${receipt.witnesses.length}人`);
 const witnesses=(receipt.witnesses??[]).map(id=>names[id]).filter(Boolean);
 if(witnesses.length)lines.push(`可见见证者：${witnesses.join('、')}`);
 const responders=[...new Set((receipt.mark?.reactions??[]).map(row=>names[row.observer]).filter(Boolean))];
 if(responders.length)lines.push(`可能回应：${responders.join('、')}（确认时重新裁决）`);
 lines.push(`难度：${check?.difficulty??check?.dc??(check?'按当前对抗裁决':'本次回执未提供检定难度')}`);
 for(const notice of legacy?.notices??[])if(notice.text)lines.push(`预计：${notice.text}`);
 if(receipt.applied?.length)lines.push(`预计效果：${receipt.applied.map(e=>effectNames[e.op]??'其他世界变化').join('、')}`);
 if(receipt.fallback?.originalIntentFulfilled===false)lines.push('预计只留下痕迹；原本设想的效果不会因此实现。');
 for(const c of receipt.consequences??[])lines.push(`后果：${typeof c==='string'?c:c.reason??c.tags?.join('、')??c.type??'确认时重新裁决'}`);
 for(const row of receipt.trimmed??[])if(row.reason)lines.push(`受限效果：${row.reason}`);
 lines.push('预览尚未发生；见证、同意与法律后果以引擎实际提供的裁决为准。');
 return lines;
}

// Render the existing tool's declared fields; validation remains in the engine.
// Nested objects and lists use controls instead of asking for JSON.
function structuredInput(doc,{schema,value,id,label,disabled,onChange}){
 const make=(tag,text)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 if(Array.isArray(schema.type))schema={...schema,type:schema.type.find(type=>type!=='null')};
 const variants=schema.oneOf??schema.anyOf;
 if(variants){
  const group=make('fieldset');group.append(make('legend',label));
  const index=Math.max(0,variants.findIndex(s=>s.properties?.op?.const?value?.op===s.properties.op.const:s.type===typeof value));
  const select=make('select');select.id=`${id}-kind`;select.disabled=disabled;select.setAttribute('aria-label',`${label}种类`);
  variants.forEach((s,i)=>{const o=make('option',effectNames[s.properties?.op?.const]??s.title??s.type);o.value=String(i);select.append(o);});select.value=String(index);
  const initial=s=>s.type==='object'?Object.fromEntries(Object.entries(s.properties??{}).filter(([,v])=>v.const!==undefined).map(([k,v])=>[k,v.const])):s.type==='number'?0:s.type==='boolean'?false:'';
  select.onchange=()=>onChange(initial(variants[Number(select.value)]));group.append(select);
  group.append(structuredInput(doc,{schema:variants[index],value,id,label,disabled,onChange}));return group;
 }
 if(schema.const!==undefined){const input=make('input');input.type='hidden';input.value=schema.const;return input;}
 const names={type:'种类',name:'名称',quantity:'数量',qty:'数量',item:'物品',location:'地点',project:'工程',template:'模板',power:'规模',age:'年龄',occupation:'身份',notes:'说明',skill:'技能',minimumProficiency:'熟练度要求',materials:'材料',amount:'份量',minutes:'分钟',difficulty:'难度',output:'产出',tools:'工具',workstation:'设施',byproducts:'副产物',toolWear:'工具磨损',failure:'失败处理',recoverFraction:'可回收比例',injury:'受伤',spec:'规则说明'};
 if(schema.type==='object'&&!schema.properties){
  const group=make('fieldset');group.append(make('legend',label));
  for(const [key,entry]of Object.entries(value??{})){
   const row=make('div');row.append(structuredInput(doc,{schema:{oneOf:[{type:'string',title:'文字'},{type:'number',title:'数值'},{type:'boolean',title:'是或否'},{type:'object',title:'详细条款'}]},value:entry,id:`${id}-${key}`,label:key,disabled,onChange:next=>onChange({...value,[key]:next})}));
   const remove=make('button','移除');remove.type='button';remove.disabled=disabled;remove.onclick=()=>{const next={...value};delete next[key];onChange(Object.keys(next).length?next:undefined);};row.append(remove);group.append(row);
  }
  const key=make('input');key.setAttribute('aria-label',`${label}字段名`);key.disabled=disabled;
  const add=make('button','添加字段');add.type='button';add.disabled=disabled;add.onclick=()=>{const name=key.value.trim();if(name&&!['__proto__','constructor','prototype'].includes(name))onChange({...value,[name]:''});};group.append(key,add);return group;
 }
 if(schema.type==='object'&&schema.properties){
  const group=make('fieldset');group.id=id;group.disabled=disabled;group.append(make('legend',label));
  for(const [key,child]of Object.entries(schema.properties))group.append(structuredInput(doc,{schema:child,value:value?.[key],id:`${id}-${key}`,label:`${names[key]??key}${schema.required?.includes(key)?'':'（可不填）'}`,disabled,onChange:next=>{const changed={...value};if(next===undefined)delete changed[key];else changed[key]=next;onChange(Object.keys(changed).length?changed:undefined);}}));
  return group;
 }
 if(schema.type==='array'&&schema.items){
  const group=make('fieldset');group.id=id;group.disabled=disabled;group.append(make('legend',label));
  const values=Array.isArray(value)?value:[];
  const button=(text,run)=>{const b=make('button',text);b.type='button';b.className='fields-actions-button';b.disabled=disabled;b.onclick=run;return b;};
  values.forEach((entry,index)=>{const row=make('div');row.append(structuredInput(doc,{schema:schema.items,value:entry,id:`${id}-${index}`,label:`第${index+1}项`,disabled,onChange:next=>onChange(values.map((old,i)=>i===index?next:old))}),button('移除这一项',()=>{const next=values.filter((_,i)=>i!==index);onChange(next.length?next:undefined);}));group.append(row);});
  if(values.length<(schema.maxItems??Infinity))group.append(button('添加一项',()=>{
   const first=schema.items.oneOf?.[0]??schema.items;
   const entry=first.type==='object'?Object.fromEntries(Object.entries(first.properties??{}).filter(([,s])=>s.const!==undefined).map(([k,s])=>[k,s.const])):first.enum?.[0]??'';
   onChange([...values,entry]);
  }));
  return group;
 }
 const row=make('div'),caption=make('label',label);caption.htmlFor=id;let input;
 if(schema.enum){
  input=make('select');const empty=make('option','（不填）');empty.value='';input.append(empty);
  schema.enum.forEach((entry,index)=>{const option=make('option',schema.enumLabels?.[index]??String(entry));option.value=String(index);input.append(option);});
  const index=schema.enum.indexOf(value);input.value=index<0?'':String(index);input.onchange=()=>onChange(input.value===''?undefined:schema.enum[Number(input.value)]);
 }else{
  input=make('input');input.type=schema.type==='boolean'?'checkbox':['integer','number'].includes(schema.type)?'number':'text';
  if(input.type==='checkbox')input.checked=value===true;else input.value=value??'';
  if(input.type==='number'){input.step=schema.type==='integer'?'1':'any';if(schema.minimum!==undefined)input.min=schema.minimum;if(schema.maximum!==undefined)input.max=schema.maximum;}
  if(schema.maxLength!==undefined)input.maxLength=schema.maxLength;
  input.onchange=()=>onChange(input.type==='checkbox'?input.checked:input.value===''?undefined:input.type==='number'?Number(input.value):input.value);
 }
 input.id=id;input.disabled=disabled;row.append(caption,input);return row;
}

export class ActionBuilder{
 constructor({preview,act,newEventId=()=>`ui_${crypto.randomUUID()}`}){
  this.services={preview,act,newEventId};this.step=0;this.action=null;this.slots={};this.revision=0;this.busy=false;this.cancelled=false;this.quote=null;this.error=null;this.result=null;
 }
 choose(action){
  if(action.blocked){
   this.invalidate();this.action=null;this.slots={};this.step=0;
   this.error=typeof action.blocked==='string'?action.blocked:action.blocked.reason;
   this.feedback={reason:this.error,missing:[this.error],repair:['根据当前缺项调整条件，或重新选择动作后预览'],alternatives:[{kind:'edit',label:'重新选择动作',missing:[this.error],available:false}],fallback:null};return;
  }
  this.action=structuredClone(action);this.slots={...action.fill};
  if(['open:leave_mark','open:proposal'].includes(action.id)){
   const intentSlot=action.slots.find(slot=>['intent','text'].includes(slot.name)&&slot.kind==='text');
   if(intentSlot&&this.intent)this.slots[intentSlot.name]=this.intent;
  }
  for(const slot of action.slots??[])if(this.slots[slot.name]===undefined&&slot.default!==undefined&&typeof slot.default!=='object'&&slot.default!=='dawn')this.slots[slot.name]=slot.default;
  this.invalidate();this.step=1;
 }
 invalidate(){this.revision++;this.quote=null;this.eventId=null;this.result=null;this.feedback=null;this.error=null;}
 setSlot(name,value){
  if(!this.action?.slots.some(s=>s.name===name&&(s.name!=='consent'||s.kind==='object')))throw Error('这个动作没有此项选择');
  if(value===undefined||value==='')delete this.slots[name];else this.slots[name]=structuredClone(value);
  const option=this.action.slots.find(s=>s.name===name)?.options?.find(o=>o.value===value);
  if(option?.fill)Object.assign(this.slots,structuredClone(option.fill));
  this.invalidate();
 }
 // New target stock/options come from a fresh /actions projection. Retain only
 // choices still offered, including when the same item exists in two shops.
 refresh(action){
  this.action=structuredClone(action);
  for(const slot of action.slots??[])if(slot.options&&this.slots[slot.name]!==undefined){
   if(slot.multiple){const kept=this.slots[slot.name].filter(v=>slot.options.some(o=>o.value===v));if(kept.length)this.slots[slot.name]=kept;else delete this.slots[slot.name];}
   else if(!slot.options.some(o=>o.value===this.slots[slot.name]))delete this.slots[slot.name];
  }
  this.invalidate();
 }
 async preview(){
  if(this.busy||this.cancelled)return null;
  if(!this.action)throw Error('先选想做的事');
  this.error=null;this.result=null;this.quote=null;this.feedback=null;
  const missing=this.action.slots.filter(s=>s.required&&!s.consent&&this.slots[s.name]===undefined);
  if(missing.length){this.error=`还需要选择：${missing.map(slotLabel).join('、')}`;this.feedback={reason:this.error,missing:missing.map(slotLabel),repair:['补全这些选择后重新预览；原方案尚未执行'],alternatives:[{kind:'edit',label:'补全所缺选择',missing:missing.map(s=>s.name),available:false}],fallback:null};return null;}
  const revision=this.revision,args={action:this.action.id,slots:structuredClone(this.slots)},eventId=this.eventId??=this.services.newEventId();
  this.busy=true;
  try{
   const result=await this.services.preview(args.action,args.slots,eventId);
   if(this.cancelled||revision!==this.revision)return null;
   const receipt=result?.receipt??result?.result?.receipt;
   if(result?.ok===false&&!receipt)throw Error(result.error??'未能取得预览');
   if(receipt?.status!=='preview'){
    this.feedback=structuredClone({...result.prepared,...result.routing,...receipt,...receipt?.routing});
    const details=(this.feedback.ambiguities??[]).map(row=>`${row.path}：${row.value}`).join('；');
    throw Error(receipt?.reason??this.feedback.reason??(details?`请明确目标：${details}`:'请补全选择，或采用下面的替代做法'));
   }
   this.quote={args,eventId,revision,result,sequence:result.reference?.sequence};return this.quote;
  }catch(error){if(!this.cancelled&&revision===this.revision)this.error=error.message;return null;}
  finally{this.busy=false;}
 }
 async confirm(){
  if(this.busy||this.cancelled||!this.quote||this.quote.revision!==this.revision)return null;
  const quote=this.quote;this.quote=null;this.busy=true;
  try{
   const result=await this.services.act(quote.args.action,structuredClone(quote.args.slots),{eventId:quote.eventId,expectedSequence:quote.sequence});
   this.result=result;
   if(result?.stale){this.error='此刻情形已变化，请重新预览后再确认。';this.eventId=null;}
   else if((result?.receipt??result?.result?.receipt)?.status==='rejected'){
    const receipt=result.receipt??result.result.receipt;
    this.feedback=structuredClone({...receipt,...receipt.routing});this.error=receipt.reason;this.eventId=null;
   }
   else if(result?.ok===false)this.error=result.error;
   return result;
  }catch(error){this.error=error.message;return null;}
  finally{this.busy=false;}
 }
 cancel(){this.cancelled=true;this.invalidate();}
}

// This form has no model client. Search and selectors read the same dynamic
// action projection as the ordinary object menu.
export function renderActionBuilder(container,{builder,here,api,onChange,onClose,onResult}){
 const doc=container.ownerDocument;
 const node=(tag,text)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const button=(text,run)=>{const b=node('button',text);b.type='button';b.className='fields-actions-button';b.disabled=builder.busy;b.onclick=run;return b;};
 container.className='fields-actions-form fields-action-builder';container.setAttribute('aria-label','其他动作构造器');
 container.append(node('h3','其他…'));
 const progress=node('p',BUILDER_STEPS.map((s,i)=>`${i===builder.step?'●':'○'} ${s}`).join(' → '));progress.setAttribute('aria-live','polite');container.append(progress);
 const perform=async fn=>{try{const task=fn();onChange();await task;}catch(error){builder.error=error.message;}finally{onChange();}};
 if(builder.step===0){
  const form=node('form'),label=node('label','想做什么？'),input=node('input');input.type='text';input.id='fields-builder-intent';input.value=builder.intent??'';label.htmlFor=input.id;form.append(label,input);
  const search=node('button','找相近的动作');search.type='submit';search.className='fields-actions-button';search.disabled=builder.busy;form.append(search);container.append(form);
  form.onsubmit=e=>{e.preventDefault();const query=input.value.trim();builder.intent=query;perform(async()=>{
   builder.busy=true;
   try{const actions=await findBuilderActions(api,{query,target:builder.target??here.target?.id});if(!builder.cancelled)builder.matches=actions;}
   finally{builder.busy=false;}
  });};
  const choices=(builder.matches??here.actions).filter(a=>!a.readOnly);
  if(!choices.length)container.append(node('p','换个说法找相近动作，或返回对象菜单选择。'));
  for(const a of choices)container.append(button(a.label,()=>{builder.choose(a);onChange();}));
 }else{
  container.append(node('h4',`${BUILDER_STEPS[builder.step]}：${builder.action.label}`));
  if(builder.action.hint)container.append(node('p',builder.action.hint));
  const slots=builder.action.slots.filter(s=>(s.name!=='consent'||s.kind==='object')&&builderStep(s)===builder.step);
  if(!slots.length)container.append(node('p',builder.step===1?'作用于自己或此处。':builder.step===2?'不需要另选物品或技能。':'采用这个动作原有的做法。'));
  for(const slot of slots){
   const label=node('label',`${slotLabel(slot)}${slot.required?'':'（可不填）'}`),id=`fields-builder-${slot.name}`;label.htmlFor=id;
   container.append(label);
   if((['object','materials'].includes(slot.kind)||builderSlotSchema(builder.action,slot))&&!slot.multiple){
    if(slot.default==='dawn')container.append(button('等到明早',()=>{const hour=Math.floor((builder.minute??0)%1440/60);builder.setSlot(slot.name,{dayOffset:hour>=6?1:0,hour:6});onChange();}));
    if(slot.name==='until'){
     const current=builder.slots[slot.name]??{};
     for(const [key,title,min,max]of [['dayOffset','从今天起第几天',0,null],['hour','钟点（时）',0,23],['minute','钟点（分）',0,59]]){
      const field=node('input'),caption=node('label',title);field.type='number';field.id=`${id}-${key}`;caption.htmlFor=field.id;field.min=min;if(max!==null)field.max=max;field.step=1;field.value=current[key]??(key==='minute'?0:'');field.disabled=builder.busy;
      field.onchange=()=>{const value={...builder.slots[slot.name]};if(field.value==='')delete value[key];else value[key]=Number(field.value);builder.setSlot(slot.name,Object.keys(value).length?value:undefined);onChange();};container.append(caption,field);
     }
    }else{
     const schema=builderSlotSchema(builder.action,slot);
     if(schema)container.append(structuredInput(doc,{schema,value:builder.slots[slot.name],id,label:slotLabel(slot),disabled:builder.busy,onChange:value=>{builder.setSlot(slot.name,value);onChange();}}));
     else container.append(node('p','这个复合选项暂未提供本地编辑；请换用已有动作选项。'));
    }
    continue;
   }
   let input;
   if(slot.options||['entity','zone','direction'].includes(slot.kind)||['zone','direction'].includes(slot.name)){
    input=node('select');input.multiple=Boolean(slot.multiple);if(!slot.multiple){const empty=node('option',slot.required?'请选择':'（不填）');empty.value='';input.append(empty);}
    for(const option of slot.options??[]){const o=node('option',option.permission?.allowed===false?`${option.label}（${option.permission.reason}）`:option.label);o.value=option.value;o.disabled=option.permission?.allowed===false;input.append(o);}
   }else{
    input=node('input');input.type=['quantity','coins','minutes'].includes(slot.kind)?'number':slot.kind==='flag'?'checkbox':'text';
    if(input.type==='number'){input.min=String(slot.min??1);if(slot.max!==undefined)input.max=String(slot.max);input.step='1';input.inputMode='numeric';}
   }
   input.id=id;input.required=Boolean(slot.required);input.disabled=builder.busy;
   if(slot.multiple)for(const option of input.options)option.selected=(builder.slots[slot.name]??[]).includes(option.value);
   else if(input.type==='checkbox')input.checked=Boolean(builder.slots[slot.name]);else input.value=builder.slots[slot.name]??'';
   input.onchange=()=>{
    const selected=slot.multiple?[...input.selectedOptions].map(o=>o.value):null;
    builder.setSlot(slot.name,slot.multiple?(selected.length?selected:undefined):input.type==='checkbox'?(input.checked||undefined):input.type==='number'?(input.value===''?undefined:Number(input.value)):input.value);
    if(builder.step===1&&!slot.multiple&&input.value)perform(async()=>{
     const revision=builder.revision,target=input.value;builder.busy=true;
     try{
      const result=await api('actions',{query:builder.action.id,target,limit:24});
      if(builder.cancelled||builder.revision!==revision)return;
      const action=result.actions.find(a=>a.id===builder.action.id);if(action)builder.refresh(action);builder.target=target;
     }finally{builder.busy=false;}
    });
   };
   container.append(input);
   for(const value of slot.presets??[])container.append(button(String(value),()=>{builder.setSlot(slot.name,value);onChange();}));
  }
  if(builder.quote){
   const box=node('div');box.className='fields-builder-preview';box.setAttribute('role','status');
   const names=Object.fromEntries([here.location,here.target,...here.objects?.people??[],...here.objects?.items??[]].filter(Boolean).map(row=>[row.id,row.name]));names.player='你';
   for(const line of previewLines(builder.quote.result,{label:builder.action.label,startMinute:builder.quote.result.startMinute,names}))box.append(node('p',line));
   container.append(box,button('确认执行',()=>perform(async()=>{const result=await builder.confirm();if(result)onResult(result,builder.action);}))); 
  }else if(builder.step===3)container.append(button('预览代价与结果',()=>perform(()=>builder.preview())));
  if(builder.step<3)container.append(button('下一步',()=>{builder.step++;onChange();}));
  container.append(button('上一步',()=>{builder.step--;builder.quote=null;onChange();}));
 }
 if(builder.feedback?.reason&&builder.feedback.reason!==builder.error)container.append(node('p',builder.feedback.reason));
 if(builder.feedback?.missing?.length)container.append(node('p',`还需要：${builder.feedback.missing.join('、')}`));
 for(const repair of builder.feedback?.repair??[])container.append(node('p',repair));
 const chooseNext=async alternative=>{
  const result=await api('actions',{query:alternative.action,target:builder.target,limit:24});
  const action=result.actions.find(a=>a.id===alternative.action);
  if(action){builder.intent=builder.feedback?.fallback?.intent??builder.slots.intent??builder.intent;builder.choose(action);for(const [name,value]of Object.entries(alternative.slots??{}))if(action.slots?.some(s=>s.name===name))builder.setSlot(name,value);}
 };
 for(const alternative of builder.feedback?.alternatives??[]){
  if(alternative.missing?.length)container.append(node('p',`${alternative.label}：仍需${alternative.missing.join('、')}`));
  if(alternative.kind==='edit')container.append(button(alternative.label,()=>{const slot=builder.action?.slots?.find(s=>alternative.missing?.includes(s.name));builder.step=builder.action?(slot?builderStep(slot):3):0;onChange();}));
  else if(alternative.kind==='clarify')container.append(button(alternative.label,()=>{
   const path=alternative.path.split('.'),slots=structuredClone(builder.slots);let at=slots;
   for(const key of path.slice(0,-1))at=at[key]??={};at[path.at(-1)]=alternative.value;
   builder.slots=slots;builder.invalidate();builder.step=3;onChange();
  }));
  else if(alternative.action)container.append(button(alternative.label,()=>perform(()=>chooseNext(alternative))));
 }
 if(builder.feedback?.fallback?.available)container.append(button(builder.feedback.fallback.label??'就这样做，留下痕迹',()=>perform(async()=>{
  await chooseNext(builder.feedback.fallback);
 })));
 if(builder.error){const error=node('p',builder.error);error.setAttribute('role','alert');container.append(error);}
 container.append(button('取消',()=>{builder.cancel();onClose();}));
}
