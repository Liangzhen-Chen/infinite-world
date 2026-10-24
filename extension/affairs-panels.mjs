const pending=new WeakMap(),filters=new WeakMap();
const value=row=>row??'未登记';
const direction={outgoing:'我发出的',incoming:'我收到的'};

export function renderAffairsPanel(container,data,kind,context=null){
    const doc=container.ownerDocument,fragment=doc.createDocumentFragment();
    const node=(tag,text,className)=>{const e=doc.createElement(tag);if(text!==undefined)e.textContent=String(text);if(className)e.className=className;return e;};
    const section=(title,parent=fragment)=>{const e=node('section',undefined,'fields-affairs-section');e.append(node('h3',title));parent.append(e);return e;};
    const stats=(parent,rows)=>{const dl=node('dl',undefined,'fields-affairs-stats');for(const [label,text]of rows){const cell=node('div');cell.append(node('dt',label),node('dd',value(text)));dl.append(cell);}parent.append(dl);};
    const card=(parent,title)=>{const e=node('article',undefined,'fields-affairs-card');e.append(node('h4',title));parent.append(e);return e;};
    const note=(parent,text)=>parent.append(node('p',text,'fields-note'));
    const execute=async(action,slots,status,button)=>{
        button.disabled=true;status.textContent='正在办理…';
        try{
            const out=await context.act(action,slots);
            if(out?.ok===false||out?.result?.receipt?.status==='rejected')throw Error(out.error??out.result?.receipt?.reason??'办理未完成');
            const updated=await context.api('ui/affairs');
            if(container.isConnected)renderAffairsPanel(container,updated,kind,context);
        }catch(error){status.textContent=error.message;button.disabled=false;}
    };
    note(fragment,`记录时点：${data.time??'未登记'}`);
    if(kind==='tasks'||kind==='obligations'){
        if(kind==='tasks'){
            const quota=section(`${data.quota.time??`第${data.quota.month}月`}发布额度`);
            stats(quota,[['额度',data.quota.limitD===null?'未登记':`${data.quota.limitD}个D级单位`],['已用',data.quota.usedD===null?'未登记':`${data.quota.usedD}个D级单位`],['剩余',data.quota.remainingD===null?'未登记':`${data.quota.remainingD}个D级单位`]]);
            if(data.quota.limitD===null)note(quota,'尚无玩家发布额度记录。');
            if(data.quota.personal)note(quota,'私人身份可自费发布D级委托；上方额度用于官职任务。');
            note(quota,`任务等级折算：${Object.entries(data.quota.units).map(([grade,units])=>`${grade}级 ${units}个D级单位`).join('，')}`);
            if(context?.act){
                const posting=section('发布委托'),form=node('form',undefined,'fields-affairs-form'),fields={};
                const input=(label,key,type,initial)=>{
                    const wrap=node('label',label),field=node('input');field.type=type;field.name=key;field.setAttribute('aria-label',label);field.value=initial;
                    fields[key]=field;wrap.append(field);form.append(wrap);return field;
                };
                const select=(label,key,options)=>{
                    const wrap=node('label',label),field=node('select');field.setAttribute('aria-label',label);
                    for(const [value,text]of options){const option=node('option',text);option.value=value;field.append(option);}field.value=options[0][0];fields[key]=field;wrap.append(field);form.append(wrap);return field;
                };
                input('委托内容','content','text','').required=true;
                select('发单身份','personal',[['true','私人自费'],['false','任职额度']]);
                select('任务等级','grade',Object.keys(data.quota.units).map(g=>[g,`${g}级`]));fields.grade.value='D';
                const reward=input('报酬（铜）','reward','number',20);reward.min=20;reward.max=1000000;reward.required=true;
                select('完成条件','objective',[['visit','抵达地点'],['deliver','交付物品']]);
                input('目的地','location','text',data.location?.name??'').required=true;
                const item=input('交付物品','item','text',''),quantity=input('交付数量','quantity','number',1);quantity.min=1;
                const toggle=()=>{item.disabled=quantity.disabled=fields.objective.value!=='deliver';item.required=!item.disabled;};fields.objective.onchange=toggle;toggle();
                const hours=input('期限（小时）','hours','number',24);hours.min=1;hours.max=720;hours.required=true;
                input('公款来源聚落（自费留空）','settlement','text','');
                const submit=node('button','发布并托管报酬'),status=node('p','','fields-note');submit.type='submit';form.append(submit,status);
                form.onsubmit=event=>{
                    event.preventDefault();
                    const objective={type:fields.objective.value,location:fields.location.value};
                    if(objective.type==='deliver')Object.assign(objective,{item:item.value,quantity:Number(quantity.value)});
                    const slots={publisher:'player',personal:fields.personal.value==='true',grade:fields.grade.value,reward:Number(reward.value),content:fields.content.value,objective,deadline:data.minute+Number(hours.value)*60};
                    if(!slots.personal&&fields.settlement.value.trim())slots.settlement=fields.settlement.value.trim();
                    return execute('core:quest.publish',slots,status,submit);
                };
                posting.append(form);
            }
        }
        const current=filters.get(container)??{direction:'all',status:'active'},controls=node('div',undefined,'fields-affairs-filters');
        const control=(label,key,options)=>{
            const wrap=node('label',label),select=node('select');select.setAttribute('aria-label',label);
            for(const [id,text]of options){const option=node('option',text);option.value=id;select.append(option);}select.value=current[key];
            select.onchange=()=>{filters.set(container,{...current,[key]:select.value});renderAffairsPanel(container,data,kind,context);};wrap.append(select);controls.append(wrap);
        };
        control('收发方向','direction',[['all','全部'],['incoming','我收到的'],['outgoing','我发出的']]);
        control('履约状态','status',[['active','未结束'],['all','全部'],['closed','已结束']]);fragment.append(controls);
        const list=section(kind==='tasks'?'任务，按期限排列':'义务与合同，按期限排列');
        const rows=data[kind].filter(row=>(current.direction==='all'||row.direction===current.direction)&&(current.status==='all'||row.active===(current.status==='active')));
        if(!rows.length)note(list,'当前筛选下暂无已登记事项。');
        for(const row of rows){
            const e=card(list,row.content);e.dataset.affairId=row.id;
            e.append(node('p',`${row.kind} · ${direction[row.direction]} · ${row.counterparty} · ${row.status}`));
            const due=node('p',row.deadlineText?`期限：${row.deadlineText}${row.overdue?' · 已到期':''}`:'期限未登记',row.overdue?'fields-affairs-due':'fields-note');e.append(due);
            if(row.grade!==undefined)stats(e,[['等级',row.grade],['报酬',row.reward===null?'未登记':`${row.reward}铜`]]);
            if(row.escrow!==undefined)stats(e,[['托管',row.escrow],['已付报酬',row.rewardPaid],['已退款',row.refund]].map(([label,amount])=>[label,amount===null?'未登记':`${amount}铜`]));
            if(row.outstanding!==undefined)stats(e,[['未偿金额',row.outstanding===null?'未登记':`${row.outstanding}铜`]]);
            if(row.item)note(e,`交付：${row.item} × ${value(row.quantity)}`);
            if(row.coins!==undefined&&row.coins!==null)note(e,`约定付款：${row.coins}铜`);
            if(row.kindName)note(e,`合同类型：${{lease:'铺面租约',hire:'雇工',procurement:'采购',sale:'销售'}[row.kindName]??'其他合同'}`);
            if(row.quantity!==undefined&&row.kind==='合同')stats(e,[['约定数量',row.quantity],['已履行',row.fulfilled],['费用',row.cost===null?'未登记':`${row.cost}铜`],['实付',row.paid===null?'未登记':`${row.paid}铜`]]);
            if(row.reason)note(e,`原因：${row.reason}`);
            if(kind==='tasks'&&row.active&&context?.act){
                const status=node('p','','fields-note'),cancel=node('button','取消委托');cancel.type='button';cancel.onclick=()=>execute('core:quest.cancel',{quest:row.id},status,cancel);e.append(cancel);
                if(row.direction==='incoming'&&row.status==='进行中'){const complete=node('button','交付并结算');complete.type='button';complete.onclick=()=>execute('core:quest.complete',{quest:row.id},status,complete);e.append(complete);}
                e.append(status);
            }
        }
    }else if(kind==='territory'){
        const offices=section('席位与任职申请');
        if(!data.offices?.length&&!data.officeApplications?.length)note(offices,'当前没有本人的任职申请或此处的正式席位。');
        for(const office of data.offices??[]){const e=card(offices,office.name);stats(e,[['现任',office.holder??'空缺'],['办公处',office.seat],['接待',office.onDuty?'在岗':'当前不在岗'],['职责',office.scope]]);for(const limit of office.limits??[])note(e,limit);if(office.applyAt)note(e,`可到${office.applyAt}申请任职；申请、审定和正式任命分别登记。`);}
        for(const application of data.officeApplications??[]){const e=card(offices,application.name);stats(e,[['申请状态',application.status],['审定时点',application.deadlineText]]);if(application.reasons.length)note(e,application.reasons.join('；'));}
        const owned=data.settlements.filter(row=>row.scope==='owned'),assets=section('已登记领地与资产');
        if(!owned.length)note(assets,'尚无已登记的玩家领地。');
        if(!data.holdings.length)note(assets,'尚无归本人所有的建筑。');
        for(const row of data.holdings){const e=card(assets,row.name);stats(e,[['建筑状况',row.condition]]);}
        for(const row of data.settlements){
            const area=section(`${row.name} · ${row.scope==='owned'?'本人领地':'本地公共事务'}`);
            if(row.scope==='public')note(area,'此处为所在地的公共账目，未登记为本人领地。');
            if(row.head)note(area,`主官：${row.head}`);
            stats(area,[['人口',row.population],['户数',row.households],['公库',row.stock.treasury===null?'未登记':`${row.stock.treasury}铜`],['粮食',row.stock.food===null?'未登记':`${row.stock.food}粮单位`],['种粮',row.stock.seed===null?'未登记':`${row.stock.seed}粮单位`],['木料',row.stock.wood],['石料',row.stock.stone],['铁料',row.stock.iron]]);
            const finance=section('累计实际收支',area);
            if(!row.fiscal)note(finance,'尚无已登记收支明细。');
            else stats(finance,[['销售总收款',row.fiscal.salesGrossCopper],['销售净收入',row.fiscal.salesNetCopper],['实收税款',row.fiscal.taxReceiptsCopper],['在途预付款',row.fiscal.advanceCopper],['采购支出',row.fiscal.purchasesCopper]].map(([label,amount])=>[label,amount===null?'未登记':`${amount}铜`]));
            const works=section('工程',area);if(!row.projects.length)note(works,'尚无已登记工程。');
            for(const project of row.projects){const e=card(works,project.name??'名称未登记');e.append(node('p',project.status??'状态未登记'));stats(e,[['剩余工期',project.remainingDays===null?'未登记':`${project.remainingDays}天`],['投入木料',project.wood],['投入石料',project.stone]]);}
            const queue=section('待办与待批事项',area);if(!row.pending.length)note(queue,'尚无已登记待办或待批事项。');
            for(const request of row.pending){const e=card(queue,request.name);e.append(node('p',request.status));note(e,request.deadlineText?`办理期限：${request.deadlineText}`:'办理期限未登记');if(request.reason)note(e,request.reason);}
            const reports=section('管事报告',area);if(!row.reports.length)note(reports,'尚无已登记管事报告。');
            for(const report of row.reports){const e=card(reports,`${report.steward} · ${report.status}`);note(e,report.time??'报告时间未登记');if(report.reason)note(e,report.reason);
                if(report.report)stats(e,[['报告时公库',report.report.treasury===null?'未登记':`${report.report.treasury}铜`],['报告时木料',report.report.wood],['报告时石料',report.report.stone]]);}
        }
        if(!data.settlements.length)note(assets,'当前位置没有可查看的公共账目。');
    }
    container.classList.add('fields-affairs');container.replaceChildren(fragment);
}

export function registerAffairsPanels({registerPanel}){
    for(const [id,title]of [['tasks','任务'],['obligations','约定'],['territory','领地']])registerPanel({id,title,render:async(container,context)=>{
        const request={};pending.set(container,request);container.textContent='正在读取事务记录…';
        try{const data=await context.api('ui/affairs');if(container.isConnected&&pending.get(container)===request)renderAffairsPanel(container,data,id,context);}
        catch{if(container.isConnected&&pending.get(container)===request)container.textContent='事务记录读取失败，请关闭面板后重试。';}
    }});
}
