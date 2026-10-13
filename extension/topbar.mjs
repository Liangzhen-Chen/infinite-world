export function moneyText(coins){
    return `${Math.floor(coins/10000)}金 ${Math.floor(coins%10000/100)}银 ${coins%100}铜`;
}
export function renderTopbar(container,overview,blocked=null){
    const doc=container.ownerDocument,make=(tag,text)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
    container.replaceChildren();container.className='fields-topbar';
    const context=make('div');context.className='fields-topbar-context';
    const {date,weather,player:p}=overview;
    context.append(make('span',`${date.daylight?'☀ 白昼':'☾ 夜间'} · ${date.text} · ${date.period}`),
        make('span',weather?`${weather.name} ${weather.temperatureC}℃${weather.indoors?' · 室内':''}`:'天气未记录'),make('span',overview.locationPath.join(' › ')||'地点未记录'));
    const status=make('div');status.className='fields-topbar-vitals';
    status.append(make('span',`${p.name} · ${p.level}级`),make('span',`钱袋 ${moneyText(p.coins)}`));
    for(const [label,value,max,kind]of [['生命',p.hp,p.maxHp,'hp'],['魔力',p.mp,p.maxMp,'mp']]){
        const group=make('span',`${label} ${value}/${max}`);group.className=`fields-vital fields-${kind}`;
        const bar=make('progress');bar.max=max;bar.value=value;bar.setAttribute('aria-label',label);group.append(bar);status.append(group);
    }
    status.append(make('span',`状态 ${p.status}`));
    for(const effect of overview.effects){const icon=make('span',`✦ ${effect.name}`);icon.title=`剩余 ${effect.remainingMinutes} 分钟`;icon.setAttribute('aria-label',`${effect.name}，${icon.title}`);status.append(icon);}
    for(const companion of overview.companions){
        const badge=make('span');badge.className='fields-companion';
        const avatar=make('span',companion.name==='未识别同行者'?'？':companion.name.slice(0,1));avatar.className='fields-companion-avatar';avatar.setAttribute('aria-hidden','true');
        badge.append(avatar,doc.createTextNode(`同行 · ${companion.name}`));status.append(badge);
    }
    if(!overview.companions.length)status.append(make('span','同行 无'));
    container.append(context,status);
    if(blocked){const error=make('span',`生成已停止：${blocked}`);error.className='fields-topbar-blocked';container.append(error);}
}
