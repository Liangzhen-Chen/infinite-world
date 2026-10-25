import {preconditionFailure} from './precondition.mjs';
import {groupAccountView,changeGroupCoins} from './group-account.mjs';
// U12a 军队与兵役（指南3.11爵位义务、4.6势力资源、3.13经济）。
// 势力、郡府、村庄和玩家的兵员都记在 army:<id>，每支队伍同时是一个 U1 组织
// （organization:<id>，kind 军团）：名册里是被征的人物和入营的玩家，公库就是饷箱。
// 兵员四类：常备、征召（从各户抽丁，人物按 npc-state 的服役作息去营地，户里少一个劳力，
//   村里可用人手按 levy:<村> 扣减，农事与周贸易都少算这些人）、佣兵（U1 雇佣兵团按月结饷，
//   欠饷即散伙）、私兵（玩家或玩家组织招募，从组织公库或本人钱与钱庄存款付饷）。
// 每周：补给（粮仓提粮走 agriculture 的可售余粮，或用公库买口粮，或就地觅食；冬季觅食减半，
//   冬荒时粮仓不出粮）、操练、士气与逃兵；每月：从公库或贡赋发饷，付不出记欠饷、降士气。
// 玩家在营报到（army_enlist）、执勤与出征（army_duty，抵 T127 爵位兵役日数），也可自募私兵。
// 参数全部在 rules.military；推进按周、按月在日界结算。
import {organization} from './organizations.mjs';
import {householdMembers,npcAgeAt,npcIsMinor,npcMigration,recordMilitaryDeath} from './npc-life.mjs';
import {famineAt} from './hazard-calendar.mjs';
import {adjustStanding,standing,HOSTILE} from './standing.mjs';
import {authorityOf} from './governance.mjs';
import {playerTitle} from './titles.mjs';
import {armySupplyQuote,drawArmyRations} from './settlement-trade.mjs';
import {rosterLifeState} from './population.mjs';
import {clockRoll} from './world-clock.mjs';
import {creditRules} from './credit.mjs';
import {spendFactionAssets,creditFactionAssets} from './faction-clock.mjs';
import {purse,treasury,vault,polityTreasury,transit,source,sink,bookSide,moveCoins,BOOKED,coinRead} from './money.mjs';
import {declareLedgerWriter,balance} from './ledger.mjs';
import {armyRations,moveStock} from './stock.mjs';
import {declareHoldingWriter,holdingRemove} from './holdings.mjs';
import {syncHoldings,holdingSet} from './holding-sources.mjs';
import {changeHolding} from './transition.mjs';
import {aliveHoldings} from './holdings.mjs';
import {isEffective,isPhysicallyDead} from './lifecycle-state.mjs';
declareHoldingWriter('military',{kinds:['member_of','holds_office','fief','employed_by','resides','devotee_of'],entities:['office']});
// S1b 军粮：粮仓提粮由 agriculture.drawGranary 记入 army:<id>|item_oats|ration；买口粮来自模拟范围外（src:import），
// 就地觅食来自 src:regrowth，吃掉的进 sink:consume。
declareLedgerWriter('military',{sources:{'src:import':{coin_river:1000000,item_oats:1000000},'src:regrowth':{item_oats:1000000}},sinks:['sink:export','sink:consume']});

const DAY=1440,clone=v=>structuredClone(v);
export const ARMY_SUPPLY=Object.freeze(['granary','purchase','forage']);
const rules=engine=>engine.rules?.military??null;
export const armyKey=id=>`army:${id}`;
const rec=id=>['state','records',id];
const int=(v,min,max=1e9)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const text=v=>typeof v==='string'&&v.trim()&&v.length<=200;
function within(engine,location,place){const seen=new Set();while(location&&!seen.has(location)){if(location===place)return true;seen.add(location);location=engine.byId.get(location)?.parent;}return false;}
const nameOf=(engine,id)=>engine.byId.get(id)?.name??id;

// ---- 校验 ------------------------------------------------------------------------
export function validateMilitary(world){
 const m=world.rules?.military,errors=[];if(!m)return errors;
 const fail=s=>errors.push(`军务：${s}`);
 const locations=new Set(world.locations.map(l=>l.id)),factions=new Set((world.factions??[]).map(f=>f.id)),counties=new Set((world.regions??[]).filter(r=>r.category==='county').map(r=>r.id));
 if(m.version!==1||m.weekDays!==7||m.monthDays!==30)fail('版本须为1，按周（7日）与月（30日）结算');
 const l=m.levy??{};if(!int(l.minAge,18,30)||!int(l.maxAge,l.minAge+1,70)||l.perHousehold!==1||!int(l.maxShareBps,1,5000)||!int(-l.familyStanding,0,20))fail('征召年龄、每户人数或最大比例无效');
 const s=m.soldier??{};if(!int(s.rationPerDay,1,5)||!int(s.trainingPerWeek,0,20)||!int(s.trainingCap,10,100)||!int(s.moraleBase,10,90))fail('兵员口粮、操练或士气基准无效');
 const mo=m.morale??{};if(['paid','recover'].some(k=>!int(mo[k],0,20))||['unpaid','hungry','famine'].some(k=>!(Number.isSafeInteger(mo[k])&&mo[k]<0&&mo[k]>=-40)))fail('士气变化参数无效');
 if(!int(m.desertion?.below,1,60)||!int(m.desertion?.bps,1,5000))fail('逃兵参数无效');
 if(!int(m.supply?.targetDays,7,120)||!int(m.supply?.winterForageBps,0,10000)||!(m.supply?.winterPriceFactor>=1&&m.supply.winterPriceFactor<=3))fail('补给参数无效');
 if(!int(m.service?.dutyCopperPerDay,0,500)||!int(m.service?.trainingPerDutyDay,0,10))fail('执勤参数无效');
 const r=m.recruit??{};if(!int(r.signOnCopper,0,5000)||!int(r.payCopperMonth,0,5000)||!int(r.perCall,1,50)||!int(r.maxPrivate,1,500)||!Array.isArray(r.places)||!r.places.length||r.places.some(p=>!locations.has(p)))fail('募兵参数或地点无效');
 for(const p of m.polities??[]){if(!counties.has(p.id)||!locations.has(p.seat)||!int(p.treasuryCopper,0)||!int(p.incomeCopperMonth,0,1e6)||!text(p.leaderTitle))fail(`郡府${p.id}未登记或缺公库、月入、驻地与主事称谓`);}
 for(const c of m.mercenaries??[])if(!factions.has(c.org)||!locations.has(c.location)||!int(c.soldiers,1,1000)||!int(c.payCopperMonth,1,5000)||!int(c.training,0,100))fail(`佣兵团${c.org}参数无效`);
 const ids=new Set();
 for(const a of m.armies??[]){
  if(typeof a.id!=='string'||!/^army_[a-z0-9_]{1,40}$/.test(a.id)||ids.has(a.id)){fail(`队伍${a.id}编号无效或重复`);continue;}ids.add(a.id);
  errors.push(...armyErrors(world,a).map(e=>`军务：${e}`));
 }
 return errors;
}
// 单支队伍的引用；运行时引用缺失（裁剪过的世界）的队伍不开营，正式数据由 validate-world 拦下。
function armyErrors(world,a){
 const m=world.rules.military,errors=[],label=`队伍${a.id}`,locations=new Set(world.locations.map(l=>l.id));
 const factions=new Set((world.factions??[]).map(f=>f.id)),polities=new Set((m.polities??[]).map(p=>p.id)),ledgers=new Set((world.rules.agriculture?.settlements??[]).map(p=>p.settlement));
 if(!text(a.name)||!locations.has(a.location)||!locations.has(a.base))errors.push(`${label}名称、驻地或补给地无效`);
 if(!(factions.has(a.party)||polities.has(a.party)||ledgers.has(a.party)))errors.push(`${label}所属须为已登记势力、郡府或有钱粮账的村`);
 if(!ARMY_SUPPLY.includes(a.supply)||a.supply==='granary'&&!ledgers.has(a.base))errors.push(`${label}补给方式无效`);
 if(!int(a.regular,0,10000)||!int(a.training,0,100)||!int(a.morale,0,100)||!int(a.payCopperMonth,0,5000))errors.push(`${label}兵员、操练、士气或军饷无效`);
 if(a.levy!==undefined&&(!Array.isArray(a.levy)||a.levy.some(x=>!ledgers.has(x))))errors.push(`${label}征召村须有钱粮账`);
 if(a.mercenary!==undefined&&!(m.mercenaries??[]).some(c=>c.org===a.mercenary.org&&int(a.mercenary.count,1,c.soldiers)))errors.push(`${label}佣兵合同无效`);
 return errors;
}
const checked=new WeakMap();
export function assertMilitary(engine){
 const m=rules(engine);if(!m||checked.has(m))return checked.get(m);
 const world={...engine.world,rules:engine.rules},errors=validateMilitary({...world,rules:{...engine.rules,military:{...m,armies:[]}}});if(errors.length)throw Error(errors[0]);
 const usable=new Set((m.armies??[]).filter(a=>!armyErrors(world,a).length).map(a=>a.id));checked.set(m,usable);return usable;
}

// ---- 所属方的钱：势力公库、郡府公库、村公账、组织公库、玩家 ------------------------------
export function partyKind(engine,state,id){
 if(id==='player')return 'player';
 if(state.npcs?.[id])return 'npc';
 if(String(id).startsWith('faction_')&&engine.world.factions?.some(f=>f.id===id))return 'faction';
 if(String(id).startsWith('county_'))return 'polity';
 if(state.settlements?.[id])return 'settlement';
 if(state.records?.[`organization:${id}`])return 'organization';
 return null;
}
export function partyName(engine,state,id){
 if(id==='player')return state.player?.name??'你';
 return state.records?.[`organization:${id}`]?.name??nameOf(engine,id);
}
const polityRule=(engine,id)=>(rules(engine)?.polities??[]).find(p=>p.id===id)??null;
function polityRow(d,engine,id){
 return clone(d.get(...rec(`polity:${id}`))??{category:'polity_treasury',id,coins:polityRule(engine,id)?.treasuryCopper??0,ledger:[]});
}
const reserveOf=engine=>authorityOf(engine)?.treasury?.reserveCopper??0;
function playerBanks(engine,state){return (creditRules(engine)?.banks??[]).map(b=>state.records?.[b.id]).filter(r=>r?.category==='bank'&&(r.accounts?.player??0)>0);}
// books（草稿或文档）给出时，现钱读账本账户（S1c 价格输入，供补给报价用）；没有时读旧字段。
export function partyCoins(engine,state,id,books=null){
 const cash=(account,legacy)=>coinRead(books,{point:'army.cash',account,legacy});
 switch(partyKind(engine,state,id)){
 case 'npc':return Math.max(0,cash(purse(engine,id),()=>state.npcs[id].coins??0));
 case 'player':return cash(purse(engine,'player'),()=>state.player?.coins??0)+(creditRules(engine)?.banks??[]).reduce((n,b)=>{
  const r=state.records?.[b.id];return r?.category==='bank'&&(r.accounts?.player??0)>0?n+Math.min(r.accounts.player,cash(vault(b.id),()=>r.coins)):n;},0);
 case 'faction':return cash(treasury(id),()=>organization(engine,state,id)?.treasury??0);
 case 'polity':return cash(polityTreasury(id),()=>state.records?.[`polity:${id}`]?.coins??polityRule(engine,id)?.treasuryCopper??0);
 case 'settlement':return Math.max(0,cash(treasury(id),()=>state.settlements[id].treasury??0)-reserveOf(engine));
 case 'organization':return Math.max(0,cash(treasury(id),()=>organization(engine,state,id)?.treasury??0));
 default:return 0;
 }
}
// 付出至多 coins（partial 时付得起多少付多少），返回实付；每笔留来源事件。
// S1a: 每个所属方的账本账户（与 partyCoins 的取数一致）。
export function partyAccount(engine,state,id){
 switch(partyKind(engine,state,id)){
 case 'npc':case 'player':return purse(engine,id);
 case 'polity':return polityTreasury(id);
 case 'faction':case 'settlement':case 'organization':return treasury(id);
 default:return null;
 }
}
// 付出至多 coins（partial 时付得起多少付多少），返回实付；每笔留来源事件。
// S1a: books = 账本对方账户（收款方或汇），成对的 partyCredit 传 BOOKED。
export function partyPay(d,engine,id,coins,{sourceEvent,reason,partial=true,books}){
 const state=d.get('state'),have=partyCoins(engine,state,id),amount=Math.min(coins,have);
 if(amount<=0||!partial&&amount<coins)return 0;
 const minute=state.minute;
 switch(partyKind(engine,state,id)){
 case 'npc':bookSide(d,purse(engine,id),-amount,books);holdingSet(d,null,['state','npcs',id,'coins'],have-amount,'military');break;
 case 'player':{
  let left=amount;const cash=Math.min(left,state.player.coins);bookSide(d,purse(engine,'player'),-cash,books);d.set(['state','player','coins'],state.player.coins-cash);left-=cash;
  // U2：本人现钱不够时由钱庄存款代付。
  for(const b of playerBanks(engine,state)){if(!left)break;const row=clone(b),take=Math.min(left,row.accounts.player,row.coins);bookSide(d,vault(b.id),-take,books);row.accounts.player-=take;row.coins-=take;left-=take;holdingSet(d,null,rec(b.id),row,'military');}
  break;}
 case 'faction':if(!spendFactionAssets(d,engine,id,{coins:amount},{sourceEvent,minute,kind:'military'},books))return 0;break;
 case 'polity':{const row=polityRow(d,engine,id);bookSide(d,polityTreasury(id),-amount,books);row.coins-=amount;row.ledger=[...row.ledger,{amount:-amount,reason,sourceEvent,minute}].slice(-40);holdingSet(d,null,rec(`polity:${id}`),row,'military');break;}
 case 'settlement':bookSide(d,treasury(id),-amount,books);d.set(['state','settlements',id,'treasury'],state.settlements[id].treasury-amount);break;
 case 'organization':{
  if(groupAccountView(engine,state,id)){changeGroupCoins(d,engine,id,-amount,{sourceEvent,reason,minute},books);break;}
  const row=clone(d.get(...rec(`organization:${id}`))),org=organization(engine,state,id);bookSide(d,treasury(id),-amount,books);row.treasury-=amount;
  row.ledger=[...row.ledger??[],{kind:'军需',amount:-amount,party:null,minute,sourceEvent,reason,balance:org.treasury-amount}];holdingSet(d,null,rec(`organization:${id}`),row,'military');break;}
 default:return 0;
 }
 return amount;
}
export function partyCredit(d,engine,id,coins,{sourceEvent,reason,books}){
 if(coins<=0)return;
 const state=d.get('state'),minute=state.minute;
 switch(partyKind(engine,state,id)){
 case 'npc':bookSide(d,purse(engine,id),coins,books);holdingSet(d,null,['state','npcs',id,'coins'],(state.npcs[id].coins??0)+coins,'military');break;
 case 'player':bookSide(d,purse(engine,'player'),coins,books);d.set(['state','player','coins'],state.player.coins+coins);break;
 case 'faction':creditFactionAssets(d,engine,id,{coins},{sourceEvent,minute,kind:'military'},books);break;
 case 'polity':{const row=polityRow(d,engine,id);bookSide(d,polityTreasury(id),coins,books);row.coins+=coins;row.ledger=[...row.ledger,{amount:coins,reason,sourceEvent,minute}].slice(-40);holdingSet(d,null,rec(`polity:${id}`),row,'military');break;}
 case 'settlement':bookSide(d,treasury(id),coins,books);d.set(['state','settlements',id,'treasury'],state.settlements[id].treasury+coins);break;
 case 'organization':{
  if(groupAccountView(engine,state,id)){changeGroupCoins(d,engine,id,coins,{sourceEvent,reason,minute},books);break;}
  const row=clone(d.get(...rec(`organization:${id}`))),org=organization(engine,state,id);bookSide(d,treasury(id),coins,books);row.treasury+=coins;
  row.ledger=[...row.ledger??[],{kind:'进项',amount:coins,party:null,minute,sourceEvent,reason,balance:org.treasury+coins}];holdingSet(d,null,rec(`organization:${id}`),row,'military');break;}
 }
}

// ---- 队伍 ---------------------------------------------------------------------------
export const armyStrength=a=>a?a.regular+a.levy.count+(a.mercenary?.count??0)+a.private:0;
export function armies(state){return Object.values(state.records??{}).filter(r=>r.category==='army').sort((a,b)=>a.id.localeCompare(b.id));}
export function leviedWorkers(state,sid){return state.records?.[`levy:${sid}`]?.count??0;}
function saveArmy(d,a){holdingSet(d,null,rec(armyKey(a.id)),a,'military');}
function log(a,row){a.ledger=[...a.ledger,row].slice(-30);}
// 每支队伍同时是一个 U1 组织：名册、首领与饷箱。
function armyOrg(d,engine,a,{leader=null,minute}){
 const key=`organization:${a.id}`;if(d.get(...rec(key)))return;
 holdingSet(d,null,rec(key),{category:'organization',id:a.id,source:'created',name:a.name,kind:'军团',seat:a.base,founder:null,foundedAt:minute,leader,
  members:leader?{[leader]:{position:'统领',joinedAt:minute,arrears:0}}:{},removed:{},charter:{mode:'leader',approval:false,fee:0,dues:0,rules:[`隶属${a.partyName}`]},treasury:0,ledger:[],army:a.id},'military');
 syncHoldings(d,engine,'org',a.id,{writer:'military'});
}
export function createArmy(d,engine,spec,minute,sourceEvent){
 const key=armyKey(spec.id);if(d.get(...rec(key)))return d.get(...rec(key));
 const m=rules(engine),state=d.get('state');
 const a={category:'army',id:spec.id,name:spec.name,party:spec.party,partyName:partyName(engine,state,spec.party),base:spec.base,home:spec.location,location:spec.location,
  supply:spec.supply,status:'驻守',regular:spec.regular??0,levy:{count:0,people:[],from:{}},mercenary:null,private:spec.private??0,
  training:spec.training,morale:spec.morale,food:0,arrears:0,payCopperMonth:spec.payCopperMonth,post:Boolean(spec.post),levySettlements:[...spec.levy??[]],
  hungry:false,war:null,createdAt:minute,sourceEvent,history:[],ledger:[]};
 if(spec.mercenary){const c=m.mercenaries.find(c=>c.org===spec.mercenary.org);a.mercenary={org:c.org,count:spec.mercenary.count,payCopperMonth:c.payCopperMonth};}
 armyOrg(d,engine,a,{leader:spec.leader??null,minute});saveArmy(d,a);return a;
}
export function ensureArmies(d,engine,minute){
 const m=rules(engine);if(!m)return;const usable=assertMilitary(engine);
 for(const spec of m.armies??[])if(usable.has(spec.id)&&!d.get(...rec(armyKey(spec.id))))createArmy(d,engine,spec,minute,`military:init:${spec.id}`);
}
const armyOf=(d,id)=>{const a=d.get(...rec(armyKey(id)));return a?clone(a):null;};

// ---- 征召：每户抽丁，人物去营地服役，村里可用劳力扣减 ------------------------------------
// 户里的成年人：已在战役中的人物看其状态；尚未展开的户籍名册成员只看年龄。
function eligible(engine,state,id,m,minute){
 const n=state.npcs?.[id];if(n&&(!isEffective(engine,state,id)||['濒死','昏迷','患病'].includes(n.status)||n.levy||npcMigration(state,id)))return false;
 if(state.player?.companions?.includes(id)||npcIsMinor(engine,state,id,minute))return false;
 const age=npcAgeAt(engine,state,id,minute);return Number.isFinite(age)&&age>=m.levy.minAge&&age<=m.levy.maxAge;
}
export function raiseLevy(d,engine,a,at,sourceEvent){
 const m=rules(engine);let total=0;
 for(const sid of a.levySettlements){
  const state=d.get('state'),s=state.settlements?.[sid];if(!s)continue;
  const key=`levy:${sid}`,prior=clone(state.records?.[key]??{category:'levy',settlement:sid,count:0,people:[],households:{},armies:{},history:[]});
  if(prior.armies[a.id])continue;
  const houses=(engine.world.households??[]).filter(h=>h.settlement===sid).sort((x,y)=>x.id.localeCompare(y.id));
  const quota=Math.min(houses.length*m.levy.perHousehold,Math.floor(s.population*m.levy.maxShareBps/10000));
  let count=0;const people=[];
  for(const h of houses){
   if(count>=quota)break;if(prior.households[h.id])continue;
   const members=householdMembers(engine,state,h.id),adults=members.filter(x=>!isPhysicallyDead(engine,state,x)&&!npcIsMinor(engine,state,x,at));
   // 抽真实户籍中最年轻的适龄者，并为名册居民展开服役状态；独身户留一名成年人。
   const youngest=adults.length>=2?adults.filter(x=>eligible(engine,state,x,m,at)).sort((x,y)=>(npcAgeAt(engine,state,x,at)-npcAgeAt(engine,state,y,at))||x.localeCompare(y))[0]:null;
   if(!youngest)continue;
   const pick=youngest;
   if(!state.npcs?.[pick]){const row=rosterLifeState(engine,d.get('state'),pick,at,'征召服役');if(!row)continue;holdingSet(d,null,['state','npcs',pick],row,'military');}
   prior.households[h.id]=pick;count++;
   if(pick){
    people.push(pick);holdingSet(d,null,['state','npcs',pick,'levy'],{army:a.id,location:a.location,since:at,settlement:sid,household:h.id},'military');
    for(const kin of members)if(kin!==pick&&isEffective(engine,state,kin))adjustStanding(d,engine,kin,a.party,m.levy.familyStanding,{sourceEvent:`${sourceEvent}:levy:${pick}`,reason:`家里的${nameOf(engine,pick)}被征去${a.name}`,minute:at});
   }
  }
  if(!count)continue;
  prior.count+=count;prior.people=[...prior.people,...people];prior.armies[a.id]={count,people,since:at};prior.history=[...prior.history,{army:a.id,count,minute:at,sourceEvent}].slice(-20);
  holdingSet(d,null,rec(key),prior,'military');
  a.levy.count+=count;a.levy.from[sid]=(a.levy.from[sid]??0)+count;a.levy.people=[...a.levy.people,...people.map(id=>({id,settlement:sid}))];
  const org=clone(d.get(...rec(`organization:${a.id}`)));for(const id of people)org.members[id]={position:'征丁',joinedAt:at,arrears:0};holdingSet(d,null,rec(`organization:${a.id}`),org,'military');syncHoldings(d,engine,'org',a.id,{writer:'military',eventId:sourceEvent});
  const ev=`${sourceEvent}:levy:${sid}`;
  holdingSet(d,null,rec(`world_event:${ev}`),{category:'world_event',id:ev,minute:at,location:sid,witnesses:people,tool:'advance',verb:'organize',actor:a.party,target:sid,tags:['army','levy'],count,army:a.id,sourceEvent},'military');
  total+=count;
 }
 return total;
}
// 放回征丁：先放未登记的子弟，再放人物（逆序）；killed 时未登记者从村人口中除去。
export function releaseLevy(d,engine,a,n,{at,reason,killed=false,person=null}){
 let left=Math.min(n,a.levy.count);const released=[];
 for(const sid of Object.keys(a.levy.from).sort()){
  if(!left)break;
  const key=`levy:${sid}`,row=clone(d.get(...rec(key)));if(!row)continue;
  const named=a.levy.people.filter(p=>p.settlement===sid),unnamed=a.levy.from[sid]-named.length;
  let take=Math.min(left,a.levy.from[sid]),fromUnnamed=Math.min(take,unnamed),fromNamed=take-fromUnnamed;
  if(person&&named.some(p=>p.id===person)){fromUnnamed=0;fromNamed=take;}
  const freed=person&&named.some(p=>p.id===person)?[person]:named.slice(named.length-fromNamed).map(p=>p.id);
  for(const id of freed){
   if(!killed)for(const h of aliveHoldings(d,{kind:'member_of',holder:id,subject:a.id}))changeHolding(d,engine,{op:'close',id:h.id,reason:'vacated',eventId:`army-release:${a.id}:${id}:${at}`});
   d.remove(['state','npcs',id,'levy']);if(killed)recordMilitaryDeath(d,engine,id,at);released.push(id);
  }
  a.levy.people=a.levy.people.filter(p=>!freed.includes(p.id));a.levy.from[sid]-=take;a.levy.count-=take;left-=take;
  row.count-=take;row.people=row.people.filter(id=>!freed.includes(id));
  const mine=row.armies[a.id];if(mine){mine.count-=take;mine.people=mine.people.filter(id=>!freed.includes(id));}
  if(!a.levy.from[sid]){delete a.levy.from[sid];delete row.armies[a.id];for(const [h,v]of Object.entries(row.households))if(!Object.keys(row.armies).length||freed.includes(v))delete row.households[h];}
  row.history=[...row.history,{army:a.id,released:take,killed,minute:at,reason}].slice(-20);
  if(row.count>0||Object.keys(row.armies).length)holdingSet(d,null,rec(key),row,'military');else holdingRemove(d,null,rec(key),'military');
  if(killed&&fromUnnamed){const s=d.get('state','settlements',sid);if(s)d.set(['state','settlements',sid,'population'],Math.max(0,s.population-fromUnnamed));}
 }
 const org=d.get(...rec(`organization:${a.id}`));if(org&&released.length){const row=clone(org);for(const id of released){delete row.members[id];row.removed={...row.removed,[id]:{minute:at,reason}};}holdingSet(d,null,rec(`organization:${a.id}`),row,'military');syncHoldings(d,engine,'org',a.id,{writer:'military'});}
 return released;
}
// 伤亡与逃散：常备、私兵、征丁、佣兵按人数比例分担。
export function loseSoldiers(d,engine,a,n,{at,reason,killed=false}){
 const strength=armyStrength(a),total=Math.min(n,strength);if(!total)return 0;
 const order=['levy','private','regular','mercenary'],have={levy:a.levy.count,private:a.private,regular:a.regular,mercenary:a.mercenary?.count??0};
 const take=Object.fromEntries(order.map(k=>[k,Math.floor(total*have[k]/strength)]));
 let left=total-order.reduce((s,k)=>s+take[k],0);
 for(const k of order){const extra=Math.min(left,have[k]-take[k]);take[k]+=extra;left-=extra;}
 if(take.levy)releaseLevy(d,engine,a,take.levy,{at,reason,killed});
 if(take.mercenary){a.mercenary.count-=take.mercenary;if(!a.mercenary.count)a.mercenary=null;}
 a.private-=take.private;a.regular-=take.regular;
 return total;
}

// ---- 每周：补给、操练、士气、逃兵 ------------------------------------------------------
const oatsPrice=engine=>engine.byId.get(engine.rules.agriculture?.grainItem??'item_oats')?.basePrice??3;
function supplyWeek(d,engine,a,at,src,blocked){
 const m=rules(engine),state=d.get('state'),season=engine.calendar(at).season,famine=Boolean(famineAt(state,a.base,at));
 const eaters=armyStrength(a),daily=eaters*m.soldier.rationPerDay,need=daily*7;
 const want=Math.max(0,daily*m.supply.targetDays-a.food);let got=0,paid=0;
 if(want&&!blocked){
  if(a.supply==='granary'&&!famine){
   const quote=armySupplyQuote(d,engine,a.base,a.location,at);
   const price=quote.price;
   const quantity=a.party===a.base?want:Math.min(want,Math.floor(partyCoins(engine,state,a.party,d)/price));
   got=quote.closed?0:drawArmyRations(d,engine,a.base,quantity,{to:{account:armyRations(engine,a.id)},eventId:src});
   if(got&&a.party!==a.base){paid=partyPay(d,engine,a.party,got*price,{sourceEvent:`${src}:grain`,reason:`${a.name}提粮`,books:{account:partyAccount(engine,d.get('state'),a.base),writer:'military',eventId:src}});partyCredit(d,engine,a.base,paid,{sourceEvent:`${src}:grain`,reason:`${a.name}提粮`,books:BOOKED});}
  }else if(a.supply==='purchase'){
   const quote=armySupplyQuote(d,engine,a.base,a.location,at),price=Math.ceil(quote.price*(season===3?m.supply.winterPriceFactor:1)*(famine?2:1)),afford=quote.closed||famine?0:Math.floor(partyCoins(engine,state,a.party,d)/price);
   got=Math.min(want,afford);if(got)paid=partyPay(d,engine,a.party,got*price,{sourceEvent:`${src}:ration`,reason:`${a.name}买口粮`,books:{account:sink('export','army_ration'),writer:'military',eventId:src}});
   if(got)moveStock(d,{from:`src:import|${armyRations(engine,a.id).split('|')[1]}|ration`,to:armyRations(engine,a.id),amount:got,writer:'military',eventId:src});
  }else if(a.supply==='forage'&&!famine){got=Math.floor(want*(season===3?m.supply.winterForageBps:10000)/10000);moveStock(d,{from:`src:regrowth|${armyRations(engine,a.id).split('|')[1]}|forage`,to:armyRations(engine,a.id),amount:got,writer:'military',eventId:src});}
 }
 a.food+=got;const eaten=Math.min(a.food,need);a.food-=eaten;
 moveStock(d,{from:armyRations(engine,a.id),to:`sink:consume|${armyRations(engine,a.id).split('|')[1]}|ration`,amount:eaten,writer:'military',eventId:src});
 return {got,paid,need,eaten,hungry:eaten<need,famine,blocked:Boolean(blocked)};
}
export function armyWeek(d,engine,a,at,src,{blocked=false}={}){
 const m=rules(engine),before=armyStrength(a);if(!before){a.status=a.levySettlements.length?'待征':'溃散';return null;}
 const sup=supplyWeek(d,engine,a,at,src,blocked);a.hungry=sup.hungry;
 if(!sup.hungry&&a.status==='驻守')a.training=Math.min(m.soldier.trainingCap,a.training+m.soldier.trainingPerWeek);
 let delta=0;
 if(sup.hungry)delta+=m.morale.hungry;
 if(sup.famine)delta+=m.morale.famine;
 if(a.arrears>0)delta+=m.morale.unpaid;
 if(!delta)delta=a.morale<m.soldier.moraleBase?m.morale.recover:a.morale>m.soldier.moraleBase?-1:0;
 a.morale=Math.max(0,Math.min(100,a.morale+delta));
 let deserted=0;
 if(a.morale<m.desertion.below){
  deserted=loseSoldiers(d,engine,a,Math.ceil(before*m.desertion.bps/10000),{at,reason:'士气低落逃散'});
  const ev=`${src}:desert`;holdingSet(d,null,rec(`world_event:${ev}`),{category:'world_event',id:ev,minute:at,location:a.location,witnesses:[],tool:'advance',verb:'breach',actor:a.id,target:a.party,tags:['army','desertion'],count:deserted,sourceEvent:src},'military');
 }
 if(!armyStrength(a))a.status='溃散';
 const row={minute:at,strength:armyStrength(a),food:a.food,...sup,training:a.training,morale:a.morale,moraleDelta:delta,deserted,sourceEvent:src};
 a.history=[...a.history,row].slice(-24);return row;
}
// 每月发饷：常备、征丁、私兵按月饷；佣兵按合同付给佣兵团，欠饷即散伙。
export function armyPayday(d,engine,a,at,src){
 const m=rules(engine),paidSoldiers=a.regular+a.levy.count+a.private,owed=paidSoldiers*a.payCopperMonth+a.arrears;
 const chest=transit(armyKey(a.id)),paid=owed?partyPay(d,engine,a.party,owed,{sourceEvent:`${src}:pay`,reason:`${a.name}月饷`,books:{account:chest,writer:'military',eventId:src}}):0;
 a.arrears=owed-paid;
 if(owed){
  a.morale=Math.max(0,Math.min(100,a.morale+(a.arrears?m.morale.unpaid:m.morale.paid)));
  // 被征的人物按人头领到自己那份；其余发给未登记的兵丁。
  const share=paidSoldiers?Math.floor(paid/paidSoldiers):0;
  for(const p of a.levy.people){const n=d.get('state','npcs',p.id);if(n&&share){moveCoins(d,{from:chest,to:purse(engine,p.id),amount:share,writer:'military',eventId:src});holdingSet(d,null,['state','npcs',p.id,'coins'],(n.coins??0)+share,'military');}}
  // 其余饷钱发给未登记的兵丁，离开模拟范围。
  moveCoins(d,{from:chest,to:sink('export','army_pay'),amount:balance(d,chest),writer:'military',eventId:src});
  log(a,{kind:'月饷',owed,paid,arrears:a.arrears,minute:at,sourceEvent:src});
  const org=clone(d.get(...rec(`organization:${a.id}`)));if(org){org.ledger=[...org.ledger??[],{kind:'拨饷',amount:paid,party:a.party,minute:at,sourceEvent:src},{kind:'发饷',amount:-paid,party:null,minute:at,sourceEvent:src}].slice(-40);holdingSet(d,null,rec(`organization:${a.id}`),org,'military');}
 }
 if(a.mercenary){
  const merc=a.mercenary,cost=merc.count*merc.payCopperMonth,got=partyPay(d,engine,a.party,cost,{sourceEvent:`${src}:merc`,reason:`${a.name}佣兵合同`,partial:false,books:{account:partyAccount(engine,d.get('state'),merc.org),writer:'military',eventId:src}});
  if(got){partyCredit(d,engine,merc.org,got,{sourceEvent:`${src}:merc`,reason:`${a.name}佣金`,books:BOOKED});log(a,{kind:'佣金',org:merc.org,paid:got,minute:at,sourceEvent:src});}
  else{
   log(a,{kind:'佣兵散伙',org:merc.org,count:merc.count,minute:at,sourceEvent:src});
   if(partyKind(engine,d.get('state'),a.party))adjustStanding(d,engine,merc.org,a.party==='player'?'player':a.party,-10,{sourceEvent:`${src}:merc`,reason:'欠付佣金',minute:at});
   const ev=`${src}:merc_breach`;holdingSet(d,null,rec(`world_event:${ev}`),{category:'world_event',id:ev,minute:at,location:a.location,witnesses:[],tool:'advance',verb:'breach',actor:a.party,target:merc.org,tags:['army','mercenary'],value:cost,sourceEvent:src},'military');
   a.mercenary=null;
  }
 }
 if(!armyStrength(a))a.status='溃散';
 return {owed,paid,arrears:a.arrears};
}

// ---- 推进 ---------------------------------------------------------------------------
export function advanceMilitary(d,engine,{before,after}){
 const m=rules(engine);if(!m)return;
 assertMilitary(engine);
 for(let day=Math.floor(before/DAY)+1;day*DAY<=after;day++){
  const at=day*DAY,week=day%m.weekDays===0,month=day%m.monthDays===0;if(!week&&!month)continue;
  if(week)ensureArmies(d,engine,at);
  // 郡府每月的税入进郡府公库（贡赋另由战事结算记入）。
  if(month)for(const p of m.polities??[])if(p.incomeCopperMonth)partyCredit(d,engine,p.id,p.incomeCopperMonth,{sourceEvent:`military:polity:${p.id}:${day}`,reason:'郡府月入',books:{account:source('import','tax'),writer:'military',eventId:`military:polity:${p.id}:${day}`}});
  for(const row of armies(d.get('state'))){
   if(['溃散','待征'].includes(row.status)&&!armyStrength(row))continue;
   const a=clone(row),src=`military:${a.id}:${day}`;
   // 私兵随行：玩家所领的队伍跟着玩家走。
   if(a.party==='player'||d.get('state','records',`organization:${a.party}`)?.leader==='player'&&a.private)a.location=d.get('state','location');
   if(week)armyWeek(d,engine,a,at,src,{blocked:Boolean(a.war&&d.get('state','records',`war:${a.war}`)?.supplyCut?.[a.id])});
   if(month)armyPayday(d,engine,a,at,src);
   for(const p of a.levy.people)if(d.get('state','npcs',p.id,'levy')&&d.get('state','npcs',p.id,'levy','location')!==a.location)holdingSet(d,null,['state','npcs',p.id,'levy','location'],a.location,'military');
   saveArmy(d,a);
  }
 }
}

// ---- 玩家：查看、报到、执勤出征、自募私兵、遣散 -------------------------------------------
const service=state=>state.records?.['military_service:player']??null;
function findArmy(engine,d,name,{here=true}={}){
 const state=d.get('state'),list=armies(state);
 if(name){const a=list.find(a=>a.id===name||a.id===`army_${name}`||a.name===name);if(!a)throw preconditionFailure('没有这支队伍');return clone(a);}
 const local=list.filter(a=>within(engine,state.location,a.location)||a.location===state.location);
 if(here&&local.length===1)return clone(local[0]);
 throw Error(local.length?'此处有几支队伍，请指明 org':'此处没有驻扎的队伍');
}
const MORALE=v=>v>=70?'士气高':v>=45?'士气平稳':v>=30?'士气低落':'人心思散';
export function armyView(engine,state,a){
 const days=armyStrength(a)?Math.floor(a.food/(armyStrength(a)*rules(engine).soldier.rationPerDay)):null;
 return {army:a.id,name:a.name,party:a.party,partyName:a.partyName,location:a.location,status:a.status,strength:armyStrength(a),
  units:{regular:a.regular,levy:a.levy.count,mercenary:a.mercenary?.count??0,private:a.private},training:a.training,morale:a.morale,moraleWords:MORALE(a.morale),
  foodDays:days,arrears:a.arrears,payCopperMonth:a.payCopperMonth,post:a.post,war:a.war,levied:a.levy.people.map(p=>p.id)};
}
function inspect(engine,d,args){
 const state=d.get('state'),s=service(state),t=playerTitle(state);
 const list=args.org?[findArmy(engine,d,args.org)]:armies(state).filter(a=>a.location===state.location||within(engine,state.location,a.location)||s?.army===a.id||a.party==='player'||state.records?.[`organization:${a.party}`]?.leader==='player');
 const pending=list.length?[]:(rules(engine).armies??[]).filter(x=>x.location===state.location).map(x=>({army:x.id,name:x.name,note:'尚未点兵，周日界开营'}));
 return {armies:list.map(a=>armyView(engine,state,a)),pending,service:s,titleLevy:t?.levy?{required:t.levy.men*t.levy.days,served:t.levy.served,attended:t.levy.attended}:null,actionScope:{kind:'instant'}};
}
function enlist(engine,d,args,eventId){
 const state=d.get('state'),a=findArmy(engine,d,args.org);
 if(!within(engine,state.location,a.location))throw preconditionFailure('须到该队伍营地当面报到');
 if(!a.post&&a.party!=='player')throw preconditionFailure('这支队伍不收外人报到');
 if(a.status==='溃散')throw preconditionFailure('这支队伍已经溃散');
 if(partyKind(engine,state,a.party)!=='polity'&&standing(engine,state,a.party,'player')<=HOSTILE)throw preconditionFailure('所属方视你为敌，不收你入营');
 const prior=service(state);if(prior?.status==='在营'&&prior.army!==a.id&&state.records?.[`organization:${prior.army}`]?.members?.player)throw preconditionFailure('你已在别的队伍服役，先退营（org_leave）');
 const minute=state.minute,org=clone(d.get(...rec(`organization:${a.id}`)));org.members.player={position:'兵',joinedAt:minute,arrears:0};delete org.removed?.player;holdingSet(d,null,rec(`organization:${a.id}`),org,'military');syncHoldings(d,engine,'org',a.id,{writer:'military',eventId});
 holdingSet(d,null,rec('military_service:player'),{category:'military_service',holder:'player',army:a.id,party:a.party,status:'在营',since:minute,days:0,campaignDays:0,paid:0,history:[...prior?.history??[],...(prior?[{army:prior.army,until:minute}]:[])],sourceEvent:eventId},'military');
 engine.advance(d,30,eventId);
 const t=playerTitle(d.get('state'));
 return {army:a.id,name:a.name,enlisted:true,note:`已在${a.name}报到入营${t?.levy?.men?'；在营执勤的日数计入爵位兵役':''}`,organizationEvent:{verb:'organize',target:a.id,tags:['organization','org:join','kind:军团','army']}};
}
function duty(engine,d,args,eventId){
 const m=rules(engine),s=service(d.get('state'));
 if(s?.status!=='在营'||!d.get('state','records',`organization:${s.army}`)?.members?.player)throw preconditionFailure('你不在任何队伍的名册上，先 army_enlist 报到');
 let a=armyOf(d,s.army);if(!within(engine,d.get('state','location'),a.location))throw preconditionFailure(`须到${a.name}所在地执勤`);
 const days=args.days??1;if(!int(days,1,30))throw preconditionFailure('执勤日数须在1到30之间');
 let campaignDays=0,men=0;
 for(let day=0;day<days;day++){
  a=armyOf(d,s.army);if(!within(engine,d.get('state','location'),a.location))throw preconditionFailure(`须到${a.name}所在地继续执勤`);
  if(a.status==='出征')campaignDays++;
  const t=playerTitle(d.get('state'));
  // Credit each actual day before its annual inspection, including a duty crossing the due date.
  if(t?.levy?.men&&a.post){men=t.levy.personal?1:Math.min(t.levy.men,1+(d.get('state','player','companions')?.length??0));holdingSet(d,engine,rec('title:player'),{...t,levy:{...t.levy,served:t.levy.served+men,attended:true}},'military');}
  engine.advance(d,DAY,eventId);
 }
 const campaign=campaignDays>0;
 a=armyOf(d,s.army);
 const wage=partyPay(d,engine,a.party,m.service.dutyCopperPerDay*days,{sourceEvent:`${eventId}:duty`,reason:`${a.name}执勤饷`,books:{account:purse(engine,'player'),writer:'military',eventId}});
 if(wage)d.set(['state','player','coins'],d.get('state','player','coins')+wage);
 a.training=Math.min(m.soldier.trainingCap,a.training+m.service.trainingPerDutyDay*days);saveArmy(d,a);
 const now=clone(service(d.get('state')));now.days+=days;now.campaignDays+=campaignDays;now.paid+=wage;now.lastDuty={minute:d.get('state','minute'),days,location:a.location,war:a.war,sourceEvent:eventId};
 holdingSet(d,null,rec('military_service:player'),now,'military');
 // T127：在营执勤即应役；随员按人头计入（自身应役的爵位只计本人）。
 const t=playerTitle(d.get('state'));let levy=null;
 if(t?.levy?.men&&a.post){
  levy={served:t.levy.served,required:t.levy.men*t.levy.days,men};
 }
 return {army:a.id,name:a.name,days,campaign,wage,training:a.training,...(levy?{titleLevy:levy}:{}),note:campaign?'随军出征的日数已记入战役':'在营执勤'};
}
function payer(engine,d,args){
 if(!args.org)return 'player';
 const state=d.get('state');let id=args.org;
 if(!state.records?.[`organization:${id}`])try{id=engine.resolve(args.org);}catch{throw preconditionFailure('没有这个组织');}
 const org=organization(engine,state,id);if(!org||org.source!=='created'||org.kind==='军团')throw preconditionFailure('私兵须挂在你创立或领导的组织名下（world_create org）');
 if(org.leader!=='player')throw preconditionFailure('只有组织首领能以组织名义募兵');
 return id;
}
function recruit(engine,d,args,eventId){
 const m=rules(engine),state=d.get('state'),party=payer(engine,d,args),quantity=args.quantity??m.recruit.perCall;
 if(!int(quantity,1,m.recruit.perCall))throw preconditionFailure(`一次至多招${m.recruit.perCall}人`);
 const id=`army_p_${party==='player'?'player':party.replace(/[^a-z0-9_]/gi,'_').toLowerCase()}`.slice(0,46);
 let a=armyOf(d,id);
 const merc=args.choice==='mercenary';
 const company=merc?(m.mercenaries??[]).find(c=>within(engine,state.location,c.location)||c.location===state.location):null;
 if(merc&&!company)throw preconditionFailure('此处没有可雇的佣兵团');
 if(!merc&&!m.recruit.places.some(p=>within(engine,state.location,p)||p===state.location))throw preconditionFailure('此处招不到愿意吃粮当兵的人');
 const minute=state.minute;
 if(!a)a=clone(createArmy(d,engine,{id,name:`${partyName(engine,state,party)}私兵`,party,base:state.location,location:state.location,supply:'purchase',regular:0,training:10,morale:m.soldier.moraleBase,payCopperMonth:m.recruit.payCopperMonth,leader:'player'},minute,eventId));
 if(a.status==='溃散')a.status='驻守';
 if(armyStrength(a)+quantity>m.recruit.maxPrivate)throw preconditionFailure(`私兵至多${m.recruit.maxPrivate}人`);
 if(merc){
  const hired=armies(state).reduce((n,x)=>n+(x.mercenary?.org===company.org?x.mercenary.count:0),0);
  if(hired+quantity>company.soldiers)throw preconditionFailure(`${nameOf(engine,company.org)}眼下只剩${company.soldiers-hired}人可雇`);
  if(a.mercenary&&a.mercenary.org!==company.org)throw preconditionFailure('一支队伍只与一家佣兵团订约');
  const cost=quantity*company.payCopperMonth;
  if(partyPay(d,engine,party,cost,{sourceEvent:eventId,reason:'佣兵首月佣金',partial:false,books:{account:partyAccount(engine,d.get('state'),company.org),writer:'military',eventId}})!==cost)throw preconditionFailure(`首月佣金${cost}铜付不出；可先存入组织公库或向钱庄借款`);
  partyCredit(d,engine,company.org,cost,{sourceEvent:eventId,reason:'佣兵首月佣金',books:BOOKED});
  a.mercenary={org:company.org,count:(a.mercenary?.count??0)+quantity,payCopperMonth:company.payCopperMonth};
  a.training=Math.round((a.training*(armyStrength(a)-quantity)+company.training*quantity)/armyStrength(a));
 }else{
  const cost=quantity*m.recruit.signOnCopper;
  if(cost&&partyPay(d,engine,party,cost,{sourceEvent:eventId,reason:'募兵安家钱',partial:false,books:{account:sink('export','recruit'),writer:'military',eventId}})!==cost)throw preconditionFailure(`安家钱${cost}铜付不出；可先存入组织公库或向钱庄借款`);
  a.private+=quantity;
 }
 log(a,{kind:merc?'雇佣':'招募',quantity,minute,sourceEvent:eventId});saveArmy(d,a);
 engine.advance(d,60,eventId);
 return {army:a.id,name:a.name,strength:armyStrength(a),payer:party,payCopperMonth:a.payCopperMonth,mercenary:a.mercenary,note:'每周买口粮、每月发饷都从出钱方支付；付不出会掉士气并有人逃散',
  organizationEvent:{verb:'organize',target:a.id,tags:['organization','org:recruit','kind:军团','army']}};
}
function dismiss(engine,d,args,eventId){
 const a=findArmy(engine,d,args.org,{here:false}),state=d.get('state');
 const lead=a.party==='player'||state.records?.[`organization:${a.party}`]?.leader==='player';if(!lead)throw preconditionFailure('只能遣散自己的私兵');
 if(a.war&&a.status==='出征')throw preconditionFailure('出征中的队伍不能就地遣散');
 const n=args.quantity??armyStrength(a);if(!int(n,1,armyStrength(a)))throw preconditionFailure('遣散人数无效');
 let left=n;const fromPrivate=Math.min(left,a.private);a.private-=fromPrivate;left-=fromPrivate;
 if(left&&a.mercenary){const k=Math.min(left,a.mercenary.count);a.mercenary.count-=k;left-=k;if(!a.mercenary.count)a.mercenary=null;}
 if(!armyStrength(a))a.status='溃散';
 log(a,{kind:'遣散',quantity:n-left,minute:state.minute,sourceEvent:eventId});saveArmy(d,a);
 return {army:a.id,dismissed:n-left,strength:armyStrength(a)};
}
export function militaryAction(d,args,eventId){
 const engine=this;if(!rules(engine))throw preconditionFailure('此世界尚未登记军务规则');assertMilitary(engine);
 if(args.operation!=='army_inspect')ensureArmies(d,engine,d.get('state','minute'));
 switch(args.operation){
 case 'army_inspect':return inspect(engine,d,args);
 case 'army_enlist':return enlist(engine,d,args,eventId);
 case 'army_duty':return duty(engine,d,args,eventId);
 case 'army_recruit':return recruit(engine,d,args,eventId);
 case 'army_dismiss':return dismiss(engine,d,args,eventId);
 default:throw preconditionFailure('未知军务操作');
 }
}

// T127's existing office intake now leads to a real garrison roster and duty.
export function titleMilitaryService(d,engine,days,eventId){
 ensureArmies(d,engine,d.get('state','minute'));
 const state=d.get('state'),post=armies(state).find(a=>a.post&&within(engine,state.location,a.location)&&a.status!=='溃散');
 if(!post)throw preconditionFailure('此处没有可登记爵位兵役的驻营');
 if(service(state)?.army!==post.id||!state.records[`organization:${post.id}`]?.members?.player)enlist(engine,d,{org:post.id},`${eventId}:enlist`);
 for(let left=days;left>0;left-=30)duty(engine,d,{days:Math.min(30,left)},`${eventId}:duty:${left}`);
 const t=playerTitle(d.get('state'));if(!t)throw preconditionFailure('爵位已除');
 if(!days)holdingSet(d,engine,rec('title:player'),{...t,levy:{...t.levy,attended:true}},'military');
 return {title:t.title,army:post.id,served:t.levy.served,required:t.levy.men*t.levy.days,men:t.levy.personal?1:Math.min(t.levy.men,1+(d.get('state','player','companions')?.length??0))};
}

// ---- 场景 ---------------------------------------------------------------------------
export function militaryScene(engine,document){
 const s=document.state,here=armies(s).filter(a=>a.location===s.location&&armyStrength(a));
 const mine=service(s),lines=here.slice(0,2).map(a=>`${a.name}（${a.id}，${armyStrength(a)}人，${MORALE(a.morale)}${a.status==='出征'?'，出征':''}）`);
 const levied=Object.values(s.records??{}).filter(r=>r.category==='levy'&&within(engine,s.location,r.settlement)).reduce((n,r)=>n+r.count,0);
 if(levied)lines.push(`本村有${levied}户的壮丁被征去当兵`);
 if(mine?.status==='在营')lines.push(`你在${s.records?.[armyKey(mine.army)]?.name??mine.army}名册上`);
 return lines.length?`【军务】${lines.join('；')}。`:'';
}
