import {standing,adjustStanding} from './standing.mjs';
import {intelligenceOf} from './npc-intelligence.mjs';
import {isEffective} from './lifecycle-state.mjs';

const path=id=>['state','records',id];
const awake=(n,engine,source,id)=>n&&isEffective(engine,source,id)&&!['濒死','昏迷'].includes(n.status)&&!n.scheduleTravel&&!n.cognitionTravel&&!/睡/.test(n.activity??'');
function present(d,engine,name){
    if(name==='player'){
        if(!awake(d.get('state','player'),engine,d,'player'))throw Error('约斗当事人与见证人须在场且清醒');
        return 'player';
    }
    const id=engine.resolve(name,'npc'),n=d.get('state','npcs',id);
    if(!awake(n,engine,d,id)||n.location!==d.get('state','location'))throw Error('约斗当事人与见证人须在场且清醒');
    return id;
}
function willing(engine,state,npc,opponent,rule){
    const definition=engine.byId.get(npc),traits=JSON.stringify(definition.personality??{}),mind=intelligenceOf(engine,state,npc)?.level??1;
    const regard=standing(engine,state,npc,opponent),brave=/好斗|勇|尚武|荣誉|荣譽|争强|直率/.test(traits),peaceful=/和平|温和|谨慎|稳重|安全|怯/.test(traits);
    const score=(brave?25:0)-(peaceful?20:0)-regard/2-(rule==='death'?mind*10+20:0);
    return {accept:score>=0,score,regard,intelligence:mind,temperament:brave?'尚武':peaceful?'慎战':'平常'};
}
import {activeDuel} from './combat-state.mjs';
export {activeDuel} from './combat-state.mjs';

export function duelAction(d,args,id){
    if(args.operation==='duel_challenge'){
        const challenger=present(d,this,args.speaker??'player'),target=present(d,this,args.member);
        if(challenger===target)throw Error('约斗须由两位不同的当事人参加');
        const witness=present(d,this,args.authority),rule=args.choice??'touch';
        if(witness==='player'||[challenger,target].includes(witness))throw Error('须有独立的在场见证人');
        if(!['touch','death'].includes(rule))throw Error('决斗规则为touch点到为止或death生死');
        const opponent=challenger==='player'?target:challenger,decision=willing(this,d.get('state'),opponent,opponent===challenger?target:challenger,rule);
        const decisions=Object.fromEntries([challenger,target].filter(p=>p!=='player').map(p=>[p,willing(this,d.get('state'),p,p===challenger?target:challenger,rule)]));
        const accepted=Object.values(decisions).every(p=>p.accept);
        if(Object.values(d.get('state','records')??{}).some(r=>r.category==='duel'&&['已接受','待答复'].includes(r.status)&&r.expires>d.get('state','minute')))throw Error('已有未结束的战书');
        const context=args.org?this.organizationDuelContext(d,args.org,challenger,target):{};
        const key=`duel:${id}`,status=!accepted?'已拒绝':target==='player'?'待答复':'已接受';
        const row={category:'duel',id:key,challenger,target,opponent,witness,rule,...context,location:d.get('state','location'),minute:d.get('state','minute'),expires:d.get('state','minute')+1440,status,decision,decisions,sourceEvent:id};
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
        const loser=args.speaker?present(d,this,args.speaker):'player',winner=row.challenger===loser?row.target:row.challenger;
        if(![row.challenger,row.target].includes(loser)||activeDuel(d,this,winner,loser)?.id!==row.id)throw Error('决斗未在现场进行');
        if(loser!=='player'&&args.consent!==true)throw Error('认输须由本人明确同意');
        present(d,this,winner);
        return finishDuel(d,this,row,winner,id,'认输');
    }
    throw Error('未知约斗操作');
}
export function finishDuel(d,engine,row,winner,eventId,reason){
    const current=d.get(...path(row.id));
    if(current?.status==='已结束')return {duel:row.id,winner:current.winner,status:current.status,reason:current.reason,duplicate:true};
    if(current?.status!=='已接受'||![row.challenger,row.target].includes(winner))throw Error('决斗未接受或胜者不是当事人');
    const next={...row,status:'已结束',winner,reason,endedAt:d.get('state','minute'),endEvent:eventId};d.set(path(row.id),next);
    if([row.challenger,row.target].includes('player')){
        const won=winner==='player';
        adjustStanding(d,engine,row.opponent,'player',won?3:1,{sourceEvent:eventId,reason:'正式决斗守约'});
        adjustStanding(d,engine,row.witness,'player',won?5:-2,{sourceEvent:eventId,reason:'见证正式决斗'});
        const key='duel_renown',old=d.get(...path(key))??{category:'duel_renown',wins:0,losses:0,fame:0};
        d.set(path(key),{...old,wins:old.wins+(won?1:0),losses:old.losses+(won?0:1),fame:old.fame+(won?3:-1)});
    }else adjustStanding(d,engine,row.witness,winner,5,{sourceEvent:eventId,reason:'见证正式决斗'});
    const succession=engine.settleOrganizationDuel(d,row,winner,eventId);
    return {duel:row.id,winner,status:'已结束',reason,...(succession?{succession}:{})};
}
