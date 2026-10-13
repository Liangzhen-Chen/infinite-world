import {relationView} from './npc-relations.mjs';
import {normalize} from './retrieval.mjs';
import {buildChronicle,getChronicle} from './chronicle.mjs';

// All collections are filtered by the player's recorded knowledge before search
// or pagination. World NPC locations, seed memories and rumor truth stay private.
export function history(engine,document,chronicle,options={}){
    const state=document.state,now=state.minute,known=new Map();
    const facts=(chronicle.facts??[]).filter(row=>row.visibleTo?.includes('player')&&row.minute<=now);
    const memories=Object.entries(document.memories??{}).filter(([,row])=>row&&row.private!==true&&(row.minute??row.updated??0)<=now);
    const encounter=(id,row)=>{
        if(!state.npcs?.[id]||!engine.byId.has(id))return;
        const previous=known.get(id);
        if(!previous||(row.minute??0)>=(previous.minute??0))known.set(id,{minute:row.minute??0,location:row.location??previous?.location??null,
            locationMinute:row.location?row.minute??0:previous?.locationMinute??null});
    };
    for(const fact of facts)if(fact.participants?.includes('player')&&!['obligations','quests','records','autonomy'].includes(fact.kind)){
        for(const id of fact.participants)encounter(id,fact);
    }
    for(const [id,npc]of Object.entries(state.npcs??{}))for(const row of npc.memoryStream??[]){
        if(row.minute>now||!row.participants?.includes('player')||!row.participants.includes(id)||row.sourceType!=='亲历')continue;
        if(row.permittedRecipients&&!row.permittedRecipients.includes('player'))continue;
        // An observer's presence is evidence of a meeting, never permission to
        // display that observer's other memories or present-day whereabouts.
        if(row.location)encounter(id,row);
    }
    for(const [,row]of memories){
        if(row.sourceType==='听说'&&row.participants?.includes('player'))encounter(row.source,row);
        if(row.source==='亲历')encounter(row.subject,row);
    }
    const name=id=>id==='player'?state.player?.name??'旅人':engine.byId.get(id)?.name??'未知';
    const when=minute=>Number.isSafeInteger(minute)?engine.calendar(minute).text:'时间未记录';
    const shared=id=>facts.filter(row=>row.participants?.includes('player')&&row.participants.includes(id)).slice(-5).reverse().map(row=>({text:row.text,time:when(row.minute)}));
    const people=[...known].map(([id,last])=>{
        const base=engine.byId.get(id),relationship=relationView(engine,state,id,'player');
        const relation=Object.fromEntries(['trust','affection','respect','fear'].map(key=>[key,relationship[key]]));
        const description=[relation.trust>0?'对你较为放心':relation.trust<0?'对你保持戒心':'信任尚未变化',relation.affection>0?'与你较为亲近':relation.affection<0?'与你有些疏远':'亲近尚未变化'].join('，');
        const promises=Object.entries(state.obligations??{}).filter(([,row])=>[row.promisor,row.promisee].includes('player')&&[row.promisor,row.promisee].includes(id))
            .map(([key,row])=>({id:key,text:`${name(row.promisor)}向${name(row.promisee)}作出的${row.type??'约定'}：${row.content??''} · ${row.status??'未记录'}`,deadline:row.deadline===undefined?null:when(row.deadline)}));
        return {id,name:base.name,identity:base.occupation??'身份未记录',location:last.location?name(last.location):'未获知',locationTime:when(last.locationMinute),relationship:relation,description,shared:shared(id),promises};
    }).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'));
    const rumors=memories.filter(([,row])=>row.subject==='player'&&row.rumor&&row.sourceType==='听说'&&row.participants?.includes('player'))
        .map(([id,row])=>({id,text:row.content,source:name(row.source),time:when(row.minute),minute:row.minute,reliability:row.reliability??'未核实'}));
    const level=['facts','scenes','days','weeks','chapters'].includes(options.level)?options.level:'scenes';
    const query=normalize(String(options.query??'').trim());
    // Rebuild summaries from player-visible facts if a caller supplied an
    // omniscient chronicle, rather than trusting its precomputed summary text.
    const entries=level==='facts'?facts:buildChronicle(facts,{now})[level];
    const past=entries.map(row=>{
        const matched=query&&!normalize(row.text).includes(query)?facts.find(fact=>
            (row.factIds?.includes(fact.id)||row.sources?.events?.includes(fact.sourceEvent))&&normalize(fact.text).includes(query)):null;
        // A summary can omit a low-salience detail; searching it must still find
        // the original visible event and show the matching excerpt.
        return {id:row.id,text:matched?`${row.text}\n${matched.text}`:row.text,time:when(row.minute),minute:row.minute};
    });
    if(level==='facts'||level==='scenes')for(const [id,row]of memories)if(!row.rumor)past.push({id:`memory:${id}`,text:row.content,time:when(row.minute??row.updated),minute:row.minute??row.updated??0});
    const matches=row=>!query||normalize([row.text,row.name,row.identity,row.location,row.source,...(row.shared??[]).map(item=>item.text)].filter(Boolean).join(' ')).includes(query);
    const pageSize=Number.isSafeInteger(options.pageSize)?Math.max(1,Math.min(50,options.pageSize)):20;
    const page=Number.isSafeInteger(options.page)?Math.max(1,options.page):1;
    const paginate=rows=>{const filtered=rows.filter(matches);return {items:filtered.slice((page-1)*pageSize,page*pageSize),total:filtered.length,page,pageSize};};
    past.sort((a,b)=>b.minute-a.minute);
    rumors.sort((a,b)=>b.minute-a.minute);
    return {people:paginate(people),chronicle:paginate(past),rumors:paginate(rumors),level};
}

export function registerUIRoutes({post,readCampaign,getStore,readChronicle=req=>getChronicle(getStore(req),req.body.campaignId)}){
    post('/ui/history',async req=>{
        const {engine,document,reference}=await readCampaign(req),chronicle=await readChronicle(req);
        if(reference.sequence!==chronicle.reference.sequence||reference.head!==chronicle.reference.head)throw Error('历史读取期间存档已变化，请重试');
        return {reference,...history(engine,document,chronicle,req.body)};
    });
}
