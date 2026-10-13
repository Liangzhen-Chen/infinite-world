const pending=new WeakMap();
const value=number=>number??'未知';
const kg=number=>number===null?'未知':`${Number(number.toFixed(3))}公斤`;

export function renderPersonalPanel(container,data,kind){
    const doc=container.ownerDocument,fragment=doc.createDocumentFragment();
    const node=(tag,text,className)=>{const element=doc.createElement(tag);if(text!==undefined)element.textContent=String(text);if(className)element.className=className;return element;};
    const section=(title)=>{const element=node('section',undefined,'fields-personal-section');element.append(node('h3',title));fragment.append(element);return element;};
    const stats=(parent,rows)=>{const list=node('dl',undefined,'fields-personal-stats');for(const [title,text]of rows){const cell=node('div');cell.append(node('dt',title),node('dd',value(text)));list.append(cell);}parent.append(list);};
    const bar=(parent,title,amount,maximum)=>{parent.append(node('p',title));const progress=node('progress');progress.max=Math.max(1,maximum);progress.value=amount;progress.setAttribute('aria-label',title);parent.append(progress);};
    const provenance=(parent,row)=>{parent.append(node('p',`来源：${row.source.name}${row.source.author?` · 作者 ${row.source.author}`:''}${row.source.edition?` · 版本 ${row.source.edition}`:''}`,'fields-note'));if(row.learnedAt!==null)parent.append(node('p',`学会于第${Math.floor(row.learnedAt/1440)+1}天`,'fields-note'));};
    if(kind==='character'){
        const p=data.player,overview=section(p.name);overview.append(node('p',`${p.level}级 · ${p.status}`));
        stats(overview,[['生命',`${value(p.hp)} / ${value(p.maxHp)}`],['魔力',`${value(p.mp)} / ${value(p.maxMp)}`],['钱袋',`${p.coins}铜`],['待分配属性点',p.freeAttributePoints]]);
        if(p.nextLevelXp!==null)bar(overview,`经验 ${p.xp} / ${p.nextLevelXp} · 距${p.level+1}级还需${Math.max(0,p.nextLevelXp-p.xp)}`,p.xp,p.nextLevelXp);
        else overview.append(node('p',`已达${p.levelMaximum}级上限`));
        stats(section('个人属性'),Object.entries(p.attributes));
        const careers=section('职业与认证');
        if(!data.professions.length)careers.append(node('p','尚无已认证职业。','fields-note'));
        for(const role of data.professions){const card=node('article',undefined,'fields-personal-card');card.append(node('h4',role.name),node('p',`${{combat:'战斗职业',life:'生活职业',hidden:'隐藏职业'}[role.kind]??'职业'} · 已认证`));
            card.append(node('p',role.certification?`认证导师：${role.certification.teacher}`:'认证来源未记录','fields-note'));
            for(const promotion of role.promotions)card.append(node('p',`${promotion.level}级升职：${promotion.name} · 导师 ${promotion.teacher}`));
            if(role.nextPromotion!==null)card.append(node('p',`下次升职考核：${role.nextPromotion}级`));careers.append(card);}
    }else if(kind==='skills'){
        const list=section('已学技能');if(!data.skills.length)list.append(node('p','尚无已学技能。','fields-note'));
        for(const skill of data.skills){const card=node('article',undefined,'fields-personal-card');card.append(node('h4',skill.name),node('p',`${skill.grade}${skill.profession?` · ${skill.profession}`:''}`));
            card.append(node('p',skill.description));bar(card,`熟练度 ${skill.proficiency} · 阶段 ${skill.stageStart}–${skill.stageEnd}`,skill.proficiency-skill.stageStart,skill.stageEnd-skill.stageStart);
            card.append(node('p',`有效熟练度 ${skill.effectiveProficiency} · 每日练习增量上限 ${value(skill.dailyCap)}`));
            card.append(node('p',skill.breakthroughHint,skill.needsBreakthrough?'fields-personal-breakthrough':'fields-note'));provenance(card,skill);list.append(card);}
    }else if(kind==='spells'){
        const list=section('已学法术');if(!data.spells.length)list.append(node('p','法术书尚无已学法术。','fields-note'));
        for(const spell of data.spells){const card=node('article',undefined,'fields-personal-card');card.append(node('h4',spell.name),node('p',spell.effect));
            stats(card,[['魔力消耗',spell.mp],['施法时间',spell.minutes===null?'未知':`${spell.minutes}分钟`],['持续时间',spell.duration===null?'未记录':`${spell.duration}分钟`],['关联技能',spell.skill]]);
            card.append(node('p',`材料：${spell.materials.length?spell.materials.map(row=>`${row.name}${row.quantity===null?'':` × ${row.quantity}`}`).join('、'):'无'}`));provenance(card,spell);list.append(card);}
    }else if(kind==='inventory'){
        const load=section('随身负重');load.append(node('p',`${data.load.unknownStacks?'已知负重':'总负重'}：${kg(data.load.knownKg)}${data.load.unknownStacks?` · ${data.load.unknownStacks}组物品重量未知`:''}`));
        const list=section('格子行囊'),grid=node('div',undefined,'fields-personal-grid');list.append(grid);
        if(!data.inventory.length)grid.append(node('p','行囊为空。','fields-note'));
        const details=(parent,row)=>{parent.append(node('p',`品质：${row.quality} · 耐久 ${value(row.durability)} / ${value(row.maxDurability)}`),node('p',`做工：${row.workmanship??'未知'} · 制作者：${row.maker??'未知'}`,'fields-note'));};
        for(const item of data.inventory){const card=node('article',undefined,'fields-personal-slot');card.dataset.fieldsQuality=item.quality;card.append(node('h4',`${item.name} × ${item.quantity}`),node('p',`单重 ${kg(item.weight)} · 合计 ${kg(item.totalWeight)}`));
            if(item.untrackedQuantity){details(card,item);if(item.instances.length)card.append(node('p',`未单件登记 ${item.untrackedQuantity}件`,'fields-note'));}
            for(const [index,unit]of item.instances.entries()){const detail=node('details');detail.dataset.fieldsQuality=unit.quality;detail.append(node('summary',`第${index+1}件 · ${unit.quality} · ${unit.workmanship??'做工未知'}`));details(detail,unit);card.append(detail);}
            card.append(node('p',item.description,'fields-note'));grid.append(card);}
    }
    container.classList.add('fields-personal');container.replaceChildren(fragment);
}

export function registerPersonalPanels({registerPanel}){
    for(const [id,title]of [['character','角色'],['skills','技能'],['spells','法术书'],['inventory','行囊']])registerPanel({id,title,render:async(container,context)=>{
        const request={};pending.set(container,request);container.textContent='正在读取个人信息…';
        try{
            const data=await context.api('ui/personal');
            if(container.isConnected&&pending.get(container)===request)renderPersonalPanel(container,data,id);
        }catch{
            if(container.isConnected&&pending.get(container)===request)container.textContent='个人信息读取失败，请关闭面板后重试。';
        }
    }});
}
