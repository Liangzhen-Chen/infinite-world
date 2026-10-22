import {preconditionFailure} from './precondition.mjs';
import {isPhysicallyDead} from './lifecycle-state.mjs';
// U8 谎言账（指南5.7）：撒谎时说法与真相成对记账，谁对谁说、动机、知情者
// 都在 records 的 `lie:<id>` 里。被骗者把说法当事实记住，并作为 K5 传闻
// `rumor_lie:<id>` 沿原有转述路线传播（失真照常）。矛盾证据、知情者开口、
// 玩家出示证据，或灵智够高的被骗者发现前后不一（U7）时揭穿：生成世界事件
// （K3 verb=deceive）、改变被骗者对说谎者的立场（K4）并留下记仇记忆。
// 未成年人或私宅里的谎言只记账，不进入传闻。
import {digest} from './storage.mjs';
import {validateMemory,normalize} from './retrieval.mjs';
import {recordStandingEvidence} from './npc-relations.mjs';
import {adjustStanding} from './standing.mjs';
import {intelligenceOf} from './npc-intelligence.mjs';
import {lieRumorId} from './world-events.mjs';

export const LIE_EXPOSURE={trust:-15,affection:-5,respect:-5};
export const LIE_ROUTES=Object.freeze({contradiction:'矛盾证据',knower:'知情者开口',evidence:'玩家出示证据',insight:'识破'});
const FIRSTHAND=new Set(['亲历','目击','约定核对']);
const clone=v=>structuredClone(v);
const text=(value,max)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw preconditionFailure('文字为空或过长');return value.trim();};
const awake=(state,id,n)=>n&&!n.scheduleTravel&&!n.cognitionTravel&&!isPhysicallyDead(null,state,id)&&!['濒死','昏迷'].includes(n.status)&&!/睡眠|睡觉|熟睡/.test(n.activity??'');
const minor=(engine,state,id)=>{const base=engine.byId.get(id),now=state.npcs?.[id];return Boolean(base?.flags?.minor||base?.minor||base?.age<18||now?.flags?.minor||now?.age<18);};
const nameOf=(engine,state,id)=>id==='player'?state.player?.name??'你':engine.byId.get(id)?.name??state.npcs?.[id]?.name??id;
export const lieRecordKey=(liar,key)=>`lie:${digest([liar,key]).slice(0,16)}`;
export const lies=state=>Object.entries(state.records??{}).filter(([,r])=>r?.category==='lie').map(([id,r])=>({id,...r}));
export const liesToldBy=(state,liar)=>lies(state).filter(r=>r.liar===liar);
const toldTo=(lie,id)=>lie.tellings.some(t=>t.to===id);

function person(engine,state,value,role){
    let id;try{id=engine.resolve(value);}catch{throw preconditionFailure(`${role}须为已登记人物或玩家`);}
    if(id!=='player'&&!state.npcs?.[id])throw preconditionFailure(`${role}须为已登记人物或玩家`);
    return id;
}
function here(state,id){return id==='player'?state.player?.hp>0&&awake(state,'player',state.player):state.npcs[id]?.location===state.location&&awake(state,id,state.npcs[id]);}
function assertPresent(state,ids,why){for(const id of ids)if(!here(state,id))throw preconditionFailure(`${why}须在场且清醒`);}

// 被骗者把说法当事实记住；完整人物的记忆流里它是一条可转述的传闻。
function believe(d,engine,lie,to,eventId){
    const state=d.get('state'),minute=state.minute,claim=lie.tellings.findLast(t=>t.to===to).claim;
    const memoryId=`${to}::${lie.key}`;
    d.set(['memories',memoryId],{subject:to,key:lie.key,content:claim,keywords:clone(lie.keywords),pinned:d.get('memories',memoryId,'pinned')??false,minute,source:lie.liar,sourceType:'听说',sourceEvent:eventId});
    if(to==='player'||engine.byId.get(to)?.tier!=='full')return;
    const stream=state.npcs[to].memoryStream??[],id=`${eventId}:lie_${lie.id.slice(4)}`;
    if(stream.some(r=>r.id===id))return;
    d.set(['state','npcs',to,'memoryStream'],[...stream,{id,sourceEvent:eventId,kind:'rumor',minute,location:state.location,participants:[lie.liar,to],
        content:claim,sourceType:'听说',heardFrom:lie.liar,salience:2,emotion:'平静',...(lie.entities.length?{entities:clone(lie.entities)}:{}),
        ...(lie.private?{private:true,permittedRecipients:[]}:{rumor:lieRumorId(lie.id),rumorSource:lie.liar})}]);
}
// 说谎者自己知道实情；私密，不外传。
function liarKnows(d,engine,lie,to,eventId){
    if(lie.liar==='player'||engine.byId.get(lie.liar)?.tier!=='full')return;
    const state=d.get('state'),stream=state.npcs[lie.liar].memoryStream??[],id=`${eventId}:lie_told_${lie.id.slice(4)}`;
    if(stream.some(r=>r.id===id))return;
    d.set(['state','npcs',lie.liar,'memoryStream'],[...stream,{id,sourceEvent:eventId,kind:'lie',minute:state.minute,location:state.location,participants:[lie.liar,to],
        content:`对${nameOf(engine,state,to)}谎称“${lie.tellings.findLast(t=>t.to===to).claim}”；实情：${lie.truth}；动机：${lie.motive}`,sourceType:'亲历',salience:3,emotion:'平静',private:true,permittedRecipients:[]}]);
}

// world_remember{subject:被骗者,source:说谎者,key,content:说法,truth,motive,knowers,keywords}
export function recordLie(d,engine,args,eventId){
    const state=d.get('state'),liar=person(engine,state,args.source,'说谎者source'),to=person(engine,state,args.subject,'被骗者subject');
    if(liar===to)throw preconditionFailure('说谎者与被骗者不能是同一人');
    const key=text(args.key,100),claim=validateMemory(args.content),truth=validateMemory(args.truth);
    if(normalize(claim)===normalize(truth))throw preconditionFailure('说法与真相相同，不是谎言');
    const motive=args.motive===undefined?'未说明':text(args.motive,200);
    if(args.knowers!==undefined&&(!Array.isArray(args.knowers)||args.knowers.length>8))throw preconditionFailure('知情者最多8人');
    const knowers=[...new Set([liar,...(args.knowers??[]).map(v=>person(engine,state,v,'知情者'))])].sort();
    if(knowers.includes(to))throw preconditionFailure('被骗者不能同时是知情者');
    assertPresent(state,[liar,to],'说谎者与被骗者');
    const keywords=(args.keywords??[]).map(v=>text(v,60)).slice(0,12),entities=[];
    for(const word of keywords){try{const id=engine.resolve(word);if(!entities.includes(id))entities.push(id);}catch{}}
    const id=lieRecordKey(liar,key),old=state.records?.[id];
    if(old&&old.truth!==truth)throw preconditionFailure('同一谎言的真相已登记，不能改写');
    if(old?.tellings.some(t=>t.to===to&&t.claim===claim))return{lie:id,duplicate:true};
    const place=engine.byId.get(state.location);
    const isPrivate=Boolean(old?.private)||['private','secret'].includes(place?.access?.mode)||[liar,to,...knowers,...entities].some(x=>minor(engine,state,x));
    const lie={category:'lie',key,liar,truth,motive,knowers:old?[...new Set([...old.knowers,...knowers])].sort():knowers,keywords:old?.keywords??keywords,entities:old?.entities??entities,
        claim:old?.claim??claim,tellings:[...old?.tellings??[],{to,claim,minute:state.minute,location:state.location,sourceEvent:eventId}],
        exposures:old?.exposures??{},status:'未揭穿',private:isPrivate,minute:old?.minute??state.minute,sourceEvent:old?.sourceEvent??eventId};
    d.set(['state','records',id],lie);
    const row={id,...lie};believe(d,engine,row,to,eventId);liarKnows(d,engine,row,to,eventId);
    const detail={lie:id,liar,to,claim,private:isPrivate};
    // U7 识破：灵智够高的被骗者对同一说谎者前后不一的说法起疑。
    if(to!=='player'){
        const mind=intelligenceOf(engine,d.get('state'),to),changed=old?.tellings.some(t=>t.to===to&&t.claim!==claim);
        const told=liesToldBy(d.get('state'),liar).filter(r=>toldTo(r,to));
        if(mind?.level>=2&&(changed||told.length>=Math.max(2,mind.adaptAfter))){
            const open=told.filter(r=>!r.exposures?.[to]);
            Object.assign(detail,exposeLies(d,engine,open,to,{route:LIE_ROUTES.insight,by:to,evidence:changed?'同一件事前后说法不一':`${told.length}次说法互相对不上`},eventId));
        }
    }
    return detail;
}

function relevant(engine,state,lie,memory){
    const ids=new Set([lie.liar,...lie.entities]),names=[...ids].map(id=>nameOf(engine,state,id)).filter(n=>n?.length>=2);
    return [...memory.participants??[],...memory.entities??[]].some(id=>ids.has(id))||names.some(n=>String(memory.content??'').includes(n))||(memory.keywords??[]).some(k=>lie.keywords.includes(k));
}
const fromLie=(lie,memory)=>memory.rumor===lieRumorId(lie.id)||String(memory.id).includes(`lie_${lie.id.slice(4)}`)||memory.sourceEvent&&lie.tellings.some(t=>t.sourceEvent===memory.sourceEvent);

// 已登记谎言的揭穿请求：world_remember{subject:被骗者,key:谎言key,source:证据}。
// 没有对应谎言时返回 null，交回普通记忆写入。
export function exposeLieCall(d,engine,args,eventId){
    const state=d.get('state');let to;try{to=engine.resolve(args.subject);}catch{return null;}
    const found=lies(state).filter(r=>r.key===args.key&&toldTo(r,to)&&!r.exposures?.[to]);
    if(!found.length)return null;
    if(found.length>1)throw preconditionFailure('多名说谎者对此人用了同一谎言key，无法确定揭穿对象');
    const lie=found[0],source=args.source;if(typeof source!=='string'||!source.trim())throw preconditionFailure('揭穿谎言须在source写明知情者、证据物品或记忆编号');
    validateMemory(args.content);
    let id=null;try{id=engine.resolve(source);}catch{}
    if(id&&(id==='player'||state.npcs?.[id])){
        if(!lie.knowers.includes(id)||id===to)throw preconditionFailure('开口者不是这条谎言的知情者');
        assertPresent(state,[id,to],'知情者与被骗者');
        return exposeLies(d,engine,[lie],to,{route:LIE_ROUTES.knower,by:id,evidence:args.content},eventId);
    }
    if(id?.startsWith('item_')){
        if(!lie.entities.includes(id))throw preconditionFailure('该物品与这条谎言无关');
        if(engine.quantity(d,'player',id)<=0)throw preconditionFailure('玩家没有可出示的这件证据');
        assertPresent(state,['player',to],'出示证据双方');
        return exposeLies(d,engine,[lie],to,{route:to==='player'?LIE_ROUTES.contradiction:LIE_ROUTES.evidence,by:'player',evidence:id},eventId);
    }
    // 记忆证据：被骗者自己的亲历记录是矛盾证据；玩家的有源记忆可当面出示。
    const playerMemory=d.get('memories',source)?.subject==='player'?d.get('memories',source):null;
    const own=to==='player'?playerMemory:state.npcs[to]?.memoryStream?.find(r=>r.id===source)??null;
    const memory=own??(to!=='player'?playerMemory:null);
    if(!memory)throw preconditionFailure('揭穿证据不存在：source须为知情者、相关物品或已有记忆编号');
    const firsthand=own&&to!=='player'?FIRSTHAND.has(memory.sourceType):!memory.rumor&&memory.sourceType!=='听说'&&memory.reliability!=='未核实'&&memory.source!==lie.liar&&!memory.exposedLie;
    if(!firsthand||fromLie(lie,memory))throw preconditionFailure('揭穿证据须是亲历或有源记录，不能是听来的话或谎言本身');
    if(!relevant(engine,state,lie,memory))throw preconditionFailure('该记录与这条谎言无关');
    if(!own)assertPresent(state,['player',to],'出示证据双方');
    return exposeLies(d,engine,[lie],to,{route:own?LIE_ROUTES.contradiction:LIE_ROUTES.evidence,by:own?to:'player',evidence:source},eventId);
}

export function exposeLies(d,engine,rows,to,{route,by,evidence},eventId){
    const state=d.get('state'),minute=state.minute,exposed=[];
    for(const lie of rows){
        if(lie.exposures?.[to])continue;
        const exposures={...lie.exposures,[to]:{route,by,evidence,minute,sourceEvent:eventId}};
        const all=[...new Set(lie.tellings.map(t=>t.to))].every(x=>exposures[x]);
        const {id,...record}=lie;d.set(['state','records',id],{...record,exposures,status:all?'已揭穿':'部分揭穿'});exposed.push(lie);
        if(to==='player'){
            const memoryId=`player::${lie.key}`,row=d.get('memories',memoryId);
            if(row?.source===lie.liar)d.set(['memories',memoryId],{...row,content:`${nameOf(engine,state,lie.liar)}曾说“${row.content}”，已揭穿：${lie.truth}`,sourceType:route,exposedLie:id});
            continue;
        }
        // 被骗者记仇：立场下降，记忆里留下这件事。
        const evidenceKey=`${id}:exposed:${to}`;
        if(!recordStandingEvidence(d,engine,{key:evidenceKey,sourceEvent:eventId,eventType:'受骗',from:to,to:lie.liar,minute,delta:clone(LIE_EXPOSURE),reason:lie.truth}))
            adjustStanding(d,engine,to,lie.liar,LIE_EXPOSURE.trust,{sourceEvent:eventId,reason:`deceive:${id}`,via:`lie:${to}`,minute});
        if(engine.byId.get(to)?.tier==='full'){
            const stream=d.get('state','npcs',to,'memoryStream')??[],memoryId=`${eventId}:grudge_${id.slice(4)}`;
            if(!stream.some(r=>r.id===memoryId))d.set(['state','npcs',to,'memoryStream'],[...stream,{id:memoryId,sourceEvent:eventId,kind:'grudge',minute,location:state.location,
                participants:[to,lie.liar],content:`发现${nameOf(engine,state,lie.liar)}骗了自己：说“${lie.tellings.findLast(t=>t.to===to).claim}”，实情是${lie.truth}`,
                sourceType:'亲历',salience:4,emotion:'愤怒',grudge:{against:lie.liar,lie:id},...(lie.private?{private:true,permittedRecipients:[]}:{})}]);
        }
    }
    if(!exposed.length)return{};
    const liar=exposed[0].liar,hidden=exposed.some(l=>l.private);
    const witnesses=Object.entries(state.npcs??{}).filter(([id,n])=>n.location===state.location&&awake(state,id,n)&&![liar,to].includes(id)).map(([id])=>id).sort();
    return{exposed:exposed.map(l=>l.id),route,truth:exposed.map(l=>l.truth),
        lieEvent:{verb:'deceive',actor:liar,target:to,value:exposed.length,witnesses,tags:['lie','exposed',`route:${route}`,...(hidden?['private']:[])],lies:exposed.map(l=>l.id),route,by}};
}

// 审稿者用：这个人说过的谎（只给审查证据，不进玩家可见文本）。
export function lieKnowledge(state,liar){
    return liesToldBy(state,liar).map(r=>({id:r.id,key:r.key,claims:[...new Set(r.tellings.map(t=>t.claim))],truth:r.truth,to:[...new Set(r.tellings.map(t=>t.to))],status:r.status,entities:r.entities}));
}
