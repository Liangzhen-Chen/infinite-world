// Only observable player state becomes UI feedback. Private records and hidden luck stay private.
export function stateNotices(before,after,resolveName=id=>id){
    const result=[],push=(type,text)=>result.push({type,text});
    const name=id=>resolveName(id)??'未命名对象';
    const delta=(value,unit='')=>`${value>0?'+':''}${value}${unit}`;
    const labels={coins:'钱袋',hp:'生命',mp:'魔力',xp:'经验',level:'等级',freeAttributePoints:'待分配属性点'};
    for(const [key,label] of Object.entries(labels)){
        const old=before.player[key]??0,current=after.player[key]??0;
        if(old!==current)push(key,`${label} ${delta(current-old,key==='coins'?'铜':'')}，现有 ${current}${key==='hp'?`/${after.player.maxHp}`:key==='mp'?`/${after.player.maxMp}`:''}`);
    }
    if(before.player.status!==after.player.status)push('status',`状态：${after.player.status}`);
    for(const key of ['maxHp','maxMp'])if(before.player[key]!==after.player[key])push('maximum',`${key==='maxHp'?'生命':'魔力'}上限 ${before.player[key]} → ${after.player[key]}`);
    for(const [key,value] of Object.entries(after.player.attributes??{}))if(before.player.attributes?.[key]!==value)push('attribute',`${key} ${before.player.attributes?.[key]??0} → ${value}`);
    for(const id of new Set([...Object.keys(before.inventory??{}),...Object.keys(after.inventory??{})])){
        const old=before.inventory?.[id]?.quantity??0,current=after.inventory?.[id]?.quantity??0;
        if(old!==current)push('inventory',`${name(id)} ${delta(current-old)}，现有 ${current}`);
        const a=before.inventory?.[id],b=after.inventory?.[id];
        // A first repair assigns an instance ID. The old aggregate still supplies
        // its before value; skipping the new instance would hide that repair.
        if(a&&b&&!(a.instances?.length&&b.instances?.length)){
            if(a.durability!==b.durability)push('durability',`${name(id)}耐久 ${a.durability} → ${b.durability}`);
            if(b.maxDurability!==undefined&&a.maxDurability!==b.maxDurability)push('durability',`${name(id)}耐久上限${a.maxDurability===undefined?`现为 ${b.maxDurability}`:` ${a.maxDurability} → ${b.maxDurability}`}`);
        }
    }
    for(const [id,row] of Object.entries(after.itemInstances??{})){
        const old=before.itemInstances?.[id];
        if(old?.owner==='player'&&row.owner==='player'&&old.durability!==row.durability)push('durability',`${name(row.item)}耐久 ${old.durability} → ${row.durability}`);
        if(old?.owner==='player'&&row.owner==='player'&&old.maxDurability!==row.maxDurability)push('durability',`${name(row.item)}耐久上限 ${old.maxDurability} → ${row.maxDurability}`);
    }
    const visibleEffect=(row,state)=>row&&(row.target==='player'||row.owner==='player'||state.inventory?.[row.target]);
    for(const id of new Set([...Object.keys(before.effects??{}),...Object.keys(after.effects??{})])){
        const old=before.effects?.[id],row=after.effects?.[id];
        if(!old&&visibleEffect(row,after))push('effect',`效果生效：${name(row.spell)}${row.status?` · ${row.status}`:''}`);
        if(!row&&visibleEffect(old,before))push('effect',`效果结束：${name(old.spell)}`);
    }
    for(const [id,row] of Object.entries(after.pets??{})){
        const old=before.pets?.[id];
        if(!old||row.status!==old.status||row.following!==old.following)push('pet',`${name(id)}：${row.status}${row.following?'，正在跟随':''}`);
    }
    for(const [id,row] of Object.entries(after.records??{})){
        if(row.category==='repair'&&row.mechanic==='player'&&!before.records?.[id])push('repair',`${name(row.item)}修整${row.success?'完成':'未成功'}${row.completionFailure?`：${row.completionFailure}`:''}`);
        if(row.category==='debt'&&row.debtor==='player'){
            const old=before.records?.[id];
            if(!old||old.status!==row.status||old.paid!==row.paid)push('debt',`欠${name(row.creditor)} ${row.amount-row.paid}铜 · ${row.status}`);
        }
        if(row.category!=='contract'||!row.parties?.includes('player'))continue;
        const old=before.records?.[id];
        if(!old||old.status!==row.status)push('contract',`${row.name??'契约'}：${row.status}`);
    }
    for(const [id,row] of Object.entries(after.learning??{}))if(!before.learning?.[id]&&row.success===false)push('learning',`${name(row.entity)}尚未学会，本次已花费 ${row.cost??0}铜、${row.end-row.start} 分钟`);
    for(const [id,skill] of Object.entries(after.skills??{})){
        const old=before.skills?.[id]?.proficiency??0;
        if(!before.skills?.[id]||old!==skill.proficiency)push('skill',`${name(id)}熟练度 ${delta(skill.proficiency-old)}，现为 ${skill.proficiency}`);
    }
    for(const id of Object.keys(after.spells??{}))if(!before.spells?.[id])push('learned',`学会法术：${name(id)}`);
    for(const id of Object.keys(after.recipes??{}))if(!before.recipes?.[id])push('learned',`学会配方：${name(id)}`);
    for(const collection of ['obligations','quests'])for(const [id,row] of Object.entries(after[collection]??{})){
        const old=before[collection]?.[id];
        if(!old||old.status!==row.status)push(collection,`${collection==='obligations'?'约定':'任务'}：${row.content??row.name??'已登记事项'} · ${row.status??'进行中'}`);
    }
    for(const [id,npc] of Object.entries(after.npcs??{})){
        const old=before.npcs?.[id];if(!old)continue;
        if(npc.trust!==old.trust)push('relationship',`${name(id)}${npc.trust>old.trust?'对你更放心了':'对你更谨慎了'}`);
        if(npc.affection!==old.affection)push('relationship',`${name(id)}${npc.affection>old.affection?'与你更亲近了':'与你疏远了些'}`);
    }
    const professions=value=>[value?.combat,...value?.life??[],...value?.hidden??[]].filter(Boolean);
    const oldJobs=professions(before.professions),newJobs=professions(after.professions);
    for(const id of newJobs)if(!oldJobs.includes(id))push('profession',`获得职业：${name(id)}`);
    for(const id of oldJobs)if(!newJobs.includes(id))push('profession',`退出职业：${name(id)}`);
    if(before.location!==after.location)push('location',`抵达：${name(after.location)}`);
    if(after.minute!==before.minute)push('time',`经过 ${after.minute-before.minute} 分钟`);
    return result;
}
