import {preconditionFailure} from './precondition.mjs';
import {isPhysicallyDead} from './lifecycle-state.mjs';
import {MemoryIndex,engineIndexOptions} from './retrieval.mjs';
import {scheduleAt,advanceWithNpcParticipants} from './npc-schedule.mjs';
import {eventRumorRecorded,lieRumorRecorded} from './world-events.mjs';

const awake=(state,id,n)=>n&&!n.scheduleTravel&&!n.cognitionTravel&&!isPhysicallyDead(null,state,id)&&!['濒死','昏迷','患病'].includes(n.status)&&!/睡眠|睡觉|熟睡/.test(n.activity??'');
const registered=engine=>[...engine.world.settlementProfiles?.flatMap(p=>p.details?.rumors??[])??[],...engine.world.rumors??[]];

// Authored seeds belong only to their registered speaker/carriers. No static
// profile or automatically propagated memory is changed by this projection.
export function npcRumors(engine,id,document=null){
    const seeds=registered(engine),registeredIds=new Set(seeds.map(r=>r.id));
    const rows=new Map(seeds.filter(r=>r.source===id||r.carriers?.includes(id))
        .map(r=>[r.id,{id:r.id,claim:r.claim,source:r.source,reliability:'未核实'}]));
    const npc=document?.state.npcs[id];
    for(const memory of npc?.memoryStream??[]){
        if(!memory.rumor||memory.kind!=='rumor'&&!memory.eventRumor||memory.minute>document.state.minute||memory.private||['private','secret'].includes(memory.visibility))continue;
        // Authored seeds, or rumors born of a recorded, witnessed world event.
        if(!registeredIds.has(memory.rumor)&&!(memory.eventRumor&&eventRumorRecorded(document.state,memory.rumor))&&!lieRumorRecorded(document.state,memory.rumor)||rows.has(memory.rumor))continue;
        // A holder who saw the lie exposed no longer passes it on as news.
        if(memory.rumor.startsWith('rumor_lie:')&&document.state.records?.[memory.rumor.slice(6)]?.exposures?.[id])continue;
        if(memory.eventRumor&&npc.cognition?.blurred?.[memory.id])continue;
        rows.set(memory.rumor,{id:memory.rumor,claim:npc.cognition?.blurred?.[memory.id]?.content??memory.content,
            source:memory.rumorSource,reliability:'未核实',memoryId:memory.id,rootMemoryId:memory.rootMemoryId,
            transmissionChain:rumorChainView(memory.transmissionChain)});
    }
    return [...rows.values()];
}

// A holder knows their received version and its provenance, not every earlier
// wording retained in the objective transmission record.
export function rumorChainView(chain=[]){
    return chain.map(hop=>({from:hop.from,to:hop.to,minute:hop.minute,channel:hop.channel,...(hop.messageId?{messageId:hop.messageId}:{})}));
}

// Registration establishes opening knowledge, not an encounter. Only claim is
// exposed to the existing NPC planning/communication path; author truth stays out.
export function npcRumorSeeds(engine,id){
    return npcRumors(engine,id).map(r=>({id:`rumor_seed:${r.id}:${id}`,rootMemoryId:`rumor_seed:${r.id}:${r.source}`,
        rumor:r.id,rumorSource:r.source,sourceEvent:`rumor_registration:${r.id}`,kind:'rumor',minute:0,occurredAt:0,
        content:r.claim,sourceType:'听说',salience:2,participants:[],reliability:'未核实',
        transmissionChain:id===r.source?[]:[{from:r.source,to:id,minute:0,channel:'registered',content:r.claim,distortion:'开局已登记的携带者版本'}]}));
}

export function selectNpcRumors(engine,id,query='',document=null){
    const rows=npcRumors(engine,id,document),index=new MemoryIndex(engineIndexOptions(engine));
    for(const row of rows)index.upsert({id:row.id,text:row.claim,keywords:[row.id,'传闻'],entities:[id]});
    const selected=new Set(index.search(query,{present:[id],limit:2}).map(r=>r.id));
    return rows.filter(r=>selected.has(r.id));
}

export function assertRumorConversation(d,engine,speaker,minutes=10){
    const state=d.get('state'),npc=state.npcs[speaker];
    if(!awake(state,'player',state.player)||state.player.hp<=0)throw preconditionFailure('玩家须清醒且可行动才能交谈');
    if(!npc||npc.location!==state.location)throw preconditionFailure('讲述者不在场');
    if(!awake(state,speaker,npc))throw preconditionFailure('讲述者须清醒且可行动');
    engine.assertNpcObligationAction(d,['player',speaker],{minutes,location:state.location,kind:'conversation'});
    engine.assertNpcAutonomyAction(state,['player',speaker],{minutes});
    if(!state.player.companions?.includes(speaker))for(let cursor=state.minute;cursor<state.minute+minutes;){
        const slot=scheduleAt(engine,speaker,cursor,state);if(!slot)break;
        if(slot.location!==state.location||/睡眠|睡觉|熟睡|赶路|前往|返回/.test(slot.activity))throw preconditionFailure('作息不允许在离场或睡眠前完成交谈');
        cursor=slot.until;
    }
}

export function hearNpcRumor(d,engine,args,eventId,{channel='conversation',minutes=10,sourceLabel=null}={}){
    const subject=engine.resolve(args.subject),speaker=engine.resolve(args.source,'npc');
    if(subject!=='player')throw preconditionFailure('传闻获知主体须为玩家');
    if(args.key!==args.rumor)throw preconditionFailure('传闻编号与记忆key须一致');
    const rumor=npcRumors(engine,speaker,d.document).find(r=>r.id===args.rumor);
    if(!rumor)throw preconditionFailure('讲述者没有这条登记传闻');
    if(args.content!==rumor.claim)throw preconditionFailure('传闻内容须与登记claim一致，不能请求真相或改写');
    const memoryId=`player::${rumor.id}::${speaker}`,old=d.get('memories',memoryId);
    if(old?.rumor===rumor.id&&old.source===speaker)return{memoryId,duplicate:true,rumor:old.rumor,source:speaker,content:old.content,reliability:'未核实'};
    assertRumorConversation(d,engine,speaker,minutes);
    const location=d.get('state','location'),start=d.get('state','minute');
    const origin=npcRumorSeeds(engine,speaker).find(r=>r.rumor===rumor.id);
    const rootMemoryId=rumor.rootMemoryId??origin?.rootMemoryId??rumor.memoryId;
    const transmissionChain=[...rumor.transmissionChain??origin?.transmissionChain??[],{from:speaker,to:'player',minute:start,channel,content:rumor.claim,distortion:'保留讲述者版本'}];
    // Ten minutes is the existing ordinary turn duration. Reserve the speaker
    // after validating the entire interval, as with other joint activities.
    advanceWithNpcParticipants(d,engine,minutes,eventId,[speaker]);
    const content=`${d.get('state','player','name')}在${engine.byId.get(location)?.name??location}于${engine.calendar(start).text}听到${engine.byId.get(speaker).name}说：“${rumor.claim}”；尚未核实。`;
    const memory={subject,key:rumor.id,rumor:rumor.id,content,source:speaker,sourceEvent:eventId,sourceType:'听说',reliability:'未核实',
        minute:d.get('state','minute'),location,participants:['player',speaker],keywords:[],pinned:false,
        rumorSource:rumor.source,rootMemoryId,transmissionChain,...(sourceLabel?{sourceLabel,channel}:{})};
    d.set(['memories',memoryId],memory);
    return{memoryId,rumor:rumor.id,source:speaker,content,reliability:'未核实',minutes,rootMemoryId,transmissionChain,...(sourceLabel?{sourceLabel,channel}:{})};
}
