import {preconditionFailure} from './precondition.mjs';
import {sink,BOOKED} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
declareLedgerWriter('war-diplomacy',{sinks:['sink:export']});
import {recognizeIndependence,settleNationWar,changeTerritoryControl} from './nation-founding.mjs';
import {damageFacilities} from './facilities.mjs';
// U12b: campaigns share military ledgers, K4 standing, K6 effects and U17 commissions.
import {armies,armyKey,armyStrength,createArmy,ensureArmies,raiseLevy,loseSoldiers,releaseLevy,partyPay,partyCredit,partyName,partyAccount} from './military.mjs';
import {standing,adjustStanding,standingKind} from './standing.mjs';
import {traitsOf} from './traits.mjs';
import {clockRoll} from './world-clock.mjs';
import {applyEffect} from './effects.mjs';
import {tribalWars} from './tribal-awakening.mjs';
import {drawArmyRations} from './settlement-trade.mjs';
import {armyRations} from './stock.mjs';
import {regionOf} from './regions.mjs';
import {presentWitnesses} from './world-events.mjs';
import {declareHoldingWriter,holdingRemove} from './holdings.mjs';
import {holdingSet} from './holding-sources.mjs';
declareHoldingWriter('war-diplomacy',{kinds:['governs','controls','allied_with']});
const DAY=1440,copy=x=>structuredClone(x),path=id=>['state','records',id];
export const WAR_VERSION=1;
const rules=e=>e.rules.warDiplomacy;
export const wars=s=>Object.values(s.records??{}).filter(r=>r.category==='war');
const active=w=>['交战','停战'].includes(w.status);
const fresh=e=>!e.replaying||e.replayResult?.warVersion===WAR_VERSION;
const name=(e,s,id)=>partyName(e,s,id);
const sideOf=(w,a)=>a.warSide??a.party;
const pair=(a,b)=>[a,b].sort().join(':');
function save(d,w){holdingSet(d,null,path(`war:${w.id}`),w,'war-diplomacy');}
export function validateWarDiplomacy(world){
 const r=world.rules?.warDiplomacy;if(!r)return [];
 const errors=[],has=id=>world.locations.some(l=>l.id===id),party=id=>world.factions?.some(f=>f.id===id)||world.regions?.some(c=>c.id===id)||world.households?.some(h=>h.settlement===id);
 if(r.version!==1||![7,30].includes(r.intervalDays)||!Number.isInteger(r.maxRounds)||r.maxRounds<1||r.maxRounds>60)errors.push('战争周期、立场或委托参数无效');
 if(!(r.declareStanding>=-100&&r.declareStanding<0&&r.allianceStanding>0&&r.allianceStanding<=100)||!(r.lossBps>0&&r.lossBps<=5000)||!(r.winScore>0))errors.push('战争周期、立场或委托参数无效');
 const ids=new Set();
 for(const s of r.sources??[]){
  if(ids.has(s.id)||!has(s.front)||!party(s.aggressor)||!party(s.defender)||s.aggressor===s.defender||!(s.startDay>=1)||!s.armies?.length||s.armies.some(id=>!world.rules.military?.armies.some(a=>a.id===id)))errors.push(`战争来源或前线引用无效：${s.id}`);ids.add(s.id);
  if((s.routes??[]).some(id=>!world.routes.some(e=>e.id===id))||(s.villages??[]).some(id=>!has(id))||s.territory&&!world.regions.some(c=>c.id===s.territory))errors.push(`战争来源或前线引用无效：${s.id}`);
 }
 const q=r.quest;if(!q||!has(q.board)||!world.npcs.some(n=>n.id===q.publisher)||!party(q.faction)||!(q.reward>=world.rules.quests.rewardCopperRanges[q.grade]?.[0]&&q.reward<=world.rules.quests.rewardCopperRanges[q.grade]?.[1]))errors.push('战争周期、立场或委托参数无效');
 return errors;
}
function relations(d,e,a,b,value,src,minute){
 for(const [holder,target] of [[a,b],[b,a]])adjustStanding(d,e,holder,target,value-standing(e,d.get('state'),holder,target),{sourceEvent:src,reason:'战事结算',minute});
}
function announce(d,e,w,claim,at,src){
 const carriers=presentWitnesses(d.get('state'),w.front).filter((id,i,all)=>all.indexOf(id)===i&&d.get('state','npcs',id)&&e.world.npcs.some(n=>n.id===id));
 if(carriers.length)applyEffect(d,e,{kind:'rumor',id:'war_news',claim,carriers},{minute:at,sourceEvent:src,settlement:w.front,faction:w.aggressor},'world');
 const id=`${src}:public`;holdingSet(d,null,path(`world_event:${id}`),{category:'world_event',id,verb:'clash',actor:w.aggressor,target:w.defender,location:w.front,minute:at,witnesses:carriers,tags:['war','public'],claim,sourceEvent:src},'war-diplomacy');
}
export function startWar(d,e,spec,at,src){
 const old=d.get(...path(`war:${spec.id}`));if(old)return old;
 if(wars(d.get('state')).some(w=>active(w)&&pair(w.aggressor,w.defender)===pair(spec.aggressor,spec.defender)))return null;
 ensureArmies(d,e,at);
 const w={category:'war',id:spec.id,name:spec.name,aggressor:spec.aggressor,defender:spec.defender,front:spec.front,armyIds:[...spec.armies],routes:spec.routes??[],villages:spec.villages??[],territory:spec.territory??null,
  status:'交战',since:at,nextAt:at+rules(e).intervalDays*DAY,rounds:0,score:0,history:[],supplyCut:{},sourceEvent:src,source:spec.source??'diplomacy',initial:{}};
 for(const id of w.armyIds){const row=d.get(...path(armyKey(id)));if(!row||row.war)throw preconditionFailure('参战队伍不存在或已在别处出征');const a=copy(row);if(![w.aggressor,w.defender].includes(a.party))throw preconditionFailure('军队不属于交战双方');raiseLevy(d,e,a,at,src);a.war=w.id;a.status='出征';a.location=w.front;w.initial[a.party]=(w.initial[a.party]??0)+armyStrength(a);holdingSet(d,null,path(armyKey(id)),a,'war-diplomacy');}
 relations(d,e,w.aggressor,w.defender,rules(e).declareStanding,src,at);save(d,w);
 announce(d,e,w,`${w.name}已经开战，行旅须避开交战地。`,at,src);return w;
}
function setDisruption(d,e,w,at){
 const r=rules(e),until=at+r.intervalDays*DAY;
 holdingSet(d,null,path(`war-disruption:${w.id}`),{category:'war_disruption',war:w.id,since:at,until,routes:w.routes,locations:[w.front,...w.villages],factor:r.priceFactor},'war-diplomacy');
 // Reprice quotes made earlier the same day after a campaign changes the local market.
 for(const key of Object.keys(d.get('state','quotes')??{}))if(key.startsWith(`region:${Math.floor(at/DAY)}:`))d.remove(['state','quotes',key]);
}
function sidePower(d,e,w,party,at){
 const r=rules(e),season=e.calendar(at).season,tags=traitsOf(e,d.document,w.front).tags;
 const terrain=party===w.defender?1+tags.reduce((n,t)=>n+(r.defenderTraits[t]??0),0):1;
 const units=w.armyIds.map(id=>d.get(...path(armyKey(id)))).filter(a=>a&&sideOf(w,a)===party);
 const power=units.reduce((n,a)=>n+armyStrength(a)*(r.powerTrainingBase+a.training/100)*(r.powerMoraleBase+a.morale/100)*(a.hungry?r.hungryFactor:1),0)*terrain*r.seasonFactors[season];
 return {power,strength:units.reduce((n,a)=>n+armyStrength(a),0),terrain,season,units};
}
function raid(d,e,w,winner,at,src){
 const village=w.villages[w.rounds%Math.max(1,w.villages.length)];if(!village)return null;
 damageFacilities(d,e,[village],15,{cause:'战事',minute:at,sourceEvent:src,actor:winner});
 // S1b: 掠得的粮记入胜方队伍的军粮；没有本方队伍接收则就地毁弃。
 const unit=w.armyIds.map(id=>d.get(...path(armyKey(id)))).find(a=>a&&sideOf(w,a)===winner);
 const food=drawArmyRations(d,e,village,rules(e).raidFood,{raid:true,to:unit?{account:armyRations(e,unit.id)}:{flow:'sink:destroy',purpose:'raid'},eventId:src});
 if(unit&&food)holdingSet(d,null,path(armyKey(unit.id)),{...unit,food:unit.food+food},'war-diplomacy');
 // Ordinary family migration chooses a host and route; the war supplies the danger.
 holdingSet(d,null,path(`war-danger:${village}`),{category:'war_danger',war:w.id,settlement:village,actor:winner,since:at,until:at+rules(e).intervalDays*DAY,sourceEvent:src},'war-diplomacy');
 for(const id of Object.keys(d.get('state','npcs')))if(e.byId.get(id)?.settlement===village||e.world.households?.some(h=>h.settlement===village&&h.members.includes(id))){
  const stream=d.get('state','npcs',id,'memoryStream')??[];d.set(['state','npcs',id,'memoryStream'],[...stream,{id:`${src}:${id}`,sourceEvent:src,kind:'conflict',sourceType:'亲历',minute:at,location:village,participants:[winner,id],content:'交战队伍掠过村庄，家中准备避祸。',salience:3,emotion:'恐惧'}]);
 }
 adjustStanding(d,e,village,winner,-rules(e).raidStanding,{sourceEvent:src,reason:'战事结算',minute:at});
 announce(d,e,w,`${w.name}战报：${name(e,d.get('state'),winner)}占了上风，沿线村庄受到波及。`,at,src);
 return {village,food};
}
export function endWar(d,e,w,{winner=null,tribute=0,at,src,status='议和'}){
 const settled=d.get(...path(`war:${w.id}`));if(settled?.endedAt!==undefined)return settled;
 w.status=status;w.endedAt=at;w.winner=winner;w.nextAt=null;
 for(const t of tribalWars(d.get('state')))if(t.war===w.id)holdingSet(d,e,path(`tribal_war:${t.dynamic}`),{...t,status,endedAt:at,winner},'war-diplomacy');
 for(const id of w.armyIds){const row=d.get(...path(armyKey(id)));if(!row)continue;const a=copy(row);releaseLevy(d,e,a,a.levy.count,{at,reason:'战事结算'});a.war=null;delete a.warSide;a.location=a.home;a.status=armyStrength(a)?'驻守':'待征';holdingSet(d,e,path(armyKey(id)),a,'war-diplomacy');}
 holdingRemove(d,null,path(`war-disruption:${w.id}`),'war-diplomacy');for(const v of w.villages)if(d.get(...path(`war-danger:${v}`))?.war===w.id)holdingRemove(d,null,path(`war-danger:${v}`),'war-diplomacy');
 relations(d,e,w.aggressor,w.defender,rules(e).peaceStanding,src,at);
 if(winner===w.aggressor&&w.territory)changeTerritoryControl(d,e,w.territory,winner,{at,src,war:w.id});
 if(winner&&tribute){const loser=winner===w.aggressor?w.defender:w.aggressor;holdingSet(d,e,path(`tribute:${pair(winner,loser)}`),{category:'tribute',payer:loser,payee:winner,amount:tribute,nextAt:at+30*DAY,arrears:0,war:w.id,sourceEvent:src},'war-diplomacy');}
 settleNationWar(d,e,w,{winner,at,src});
 save(d,w);announce(d,e,w,`${w.name}已经${status}，战后条件已经议定。`,at,src);return w;
}
export function campaignRound(d,e,w,at){
 if(w.status!=='交战')return null;const r=rules(e),src=`war:${w.id}:${at}`;
 const county=regionOf(e.world,w.front)?.county.id;
 for(const h of e.world.households??[])if(regionOf(e.world,h.settlement)?.county.id===county&&e.world.locations.find(l=>l.id===h.settlement)?.region&& !w.villages.includes(h.settlement))w.villages.push(h.settlement);
 const left=sidePower(d,e,w,w.aggressor,at),right=sidePower(d,e,w,w.defender,at),roll=r.rollMinimum+clockRoll(d.document.randomSeed,w.id,at/DAY)*r.rollRange;
 const winner=left.power*roll>=right.power?w.aggressor:w.defender;
 const losses={};for(const side of [left,right])for(const row of side.units){const a=copy(row),n=Math.min(armyStrength(a),Math.ceil(armyStrength(a)*r.lossBps/10000*(sideOf(w,a)===winner?r.winnerLossFactor:r.loserLossFactor)));
  losses[a.id]=loseSoldiers(d,e,a,n,{at,reason:'战事结算',killed:true});a.morale=Math.max(0,Math.min(100,a.morale+(sideOf(w,a)===winner?r.victoryMorale:-r.victoryMorale)));holdingSet(d,null,path(armyKey(a.id)),a,'war-diplomacy');}
 w.rounds++;w.score+=winner===w.aggressor?1:-1;w.supplyCut={};
 for(const id of w.armyIds){const a=d.get(...path(armyKey(id)));if(a&&sideOf(w,a)!==winner)w.supplyCut[id]=true;}
 setDisruption(d,e,w,at);const raided=raid(d,e,w,winner,at,src);
 const row={minute:at,winner,left:{power:left.power,strength:left.strength,terrain:left.terrain},right:{power:right.power,strength:right.strength,terrain:right.terrain},season:left.season,roll,losses,raid:raided};w.history=[...w.history,row].slice(-60);w.nextAt=at+r.intervalDays*DAY;save(d,w);
 announce(d,e,w,`${w.name}战报：${name(e,d.get('state'),winner)}占了上风，沿线村庄受到波及。`,at,src);
 const remaining=p=>w.armyIds.map(id=>d.get(...path(armyKey(id)))).filter(a=>a&&sideOf(w,a)===p).reduce((n,a)=>n+armyStrength(a),0);
 const leftRemaining=remaining(w.aggressor),rightRemaining=remaining(w.defender);
 if(!leftRemaining||!rightRemaining||Math.abs(w.score)>=r.winScore||w.rounds>=r.maxRounds){
  const victor=!leftRemaining&&!rightRemaining?null:!leftRemaining?w.defender:!rightRemaining?w.aggressor:w.score===0?null:w.score>0?w.aggressor:w.defender;
  endWar(d,e,w,{winner:victor,tribute:r.tributeCopperMonth,at,src:`${src}:peace`});
 }
 return row;
}
export function advanceWarDiplomacy(d,e,{before,after}){
 const r=rules(e);if(!r||!fresh(e))return;
 for(let day=Math.floor(before/DAY)+1;day*DAY<=after;day++){
  const at=day*DAY;
  for(const s of r.sources??[])if(day>=s.startDay&&!d.get(...path(`war:${s.id}`))){
   const key=`war-source:${s.id}`;
   if(!d.get(...path(key))){for(const [holder,target] of [[s.aggressor,s.defender],[s.defender,s.aggressor]])adjustStanding(d,e,holder,target,s.initialStanding,{sourceEvent:`war:source:${s.id}`,reason:'边境争端',minute:at});holdingSet(d,null,path(key),{category:'war_source',id:s.id,minute:at},'war-diplomacy');}
   if(standing(e,d.get('state'),s.aggressor,s.defender)<=r.declareStanding)startWar(d,e,s,at,`war:source:${s.id}`);
  }
  for(const t of tribalWars(d.get('state')).filter(t=>t.status==='对峙')){
   const id=`tribal_${t.dynamic}`;if(d.get(...path(`war:${id}`)))continue;
   const defender=t.defenders.find(id=>e.world.factions?.some(f=>f.id===id));if(!defender)continue;
   const aid=`army_tribal_${t.dynamic}`.slice(0,46);
   createArmy(d,e,{id:aid,name:'砾泉苔背战队',party:t.aggressor,base:t.front,location:t.front,supply:'forage',regular:t.strength,training:r.tribalTraining,morale:r.tribalMorale,payCopperMonth:0},at,t.sourceEvent);
   const defenders=armies(d.get('state')).filter(a=>a.party===defender&&!a.war).map(a=>a.id);if(!defenders.length){ensureArmies(d,e,at);defenders.push(...armies(d.get('state')).filter(a=>a.party===defender&&!a.war).map(a=>a.id));}if(!defenders.length)continue;
   startWar(d,e,{id,name:'砾泉矿道争战',aggressor:t.aggressor,defender,front:t.front,armies:[aid,...defenders],villages:r.tribalVillages,routes:r.tribalRoutes,source:'tribal_war'},at,t.sourceEvent);
   holdingSet(d,null,path(`tribal_war:${t.dynamic}`),{...t,status:'交战',war:id,handler:'U12',note:'军队与战役已接管'},'war-diplomacy');
  }
  for(const old of wars(d.get('state'))){const w=copy(old);if(w.status==='交战'&&w.nextAt<=at)campaignRound(d,e,w,at);else if(w.status==='停战'&&w.truceUntil<=at){w.status='交战';w.nextAt=at+r.intervalDays*DAY;save(d,w);}}
  postWarQuests(d,e,at);
  for(const old of Object.values(d.get('state','records')??{}).filter(t=>t.category==='tribute'&&t.nextAt<=at)){
   const t=copy(old),owed=t.amount+t.arrears,paid=partyPay(d,e,t.payer,owed,{sourceEvent:`tribute:${t.war}:${at}`,reason:'战事结算',books:{account:partyAccount(e,d.get('state'),t.payee),writer:'war-diplomacy',eventId:`tribute:${t.war}:${at}`}});partyCredit(d,e,t.payee,paid,{sourceEvent:`tribute:${t.war}:${at}`,reason:'战事结算',books:BOOKED});t.arrears=owed-paid;t.nextAt+=30*DAY;t.lastPaid=paid;holdingSet(d,null,path(`tribute:${pair(t.payer,t.payee)}`),t,'war-diplomacy');
   if(t.arrears)adjustStanding(d,e,t.payee,t.payer,-r.tributeBreachStanding,{sourceEvent:`tribute:${t.war}:${at}`,reason:'战事结算',minute:at});
  }
 }
}
function controlled(e,s,party){return party==='player'||s.records?.[`organization:${party}`]?.leader==='player';}
export function warAction(d,args,src){
 const e=this,r=rules(e),state=d.get('state');if(!r)throw preconditionFailure('未登记战争外交规则');
 if(args.operation==='war_inspect')return {wars:wars(state),relations:args.org&&args.member?standing(e,state,args.org,args.member):null,territories:Object.values(state.records??{}).filter(t=>t.category==='territory'),tribute:Object.values(state.records??{}).filter(t=>t.category==='tribute'),choices:['declare','truce','peace','ally','tribute'],actionScope:{kind:'instant'}};
 if(args.operation==='diplomacy'&&args.choice==='recognize')return recognizeIndependence(d,e,args.org,args.member,src);
 const w=copy(wars(state).find(w=>w.id===args.clock));
 if(args.operation==='war_join'){
  if(!w||w.status!=='交战')throw preconditionFailure('clock 须指定双方正在交涉的战事');const service=state.records['military_service:player'],a=state.records[armyKey(args.org??service?.army)];if(!a||!controlled(e,state,a.party)&&a.id!==service?.army)throw preconditionFailure('此项交涉未满足权限、立场或前线条件；用 war_inspect 查看');
  if(state.location!==w.front||a.location!==state.location)throw preconditionFailure('此项交涉未满足权限、立场或前线条件；用 war_inspect 查看');const side=[w.aggressor,w.defender].find(p=>p===a.party||state.records[`diplomacy:${pair(p,a.party)}`]?.status==='结盟');if(!side)throw preconditionFailure('须先以外交结盟参战方');if(a.war&&a.war!==w.id)throw preconditionFailure('队伍已在别处出征');
  holdingSet(d,e,path(armyKey(a.id)),{...a,war:w.id,warSide:side,status:'出征'},'war-diplomacy');if(!w.armyIds.includes(a.id))w.armyIds.push(a.id);save(d,w);return {war:w.id,army:a.id,note:'前线交锋用 world_combat；击溃参战人物回写战役'};
 }
 const a=args.org,b=args.member,choice=args.choice;
 if(!standingKind(e,state,a)||!standingKind(e,state,b)||a===b)throw preconditionFailure('org 与 member 须为不同的已登记交涉方');
 const own=controlled(e,state,a),local=w&&state.location===w.front;
 if(!own&&!(local&&['truce','peace'].includes(choice)&&standing(e,state,a,'player')>=r.mediationStanding&&standing(e,state,b,'player')>=r.mediationStanding))throw preconditionFailure('此项交涉未满足权限、立场或前线条件；用 war_inspect 查看');
 const score=a==='player'?standing(e,state,b,a):Math.min(standing(e,state,a,b),standing(e,state,b,a)),at=state.minute;
 if(choice==='declare'){
  if(!own||score>r.declareStanding)throw preconditionFailure('此项交涉未满足权限、立场或前线条件；用 war_inspect 查看');const ids=armies(state).filter(x=>[a,b].includes(x.party)&&!x.war).map(x=>x.id);if(!ids.some(id=>state.records[armyKey(id)].party===a)||!ids.some(id=>state.records[armyKey(id)].party===b))throw preconditionFailure('此项交涉未满足权限、立场或前线条件；用 war_inspect 查看');
  const war=startWar(d,e,{id:`player_${src}`.replace(/[^a-z0-9_]/gi,'_'),name:'边地争战',aggressor:a,defender:b,front:state.location,armies:ids},at,src);return {war:war?.id};
 }
 if(choice==='ally'){
  if(score<r.allianceStanding||wars(state).some(w=>active(w)&&pair(w.aggressor,w.defender)===pair(a,b)))throw preconditionFailure('此项交涉未满足权限、立场或前线条件；用 war_inspect 查看');
  holdingSet(d,e,path(`diplomacy:${pair(a,b)}`),{category:'diplomacy',parties:[a,b],status:'结盟',minute:at,sourceEvent:src},'war-diplomacy');relations(d,e,a,b,r.allianceStanding+r.allianceGain,src,at);return {status:'结盟'};
 }
 if(!w||!active(w)||pair(a,b)!==pair(w.aggressor,w.defender))throw preconditionFailure('clock 须指定双方正在交涉的战事');
 if(!own&&partyPay(d,e,'player',r.mediationCopper,{sourceEvent:src,reason:'战事结算',partial:false,books:{account:sink('export','mediation'),writer:'war-diplomacy',eventId:src}})!==r.mediationCopper)throw preconditionFailure('此项交涉未满足权限、立场或前线条件；用 war_inspect 查看');
 if(choice==='truce'&&own&&score<r.truceStanding&&Math.abs(w.score)<r.peaceScore)throw preconditionFailure('对方尚不愿停战，须改善立场或打出战果');
 if(choice==='truce'){w.status='停战';w.truceUntil=Math.ceil((at+r.truceDays*DAY)/DAY)*DAY;save(d,w);holdingRemove(d,null,path(`war-disruption:${w.id}`),'war-diplomacy');relations(d,e,a,b,r.truceStanding,src,at);return {war:w.id,status:w.status,until:w.truceUntil};}
 if(!['peace','tribute'].includes(choice))throw preconditionFailure('此项交涉未满足权限、立场或前线条件；用 war_inspect 查看');
 if(choice==='peace'&&own&&score<r.peaceStanding&&Math.abs(w.score)<r.peaceScore)throw preconditionFailure('此项交涉未满足权限、立场或前线条件；用 war_inspect 查看');
 return endWar(d,e,w,{winner:choice==='tribute'?b:null,tribute:choice==='tribute'?r.tributeCopperMonth:0,at,src});
}
// Activities call this once when a real combat exchange defeats a listed participant.
export function warCombatResult(d,e,{target,damage,received,killed,retreated},src){
 const state=d.get('state'),service=state.records['military_service:player'],a=state.records[armyKey(service?.army)]??armies(state).find(a=>a.war&&controlled(e,state,a.party)),w=a?.war&&copy(state.records[`war:${a.war}`]);if(!w||w.status!=='交战'||state.location!==w.front)return null;
 const foe=w.armyIds.map(id=>state.records[armyKey(id)]).find(unit=>unit&&sideOf(w,unit)!==sideOf(w,a)&&(unit.levy.people.some(p=>p.id===target)||state.records[`organization:${unit.party}`]?.members?.[target]||e.world.factions?.find(f=>f.id===unit.party)?.members?.includes(target)));
 if(!foe)return null;const key=`war-combat:${w.id}:${target}`;if(state.records[key]||!killed&&!retreated)return null;
 const unit=copy(foe);let losses=0;
 if(unit.levy.people.some(p=>p.id===target)){unit.levy.people=[...unit.levy.people.filter(p=>p.id!==target),unit.levy.people.find(p=>p.id===target)];releaseLevy(d,e,unit,1,{at:state.minute,reason:'前线交锋',killed,person:target});losses=1;}else if(unit.regular){unit.regular--;losses=1;}else if(unit.private){unit.private--;losses=1;}else if(unit.mercenary?.count){unit.mercenary.count--;losses=1;if(!unit.mercenary.count)unit.mercenary=null;}
 unit.morale=Math.max(0,unit.morale-rules(e).exchangeMorale);holdingSet(d,null,path(armyKey(unit.id)),unit,'war-diplomacy');w.score+=sideOf(w,a)===w.aggressor?1:-1;save(d,w);
 holdingSet(d,null,path(key),{category:'war_combat',war:w.id,target,damage,received,killed,retreated,losses,sourceEvent:src,minute:state.minute},'war-diplomacy');return {war:w.id,losses,score:w.score};
}
function postWarQuests(d,e,at){
 const q=rules(e).quest;
 for(const w of wars(d.get('state')).filter(w=>w.status==='交战'))applyEffect(d,e,{kind:'quest_post',id:'war_supply',...q,funding:'faction',label:`${w.name}军需`,objective:{type:'deliver',item:q.item,quantity:q.quantity,location:q.board}},
  {minute:at,sourceEvent:`war:${w.id}`,settlement:q.board,faction:q.faction},'world');
}
export function warScene(e,document){const s=document.state,rows=wars(s).filter(w=>active(w)&&(w.front===s.location||w.villages.includes(s.location)));return rows.length?`【战事】${rows.map(w=>`${w.name}，${w.status}（${w.id}），交涉与军需查 war_inspect`).join('；')}。`:'';}
