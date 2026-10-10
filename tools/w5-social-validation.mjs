import {normalize}from'../server-plugin/retrieval.mjs';
import {bigramSimilarity}from'./w5-validation.mjs';

export const socialCategories=['factions','history','factionPeople','eras'];
export function validateSocialWorld(world,{reference,blocked=[]}){
    const errors=[],factions=world.factions??[],history=world.history??[],people=world.factionPeople??[],eras=world.eras??[];
    const categories={factions,history,factionPeople:people,eras},all=new Map(Object.values(world).filter(Array.isArray).flat().filter(row=>row?.id).map(row=>[row.id,row]));
    const requireKind=(id,kind,label)=>{reference(id,label);if(all.get(id)?.category!==kind)errors.push(`W5社会引用类型错误：${label}`);};
    for(const [category,rows]of Object.entries(categories))for(const row of rows){
        for(const id of row.references??[])reference(id,`${row.id}.references`);
        const text=normalize(JSON.stringify(row));
        for(const word of blocked)if(text.includes(normalize(word)))errors.push(`W5社会正文触及屏蔽表：${row.id}/${word}`);
        if(category==='eras'){if(row.start>row.end)errors.push(`纪元范围倒置：${row.id}`);continue;}
        requireKind(row.culture,'culture',`${row.id}.culture`);
        if(category==='factionPeople'){
            requireKind(row.faction,'faction',`${row.id}.faction`);
            if(row.location!==null&&!world.locations.some(place=>place.id===row.location))errors.push(`名册位置未登记：${row.id}`);
            if(world.npcs.some(npc=>npc.id===row.id))errors.push(`名册不能重复实例化为居民：${row.id}`);
            continue;
        }
        if(!world.locations.some(place=>place.id===row.contactAnchor))errors.push(`联系锚点不是地点：${row.id}`);
        const expected=[row.culture,row.contactAnchor];
        if(category==='factions'){
            const members=[row.leader,...row.coreMembers];
            if(new Set(members).size!==members.length||row.resources.memberCount<members.length)errors.push(`势力成员数量不一致：${row.id}`);
            for(const member of members){if(!people.some(person=>person.id===member&&person.faction===row.id))errors.push(`势力成员未登记或归属不符：${row.id}/${member}`);}
            for(const relation of row.relations)requireKind(relation.faction,'faction',`${row.id}.relations`);
            expected.push(...members,...row.relations.map(peer=>peer.faction));
            const publicDescription=`${row.name}活动于${row.region}，公开目标是${row.publicGoal}。行事方式：${row.method}。可提供${row.offers}；${row.demands}。`;
            if(row.publicDescription!==publicDescription)errors.push(`势力公开说明与公开字段不一致：${row.id}`);
            if(row.description!==Object.values(row.prose).join('\n'))errors.push(`势力检索正文与审查字段不一致：${row.id}`);
            const stages=row.clock.stageEffects.map(step=>step.stage);
            if(stages.some((stage,i)=>stage!==i+1))errors.push(`势力计划阶段不连续：${row.id}`);
        }else{
            const era=eras.find(era=>era.id===row.era);
            if(!era||row.year<era.start||row.year>era.end)errors.push(`历史纪年不在纪元内：${row.id}`);
            reference(row.presentTrace.entity,`${row.id}.presentTrace`);expected.push(row.presentTrace.entity);
            if(row.participants.some(person=>person.id.startsWith('npc_')))errors.push(`古代参与者不能冒充当前人物：${row.id}`);
            if(row.accounts.received.falseClaim===row.accounts.verified.claim)errors.push(`历史传闻与真相未区分：${row.id}`);
            if(row.description!==Object.values(row.prose).join('\n'))errors.push(`历史检索正文与审查字段不一致：${row.id}`);
        }
        for(const id of expected)if(!row.references.includes(id))errors.push(`W5社会引用清单遗漏：${row.id}/${id}`);
    }
    for(const rows of[factions,history])for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++)if(bigramSimilarity(rows[i].description,rows[j].description)>=.35)errors.push(`W5社会同类说明相似度过高：${rows[i].id}/${rows[j].id}`);
    if(history.length>=80&&Math.max(...history.map(row=>row.year))-Math.min(...history.map(row=>row.year))<3000)errors.push('历史时间跨度不足三千年');
    return errors;
}
