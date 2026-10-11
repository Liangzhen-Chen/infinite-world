// A view of the current ledger and its active receipts; never a second state store.
export function renderLedger(container,state,labels,events,time=''){
    const doc=container.ownerDocument;
    const element=(tag,text,className)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=String(text);if(className)node.className=className;return node;};
    const name=id=>labels[id]??state.created?.[id]?.name??'未命名对象';
    const section=(title,empty)=>{const node=element('section',undefined,'fields-ledger-section');node.append(element('h3',title));if(empty)node.append(element('p',empty,'fields-note'));return node;};
    const list=(section,rows,empty)=>{if(!rows.length){section.append(element('p',empty,'fields-note'));return;}const ul=element('ul');for(const text of rows)ul.append(element('li',text));section.append(ul);};
    const fragment=doc.createDocumentFragment(),p=state.player;
    const intro=element('div',undefined,'fields-ledger-intro');intro.append(element('p',time,'fields-note'),element('h3',p.name),element('p',`${name(state.location)} · ${p.level}级 · ${p.status}`));fragment.append(intro);
    const overview=section('当前状态');
    const balances=element('dl',undefined,'fields-ledger-stats');
    for(const [label,value]of [['钱袋',`${p.coins} 铜`],['经验',p.xp],['待分配属性点',p.freeAttributePoints??0]]){const cell=element('div');cell.append(element('dt',label),element('dd',value));balances.append(cell);}overview.append(balances);
    const vitals=element('div',undefined,'fields-ledger-vitals');
    for(const [label,value,maximum,className]of [['生命',p.hp,p.maxHp,'fields-hp'],['魔力',p.mp,p.maxMp,'fields-mp']]){const row=element('div',undefined,className);row.append(element('p',`${label} ${value} / ${maximum}`));const bar=element('progress');bar.max=Math.max(1,maximum);bar.value=value;bar.setAttribute('aria-label',`${label} ${value} / ${maximum}`);row.append(bar);vitals.append(row);}overview.append(vitals);
    const attributes=element('dl',undefined,'fields-ledger-attributes');
    for(const [key,value]of Object.entries(p.attributes??{})){const cell=element('div');cell.append(element('dt',key),element('dd',value));attributes.append(cell);}overview.append(attributes);
    const companions=(p.companions??[]).map(name);if(companions.length)overview.append(element('p',`同行：${companions.join('、')}`));fragment.append(overview);
    const inventory=section('随身行囊');list(inventory,Object.entries(state.inventory??{}).filter(([,row])=>row.quantity>0).map(([id,row])=>`${name(id)} × ${row.quantity}${row.durability!==undefined?` · 耐久 ${row.durability}`:''}`),'行囊为空。');fragment.append(inventory);
    const skills=Object.entries(state.skills??{});if(skills.length){const learned=section('已学技能');list(learned,skills.map(([id,row])=>`${name(id)} · 熟练度 ${row.proficiency}`));fragment.append(learned);}
    const commitments=section('任务与约定'),rows=[];
    for(const row of Object.values(state.records??{})){
        if(row.category==='debt'&&row.debtor==='player')rows.push({due:row.deadline,text:`欠款：${name(row.creditor)} · 未还 ${row.amount-row.paid}铜 · ${row.status}${row.status==='待偿还'?` · ${Math.max(0,row.deadline-state.minute)}分钟后到期`:''}`});
        if(row.category==='contract'&&row.room&&row.parties?.includes('player'))rows.push({due:row.expires,text:`住宿：${row.name} · ${row.status}${row.status==='有效'?` · ${Math.max(0,row.expires-state.minute)}分钟后到期`:''}`});
    }
    for(const [key,label]of [['obligations','约定'],['quests','任务']])for(const row of Object.values(state[key]??{}))rows.push({due:row.deadline,text:`${label}：${row.content??row.name} · ${row.status}`});
    rows.sort((a,b)=>(a.due??Infinity)-(b.due??Infinity));list(commitments,rows.map(row=>row.text),'暂无已登记的任务或约定。');fragment.append(commitments);
    const recent=section('近期变化');recent.classList.add('fields-ledger-recent');recent.append(element('p','仅显示已提交的变化，最近的在前。回复审查提示保留在对应消息旁。','fields-note'));
    const receipts=(events??[]).filter(event=>event.notices?.length).slice(-8).reverse();
    if(!receipts.length)recent.append(element('p','暂无已提交的变化。','fields-note'));
    for(const event of receipts){const group=element('div',undefined,'fields-ledger-receipt');list(group,event.notices.map(notice=>notice.text));recent.append(group);}
    if((events??[]).filter(event=>event.notices?.length).length>8)recent.append(element('p','显示最近 8 次变化；更早的变化可在聊天记录中查看。','fields-note'));fragment.append(recent);
    container.replaceChildren(fragment);
}
