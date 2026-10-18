// Only observable player state becomes UI feedback. Private records and hidden luck stay private.
export function stateNotices(before,after,resolveName=id=>id){
    const result=[],push=(type,text,card)=>result.push({type,text,...(card?{card}:{})});
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
        if(old?.kind==='protection'&&row?.kind==='protection'&&visibleEffect(row,after)&&row.remaining<old.remaining)push('protection',`${name(row.spell)}吸收 ${old.remaining-row.remaining} 点伤害，剩余防护 ${row.remaining}`);
    }
    for(const [id,row] of Object.entries(after.pets??{})){
        const old=before.pets?.[id];
        if(!old||row.status!==old.status||row.following!==old.following)push('pet',`${name(id)}：${row.status}${row.following?'，正在跟随':''}`);
    }
    for(const [id,row] of Object.entries(after.records??{})){
        if(row.subject==='player'&&!before.records?.[id]){
            if(['civic_resident','civic_citizen'].includes(row.category))push('civic',`${name(row.settlement)}：${row.category==='civic_citizen'?'公民':'居民'}已登记，费用 ${row.fee}铜`);
            if(row.category==='civic_contribution')push('contribution',`${name(row.settlement)}贡献 +${row.points} · ${row.kind==='donation'?'实际捐赠':row.kind==='project'?'公共工程':'教学'}`);
        }
        if(row.category==='authorization'&&row.action==='enter_home'&&row.grantee==='player'){
            const old=before.records?.[id];
            if(!old&&!row.revoked&&row.expires>after.minute)push('permission',`${name(row.grantor)}允许你${row.guests?.length?`和${row.guests.map(name).join('、')}`:''}进入${name(row.subject)}，有效${row.expires-after.minute}分钟`);
            else if(old&&!old.revoked&&row.revoked)push('permission',`${name(row.grantor)}收回了进入${name(row.subject)}的许可`);
            else if(old&&!row.revoked&&before.minute<row.expires&&row.expires<=after.minute)push('permission',`进入${name(row.subject)}的许可已到期`);
        }
        if(row.category==='repair'&&row.mechanic==='player'&&!before.records?.[id])push('repair',`${name(row.item)}修整${row.success?'完成':'未成功'}${row.completionFailure?`：${row.completionFailure}`:''}`);
        if(row.category==='debt'&&row.debtor==='player'&&!row.obligation){
            const old=before.records?.[id];
            if(!old||old.status!==row.status||old.paid!==row.paid)push('debt',`欠${name(row.creditor)} ${row.amount-row.paid}铜 · ${row.status}`);
        }
        if(row.category!=='contract'||!row.parties?.includes('player'))continue;
        const old=before.records?.[id];
        if(!old||old.status!==row.status)push('contract',`${row.name??'契约'}：${row.status}`,playerDocuments(after,resolveName).find(card=>card.id===`record:${id}`));
    }
    for(const row of obligationRows(after).filter(r=>after.obligations?.[r.id]&&r.debtor==='player')){
        const old=obligationRow(before,row.id),current=obligationView(after,row);
        if(!old||old.status!==row.status||old.paid!==row.paid)push('debt',`欠${name(row.creditor)} ${current.owed}铜 · ${row.status}`);
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
        if(before.location===after.location&&old.location!==npc.location){
            if(old.location===before.location)push('presence',`${name(id)}离开了这里`);
            if(npc.location===after.location)push('presence',`${name(id)}来到这里`);
        }
        if(before.location===after.location&&old.location===before.location&&npc.location===after.location&&old.activity&&npc.activity&&old.activity!==npc.activity)push('activity',`${name(id)}此刻：${npc.activity}`);
        if(npc.trust!==old.trust)push('relationship',`${name(id)}${npc.trust>old.trust?'对你更放心了':'对你更谨慎了'}`);
        if(npc.affection!==old.affection)push('relationship',`${name(id)}${npc.affection>old.affection?'与你更亲近了':'与你疏远了些'}`);
        if(npc.location===after.location&&old.location===before.location){
            const a=old.relationships?.player??{},b=npc.relationships?.player??{};
            for(const [key,increased,decreased]of [['respect','对你更敬重了','对你的敬重减少了'],['fear','对你更畏惧了','对你的畏惧减轻了']])if((a[key]??0)!==(b[key]??0))push('relationship',`${name(id)}${(b[key]??0)>(a[key]??0)?increased:decreased}`);
            if((b.favors??[]).some(row=>row.status==='未还'&&!(a.favors??[]).some(old=>old.id===row.id)))push('relationship',`${name(id)}记下了欠你的人情`);
        }
    }
    const professions=value=>[value?.combat,...value?.life??[],...value?.hidden??[]].filter(Boolean);
    const oldJobs=professions(before.professions),newJobs=professions(after.professions);
    for(const id of newJobs)if(!oldJobs.includes(id))push('profession',`获得职业：${name(id)}`);
    for(const id of oldJobs)if(!newJobs.includes(id))push('profession',`退出职业：${name(id)}`);
    if(before.location!==after.location)push('location',`抵达：${name(after.location)}`);
    // 久别回到某地：汇总已在引擎里按认知边界过滤，这里只转述。
    const back=after.visits?.lastReturn;
    if(back&&back.sourceEvent!==before.visits?.lastReturn?.sourceEvent)push('return',`回到${name(back.place)}，离开期间：${back.lines.join('；')}`);
    if(after.minute!==before.minute)push('time',`经过 ${after.minute-before.minute} 分钟`);
    const oldDocuments=new Map(playerDocuments(before,resolveName).map(row=>[row.id,row]));
    for(const card of playerDocuments(after,resolveName))if(card.kind!=='contract'&&!oldDocuments.has(card.id))push(card.kind,`${card.kind==='announcement'?'公告':'收到信件'}：${card.title}`,card);
    return result;
}

// Whitelist player documents; public visibility alone never proves receipt.
export function playerDocuments(state,resolveName=id=>id){
    const cards=[],name=id=>id==='player'?state.player.name:resolveName(id)??'路人';
    for(const [id,row]of Object.entries(state.records??{})){
        if(row.category==='contract'&&row.parties?.includes('player'))cards.push({id:`record:${id}`,kind:'contract',title:row.name??'契约',text:row.content??`${row.parties.map(name).join('、')} · ${row.status}`,status:row.status,
            ...(row.cost!==undefined?{cost:row.cost}:{}),...((row.deadline??row.expires)!==undefined?{deadline:row.deadline??row.expires}:{})});
        if(row.category==='announcement'&&row.knownBy?.includes('player'))cards.push({id:`record:${id}`,kind:'announcement',title:row.name??'公告',text:row.content??''});
        if(row.category==='letter'&&row.to==='player'&&row.status==='已交付')cards.push({id:`record:${id}`,kind:'letter',title:row.name??'来信',text:row.content??'',from:name(row.from)});
    }
    for(const [id,row]of Object.entries(state.npcCognition?.messages??{}))if(row.to==='player'&&row.status==='已交付'&&row.channel==='magic')cards.push({id:`message:${id}`,kind:'letter',title:'传讯来信',text:row.content??'',from:name(row.from)});
    return cards;
}
import {obligationRows,obligationView,obligationRow} from './obligation-state.mjs';
