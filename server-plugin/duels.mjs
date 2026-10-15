import {standing,adjustStanding} from './standing.mjs';
import {intelligenceOf} from './npc-intelligence.mjs';

const path=id=>['state','records',id];
const awake=n=>n&&!['死亡','濒死','昏迷'].includes(n.status)&&!/睡/.test(n.activity??'');
function present(d,engine,name){
    if(name==='player')return 'player';
    const id=engine.resolve(name,'npc'),n=d.get('state','npcs',id);
    if(!awake(n)||n.location!==d.get('state','location'))throw Error('约斗当事人与见证人须在场且清醒');
    return id;
}
function willing(engine,state,npc,rule){
    const definition=engine.byId.get(npc),traits=JSON.stringify(definition.personality??{}),mind=intelligenceOf(engine,state,npc)?.level??1;
    const regard=standing(engine,state,npc,'player'),brave=/好斗|勇|尚武|荣誉|荣譽|争强|直率/.test(traits),peaceful=/和平|温和|谨慎|稳重|安全|怯/.test(traits);
    const score=(brave?25:0)-(peaceful?20:0)-regard/2-(rule==='death'?mind*10+20:0);
    return {accept:score>=0,score,regard,intelligence:mind,temperament:brave?'尚武':peaceful?'慎战':'平常'};
}
export function activeDuel(d,engine,target){
    const now=d.get('state','minute'),location=d.get('state','location');
    return Object.values(d.get('state','records')??{}).find(r=>r.category==='duel'&&r.status==='已接受'&&r.opponent===target&&r.location===location&&r.expires>now
        &&awake(d.get('state','npcs',r.witness))&&d.get('state','npcs',r.witness,'location')===location);
}
export function duelAction(d,args,id){
    if(args.operation==='duel_challenge'){
        const challenger=args.speaker?present(d,this,args.speaker):'player',target=present(d,this,args.member);
        if(challenger===target||![challenger,target].includes('player'))throw Error('约斗须由玩家与一位人物参加');
        const witness=present(d,this,args.authority),rule=args.choice??'touch';
        if(witness==='player'||[challenger,target].includes(witness))throw Error('须有独立的在场见证人');
        if(!['touch','death'].includes(rule))throw Error('决斗规则为touch点到为止或death生死');
        const opponent=challenger==='player'?target:challenger,decision=willing(this,d.get('state'),opponent,rule);
        if(Object.values(d.get('state','records')??{}).some(r=>r.category==='duel'&&['已接受','待答复'].includes(r.status)&&r.expires>d.get('state','minute')))throw Error('已有未结束的战书');
        const key=`duel:${id}`,status=challenger==='player'?(decision.accept?'已接受':'已拒绝'):(decision.accept?'待答复':'已拒绝');
        const row={category:'duel',id:key,challenger,target,opponent,witness,rule,location:d.get('state','location'),minute:d.get('state','minute'),expires:d.get('state','minute')+1440,status,decision,sourceEvent:id};
        d.set(path(key),row);return {duel:key,status,decision,rule,witness};
    }
    const row=d.get(...path(args.proposal));
    if(row?.category!=='duel')throw Error('没有该战书');
    if(args.operation==='duel_answer'){
        if(row.target!=='player'||row.status!=='待答复'||row.expires<=d.get('state','minute'))throw Error('此战书不能由玩家答复');
        for(const p of [row.opponent,row.witness])present(d,this,p);
        if(row.location!==d.get('state','location'))throw Error('须在约斗现场答复');
        if(typeof args.consent!=='boolean')throw Error('须明确接受或拒绝战书');
        const next={...row,status:args.consent?'已接受':'已拒绝',answeredAt:d.get('state','minute')};d.set(path(row.id),next);return {duel:row.id,status:next.status};
    }
    if(args.operation==='duel_yield'){
        if(!activeDuel(d,this,row.opponent)||row.status!=='已接受')throw Error('决斗未在现场进行');
        return finishDuel(d,this,row,row.opponent,id,'认输');
    }
    throw Error('未知约斗操作');
}
export function finishDuel(d,engine,row,winner,eventId,reason){
    const next={...row,status:'已结束',winner,reason,endedAt:d.get('state','minute'),endEvent:eventId};d.set(path(row.id),next);
    const won=winner==='player';
    adjustStanding(d,engine,row.opponent,'player',won?3:1,{sourceEvent:eventId,reason:'正式决斗守约'});
    adjustStanding(d,engine,row.witness,'player',won?5:-2,{sourceEvent:eventId,reason:'见证正式决斗'});
    const key='duel_renown',old=d.get(...path(key))??{category:'duel_renown',wins:0,losses:0,fame:0};
    d.set(path(key),{...old,wins:old.wins+(won?1:0),losses:old.losses+(won?0:1),fame:old.fame+(won?3:-1)});
    return {duel:row.id,winner,status:'已结束',reason};
}
