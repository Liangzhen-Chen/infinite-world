// Local, model-free composition. Only action ids and declared slots cross the
// execution boundary; a preview receipt is never executable input.
export const BUILDER_STEPS=['做什么','对谁或何物','用什么','怎么做'];
const implementsSlot=new Set(['item','weapon','skill','spell','recipe','instance','tool','material']);
const effectNames={transfer:'交付物品或款项',move:'移动',learn:'学习',vital:'身体变化',time:'时间推进',status:'状态变化',emit:'表达或请求',create:'留下实体','fact.set':'对象变化','holding.open':'建立关系','holding.close':'结束关系','obligation.create':'订立约定','obligation.fulfill':'履行约定','obligation.close':'结束约定',schedule:'预约行动',transition:'身份变化',invoke:'施展能力'};
export function builderStep(slot){
 if(implementsSlot.has(slot.name))return 2;
 if(slot.kind==='entity')return 1;
 return 3;
}
export function slotLabel(slot){
 const names={seller:'向谁',buyer:'交给谁',target:'对象',destination:'去处',item:'物品',weapon:'武器',skill:'技能',spell:'法术',recipe:'配方',instance:'哪一件',
 quantity:'数量',coins:'钱数（文）',minutes:'时长（分钟）',days:'天数',mode:'走法',intent:'出手方式',activity:'做什么',payment:'付款方式',creditMinutes:'赊账期限（分钟）',until:'等到',debt:'哪笔账'};
 return names[slot.name]??slot.name;
}
export function previewLines(result,{label='这样做',startMinute}={}){
 const receipt=result?.receipt??result?.result?.receipt;
 if(!receipt)return ['尚未取得预览，不能确认。'];
 const legacy=receipt.legacy,lines=[`这相当于：${label}`,`路由：${receipt.routed??'尚未确定'}`];
 const elapsed=receipt.cost?.time??legacy?.elapsed??legacy?.minutes??(Number.isSafeInteger(startMinute)&&Number.isSafeInteger(legacy?.minute)?legacy.minute-startMinute:null);
 lines.push(`耗时：${Number.isFinite(elapsed)?`${elapsed}分钟`:'尚未提供'}`);
 if(Number.isFinite(legacy?.cost))lines.push(`费用：${legacy.cost}文`);
 else if(receipt.cost?.resources?.length)lines.push(`资源代价：${receipt.cost.resources.map(r=>`${r.qty??r.quantity??''}份物品或款项`).join('；')}`);
 else lines.push('费用：以确认时的实际裁决为准');
 const check=receipt.check;
 lines.push(`难度：${check?.difficulty??check?.dc??(check?'按当前对抗裁决':'本次回执未提供检定难度')}`);
 for(const notice of legacy?.notices??[])if(notice.text)lines.push(`预计：${notice.text}`);
 if(receipt.applied?.length)lines.push(`预计效果：${receipt.applied.map(e=>effectNames[e.op]??'其他世界变化').join('、')}`);
 for(const c of receipt.consequences??[])lines.push(`后果：${typeof c==='string'?c:c.reason??c.tags?.join('、')??c.type??'确认时重新裁决'}`);
 lines.push('预览尚未发生；见证、同意与法律后果以引擎实际提供的裁决为准。');
 return lines;
}

export class ActionBuilder{
 constructor({preview,act,newEventId=()=>`ui_${crypto.randomUUID()}`}){
  this.services={preview,act,newEventId};this.step=0;this.action=null;this.slots={};this.revision=0;this.busy=false;this.cancelled=false;this.quote=null;this.error=null;this.result=null;
 }
 choose(action){
  this.action=structuredClone(action);this.slots={...action.fill};
  for(const slot of action.slots??[])if(this.slots[slot.name]===undefined&&slot.default!==undefined&&typeof slot.default!=='object'&&slot.default!=='dawn')this.slots[slot.name]=slot.default;
  this.invalidate();this.step=1;
 }
 invalidate(){this.revision++;this.quote=null;this.eventId=null;this.result=null;this.error=null;}
 setSlot(name,value){
  if(!this.action?.slots.some(s=>s.name===name&&s.name!=='consent'))throw Error('这个动作没有此项选择');
  if(value===undefined||value==='')delete this.slots[name];else this.slots[name]=structuredClone(value);
  this.invalidate();
 }
 // New target stock/options come from a fresh /actions projection. Retain only
 // choices still offered, including when the same item exists in two shops.
 refresh(action){
  this.action=structuredClone(action);
  for(const slot of action.slots??[])if(slot.options&&this.slots[slot.name]!==undefined&&!slot.options.some(o=>o.value===this.slots[slot.name]))delete this.slots[slot.name];
  this.invalidate();
 }
 async preview(){
  if(this.busy||this.cancelled)return null;
  if(!this.action)throw Error('先选想做的事');
  this.error=null;this.result=null;this.quote=null;
  const missing=this.action.slots.filter(s=>s.required&&!s.consent&&this.slots[s.name]===undefined);
  if(missing.length){this.error=`还需要选择：${missing.map(slotLabel).join('、')}`;return null;}
  const revision=this.revision,args={action:this.action.id,slots:structuredClone(this.slots)},eventId=this.eventId??=this.services.newEventId();
  this.busy=true;
  try{
   const result=await this.services.preview(args.action,args.slots,eventId);
   if(this.cancelled||revision!==this.revision)return null;
   if(result?.ok===false)throw Error(result.error??'未能取得预览');
   const receipt=result?.receipt??result?.result?.receipt;
   if(receipt?.status!=='preview')throw Error('未取得可确认的预览');
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
   try{const result=await api('actions',{query,target:builder.target??here.target?.id,limit:24});if(!builder.cancelled)builder.matches=result.actions;}
   finally{builder.busy=false;}
  });};
  const choices=(builder.matches??here.actions).filter(a=>!a.readOnly);
  if(!choices.length)container.append(node('p','换个说法找相近动作，或返回对象菜单选择。'));
  for(const a of choices)container.append(button(a.label,()=>{builder.choose(a);onChange();}));
 }else{
  container.append(node('h4',`${BUILDER_STEPS[builder.step]}：${builder.action.label}`));
  const slots=builder.action.slots.filter(s=>s.name!=='consent'&&builderStep(s)===builder.step);
  if(!slots.length)container.append(node('p',builder.step===1?'作用于自己或此处。':builder.step===2?'不需要另选物品或技能。':'采用这个动作原有的做法。'));
  for(const slot of slots){
   const label=node('label',`${slotLabel(slot)}${slot.required?'':'（可不填）'}`),id=`fields-builder-${slot.name}`;label.htmlFor=id;
   container.append(label);
   if(slot.kind==='object'){
    if(slot.default==='dawn')container.append(button('等到明早',()=>{const hour=Math.floor((builder.minute??0)%1440/60);builder.setSlot(slot.name,{dayOffset:hour>=6?1:0,hour:6});onChange();}));
    else container.append(node('p','可改用本动作的时长或其他选项。'));
    continue;
   }
   let input;
   if(slot.options||slot.kind==='entity'){
    input=node('select');const empty=node('option',slot.required?'请选择':'（不填）');empty.value='';input.append(empty);
    for(const option of slot.options??[]){const o=node('option',option.label);o.value=option.value;input.append(o);}
   }else{
    input=node('input');input.type=['quantity','coins','minutes'].includes(slot.kind)?'number':slot.kind==='flag'?'checkbox':'text';
    if(input.type==='number'){input.min='1';input.step='1';input.inputMode='numeric';}
   }
   input.id=id;input.required=Boolean(slot.required);input.disabled=builder.busy;
   if(input.type==='checkbox')input.checked=Boolean(builder.slots[slot.name]);else input.value=builder.slots[slot.name]??'';
   input.onchange=()=>{
    builder.setSlot(slot.name,input.type==='checkbox'?(input.checked||undefined):input.type==='number'?(input.value===''?undefined:Number(input.value)):input.value);
    if(builder.step===1&&input.value)perform(async()=>{
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
   for(const line of previewLines(builder.quote.result,{label:builder.action.label,startMinute:builder.quote.result.startMinute}))box.append(node('p',line));
   container.append(box,button('确认执行',()=>perform(async()=>{const result=await builder.confirm();if(result)onResult(result,builder.action);}))); 
  }else if(builder.step===3)container.append(button('预览代价与结果',()=>perform(()=>builder.preview())));
  if(builder.step<3)container.append(button('下一步',()=>{builder.step++;onChange();}));
  container.append(button('上一步',()=>{builder.step--;builder.quote=null;onChange();}));
 }
 if(builder.error){const error=node('p',builder.error);error.setAttribute('role','alert');container.append(error);}
 container.append(button('取消',()=>{builder.cancel();onClose();}));
}
