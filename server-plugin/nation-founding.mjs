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
import {declareHoldingWriter,aliveHoldings,ensureHoldings,templatesOf,holdingsActive} from './holdings.mjs';
import {syncHoldings,syncHoldingRecord,holdingSet,orgLeaderOffice} from './holding-sources.mjs';
import {changeHolding,changeLegacyHoldings} from './transition.mjs';
import {isEffective} from './lifecycle-state.mjs';
import {householdMembers,npcHousehold} from './npc-state.mjs';
declareHoldingWriter('nation-founding',{kinds:['member_of','holds_office','fief','governs','controls','allied_with'],entities:['office']});
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
 const key=`recognition:${who}:${b}`,row={category:'diplomacy',status:'承认独立',parties:[party,b],subject:who,recognizer:b,minute:s.minute,sourceEvent:src};holdingSet(d,e,rec(key),row,'nation-founding');
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
 holdingSet(d,e,rec(`organization:${id}`),{category:'organization',id,source:'created',kind:'王国',name:name.trim(),seat:capital,leader:who,founder:who,foundedAt:at,members:{[who]:{position:'国王',joinedAt:at,arrears:0}},removed:{},charter:{mode:'leader',approval:true,fee:0,dues:0,rules:['独立国库与本国法典']},treasury:0,ledger:[]},'nation-founding');syncHoldings(d,e,'org',id,{writer:'nation-founding',eventId:src});
 let n={category:'nation',id,name:name.trim(),ruler:who,capital,domains:ready.domains,suzerain:originalSuzerain,status:'独立待定',foundedAt:at,lawSource:baseLaw.id,amendments:{},taxes:{},nextReview:at+nobleRules(e).founding.reviewDays*DAY,breaches:0,sourceEvent:src};
 holdingSet(d,e,rec(`nation:${id}`),n,'nation-founding');changeGroupCoins(d,e,id,amount,{kind:'建国入库',sourceEvent:src,minute:at},BOOKED);
 for(const a of armies(d.get('state')).filter(a=>a.party===who))holdingSet(d,e,rec(armyKey(a.id)),{...a,party:id,partyName:n.name},'nation-founding');
 for(const domain of n.domains)holdingSet(d,e,rec(`territory:${domain}`),{category:'territory',county:domain,ruler:id,previous:n.suzerain,minute:at,sourceEvent:src},'nation-founding');
 for(const t of rows(s).filter(t=>t.category==='territory'&&t.ruler===who&&n.domains.some(domain=>containsDomain(e,s,domain,t.county))))changeTerritoryControl(d,e,t.county,id,{at,src:`${src}:incorporate:${t.county}`});
 for(const recognizer of ready.recognized){const value=standing(e,s,recognizer,who);adjustStanding(d,e,recognizer,id,value,{sourceEvent:src,reason:'独立承认',minute:at});}
 n=react(d,e,n,at,src);holdingSet(d,e,rec(`nation:${id}`),n,'nation-founding');
 const title=s.records?.[`title:${who}`];if(title)holdingSet(d,e,rec(`title:${who}`),{...title,status:'独立',title:'国王',rank:'唯一',formerTitle:title.title,independentNation:id},'nation-founding');
 publish(d,e,n,'organize',`${src}:founded`,at,`${n.name}宣布独立，原宗主${n.reaction}`);return n;
}
export function changeTerritoryControl(d,e,domain,ruler,{at=d.get('state','minute'),src,war=null}={}){
 ensureHoldings(d,e);
 const old=d.get(...rec(`territory:${domain}`));if(old?.ruler===ruler&&old.sourceEvent===src)return old;
 if(!holdingsActive(d)){const row={category:'territory',county:domain,ruler,previous:old?.ruler??null,minute:at,sourceEvent:src,...(war?{war}:{})};d.set(rec(`territory:${domain}`),row);return row;}
 const collective=templatesOf(d,ruler,e).includes('collective'),current=aliveHoldings(d,{subject:domain}).filter(h=>h.kind==='controls');
 for(const h of current)if(h.holder!==ruler)changeHolding(d,e,{op:'close',id:h.id,eventId:`${src}:${h.id}`,reason:'transferred'});
 if(!collective&&!aliveHoldings(d,{subject:domain,holder:ruler,kind:'controls'}).length)changeHolding(d,e,{op:'open',kind:'controls',holder:ruler,subject:domain,source:`sovereignty:${domain}`,eventId:`${src}:control:${domain}`});
 if(collective){
  for(const h of aliveHoldings(d,{kind:'governs',subject:domain}))if(h.holder!==ruler)changeHolding(d,e,{op:'transfer',id:h.id,holder:ruler,eventId:`${src}:${h.id}`});
  if(!aliveHoldings(d,{kind:'governs',subject:domain,holder:ruler}).length)changeHolding(d,e,{op:'open',kind:'governs',holder:ruler,subject:domain,source:`sovereignty:${domain}`,eventId:`${src}:sovereign:${domain}`});
 }
 const sovereign=collective?ruler:old?.sovereign??old?.ruler??null;
 const row={category:'territory',county:domain,ruler,sovereign,previous:old?.ruler??null,minute:at,sourceEvent:src,...(war?{war}:{})};
 // Both canonical edges have already gone through the protocol. K1's shared
 // sovereignty adapter must project sovereign separately from actual ruler.
 d.set(rec(`territory:${domain}`),row);return row;
}
// An explicit act, not a hostile attitude, ends allegiance. A garrison must
// actually obey the defector before the territory compatibility view changes.
export function defectFromNation(d,e,{nation,member},src){
 const s=d.get('state'),n=liveNation(s,nation),key=`nation_defection:${nation}:${member}`;
 if(s.records?.[key])return {...s.records[key],duplicate:true};
 if(!n||member===n.ruler||!isEffective(e,d,member))throw Error('叛离者或原国家不成立');
 const org=s.records?.[`organization:${nation}`];if(!org?.members?.[member])throw Error('叛离者不在原国家名册');
 ensureHoldings(d,e);
 const units=armies(s).filter(a=>a.party===nation&&s.records?.[`organization:${a.id}`]?.leader===member&&armyStrength(a)>0);
 const titles=titlesOf(s,member).filter(highTitle),domains=[...new Set([...titles.flatMap(t=>t.domains??[t.fief]),...rows(s).filter(o=>o.category==='governance_office'&&o.status==='在任'&&o.holder===member).map(o=>o.settlement)])].filter(domain=>n.domains.some(id=>containsDomain(e,s,id,domain))&&units.some(a=>containsDomain(e,s,domain,a.location)));
 const kin=npcHousehold(e,s,member),related=new Set([...Object.keys(org.members),...units.flatMap(a=>Object.keys(s.records?.[`organization:${a.id}`]?.members??{})),...(kin?householdMembers(e,s,kin.id):[]),
  ...rows(s).filter(r=>r.category==='contract'&&r.status==='有效'&&[member,nation,n.ruler].includes(r.owner)).map(r=>r.worker)].filter(Boolean));
 const margin=nobleRules(e).defection?.followMargin;if(!Number.isFinite(margin))throw Error('未登记部下分流规则');
 const decisions=[...related].filter(id=>id!==member&&id!==n.ruler&&isEffective(e,d,id)).sort().map(id=>({id,rebel:standing(e,s,id,member),original:standing(e,s,id,nation)}));
 const followers=decisions.filter(v=>v.rebel-v.original>=margin).map(v=>v.id);
 for(const id of [member,...followers]){
  for(const h of aliveHoldings(d,{kind:'member_of',holder:id,subject:nation}))changeHolding(d,e,{op:'close',id:h.id,reason:'defected',eventId:`${src}:defect:${id}`});
  for(const office of rows(d.get('state')).filter(r=>r.category==='governance_office'&&r.holder===id&&r.status==='在任')){
   holdingSet(d,e,rec(office.id),{...office,status:'已免职',removedAt:s.minute,reason:'叛离原组织'},'nation-founding');
  }
 }
 const remaining=structuredClone(org);for(const id of [member,...followers]){delete remaining.members[id];remaining.removed={...remaining.removed,[id]:{minute:s.minute,reason:'叛离',sourceEvent:src}};}
 holdingSet(d,e,rec(`organization:${nation}`),remaining,'nation-founding');
 const retinueId=`retinue_${member}`,retinue={category:'organization',id:retinueId,source:'created',kind:'随从',name:'叛离随从',seat:s.npcs?.[member]?.location??n.capital,leader:null,founder:member,foundedAt:s.minute,members:{},removed:{},treasury:0,ledger:[],charter:{mode:'leader',approval:true,fee:0,dues:0,rules:['成员按本人立场决定归属']}};
 holdingSet(d,e,rec(`organization:${retinueId}`),retinue,'nation-founding');
 for(const id of [member,...followers]){
  if(holdingsActive(d))changeHolding(d,e,{op:'open',kind:'member_of',holder:id,subject:retinueId,terms:{rank:{position:id===member?'首领':'成员',joinedAt:s.minute,arrears:0}},source:`org:${retinueId}`,eventId:`${src}:follow:${id}`});
  retinue.members[id]={position:id===member?'首领':'成员',joinedAt:s.minute,arrears:0};
 }
 if(holdingsActive(d))changeHolding(d,e,{op:'open',kind:'holds_office',holder:member,subject:orgLeaderOffice(retinueId),source:`org:${retinueId}`,eventId:`${src}:retinue-leader`});
 retinue.leader=member;holdingSet(d,e,rec(`organization:${retinueId}`),retinue,'nation-founding');
 for(const a of units){
  const armyOrg=structuredClone(d.get(...rec(`organization:${a.id}`)));
  for(const id of Object.keys(armyOrg.members).filter(id=>id!==member&&!followers.includes(id))){
   for(const h of aliveHoldings(d,{kind:'member_of',holder:id,subject:a.id}))changeHolding(d,e,{op:'close',id:h.id,reason:'vacated',eventId:`${src}:remain:${id}`});
   delete armyOrg.members[id];armyOrg.removed={...armyOrg.removed,[id]:{minute:s.minute,reason:'选择留在原国'}};
  }
  if(holdingsActive(d)&&!aliveHoldings(d,{kind:'holds_office',holder:member,subject:orgLeaderOffice(a.id)}).length)changeHolding(d,e,{op:'open',kind:'holds_office',holder:member,subject:orgLeaderOffice(a.id),source:`org:${a.id}`,eventId:`${src}:army-command:${a.id}`});
  holdingSet(d,e,rec(`organization:${a.id}`),armyOrg,'nation-founding');
  holdingSet(d,e,rec(armyKey(a.id)),{...a,party:member,partyName:member,defection:src},'nation-founding');
 }
 for(const domain of domains)changeTerritoryControl(d,e,domain,member,{src:`${src}:${domain}`});
 // A follower leaves national employment only after making their own choice.
 for(const contract of rows(s).filter(r=>r.category==='contract'&&r.status==='有效'&&followers.includes(r.worker)&&[nation,n.ruler].includes(r.owner)))
  changeLegacyHoldings(d,e,{holder:contract.worker,source:`contract:${contract.id}`,kinds:['employed_by'],reason:'defected',eventId:`${src}:${contract.id}`},()=>holdingSet(d,e,rec(contract.id),{...contract,status:'已终止',endedAt:s.minute,reason:'自愿跟随叛离者'},'nation-founding'));
 const row={category:'nation_defection',id:key,nation,member,followers,retinue:retinueId,decisions,domains,minute:s.minute,sourceEvent:src};holdingSet(d,e,rec(key),row,'nation-founding');
 d.set(rec(`nation:${n.id}`),{...n,status:'内乱',splits:[...n.splits??[],{ruler:member,domains,minute:s.minute,sourceEvent:src}]});
 return row;
}
function collapse(d,e,n,status,winner,at,src){
 const next={...n,status,endedAt:at,annexedBy:winner};holdingSet(d,e,rec(`nation:${n.id}`),next,'nation-founding');
 for(const domain of n.domains)changeTerritoryControl(d,e,domain,winner,{at,src});
 const coins=groupAccountView(e,d.get('state'),n.id)?.coins??0;if(coins){changeGroupCoins(d,e,n.id,-coins,{kind:'吞并转出',sourceEvent:src,minute:at},{account:partyAccount(e,d.get('state'),winner),writer:'nation-founding',eventId:src});partyCredit(d,e,winner,coins,{sourceEvent:src,reason:'吞并接收',books:BOOKED});}
 for(const a of armies(d.get('state')).filter(a=>a.party===n.id))holdingSet(d,e,rec(armyKey(a.id)),{...a,party:winner,partyName:winner},'nation-founding');
 for(const o of rows(d.get('state')).filter(o=>o.category==='governance_office'&&o.status==='在任'&&n.domains.some(id=>containsDomain(e,d.get('state'),id,o.settlement))))changeLegacyHoldings(d,e,{holder:o.holder,source:`office:${o.settlement}|${o.office}`,reason:'vacated',eventId:`${src}:${o.id}`},()=>holdingSet(d,e,rec(o.id),{...o,status:'已免职',removedAt:at,reason:status},'nation-founding'));
 const t=d.get('state','records',`title:${n.ruler}`);if(t?.independentNation===n.id)changeLegacyHoldings(d,e,{holder:n.ruler,source:`title:${t.id}`,reason:'vacated',eventId:`${src}:title`},()=>holdingSet(d,e,rec(t.id),{...t,status:'已除爵',strippedAt:at,reason:status},'nation-founding'));
 publish(d,e,next,'transfer',src,at,`${n.name}${status}`);return next;
}
export function settleNationWar(d,e,w,{winner,at,src}){
 for(const n of nationRows(d.get('state')).filter(n=>liveNation(d.get('state'),n.id)&&[w.aggressor,w.defender].includes(n.id))){
  if(w.source==='independence'&&winner&&winner!==n.id)collapse(d,e,n,'被吞并',winner,at,src);
  else if(w.source==='independence'){const next={...n,status:'独立',reaction:winner===n.id?'独立战争获胜':'议和承认'};holdingSet(d,e,rec(`nation:${n.id}`),next,'nation-founding');publish(d,e,next,'pact',`${src}:independent`,at,`${n.name}独立战争结束，保留独立`);}
  else if(winner&&winner!==n.id&&w.territory&&n.domains.includes(w.territory)){
   const next={...n,domains:n.domains.filter(id=>id!==w.territory)};holdingSet(d,e,rec(`nation:${n.id}`),next,'nation-founding');if(!next.domains.length)collapse(d,e,next,'被吞并',winner,at,src);
  }
 }
}
export function nationAction(d,args,src){
 const e=this,s=d.get('state'),n=rulerNation(s,'player');
 if(args.operation==='nation_inspect')return {nation:n,readiness:nationReadiness(e,s),requirements:nobleRules(e)?.founding,recognition:{operation:'diplomacy',choice:'recognize',org:n?.id??'player',member:'外部势力ID'},choices:['found','negotiate','law','tax'],actionScope:{kind:'instant'}};
 if(args.choice==='found')return {nation:foundNation(d,e,{name:args.name,capital:args.settlement??s.location,coins:args.coins},src)};
 if(args.choice==='defect'){
  const member=args.member==='player'?'player':e.resolve(args.member,'npc');
  if(args.consent!==true||member!=='player'&&(!s.player.companions?.includes(member)||s.npcs?.[member]?.location!==s.location||standing(e,s,member,'player')<nobleRules(e).founding.standing))throw Error('须叛离者本人或清醒在场且自愿的同伴作出实际叛离');
  return {defection:defectFromNation(d,e,{nation:args.org,member},src)};
 }
 if(!n)throw Error('尚未建立国家');
 if(args.choice==='negotiate'){
  if(n.status!=='谈判中')throw Error('没有未决宗主谈判');
  if(args.consent===true){const key=`tribute:${pair(n.id,n.suzerain)}`;holdingSet(d,e,rec(key),{category:'tribute',payer:n.id,payee:n.suzerain,amount:n.terms.tribute,arrears:0,nextAt:s.minute+30*DAY,war:n.id,sourceEvent:src},'nation-founding');const next={...n,status:'独立',reaction:'贡赋议和'};holdingSet(d,e,rec(`nation:${n.id}`),next,'nation-founding');return {nation:next};}
  const war=launchIndependenceWar(d,e,n,s.minute,src),next={...n,status:'独立待定',reaction:war?'宣战':'待集结',war:war?.id??null};holdingSet(d,e,rec(`nation:${n.id}`),next,'nation-founding');return {nation:next};
 }
 if(args.choice==='tax'){
  if(!['commercial','customs'].includes(args.action)||!Number.isSafeInteger(args.taxBps)||args.taxBps<0||args.taxBps>nobleRules(e).maxTaxBps)throw Error('税制须指定commercial或customs及允许税率');
  const next={...n,taxes:{...n.taxes,[args.action]:args.taxBps}};holdingSet(d,e,rec(`nation:${n.id}`),next,'nation-founding');return {nation:next};
 }
 if(args.choice==='law'){
 const code=legalCodeAt(e,n.capital,s),penalty=code.penalties[args.name];if(!penalty)throw Error('只能修改现行法典已登记罪名');
  if(!Number.isSafeInteger(args.coins)||args.coins<0||args.coins>100000||!Number.isSafeInteger(args.minutes)||args.minutes<0||args.minutes>360*DAY)throw Error('刑罚数值无效');
  const next={...n,amendments:{...n.amendments,[args.name]:{...penalty,baseFine:args.coins,detentionMinutes:args.minutes}}};holdingSet(d,e,rec(`nation:${n.id}`),next,'nation-founding');publish(d,e,next,'organize',`${src}:law`,s.minute,`${n.name}修订本国法典`);return {law:next.amendments};
 }
 throw Error('未知国家事务');
}
export function advanceNations(d,e,{before,after}){
 const r=nobleRules(e);if(!r||e.replaying&&!e.replayResult?.sovereigntyVersion)return;
 for(const n of nationRows(d.get('state')).filter(n=>liveNation(d.get('state'),n.id))){
  if(n.reaction==='待集结'){const war=launchIndependenceWar(d,e,n,after,`${n.id}:muster`);if(war)holdingSet(d,e,rec(`nation:${n.id}`),{...n,reaction:'宣战',war:war.id},'nation-founding');}
  for(let at=n.nextReview;at<=after&&liveNation(d.get('state'),n.id);at+=r.founding.reviewDays*DAY){
   let current=d.get(...rec(`nation:${n.id}`)),s=d.get('state');
   // Existing local receipts move to the national account, never credited a second time.
   for(const sid of domainSettlements(e,s,current.domains).filter(id=>nationAt(e,s,id)?.id===n.id)){
    const all=rows(d.get('state')).filter(t=>t.category==='trade_tax'&&t.settlement===sid&&t.minute<at&&t.minute>=(current.taxThrough??current.foundedAt)),amount=all.reduce((sum,t)=>sum+t.amount,0),available=d.get('state','settlements',sid,'treasury')??0,paid=Math.min(amount,Math.max(0,available-(e.rules.governance.authority.treasury.reserveCopper??0)));
    if(paid){changeGroupCoins(d,e,sid,-paid,{kind:'国税上解',sourceEvent:`${n.id}:${at}:${sid}`,minute:at},{account:treasury(n.id),writer:'nation-founding',eventId:`${n.id}:${at}:${sid}`});changeGroupCoins(d,e,n.id,paid,{kind:'国税入库',sourceEvent:`${n.id}:${at}:${sid}`,minute:at},BOOKED);}
   }
   s=d.get('state');const ready=nationReadiness(e,s,n.ruler),bad=ready.reasons.length;
   current={...current,nextReview:at+r.founding.reviewDays*DAY,taxThrough:at,breaches:bad?current.breaches+1:0,lastReview:{minute:at,reasons:ready.reasons}};
   holdingSet(d,e,rec(`nation:${n.id}`),current,'nation-founding');
   if(current.breaches>=r.founding.graceReviews){collapse(d,e,current,'建国失败',current.suzerain,at,`${n.id}:failure:${at}`);break;}
  }
 }
 if(Math.floor(before/(30*DAY))===Math.floor(after/(30*DAY)))return;
 for(const t of nobleLords(e,d.get('state'))){
  if(t.holder==='player'||rulerNation(d.get('state'),t.holder))continue;
  const s=d.get('state'),npc=s.npcs?.[t.holder],base=e.byId.get(t.holder),ambition=npc?.ambition??base?.ambition??(/野心|独立|自立/.test(JSON.stringify(base?.goals??base?.personality??''))?r.npc.ambition:0),sup=suzerain(e,s,t.domains?.[0]??t.fief);
  if(!npc||!isEffective(e,d,t.holder)||ambition<r.npc.ambition||standing(e,s,t.holder,sup)>r.npc.hostility)continue;
  // NPC diplomacy is also recorded, and only willing external allies recognize it.
  for(const f of e.world.factions??[])if(external(e,s,f.id,t.holder)&&standing(e,s,f.id,t.holder)>=r.founding.standing&&s.records?.[`diplomacy:${pair(f.id,t.holder)}`]?.status==='结盟'&&!activeWar(s,f.id,t.holder))holdingSet(d,e,rec(`recognition:${t.holder}:${f.id}`),{category:'diplomacy',status:'承认独立',subject:t.holder,recognizer:f.id,parties:[f.id,t.holder],minute:after,sourceEvent:`npc-independence:${after}:${t.holder}`},'nation-founding');
  const ready=nationReadiness(e,d.get('state'),t.holder);if(!ready.ready)continue;
  const capital=domainSettlements(e,s,ready.domains)[0];if(capital&&legalCodeAt(e,capital,s))foundNation(d,e,{who:t.holder,name:`${base?.name??t.holder}领国`,capital},`npc_${t.holder}_${after}`,after);
 }
}
