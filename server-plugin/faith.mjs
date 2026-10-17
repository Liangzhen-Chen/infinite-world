import {purse,sink} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
import {store,bookStock,BOOKED as STOCK_BOOKED} from './stock.mjs';
declareLedgerWriter('faith',{sinks:['sink:export','sink:consume']});
import {temples,templeById,placeAncestors,faithConflictClocks} from './faith-catalog.mjs';
export {faithConflictClocks} from './faith-catalog.mjs';
import {faithOf,faithCulture} from './faith-state.mjs';
import {organizationState} from './organization-state.mjs';
import {ensureGroupAccount,groupAccountPath,groupAccountView,changeGroupCoins} from './group-account.mjs';
import {actorPath} from './npc-state.mjs';
import {personConstraint} from './entity-view.mjs';
import {adjustStanding,collectivesOf} from './standing.mjs';
import {registerEffect,applyEffects,clockTransaction} from './effects.mjs';
import {registerWorldEventSubscriber,presentWitnesses} from './world-events.mjs';
import {entityTransition} from './entity-transitions.mjs';
import {assertNpcService,advanceWithNpcParticipants} from './npc-schedule.mjs';
import {createNpcObligation} from './npc-obligations.mjs';
import {npcLessonGain,settleNpcLesson,npcProficiency} from './npc-growth.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
import {syncHoldings} from './holding-sources.mjs';
declareHoldingWriter('faith',{kinds:['member_of','holds_office','devotee_of','permit'],entities:['office']});

const DAY=1440,path=id=>['state','records',id],actor=(d,e,id)=>d.get(...actorPath(e.world,id));
const int=(n,min=0,max=1e9)=>{if(!Number.isSafeInteger(n)||n<min||n>max)throw Error('信仰钱粮或时长无效');return n;};
const capable=n=>n&&!['死亡','濒死','昏迷','患病'].includes(n.status)&&!n.scheduleTravel&&!n.cognitionTravel&&!/睡眠|熟睡/.test(n.activity??'');
function subject(d,e,name='player',{recipient=false}={}){
 const id=name==='player'?'player':e.resolve(name),n=actor(d,e,id);
 const available=recipient&&n?.status==='患病'?capable({...n,status:'正常'}):capable(n);
 if(!available||id!=='player'&&n.location!==d.get('state','location')||personConstraint(e,d.get('state'),id))throw Error('须由清醒且可行动的当事人实际在场');return id;
}
function temple(d,e,name,{local=true}={}){
 const t=templeById(e,name);if(!t)throw Error('未登记寺观或教会');
 if(local&&!placeAncestors(e,d.get('state','location')).includes(t.seat))throw Error('须到寺观所在地办理');
 return {...t,organization:organizationState(e,d.get('state'),t.id)};
}
function steward(d,e,t,minutes){
 const id=t.organization.leader;if(!id)throw Error('寺观主持职位空缺');
 if(id==='player')return id;
 subject(d,e,id);assertNpcService(d,e,id,'teach',minutes);return id;
}
// S1b: books = 实物的对方（stock.bookStock 形式：party 为供奉人或受助人行囊，flow 为汇）。
function moveItems(d,e,t,items,sign,event,books){
 const a=ensureGroupAccount(d,e,t.id),next={...a.items};
 for(const [id,n]of Object.entries(items)){int(n);if(!e.world.items.some(i=>i.id===id))throw Error('钱粮物品未登记');next[id]=int((next[id]??0)+sign*n);bookStock(d,e,store(e,t.id,id),sign*n,books);}
 d.set(groupAccountPath(t.id),{...a,items:next,ledger:[...a.ledger,{...event,coins:0,items:Object.fromEntries(Object.entries(items).map(([id,n])=>[id,sign*n]))}]});
}
const coinPath=(e,id)=>[...actorPath(e.world,id),'coins'];
function pay(d,e,t,who,coins,items,event){
 coins=int(coins);if((actor(d,e,who)?.coins??0)<coins)throw Error('香火或仪式钱不足');
 for(const [id,n]of Object.entries(items))if(e.quantity(d,who,id)<int(n))throw Error('供品不足');
 for(const id of Object.keys(items))if(d.get('state','inventory',id,'instances')?.length)throw Error('寺观钱粮账不接收具单件身份的物品');
 d.set(coinPath(e,who),actor(d,e,who).coins-coins);changeGroupCoins(d,e,t.id,coins,event,{account:purse(e,who),writer:'faith',eventId:event.sourceEvent});
 for(const [id,n]of Object.entries(items))e.itemDelta(d,who,id,-n,STOCK_BOOKED);
 if(Object.keys(items).length)moveItems(d,e,t,items,1,event,{party:who,writer:'faith',eventId:event.sourceEvent});
}
// S1a: books = 钱的去处（受助者、主持或汇）。
function spend(d,e,t,coins,items,event,books,itemBooks){
 const a=groupAccountView(e,d.get('state'),t.id);
 if(a.coins<coins||Object.entries(items).some(([id,n])=>(a.items[id]??0)<n))throw Error('寺观公库钱粮不足');
 changeGroupCoins(d,e,t.id,-coins,event,books);if(Object.keys(items).length)moveItems(d,e,t,items,-1,event,itemBooks);
}
export function conversionPolicy(engine,state,who,location){
 const culture=faithCulture(engine,state,who),places=placeAncestors(engine,location);
 const code=engine.rules.law?.codes?.find(c=>places.includes(c.settlement)||c.locations?.some(l=>places.includes(l)));
 return {attitude:'tolerant',familyDelta:-2,organizationDelta:-2,formerDelta:-5,...engine.rules.faith?.conversion?.default,
  ...engine.rules.faith?.conversion?.cultures?.[culture],...engine.rules.faith?.conversion?.polities?.[code?.id],...code?.conversion,law:code?.id??null,culture};
}
function changeFaith(d,e,who,t,eventId,{kind='conversion',devotion=true}={}){
 const now=d.get('state','minute'),previous=faithOf(e,d.get('state'),who).value;
 if(!devotion&&previous?.temple===t.id&&Number.isSafeInteger(previous.observedSince))return {previous,next:previous};
 const god=e.byId.get(t.deity),next={deity:t.deity,temple:t.id,institution:t.seat,church:god?.church.name??t.church,taboo:god?.taboo??t.rule,
  observedSince:devotion?now:null,lastBreach:-1,sourceEvent:eventId,override:true};
 holdingSet(d,null,[...actorPath(e.world,who),'faith'],next,'faith');
 const key=`faith_change:${eventId}:${who}`;holdingSet(d,null,path(key),{category:'faith_change',subject:who,previous,next,kind,minute:now,sourceEvent:eventId},'faith');
 return {previous,next};
}
function member(d,e,t,who,remove,eventId){
 const key=`organization:${t.id}`,row=structuredClone(d.get(...path(key))??{category:'organization',id:t.id,source:t.source,members:{},removed:{},treasury:0,ledger:[]});
 if(remove){delete row.members[who];row.removed[who]={minute:d.get('state','minute'),sourceEvent:eventId};}
 else{delete row.removed[who];row.members[who]={position:'成员',joinedAt:d.get('state','minute'),arrears:0};}
 holdingSet(d,null,path(key),row,'faith');syncHoldings(d,e,'org',t.id,{writer:'faith',eventId});
}
export function convertFaith(d,e,t,who,eventId,{paid=false}={}){
 const previous=faithOf(e,d.get('state'),who).value;
 if(previous?.temple===t.id&&previous.observedSince!==null&&previous.observedSince!==undefined)throw Error('已正式入教');
 const rule=e.rules.faith?.initiation;if(!rule)throw Error('未登记入教仪式规则');
 const policy=conversionPolicy(e,d.get('state'),who,t.seat);
 if(policy.attitude==='forbidden'&&previous?.temple&&previous.temple!==t.id)throw Error('当地法典禁止此种改宗');
 const groups=collectivesOf(e,d.get('state'),who);
 e.assertNpcObligationAction?.(d,[who],{minutes:paid?0:rule.minutes,location:d.get('state','location')});
 e.assertNpcAutonomyAction?.(d.get('state'),[who],{minutes:paid?0:rule.minutes});
 const old=templeById(e,previous?.temple);if(old&&old.id!==t.id&&organizationState(e,d.get('state'),old.id)?.leader===who)throw Error('先移交原寺观主持职位');
 if(!paid){const host=steward(d,e,t,rule.minutes);pay(d,e,t,who,rule.coins,{}, {kind:'入教仪式',sourceEvent:eventId,minute:d.get('state','minute'),party:who});advanceWithNpcParticipants(d,e,rule.minutes,eventId,[who,host].filter(id=>id!=='player'));}
 if(old&&old.id!==t.id)member(d,e,old,who,true,eventId);
 member(d,e,t,who,false,eventId);const changed=changeFaith(d,e,who,t,eventId);
 if(old&&old.id!==t.id){
  adjustStanding(d,e,old.id,who,policy.formerDelta,{sourceEvent:eventId,reason:'改宗离开原寺观'});
  for(const g of groups)if(g.holder!==old.id)adjustStanding(d,e,g.holder,who,g.via.startsWith('household:')?policy.familyDelta:policy.organizationDelta,{sourceEvent:eventId,reason:'成员改宗',via:g.via});
  for(const rule of faithConflictClocks(e))if([rule.faction,rule.rival].every(id=>[old.id,t.id].includes(id)))holdingSet(d,null,path(`faith_competition:${rule.id}`),{category:'faith_competition',active:true,reason:'信众改宗',sourceEvent:eventId},'faith');
 }
 adjustStanding(d,e,t.id,who,3,{sourceEvent:eventId,reason:'完成入教仪式'});
 entityTransition(d,e,{id:`${eventId}:faith:${who}`,verb:'organize',actor:who,target:t.id,location:t.seat,visibility:'public',witnesses:presentWitnesses(d.get('state'),d.get('state','location')),
  tags:['faith','conversion'],summary:`${who==='player'?d.get('state','player','name'):e.byId.get(who)?.name??who}完成${t.name}入教仪式`});
 return {...changed,policy};
}

registerEffect('faith_claim',{sources:['faction'],validate(e,v){if(!templeById(e,v.target))throw Error('教派诉讼对方未登记');},
 apply(d,e,v,c){const id=`faith_claim:${c.sourceEvent}`;holdingSet(d,null,path(id),{category:'legal_claim',id,claimant:c.faction,respondent:v.target,location:c.settlement,
  kind:'temple_dispute',status:'待受理',sourceEvent:c.sourceEvent,minute:c.minute},'faith');return {applied:true,claim:id};}});

// A visible sign carries only the authored form, never a person's secrets or
// an asserted verdict. The effect has a bounded place and expiration.
registerEffect('faith_omen',{validate(e,v){if(!e.rules.faith?.rites?.some(r=>r.id===v.rite&&r.deity===v.deity)||!Number.isSafeInteger(v.minutes)||v.minutes<1||v.minutes>DAY)throw Error('神迹范围或时长无效');},
 apply(d,e,v,c){const key=`faith_omen:${c.sourceEvent}`,god=e.byId.get(v.deity);
  const form=e.rules.faith.rites.find(r=>r.id===v.rite).sign;
  d.set(['state','effects',key],{kind:'faith_omen',deity:god.id,location:c.settlement,since:c.minute,expires:c.minute+v.minutes,form,sourceEvent:c.sourceEvent});
  return {applied:true,omen:key,form,location:c.settlement,expires:c.minute+v.minutes};}});

function ritual(d,e,t,args,eventId){
 const who=subject(d,e,args.member??'player');if(who!=='player'&&args.consent!==true)throw Error('NPC 祭仪须本人当面同意');
 const r=e.rules.faith?.rites?.find(r=>r.id===args.choice&&r.deity===t.deity);
 const ordinary=e.rules.faith?.ordinaryRite;if(!ordinary)throw Error('未登记祭仪规则');
 const spec=r??ordinary,host=steward(d,e,t,spec.minutes);
 const at=d.get('state','minute'),members=[...new Set([who,...args.workers??[]])];
 if(members.some(id=>id!=='player')&&args.consent!==true)throw Error('集体祈愿须在场参与者同意');
 for(const id of members)subject(d,e,id);
 e.assertNpcObligationAction?.(d,members,{minutes:spec.minutes,location:d.get('state','location')});
 e.assertNpcAutonomyAction?.(d.get('state'),members,{minutes:spec.minutes});
 const all=members.map(id=>faithOf(e,d.get('state'),id).value),now=at+spec.minutes;
 const cooldown=d.get(...path(`faith_cooldown:${t.id}:${t.deity}`))?.until??0;
 const eligible=Boolean(r&&e.calendar(at).season===r.season&&cooldown<=at&&members.length>=r.collective&&all.every(f=>f?.deity===t.deity&&Number.isSafeInteger(f.observedSince)&&at-f.observedSince>=r.devotionDays*DAY&&(f.lastBreach??-1)<f.observedSince));
 pay(d,e,t,who,spec.coins,spec.offerings,{kind:'祭仪供献',sourceEvent:eventId,minute:at,party:who});
 spend(d,e,t,0,spec.offerings,{kind:'祭仪耗用',sourceEvent:eventId,minute:at,party:who},undefined,{flow:'sink:consume',purpose:'ritual',writer:'faith',eventId});advanceWithNpcParticipants(d,e,spec.minutes,eventId,[host,...members].filter(id=>id!=='player'));
 let response={applied:false,reason:'普通祭仪'};
 if(eligible){response=applyEffects(d,e,[{kind:'faith_omen',deity:t.deity,rite:r.id,minutes:r.responseMinutes}],{minute:now,sourceEvent:eventId,settlement:t.seat},'world');
  if(response.applied)holdingSet(d,null,path(`faith_cooldown:${t.id}:${t.deity}`),{category:'faith_cooldown',until:now+r.cooldownDays*DAY,sourceEvent:eventId},'faith');}
 const row={category:'faith_ritual',temple:t.id,subject:who,participants:members,minute:now,response,sourceEvent:eventId};holdingSet(d,null,path(`faith_ritual:${eventId}`),row,'faith');return row;
}
function use(d,e,t,args,eventId){
 const s=e.rules.faith?.uses?.[args.choice];if(!s)throw Error('寺观用途未登记');
 const host=steward(d,e,t,s.minutes);if(args.consent!==true)throw Error('公库用途须主持当面同意');
 const who=args.member??'player',minute=d.get('state','minute'),event={kind:args.choice,party:who,minute,sourceEvent:eventId};let lesson=null;
 if(args.choice==='repair'){
  if(typeof e.repairFaithFacility!=='function')throw Error('修缮等待设施接口，不扣钱粮');
  return clockTransaction(d,tx=>{spend(tx,e,t,s.coins,s.items,event,{account:sink('export','facility_repair'),writer:'faith',eventId},{flow:'sink:consume',purpose:'facility_repair',writer:'faith',eventId});return e.repairFaithFacility(tx,{temple:t.id,location:t.seat,eventId});});
 }
 subject(d,e,who,{recipient:['relief','medicine'].includes(args.choice)});if(who!=='player'&&args.consent!==true)throw Error('受助者须当面同意');
 e.assertNpcObligationAction?.(d,[host,who],{minutes:s.minutes,location:d.get('state','location')});
 e.assertNpcAutonomyAction?.(d.get('state'),[host,who],{minutes:s.minutes});
 if(args.choice==='school'&&who==='player')throw Error('义学面向在场居民；玩家沿原授课入口');
 spend(d,e,t,s.coins,s.items,event,{account:args.choice==='relief'?purse(e,who):['medicine','school','assembly'].includes(args.choice)?purse(e,host):sink('export','faith_service'),writer:'faith',eventId},['relief','medicine','assembly'].includes(args.choice)?{party:who,writer:'faith',eventId}:{flow:'sink:consume',purpose:'faith_service',writer:'faith',eventId});
 if(args.choice==='relief'){
  d.set(coinPath(e,who),(actor(d,e,who).coins??0)+s.coins);for(const [id,n]of Object.entries(s.items))e.itemDelta(d,who,id,n,STOCK_BOOKED);
 }else if(args.choice==='medicine'){
  // Dispensing transfers real medicine; diagnosis and treatment retain C1 and
  // the existing medical entry. A donation does not silently cure disease.
  for(const [id,n]of Object.entries(s.items))e.itemDelta(d,who,id,n,STOCK_BOOKED);
 }else if(args.choice==='school'){
  const skill=s.skill,known=npcProficiency(e,d.get('state'),host,skill),current=npcProficiency(e,d.get('state'),who,skill);
  if(known<=current)throw Error('主持未掌握可授识字程度');
  lesson={skill,gain:npcLessonGain(e,d.get('state'),who,skill,known,s.gain)};
 }else if(args.choice==='assembly'){
  for(const [id,n]of Object.entries(s.items))e.itemDelta(d,who,id,n,STOCK_BOOKED);
  adjustStanding(d,e,t.id,who,2,{sourceEvent:eventId,reason:'参加法会'});
 }
 if(['medicine','school','assembly'].includes(args.choice))d.set(coinPath(e,host),(actor(d,e,host).coins??0)+s.coins);
 advanceWithNpcParticipants(d,e,s.minutes,eventId,[host,who].filter(id=>id!=='player'));
 if(lesson)settleNpcLesson(d,e,who,lesson.skill,lesson.gain,eventId);
 const row={category:'faith_use',temple:t.id,subject:who,purpose:args.choice,cost:{coins:s.coins,items:s.items},minute,sourceEvent:eventId};holdingSet(d,null,path(`faith_use:${eventId}`),row,'faith');
 if(who!=='player'&&['relief','medicine','school'].includes(args.choice))changeFaith(d,e,who,t,eventId,{kind:args.choice,devotion:false});
 return row;
}
export function faithAction(d,args,eventId){
 const e=this;
 if(args.operation==='faith_inspect'&&!args.org)return {temples:temples(e).filter(t=>placeAncestors(e,d.get('state','location')).includes(t.seat)),uses:e.rules.faith?.uses};
 const t=temple(d,e,args.org,{local:args.operation!=='faith_pilgrim'});
 if(args.operation==='faith_inspect'){
  const state=d.get('state');return {temple:t,faith:faithOf(e,state,args.member??'player'),account:groupAccountView(e,state,t.id),policy:conversionPolicy(e,state,'player',t.seat),
   uses:e.rules.faith?.uses,rites:e.rules.faith?.rites?.filter(r=>r.deity===t.deity),
   history:Object.values(state.records??{}).filter(r=>r.temple===t.id&&['faith_use','faith_ritual'].includes(r.category)),
   omens:Object.values(state.effects??{}).filter(r=>r.kind==='faith_omen'&&r.location===state.location&&r.expires>state.minute),
   conflicts:(e.rules.factionClock?.clocks??[]).filter(r=>r.id.startsWith('faith:')&&[r.faction,r.rival].includes(t.id)).map(r=>({clock:r.id,rival:r.faction===t.id?r.rival:r.faction,
    state:state.records?.[`faction-clock:${r.id}`]??null,interventions:r.interventions})),
   claims:Object.values(state.records??{}).filter(r=>r.category==='legal_claim'&&[r.claimant,r.respondent].includes(t.id))};
 }
 subject(d,e);
 if(args.operation==='faith_convert'){
  const who=subject(d,e,args.member??'player');if(who!=='player'&&args.consent!==true)throw Error('改宗须本人当面同意');return convertFaith(d,e,t,who,eventId);
 }
 if(args.operation==='faith_give'){
  const item=args.item?e.resolve(args.item,'item'):null,coins=int(args.coins??0),quantity=int(args.quantity??0);
  if(!coins&&!quantity||quantity&&!item)throw Error('香火须有实际钱粮');
  pay(d,e,t,'player',coins,item?{[item]:quantity}:{},{kind:'香火捐献',sourceEvent:eventId,minute:d.get('state','minute'),party:'player'});return {temple:t.id,account:groupAccountView(e,d.get('state'),t.id)};
 }
 if(args.operation==='faith_use')return use(d,e,t,args,eventId);
 if(args.operation==='faith_rite')return ritual(d,e,t,args,eventId);
 if(args.operation==='faith_pilgrim'){
  const who=subject(d,e,args.member??'player');if(who==='player'){
   const from=d.get('state','location'),context=e.npcObligationAction;
   e.npcObligationAction={...context,tool:'move'};
   let result;try{result=e.move(d,{destination:t.seat,mode:'walk'},eventId);}finally{e.npcObligationAction=context;}
   holdingSet(d,null,path(`faith_pilgrimage:${eventId}`),{category:'faith_pilgrimage',subject:who,temple:t.id,purpose:'pilgrimage',from,destination:t.seat,returnLocation:from,minute:d.get('state','minute'),arrived:d.get('state','location')===t.seat,sourceEvent:eventId},'faith');
   return {...result,purpose:'朝圣',temple:t.id};
  }
  if(args.consent!==true)throw Error('朝圣约定须本人同意');
  const result=createNpcObligation(d,e,{type:'会面',promisor:who,promisee:'player',location:t.seat,start:args.start,deadline:args.deadline,minutes:30,content:`朝圣：${t.name}`},eventId);
  if(!result)throw Error('朝圣行程须先展开人物完整档案');
  d.set(['state','obligations',result.obligation.id],{...result.obligation,purpose:'pilgrimage',temple:t.id,returnLocation:actor(d,e,who).location});return result;
 }
 throw Error('未知信仰操作');
}
// Real experiences can replace a derived default. No census of far-away
// residents is required; these subscribers only touch actual participants.
export function faithExperience(d,e,events){
 if(!e.rules.faith)return;
 for(const ev of events){if(ev.legacy||d.get(...path(`faith_experience:${ev.id}`)))continue;
  const state=d.get('state'),taught=ev.verb==='learn'&&ev.tags?.includes('success'),exposed=ev.verb==='deceive'&&ev.tags?.includes('exposed');
  const who=taught?ev.actor:ev.target;if(!who||who==='player'||!state.npcs?.[who])continue;
  const provider=taught?ev.target:ev.actor,t=temples(e).find(t=>t.teacher===provider);
  if(t&&(taught||ev.verb==='help'&&ev.value>0))changeFaith(d,e,who,t,ev.id,{kind:taught?'teaching':'relief',devotion:false});
  else if(exposed||ev.tags?.includes('disaster')){
   const f=faithOf(e,state,who).value;if(!f)continue;
   holdingSet(d,null,[...actorPath(e.world,who),'faith'],{...f,observedSince:null,lastBreach:ev.minute,doubt:true,sourceEvent:ev.id,override:true},'faith');
  }else continue;
  holdingSet(d,null,path(`faith_experience:${ev.id}`),{category:'faith_experience',subject:who,sourceEvent:ev.id},'faith');
 }
}
registerWorldEventSubscriber({id:'faith_experience',order:65,on:(d,engine,events)=>faithExperience(d,engine,events)});

// A new illness is a personal calamity already settled by npc-life or the
// epidemic consumer. Observe that real transition, without polling residents
// or turning a private diagnosis into public knowledge.
export function advanceFaith(d,e,{beforeState,id}){
 if(!e.rules.faith)return;
 for(const [key,ill]of Object.entries(d.get('state','family','illnesses')??{})){
  if(beforeState?.family?.illnesses?.[key]||ill.status!=='患病中'||!d.get('state','npcs',ill.patient))continue;
  const eventId=`faith_calamity:${key}`;
  entityTransition(d,e,{id:eventId,verb:'harm',actor:ill.patient,target:ill.patient,visibility:'private',witnesses:[ill.patient],
   participants:[ill.patient],location:d.get('state','npcs',ill.patient,'location'),tags:['faith','disaster','illness'],summary:'患病使当事人重新思量祈愿',sourceEvent:id});
 }
}
