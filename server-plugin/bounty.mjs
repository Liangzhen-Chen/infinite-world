import {preconditionFailure} from './precondition.mjs';
import {isEffective} from './lifecycle-state.mjs';
import {changeLegacyHoldings} from './transition.mjs';
import {purse,fund as fundAccount,moveCoins} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
declareLedgerWriter('bounty');
import {entityTransition,businessSnapshot,businessTransitions} from './entity-transitions.mjs';
import {lawAuthorities,personName} from './entity-view.mjs';
import {legalCodes,legalCodeAt,legalCodeById,legalCooperation,codePenalty} from './law-codes.mjs';
// Wanted notices, fugitives, bounty hunters and the bribery space of the codes (guide 3.12).
// A judged-but-absent offender, a jail-breaker, a defaulting debtor or an exposed
// corrupt officer becomes `wanted:<case>` (category legal_wanted). The notice covers
// the issuing code and the codes it cooperates with (rules.law.polities), reaching
// each of them after the courier relay along the real route; it is carried on as a
// public law memory that people retell. Inside its reach, guards and people who know
// of it recognise the fugitive and intercept, report, or look away when bought.
// The reward is reserved in the code's treasury (fines, a victim's pledge or a
// confiscated bribe) and posted on the court's quest board, where NPC hunters
// (rules.law.wanted.hunters) or the player take it.
import {createHash} from 'node:crypto';
import {digest} from './storage.mjs';
import {standing} from './standing.mjs';
import {organization} from './organizations.mjs';
import {awardExperience} from './progression.mjs';
import {declareHoldingWriter,holdingRemove} from './holdings.mjs';
import {holdingSet as writeHoldingProjection} from './holding-sources.mjs';
declareHoldingWriter('bounty',{kinds:['guest_of','wanted','companion','resides','devotee_of'],entities:['case']});

const DAY=1440,TICK=600,ACTIVE='生效';
const rec=id=>['state','records',id];
function holdingSet(d,engine,p,value,writer){
 const old=d.get(...p);
 if((engine||d.engine)&&p[0]==='state'&&p[1]==='player'&&p[2]==='companions'){
  const removed=(old??[]).find(id=>!value.includes(id));
  if(removed)return changeLegacyHoldings(d,engine??d.engine,{source:'companion:player',subject:removed,kinds:['companion'],reason:'released',eventId:`bounty:release:${removed}:${d.get('state','minute')}`},()=>writeHoldingProjection(d,engine,p,value,writer));
 }
 if((engine||d.engine)&&p[0]==='state'&&p[1]==='records'&&old?.category==='legal_wanted'&&old.status==='生效'&&value.status!=='生效')return changeLegacyHoldings(d,engine??d.engine,{source:`wanted:${p[2]}`,kinds:['wanted'],reason:'released',eventId:`${p[2]}:closed`},()=>writeHoldingProjection(d,engine,p,value,writer));
 if((engine||d.engine)&&p[0]==='state'&&p[1]==='records'&&['legal_custody','legal_detention'].includes(old?.category)&&old.status==='生效'&&value.status!=='生效'){
  const reason=value.endReason??(value.expires<=value.ended?'expired':'released');
  return changeLegacyHoldings(d,engine??d.engine,{source:`custody:${p[2]}`,kinds:['guest_of'],reason,eventId:`${p[2]}:${value.ended}:${reason}`},()=>writeHoldingProjection(d,engine,p,value,writer));
 }
 return writeHoldingProjection(d,engine,p,value,writer);
}
export const WANTED_REASONS=Object.freeze({unappeared:'判决后逾期未到案',escape:'脱逃羁押',debt:'违约逃债',flight:'受贿事发潜逃'});
const dead=(n,state,id)=>!n||!isEffective(null,state,id)||n.status==='濒死';
const awake=(n,state,id)=>n&&isEffective(null,state,id)&&n.location&&!n.scheduleTravel&&!n.cognitionTravel&&!['濒死','昏迷'].includes(n.status)&&!/睡眠|睡觉|熟睡/.test(n.activity??'');
const able=(n,state,id)=>n&&!dead(n,state,id)&&n.status!=='昏迷';
const d20=(document,...parts)=>createHash('sha256').update([document.randomSeed,'bounty',...parts].join(':')).digest().readUInt32LE(0)%20+1;
const mod=score=>Math.floor(((Number.isFinite(score)?score:10)-10)/2);
const nameOf=(engine,state,id)=>id==='player'?state.player?.name??'玩家':engine.byId.get(id)?.name??id;
function attribute(engine,state,id,key){return id==='player'?state.player.attributes?.[key]:state.npcs[id]?.attributes?.[key]??engine.byId.get(id)?.attributes?.[key];}
function level(engine,state,id){return (id==='player'?state.player.level:state.npcs[id]?.level??engine.byId.get(id)?.level)??1;}

export const lawRules=engine=>engine.rules.law??{};
export const codeById=legalCodeById;
export const codeAt=legalCodeAt;
const polity=(engine,law)=>lawRules(engine).polities?.find(p=>p.law===law)??null;
export function wantedScope(engine,law,state={}){const code=codeById(engine,law,state);if(!code)return[];return legalCodes(engine.world,state).filter(c=>legalCooperation(engine,state,code,c).notices).map(c=>c.id);}
export function enforcersOf(engine,law,state={}){const c=codeById(engine,law,state);return c?[...new Set([...lawAuthorities(engine,state,c),...(polity(engine,law)?.guards??[]).filter(id=>!dismissed(state,id)&&isEffective(engine,state,id))])]:[];}
export const dismissed=(state,npc)=>state.records?.[`legal_dismissal:${npc}`]?.category==='legal_dismissal';
export function integrityOf(engine,npc){
    for(const p of lawRules(engine).polities??[])if(p.integrity?.[npc]!==undefined)return p.integrity[npc];
    return lawRules(engine).bribery?.defaultIntegrity??60;
}
export const activeWanted=state=>Object.values(state.records??{}).filter(r=>r?.category==='legal_wanted'&&r.status===ACTIVE).sort((a,b)=>a.id.localeCompare(b.id));
export function wantedOfCase(state,caseId){const id=state.records?.[caseId]?.wanted,w=id&&state.records[id];return w?.category==='legal_wanted'&&w.status===ACTIVE?w:null;}
export const activeHold=state=>Object.values(state.records??{}).find(r=>r?.category==='legal_custody'&&r.reason==='到案'&&r.status==='生效')??null;
// Whether the notice has reached this place, and whether this person knows of it.
export function wantedReachedAt(engine,w,location,minute,state={}){const code=codeAt(engine,location,state),issuer=codeById(engine,w.law,state);return Boolean(code&&issuer&&legalCooperation(engine,state,issuer,code).extradition&&w.scope.includes(code.id)&&w.reach[code.id]!==undefined&&w.reach[code.id]<=minute);}
function knows(engine,state,w,npc,minute){
    if(w.scope.some(law=>w.reach[law]<=minute&&enforcersOf(engine,law,state).includes(npc)))return true;
    return (state.npcs[npc]?.memoryStream??[]).some(m=>m.legalCase===w.case&&m.legalStage==='wanted'&&m.minute<=minute);
}
function save(d,w){holdingSet(d,null,rec(w.id),w,'bounty');}
function remember(d,engine,npc,w,minute,content,{visibility='public',kind='law'}={}){
    const stream=d.get('state','npcs',npc,'memoryStream');if(!stream&&!d.get('state','npcs',npc))return;
    const id=`wanted_${digest([w.id,npc,content,minute]).slice(0,20)}`;if((stream??[]).some(m=>m.id===id))return;
    d.set(['state','npcs',npc,'memoryStream'],[...stream??[],{id,sourceEvent:`${w.id}:${minute}`,kind,minute,location:d.get('state','npcs',npc,'location'),
        participants:[w.subject,npc],sourceType:'亲历',visibility,salience:3,emotion:'留意',legalCase:w.case,legalStage:'wanted',content}]);
}
function treasury(d,law){const key=`legal_treasury:${law}`,row=d.get(...rec(key));if(row&&row.category!=='legal_treasury')throw Error('法律资金登记键冲突');return {key,row:row??{category:'legal_treasury',law,coins:0}};}
function releaseReward(d,w){
    if(!w.bounty)return;const {key,row}=treasury(d,w.law);
    holdingSet(d,null,rec(key),{...row,reserved:Math.max(0,(row.reserved??0)-w.bounty)},'bounty');
}
function payReward(d,w,to,minute){
    if(!w.bounty||!to)return 0;const {key,row}=treasury(d,w.law),amount=Math.min(w.bounty,row.coins);
    moveCoins(d,{from:fundAccount(key),to:purse(null,to),amount:amount,writer:'bounty',eventId:w.id});
    holdingSet(d,null,rec(key),{...row,coins:row.coins-amount,reserved:Math.max(0,(row.reserved??0)-w.bounty)},'bounty');
    const path=to==='player'?['state','player','coins']:['state','npcs',to,'coins'];d.set(path,(d.get(...path)??0)+amount);
    w.rewardPaid=amount;w.history=[...w.history,{kind:'领赏',by:to,coins:amount,minute}];return amount;
}
function closeQuest(d,w,status,reason,minute,extra={}){
    const q=w.quest&&d.get('state','quests',w.quest);if(!q||!['公开','进行中'].includes(q.status))return;
    d.set(['state','quests',q.id],{...q,status,reason,resolvedAt:minute,...extra});
}

// Issue a notice for a case. Returns the notice, or null when the code has no wanted rules.
export function issueWanted(d,engine,row,reason,minute){
    const rules=lawRules(engine).wanted,code=codeById(engine,row.law);if(!rules||!code)return null;
    let id=`wanted:${row.id}`;for(let n=2;d.get(...rec(id));n++)id=`wanted:${row.id}:${n}`;
    const scope=wantedScope(engine,code.id,d.get('state')),reach={};
    for(const law of scope){
        let travel=0;
        if(law!==code.id){try{travel=engine.route(code.court,codeById(engine,law).court,'walk',minute,d.document.randomSeed).minutes;}catch{continue;}}
        reach[law]=minute+(rules.relayBaseMinutes??60)+travel;
    }
    const b=rules.bounty??{},declared=Math.min(b.maximum??2000,(b.base??0)+Math.ceil((row.judgment?.fine??row.value??0)*(b.perFine??1)));
    const fund=treasury(d,code.id),free=Math.max(0,fund.row.coins-(fund.row.reserved??0));
    const victim=row.victim&&row.victim!=='player'?d.get('state','npcs',row.victim):null;let pledge=0;
    if(free<declared&&victim&&!dead(victim,d.get('state'),row.victim))pledge=Math.max(0,Math.min(declared-free,Math.floor((victim.coins??0)*(b.victimPledgeShare??0.5))));
    if(pledge){moveCoins(d,{from:purse(null,row.victim),to:fundAccount(fund.key),amount:pledge,writer:'bounty',eventId:row.id});d.set(['state','npcs',row.victim,'coins'],victim.coins-pledge);}
    const bounty=Math.min(declared,free+pledge);
    if(bounty||pledge)holdingSet(d,null,rec(fund.key),{...fund.row,coins:fund.row.coins+pledge,reserved:(fund.row.reserved??0)+bounty},'bounty');
    const state=d.get('state'),who=nameOf(engine,state,row.offender);
    const w={category:'legal_wanted',id,case:row.id,subject:row.offender,law:code.id,reason,scope,reach,notified:[],declared,bounty,
        pledge:pledge?{from:row.victim,coins:pledge}:null,status:ACTIVE,issuedAt:minute,quest:null,hunt:null,gaveUp:[],silenced:[],sightings:[],history:[{kind:'发出通缉',minute}]};
    if(bounty>0){
        const quest=`quest_bounty_${digest([id]).slice(0,16)}`;
        d.set(['state','quests',quest],{id:quest,boardVersion:'bounty',bounty:id,publisher:code.officers[0],personal:false,grade:'D',reward:bounty,escrow:0,
            objective:{type:'capture',wanted:id,target:row.offender,location:code.court},content:`缉拿${who}（${reason}）交${engine.byId.get(code.court)?.name??code.court}，赏${bounty}铜`,
            location:code.court,createdAt:minute,status:'公开',taker:null});
        w.quest=quest;
    }
    save(d,w);holdingSet(d,null,rec(row.id),{...d.get(...rec(row.id)),wanted:id},'bounty');
    d.say(`${code.name}对${who}发出通缉（${reason}）${bounty?`，悬赏${bounty}铜`:''}；文书沿路传往协查各地`);
    return w;
}

// Close a notice when the case is settled, withdrawn or the subject has come in.
export function closeWanted(d,engine,w,status,reason,minute){
    if(w.status!==ACTIVE)return w;
    const next={...w,status,closedAt:minute,closeReason:reason,history:[...w.history,{kind:status,reason,minute}]};
    if(next.rewardPaid===undefined){
        releaseReward(d,next);
        if(next.pledge){const {key,row}=treasury(d,w.law),back=Math.min(next.pledge.coins,row.coins);
            if(back&&d.get('state','npcs',next.pledge.from)){moveCoins(d,{from:fundAccount(key),to:purse(null,next.pledge.from),amount:back,writer:'bounty',eventId:w.id});holdingSet(d,null,rec(key),{...d.get(...rec(key)),coins:row.coins-back},'bounty');d.set(['state','npcs',next.pledge.from,'coins'],d.get('state','npcs',next.pledge.from,'coins')+back);}}
    }
    if(status!=='已到案')closeQuest(d,next,'撤销',reason,minute);
    if(next.captive?.by==='player'){holdingSet(d,null,['state','player','companions'],(d.get('state','player','companions')??[]).filter(n=>n!==w.subject),'bounty');}
    if(w.subject!=='player'&&d.get('state','npcs',w.subject,'fugitive')===w.id)holdingRemove(d,null,['state','npcs',w.subject,'fugitive'],'bounty');
    save(d,next);return next;
}

// A recognised or caught player is held where found and escorted to the issuing court.
export function holdPlayer(d,engine,w,{captor,location,minute,surrendered=false}){
    const code=codeById(engine,w.law);let escort=60;
    try{escort=Math.max(30,engine.route(location,code.court,'walk',minute,d.document.randomSeed).minutes);}catch{}
    const key=`legal_custody:${w.id}:${minute}`;
    holdingSet(d,null,rec(key),{category:'legal_custody',case:w.case,wanted:w.id,reason:'到案',captor,location,status:'生效',started:minute,expires:minute+escort,surrendered},'bounty');
    const caseRow=d.get(...rec(w.case));
    entityTransition(d,engine,{id:`${key}:detain`,verb:'detain',actor:captor,target:'player',minute,location,visibility:caseRow?.private?'private':caseRow?.visibility??'public',summary:`${d.get('state','player','name')}已被拘押`});
    save(d,{...w,history:[...w.history,{kind:surrendered?'自首':'拦截',by:captor,location,minute}]});
    d.say(surrendered?`你向${nameOf(engine,d.get('state'),captor)}自首，将被押往${engine.byId.get(code.court)?.name??code.court}`:`${nameOf(engine,d.get('state'),captor)}认出你是通缉之人，当场扣下，要押往${engine.byId.get(code.court)?.name??code.court}`);
    return key;
}
function arrivePlayer(d,engine,lockKey,lock,minute){
    const w=d.get(...rec(lock.wanted)),code=codeById(engine,w.law),row=d.get(...rec(w.case));
    holdingSet(d,null,rec(lockKey),{...lock,status:'已结束',ended:minute},'bounty');
    d.set(['state','location'],code.court);if(d.get('state','player','mount'))d.remove(['state','player','mount']);
    if(d.get('state','npcs',lock.captor))d.set(['state','npcs',lock.captor,'location'],code.court);
    if(row&&['已报案','证据不足','未报案'].includes(row.status)){
        let key=`legal_custody:${row.id}`;if(d.get(...rec(key)))key=`legal_custody:${row.id}:${minute}`;
        holdingSet(d,null,rec(key),{category:'legal_custody',case:row.id,reason:'待审',location:code.court,status:'生效',started:minute,expires:minute+code.maximumDetentionMinutes},'bounty');
    }
    if(row)holdingSet(d,null,rec(row.id),{...row,appearedAt:minute},'bounty');
    const enforcer=w.scope.some(law=>enforcersOf(engine,law,d.get('state')).includes(lock.captor));
    const next={...d.get(...rec(w.id))};const paid=!enforcer&&!lock.surrendered?payReward(d,next,lock.captor,minute):0;
    if(next.quest)closeQuest(d,next,'已完成','逃犯已押到',minute,{taker:lock.captor,rewardPaid:paid});
    save(d,next);closeWanted(d,engine,next,'已到案',lock.surrendered?'自首到案':'押解到案',minute);
    d.say(`已被押到${engine.byId.get(code.court)?.name??code.court}，通缉解除；${row?.status==='已裁定'?'原判罚仍待履行':'等候审理'}`);
}
// The bounty handed in: the captive is detained at the court and the captor paid.
export function deliverFugitive(d,engine,w,by,minute){
    const code=codeById(engine,w.law),row=d.get(...rec(w.case)),npc=w.subject;
    if(d.get(...rec(`legal_detention:${w.id}`)))return 0;
    const shops=businessSnapshot(engine,d.get('state'));
    holdingSet(d,null,['state','player','companions'],(d.get('state','player','companions')??[]).filter(n=>n!==npc),'bounty');
    d.set(['state','npcs',npc,'location'],code.court);
    d.set(['state','npcs',npc,'activity'],'依法拘留');
    for(const field of ['scheduleTravel','cognitionTravel'])if(d.get('state','npcs',npc,field))holdingRemove(d,null,['state','npcs',npc,field],'bounty');
    holdingSet(d,null,rec(`legal_detention:${w.id}`),{category:'legal_detention',subject:npc,case:w.case,wanted:w.id,location:code.court,deliveredBy:by,minute,status:'生效',expires:minute+code.maximumDetentionMinutes,
        ...(row?.private||['private','secret'].includes(row?.visibility)?{visibility:row.private?'private':row.visibility}:{})},'bounty');
    if(row)holdingSet(d,null,rec(row.id),{...row,status:'已到案',deliveredBy:by,deliveredAt:minute},'bounty');
    const next={...w};const paid=payReward(d,next,by,minute);
    closeQuest(d,next,'已完成','逃犯已交付法院',minute,{taker:by,rewardPaid:paid});
    save(d,next);closeWanted(d,engine,next,'已到案','缉拿交付',minute);
    entityTransition(d,engine,{id:`legal_detention:${w.id}:detain`,verb:'detain',actor:by,target:npc,minute,location:code.court,visibility:row?.private?'private':row?.visibility??'public',summary:`${personName(engine,d.get('state'),npc).value??npc}已依法拘留`});
    businessTransitions(d,engine,shops,`legal_detention:${w.id}`,minute);
    if(by!=='player')remember(d,engine,by,next,minute,`把${nameOf(engine,d.get('state'),npc)}押到${engine.byId.get(code.court)?.name}，领赏${paid}铜。`,{visibility:'private',kind:'quest'});
    return paid;
}

// Escorting hold, issuance, closing, the courier relay and recognition. Called with
// the law step after every interval and settled action.
export function advanceWanted(d,engine,after){
    const rules=lawRules(engine).wanted;if(!rules)return;
    for(const [key,lock] of Object.entries(d.get('state','records')??{})){
        if(lock?.category!=='legal_custody'||lock.reason!=='到案'||lock.status!=='生效')continue;
        if(!isEffective(engine,d,'player')){changeLegacyHoldings(d,engine,{source:`custody:${key}`,kinds:['guest_of'],reason:'death',eventId:`${key}:gone`},()=>holdingSet(d,null,rec(key),{...lock,status:'已中止',ended:after,endReason:'death'},'bounty'));continue;}
        if(lock.expires<=after)arrivePlayer(d,engine,key,lock,lock.expires);
    }
    issue(d,engine,rules,after);
    for(const w of activeWanted(d.get('state'))){
        const row=d.get(...rec(w.case));
        if(!row||['已结案','服役中','已撤案','已到案'].includes(row.status)||row.appeal?.outcome==='overturned'){closeWanted(d,engine,w,'已销案',row?.status==='已撤案'?'案件撤销':'案件已结或改判',after);continue;}
        const scope=wantedScope(engine,w.law,d.get('state')),reach={...w.reach};
        for(const law of scope)if(reach[law]===undefined){try{reach[law]=after+(rules.relayBaseMinutes??60)+engine.route(codeById(engine,w.law).court,codeById(engine,law).court,'walk',after,d.document.randomSeed).minutes;}catch{}}
        if(scope.some(law=>!w.scope.includes(law)))save(d,{...w,scope:[...new Set([...w.scope,...scope])],reach});
        relay(d,engine,d.get(...rec(w.id)),after);
        if(w.subject==='player')recognise(d,engine,rules,d.get(...rec(w.id)),after);
    }
}
function issue(d,engine,rules,after){
    const state=d.get('state');if(!isEffective(engine,state,'player'))return;
    const custody=Object.entries(state.records??{}).filter(([,r])=>r?.category==='legal_custody').map(([key,r])=>({...r,key}));
    for(const row of Object.values(state.records??{})){
        if(row?.category!=='legal_case'||row.offender!=='player'||wantedOfCase(state,row.id))continue;
        if(custody.some(l=>l.case===row.id&&l.status==='生效'))continue;
        const since=row.appearedAt??-Infinity,escaped=custody.find(l=>l.case===row.id&&l.status==='已中止'&&l.reason!=='到案'&&l.ended>since&&!l.wanted);
        if(escaped){const w=issueWanted(d,engine,row,WANTED_REASONS.escape,after);if(w){const {key,...lock}=escaped;holdingSet(d,null,rec(key),{...lock,wanted:w.id},'bounty');}continue;}
        if(row.status==='已裁定'&&row.judgment&&Math.max(row.judgment.minute,since)+rules.appearanceMinutes<=after)issueWanted(d,engine,row,WANTED_REASONS.unappeared,after);
        else if(row.offense==='debt_default'&&['已报案','证据不足'].includes(row.status)&&Math.max(row.minute,since)+rules.appearanceMinutes<=after)issueWanted(d,engine,row,WANTED_REASONS.debt,after);
    }
}
function relay(d,engine,w,after){
    let notified=w.notified;
    for(const law of w.scope){
        if(notified.includes(law)||!(w.reach[law]<=after)||!legalCooperation(engine,d.get('state'),codeById(engine,w.law),codeById(engine,law)).notices)continue;
        const code=codeById(engine,law);notified=[...notified,law];
        for(const npc of enforcersOf(engine,law,d.get('state'))){
            if(!d.get('state','npcs',npc)||dismissed(d.get('state'),npc))continue;
            const known=d.get('state','npcs',npc,'legalKnowledge')??[];
            if(!known.some(k=>k.case===w.case&&k.source==='通缉文书'))d.set(['state','npcs',npc,'legalKnowledge'],[...known,{case:w.case,minute:w.reach[law],source:'通缉文书'}]);
            remember(d,engine,npc,w,w.reach[law],`${code.name}收到通缉：${nameOf(engine,d.get('state'),w.subject)}${w.reason}${w.bounty?`，悬赏${w.bounty}铜`:''}。`);
        }
    }
    if(notified!==w.notified)save(d,{...d.get(...rec(w.id)),notified});
}
function recognise(d,engine,rules,w,after){
    const state=d.get('state'),location=state.location,code=codeAt(engine,location);
    if(w.pending&&w.pending.at<=after){
        const officer=w.pending.officer,actor=state.npcs[officer],pending=w.pending;w={...w,pending:null};save(d,w);
        if(wantedReachedAt(engine,w,location,after,state)&&!activeHold(state)&&location===pending.location&&actor&&!dead(actor,state,officer)&&!dismissed(state,officer)&&!w.silenced.includes(officer)){
            d.set(['state','npcs',officer,'location'],location);holdPlayer(d,engine,d.get(...rec(w.id)),{captor:officer,location,minute:after});return;
        }
    }
    if(!code||!wantedReachedAt(engine,w,location,after,state)||activeHold(state)||w.pending)return;
    const last=w.sightings.filter(s=>s.location===location).at(-1);if(last&&after-last.minute<(rules.recognitionCooldownMinutes??360))return;
    const dc=(rules.recognitionDifficulty??12)+mod(state.player.attributes?.['魅力']);
    for(const npc of Object.keys(state.npcs).sort()){
        const n=state.npcs[npc];
        if(n.location!==location||!awake(n,state,npc)||state.player.companions?.includes(npc)||w.silenced.includes(npc)||dismissed(state,npc)||!knows(engine,state,w,npc,after))continue;
        if(d20(d.document,w.id,npc,after,'recognise')+mod(attribute(engine,state,npc,'精神'))<dc)continue;
        const enforcer=w.scope.some(law=>enforcersOf(engine,law,state).includes(npc));
        const officer=enforcer?npc:lawAuthorities(engine,state,code).find(o=>state.npcs[o]&&!dead(state.npcs[o],state,o)&&!dismissed(state,o));
        const sighting={location,minute:after,by:npc,reaction:enforcer?'拦截':officer?'报官':'记下'};
        save(d,{...w,sightings:[...w.sightings,sighting],...(!enforcer&&officer?{pending:{location,at:after+code.reportMinutes,officer,reporter:npc}}:{})});
        remember(d,engine,npc,w,after,`在${engine.byId.get(location)?.name??location}认出了被通缉的${nameOf(engine,state,'player')}，${enforcer?'当场拦下':'赶去报官'}。`,{visibility:'private'});
        if(enforcer)holdPlayer(d,engine,d.get(...rec(w.id)),{captor:npc,location,minute:after});
        else d.say(`${engine.byId.get(npc)?.name??npc}认出了你是被通缉的人，转身去报官`);
        return;
    }
}

// Hunters: rules roster plus members of the bounty guilds; friends of the quarry refuse.
function hunters(engine,state,w){
    const h=lawRules(engine).wanted?.hunters??{},ids=new Set(h.roster??[]);
    for(const g of h.guilds??[])for(const m of Object.keys(organization(engine,state,g)?.members??{}))ids.add(m);
    return [...ids].filter(id=>engine.byId.get(id)?.tier==='full'&&able(state.npcs[id],state,id)&&id!==w.subject&&!state.player.companions?.includes(id)&&!w.gaveUp.includes(id)
        &&!dismissed(state,id)&&!(w.subject==='player'&&standing(engine,state,id,'player')>=(h.refuseStanding??60))).sort();
}
const huntable=w=>w.status===ACTIVE&&w.bounty>0&&w.quest;
export function nextBountyMinute(state,after){
    let next=Infinity;
    for(const w of activeWanted(state)){
        for(const law of w.scope)if(w.reach[law]>after&&!w.notified.includes(law))next=Math.min(next,w.reach[law]);
        if(w.pending?.at>after)next=Math.min(next,w.pending.at);
        if(huntable(w)){const tick=Math.floor(after/DAY)*DAY+TICK;next=Math.min(next,tick>after?tick:tick+DAY);}
    }
    const hold=activeHold(state);if(hold?.expires>after)next=Math.min(next,hold.expires);
    return next;
}
export const bountyActive=state=>activeWanted(state).length>0||Boolean(activeHold(state));
// Off-screen pursuit, once a day at the board hour.
export function advanceBounties(d,engine,before,after){
    if(!lawRules(engine).wanted)return;
    for(let day=Math.floor(before/DAY);day<=Math.floor(after/DAY);day++){
        const at=day*DAY+TICK;if(at<=before||at>after)continue;
        for(const w of activeWanted(d.get('state')))if(huntable(w))pursue(d,engine,w,at);
    }
}
function pursue(d,engine,w,at){
    const rules=lawRules(engine).wanted.hunters??{},state=d.get('state'),q=d.get('state','quests',w.quest);if(!q)return;
    if(q.status==='公开'){
        const hunter=hunters(engine,state,w)[0];if(!hunter)return;
        d.set(['state','quests',q.id],{...q,status:'进行中',taker:hunter,acceptedAt:at});
        save(d,{...w,hunt:{hunter,startedAt:at,until:at+(rules.pursuitDays??7)*DAY},history:[...w.history,{kind:'接赏',by:hunter,minute:at}]});
        remember(d,engine,hunter,w,at,`接下缉拿${nameOf(engine,state,w.subject)}的赏金，${w.bounty}铜。`,{visibility:'private',kind:'quest'});return;
    }
    if(q.status!=='进行中'||q.taker==='player'||!w.hunt)return;
    const hunter=w.hunt.hunter,actor=state.npcs[hunter];
    const giveUp=reason=>{
        d.set(['state','quests',q.id],{...q,status:'公开',taker:null});
        save(d,{...w,hunt:null,gaveUp:[...w.gaveUp,hunter],history:[...w.history,{kind:'追捕落空',by:hunter,reason,minute:at}]});
        remember(d,engine,hunter,w,at,`追捕${nameOf(engine,state,w.subject)}落空：${reason}。`,{visibility:'private',kind:'quest'});
    };
    if(!able(actor,state,hunter))return giveUp('猎手失能');
    if(at>=w.hunt.until)return giveUp('追期已满仍未拿到人');
    const where=w.subject==='player'?state.location:state.npcs[w.subject]?.location;
    if(w.subject==='player'&&(activeHold(state)||!isEffective(engine,state,'player')))return;
    if(w.subject!=='player'&&(dead(state.npcs[w.subject],state,w.subject)||w.captive))return;
    if(!wantedReachedAt(engine,w,where,at,d.get('state'))){save(d,{...w,history:[...w.history,{kind:'追踪无果',by:hunter,reason:'目标不在通缉范围',minute:at}]});return;}
    const lead=w.sightings.some(s=>s.location===where&&at-s.minute<=DAY)?rules.leadBonus??0:0;
    const track=d20(d.document,w.id,hunter,at,'track')+mod(attribute(engine,state,hunter,'智力'))+Math.floor(level(engine,state,hunter)/3)+lead;
    if(track<(rules.trackDifficulty??14)){save(d,{...w,history:[...w.history,{kind:'追踪无果',by:hunter,minute:at}]});return;}
    const seize=d20(d.document,w.id,hunter,at,'seize')+mod(attribute(engine,state,hunter,'力量'))+Math.floor(level(engine,state,hunter)/3);
    const evade=d20(d.document,w.id,w.subject,at,'evade')+mod(attribute(engine,state,w.subject,'敏捷'))+Math.floor(level(engine,state,w.subject)/3);
    d.set(['state','npcs',hunter,'location'],where);
    if(seize<=evade){
        save(d,{...w,history:[...w.history,{kind:'失手',by:hunter,location:where,minute:at}]});
        if(w.subject==='player')d.say(`赏金猎人${engine.byId.get(hunter)?.name??hunter}追到${engine.byId.get(where)?.name??where}，被你甩脱`);return;
    }
    if(w.subject==='player'){save(d,{...w,history:[...w.history,{kind:'追获',by:hunter,location:where,minute:at}]});holdPlayer(d,engine,d.get(...rec(w.id)),{captor:hunter,location:where,minute:at});}
    else deliverFugitive(d,engine,{...w,history:[...w.history,{kind:'追获',by:hunter,location:where,minute:at}]},hunter,at);
}

// Bribery. The offer buys silence or a dropped case when the person's price is met;
// people who notice turn it into a case of its own and expose the taker.
export function bribePrice(engine,state,npc,stake){
    const b=lawRules(engine).bribery??{},integrity=integrityOf(engine,npc);
    if(integrity>=(b.refuseAtIntegrity??90))return Infinity;
    const regard=Math.max(-100,Math.min(100,standing(engine,state,npc,'player')));
    return Math.max(b.minimumCoins??5,Math.ceil(stake*integrity/50*(1-regard/200)));
}
export function bribeStake(engine,row,w){
    const code=codeById(engine,row.law),penalty=codePenalty(engine,code,row.offense)??lawRules(engine).bribery?.penalties?.[row.offense]??lawRules(engine).activityPenalties?.[row.offense]??engine.rules.economy?.credit?.loan?.defaultPenalty;
    const fine=row.judgment?.fine??((penalty?.baseFine??10)+Math.ceil((row.value??0)*(penalty?.valueMultiplier??0)));
    return Math.max(fine,w?.bounty??0,1);
}

// Player bounty work through the quest board: accept, deliver (complete), give up, inspect.
export function bountyQuestAction(d,engine,q,args,eventId){
    const now=d.get('state','minute'),w=d.get(...rec(q.bounty));
    if(args.operation==='inspect'){
        if(q.taker!=='player'&&q.location!==d.get('state','location'))throw preconditionFailure('没有获知该悬赏进度的渠道');
        return {quest:q.id,status:q.status,content:q.content,reward:q.reward,wanted:w?{status:w.status,reason:w.reason,scope:w.scope}:null};
    }
    if(!w||w.status!==ACTIVE)throw preconditionFailure('此悬赏的通缉已经解除');
    if(args.operation==='accept'){
        if(args.taker&&engine.resolve(args.taker)!=='player')throw preconditionFailure('NPC猎手按世界时间自行接赏');
        if(w.subject==='player')throw preconditionFailure('不能悬赏缉拿自己');
        if(q.status!=='公开')throw preconditionFailure('这份赏金已有人接下');
        d.set(['state','quests',q.id],{...q,status:'进行中',taker:'player',acceptedAt:now});
        return {quest:q.id,status:'进行中',target:w.subject,targetName:nameOf(engine,d.get('state'),w.subject),scope:w.scope,
            note:'在通缉范围内找到逃犯后用world_law arrest对其案件缉拿，押到发布法院再complete交付领赏'};
    }
    if(q.taker!=='player'||q.status!=='进行中')throw preconditionFailure('你没有接下这份赏金');
    if(args.operation==='cancel'){
        d.set(['state','quests',q.id],{...q,status:'公开',taker:null});
        if(w.captive?.by==='player'){holdingSet(d,null,['state','player','companions'],(d.get('state','player','companions')??[]).filter(n=>n!==w.subject),'bounty');save(d,{...w,captive:null});}
        return {quest:q.id,status:'公开',note:'放弃赏金；押着的人已放走'};
    }
    const code=codeById(engine,w.law),here=d.get('state','location');
    if(here!==code.court)throw preconditionFailure(`须把逃犯押到${engine.byId.get(code.court)?.name??code.court}交付`);
    if(w.captive?.by!=='player'||!d.get('state','player','companions')?.includes(w.subject))throw preconditionFailure('逃犯不在你押解之下，没有可交付的人');
    const receiver=enforcersOf(engine,code.id,d.get('state')).find(id=>{const n=d.get('state','npcs',id);return awake(n,d.get('state'),id)&&n.location===here&&!dismissed(d.get('state'),id);});
    if(!receiver)throw preconditionFailure('法院没有清醒在场的执法或审判人员接收');
    const paid=deliverFugitive(d,engine,w,'player',now);
    d.say(`把${nameOf(engine,d.get('state'),w.subject)}交给${engine.byId.get(receiver)?.name}，领赏${paid}铜`);
    const experience=awardExperience(d,engine,{kind:'quest',subject:`bounty:${w.id}`,source:`quest:${q.id}`,base:engine.rules.quests.experienceRanges[q.grade][0],repeat:true},eventId);
    return {quest:q.id,status:'已完成',reward:paid,receiver,...experience};
}
