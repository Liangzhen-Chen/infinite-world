import {reputationFactions}from'./reputation-registry.mjs';
import {societyOfActor} from './monster-society.mjs';
import {standing,standingIsDefault,HOSTILE} from './standing.mjs';
import {settlementAt} from './reputation.mjs';
import {organizationsOf} from './organizations.mjs';

// Public opinion is a projection, never a stored score. A person counts only
// for the events present in their own memory stream (or, for a monster
// settlement member, a society message that has actually arrived). Their view
// follows from records that already exist: personal relations, settlement
// stances, and the faction/settlement reputation accounts. Replays and restored
// saves therefore yield the same opinion as the live campaign.
export const STANCE_LABEL={support:'支持',oppose:'反对',neutral:'中立'};
const STAGE_ACT={conviction:'harm',fulfilled:'aid',overturned:'cleared'};
const hidden=m=>m.private===true||['private','secret'].includes(m.visibility)||['secret','debt','obligation','quest'].includes(m.kind)||m.sourceType==='约定核对';
const living=n=>n&&n.status!=='死亡';
const seatOf=(engine,id)=>engine.world.locations.find(l=>l.id===id&&l.monsterSociety);

function within(engine,location,place){
    const seen=new Set();
    while(location&&!seen.has(location)){if(location===place)return true;seen.add(location);location=engine.byId.get(location)?.parent;}
    return false;
}

// What a single remembered item says, or null when it carries no deed with an
// affected party. Topic ids join witnesses, retellings and society messages
// of the same source event; a legal case is one topic across its stages.
function shape(state,memory){
    if(memory.kind==='salary'&&state.records?.[memory.salary]?.category==='office_salary')return {topic:`salary:${memory.salary}`,kind:'salary',actor:memory.participants[0],affected:memory.participants[1],act:'harm',order:0};
    if(memory.kind==='campaign')return {topic:`event:${memory.sourceEvent}`,kind:'campaign',actor:memory.participants[0],affected:memory.participants[1],act:memory.campaignSuccess?'aid':'harm',order:0};
    if(memory.legalCase){
        const row=state.records?.[memory.legalCase],act=STAGE_ACT[memory.legalStage];
        if(row?.category!=='legal_case'||!act)return null;
        const order=(row.reputationHistory??[]).findIndex(e=>e.sourceEvent===memory.sourceEvent);
        return {topic:`case:${row.id}`,kind:'law',actor:row.offender,affected:row.victim??null,act,stage:memory.legalStage,order:order<0?0:order,case:row.id};
    }
    // U10: a competitor's complaint that someone's life magic took their living.
    if(memory.kind==='complaint'&&memory.sourceEvent&&memory.participants?.length>=2)
        return {topic:`event:${memory.sourceEvent}`,kind:'complaint',actor:memory.participants[0],affected:memory.participants[1],act:'harm',order:0};
    if(['conflict','crime'].includes(memory.kind)&&memory.sourceEvent&&memory.participants?.length>=2)
        return {topic:`event:${memory.sourceEvent}`,kind:memory.kind,actor:memory.participants[0],affected:memory.participants[1],act:'harm',order:0};
    return null;
}

// The newest version this person holds for each topic. Blurred memories no
// longer identify who did what, so they no longer carry an opinion.
export function knownTopics(engine,document,id){
    const state=document.state,npc=state.npcs[id],topics=new Map();
    if(!living(npc))return topics;
    const keep=row=>{const old=topics.get(row.topic);if(!old||row.order>old.order||row.order===old.order&&row.minute>old.minute)topics.set(row.topic,row);};
    for(const memory of npc.memoryStream??[]){
        if(memory.minute>state.minute||hidden(memory)||npc.cognition?.blurred?.[memory.id])continue;
        const s=shape(state,memory);
        if(s)keep({...s,minute:memory.minute,sourceType:memory.sourceType,heardFrom:memory.heardFrom??null,memoryId:memory.id});
    }
    const society=societyOfActor(engine,id);
    if(society)for(const [key,news]of Object.entries(state.records??{})){
        if(news.category!=='society_news'||news.to!==society||news.status!=='已送达'||news.arrivesAt>state.minute)continue;
        keep({topic:`event:${news.sourceEvent}`,kind:'society',actor:news.actor,affected:news.victim,act:news.act,order:0,
            minute:news.arrivesAt,sourceType:'听说',heardFrom:news.from,memoryId:key});
    }
    return topics;
}

// Existing ties only: self, own settlement, and the unified standing read
// (relation ledger, settlement stance and what reached each through members).
function tie(engine,state,who,other){
    if(!other)return null;
    if(who===other)return 'self';
    const own=societyOfActor(engine,who);
    if(seatOf(engine,other)){
        if(own===other)return 'kin';
        return own&&standing(engine,state,own,other)<=HOSTILE?'enemy':null;
    }
    const theirs=other==='player'?null:societyOfActor(engine,other);
    if(own&&theirs&&own===theirs)return 'kin';
    if(own&&standing(engine,state,own,theirs??other)<=HOSTILE)return 'enemy';
    const regard=standing(engine,state,who,other);
    return regard>=20?'friend':regard<0?'enemy':null;
}
const reputationOf=(engine,state,subject,scope)=>standing(engine,state,scope,subject);
export function opinionOf(engine,state,who,topic){
    if(topic.act==='cleared')return {stance:'neutral',basis:'已获知原裁判撤销'};
    const sign=topic.act==='aid'?1:-1,pick=(n,basis)=>({stance:n>0?'support':'oppose',basis});
    const affected=tie(engine,state,who,topic.affected);
    if(['self','kin','friend'].includes(affected))return pick(sign,affected==='self'?'本人是当事人':affected==='kin'?'同一聚居地':'与受影响者交好');
    if(affected==='enemy')return pick(-sign,'与受影响者敌对');
    const actor=tie(engine,state,who,topic.actor);
    if(['self','kin','friend'].includes(actor))return pick(1,actor==='kin'?'与行事者同属一地':'与行事者交好');
    if(actor==='enemy')return pick(-1,'与行事者敌对');
    for(const faction of reputationFactions(engine,state)){
        if(!(faction.members??[]).includes(who))continue;
        const value=reputationOf(engine,state,topic.actor,faction.id);
        if(value)return pick(value,`所属${engine.byId.get(faction.id)?.name??faction.id}对行事者的声望`);
    }
    for(const org of organizationsOf(state,who,engine)){
        // 聚居地对玩家的缺省戒备只是姿态，不是对本事件的立场；有显式记录的立场（好感、敌意）照常计入。
        if(standingIsDefault(engine,state,org,topic.actor))continue;
        const value=standing(engine,state,org,topic.actor);
        if(value)return pick(value,`所属${state.records[`organization:${org}`]?.name??engine.byId.get(org)?.name??org}对行事者的立场`);
    }
    const local=settlementAt(engine,state.npcs[who]?.location);
    const value=local?reputationOf(engine,state,topic.actor,local):0;
    if(value)return pick(value,`${engine.byId.get(local)?.name??local}对行事者的口碑`);
    return {stance:'neutral',basis:'与双方无利害'};
}

export function topicLabel(engine,document,topic){
    const name=id=>id==='player'?document.state.player.name:engine.byId.get(id)?.name??id;
    if(topic.kind==='law')return `${topic.case}：${name(topic.actor)}被控侵害${name(topic.affected)}`;
    if(topic.kind==='crime')return `${name(topic.actor)}试图偷取${name(topic.affected)}的财物`;
    if(topic.kind==='complaint')return `${name(topic.affected)}投诉${name(topic.actor)}的生活魔法断了生计`;
    if(topic.kind==='conflict')return `${name(topic.actor)}与${name(topic.affected)}交锋`;
    return `${name(topic.actor)}${topic.act==='harm'?'侵害':'援助'}${name(topic.affected)}`;
}

export function npcOpinions(engine,document,id){
    return [...knownTopics(engine,document,id).values()].sort((a,b)=>b.minute-a.minute||a.topic.localeCompare(b.topic)).map(t=>{
        const view=opinionOf(engine,document.state,id,t);
        return {topic:t.topic,label:topicLabel(engine,document,t),...(t.stage?{stage:t.stage}:{}),stance:view.stance,basis:view.basis,
            sourceType:t.sourceType,heardFrom:t.heardFrom,learnedAt:t.minute};
    });
}

// Ratios count only people who actually know the topic; the rest are reported
// as unaware and never assumed to share the majority view.
export function opinionAmong(engine,document,people,{topic=null}={}){
    const topics=new Map(),ids=[...new Set(people)].filter(id=>living(document.state.npcs[id])).sort();
    for(const id of ids)for(const row of npcOpinions(engine,document,id)){
        if(topic&&row.topic!==topic)continue;
        const entry=topics.get(row.topic)??{topic:row.topic,label:row.label,support:0,oppose:0,neutral:0,known:0,views:[]};
        entry[row.stance]++;entry.known++;entry.views.push({npc:id,stance:row.stance,basis:row.basis,...(row.stage?{stage:row.stage}:{}),sourceType:row.sourceType});
        topics.set(row.topic,entry);
    }
    return [...topics.values()].map(t=>({...t,unaware:ids.length-t.known,
        ratio:{support:Math.round(t.support*100/t.known),oppose:Math.round(t.oppose*100/t.known)}}))
        .sort((a,b)=>b.known-a.known||a.topic.localeCompare(b.topic));
}

// A place is a reputation settlement or a monster settlement seat; its people
// are those currently there, as with where reputation is heard.
export function localOpinion(engine,document,place,options={}){
    const people=Object.entries(document.state.npcs).filter(([,n])=>living(n)&&within(engine,n.location,place)).map(([id])=>id);
    return {place,population:people.length,topics:opinionAmong(engine,document,people,options)};
}
export function opinionPlace(engine,location){
    const seen=new Set();let cursor=location;
    while(cursor&&!seen.has(cursor)){if(seatOf(engine,cursor))return cursor;seen.add(cursor);cursor=engine.byId.get(cursor)?.parent;}
    return settlementAt(engine,location);
}
