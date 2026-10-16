import {nobleRules,nationRows,liveNation,rulerNation,nationAt,currentDomains,domainSettlements,domainPopulation,containsDomain,titlesOf,highTitle,nobleLords} from './noble-state.mjs';
import {armies,armyKey,armyStrength,ensureArmies,partyCoins,partyPay,partyCredit,partyAccount} from './military.mjs';
import {treasury,BOOKED} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
declareLedgerWriter('nation-founding');
import {startWar,wars} from './war-diplomacy.mjs';
import {standing,adjustStanding} from './standing.mjs';
import {groupAccountView,changeGroupCoins} from './group-account.mjs';
import {legalCodeAt} from './law-codes.mjs';
import {regionOf} from './regions.mjs';
import {settlementHead} from './entity-view.mjs';
import {entityTransition} from './entity-transitions.mjs';
const DAY=1440,rec=id=>['state','records',id],pair=(a,b)=>[a,b].sort().join(':'),rows=s=>Object.values(s.records??{});
const activeWar=(s,a,b)=>wars(s).some(w=>['交战','停战'].includes(w.status)&&pair(w.aggressor,w.defender)===pair(a,b));
function external(e,s,id,who){
 const f=e.world.factions?.find(f=>f.id===id);return Boolean(f&&f.leader!==who&&s.records?.[`organization:${id}`]?.leader!==who&&!f.members?.includes(who));
}
export function recognitions(e,s,who){
 const r=nobleRules(e)?.founding;if(!r)return [];
 const nation=rulerNation(s,who),party=nation?.id??who;
 return rows(s).filter(t=>t.category==='diplomacy'&&t.status==='承认独立'&&t.subject===who&&external(e,s,t.recognizer,who)&&
  standing(e,s,t.recognizer,party)>=r.standing&&!activeWar(s,t.recognizer,party)).map(t=>t.recognizer).filter((id,i,a)=>a.indexOf(id)===i);
}
export function nationReadiness(e,s,who='player'){
 const r=nobleRules(e)?.founding,domains=currentDomains(e,s,who),nation=rulerNation(s,who),party=nation?.id??who;
 const settlements=domainSettlements(e,s,domains).filter(id=>!nation||nationAt(e,s,id)?.id===nation.id),population=settlements.reduce((sum,id)=>sum+Math.max(0,s.settlements?.[id]?.population??0),0);
 const units=armies(s).filter(a=>a.party===party),soldiers=units.reduce((n,a)=>n+armyStrength(a),0),treasury=partyCoins(e,s,party),recognized=recognitions(e,s,who),reasons=[];
 if(!r)return {domains,settlements,population,soldiers,treasury,recognized,reasons:['未登记建国制度'],ready:false};
 if(!nation&&!nobleLords(e,s).some(t=>t.holder===who))reasons.push('没有男爵以上受封领地');
 if(settlements.length<r.settlements)reasons.push(`领地需至少${r.settlements}处现存聚落`);
 if(population<r.population)reasons.push(`人口不足${r.population}`);
 if(soldiers<r.soldiers)reasons.push(`军力不足${r.soldiers}`);
 if(!nation&&units.some(a=>a.war))reasons.push('军队须先结束现有战役');
 if(treasury<r.treasury)reasons.push(`财政不足${r.treasury}`);
 if(recognized.length<r.recognitions)reasons.push(`外部承认不足${r.recognitions}`);
 return {domains,settlements,population,soldiers,treasury,recognized,reasons,ready:!reasons.length};
}
function publish(d,e,n,verb,src,at,summary){
 entityTransition(d,e,{id:src,verb,actor:n.ruler,target:n.id,minute:at,location:n.capital,summary,tags:['nation','public']});
}
export function recognizeIndependence(d,e,a,b,src){
 const s=d.get('state'),who=liveNation(s,a)?.ruler??a,party=rulerNation(s,who)?.id??who;
 if(!(a==='player'||s.records?.[`organization:${a}`]?.leader==='player')||!external(e,s,b,who))throw Error('须由本人或本国请求外部势力承认');
 if(!titlesOf(s,who).some(highTitle)&&!rulerNation(s,who))throw Error('尚无可承认的独立领地');
 if(standing(e,s,b,party)<nobleRules(e).founding.standing||activeWar(s,party,b))throw Error('对方立场不足或仍在交战');
 const key=`recognition:${who}:${b}`,row={category:'diplomacy',status:'承认独立',parties:[party,b],subject:who,recognizer:b,minute:s.minute,sourceEvent:src};d.set(rec(key),row);
 return {recognition:row};
}
function suzerain(e,s,domain){
 const c=e.world.regions?.find(c=>c.id===domain&&c.category==='county')??regionOf(e.world,domain)?.county;
 return c?.id??(e.world.regions?.find(p=>p.id===domain)?.counties??[])[0]??null;
}
function launchIndependenceWar(d,e,n,at,src){
 ensureArmies(d,e,at);const all=armies(d.get('state')).filter(a=>[n.id,n.suzerain].includes(a.party)&&!a.war),mine=all.filter(a=>a.party===n.id),foes=all.filter(a=>a.party===n.suzerain);
 if(!mine.length||!foes.length)return null;
 return startWar(d,e,{id:`independence_${n.id}`,name:`${n.name}独立战争`,aggressor:n.suzerain,defender:n.id,front:n.capital,armies:all.map(a=>a.id),villages:domainSettlements(e,d.get('state'),n.domains),source:'independence'},at,src);
}
function react(d,e,n,at,src){
 const score=standing(e,d.get('state'),n.suzerain,n.ruler),r=nobleRules(e);
 if(score>=r.founding.standing)return {...n,status:'独立',reaction:'承认'};
 if(score<=r.npc.hostility){const war=launchIndependenceWar(d,e,n,at,src);return {...n,status:'独立待定',reaction:war?'宣战':'待集结',war:war?.id??null};}
 return {...n,status:'谈判中',reaction:'谈判',terms:{tribute:e.rules.warDiplomacy.tributeCopperMonth}};
}
export function foundNation(d,e,{who='player',name,capital,coins},src,at=d.get('state','minute')){
 if(rulerNation(d.get('state'),who))throw Error('已经建立国家');
 ensureArmies(d,e,at);const s=d.get('state'),ready=nationReadiness(e,s,who);if(!ready.ready)throw Error(ready.reasons.join('；'));
 if(typeof name!=='string'||!name.trim()||name.length>80)throw Error('国名为空或过长');
 if(!e.world.locations.some(l=>l.id===capital)||!ready.domains.some(id=>containsDomain(e,s,id,capital)))throw Error('首府须在本人领地现存地点');
 const baseLaw=legalCodeAt(e,capital,s);if(!baseLaw)throw Error('首府没有可沿用的现行法典');
 const amount=coins??nobleRules(e).founding.treasury;if(!Number.isSafeInteger(amount)||amount<nobleRules(e).founding.treasury||amount>ready.treasury)throw Error('须将足额真实财产转入国库');
 const id=`nation_${src}`.replace(/[^a-zA-Z0-9_]/g,'_');if(s.records?.[`nation:${id}`])throw Error('国家编号已占用');
 const originalSuzerain=suzerain(e,s,ready.domains[0]);if(!originalSuzerain)throw Error('原宗主来源缺失');
 if(partyPay(d,e,who,amount,{sourceEvent:src,reason:'独立国库',partial:false,books:{account:treasury(id),writer:'nation-founding',eventId:src}})!==amount)throw Error('国库款项不足');
 d.set(rec(`organization:${id}`),{category:'organization',id,source:'created',kind:'王国',name:name.trim(),seat:capital,leader:who,founder:who,foundedAt:at,members:{[who]:{position:'国王',joinedAt:at,arrears:0}},removed:{},charter:{mode:'leader',approval:true,fee:0,dues:0,rules:['独立国库与本国法典']},treasury:0,ledger:[]});
 let n={category:'nation',id,name:name.trim(),ruler:who,capital,domains:ready.domains,suzerain:originalSuzerain,status:'独立待定',foundedAt:at,lawSource:baseLaw.id,amendments:{},taxes:{},nextReview:at+nobleRules(e).founding.reviewDays*DAY,breaches:0,sourceEvent:src};
 d.set(rec(`nation:${id}`),n);changeGroupCoins(d,e,id,amount,{kind:'建国入库',sourceEvent:src,minute:at},BOOKED);
 for(const a of armies(d.get('state')).filter(a=>a.party===who))d.set(rec(armyKey(a.id)),{...a,party:id,partyName:n.name});
 for(const domain of n.domains)d.set(rec(`territory:${domain}`),{category:'territory',county:domain,ruler:id,previous:n.suzerain,minute:at,sourceEvent:src});
 for(const recognizer of ready.recognized){const value=standing(e,s,recognizer,who);adjustStanding(d,e,recognizer,id,value,{sourceEvent:src,reason:'独立承认',minute:at});}
 n=react(d,e,n,at,src);d.set(rec(`nation:${id}`),n);
 const title=s.records?.[`title:${who}`];if(title)d.set(rec(`title:${who}`),{...title,status:'独立',title:'国王',rank:'唯一',formerTitle:title.title,independentNation:id});
 publish(d,e,n,'organize',`${src}:founded`,at,`${n.name}宣布独立，原宗主${n.reaction}`);return n;
}
function collapse(d,e,n,status,winner,at,src){
 const next={...n,status,endedAt:at,annexedBy:winner};d.set(rec(`nation:${n.id}`),next);
 for(const domain of n.domains)d.set(rec(`territory:${domain}`),{category:'territory',county:domain,ruler:winner,previous:n.id,minute:at,sourceEvent:src});
 const coins=groupAccountView(e,d.get('state'),n.id)?.coins??0;if(coins){changeGroupCoins(d,e,n.id,-coins,{kind:'吞并转出',sourceEvent:src,minute:at},{account:partyAccount(e,d.get('state'),winner),writer:'nation-founding',eventId:src});partyCredit(d,e,winner,coins,{sourceEvent:src,reason:'吞并接收',books:BOOKED});}
 for(const a of armies(d.get('state')).filter(a=>a.party===n.id))d.set(rec(armyKey(a.id)),{...a,party:winner,partyName:winner});
 for(const o of rows(d.get('state')).filter(o=>o.category==='governance_office'&&o.status==='在任'&&n.domains.some(id=>containsDomain(e,d.get('state'),id,o.settlement))))d.set(rec(o.id),{...o,status:'已免职',removedAt:at,reason:status});
 const t=d.get('state','records',`title:${n.ruler}`);if(t?.independentNation===n.id)d.set(rec(`title:${n.ruler}`),{...t,status:'已除爵',strippedAt:at,reason:status});
 publish(d,e,next,'transfer',src,at,`${n.name}${status}`);return next;
}
export function settleNationWar(d,e,w,{winner,at,src}){
 for(const n of nationRows(d.get('state')).filter(n=>liveNation(d.get('state'),n.id)&&[w.aggressor,w.defender].includes(n.id))){
  if(w.source==='independence'&&winner&&winner!==n.id)collapse(d,e,n,'被吞并',winner,at,src);
  else if(w.source==='independence'){const next={...n,status:'独立',reaction:winner===n.id?'独立战争获胜':'议和承认'};d.set(rec(`nation:${n.id}`),next);publish(d,e,next,'pact',`${src}:independent`,at,`${n.name}独立战争结束，保留独立`);}
  else if(winner&&winner!==n.id&&w.territory&&n.domains.includes(w.territory)){
   const next={...n,domains:n.domains.filter(id=>id!==w.territory)};d.set(rec(`nation:${n.id}`),next);if(!next.domains.length)collapse(d,e,next,'被吞并',winner,at,src);
  }
 }
}
export function nationAction(d,args,src){
 const e=this,s=d.get('state'),n=rulerNation(s,'player');
 if(args.operation==='nation_inspect')return {nation:n,readiness:nationReadiness(e,s),requirements:nobleRules(e)?.founding,recognition:{operation:'diplomacy',choice:'recognize',org:n?.id??'player',member:'外部势力ID'},choices:['found','negotiate','law','tax'],actionScope:{kind:'instant'}};
 if(args.choice==='found')return {nation:foundNation(d,e,{name:args.name,capital:args.settlement??s.location,coins:args.coins},src)};
 if(!n)throw Error('尚未建立国家');
 if(args.choice==='negotiate'){
  if(n.status!=='谈判中')throw Error('没有未决宗主谈判');
  if(args.consent===true){const key=`tribute:${pair(n.id,n.suzerain)}`;d.set(rec(key),{category:'tribute',payer:n.id,payee:n.suzerain,amount:n.terms.tribute,arrears:0,nextAt:s.minute+30*DAY,war:n.id,sourceEvent:src});const next={...n,status:'独立',reaction:'贡赋议和'};d.set(rec(`nation:${n.id}`),next);return {nation:next};}
  const war=launchIndependenceWar(d,e,n,s.minute,src),next={...n,status:'独立待定',reaction:war?'宣战':'待集结',war:war?.id??null};d.set(rec(`nation:${n.id}`),next);return {nation:next};
 }
 if(args.choice==='tax'){
  if(!['commercial','customs'].includes(args.action)||!Number.isSafeInteger(args.taxBps)||args.taxBps<0||args.taxBps>nobleRules(e).maxTaxBps)throw Error('税制须指定commercial或customs及允许税率');
  const next={...n,taxes:{...n.taxes,[args.action]:args.taxBps}};d.set(rec(`nation:${n.id}`),next);return {nation:next};
 }
 if(args.choice==='law'){
 const code=legalCodeAt(e,n.capital,s),penalty=code.penalties[args.name];if(!penalty)throw Error('只能修改现行法典已登记罪名');
  if(!Number.isSafeInteger(args.coins)||args.coins<0||args.coins>100000||!Number.isSafeInteger(args.minutes)||args.minutes<0||args.minutes>360*DAY)throw Error('刑罚数值无效');
  const next={...n,amendments:{...n.amendments,[args.name]:{...penalty,baseFine:args.coins,detentionMinutes:args.minutes}}};d.set(rec(`nation:${n.id}`),next);publish(d,e,next,'organize',`${src}:law`,s.minute,`${n.name}修订本国法典`);return {law:next.amendments};
 }
 throw Error('未知国家事务');
}
export function advanceNations(d,e,{before,after}){
 const r=nobleRules(e);if(!r||e.replaying&&!e.replayResult?.sovereigntyVersion)return;
 for(const n of nationRows(d.get('state')).filter(n=>liveNation(d.get('state'),n.id))){
  if(n.reaction==='待集结'){const war=launchIndependenceWar(d,e,n,after,`${n.id}:muster`);if(war)d.set(rec(`nation:${n.id}`),{...n,reaction:'宣战',war:war.id});}
  for(let at=n.nextReview;at<=after&&liveNation(d.get('state'),n.id);at+=r.founding.reviewDays*DAY){
   let current=d.get(...rec(`nation:${n.id}`)),s=d.get('state');
   // Existing local receipts move to the national account, never credited a second time.
   for(const sid of domainSettlements(e,s,current.domains).filter(id=>nationAt(e,s,id)?.id===n.id)){
    const all=rows(d.get('state')).filter(t=>t.category==='trade_tax'&&t.settlement===sid&&t.minute<at&&t.minute>=(current.taxThrough??current.foundedAt)),amount=all.reduce((sum,t)=>sum+t.amount,0),available=d.get('state','settlements',sid,'treasury')??0,paid=Math.min(amount,Math.max(0,available-(e.rules.governance.authority.treasury.reserveCopper??0)));
    if(paid){changeGroupCoins(d,e,sid,-paid,{kind:'国税上解',sourceEvent:`${n.id}:${at}:${sid}`,minute:at},{account:treasury(n.id),writer:'nation-founding',eventId:`${n.id}:${at}:${sid}`});changeGroupCoins(d,e,n.id,paid,{kind:'国税入库',sourceEvent:`${n.id}:${at}:${sid}`,minute:at},BOOKED);}
   }
   s=d.get('state');const ready=nationReadiness(e,s,n.ruler),bad=ready.reasons.length;
   current={...current,nextReview:at+r.founding.reviewDays*DAY,taxThrough:at,breaches:bad?current.breaches+1:0,lastReview:{minute:at,reasons:ready.reasons}};
   d.set(rec(`nation:${n.id}`),current);
   if(current.breaches>=r.founding.graceReviews){collapse(d,e,current,'建国失败',current.suzerain,at,`${n.id}:failure:${at}`);break;}
   const rebel=rows(s).find(o=>o.category==='governance_office'&&o.status==='在任'&&o.holder!==n.ruler&&nationAt(e,s,o.settlement)?.id===n.id&&standing(e,s,o.holder,n.ruler)<=r.npc.hostility);
   if(rebel){
    const remaining=current.domains.filter(id=>id!==rebel.settlement);d.set(rec(`territory:${rebel.settlement}`),{category:'territory',county:rebel.settlement,ruler:rebel.holder,previous:n.id,minute:at,sourceEvent:`${n.id}:split:${at}`});
    d.set(rec(`nation:${n.id}`),{...current,domains:remaining,status:'内乱',splits:[...current.splits??[],{settlement:rebel.settlement,ruler:rebel.holder,minute:at}]});publish(d,e,current,'transfer',`${n.id}:split:${at}`,at,'下辖主官带领辖区分裂');
   }
  }
 }
 if(Math.floor(before/(30*DAY))===Math.floor(after/(30*DAY)))return;
 for(const t of nobleLords(e,d.get('state'))){
  if(t.holder==='player'||rulerNation(d.get('state'),t.holder))continue;
  const s=d.get('state'),npc=s.npcs?.[t.holder],base=e.byId.get(t.holder),ambition=npc?.ambition??base?.ambition??(/野心|独立|自立/.test(JSON.stringify(base?.goals??base?.personality??''))?r.npc.ambition:0),sup=suzerain(e,s,t.domains?.[0]??t.fief);
  if(!npc||npc.status==='死亡'||ambition<r.npc.ambition||standing(e,s,t.holder,sup)>r.npc.hostility)continue;
  // NPC diplomacy is also recorded, and only willing external allies recognize it.
  for(const f of e.world.factions??[])if(external(e,s,f.id,t.holder)&&standing(e,s,f.id,t.holder)>=r.founding.standing&&s.records?.[`diplomacy:${pair(f.id,t.holder)}`]?.status==='结盟'&&!activeWar(s,f.id,t.holder))d.set(rec(`recognition:${t.holder}:${f.id}`),{category:'diplomacy',status:'承认独立',subject:t.holder,recognizer:f.id,parties:[f.id,t.holder],minute:after,sourceEvent:`npc-independence:${after}:${t.holder}`});
  const ready=nationReadiness(e,d.get('state'),t.holder);if(!ready.ready)continue;
  const capital=domainSettlements(e,s,ready.domains)[0];if(capital&&legalCodeAt(e,capital,s))foundNation(d,e,{who:t.holder,name:`${base?.name??t.holder}领国`,capital},`npc_${t.holder}_${after}`,after);
 }
}
