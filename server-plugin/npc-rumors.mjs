import {MemoryIndex} from './retrieval.mjs';
import {scheduleAt,advanceWithNpcParticipants} from './npc-schedule.mjs';

const awake=n=>n&&!n.scheduleTravel&&!n.cognitionTravel&&!['死亡','濒死','昏迷','患病'].includes(n.status)&&!/睡眠|睡觉|熟睡/.test(n.activity??'');
const registered=engine=>engine.world.settlementProfiles?.flatMap(p=>p.details?.rumors??[])??[];

// Authored seeds belong only to their registered speaker/carriers. No static
// profile or automatically propagated memory is changed by this projection.
export function npcRumors(engine,id){
    return registered(engine).filter(r=>r.source===id||r.carriers?.includes(id))
        .map(r=>({id:r.id,claim:r.claim,source:r.source,reliability:'未核实'}));
}

export function selectNpcRumors(engine,id,query=''){
    const rows=npcRumors(engine,id),index=new MemoryIndex({entities:engine.entities});
    for(const row of rows)index.upsert({id:row.id,text:row.claim,keywords:[row.id,'传闻'],entities:[id]});
    const selected=new Set(index.search(query,{present:[id],limit:2}).map(r=>r.id));
    return rows.filter(r=>selected.has(r.id));
}

export function assertRumorConversation(d,engine,speaker,minutes=10){
    const state=d.get('state'),npc=state.npcs[speaker];
    if(!awake(state.player)||state.player.hp<=0)throw Error('玩家须清醒且可行动才能交谈');
    if(!npc||npc.location!==state.location)throw Error('讲述者不在场');
    if(!awake(npc))throw Error('讲述者须清醒且可行动');
    engine.assertNpcObligationAction(d,['player',speaker],{minutes,location:state.location,kind:'conversation'});
    engine.assertNpcAutonomyAction(state,['player',speaker],{minutes});
    if(!state.player.companions?.includes(speaker))for(let cursor=state.minute;cursor<state.minute+minutes;){
        const slot=scheduleAt(engine,speaker,cursor,state);if(!slot)break;
        if(slot.location!==state.location||/睡眠|睡觉|熟睡|赶路|前往|返回/.test(slot.activity))throw Error('作息不允许在离场或睡眠前完成交谈');
        cursor=slot.until;
    }
}

export function hearNpcRumor(d,engine,args,eventId){
    const subject=engine.resolve(args.subject),speaker=engine.resolve(args.source,'npc');
    if(subject!=='player')throw Error('传闻获知主体须为玩家');
    if(args.key!==args.rumor)throw Error('传闻编号与记忆key须一致');
    const rumor=npcRumors(engine,speaker).find(r=>r.id===args.rumor);
    if(!rumor)throw Error('讲述者没有这条登记传闻');
    if(args.content!==rumor.claim)throw Error('传闻内容须与登记claim一致，不能请求真相或改写');
    const memoryId=`player::${rumor.id}::${speaker}`,old=d.get('memories',memoryId);
    if(old?.rumor===rumor.id&&old.source===speaker)return{memoryId,duplicate:true,rumor:old.rumor,source:speaker,content:old.content,reliability:'未核实'};
    assertRumorConversation(d,engine,speaker);
    const location=d.get('state','location'),start=d.get('state','minute');
    // Ten minutes is the existing ordinary turn duration. Reserve the speaker
    // after validating the entire interval, as with other joint activities.
    advanceWithNpcParticipants(d,engine,10,eventId,[speaker]);
    const content=`${d.get('state','player','name')}在${engine.byId.get(location)?.name??location}于${engine.calendar(start).text}听到${engine.byId.get(speaker).name}说：“${rumor.claim}”；尚未核实。`;
    const memory={subject,key:rumor.id,rumor:rumor.id,content,source:speaker,sourceEvent:eventId,sourceType:'听说',reliability:'未核实',
        minute:d.get('state','minute'),location,participants:['player',speaker],keywords:[],pinned:false};
    d.set(['memories',memoryId],memory);
    return{memoryId,rumor:rumor.id,source:speaker,content,reliability:'未核实',minutes:10};
}
