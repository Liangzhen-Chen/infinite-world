import {laborValue,marketQuote} from './market.mjs';
import {preconditionFailure} from './precondition.mjs';
import {recordsWhere} from './storage.mjs';

import {settleStewardRequests} from './high-nobility.mjs';
import {currentDomains,containsDomain} from './noble-state.mjs';
import {personOffices,personConstraint,personHousehold,placeSettlement,personAge,groupRepresentative,personBusiness,groupView,personName} from './entity-view.mjs';
import {currentEmployment,employmentActive,recordEmploymentAttendance} from './employment-state.mjs';
import {workerSkill,employmentStock,employmentProductionPlan,settleEmploymentProduction} from './finance-assets.mjs';
import {financeBalance,financeTransfer,financeChange,financeEvent,financeInt} from './finance-bank.mjs';
import {escrow as escrowAccount,coinRead,partyAccount,dedicatedCoinAccount,counterCash,payFromCounter,booksOpen} from './money.mjs';
import {bagStock} from './stock.mjs';
import {declareLedgerWriter} from './ledger.mjs';
declareLedgerWriter('labor-market');
import {groupAccountView} from './group-account.mjs';
import {currentShops,shopOfKeeper,fundCounter} from './shop.mjs';
import {subjectiveView} from './subjective-view.mjs';
import {npcDecision} from './npc-decision.mjs';
import {npcNeedGoals} from './npc-intelligence.mjs';
import {standing} from './standing.mjs';
import {registerCreditDefault,settleCreditCase} from './law.mjs';
import {advanceLayerPlan} from './advance-layers.mjs';
import {transferItems} from './items.mjs';
import {medicineSites,medicalSkill} from './medicine-state.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
import {changeLegacyHoldings} from './transition.mjs';
import {contractTerms,partyInProcedure} from './contract-state.mjs';
import {registerEarnedClaim,settleClaim,claimDue,claimLimitation} from './obligation-claims.mjs';
import {obligationView as dueObligation} from './obligation-state.mjs';
import {mineEmployment} from './extraction.mjs';
import {currentWorkstationRecipes} from './workstation-services.mjs';
import {householdLaborBudget} from './household-budget.mjs';
import {householdWorkTime,agriculturalWorkforce} from './npc-state.mjs';
import {creditBreachEvent,publishTransitionEvent} from './world-events.mjs';
declareHoldingWriter('labor-market',{kinds:['employed_by']});

const DAY=1440,rec=id=>['state','records',id],rows=s=>Object.values(s.records??{});
// A better paid employer must beat the signed wage by this margin before a worker moves; by the same margin a signed wage
// that has fallen behind the local derived wage is clearly low and the worker may quit on it.
const WAGE_HURDLE=1.2;
function writeJob(d,e,row){
    const write=()=>holdingSet(d,e,rec(row.id),row,'labor-market');
    if(row.endedAt!==undefined)return changeLegacyHoldings(d,e,{holder:row.worker,source:`contract:${row.id}`,reason:row.status==='已到期'?'expired':'vacated',eventId:`${row.id}:end:${row.endedAt}`},write);
    return write();
}
const base=(e,s,id)=>s.created?.[id]??e.byId.get(id);
const able=(s,id)=>s.npcs?.[id]&&!['死亡','濒死','昏迷','患病'].includes(s.npcs[id].status);
const layer=(e,s,location,plan=e.advanceLayerContext??advanceLayerPlan(e,s))=>plan.layers.get(plan.countyOf(location))??'intelligent';
const wage=(e,s,worker='player',observer=null)=>laborValue(e,{state:s},{worker,observer}).daily;
const outstanding=(s,id)=>recordsWhere(s.records,'kind','wage').filter(r=>r.category==='debt'&&r.contract===id&&dueObligation(s,r.id)?.owed>0);

const occupied=(s,id,start,end)=>rows(s).some(r=>r.category==='contract'&&r.kind==='workshop'&&r.worker===id&&employmentActive(r)&&r.starts<end&&r.deadline>start);

function ownerCanHire(e,s,owner){
    if(owner==='player')return false;
    const estate=s.records?.[`protocol_assets:${owner}`];if(estate)return estate.sealedAt===undefined&&estate.executor&&able(s,estate.executor)&&!personConstraint(e,s,estate.executor);

    if(s.npcs?.[owner])return able(s,owner)&&!personConstraint(e,s,owner);
    const representative=groupRepresentative(e,s,owner);
    return Boolean((groupAccountView(e,s,owner)||s.records?.[`organization:${owner}`]?.category==='organization')&&representative&&able(s,representative)&&!personConstraint(e,s,representative));
}
function recipeFor(e,s,owner,item){
    return e.world.recipes.filter(r=>r.output?.item===item&&r.materials?.length&&r.minutes>0&&r.minutes<=480&&r.materials.every(m=>employmentStock({get:(...p)=>p.slice(1).reduce((o,k)=>o?.[k],s)},e,owner,m.item)>=m.amount)).sort((a,b)=>a.id.localeCompare(b.id));
}
// Offers are projections of outstanding orders, empty shelves and seasonal work.
// No vacancy, occupation or employer is copied into a person's stored profile.
export function laborOffers(e,s,minute=s.minute){
    // Offers already taken by a live contract, read once for the whole listing.
    const taken=new Set(rows(s).filter(c=>employmentActive(c)&&c.deadline>minute).map(c=>c.offer));
    const out=[],add=r=>{
        if(r.owner==='player'||!ownerCanHire(e,s,r.owner)||!r.location||r.quantity<=0)return;
        const id=`labor:${r.source}:${r.recipe??r.task}`;
        if(taken.has(id))return;
        const d={...r,id,wage:r.wage??wage(e,s,r.owner,r.owner),workMinutes:480,createdAt:minute,deadline:Math.min(r.deadline??minute+7*DAY,minute+30*DAY)};
        if(d.deadline<=Math.floor(minute/DAY)*DAY+1020)return;
        // A business that keeps a counter pays its hands from it, after the keeper (at signing) puts in what the counter lacks from his purse: counter and purse together back a vacancy.
        const account=groupAccountView(e,s,r.owner),counter=dedicatedCoinAccount(s,r.owner,'counter'),own=account?.coins??s.records?.[`organization:${r.owner}`]?.treasury??s.npcs[r.owner]?.coins??0,balance=counter?counter.coins+own:own;
        if(balance<d.wage)return;
        out.push(d);
    };
    for(const order of rows(s))if(order.category==='contract'&&['procurement','order'].includes(order.kind)&&['待履行','履行中','有效'].includes(order.status)&&order.deadline>minute){
        const owner=order.parties?.[1]??order.owner,quantity=order.quantity-(order.fulfilled??0),location=order.location??s.npcs?.[owner]?.location;
        if(!ownerCanHire(e,s,owner))continue;
        const missing=quantity-employmentStock({get:(...p)=>p.slice(1).reduce((o,k)=>o?.[k],s)},e,owner,order.subject);
        for(const r of recipeFor(e,s,owner,order.subject))add({owner,location,recipe:r.id,item:r.output.item,quantity:missing,source:order.id,reason:'订单缺货',deadline:order.deadline});
    }
    for(const shop of currentShops(e,s))for(const stock of shop.restock){
        const missing=stock.maximum-(s.npcs[shop.keeper]?.inventory?.[stock.item]?.quantity??s.npcs[shop.keeper]?.inventory?.[stock.item]??0);
        if(missing<=0)continue;
        const recipes=recipeFor(e,s,shop.keeper,stock.item),location=shop.location??personBusinessLocation(e,s,shop.keeper);
        for(const r of recipes)add({owner:shop.keeper,location,recipe:r.id,item:stock.item,quantity:missing,source:`shop:${shop.id}:${stock.item}`,reason:'店铺补货'});
        if(!recipes.length){
            const supplier=Object.keys(s.npcs).sort().find(id=>{
                if(id===shop.keeper)return false;
                const held=s.npcs[id].inventory?.[stock.item],quantity=typeof held==='number'?held:held?.quantity??0;
                return quantity>missing&&placeSettlement(e,s,s.npcs[id].location).value===shop.settlement&&personBusiness(e,s,id)?.open.value&&standing(e,s,id,shop.keeper)>-40;
            });
            if(supplier)add({owner:shop.keeper,location,task:'店铺补货',supplier,item:stock.item,quantity:missing,source:`shop:${shop.id}:${stock.item}`,reason:'店铺补货'});
        }
    }
    for(const [location,asset]of Object.entries(s.buildings??{})){
        const owner=asset.owner;if(!ownerCanHire(e,s,owner)||asset.condition<=0)continue;
        const place=base(e,s,location);if(!place?.workstations?.length)continue;
        for(const r of e.world.recipes){
            if(r.location&&r.location!==location||!r.workstation||!place.workstations.some(st=>st.kind===r.workstation&&(st.access==='public'||st.owner===owner)))continue;
            if(!r.teachers?.includes(owner)&&!s.npcs[owner]?.recipes?.[r.id]&&!currentWorkstationRecipes(e,s,owner).some(p=>p.id===r.id))continue;
            if(recipeFor(e,s,owner,r.output.item).some(p=>p.id===r.id)&&employmentStock({get:(...p)=>p.slice(1).reduce((o,k)=>o?.[k],s)},e,owner,r.output.item)===0)add({owner,location,recipe:r.id,item:r.output.item,quantity:r.output.quantity,source:`workshop:${location}:${r.id}`,reason:'工坊成品缺货'});
        }
    }
    for(const place of e.world.locations)for(const mineral of place.minerals??e.rules.extraction?.mining?.locations?.[place.id]??[]){
        const owner=mineral.owner??s.buildings?.[place.id]?.owner??place.owner;
        const remaining=s.records?.[`mineral:${place.id}:${mineral.item}`]?.reserve??mineral.reserve;
        if(remaining>0)add({owner,location:place.id,task:'矿脉开采',item:mineral.item,quantity:remaining,source:`mining:${place.id}:${mineral.item}`,reason:'矿脉用工'});
    }
    for(const p of Object.values(s.projects??{}))if(['工程','建房'].includes(p.type)&&p.status==='施工中'&&!p.public&&p.creator!=='player'){
        add({owner:p.creator??p.owner,location:p.location??p.settlement,task:'工程施工',project:p.id,quantity:p.remainingWork??p.remainingDays,source:p.id,reason:'工程缺工',deadline:minute+Math.max(2,p.remainingDays??7)*DAY});
    }
    // RW-06: an NPC clinic whose patients could not be scheduled recruits a doctor
    // when a skilled resident exists, otherwise a helper; the need is read from delays.
    for(const site of medicineSites(e,s)){
        if(!site.owner||!s.npcs?.[site.owner]||!rows(s).some(r=>r.category==='medicine_delay'&&r.clinic===site.id&&/排期/.test(r.reason)&&minute-r.minute<7*DAY))continue;
        add({owner:site.owner,location:site.seat,task:'医师诊疗',medicalSkill:1,quantity:1,source:`clinic:${site.seat}:doctor`,reason:'医馆排期不足'});
        if(!site.assistants.length)add({owner:site.owner,location:site.seat,task:'药童',quantity:1,source:`clinic:${site.seat}:helper`,reason:'医馆排期不足'});
    }
    const day=Math.floor(minute/DAY)%360,crop=e.rules.agriculture?.crop;
    for(const p of e.rules.agriculture?.settlements??[]){
        const farm=s.records?.[`agriculture:${p.settlement}`];if(farm?.mode!=='managed')continue;
        const harvest=farm.field.cohorts.some(c=>c.ready),sow=crop&&day>=crop.sowDays[0]&&day<=crop.sowDays[1]&&farm.field.seedBank>0&&farm.field.cohorts.reduce((n,c)=>n+c.areaUnits,0)<p.areaUnits&&!(farm.field.sownYear===Math.floor(minute/(360*DAY))&&farm.field.sownUnits>=p.areaUnits);
        if(!harvest&&!sow)continue;
        const current=agriculturalWorkforce(e,s,p,farm,Math.floor(minute/DAY)).fieldMinutes/480;
        const work=harvest?farm.field.cohorts.filter(c=>c.ready).reduce((n,c)=>n+c.areaUnits-c.harvestedUnits,0):Math.max(0,p.areaUnits-farm.field.cohorts.reduce((n,c)=>n+c.areaUnits,0));
        const required=Math.min(p.farmWorkers,farm.tools.capacity,Math.ceil(work/Math.max(1,p.areaPerWorkerDay*farm.tools.condition/100))),vacancies=Math.ceil(Math.max(0,required-current));
        if(!vacancies)continue;
        // Current farming households employ for their share of the common field.
        const farmers=[...new Set((e.world.households??[]).filter(h=>h.settlement===p.settlement).flatMap(h=>h.members).filter(id=>able(s,id)&&/农|耕|佃/.test(s.npcs[id]?.occupation??base(e,s,id)?.occupation??'')))].sort();
        for(const owner of farmers.slice(0,vacancies))add({owner,location:p.fieldLocation,task:harvest?'农忙收割':'农忙播种',farm:p.settlement,quantity:p.areaUnits,source:`farm:${p.settlement}:${owner}`,reason:harvest?'作物已熟':'当季播种'});
    }
    return out.sort((a,b)=>a.id.localeCompare(b.id));
}
function personBusinessLocation(e,s,id){return s.npcs[id]?.workplace?.location??base(e,s,id)?.workplace?.location??s.npcs[id]?.location;}

export function laborApplication(e,s,id,offer,{minute=s.minute,changing=false,seed='labor',decisionKey=offer.id,document=null}={}){
    const n=s.npcs[id],b=base(e,s,id);
    if(!s.npcs[offer.owner]&&groupRepresentative(e,s,offer.owner)===id)return null;
    if(!able(s,id)||id===offer.owner||id===offer.supplier||personConstraint(e,s,id,minute)||n.levy||n.caring||n.scheduleTravel||n.cognitionTravel||s.player.companions?.includes(id)||personOffices(e,s,id).length||(personAge(e,s,id)?.value??0)<18)return null;
    const old=currentEmployment(s,id,minute);
    if(old&&!changing)return null;
    if(old&&old.owner===offer.owner)return null;
    if(offer.medicalSkill&&medicalSkill(e,s,id)<offer.medicalSkill)return null;
    if(offer.task==='矿脉开采'&&!e.quantity({get:(...p)=>p.slice(1).reduce((o,k)=>o?.[k],s)},id,e.rules.extraction.mining.tool))return null;
    const skill=offer.recipe?workerSkill(e,s,id,e.byId.get(offer.recipe)):0,r=offer.recipe&&e.byId.get(offer.recipe);
    const knows=r&&(r.teachers?.includes(id)||n.recipes?.[r.id]||!r.learningRequired||currentWorkstationRecipes(e,s,id).some(p=>p.id===r.id));
    if(r&&(!knows||skill<(r.minimumProficiency??0)))return null;
    const regard=standing(e,s,id,offer.owner);if(regard<=-40)return null;
    const needs=npcNeedGoals(s,id).filter(g=>g.progress!==100&&/money|food|钱|款|粮|口粮|活计/.test(`${g.need??g.kind??''} ${g.content??''}`));
    const low=(b?.wealth?.cashRange?.[0]??b?.coins??wage(e,s,id,id));
    const settlement=personHousehold(e,s,id).value?.settlement??placeSettlement(e,s,n.location).value;
    if(settlement!==placeSettlement(e,s,offer.location).value)return null;
    let travel=0,travelCost=0;
    if(n.location!==offer.location){try{const route=e.route(n.location,offer.location,'walk',minute,seed);travel=route.minutes;travelCost=(route.cost??0)*2;if(travelCost>(n.coins??0))return null;}catch{return null;}}
    if(travel>60||!Number.isFinite(travel)||minute+travel>Math.floor(minute/DAY)*DAY+480&&minute%DAY<480)return null;
    const source=document??{state:s,randomSeed:seed},d={document:source,get:(...p)=>p.reduce((o,k)=>o?.[k],source)};
    const budget=householdLaborBudget(d,e,id,{minute,wage:offer.wage,workMinutes:offer.workMinutes??480,commuteMinutes:travel,travelCost,outsideWage:Math.max(wage(e,s,id,id),old?.wage??0),meals:offer.meals??[],employer:offer.owner,decisionKey});
    if(!budget.feasible)return null;
    if(old&&old.status!=='罢工'){
        const previous=householdLaborBudget(d,e,id,{minute,wage:old.wage,workMinutes:old.workMinutes??480,commuteMinutes:old.commuteMinutes??0,meals:old.meals??[],employer:old.owner,decisionKey:`${old.id}:retained`});
        if(budget.cash+budget.foodValue<=(previous.cash+previous.foodValue)*WAGE_HURDLE)return null;
    }
    if(!needs.length&&(n.coins??0)>=low/2&&!budget.foodMissing&&!changing)return null;
    // Candidate feasibility and signed exclusivity are never randomized.
    const today=Math.floor(minute/DAY)*DAY+480,first=today>minute?today:today+DAY;
    try{e.assertNpcObligationAction(d,[id],{start:first,minutes:540,kind:'employment'});}catch{return null;}
    return {worker:id,need:needs.map(g=>g.id),skill,regard,travel,budget,score:needs.length*100+(budget.foodMissing?80:0)+skill/30+regard+budget.net};
}
// G0 §1: a hire (or a move to a better paid employer) is the worker's own decision, made through npcDecision on the
// worker's own subjective view; nothing a caller or the employer writes can stand in for it. The view is taken at the
// person's waking hours of that day (10:00, not asleep at the midnight settlement), the request being the real wage for the real commute.
function workerView(d,e,worker,at){
    const day=Math.floor(at/DAY)*DAY,s=d.get('state'),n=s.npcs[worker];
    return subjectiveView(e,{...d.document,state:{...s,minute:day+600,npcs:{...s.npcs,[worker]:{...n,activity:'日常起居',status:n.status??'正常'}}}},worker);
}
function hireDecision(d,e,app,offer,at,old){
    const budget=app.budget;
    const decision=npcDecision(workerView(d,e,app.worker,at),{kind:'employment',from:offer.owner,cost:{value:budget.reservation+Math.max(0,-budget.noiseValue)},reward:budget.cash+budget.foodValue+Math.max(0,budget.noiseValue),needSatisfaction:app.need.length?100:0,tags:old?['quit_job']:[]});
    decision.labor=budget;
    return decision;
}
// 05 §5.1: a worker whose signed wage has fallen clearly behind the local derived wage (market drift, never the caller)
// decides for himself whether to quit; the decision and the wages are recorded on the contract.
function lowWageQuit(d,e,row,at){
    const s=d.get('state');
    if(!employmentActive(row,s)||row.education||row.domainSteward||row.status==='罢工'||at>=row.deadline)return false;
    const local=wage(e,s,row.worker,row.worker);
    if(!(row.wage*WAGE_HURDLE<local))return false;
    const decision=npcDecision(workerView(d,e,row.worker,at),{kind:'employment',from:row.owner,cost:{minutes:0},reward:local-row.wage,needSatisfaction:0,tags:['quit_job']});
    if(decision.outcome!=='agree')return false;
    writeJob(d,e,{...row,status:'已辞工',endedAt:at,reason:'工钱明显低于当地工价，主动辞工',quit:{by:row.worker,via:'npc-decision',outcome:decision.outcome,wage:row.wage,local,minute:at}});
    financeEvent(d,e,{id:`${row.id}:quit-low-wage`,actor:row.worker,target:row.owner,minute:at,location:row.location,tags:['employment','wage_low_quit']});
    return true;
}
// A shop keeper backs the wages of a new hand from his counter first (his own decision, from his own purse); a keeper who
// cannot or will not leaves the hand unhired. Owners that keep no shop pay from their own funds as before.
function backWages(d,e,offer,at){
    const s=d.get('state'),shop=s.npcs?.[offer.owner]?shopOfKeeper(e,offer.owner,s):null;
    if(!shop||!booksOpen(d))return true;
    const target=offer.wage*Math.min(7,shop.cycleDays);
    if(counterCash(d,offer.owner)<target)fundCounter(d,e,{shop,minute:at,target,eventId:`labor:${offer.id}:${at}:wages`});
    return counterCash(d,offer.owner)>=offer.wage;
}
function sign(d,e,offer,app,at,source,decision=null){
    const old=currentEmployment(d.get('state'),app.worker,at);
    if(old){changeLegacyHoldings(d,e,{holder:old.worker,source:`contract:${old.id}`,eventId:source},()=>holdingSet(d,null,rec(old.id),{...old,status:'已辞工',endedAt:at,reason:'转赴新雇主',successor:`workshop:${source}`},'labor-market'));refundGuarantee(d,e,d.get(...rec(old.id)));}
    const starts=Math.floor(at/DAY)*DAY+480,first=starts>at?starts:starts+DAY,key=`workshop:${source}`;
    const terms={owner:offer.owner,worker:app.worker,recipe:offer.recipe??null,task:offer.task??'受雇工坊生产',location:offer.location,wage:offer.wage,workMinutes:offer.workMinutes??480,deadline:offer.deadline,...(offer.meals?.length?{meals:structuredClone(offer.meals)}:{})};
    const row={category:'contract',kind:'workshop',laborMarket:1,id:key,...terms,parties:[app.worker,offer.owner],signedTerms:structuredClone(terms),
        offer:offer.id,demandSource:offer.source,item:offer.item??null,targetQuantity:offer.quantity,project:offer.project??null,farm:offer.farm??null,supplier:offer.supplier??null,reason:offer.reason,
        starts:first,nextWork:first+540,createdAt:at,status:'有效',paid:0,produced:0,workedMinutes:0,attendance:{},shifts:[],source,commuteMinutes:app.travel,
        ...(decision?{workerConsent:{by:app.worker,via:'npc-decision',outcome:decision.outcome,minute:at}}:{}),
        settlement:personHousehold(e,d.get('state'),app.worker).value?.settlement??placeSettlement(e,d.get('state'),offer.location).value};
    holdingSet(d,null,rec(key),row,'labor-market');
    financeEvent(d,e,{id:`${source}:sign`,actor:app.worker,target:offer.owner,location:offer.location,minute:at,tags:['employment','hired']});
    return row;
}
function conflict(d,e,row,start){
    const s=d.get('state'),n=s.npcs[row.worker];
    const otherOffice=personOffices(e,s,row.worker).some(o=>!(row.domainSteward&&o.value.category==='housing_steward'&&o.value.employment===row.id));
    if(!able(s,row.worker)||personConstraint(e,s,row.worker,start)||n.levy||n.caring||n.scheduleTravel||n.cognitionTravel||otherOffice||s.player.companions?.includes(row.worker))return '工人受现有义务或健康限制';
    if(standing(e,s,row.worker,row.owner)<=-40)return '工人拒绝敌对雇主';
    if(row.domainSteward&&!currentDomains(e,s,row.owner).some(id=>containsDomain(e,s,id,row.settlement)))return '领地授权已失效';
    if(!row.domainSteward&&!ownerCanHire(e,s,row.owner))return '雇主不能履约';
    const finish=start+540;
    for(const p of Object.values(s.projects??{}))if(p.status==='施工中'&&p.public?.workers?.includes(row.worker))return '已有公款工程排班';
    const time=householdWorkTime(e,s,row.worker,start,{commuteMinutes:row.commuteMinutes??0,workMinutes:row.workMinutes??480}),day=Math.floor(start/DAY)*DAY;
    try{
        // Household reservations already remove their real windows. Check the
        // remaining work, so a short care appointment cannot erase a whole shift.
        for(const window of time.work)e.assertNpcObligationAction(d,[row.worker],{start:day+window.start,minutes:window.end-window.start,kind:'employment'});
        e.assertNpcAutonomyAction(s,[row.worker],{start,minutes:540});
    }catch(error){return error.message;}
    if(occupied({...s,records:Object.fromEntries(Object.entries(s.records).filter(([id])=>id!==row.id))},row.worker,start,finish))return '已有雇佣排班';
    return null;
}
// The wage is earned only for completed work; a shortfall becomes an L1 debt.
export function settleEmploymentPay(d,e,row,at,minutes,{earnedOverride}={}){

    row=contractTerms(row,at);
    if(!Number.isSafeInteger(minutes)||minutes<0||!Number.isSafeInteger(row.wage)||row.wage<0)throw preconditionFailure('工资与实际工时须为非负整数');
    const key=`employment_pay:${row.id}:${at}`,previous=d.get(...rec(key));
    if(previous){if(previous.minutes!==minutes||previous.wage!==row.wage)throw preconditionFailure('同次工时结算事实不一致');return previous.result;}
    const current=d.get(...rec(row.id))??row,units=current.wageUnits??0,total=units+row.wage*minutes;
    if(!Number.isSafeInteger(total))throw Error('累计工钱超出整数范围');
    // A business that keeps a counter pays from it and from nothing else: what the counter cannot cover is wage debt,
    // however much the owner carries personally. Owners without a counter pay from their own funds as before.
    const counter=dedicatedCoinAccount(d.get('state'),row.owner,'counter');
    const earned=Math.ceil(total/480)-Math.ceil(units/480),available=counter?counterCash(d,row.owner):financeBalance(d,e,row.owner),cash=Math.min(earned,available),eventId=`${row.id}:${at}`;
    if(cash&&counter)payFromCounter(d,e,{owner:row.owner,to:row.worker,amount:cash,writer:'labor-market',eventId});
    else if(cash)financeTransfer(d,e,row.owner,row.worker,cash,eventId);
    const guaranteed=Math.min(earned-cash,row.escrow??0);
    if(guaranteed){financeChange(d,e,row.worker,guaranteed,eventId,{account:escrowAccount(row.id),writer:'labor-market',eventId});writeJob(d,e,{...d.get(...rec(row.id)),escrow:row.escrow-guaranteed});}
    const paid=cash+guaranteed;
    if(paid<earned){const id=`debt_wage:${row.id}:${at}`;registerEarnedClaim(d,e,{id,kind:'wage',debtor:row.owner,creditor:row.worker,amount:earned,paid,
        createdAt:at,deadline:at+DAY,location:row.location,source:row.source,contract:row.id});}
    writeJob(d,e,{...d.get(...rec(row.id)),wageUnits:total});
    const result={earned,paid,arrears:earned-paid};
    holdingSet(d,e,rec(key),{id:key,category:'employment_pay',contract:row.id,minutes,wage:row.wage,result},'labor-market');
    return result;
}
// A working day with no minute really spent at the job is the worker's absence: a breach on the contract, not a silent skip.
// Exported so every employment path records it the same way.
export function withAbsenceBreach(row,{at,start}){
    const day=Math.floor(start/DAY);
    if(row.breaches?.some(b=>b.kind==='缺勤'&&b.day===day))return row;
    return {...row,breaches:[...(row.breaches??[]),{kind:'缺勤',by:row.worker,day,minute:at,reason:'当日没有实际到岗分钟',source:row.source}].slice(-60)};
}
function settleShift(d,e,row,at){
    const start=at-540,s=d.get('state');
    if(base(e,s,row.worker)?.schedule?.restDays?.includes(e.calendar(start).day)){writeJob(d,e,{...row,nextWork:at+DAY});return null;}
    let production=null,minutes=row.attendance?.[String(Math.floor(start/DAY))]??0,quantity=0;
    if(!minutes){writeJob(d,e,{...withAbsenceBreach(row,{at,start}),nextWork:at+DAY,reason:'没有实际到岗工时'});return null;}
    let needed=row.targetQuantity-row.produced;
    if(row.demandSource?.startsWith('shop:')){
        const shelf=currentShops(e,s).find(shop=>shop.keeper===row.owner)?.restock.find(stock=>stock.item===row.item);
        needed=Math.min(needed,Math.max(0,(shelf?.maximum??0)-employmentStock(d,e,row.owner,row.item)));
    }else if(row.item&&s.records?.[row.demandSource]){
        const order=s.records[row.demandSource];
        needed=['待履行','履行中','有效'].includes(order.status)?Math.min(needed,Math.max(0,order.quantity-(order.fulfilled??0)-employmentStock(d,e,row.owner,row.item))):0;
    }
    if((row.recipe||row.supplier)&&needed<=0){writeJob(d,e,{...row,status:'已完成',endedAt:at,reason:'经营缺口已消失'});return null;}
    if(row.task==='矿脉开采'){
        const mined=mineEmployment(d,e,row,at,minutes);
        if(!mined){writeJob(d,e,{...row,nextWork:at+DAY,reason:'没有实际采矿工时或矿工不能作业'});return null;}
        production=mined;quantity=mined.obtained.reduce((n,r)=>n+r.quantity,0);minutes=mined.minutesSpent;
    }else if(row.recipe){
        const recipe=e.byId.get(row.recipe),maximum=Math.ceil(needed/recipe.output.quantity);
        if(maximum<=0){writeJob(d,e,{...row,status:'已完成',endedAt:at});return null;}
        const plan=employmentProductionPlan(d,e,row,{maximum,minutes});
        if(plan.reason){writeJob(d,e,{...row,nextWork:at+DAY,status:'罢工',reason:plan.reason});return null;}
        minutes=Math.min(minutes,Math.ceil(plan.batches*recipe.minutes/(1+plan.skill/3000)));
        production=settleEmploymentProduction(d,e,row,at,plan);quantity=production.quantity;
    }else if(row.supplier){
        const supplier=d.get('state','npcs',row.supplier),business=personBusiness(e,s,row.supplier);
        let trip;
        try{trip=supplier?.location===row.location?0:e.route(row.location,supplier?.location,'walk',start,d.document.randomSeed).minutes*2;}catch{trip=Infinity;}
        const price=marketQuote(d,e,{item:row.item,location:supplier?.location,seller:row.supplier,buyer:row.owner}).listPrice;
        // S1c: 供货人的库存与雇主现款读账户。
        const stock=supplier?bagStock(d,e,{point:'labor.stock',id:row.supplier,item:row.item,legacy:()=>{const held=supplier.inventory?.[row.item];return typeof held==='number'?held:held?.quantity??0;}}):0;
        quantity=Math.min(needed,stock,Math.floor((minutes-trip)/5),price?Math.floor(coinRead(d,{point:'labor.cash',account:partyAccount(e,d.get('state'),row.owner),legacy:()=>financeBalance(d,e,row.owner)})/price):0);
        if(!business?.open.value||quantity<=0||!Number.isFinite(trip)||trip>120){writeJob(d,e,{...row,status:'罢工',nextWork:at+DAY,reason:'补货来源或实际路程不可用'});return null;}
        minutes=trip+quantity*5;const cost=marketQuote(d,e,{item:row.item,location:supplier.location,seller:row.supplier,buyer:row.owner,quantity}).totalCoins;
        financeTransfer(d,e,row.owner,row.supplier,cost,`${row.id}:${at}:stock`);transferItems(d,e,row.supplier,row.owner,row.item,quantity);
        production={supplier:row.supplier,item:row.item,quantity,cost,travelMinutes:trip};
    }else if(row.project){
        const p=d.get('state','projects',row.project);
        if(p?.status!=='施工中'){writeJob(d,e,{...row,status:'已完成',endedAt:at});return null;}
        quantity=Math.min(minutes/480,p.remainingWork??p.remainingDays);minutes=Math.ceil(quantity*480);
        const remainingWork=Math.max(0,(p.remainingWork??p.remainingDays)-quantity);
        d.set(['state','projects',p.id],{...p,laborMarket:1,remainingWork,remainingDays:Math.ceil(remainingWork),laborMinutes:(p.laborMinutes??0)+minutes});
    }else if(row.farm){
        const p=e.rules.agriculture.settlements.find(p=>p.settlement===row.farm),farm=d.get('state','records',`agriculture:${row.farm}`),day=Math.floor(start/DAY)%360,c=e.rules.agriculture.crop;
        if(!p||!farm||!farm.field.cohorts.some(c=>c.ready)&&!(day>=c.sowDays[0]&&day<=c.sowDays[1]&&farm.field.seedBank>0)){
            writeJob(d,e,{...row,status:'已完成',endedAt:at});return null;
        }
    }
    const pay=settleEmploymentPay(d,e,row,at,minutes);
    const meals=[];
    for(const meal of row.meals??[]){
        if(!(e.byId.get(meal.item)?.nutrition?.satiety>0)||!Number.isSafeInteger(meal.quantity)||meal.quantity<=0)continue;
        const stock=employmentStock(d,e,row.owner,meal.item),quantity=Math.min(stock,Math.floor(meal.quantity*minutes/480));
        if(quantity>0){transferItems(d,e,row.owner,row.worker,meal.item,quantity);meals.push({item:meal.item,quantity});}
    }
    const current=d.get(...rec(row.id)),done=(row.recipe||row.supplier)&&row.produced+quantity>=row.targetQuantity;
    const shift={minute:at,start,minutes,...pay,...(meals.length?{meals}:{}),...(production?{production}:{})};
    writeJob(d,e,{...current,nextWork:at+DAY,paid:row.paid+pay.paid,produced:row.produced+quantity,workedMinutes:row.workedMinutes+minutes,
        status:pay.arrears?'罢工':done?'已完成':'有效',...(pay.arrears?{stoppedAt:at,reason:'欠薪停工'}:{}),...(done&&!pay.arrears?{endedAt:at}:{}),shifts:[...row.shifts,shift]});
    if(row.domainSteward&&!pay.arrears)settleStewardRequests(d,e,d.get(...rec(row.id)),`${row.id}:${at}`);
    financeEvent(d,e,{id:`${row.id}:${at}`,actor:row.worker,target:row.owner,location:row.location,minute:at,value:pay.paid,tags:['employment',pay.arrears?'wage_arrears':'wage']});
    return shift;
}
export function settleArrears(d,e,row,minute){

    const debts=outstanding(d.get('state'),row.id);if(!debts.length)return false;
    const earliest=Math.min(...debts.map(r=>r.createdAt));
    for(const debt of debts)if(claimDue(e,d.get('state'),debt.id,minute)?.overdueCount&&!debt.defaulted&&claimLimitation(d.get('state'),debt.id,minute).enforceable){
        const due=dueObligation(d.get('state'),debt.id,minute).owed;
        const legalCase=registerCreditDefault(d,e,{debt:debt.id,row:debt,value:due,minute});
        holdingSet(d,null,rec(debt.id),{...debt,status:'逾期',defaulted:{case:legalCase,minute,remaining:due}},'labor-market');
        const event=creditBreachEvent(debt.id,d.get(...rec(debt.id)),d.get('state','location'));
        publishTransitionEvent(d,e,{id:event.key,...event});
    }
    if(minute>=earliest+2*DAY&&employmentActive(row)){
        writeJob(d,e,{...row,status:'已辞工',endedAt:earliest+2*DAY,reason:'欠薪投诉后离职'});
        financeEvent(d,e,{id:`${row.id}:quit`,actor:row.worker,target:row.owner,minute:earliest+2*DAY,location:row.location,tags:['employment','wage_complaint']});
    }
    return true;
}
function refundGuarantee(d,e,row){if(row.escrow>0){financeChange(d,e,'player',row.escrow,`${row.id}:refund`,{account:escrowAccount(row.id),writer:'labor-market'});writeJob(d,e,{...row,escrow:0});}}
export function advanceLaborMarket(d,e,{before,after,id,beforeState}){

    const contracts=recordsWhere(d.get('state','records'),'kind','workshop').filter(r=>r.laborMarket===1);
    if(!contracts.length&&Math.floor(before/DAY)===Math.floor(after/DAY))return;
    const plan=e.advanceLayerContext??advanceLayerPlan(e,d.get('state'));
    for(const initial of contracts){
        let row=contractTerms(d.get(...rec(initial.id)),after);
        if(!employmentActive(row)){settleArrears(d,e,row,after);refundGuarantee(d,e,d.get(...rec(row.id)));continue;}
        if(row.domainSteward){const reason=conflict(d,e,row,Math.max(before,row.starts));if(reason){writeJob(d,e,{...row,status:'罢工',reason,nextWork:Math.max(row.nextWork,Math.floor(after/DAY)*DAY+1020)});continue;}}
        if(row.status==='罢工'&&!outstanding(d.get('state'),row.id).length&&!conflict(d,e,row,Math.max(before,row.starts))&&(!row.recipe||!employmentProductionPlan(d,e,row).reason)){
            row={...row,status:'有效',reason:null};writeJob(d,e,row);
        }
        const statistical=layer(e,d.get('state'),row.location,plan)==='statistics';
        // Attendance is measured on each actual interval. Remote people use the
        // same daily hours, without inserting individual movement boundaries.
        for(let day=Math.floor(before/DAY);statistical&&day<=Math.floor(after/DAY);day++){
            const start=day*DAY+480;
            if(start<row.starts||start>=row.deadline||row.status==='罢工'||conflict(d,e,row,Math.max(before,start)))continue;
            if(base(e,d.get('state'),row.worker)?.schedule?.restDays?.includes(e.calendar(start).day))continue;
            const time=householdWorkTime(e,d.get('state'),row.worker,start,{commuteMinutes:row.commuteMinutes??0,workMinutes:row.workMinutes??480});
            for(const window of time.work)recordEmploymentAttendance(d,row.worker,Math.max(before,day*DAY+window.start),Math.min(after,day*DAY+window.end),row.location);
        }
        row=contractTerms(d.get(...rec(row.id)),after);
        if(statistical&&Math.floor(before/(7*DAY))===Math.floor(after/(7*DAY))&&after<row.deadline)continue;
        const shifts=[];
        for(let at=row.nextWork;at<=after&&at<row.deadline;at+=DAY){
            row=contractTerms(d.get(...rec(row.id)),after);if(!employmentActive(row))break;
            if(settleArrears(d,e,row,at))continue;
            const shift=settleShift(d,e,row,at);if(shift)shifts.push(shift);
        }
        row=d.get(...rec(initial.id));settleArrears(d,e,row,after);row=d.get(...rec(initial.id));
        if(statistical&&shifts.length){
            const minutes=shifts.reduce((n,s)=>n+s.minutes,0),paid=shifts.reduce((n,s)=>n+s.paid,0),earned=shifts.reduce((n,s)=>n+s.earned,0);
            writeJob(d,e,{...row,shifts:[...row.shifts.slice(0,-shifts.length),{start:shifts[0].start,minute:shifts.at(-1).minute,minutes,paid,earned,arrears:earned-paid,days:shifts.length,aggregate:true}],aggregateMinutes:(row.aggregateMinutes??0)+minutes});
        }
        row=d.get(...rec(initial.id));if(after>=contractTerms(row,after).deadline&&employmentActive(row))writeJob(d,e,{...row,status:'已到期',endedAt:contractTerms(row,after).deadline});
        row=d.get(...rec(initial.id));if(!employmentActive(row))refundGuarantee(d,e,row);
    }
    if(Math.floor(before/DAY)===Math.floor(after/DAY))return;
    for(const initial of contracts)lowWageQuit(d,e,contractTerms(d.get(...rec(initial.id)),after),after);
    const offers=laborOffers(e,d.get('state'),after),pools=new Map();
    if(!offers.length)return;
    for(const worker of Object.keys(d.get('state','npcs'))){
        const s=d.get('state'),n=s.npcs[worker];if(!able(s,worker)||n.levy||n.caring)continue;
        const sid=personHousehold(e,s,worker).value?.settlement??placeSettlement(e,s,n.location).value;
        const pool=pools.get(sid)??[];pool.push(worker);pools.set(sid,pool);
    }
    for(const offer of offers){
        if(layer(e,d.get('state'),offer.location,plan)==='statistics'&&Math.floor(before/(7*DAY))===Math.floor(after/(7*DAY)))continue;
        const s=d.get('state'),pool=pools.get(placeSettlement(e,s,offer.location).value)??[];
        const apps=pool.map(worker=>laborApplication(e,s,worker,offer,{minute:after,changing:Boolean(currentEmployment(s,worker,after)),seed:d.document.randomSeed,document:d.document})).filter(Boolean).sort((a,b)=>b.score-a.score||a.worker.localeCompare(b.worker));
        for(const app of apps){
            const old=currentEmployment(d.get('state'),app.worker,after),trial={...offer,worker:app.worker,id:old?.id};if(conflict(d,e,trial,Math.floor(after/DAY)*DAY+480))continue;
            const decision=hireDecision(d,e,app,offer,after,old);
            if(decision.outcome!=='agree'||!backWages(d,e,offer,after))continue;
            sign(d,e,offer,app,after,`labor:${offer.id}:${after}`,decision);break;
        }
    }
}
export function nextLaborMinute(e,d,now){

    const contracts=recordsWhere(d.get('state','records'),'kind','workshop').filter(r=>r.laborMarket===1&&employmentActive(r));if(!contracts.length)return Infinity;
    let next=Infinity;const plan=e.advanceLayerContext??advanceLayerPlan(e,d.get('state'));
    for(const r of contracts){
        const at=layer(e,d.get('state'),r.location,plan)==='statistics'?(Math.floor(now/(7*DAY))+1)*7*DAY:r.nextWork;
        if(at>now)next=Math.min(next,at,r.deadline>now?r.deadline:Infinity);
    }
    return next;
}
export function laborNotices(e,s,location=s.location){
    const sid=placeSettlement(e,s,location).value;
    return laborOffers(e,s).filter(o=>placeSettlement(e,s,o.location).value===sid).map(o=>({...o,content:`${groupView(e,s,o.owner)?.organization.value.name??personName(e,s,o.owner).value??o.owner}招工：${o.reason}，日薪${o.wage}铜；${o.task??base(e,s,o.recipe)?.name??'生产'}。`}));
}
export function laborTrade(d,e,args,id){
    const s=d.get('state'),now=s.minute;
    if(args.operation==='labor_inspect')return {notices:laborNotices(e,s),contracts:rows(s).filter(r=>r.laborMarket===1&&placeSettlement(e,s,r.location).value===placeSettlement(e,s,s.location).value)};
    const row=s.records?.[args.contract];if(row?.laborMarket!==1&&row?.education!==1||row.kind!=='workshop')throw preconditionFailure('需要已有的NPC雇佣合同');
    if(row.location!==s.location)throw preconditionFailure('须到履约地点介入合同');
    if(args.operation==='labor_guarantee'){
        if(!employmentActive(row))throw preconditionFailure('雇佣已结束');
        const coins=financeInt(args.coins,1,1e6,'担保款');financeChange(d,e,'player',-coins,id,{account:escrowAccount(row.id),writer:'labor-market',eventId:id});
        writeJob(d,e,{...row,guarantor:'player',escrow:(row.escrow??0)+coins});return {contract:row.id,escrow:(row.escrow??0)+coins};
    }
    if(args.consent!==true||s.npcs[row.worker]?.location!==s.location||!able(s,row.worker)||/睡眠|睡觉|熟睡/.test(s.npcs[row.worker]?.activity??'')||personConstraint(e,s,row.worker))throw preconditionFailure('须由清醒在场的雇工同意');
    if(args.operation==='labor_mediate'){
        const representative=s.npcs[row.owner]?row.owner:groupRepresentative(e,s,row.owner);
        if(!representative||representative!=='player'&&(s.npcs[representative]?.location!==s.location||!able(s,representative))||personConstraint(e,s,representative))throw preconditionFailure('须由当前雇主或代表在场同意');
        const debts=outstanding(s,row.id),due=debts.reduce((n,r)=>n+r.amount-r.paid,0);
        if(financeBalance(d,e,row.owner)+(row.escrow??0)<due)throw preconditionFailure('现有款项不足以清偿欠薪');
        let escrow=row.escrow??0;
        for(const debt of debts){const amount=dueObligation(d.get('state'),debt.id).owed,cash=Math.min(amount,financeBalance(d,e,row.owner));
            if(cash)settleClaim(d,e,{id:debt.id,payer:row.owner,amount:cash},`${id}:${debt.id}:cash`);
            if(amount>cash){const guaranteed=amount-cash;financeChange(d,e,'player',guaranteed,id,{account:escrowAccount(row.id),writer:'labor-market',eventId:id});escrow-=guaranteed;
                settleClaim(d,e,{id:debt.id,payer:'player',amount:guaranteed},`${id}:${debt.id}:guarantee`);}
            if(debt.defaulted?.case)settleCreditCase(d,e,debt.defaulted.case,id);}
        const nextWage=financeInt(args.coins??wage(e,s,row.worker,row.owner),1,1e6,'调解日薪');
        const other=currentEmployment(s,row.worker,now);
        const active=now<row.deadline&&(!other||other.id===row.id);
        writeJob(d,e,{...row,escrow,paid:row.paid+due,wage:nextWage,...(active?{status:'有效',nextWork:(Math.floor(now/DAY)+1)*DAY+1020}:{}),amendments:[...row.amendments??[],{minute:now,wage:nextWage,source:id}]});
        return {contract:row.id,paid:due,wage:nextWage};
    }
    if(args.operation==='labor_poach'){
        if(currentEmployment(s,row.worker,now)?.id!==row.id)throw preconditionFailure('原雇佣已结束或已更换，须查看当前合同');
        const offer=laborOffers(e,s,now).find(o=>o.owner===e.resolve(args.business??args.buyer)&&(!args.item||o.item===e.resolve(args.item)));
        if(!offer)throw preconditionFailure('新雇主当前没有真实用工缺口');
        if(args.coins!==undefined)offer.wage=financeInt(args.coins,offer.wage,1e6,'新日薪');
        if(financeBalance(d,e,offer.owner)<offer.wage)throw preconditionFailure('新雇主现钱不足以接受所议日薪');
        const app=laborApplication(e,s,row.worker,offer,{minute:now,changing:true,seed:d.document.randomSeed,decisionKey:`${offer.id}:${id}`,document:d.document});if(!app)throw preconditionFailure('工匠不接受新雇主或工钱');
        const rep=s.npcs[offer.owner]?offer.owner:groupRepresentative(e,s,offer.owner);
        if(!rep||s.npcs[rep]?.location!==s.location||!able(s,rep))throw preconditionFailure('新雇主或当前代表须在场同意');
        const decision=hireDecision(d,e,app,offer,now,row);if(decision.outcome!=='agree')throw preconditionFailure('工匠不接受新雇主或工钱');
        const fresh=sign(d,e,offer,app,now,id,decision);return {contract:fresh.id,previous:row.id};
    }
    throw preconditionFailure('未知用工操作');
}
