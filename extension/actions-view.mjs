// A1 可做之事（06 §6.9.1、08 §8.5）：只读 /actions 的投影；动作经 data.act → world_act 确定性结算，结果按事件流模板显示。
import {ActionBuilder,renderActionBuilder} from './action-builder.mjs';
const views=new WeakMap();
const FEED='fields_event_feed';

function fillText(template,vars){return String(template??'').replace(/\{(\w+)\}/g,(_,k)=>vars[k]??'');}
function sleepUntil(minute){const hour=Math.floor(minute%1440/60);return {dayOffset:hour>=6?1:0,hour:6};}

export async function renderActionsPanel(container,data){
    const doc=container.ownerDocument,state=views.get(container)??{target:null,quick:null,form:null,last:null,token:0};views.set(container,state);
    state.data=data;
    const token=++state.token;container.classList.add('fields-actions');
    if(!data.view){container.textContent='请先在副本上启用新版。';return;}
    const here=await data.api('actions',state.target?{target:state.target}:{});
    if(token!==state.token||!container.isConnected)return;
    const node=(tag,text,className)=>{const e=doc.createElement(tag);if(text!==undefined)e.textContent=String(text);if(className)e.className=className;return e;};
    const rerender=()=>renderActionsPanel(container,state.data);
    const section=(title,parent)=>{const e=node('section',undefined,'fields-actions-section');if(title)e.append(node('h3',title));parent.append(e);return e;};
    const button=(label,onclick,{pressed,className='fields-actions-button',disabled}={})=>{const b=node('button',label,className);b.type='button';if(pressed!==undefined)b.setAttribute('aria-pressed',String(pressed));if(disabled)b.disabled=true;b.onclick=onclick;return b;};
    const fragment=doc.createDocumentFragment();
    // 场景：方位组织的文字
    const scene=section(null,fragment);scene.classList.add('fields-actions-scene');for(const line of here.scene)scene.append(node('p',line));
    // 快捷栏
    const bar=node('nav',undefined,'fields-actions-quick');bar.setAttribute('aria-label','快捷动作');
    for(const q of here.quick)bar.append(button(q.label,()=>{state.quick=state.quick===q.label?null:q.label;state.form=null;state.target=null;
        if(q.label==='观察'){state.quick=null;run({id:q.action,label:'观察四周'},{});return;}rerender();},{pressed:state.quick===q.label}));
    fragment.append(bar);
    const rows=here.actions,byQuick=label=>rows.find(a=>a.quick===label);
    const other=button('其他…',()=>{
        if(state.builder?.busy)return;
        state.builder?.cancel();
        state.form=null;state.quick=null;
        state.builder=new ActionBuilder({preview:data.preview,act:data.act});state.builder.target=here.target?.id;state.builder.minute=data.view.document.state.minute;rerender();
    },{disabled:state.builder?.busy});
    fragment.append(other);
    const openForm=action=>{if(action.blocked){state.last={ok:false,label:action.label,error:action.blocked};state.form=null;rerender();return;}state.form=action;rerender();};
    // 需要对方答应的动作照样列出，但按钮不可用并注明原因（A2 接入人物决策后开放）。
    const actionButton=a=>{const b=button(a.blocked?`${a.label}（${a.blocked}）`:a.label,()=>openForm(a),{disabled:Boolean(a.blocked)});return b;};
    async function run(action,slots){
        const result=await data.act(action.id,slots);
        state.last={label:action.label,...result};state.form=null;
        if(result.ok&&result.read)state.read=result.read;
        rerender();
    }
    // 快捷视图
    if(state.quick){
        const box=section(state.quick,fragment);
        if(state.quick==='交易'){
            const sellers=here.objects.people.filter(p=>p.sells);
            if(!sellers.length)box.append(node('p','这里没人摆出货来卖。','fields-note'));
            for(const p of sellers)box.append(button(`向${p.name}买东西`,()=>{state.target=p.id;state.quick=null;state.pendingAction='core:trade.buy';rerender();}));
        }else if(state.quick==='移动'){
            if(!here.objects.exits.length)box.append(node('p','看不出有别的路。','fields-note'));
            const move=byQuick('移动');
            for(const e of here.objects.exits)box.append(button(`${e.direction}${e.distance}：${e.name}${e.condition?`（${e.condition}）`:''}`,()=>openForm({...move,fill:{...move.fill,destination:e.id}})));
        }else if(state.quick==='账目'){
            const s=data.view.document.state;
            box.append(node('p',`钱袋：${s.player.coins}文`));
            const bag=Object.entries(s.inventory??{}).map(([id,v])=>`${data.labels?.[id]??id}×${typeof v==='number'?v:v?.quantity??0}`).filter(t=>!t.endsWith('×0'));
            box.append(node('p',`行囊：${bag.join('、')||'空'}`));
            for(const a of rows.filter(r=>r.group==='账目'&&r.id!=='core:read'))box.append(button(a.label,()=>openForm(a)));
        }else{
            const action=byQuick(state.quick);
            if(action){if(state.form?.id!==action.id){state.form=action;}}
            else box.append(node('p',state.quick==='制作'?'这里没有能用的作台，或你还没学会合适的配方。':'此刻做不了。','fields-note'));
        }
    }
    // 对某对象可做 / 此处可做
    if(state.target&&here.target){
        const box=section(`对${here.target.name}可做`,fragment);
        box.append(button('返回此处',()=>{state.target=null;state.form=null;rerender();},{className:'fields-actions-back'}));
        for(const s of here.target.soldOut??[])box.append(node('p',`${s.name}已经卖完，下次进货在${s.next}。`,'fields-note'));
        if(!rows.length)box.append(node('p','此刻对这个对象做不了什么。','fields-note'));
        for(const a of rows.filter(a=>a.group!=='交谈'))box.append(actionButton(a));
        const talk=rows.filter(a=>a.group==='交谈');
        if(talk.length){
            const panel=section(`与${here.target.name}交谈`,fragment);panel.setAttribute('aria-label','对话面板');
            const last=data.view.document.state.dialogues?.[here.target.id];if(last?.text)panel.append(node('p',last.text));
            for(const a of talk)panel.append(actionButton(a));
        }
        if(state.pendingAction){const a=rows.find(r=>r.id===state.pendingAction);state.pendingAction=null;if(a)state.form=a;}
    }else if(!state.quick){
        const box=section('此处可做',fragment);
        for(const a of rows.filter(r=>!r.quick))box.append(actionButton(a));
        const people=section('在场的人',fragment);
        if(!here.objects.people.length)people.append(node('p','此处没有旁人。','fields-note'));
        for(const p of here.objects.people)people.append(button(p.activity?`${p.name}（${p.activity}）`:p.name,()=>{state.target=p.id;state.form=null;rerender();}));
        const exits=section('出路',fragment);
        for(const e of here.objects.exits)exits.append(button(`${e.direction}${e.distance}：${e.name}${e.condition?`（${e.condition}）`:''}`,()=>openForm({...rows.find(r=>r.id==='core:move'),fill:{destination:e.id}})));
        const items=section('行囊',fragment);
        if(!here.objects.items.length)items.append(node('p','行囊是空的。','fields-note'));
        for(const i of here.objects.items)items.append(button(`${i.name}×${i.quantity}`,()=>{state.target=i.id;state.form=null;rerender();}));
    }
    // 表单
    if(state.builder){
        const box=node('section');fragment.append(box);
        renderActionBuilder(box,{builder:state.builder,here,api:data.api,onChange:rerender,
            onClose:()=>{state.builder=null;rerender();},onResult:(result,action)=>{
                state.last={label:action.label,...result};
                if(result.ok)state.builder=null;
            }});
    }
    if(state.form&&!state.builder){
        const action=state.form,form=node('form',undefined,'fields-actions-form');form.setAttribute('aria-label',action.label);
        form.append(node('h3',action.label));if(action.hint)form.append(node('p',action.hint,'fields-note'));
        const inputs=[];
        for(const slot of action.slots){
            if(slot.name==='consent')continue;// 同意由对方决定，不是玩家能填的槽位
            const filled=action.fill?.[slot.name];
            if(slot.kind==='object'&&slot.default!=='dawn')continue;
            if(slot.kind==='object'){inputs.push({slot,read:()=>sleepUntil(data.view.document.state.minute)});continue;}
            const label=node('label',slotLabel(slot)),id=`fields-slot-${slot.name}`;label.htmlFor=id;
            let input;
            if(slot.options){input=node('select');input.id=id;if(!slot.required)input.append(new Option('（不填）',''));for(const o of slot.options)input.append(new Option(o.label,o.value));input.value=filled??slot.default??(slot.required?slot.options[0]?.value:'')??'';}
            else if(slot.kind==='flag'){input=node('input');input.type='checkbox';input.id=id;input.checked=Boolean(filled);}
            else if(['quantity','coins','minutes'].includes(slot.kind)){input=node('input');input.type='number';input.min='1';input.inputMode='numeric';input.id=id;input.value=filled??slot.default??'';}
            else{input=node('input');input.type='text';input.id=id;input.value=filled??'';}
            if(filled!==undefined&&!slot.options&&slot.kind==='entity'){inputs.push({slot,read:()=>filled});continue;}
            form.append(label,input);
            if(slot.presets){const presets=node('div',undefined,'fields-actions-presets');for(const p of slot.presets)presets.append(button(String(p),()=>{input.value=p;},{className:'fields-actions-preset'}));form.append(presets);}
            inputs.push({slot,read:()=>slot.kind==='flag'?(input.checked||undefined):['quantity','coins','minutes'].includes(slot.kind)?(input.value===''?undefined:Number(input.value)):(input.value===''?undefined:input.value)});
        }
        const submit=node('button','确定','fields-actions-submit');submit.type='submit';
        const cancel=button('算了',()=>{state.form=null;rerender();},{className:'fields-actions-back'});
        form.append(submit,cancel);
        form.onsubmit=event=>{event.preventDefault();submit.disabled=true;
            const slots={};for(const {slot,read}of inputs){const v=read();if(v!==undefined)slots[slot.name]=v;}
            const chosen=action.slots.find(s=>s.options&&s.name==='debt')?.options?.find(o=>o.value===slots.debt);if(chosen?.fill)Object.assign(slots,chosen.fill);
            run(action,slots);};
        fragment.append(form);
    }
    // 事件流
    const stream=section('事件流',fragment);stream.classList.add('fields-actions-stream');stream.setAttribute('aria-live','polite');
    if(state.last){
        const entry=node('div',undefined,state.last.ok?'fields-actions-entry':'fields-actions-entry fields-actions-refused');
        if(state.last.ok)for(const line of state.last.lines)entry.append(node('p',line));
        else entry.append(node('p',fillText(here.texts?.refused??'没能{label}：{reason}',{label:state.last.label,reason:state.last.error})));
        stream.append(entry);
    }
    if(state.read){const entry=node('div',undefined,'fields-actions-entry');entry.append(node('pre',JSON.stringify(state.read,null,1).slice(0,2000)));stream.append(entry);state.read=null;}
    const feed=(data.getChatContext?.().chatMetadata?.[FEED]??[]).slice(-10).reverse();
    for(const [index,row]of feed.entries()){if(index===0&&state.last?.ok)continue;const entry=node('div',undefined,'fields-actions-entry fields-actions-old');for(const line of row.lines)entry.append(node('p',line));stream.append(entry);}
    if(!state.last&&!feed.length)stream.append(node('p','还没有做过什么。','fields-note'));
    container.replaceChildren(fragment);
}
const NAMES={seller:'对方',buyer:'买主',target:'对象',item:'物品',quantity:'数量',coins:'钱数（文）',minutes:'时长（分钟）',days:'天数',destination:'去处',mode:'走法',recipe:'配方',skill:'技能',
    activity:'做什么',debt:'哪一笔账',payment:'付款方式',creditMinutes:'赊账期限（分钟）',intent:'怎么出手',weapon:'用什么',section:'看哪一项',helpers:'帮手',instance:'哪一件',repairPlan:'修法'};
function slotLabel(slot){return `${NAMES[slot.name]??slot.name}${slot.required?'':'（可不填）'}`;}
