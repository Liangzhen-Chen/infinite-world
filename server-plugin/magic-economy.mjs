// U10 life-magic economy (guide 3.6; rules.magicEconomy, data in
// world/design/magic-economy.mjs). A completed player cast of a preserve,
// irrigate, growth or purify spell inside a village is entered in that
// village's ledger `magic-economy:<settlement>`; the spells' own physics stay
// in their effect families. Consumers read the ledger:
//   agriculture        monthly spoilage cut by the stock preservation covered
//   seasonal-hazards   drought crop damage eased by irrigation; water-borne
//                      spread lowered by purified water
//   settlement-trade   price cut per kind (settled at midnight from the casts
//                      within windowDays), so mass casting bends the curve
//   advance registry   daily settlement: prices, beneficiaries' and
//                      competitors' standing (K4), complaints (K6 rumor and
//                      standing effects -> K3 world event, public opinion)
// Regulation runs at the cast: fee, monthly licence or a hard limit past the
// free casts of the month; unpaid fees and breaches become law cases.
import {applyEffects} from './effects.mjs';
import {adjustStanding} from './standing.mjs';
import {isReputationSettlement} from './reputation-registry.mjs';
import {registerMagicViolation} from './law.mjs';
import {personView,personOffices,settlementGovernment,settlementPopulation} from './entity-view.mjs';
import {groupAccountView,changeGroupCoins} from './group-account.mjs';
import {purse} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
declareHoldingWriter('magic-economy',{kinds:['permit']});
declareLedgerWriter('magic-economy');

const DAY=1440,MONTH=30*DAY,SEASON=90*DAY,KINDS=['preserve','irrigate','growth','purify'],MODES=['fee','license','restrict'];
const key=sid=>`magic-economy:${sid}`;
const int=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const round=v=>Math.round(v*1e6)/1e6;
const share=v=>Number.isFinite(v)&&v>=0&&v<=1;
const table=engine=>engine.rules?.magicEconomy??null;

export function validateMagicEconomyRules(world){
 const r=world.rules.magicEconomy;if(!r)return [];
 const errors=[],items=new Set((world.items??[]).map(i=>i.id)),places=new Set((world.locations??[]).map(l=>l.id));
 if(r.version!==1||typeof r.source!=='string'||!r.source||!int(r.windowDays,1,360))errors.push('生活魔法经济规则版本、来源或窗口无效');
 for(const [kind,k] of Object.entries(r.kinds??{})){
  if(!KINDS.includes(kind))errors.push(`生活魔法经济未知类别：${kind}`);
  if(!Array.isArray(k.spells)||!k.spells.length||k.spells.some(s=>typeof s.kind!=='string'))errors.push(`${kind}未列出法术效果`);
  if(!Array.isArray(k.items)||k.items.some(i=>!items.has(i)))errors.push(`${kind}的物价物品未登记`);
  if(!int(k.priceCutPermillePerCast,0,1000)||!int(k.maximumPriceCutPermille,0,500))errors.push(`${kind}的降价参数无效`);
  if(!Array.isArray(k.beneficiaries)||!Array.isArray(k.competitors)||!int(k.incomeLossCopperPerCast,0,10000))errors.push(`${kind}的受益或竞争职业无效`);
 }
 const p=r.kinds?.preserve,i=r.kinds?.irrigate,w=r.kinds?.purify;
 if(p&&(!int(p.coverFoodPerCast,1,1e6)||!int(p.lossCutPermille,0,1000)))errors.push('保鲜覆盖或降损参数无效');
 if(i&&(!int(i.areaUnitsPerCast,1,1e5)||!int(i.yieldBonusPermille,0,500)||!int(i.maximumYieldBonusPermille,0,500)||!int(i.droughtReliefPermille,0,1000)||!int(i.unmanagedFieldAreaUnits,1,1e7)))errors.push('引水增产或抗旱参数无效');
 if(w&&(!int(w.householdsPerCast,1,1000)||!int(w.coverMinutes,1,30*DAY)||!share(w.householdFactor)||!share(w.routeFactor)))errors.push('净水防疫参数无效');
 const x=r.reactions??{};
 for(const f of ['beneficiaryDelta','maximumBeneficiaryDelta','maximumPeoplePerKind','complaintCopper','complaintCooldownDays','complaintCarriers','complaintTightening'])if(!int(x[f],0,1e5))errors.push(`反应参数无效：${f}`);
 for(const f of ['competitorDelta','maximumCompetitorDelta','settlementComplaintDelta'])if(!int(x[f],-100,0))errors.push(`反应参数无效：${f}`);
 for(const g of r.regulation??[])if(!places.has(g.settlement)||!MODES.includes(g.mode)||!int(g.freeCastsPerMonth,0,1000)
  ||g.feeCopper!==undefined&&!int(g.feeCopper,1,1e5)||g.licenseCopper!==undefined&&!int(g.licenseCopper,1,1e5)||g.maximumCastsPerMonth!==undefined&&!int(g.maximumCastsPerMonth,1,1e4)
  ||g.mode==='fee'&&!g.feeCopper||g.mode==='license'&&!g.licenseCopper||g.mode==='restrict'&&!g.maximumCastsPerMonth)errors.push(`官府管制规则无效：${g.settlement}`);
 for(const [offense,pen] of Object.entries(r.penalties??{}))if(!int(pen.baseFine,0,1e5)||!(Number.isFinite(pen.valueMultiplier)&&pen.valueMultiplier>=0))errors.push(`生活魔法违规罚则无效：${offense}`);
 return errors;
}

export function economicKind(r,spec){
 if(!r||!spec)return null;
 for(const [kind,k] of Object.entries(r.kinds))if(k.spells.some(s=>s.kind===spec.kind&&(s.operation===undefined||s.operation===spec.operation)))return kind;
 return null;
}
// The village (a settlement with a stock ledger) a place belongs to.
export function economySettlement(engine,state,location){
 const seen=new Set();
 while(location&&!seen.has(location)){if(state.settlements?.[location])return location;seen.add(location);location=engine.byId.get(location)?.parent;}
 return null;
}
const blank=sid=>({category:'magic_economy',settlement:sid,casts:[],prices:{},curve:[],grievances:{},complaints:[],violations:[],
 ledger:{preserveSaved:0,feesCopper:0,lostIncomeCopper:0},lastDay:null});
const read=(d,sid)=>structuredClone(d.get('state','records',key(sid))??blank(sid));

// ---- Cast -----------------------------------------------------------------------
// Called by engine.cast (engine as `this`) after a completed spell effect.
export function recordMagicEconomy(d,catalog,effect,eventId){
 const r=table(this);if(!r||!effect||effect.effectFailed)return null;
 // An event recorded before this ledger existed replays exactly as it was.
 if(this.replaying&&this.replayResult!==undefined&&!this.replayResult?.economy)return null;
 const kind=economicKind(r,catalog.effectSpec);if(!kind)return null;
 const state=d.get('state'),location=state.location,sid=economySettlement(this,state,location);if(!sid)return null;
 const minute=state.minute,cfg=r.kinds[kind],row=read(d,sid);
 if(row.casts.some(c=>c.source===eventId))return null;
 const cast={source:eventId,kind,spell:catalog.id,minute,day:Math.floor(minute/DAY)},out={version:1,settlement:sid,kind};
 if(kind==='preserve'){cast.coverFood=cfg.coverFoodPerCast;cast.until=minute+Math.max(1,catalog.duration??0);}
 if(kind==='purify'){cast.households=cfg.householdsPerCast;cast.until=minute+cfg.coverMinutes;}
 if(kind==='irrigate')out.field=irrigate(d,this,row,sid,cfg,minute);
 row.casts.push(cast);
 const regulation=regulate(d,this,row,sid,r,minute,eventId,location);if(regulation)out.regulation=regulation;
 holdingSet(d,null,['state','records',key(sid)],row,'magic-economy');
 return out;
}
function irrigate(d,engine,row,sid,cfg,minute){
 const season=Math.floor(minute/SEASON);
 if(row.irrigation?.season!==season)row.irrigation={season,areaUnits:0,cohorts:{},unmanagedPermille:0};
 const ir=row.irrigation;ir.areaUnits+=cfg.areaUnitsPerCast;
 const farmKey=`agriculture:${sid}`,farm=d.get('state','records',farmKey);
 if(farm?.mode==='managed'){
  const f=structuredClone(farm),standing=f.field.cohorts.filter(c=>!c.ready&&!c.harvestedUnits),area=standing.reduce((n,c)=>n+c.areaUnits,0);
  if(!area)return {areaUnits:cfg.areaUnitsPerCast,managed:true,bonusPermille:0,note:'田里没有在长的庄稼；只计入本季抗旱'};
  // The watered share of the standing crop gains yieldBonusPermille; spread over the field.
  const bonus=cfg.yieldBonusPermille*Math.min(1,cfg.areaUnitsPerCast/area);let given=0;
  for(const c of standing){
   const used=ir.cohorts[c.id]??0,add=round(Math.max(0,Math.min(bonus,cfg.maximumYieldBonusPermille-used)));if(!add)continue;
   c.qualitySum*=1+add/1000;ir.cohorts[c.id]=round(used+add);given=Math.max(given,add);
  }
  if(given)holdingSet(d,null,['state','records',farmKey],f,'magic-economy');
  return {areaUnits:cfg.areaUnitsPerCast,managed:true,bonusPermille:given};
 }
 const bonus=cfg.yieldBonusPermille*Math.min(1,cfg.areaUnitsPerCast/cfg.unmanagedFieldAreaUnits);
 const add=round(Math.max(0,Math.min(bonus,cfg.maximumYieldBonusPermille-ir.unmanagedPermille)));ir.unmanagedPermille=round(ir.unmanagedPermille+add);
 return {areaUnits:cfg.areaUnitsPerCast,managed:false,bonusPermille:add};
}
const monthCasts=(row,month)=>row.casts.filter(c=>Math.floor(c.minute/MONTH)===month).length;
function regulate(d,engine,row,sid,r,minute,eventId,location){
 const rule=(r.regulation??[]).find(g=>g.settlement===sid);if(!rule)return null;
 const state=d.get('state');
 // Current appointments control exemptions; expired or removed offices grant none.
 const government=settlementGovernment(engine,state,sid);
 if(personOffices(engine,state,'player',{settlement:sid}).length)return {mode:rule.mode,exempt:'在任官职'};
 if(!government.head.value)return {mode:rule.mode,suspended:'当地官职空缺'};
 const month=Math.floor(minute/MONTH),count=monthCasts(row,month);
 const tightened=row.complaints.filter(c=>Math.floor(c.minute/MONTH)===month).length*r.reactions.complaintTightening;
 const free=Math.max(0,rule.freeCastsPerMonth-tightened),out={mode:rule.mode,count,free};
 if(count<=free)return out;
 const violation=(offense,value)=>{
  const legalCase=registerMagicViolation(d,engine,{location,settlement:sid,offense,value,minute,sourceEvent:eventId});
  row.violations.push({offense,value,minute,sourceEvent:eventId,case:legalCase});
  return {...out,violation:offense,value,case:legalCase,note:legalCase?'已由当地执法者登记报案':'当地没有可执行法典，只记入村账'};
 };
 const pay=(copper,kind)=>{
  const coins=d.get('state','player','coins'),account=groupAccountView(engine,d.get('state'),sid);
  if(coins<copper||!account)return false;
  d.set(['state','player','coins'],coins-copper);
  changeGroupCoins(d,engine,sid,copper,{kind:'生活魔法收费',levy:kind,collector:government.head.value,minute,sourceEvent:eventId},{account:purse(engine,'player'),writer:'magic-economy',eventId});
  holdingSet(d,null,['state','records',`magic-levy:${eventId}`],{category:'magic_levy',settlement:sid,collector:government.head.value,kind,copper,month,minute,sourceEvent:eventId},'magic-economy');
  row.ledger.feesCopper+=copper;return true;
 };
 if(rule.maximumCastsPerMonth&&count>rule.maximumCastsPerMonth)return violation('magic_over_quota',0);
 if(rule.mode==='license'){
  const licence=`magic-licence:${sid}:${month}`,held=state.records?.[licence];
  if(held?.category==='authorization'&&!held.revoked&&held.expires>minute)return {...out,licence};
  if(!pay(rule.licenseCopper,'licence'))return violation('magic_unlicensed',rule.licenseCopper);
  holdingSet(d,null,['state','records',licence],{category:'authorization',action:'trade_magic',subject:'player',grantee:'player',grantor:sid,settlement:sid,
   createdAt:minute,expires:(month+1)*MONTH,revoked:false,sourceType:'magic_economy_licence',fee:rule.licenseCopper,sourceEvent:eventId},'magic-economy');
  return {...out,licence,paid:rule.licenseCopper};
 }
 if(rule.feeCopper){
  if(!pay(rule.feeCopper,'fee'))return violation('magic_levy_unpaid',rule.feeCopper);
  return {...out,paid:rule.feeCopper};
 }
 return out;
}

// ---- Readers for the other systems -------------------------------------------------
const ancestors=(engine,location)=>{const out=[],seen=new Set();while(location&&!seen.has(location)){out.push(location);seen.add(location);location=engine.byId.get(location)?.parent;}return out;};
// Product of the magic price cuts in force for this item at this place.
export function magicPriceFactor(engine,state,item,location){
 const r=table(engine);if(!r)return 1;let factor=1;
 for(const place of ancestors(engine,location)){
  const row=state.records?.[key(place)];if(row?.category!=='magic_economy')continue;
  for(const [kind,permille] of Object.entries(row.prices??{}))if(permille>0&&r.kinds[kind]?.items.includes(item))factor*=1-permille/1000;
 }
 return factor;
}
// Granary spoilage the preservation casts of the last 30 days saved (agriculture, monthly).
export function preservedSpoilage(d,engine,sid,day,spoil,food){
 const r=table(engine),cfg=r?.kinds.preserve,row=d.get('state','records',key(sid));
 if(!cfg||row?.category!=='magic_economy'||!spoil||!food)return 0;
 const from=(day-29)*DAY,to=(day+1)*DAY;let covered=0;
 for(const c of row.casts)if(c.kind==='preserve')covered+=c.coverFood*Math.max(0,Math.min(c.until,to)-Math.max(c.minute,from))/DAY;
 const saved=Math.min(spoil,Math.floor(spoil*Math.min(1,covered/(food*30))*cfg.lossCutPermille/1000));
 if(!saved)return 0;
 const next=structuredClone(row);next.ledger.preserveSaved+=saved;next.spoilage=[...(next.spoilage??[]),{day,spoil,saved}].slice(-12);
 holdingSet(d,null,['state','records',key(sid)],next,'magic-economy');return saved;
}
// Unmanaged fields: this season's irrigation raises the daily output.
export function magicYieldFactor(state,sid,minute){
 const ir=state.records?.[key(sid)]?.irrigation;
 return ir&&ir.season===Math.floor(minute/SEASON)&&ir.unmanagedPermille?1+ir.unmanagedPermille/1000:1;
}
// Share (permille) of a drought's crop damage this season's irrigation absorbs.
export function droughtRelief(engine,state,sid,minute){
 const cfg=table(engine)?.kinds.irrigate,ir=state.records?.[key(sid)]?.irrigation;
 if(!cfg||!ir||ir.season!==Math.floor(minute/SEASON))return 0;
 const farm=state.records?.[`agriculture:${sid}`],area=farm?.mode==='managed'?farm.field.areaUnits:cfg.unmanagedFieldAreaUnits;
 return Math.floor(cfg.droughtReliefPermille*Math.min(1,ir.areaUnits/area));
}
// Spread multiplier of a water-borne disease where purified water covers households.
export function purifiedWaterFactor(engine,state,sid,at,field,disease){
 const cfg=table(engine)?.kinds.purify,row=state.records?.[key(sid)];
 if(!cfg||disease?.route!=='water'||row?.category!=='magic_economy'||!['household','route'].includes(field))return 1;
 const covered=row.casts.filter(c=>c.kind==='purify'&&c.minute<=at&&at<c.until).reduce((n,c)=>n+c.households,0);if(!covered)return 1;
 const houses=settlementPopulation(engine,state,sid).householdCount.value||1;
 return 1-Math.min(1,covered/houses)*(1-(field==='household'?cfg.householdFactor:cfg.routeFactor));
}

// ---- Daily settlement (advance registry) -------------------------------------------
const homeOf=(engine,state,view)=>view.settlement.value??economySettlement(engine,state,view.location.value);
function people(engine,state,sid,patterns,limit){
 if(!patterns.length)return [];
 return Object.keys(state.npcs??{}).filter(id=>state.npcs[id].status!=='死亡').map(id=>personView(engine,state,id))
  .filter(v=>v&&patterns.some(p=>(v.occupation.value??'').includes(p))&&homeOf(engine,state,v)===sid)
  .map(v=>v.id.value).sort().slice(0,limit);
}
function complain(d,engine,row,sid,npc,kind,at,day){
 const r=table(engine),state=d.get('state'),sourceEvent=`magic-complaint:${sid}:${npc}:${day}`,name=id=>engine.byId.get(id)?.name??id;
 const neighbours=Object.keys(state.npcs??{}).filter(id=>id!==npc&&state.npcs[id].status!=='死亡'&&homeOf(engine,state,personView(engine,state,id))===sid).sort();
 const carriers=[npc,...neighbours.slice(0,Math.max(0,r.reactions.complaintCarriers-1))];
 const claim=`${name(npc)}抱怨：有人在${name(sid)}接连施${r.kinds[kind].name}之术，断了自家生计，要找村里说理。`;
 const effects=[{kind:'rumor',id:'magic_complaint',claim,carriers,salience:2}];
 if(r.reactions.settlementComplaintDelta&&isReputationSettlement(engine,sid))effects.push({kind:'standing',holder:sid,target:'player',delta:r.reactions.settlementComplaintDelta,reason:`${r.kinds[kind].name}遭投诉`});
 const receipt=applyEffects(d,engine,effects,{settlement:sid,faction:null,minute:at,sourceEvent},'world');
 // Public opinion reads the grievance as a deed of the caster against the complainant.
 for(const id of carriers){
  const stream=d.get('state','npcs',id,'memoryStream')??[],mid=`${sourceEvent}:complaint`;if(stream.some(m=>m.id===mid))continue;
  d.set(['state','npcs',id,'memoryStream'],[...stream,{id:mid,sourceEvent,kind:'complaint',minute:at,location:sid,participants:['player',npc],content:claim,
   sourceType:id===npc?'亲历':'听说',salience:3,emotion:'不满'}]);
 }
 row.complaints.push({npc,kind,day,minute:at,sourceEvent,applied:receipt.applied});
}
function settleDay(d,engine,row,at){
 const r=table(engine),day=at/DAY-1,sid=row.settlement,state=d.get('state');
 if(row.lastDay!==null&&row.lastDay>=day)return;
 // Price curve: casts within the window, settled once per midnight.
 for(const [kind,cfg] of Object.entries(r.kinds)){
  const n=row.casts.filter(c=>c.kind===kind&&c.day<=day&&c.day>day-r.windowDays).length;
  const permille=Math.min(cfg.maximumPriceCutPermille,n*cfg.priceCutPermillePerCast);
  if(permille!==(row.prices[kind]??0)){if(permille)row.prices[kind]=permille;else delete row.prices[kind];row.curve=[...row.curve,{day:day+1,kind,permille}].slice(-120);}
 }
 // Reactions to yesterday's casts.
 const x=r.reactions;
 for(const [kind,cfg] of Object.entries(r.kinds)){
  const n=row.casts.filter(c=>c.kind===kind&&c.day===day).length;if(!n)continue;
  const sourceEvent=`magic-economy:${sid}:${day}:${kind}`,gainers=people(engine,state,sid,cfg.beneficiaries,x.maximumPeoplePerKind);
  const losers=n*cfg.incomeLossCopperPerCast?people(engine,state,sid,cfg.competitors,x.maximumPeoplePerKind):[];
  row.reactions={...(row.reactions?.day===day?row.reactions:{day}),[kind]:{casts:n,beneficiaries:gainers,competitors:losers}};
  for(const id of gainers)
   adjustStanding(d,engine,id,'player',Math.min(x.maximumBeneficiaryDelta,x.beneficiaryDelta*n),{sourceEvent,reason:`${cfg.name}受益`,minute:at});
  const loss=n*cfg.incomeLossCopperPerCast;if(!loss)continue;
  for(const id of losers){
   adjustStanding(d,engine,id,'player',Math.max(x.maximumCompetitorDelta,x.competitorDelta*n),{sourceEvent,reason:`${cfg.name}抢了生计`,minute:at});
   row.ledger.lostIncomeCopper+=loss;row.grievances[id]=(row.grievances[id]??0)+loss;
   const last=row.complaints.filter(c=>c.npc===id).at(-1);
   if(row.grievances[id]>=x.complaintCopper&&(!last||day-last.day>=x.complaintCooldownDays)){complain(d,engine,row,sid,id,kind,at,day);row.grievances[id]=0;}
  }
 }
 const keep=Math.max(r.windowDays,30);
 row.casts=row.casts.filter(c=>c.day>day-keep||c.until>at);row.lastDay=day;
}
export function advanceMagicEconomy(d,engine,{before,after}){
 if(!table(engine)||Math.floor(before/DAY)===Math.floor(after/DAY))return;
 const keys=Object.keys(d.get('state','records')??{}).filter(k=>k.startsWith('magic-economy:'));if(!keys.length)return;
 for(let day=Math.floor(before/DAY)+1;day*DAY<=after;day++)for(const k of keys){
  const row=structuredClone(d.get('state','records',k));if(row?.category!=='magic_economy')continue;
  settleDay(d,engine,row,day*DAY);holdingSet(d,null,['state','records',k],row,'magic-economy');
 }
}
