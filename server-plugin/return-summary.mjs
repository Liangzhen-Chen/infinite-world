import {isReputationSettlement,reputationSettlements}from'./reputation-registry.mjs';
// 返场变化汇总：玩家回到离开过的聚落、聚居地或据点时，从已有账目里汇总离开
// 期间当地发生、按认知边界玩家回来后可能得知的变化。只读世界事件、人物生活、
// 立场、组织议决、粮价与公仓、时钟阶段和传闻，不新造事实；不给数字，不含
// 私密事项（怀孕、轻病、私人账目、未公开的势力计划）与未成年人的名字。
// 玩家上次在各地点的时间记在 state.visits.places[地点]。
import {standing,standingWords,eventWeight} from './standing.mjs';
import {organization} from './organizations.mjs';
import {eventRumorId,eventRumorRecorded,publicTransition} from './world-events.mjs';
import {personAge,personName} from './entity-view.mjs';

const DAY=1440;
export const RETURN_MIN_ABSENCE=3*DAY,RETURN_LIMIT=5,RETURN_LINE_CHARS=40,RETURN_SCENE_DAYS=1;

const within=(engine,location,place)=>{const seen=new Set();while(location&&!seen.has(location)){if(location===place)return true;seen.add(location);location=engine.byId.get(location)?.parent;}return false;};
const nameOf=(engine,state,id)=>personName(engine,state,id).value??engine.byId.get(id)?.name??id;
const minor=(engine,state,id,minute=state.minute)=>{const age=personAge(engine,state,id,minute).value,base=state.family?.people?.[id]??state.created?.[id]??engine.byId.get(id);return Boolean(base?.flags?.minor||base?.minor||age!==null&&age<18);};
const hidden=row=>row?.private||['private','secret'].includes(row?.visibility)||row?.tags?.some(t=>['private','secret'].includes(t));

// The settlement, monster seat or site that a location belongs to.
export function returnPlace(engine,location){
    const settlements=new Set([...reputationSettlements(engine),...(engine.rules.agriculture?.settlements??[]).map(p=>p.settlement)]),seen=new Set();
    while(location&&!seen.has(location)){
        const row=engine.byId.get(location);
        if(settlements.has(location)||row?.site||row?.monsterSociety)return location;
        seen.add(location);location=row?.parent;
    }
    return null;
}
const holders=(engine,place)=>[...new Set([isReputationSettlement(engine,place)?place:null,engine.byId.get(place)?.monsterSociety?place:null].filter(Boolean))];
function grainOf(state,place){
    const r=state.records?.[`agriculture:${place}`];if(r?.mode!=='managed'||!Array.isArray(r.batches))return null;
    const day=Math.floor(state.minute/DAY);return r.batches.filter(b=>b.kind==='grain'&&b.expiresDay>day).reduce((n,b)=>n+b.amount,0);
}
function snapshot(engine,state,place){
    const regard={};for(const h of holders(engine,place))regard[h]=standing(engine,state,h,'player');
    const grain=grainOf(state,place);
    return {regard,...(grain!==null?{grain}:{})};
}
const houseSettlement=(engine,id)=>engine.world.households?.find(h=>h.id===id)?.settlement??null;
const MOTION={admit:'接纳新人',expel:'除名',appoint:'改任职务',withdraw:'动用公库',charter:'修订章程'};
const VERB={harm:'伤了',steal:'偷了',help:'帮了',gift:'送了礼给'};

// Pure read: what changed at `place` in (from, to] that the player could learn on return.
export function returnChanges(engine,state,place,{from,to=state.minute,before={}}={}){
    const rows=[],add=(weight,text)=>rows.push({weight,text:text.slice(0,RETURN_LINE_CHARS)});
    const inWindow=m=>Number.isFinite(m)&&m>from&&m<=to,name=id=>id==='player'?'你':nameOf(engine,state,id);
    const f=state.family??{};
    const familyText=(id,fallback)=>{
        const event=state.records?.[`world_event:${id}`];
        return event?.tags?.includes('entity-transition')?publicTransition(engine,state,event)?event.summary:null:fallback;
    };
    const familyChange=(weight,id,fallback)=>{const text=familyText(id,fallback);if(text)add(weight,text);};
    // 生老病死与迁居：村里人回头都会说起；怀孕和轻病不外传，未成年人不点名。
    for(const r of Object.values(f.deaths??{}))if(r.settlement===place&&inWindow(r.minute)&&!hidden(r)){
        if(hidden(state.records?.[`world_event:${r.id}`]))continue;
        if(minor(engine,state,r.person,r.minute))add(90,'有户人家没了孩子');
        else familyChange(90,r.id,`${name(r.person)}已经${r.cause??'过世'}`);
    }
    for(const r of Object.values(f.births??{}))if(r.settlement===place&&inWindow(r.minute)&&!hidden(r))
        add(55,`${name(r.mother)}家添了${f.people?.[r.child]?.sex==='女'?'女儿':f.people?.[r.child]?.sex==='男'?'儿子':'孩子'}`);
    for(const m of Object.values(f.marriages??{}))if(!m.static&&m.settlement===place&&inWindow(m.since)&&!hidden(m)&&!m.partners.some(p=>minor(engine,state,p,m.since)))
        familyChange(60,m.id,`${name(m.partners[0])}与${name(m.partners[1])}成了亲`);
    for(const m of Object.values(f.migrations??{})){
        if(hidden(m)||minor(engine,state,m.person,m.departedAt??m.arrivedAt))continue;
        if(m.from?.settlement===place&&inWindow(m.departedAt))familyChange(50,`${m.id}:depart`,`${name(m.person)}已搬去${nameOf(engine,state,m.to?.settlement)}`);
        else if(m.to?.settlement===place&&m.status==='已抵达'&&inWindow(m.arrivedAt))familyChange(50,`${m.id}:arrive`,`${name(m.person)}从${nameOf(engine,state,m.from?.settlement)}搬来了`);
    }
    for(const r of Object.values(f.illnesses??{})){
        if(r.severity!=='重'||houseSettlement(engine,r.household)!==place||!inWindow(r.since)||r.status==='病故'||minor(engine,state,r.patient))continue;
        add(45,r.status==='痊愈'?`${name(r.patient)}大病一场，已好转`:`${name(r.patient)}病重卧床`);
    }
    // 统一世界事件：有人目击、够分量的当地事；组织议决只给成员、当事人或公议机构。
    for(const e of Object.values(state.records??{})){
        if(e.category!=='world_event'||!inWindow(e.minute)||!within(engine,e.location,place)||hidden(e)||e.legacy)continue;
        if(e.tags?.includes('facility')){if(e.summary)add(75,e.summary);continue;}
        if(e.tags?.includes('entity-transition')){
            // Family ledgers above already supply these same historical facts.
            if(publicTransition(engine,state,e)&&!['die','marry','migrate'].includes(e.verb)&&e.summary)add(75,e.summary);
            continue;
        }
        if(e.verb==='organize'){
            const org=organization(engine,state,e.actor);if(!org||org.source==='household')continue;
            const known=org.members?.player||e.target==='player'||org.source==='faction'&&org.charter?.mode==='vote';
            if(!known)continue;
            const who=e.target&&!minor(engine,state,e.target)?name(e.target):'';
            if(e.tags?.includes('org:expel'))add(e.target==='player'?85:65,`${org.name}将${who||'一名成员'}除名`);
            else{const action=(e.tags??[]).find(t=>t.startsWith('motion:'))?.slice(7),passed=e.tags?.includes('passed');
                add(e.target==='player'?85:65,`${org.name}议定${action==='appoint'&&who?`任命${who}`:MOTION[action]??'一事'}，${passed?'已通过':'未通过'}`);}
            continue;
        }
        if(e.actor==='player')continue;
        if(e.tags?.includes('npc_crime')){
            if(eventRumorId(engine,state,e)&&![e.actor,e.target].some(id=>minor(engine,state,id))){
                const action=e.tags.includes('fraud')?'骗取了':e.tags.includes('smuggling')?'私运货物，被人撞见':e.verb==='harm'?'斗殴伤及':'偷取了';
                add(70,`${name(e.actor)}${action}${e.tags.includes('smuggling')?'':name(e.target)}`);
            }
            continue;
        }
        if(e.verb==='deceive'){
            if(![e.actor,e.target].some(id=>minor(engine,state,id)))add(e.target==='player'?80:58,`${name(e.actor)}骗${name(e.target)}的事被揭穿了`);
            continue;
        }
        if(e.verb==='breach'){
            if(e.target==='player')add(80,`${name(e.actor)}欠你的债已违约`);
            else if(e.case&&!minor(engine,state,e.actor))add(55,`${name(e.actor)}欠债违约，已经立案`);
            continue;
        }
        if(VERB[e.verb]&&eventRumorId(engine,state,e)&&![e.actor,e.target].some(id=>minor(engine,state,id)))add(60+Math.min(20,Math.abs(eventWeight(e))),`${name(e.actor)}${VERB[e.verb]}${name(e.target)}`);
    }
    // 当地人对你的看法：只说词，不说数。
    for(const [holder,value]of Object.entries(before.regard??{})){
        const was=standingWords(value),now=standingWords(standing(engine,state,holder,'player'));
        if(was!==now)add(80,`当地人如今${now}，你走时${was}`);
    }
    // 粮价与公仓：柜台公开核价，只说涨落。
    const item=engine.rules.settlementTrade?.item;
    if(item){
        const quotes=Object.values(state.records??{}).filter(q=>q.category==='regional_quote'&&q.settlement===place&&q.item===item).sort((a,b)=>a.day-b.day);
        const old=quotes.filter(q=>q.day*DAY<=from).at(-1),now=quotes.filter(q=>q.day*DAY>from&&q.day*DAY<=to).at(-1);
        if(old&&now&&Math.abs(now.price-old.price)>=Math.max(1,old.price*0.1))
            add(40,`${engine.byId.get(item)?.name??'粮'}价比你走时${now.price>old.price?'涨':'落'}了${Math.abs(now.price-old.price)>=old.price*0.3?'不少':'些'}`);
    }
    const grain=grainOf(state,place);
    if(Number.isFinite(before.grain)&&grain!==null&&Math.abs(grain-before.grain)>=Math.max(1,before.grain*0.25))
        add(35,`公仓存粮比你走时${grain>before.grain?'多':'少'}了${Math.abs(grain-before.grain)>=before.grain*0.5?'许多':'一些'}`);
    // 时钟阶段：公开核对的世界时钟；势力时钟只收明示公开的阶段。
    for(const rule of engine.rules.worldClock?.clocks??[]){
        if(rule.settlement!==place)continue;
        for(const h of state.records?.[rule.id]?.history??[])if(inWindow(h.minute))add(30,`${rule.name}：${h.name}`);
    }
    for(const r of Object.values(state.records??{}))if(r.category==='faction_event'&&r.settlement===place&&r.public===true&&inWindow(r.minute))
        add(30,`${nameOf(engine,state,r.faction)}：${r.name}`);
    // 传闻：此地人离开期间新听来的、可转述的传闻（未核实）。
    const registered=new Set([...engine.world.settlementProfiles?.flatMap(p=>p.details?.rumors??[])??[],...engine.world.rumors??[]].map(r=>r.id)),told=new Set();
    for(const [id,npc]of Object.entries(state.npcs??{}).sort(([a],[b])=>a.localeCompare(b))){
        if(!within(engine,npc.location,place)||npc.status==='死亡')continue;
        for(const m of npc.memoryStream??[]){
            if(!m.rumor||told.has(m.rumor)||!inWindow(m.minute)||hidden(m)||m.kind!=='rumor'&&!m.eventRumor)continue;
            if(!registered.has(m.rumor)&&!(m.eventRumor&&eventRumorRecorded(state,m.rumor)))continue;
            const blurred=npc.cognition?.blurred?.[m.id];if(m.eventRumor&&blurred)continue;
            told.add(m.rumor);add(25,`有人在传：${blurred?.content??m.content}（未核实）`);
        }
    }
    const seen=new Set();
    return rows.filter(r=>!seen.has(r.text)&&seen.add(r.text)).sort((a,b)=>b.weight-a.weight||a.text.localeCompare(b.text)).slice(0,RETURN_LIMIT).map(r=>r.text);
}

// Called once per settled tool call: leaving a place records when and how it
// stood; coming back after a real absence stores the summary for the scene card
// and the state notice.
export function recordReturnVisit(d,engine,before,eventId){
    const from=returnPlace(engine,before.location),to=returnPlace(engine,d.get('state','location'));
    if(from===to)return null;
    if(from)d.set(['state','visits','places',from],{...d.get('state','visits','places',from),leftAt:before.minute,...snapshot(engine,before,from)});
    if(!to)return null;
    const now=d.get('state','minute'),last=d.get('state','visits','places',to);
    d.set(['state','visits','places',to],{...last,arrivedAt:now});
    if(!Number.isFinite(last?.leftAt)||now-last.leftAt<RETURN_MIN_ABSENCE)return null;
    const lines=returnChanges(engine,d.get('state'),to,{from:last.leftAt,to:now,before:last});
    if(!lines.length)return null;
    const row={place:to,leftAt:last.leftAt,arrivedAt:now,lines,sourceEvent:eventId};
    d.set(['state','visits','lastReturn'],row);return row;
}

// Scene-card line while the return is fresh and the player is still there.
export function returnScene(engine,state){
    const r=state.visits?.lastReturn;
    if(!r||returnPlace(engine,state.location)!==r.place||state.minute-r.arrivedAt>RETURN_SCENE_DAYS*DAY)return '';
    return `【离开期间此地变化，回来可听说，未必亲见】${r.lines.join('；')}`.slice(0,260);
}
