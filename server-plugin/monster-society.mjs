import {transferItems} from './items.mjs';
import {breakBossAgreement} from './boss-negotiation.mjs';
import {spendFactionAssets} from './faction-clock.mjs';
import {standing,HOSTILE} from './standing.mjs';

// Social standing of a monster settlement. A location with `monsterSociety`
// registers the settlement seat: {leader, neighbors:{loc:stance}, stances:{player},
// meetingPlace, motions:[{id,name}]}. Stances are stored per holder and target;
// agreements (trade, tribute, passage) are separate records and never overwrite
// the stance. Receipts `society_receipt:*` are the stable settlement evidence
// consumed by later quests; messages travel along real walking routes.
export const STANCES=['敌对','戒备','中立'];
const DAY=1440,PERIOD=10*DAY,KINDS=new Set(['trade','tribute','passage']);
const rec=id=>['state','records',id];
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
const awake=n=>n&&n.status!=='死亡'&&(n.hp===undefined||n.hp>0)&&!n.scheduleTravel&&!n.cognitionTravel&&!['濒死','昏迷'].includes(n.status)&&!/睡眠|睡觉|熟睡/.test(n.activity??'');
const shift=(stance,delta)=>STANCES[Math.max(0,Math.min(2,STANCES.indexOf(stance)+delta))];

export function validateMonsterSocieties(world){
    const errors=[],ids=new Set(world.locations.map(l=>l.id));
    for(const place of world.locations.filter(l=>l.monsterSociety!==undefined)){
        const c=place.monsterSociety,fail=m=>errors.push(`${place.id}.monsterSociety: ${m}`);
        if(!plain(c)){fail('参数无效');continue;}
        const boss=world.bosses?.find(b=>b.id===c.leader),npc=world.npcs.find(n=>n.id===boss?.actor);
        if(!boss||npc?.society!==place.id)fail('首领须为本聚居地居民身体的智能首领');
        for(const [target,stance]of Object.entries({...c.neighbors??{},...c.stances??{}}))
            if(!STANCES.includes(stance)||target!=='player'&&!ids.has(target)||target===place.id)fail(`初始态度无效：${target}`);
        if(c.stances&&Object.keys(c.stances).some(k=>k!=='player'))fail('stances只登记对玩家的初始态度');
        if(c.meetingPlace!==undefined&&!ids.has(c.meetingPlace))fail('议事地点不存在');
        if(c.motions!==undefined&&(!Array.isArray(c.motions)||c.motions.some(m=>!plain(m)||!/^\w{1,60}$/.test(m.id??'')||typeof m.name!=='string'||!m.name.trim())||
            new Set(c.motions.map(m=>m.id)).size!==c.motions.length))fail('议题编号或名称无效');
        else for(const m of c.motions??[])for(const k of ['opens','closes'])if(m[k]!==undefined&&!KINDS.has(m[k]))fail(`议题${m.id}.${k}须为trade、tribute或passage`);
        const motionIds=new Set((c.motions??[]).map(m=>m.id)),bodies=[...world.npcs,...world.residents??[]],seen=new Set();
        if(c.positions!==undefined&&!Array.isArray(c.positions))fail('内部立场须为列表');
        for(const p of Array.isArray(c.positions)?c.positions:[]){
            if(!plain(p)||!/^\w{1,60}$/.test(p.id??'')||typeof p.name!=='string'||!p.name.trim()||!Array.isArray(p.members)||!p.members.length){fail('内部立场编号、名称或成员无效');continue;}
            for(const id of p.members){if(bodies.find(n=>n.id===id)?.society!==place.id)fail(`立场${p.id}成员不属本聚居地：${id}`);if(seen.has(id))fail(`成员分属两组立场：${id}`);seen.add(id);}
            for(const [m,v]of Object.entries(p.stances??{}))if(!motionIds.has(m)||!['approve','reject'].includes(v))fail(`立场${p.id}对议题的态度无效：${m}`);
            if(p.persuasion!==undefined&&![10,15,20,25,30].includes(p.persuasion))fail(`立场${p.id}说服难度无效`);
        }
        if(c.supplies!==undefined){
            // Resource sources: produced by a member species at a place, or obtained from a registered neighbour.
            const items=new Set(world.items.map(i=>i.id)),species=new Set(bodies.filter(n=>n.society===place.id).map(n=>n.species));
            if(!Array.isArray(c.supplies)||!c.supplies.length||c.supplies.some(r=>!plain(r)||!items.has(r.item)||!ids.has(r.place)||(r.species===undefined)===(r.from===undefined)||
                r.species!==undefined&&!species.has(r.species)||r.from!==undefined&&!ids.has(r.from)||typeof r.use!=='string'||!r.use.trim()))fail('资源来源须登记物品、产地、本聚居地物种或来往邻地及用途');
            else for(const n of world.npcs.filter(n=>n.society===place.id))for(const item of Object.keys(n.inventory??{}))
                if(!c.supplies.some(r=>r.item===item))fail(`成员库存缺少登记来源：${n.id}/${item}`);
        }
    }
    return errors;
}
// Registered internal positions: who holds which stance on a motion.
const positionsOf=(engine,society)=>seat(engine,society)?.monsterSociety.positions??[];
export function positionOf(engine,society,member){return positionsOf(engine,society).find(p=>p.members.includes(member))??null;}
function motionStatus(state,society,motion){return state.records?.[`society_motion:${society}:${motion}`]?.status??'未提出';}
// A term a motion opens is refused while the leader's own position rejects that
// motion and the council has not passed it; a term a passed motion closes is refused.
export function termPositions(state,engine,society,term){
    const c=seat(engine,society).monsterSociety,leader=leaderOf(engine,society).actor,support=new Set(),oppose=new Set();let refused=null;
    for(const m of c.motions??[]){
        const passed=motionStatus(state,society,m.id)==='通过';
        if(m.closes===term&&passed)refused=`议事已通过“${m.name}”，不再立此类约定`;
        if(m.opens!==term&&m.closes!==term||passed&&m.opens===term)continue;
        for(const p of c.positions??[]){
            const v=p.stances?.[m.id];if(!v)continue;
            const favors=m.opens===term?v==='approve':v==='reject';
            (favors?support:oppose).add(p.id);
            if(!favors&&m.opens===term&&p.members.includes(leader))refused??=`首领所属“${p.name}”反对“${m.name}”，须先在议事处通过此议`;
        }
    }
    return{support:[...support].sort(),oppose:[...oppose].filter(id=>!support.has(id)).sort(),refused};
}

// The registered seat a location or actor belongs to, if any.
export function societyAt(engine,location){
    const seen=new Set();
    while(location&&!seen.has(location)){
        const place=engine.world.locations.find(l=>l.id===location);
        if(place?.monsterSociety)return place;
        seen.add(location);location=place?.parent;
    }
    return null;
}
export function societyOfActor(engine,id){
    const society=engine.world.npcs.find(n=>n.id===id)?.society;
    return society&&engine.world.locations.find(l=>l.id===society)?.monsterSociety?society:null;
}
const seat=(engine,id)=>engine.world.locations.find(l=>l.id===id&&l.monsterSociety);
const leaderOf=(engine,society)=>engine.world.bosses.find(b=>b.id===seat(engine,society).monsterSociety.leader);
const members=(engine,society)=>engine.world.npcs.filter(n=>n.society===society).map(n=>n.id).sort();

function initial(engine,holder,target){
    const own=seat(engine,holder)?.monsterSociety;
    if(own)return target==='player'?own.stances?.player??'戒备':own.neighbors?.[target]??'戒备';
    if(target==='player')return '中立';
    return seat(engine,target)?.monsterSociety.neighbors?.[holder]??'戒备';
}
export function stanceOf(state,engine,holder,target){
    return state.records?.[`stance:${holder}:${target}`]?.stance??initial(engine,holder,target);
}
function setStance(d,engine,holder,target,stance,{minute,sourceEvent,reason}){
    const key=`stance:${holder}:${target}`,old=d.get(...rec(key)),before=old?.stance??initial(engine,holder,target);
    if(before===stance)return before;
    d.set(rec(key),{category:'settlement_stance',holder,target,stance,minute,sourceEvent,reason,
        history:[...old?.history??[],{from:before,to:stance,minute,sourceEvent,reason}]});
    return before;
}
function receipt(d,{society,kind,eventId,...rest}){
    const key=`society_receipt:${eventId}:${kind}${rest.agreement?`:${rest.agreement}`:''}`;
    if(!d.get(...rec(key)))d.set(rec(key),{category:'society_receipt',society,kind,subject:'player',minute:d.get('state','minute'),sourceEvent:eventId,...rest});
    return key;
}
// Later quest cards read these instead of narration.
export function societyReceipts(document,society){
    return Object.entries(document.state.records??{}).filter(([,r])=>r.category==='society_receipt'&&(!society||r.society===society)).map(([id,r])=>({id,...r}));
}

function sendNews(d,engine,{from,to,actor,victim,act,sourceEvent,minute}){
    const key=`society_news:${sourceEvent}:${to}`;if(d.get(...rec(key))||from===to&&to!==victim)return;
    let travel=0;
    if(from!==to){try{travel=engine.route(from,to,'walk',minute,d.document.randomSeed).minutes;}catch{return;}}
    d.set(rec(key),{category:'society_news',from,to,actor,victim,act,sourceEvent,sentAt:minute,arrivesAt:minute+travel,status:'在途'});
}
function broadcast(d,engine,society,act,sourceEvent){
    const minute=d.get('state','minute');
    for(const to of Object.keys(seat(engine,society).monsterSociety.neighbors??{}).sort())
        sendNews(d,engine,{from:society,to,actor:'player',victim:society,act,sourceEvent,minute});
}
// News changes the receiver's view of the actor by its own view of the victim:
// harming a friend worsens, harming an enemy improves, a wary listener holds.
export function advanceSocietyNews(d,engine,after){
    const due=Object.entries(d.get('state','records')??{}).filter(([,r])=>r.category==='society_news'&&r.status==='在途'&&r.arrivesAt<=after)
        .sort(([a,x],[b,y])=>x.arrivesAt-y.arrivesAt||a.localeCompare(b));
    for(const [key,n]of due){
        const view=n.to===n.victim?'中立':stanceOf(d.get('state'),engine,n.to,n.victim);
        const delta=view==='戒备'?0:(n.act==='harm'?-1:1)*(view==='敌对'?-1:1);
        const before=stanceOf(d.get('state'),engine,n.to,n.actor),stance=shift(before,delta);
        setStance(d,engine,n.to,n.actor,stance,{minute:n.arrivesAt,sourceEvent:n.sourceEvent,reason:`${n.from}传来消息`});
        d.set(rec(key),{...n,status:'已送达',before,after:stance});
    }
    for(const [key,a]of Object.entries(d.get('state','records')??{}))if(a.category==='society_agreement'&&a.status==='有效'){
        if(a.nextDue!==null&&a.nextDue<=after)breach(d,engine,key,a,'player',`第${a.installments.length+1}期未按时交付`,`${key}:due:${a.nextDue}`,a.nextDue);
        else if(a.nextDue===null&&a.expires<=after)d.set(rec(key),{...a,status:'到期',endedAt:a.expires});
    }
}
function breach(d,engine,key,a,by,reason,sourceEvent,minute=d.get('state','minute')){
    d.set(rec(key),{...a,status:'背约',breachedBy:by,reason,endedAt:minute});
    if(by!=='player'){receipt(d,{society:a.society,kind:'agreement_breached',eventId:sourceEvent,agreement:key,by,reason});return;}
    const before=setStance(d,engine,a.society,'player','敌对',{minute,sourceEvent,reason});
    const leader=leaderOf(engine,a.society);breakBossAgreement(d,leader.actor,sourceEvent,engine);
    receipt(d,{society:a.society,kind:'agreement_breached',eventId:sourceEvent,agreement:key,by,reason,stance:{before,after:'敌对'}});
    broadcast(d,engine,a.society,'harm',sourceEvent);
}
const active=(d,society)=>Object.entries(d.get('state','records')??{}).filter(([,r])=>r.category==='society_agreement'&&r.society===society&&r.status==='有效');

// A harmful act against the settlement: stance falls, live agreements are broken.
export function societyHarmed(d,engine,society,{eventId,reason,toHostile=false}){
    const before=stanceOf(d.get('state'),engine,society,'player'),minute=d.get('state','minute');
    const live=active(d,society);
    const after=live.length||toHostile?'敌对':shift(before,-1);
    for(const [key,a]of live)breach(d,engine,key,a,'player',reason,eventId);
    setStance(d,engine,society,'player',after,{minute,sourceEvent:eventId,reason});
    if(!live.length)broadcast(d,engine,society,'harm',eventId);
    return{before,after,breached:live.map(([key])=>key)};
}

// A gift to a member eases the settlement one step, at most once per period.
export function societyHelped(d,engine,society,{eventId,reason}){
    const before=stanceOf(d.get('state'),engine,society,'player'),minute=d.get('state','minute');
    const recent=societyReceipts(d.document,society).some(r=>r.kind==='gift'&&r.stance&&r.stance.before!==r.stance.after&&minute-r.minute<PERIOD);
    const after=recent?before:shift(before,1);
    setStance(d,engine,society,'player',after,{minute,sourceEvent:eventId,reason});
    if(after!==before)broadcast(d,engine,society,'aid',eventId);
    return{before,after};
}

// World-event subscriber: hostile harm (blade or spell) to a member, a theft
// from a member that someone saw, and a gift to a member reach the settlement.
export function recordSocietyActs(d,engine,events){
    for(const e of events){
        if(e.actor!=='player'||!e.target)continue;
        const society=societyOfActor(engine,e.target);if(!society)continue;
        if(e.verb==='harm'&&e.tags.includes('hostile')){
            const result=societyHarmed(d,engine,society,{eventId:e.id,reason:e.tags.includes('magic')?'以法术伤及成员':'对成员发起交锋',toHostile:true});
            receipt(d,{society,kind:'clash',eventId:e.id,target:e.target,stance:{before:result.before,after:result.after},breached:result.breached});
        }else if(e.legacy){continue;
        }else if(e.verb==='steal'&&e.witnesses.length){
            const result=societyHarmed(d,engine,society,{eventId:e.id,reason:'偷窃成员财物被目击'});
            receipt(d,{society,kind:'theft',eventId:e.id,target:e.target,stance:{before:result.before,after:result.after},breached:result.breached});
        }else if(e.verb==='gift'&&e.value>0){
            const result=societyHelped(d,engine,society,{eventId:e.id,reason:'向成员赠礼'});
            receipt(d,{society,kind:'gift',eventId:e.id,target:e.target,stance:{before:result.before,after:result.after}});
        }
    }
}

export function assertSocietyTrade(d,engine,buyer,seller){
    for(const [npc,other]of [[buyer,seller],[seller,buyer]]){
        if(other!=='player'||npc==='player')continue;
        const society=societyOfActor(engine,npc),village=engine.world.npcs.find(n=>n.id===npc)?.settlement,state=d.get('state');
        if(society&&standing(engine,state,society,'player')<=HOSTILE)throw Error('聚居地对你敌对，成员拒绝交易');
        if(!society&&village&&state.records?.[`stance:${village}:player`]?.stance==='敌对')throw Error('本村已对你敌对，拒绝交易');
    }
}
export function assertSocietyEntry(d,engine,place){
    const society=societyAt(engine,place.id);
    if(society&&standing(engine,d.get('state'),society.id,'player')<=HOSTILE)throw Error('聚居地对你敌对，拒绝你进入');
}
// Passage and tribute agreements open only the leader's committed sites.
export function passageAllows(document,place,owner,operation){
    return ['enter','investigate'].includes(operation)&&Object.values(document.state.records??{}).some(r=>r.category==='society_agreement'&&r.status==='有效'&&
        ['passage','tribute'].includes(r.kind)&&r.locations.includes(place.id)&&r.parties.includes(owner)&&r.expires>document.state.minute);
}

export function societyView(state,engine,boss){
    const society=societyOfActor(engine,boss.actor);if(!society)return undefined;
    return{society,stance:stanceOf(state,engine,society,'player'),agreements:Object.entries(state.records??{}).filter(([,r])=>r.category==='society_agreement'&&r.society===society&&r.status==='有效')
        .map(([id,r])=>({id,kind:r.kind,expires:r.expires,nextDue:r.nextDue}))};
}

// Called by world_lair negotiate when `term` or `contract` is given.
export function societyAgreement(d,engine,boss,args,eventId,negotiate){
    const society=societyOfActor(engine,boss.actor);
    if(!society)throw Error('只有登记聚居地的首领能立约');
    const now=d.get('state','minute');
    if(args.contract!==undefined)return installment(d,engine,boss,society,args.contract,eventId);
    const key=`society_agreement:${eventId}`,prior=d.get(...rec(key));
    if(prior)return{...negotiate(),agreement:key,terms:prior,duplicate:true};
    if(!KINDS.has(args.term))throw Error('约定须为trade贸易、tribute朝贡或passage通行');
    if(!Number.isSafeInteger(args.days)||args.days<1||args.days>90)throw Error('约定期限须为1至90天');
    if(standing(engine,d.get('state'),society,'player')<=HOSTILE)throw Error('聚居地对你敌对，首领不肯立约');
    if(args.term==='trade'&&(!args.offer?.length||!args.request?.length))throw Error('贸易约定须同时有交物与索物');
    if(args.term==='tribute'&&(!args.offer?.length||args.request?.length))throw Error('朝贡约定只由你按期交物');
    const stances=termPositions(d.get('state'),engine,society,args.term);
    if(stances.refused)throw Error(stances.refused);
    const territory=boss.cognition?.territory??[boss.residence.location];
    let locations=[];
    if(args.term!=='trade'){
        const wanted=args.location?[engine.resolve(args.location)]:territory;
        if(wanted.some(id=>!engine.world.locations.some(l=>l.id===id)))throw Error('通行约定须指向实际地点');
        if(wanted.some(id=>!territory.includes(id)))throw Error('首领只能承诺其辖区');
        const consent=id=>['private','council'].includes(engine.byId.get(id)?.access?.mode);
        if(args.location&&consent(wanted[0]))throw Error('私宅与议事区仍须住户或负责人当面许可');
        locations=wanted.filter(id=>!consent(id));
    }
    const c=id=>seat(engine,society).monsterSociety.positions.find(p=>p.id===id).name;
    const result=negotiate();
    if(!result.accepted)return{...result,agreement:null};
    const expires=now+args.days*DAY,firstDue=now+PERIOD;
    const row={category:'society_agreement',id:key,society,leader:boss.actor,kind:args.term,locations,parties:[boss.actor,...members(engine,society)],
        offer:result.terms.offer,request:result.terms.request,signedAt:now,expires,nextDue:args.term!=='passage'&&firstDue<=expires?firstDue:null,
        installments:[{event:eventId,minute:now}],status:'有效',sourceEvent:eventId,positions:{support:stances.support,oppose:stances.oppose}};
    d.set(rec(key),row);
    receipt(d,{society,kind:'agreement_signed',eventId,agreement:key,term:args.term,positions:row.positions});
    return{...result,agreement:key,terms:row,...(stances.oppose.length?{opposedBy:stances.oppose.map(id=>c(id))}:{})};
}
function installment(d,engine,boss,society,id,eventId){
    const a=d.get(...rec(id));
    if(a?.category!=='society_agreement'||a.society!==society)throw Error('没有与这位首领订立的约定');
    if(a.installments.some(i=>i.event===eventId))return{agreement:id,terms:a,duplicate:true};
    if(a.status!=='有效'||a.nextDue===null)throw Error('约定已结束或本期无须交付');
    const actor=engine.actor(d,boss.actor);
    if(!awake(actor)||actor.location!==d.get('state','location'))throw Error('履约需要首领清醒在场');
    if(a.offer.some(r=>engine.quantity(d,'player',r.item)<r.quantity))throw Error('你没有足够的实际物资履约');
    if(a.request.some(r=>engine.quantity(d,boss.actor,r.item)<r.quantity)){
        breach(d,engine,id,a,boss.actor,'首领库存不足，未能交付约定物资',eventId);
        return{agreement:id,kept:false,breachedBy:boss.actor};
    }
    for(const r of a.offer)transferItems(d,engine,'player',boss.actor,r.item,r.quantity);
    for(const r of a.request)transferItems(d,engine,boss.actor,'player',r.item,r.quantity);
    const now=d.get('state','minute'),next=a.nextDue+PERIOD;
    d.set(rec(id),{...a,installments:[...a.installments,{event:eventId,minute:now}],nextDue:next<=a.expires?next:null});
    const before=stanceOf(d.get('state'),engine,society,'player'),after=shift(before,1);
    setStance(d,engine,society,'player',after,{minute:now,sourceEvent:eventId,reason:'按期履约'});
    receipt(d,{society,kind:'agreement_kept',eventId,agreement:id,stance:{before,after}});
    broadcast(d,engine,society,'aid',eventId);
    d.say(`${actor.name}收下本期约定物资`);
    return{agreement:id,kept:true,stance:after,nextDue:d.get(...rec(id)).nextDue};
}

// Detection during infiltration: wary hosts expel, an already hostile one fights.
export function infiltrationDetected(d,engine,place,watcher,eventId){
    const society=societyAt(engine,place.id)?.id;
    if(!society)return{response:'驱逐'};
    const result=societyHarmed(d,engine,society,{eventId,reason:`潜入${place.name}被发现`});
    const response=result.before==='敌对'?'交锋':'驱逐';
    receipt(d,{society,kind:'infiltration_detected',eventId,site:place.id,watcher,response,stance:{before:result.before,after:result.after},breached:result.breached});
    return{response,stance:result.after,breached:result.breached};
}
export function infiltrationSucceeded(d,engine,place,eventId){
    const society=societyAt(engine,place.id)?.id;
    if(society)receipt(d,{society,kind:'infiltration',eventId,site:place.id,detected:false});
}

// Internal deliberation reuses governance_propose/opinion/close. A closed
// motion is a stable record that T109 clock stages read with a record condition.
export function societyGovernance(d,engine,args,eventId,society){
    const c=seat(engine,society).monsterSociety,now=d.get('state','minute'),meeting=c.meetingPlace??leaderOf(engine,society).residence.location;
    const motion=m=>{const row=c.motions?.find(x=>x.id===m);if(!row)throw Error('没有登记的议题');return row;};
    const key=m=>`society_motion:${society}:${m}`;
    if(args.operation==='governance_inspect'){
        // Public claims and stances are known to anyone asking; an organisation's
        // private aims are only heard inside the meeting place.
        const inside=d.get('state','location')===meeting,org=(engine.world.factions??[]).find(f=>f.contactAnchor===society&&f.clock?.settlement===society);
        return{settlement:society,stance:stanceOf(d.get('state'),engine,society,'player'),
        motions:(c.motions??[]).map(m=>({...m,...d.get(...rec(key(m.id)))??{status:'未提出'}})),
        positions:(c.positions??[]).map(p=>({id:p.id,name:p.name,claim:p.claim,members:p.members,stances:p.stances??{}})),
        ...(org?{organization:{id:org.id,name:org.name,publicGoal:org.publicGoal,...(inside?{privateGoal:org.privateGoal,divisions:org.divisions}:{}),
            issues:Object.entries(d.get('state','records')??{}).filter(([,r])=>r.category==='society_issue'&&r.settlement===society).map(([id,r])=>({id,issue:r.issue,status:r.status,outcome:r.outcome??null}))}}:{}),
        actionScope:{kind:'instant'}};
    }
    if(d.get('state','location')!==meeting)throw Error('须在聚居地议事处办理');
    const present=name=>{const id=engine.resolve(name,'npc'),n=d.get('state','npcs',id);
        if(engine.world.npcs.find(x=>x.id===id)?.society!==society||!(engine.byId.get(id)?.age>=18)||!awake(n)||n.location!==meeting)throw Error('需要本聚居地清醒在场的成年成员');return id;};
    if(args.operation==='governance_propose'){
        const m=motion(args.issue),old=d.get(...rec(key(m.id)));
        if(old?.status==='议事中')throw Error('该议题正在议事');
        if(standing(engine,d.get('state'),society,'player')<=HOSTILE)throw Error('聚居地对你敌对，不接受你提议');
        const row={category:'society_motion',society,motion:m.id,name:m.name,proposer:'player',status:'议事中',opinions:[],minute:now,sourceEvent:eventId,rounds:[...old?.rounds??[],...old?[{status:old.status,closedAt:old.closedAt}]:[]]};
        d.set(rec(key(m.id)),row);return{proposal:key(m.id),meeting:row};
    }
    const id=args.proposal??key(args.issue),row=d.get(...rec(id));
    if(row?.category!=='society_motion'||row.society!==society)throw Error('没有该议题记录');
    if(args.operation==='governance_opinion'){
        if(row.status!=='议事中')throw Error('议题已闭合');
        const speaker=present(args.speaker);
        if(!['approve','reject','abstain'].includes(args.opinion)||typeof args.content!=='string'||!args.content.trim())throw Error('意见须为approve、reject或abstain并附原话');
        const old=row.opinions.find(o=>o.speaker===speaker);if(old)return{proposal:id,opinion:old,duplicate:true};
        // A member speaks for its registered position; departing from it needs
        // the player's persuasion, otherwise the member holds the position's line.
        const position=positionOf(engine,society,speaker),held=position?.stances?.[row.motion];
        let entry={speaker,opinion:args.opinion,content:args.content.trim(),minute:now,sourceEvent:eventId,...(position?{position:position.id}:{})};
        if(held&&args.opinion!==held){
            const check=engine.check(d,{attribute:'魅力',difficulty:position.persuasion??15},eventId);
            entry=check.success?{...entry,persuaded:{from:held,difficulty:position.persuasion??15}}:
                {...entry,opinion:held,content:position.claim,heldPosition:{asked:args.opinion,difficulty:position.persuasion??15}};
        }
        d.set(rec(id),{...row,opinions:[...row.opinions,entry]});return{proposal:id,opinion:entry};
    }
    if(args.operation==='governance_close'){
        if(row.status!=='议事中')return{proposal:id,meeting:row,duplicate:true};
        if(present(args.authority)!==leaderOf(engine,society).actor)throw Error('须由聚居地首领在场闭合议题');
        // Present adult members who did not speak are counted by their position's stance.
        const state=d.get('state'),spoken=new Set(row.opinions.map(o=>o.speaker));
        const implicit=engine.world.npcs.filter(n=>n.society===society&&n.age>=18&&!spoken.has(n.id)&&awake(state.npcs?.[n.id])&&state.npcs[n.id].location===meeting)
            .map(n=>({n,p:positionOf(engine,society,n.id)})).filter(({p})=>p?.stances?.[row.motion])
            .map(({n,p})=>({speaker:n.id,opinion:p.stances[row.motion],content:p.claim,position:p.id,implicit:true,minute:now,sourceEvent:eventId}));
        const all=[...row.opinions,...implicit],yes=all.filter(o=>o.opinion==='approve').length,no=all.filter(o=>o.opinion==='reject').length;
        const closed={...row,opinions:all,status:yes>no?'通过':'否决',closedAt:now,closeEvent:eventId};
        d.set(rec(id),closed);
        return{proposal:id,meeting:closed,note:'实际后果由已发布的势力时钟按此记录推进'};
    }
    throw Error('聚居地议事只支持governance_inspect、propose、opinion、close');
}

// Faction clock consumer: one settlement's act against or for another travels
// as a message; the receiver changes its stance toward the actor on arrival.
export const societyNewsConsumer={
    validate(engine,effect){
        if(!engine.world.locations.some(l=>l.id===effect.target)||!['harm','aid'].includes(effect.act))throw Error('聚居地消息效果无效');
    },
    apply(d,engine,effect,context){
        if(effect.target===context.settlement)return{applied:false,reason:'不能对自身传消息'};
        sendNews(d,engine,{from:context.settlement,to:effect.target,actor:context.settlement,victim:effect.target,act:effect.act,sourceEvent:context.sourceEvent,minute:context.minute});
        return{applied:true,kind:effect.kind,target:effect.target,act:effect.act};
    },
};

// Faction clock consumer for a settlement's internal dispute. A plain stage
// moves the dispute's public status; a deciding stage reads the closed motion
// and applies that outcome's own price, item shares to named members and news.
const OUTCOME_KEYS=['result','cost','shares','news'];
export const societyIssueConsumer={
    validate(engine,effect){
        const place=seat(engine,effect.settlement),c=place?.monsterSociety;
        if(!c||!/^\w{1,60}$/.test(effect.issue??'')||typeof effect.status!=='string'||!effect.status.trim())throw Error('聚居地议题效果须指向登记聚居地、议题与阶段');
        if(effect.motion===undefined&&effect.outcomes===undefined)return;
        if(!c.motions?.some(m=>m.id===effect.motion)||!plain(effect.outcomes)||Object.keys(effect.outcomes).sort().join()!=='否决,通过')throw Error('议题结果须按已登记议题的通过与否决分别给出');
        for(const o of Object.values(effect.outcomes)){
            if(!plain(o)||Object.keys(o).some(k=>!OUTCOME_KEYS.includes(k))||typeof o.result!=='string'||!o.result.trim())throw Error('议题结果参数无效');
            if(o.cost!==undefined&&(!plain(o.cost)||Object.keys(o.cost).some(k=>k!=='items')||Object.entries(o.cost.items??{}).some(([id,n])=>!engine.world.items.some(i=>i.id===id)||!Number.isSafeInteger(n)||n<1)))throw Error('议题结果代价无效');
            for(const r of o.shares??[])if(engine.world.npcs.find(n=>n.id===r.to)?.society!==effect.settlement||!engine.world.items.some(i=>i.id===r.item)||!Number.isSafeInteger(r.quantity)||r.quantity<1)throw Error('议题分配须给本聚居地具名成员实际物品');
            for(const n of o.news??[])if(!c.neighbors?.[n.target]||!['harm','aid'].includes(n.act))throw Error('议题消息须送往登记邻地');
        }
    },
    apply(d,engine,effect,context){
        const key=`society_issue:${effect.settlement}:${effect.issue}`,old=d.get(...rec(key));
        let row={outcome:null,motion:null,...old,category:'society_issue',settlement:effect.settlement,issue:effect.issue,status:effect.status,
            minute:context.minute,sourceEvent:context.sourceEvent,history:[...old?.history??[],{status:effect.status,minute:context.minute,sourceEvent:context.sourceEvent}]};
        if(effect.outcomes){
            const status=motionStatus(d.get('state'),effect.settlement,effect.motion),o=effect.outcomes[status];
            if(!o)return{applied:false,reason:'议题尚未在议事处闭合'};
            const items={};for(const [id,n]of Object.entries(o.cost?.items??{}))items[id]=(items[id]??0)+n;
            for(const r of o.shares??[])items[r.item]=(items[r.item]??0)+r.quantity;
            if(!spendFactionAssets(d,engine,context.faction,{items},{sourceEvent:context.sourceEvent,minute:context.minute,kind:'issue_outcome',issue:effect.issue,outcome:o.result}))
                return{applied:false,reason:'组织公账不足以兑现议定结果'};
            for(const r of o.shares??[])engine.itemDelta(d,r.to,r.item,r.quantity);
            for(const n of o.news??[])sendNews(d,engine,{from:effect.settlement,to:n.target,actor:effect.settlement,victim:n.target,act:n.act,sourceEvent:context.sourceEvent,minute:context.minute});
            row={...row,outcome:o.result,motion:effect.motion,decidedBy:`society_motion:${effect.settlement}:${effect.motion}`,motionStatus:status,shares:structuredClone(o.shares??[]),news:structuredClone(o.news??[])};
        }
        d.set(rec(key),row);
        return{applied:true,kind:effect.kind,issue:effect.issue,status:effect.status,outcome:row.outcome};
    },
};
