import {laborValue} from './market.mjs';
import {domainRules,privateCropYieldBase} from './domain-rules.mjs';
import {installPhase1MarketQuote} from './compat/v2-phase1-engine.mjs';
installPhase1MarketQuote(marketQuote);
import {preconditionFailure} from './precondition.mjs';
import {changeLegacyHoldings} from './transition.mjs';
import {leaseClauses,leaseState,contractTerms,snapshotContractTerms,tenancyRentAmount,installLeaseSettlement,receiveLeaseGrain} from './contract-state.mjs';
import {counterpart} from './credit.mjs';
import {requestContractConsent} from './action-consent.mjs';
import {subjectiveView} from './subjective-view.mjs';
import {currentControllers} from './action-authority.mjs';
import {obligationRows,obligationView} from './obligation-state.mjs';
import {adoptLegacyObligation,settleObligation} from './obligation-runtime.mjs';
import {settlementPresent} from './obligation-presence.mjs';
import {registerValuer,goodsWorth,stateReader} from './valuation.mjs';
import {installEventWorth} from './world-events.mjs';
import {explainDerived} from './derived.mjs';
import {toRational,fromRational} from './det-math.mjs';
import {fraction,decimalFraction,addAccrual} from './obligation-calendar.mjs';
import {workshopFund,coinRead,partyAccount,dedicatedCoinAccount,counterCash,payFromCounter} from './money.mjs';
import {financePath as rec,financeInt as int,financeBalance,financeChange,financeTransfer,financeEvent} from './finance-bank.mjs';
import {groupRepresentative,personHousehold,personOccupation,personBusiness,personConstraint,personOffices,placeSettlement,settlementGovernment} from './entity-view.mjs';
import {groupAccountView,ensureGroupAccount,groupAccountPath} from './group-account.mjs';
import {facilityView} from './facility-state.mjs';
import {placeWorkstations,stationLicence} from './workstation-services.mjs';
import {marketQuote,supplyApart,liquidationValue} from './market.mjs';
import {currencyRow,currencyTradePrice,currencyAccepted,currencyValue} from './currency.mjs';
import {regionalTradeBase} from './settlement-trade.mjs';
import {laborTrade,withAbsenceBreach} from './labor-market.mjs';
import {standing} from './standing.mjs';
import {changeItems,produceItems,heldUnit,wearItem,changePremisesItems,producePremisesItems,transferPremisesItems,transferItems} from './items.mjs';
import {store,bag,bookStock,craftInput,craftOutput,priceRead,bagStock,premisesInventory} from './stock.mjs';
import {recordCraft} from './craft-record.mjs';
import {declareLedgerWriter} from './ledger.mjs';
// S1b: 受雇制作（组织或个人库存）是 src:craft 制造守恒对：配方投入进 sink:consume，产出来自 src:craft。
declareLedgerWriter('finance-assets',{sources:{'src:craft':{'*':100000}},sinks:['sink:consume']});
import {registerCreditDefault,settleCreditCase} from './law.mjs';
import {assessTradeTax,tradeTax} from './finance-tax.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
import {rollDice} from './scheduler.mjs';
declareHoldingWriter('finance-assets',{kinds:['share','leases','employed_by']});

const DAY=1440,MONTH=30*DAY;
installLeaseSettlement({harvest:settleLeaseHarvest,finish:finishLeaseCrop});
function fieldTenancy(d,e,args,basis){
    const shareKeys=['outputBasis','rentPayment','shareNumerator','shareDenominator','rentAdvance'];
    if(!basis){if(args.rentMode&&args.rentMode!=='fixed'||[...shareKeys,'inputPayer','ownerInputNumerator','ownerInputDenominator','unharvestedCrops','farmOperator'].some(k=>args[k]!==undefined))throw preconditionFailure('产出、投入和作物条款须有登记田地');return null;}
    const choose=(key,fallback,values)=>{const v=args[key]??fallback;if(!values.includes(v))throw preconditionFailure(`无效租约条款 ${key}`);return v;};
    const rentMode=choose('rentMode','fixed',['fixed','share']),inputPayer=choose('inputPayer','tenant',['tenant','owner','shared']);
    const t={rentMode,inputPayer,unharvestedCrops:choose('unharvestedCrops','owner',['tenant','owner']),farmOperator:choose('farmOperator','tenant',['tenant','owner'])};
    if(rentMode==='fixed'&&shareKeys.some(k=>args[k]!==undefined))throw preconditionFailure('定额租不能同时使用分成租参数');
    if(inputPayer!=='shared'&&(args.ownerInputNumerator!==undefined||args.ownerInputDenominator!==undefined))throw preconditionFailure('投入分摊比例只用于 shared');
    if(inputPayer==='shared'){
        t.ownerInputDenominator=int(args.ownerInputDenominator,1,1000000,'出租人投入分母');
        t.ownerInputNumerator=int(args.ownerInputNumerator,1,t.ownerInputDenominator-1,'出租人投入分子');
    }
    if(rentMode==='share'){
        t.outputBasis=choose('outputBasis','gross',['gross','net']);t.rentPayment=choose('rentPayment','cash',['cash','kind']);
        if(t.outputBasis==='net')t.netInputs='consumed-seed';
        const customary=e.rules.agriculture.fieldRent.customaryShare;
        t.shareDenominator=int(args.shareDenominator??customary.denominator,1,1000000,'分成分母');
        t.shareNumerator=int(args.shareNumerator??customary.numerator,1,t.shareDenominator,'分成分子');
    }
    if(rentMode==='share'||inputPayer!=='tenant'){
        t.cropPrice=structuredClone(basis.quoteBasis.unitPrice);
        const quote=marketQuote(d,e,{item:basis.seedItem,location:basis.quoteBasis.location,quantity:1,base:regionalTradeBase(d,e,basis.seedItem,basis.quoteBasis.location)});
        if(!(quote.listPrice>0))throw preconditionFailure('缺依据：投入种粮没有可知报价');
        t.seedPrice=toRational(quote.listPrice);
    }
    return t;
}
function tenancyConsent(t){
    if(!t)return {};
    const {cropPrice,seedPrice,...terms}=t;
    return {...terms,...(cropPrice?{cropPriceNumerator:cropPrice.numerator,cropPriceDenominator:cropPrice.denominator,seedPriceNumerator:seedPrice.numerator,seedPriceDenominator:seedPrice.denominator}:{})};
}
function assertCropAvailable(d,subject,tenant){
    const farm=d.get(...rec(`private-farm:${subject}`));
    if(farm&&['growing','ready'].includes(farm.status)&&farm.owner!==tenant)throw preconditionFailure('本田仍有其他权利人的未收作物，须先收割或另行取得作物处分同意');
}
function tenancyRisk(d,e,party){
    const profiles=e.rules.agriculture.fieldRent.riskPreferences,traits=subjectiveView(e,d.document,party).self.traits;
    if(traits.riskAversion!==undefined)return {riskPermille:1000,source:'personality.riskAversion'};
    const total=profiles.reduce((n,p)=>n+p.weight,0),roll=rollDice(d.get('randomSeed'),'tenancy:preference',party,0,0,total);
    let cumulative=0;const profile=profiles.find(p=>(cumulative+=p.weight)>=roll);
    return {profile:profile.id,riskPermille:profile.riskPermille,roll,source:'rules.agriculture.fieldRent.riskPreferences'};
}
function signShareLease(d,e,{args,id,subject,owner,tenant,signatory,days,rentBasis,tenancy,location,need}){
    const now=d.get('state','minute'),expires=now+days*DAY,due=int(args.deadline??expires,now+1,expires,'约定交租时刻');
    if(args.coins!==undefined)throw preconditionFailure('分成租按比例结算，不能同时约定定额 coins');
    const resource=tenancy.rentPayment==='kind'?rentBasis.crop:'coin_river';
    const publicGrain=resource!=='coin_river'&&groupAccountView(e,d.get('state'),owner);
    if(publicGrain&&(!d.get('state','settlements',owner)||resource!==e.rules.agriculture?.grainItem||!e.rules.agriculture.settlements.some(p=>p.settlement===owner)))throw preconditionFailure('该集体没有登记本作物的实物粮仓，可商议现金分成租');
    if(resource!=='coin_river'&&args.deposit!==undefined)throw preconditionFailure('实物先付请用 rentAdvance，deposit 是现钱');
    if(resource==='coin_river'&&args.rentAdvance!==undefined)throw preconditionFailure('现金先付请用 deposit，rentAdvance 是作物份数');
    const paid=int(resource==='coin_river'?args.deposit??0:args.rentAdvance??0,0,1e9,'分成租先付额');
    const period=days/(e.rules.calendar.daysPerMonth*e.rules.calendar.monthsPerYear),value=rentBasis.monthlyAnchor*days/30;
    const expected=tenancyRentAmount(tenancy,Math.floor(fromRational(rentBasis.annualYield)),[{kind:'seed',quantity:rentBasis.seedBasis.annualQuantity,price:tenancy.seedPrice}])*period;
    const seedCost=rentBasis.seedBasis.annualQuantity*fromRational(tenancy.seedPrice)*period,ownerFraction=tenancy.inputPayer==='owner'?1:tenancy.inputPayer==='shared'?tenancy.ownerInputNumerator/tenancy.ownerInputDenominator:0;
    const choiceBasis=tenancyRisk(d,e,signatory),risk=(1-tenancy.shareNumerator/tenancy.shareDenominator)*choiceBasis.riskPermille/1000;
    const expectedValue=resource==='coin_river'?expected:expected*fromRational(tenancy.cropPrice),advanceValue=resource==='coin_river'?paid:paid*fromRational(tenancy.cropPrice);
    const agreement=requestContractConsent(d,e,{from:signatory,scope:'rent',subject,eventId:id,
        terms:{days,location:subject,quantity:rentBasis.areaMu,item:rentBasis.seedItem,prepayment:paid,deadline:due,...tenancyConsent(tenancy)},
        cost:tenant==='player'?{value:Math.max(0,value-expectedValue)+seedCost*ownerFraction,risk}:{value:expectedValue+seedCost*(1-ownerFraction),risk:risk*tenancy.shareNumerator/tenancy.shareDenominator},
        reward:tenant==='player'?Math.max(advanceValue,expectedValue):value/Math.max(1e-6,tenancy.shareNumerator/tenancy.shareDenominator),prepaid:paid>0});
    if(!agreement.allowed)throw preconditionFailure(`对方未同意本次分成租：${agreement.reason}`);
    if(paid){if(resource==='coin_river')financeTransfer(d,e,tenant,owner,paid,id);else if(publicGrain)receiveLeaseGrain(d,e,{owner,payer:tenant,resource,amount:paid,eventId:id});else transferItems(d,e,tenant,owner,resource,paid,null,{eventId:id});}
    const key=`asset_lease:${id}`,row={category:'contract',kind:'asset_lease',id:key,subject,owner,tenant,signatory,use:'field',
        settlement:placeSettlement(e,d.get('state'),subject).value,monthlyRent:0,paid,prepayment:paid,rentDueAt:due,rentBasis,tenancy,
        status:'有效',createdAt:now,deadline:expires,nextRent:expires,location,source:id,consentEvent:agreement.source,choiceBasis,harvests:[]};
    row.clauses=leaseClauses(row);holdingSet(d,e,rec(key),row,'finance-assets');
    return {contract:key,subject,owner,tenant,paid,rent:0,rentDueAt:due,deadline:expires,rentBasis,tenancy,consent:agreement.source,...(need?{need}:{})};
}

// Called only after agriculture has transferred a real harvested lot. The
// event/crop identity and cumulative quantity prevent repeated assessment.
function settleLeaseHarvest(d,e,{farm,eventId}){
    const actual=d.get(...rec(farm.id));
    if(!actual||actual.harvestEvent!==eventId||actual.harvestedQty!==farm.harvestedQty)throw Error('租金核验须来自已记录的真实收成');
    farm=actual;
    if(!farm.lease)return null;
    const stored=d.get(...rec(farm.lease));if(!stored)return null;
    const terms=contractTerms(stored,d.get('state','minute')),t=terms.tenancy;
    if(t?.rentMode!=='share'||farm.owner!==terms.tenant)return null;
    const harvests=stored.harvests??[],previous=harvests.filter(h=>h.seedEvent===farm.seedEvent),last=previous.at(-1);
    if(harvests.some(h=>h.eventId===eventId)||farm.harvestedQty<=(last?.harvestedQty??0))return last??null;
    const gross=farm.harvestedQty,assessed=tenancyRentAmount(t,gross,farm.inputs??[]),prior=last?.assessed??0;
    const total=(stored.shareAssessed??0)+assessed-prior,advance=terms.prepayment??0;
    const amount=Math.max(0,total-advance)-Math.max(0,(stored.shareAssessed??0)-advance),now=d.get('state','minute');
    const key=`debt_rent:${stored.id}:${eventId}`,resource=t.rentPayment==='kind'?farm.crop:'coin_river',due=Math.max(now,terms.rentDueAt??now);
    const entry={eventId,seedEvent:farm.seedEvent,harvestedQty:gross,assessed,amount,minute:now,inputs:structuredClone(farm.inputs??[]),consentEvent:stored.consentEvent};
    holdingSet(d,e,rec(stored.id),{...stored,shareAssessed:total,harvests:[...harvests,entry]},'finance-assets');
    if(amount){
        const present=!(resource!=='coin_river'&&groupAccountView(e,d.get('state'),terms.owner))&&settlementPresent(e,d.get('state'),payerAt(e,d.get('state'),terms.tenant),terms.owner);
        openClaim(d,e,key,{category:'debt',kind:'rent',debtor:terms.tenant,creditor:terms.owner,amount,paid:0,resource,status:'待偿还',createdAt:now,dueAt:due,
            deadline:due+e.rules.economy.credit.loan.defaultGraceMinutes,contract:stored.id,source:eventId,harvestEvent:eventId,location:stored.location,...(!present?{unpresented:true}:{})});
        if(now>=due&&present){
            const funds=resource==='coin_river'?financeBalance(d,e,terms.tenant):e.quantity(d,terms.tenant,resource),pay=Math.min(amount,funds);
            if(pay)settleObligation(d,e,{id:key,payer:terms.tenant,actor:terms.tenant,amount:pay},`${eventId}:rent-payment`);
        }
    }
    if(amount)financeEvent(d,e,{id:`${eventId}:rent-assessed`,verb:'obligation_opened',actor:terms.tenant,target:terms.owner,minute:now,location:farm.location,value:amount,tags:['rent','harvest']});
    finalizeShareAdvance(d,e,d.get(...rec(stored.id)),now);
    return {...entry,...(amount?{debt:key}:{}),resource};
}
function finishLeaseCrop(d,e,farm){
    if(farm.lease){const row=d.get(...rec(farm.lease));if(row)finalizeShareAdvance(d,e,row,d.get('state','minute'));}
}
function finalizeShareAdvance(d,e,row,at){
    const terms=contractTerms(row,at);if(terms.tenancy?.rentMode!=='share'||row.advanceRefund||!(row.endedAt!==undefined||at>=terms.deadline))return;
    const farm=d.get(...rec(`private-farm:${terms.subject}`));
    if(farm?.lease===row.id&&farm.owner===terms.tenant&&(farm.status==='growing'||farm.status==='ready'&&farm.yield>(farm.harvestedQty??0)))return;
    const amount=Math.max(0,(terms.prepayment??0)-(row.shareAssessed??0)),source=`${row.id}:advance-refund`;
    if(amount){
        openClaim(d,e,source,{category:'debt',kind:'rent',debtor:terms.owner,creditor:terms.tenant,amount,paid:0,resource:terms.tenancy.rentPayment==='kind'?terms.rentBasis.crop:'coin_river',
            status:'待偿还',createdAt:at,dueAt:at,deadline:at+e.rules.economy.credit.loan.defaultGraceMinutes,contract:row.id,source:`finance:${source}`,location:row.location,unpresented:true});
        financeEvent(d,e,{id:source,verb:'obligation_opened',actor:terms.owner,target:terms.tenant,minute:at,location:row.location,value:amount,tags:['rent','advance-refund']});
    }
    holdingSet(d,e,rec(row.id),{...row,advanceRefund:{amount,claim:source,source:amount?`finance:${source}`:row.endSource??row.source,minute:at}},'finance-assets');
}
function endLeaseCrop(d,e,row,at,eventId){
    const key=`private-farm:${row.subject}`,farm=d.get(...rec(key)),t=contractTerms(row,at),policy=t.tenancy?.unharvestedCrops;
    if(farm?.lease!==row.id||!['growing','ready'].includes(farm.status)||farm.leaseEndEvent)return;
    // Old signed owner clauses remain readable; a clause-free legacy row
    // cannot silently convey the tenant's crop or investment.
    const toOwner=at>=leaseClauses(row).expires&&(policy==='owner'||!policy&&t.unharvestedCrops==='到期后未收作物留田归田主');
    d.set(rec(key),{...farm,...(toOwner?{owner:t.owner}:{}),leaseEndEvent:eventId,cropDisposition:{policy:toOwner?'owner':'tenant',source:row.consentEvent??row.source,minute:at}});
    financeEvent(d,e,{id:`${eventId}:crop`,actor:t.tenant,target:toOwner?t.owner:t.tenant,minute:at,location:row.subject,tags:['lease','crop-disposition']});
}
// Field rents use the same physical crop yield as harvests/forward supply.
// The agricultural sowing calendar is annual; a 180-day crop and the single
// 5..25 sowing window allow one season, not two consecutive spring sowings.
export function fieldRentBasis(d,e,subject,{areaMu,seedItem}={}){
    const p=e.rules.agriculture?.settlements.find(p=>p.fieldLocation===subject),rule=domainRules(e).privateField,crop=e.rules.agriculture?.crop;
    if(!p||!rule||!crop)throw preconditionFailure('缺依据：田地没有可派生产量的登记农事规则');
    if(!(p.areaUnits>0&&crop.areaUnitsPerHa>0&&rule.muPerHectare>0&&crop.growthDays>0)||!crop.sowDays)throw preconditionFailure('缺依据：田地面积或生长周期不明');
    const fullArea=p.areaUnits/crop.areaUnitsPerHa*rule.muPerHectare;
    areaMu=areaMu===undefined?fullArea:int(areaMu,1,Math.floor(fullArea),'租入亩数');
    const binding=rule.crops.find(c=>c.seed===(seedItem??e.rules.agriculture.grainItem));
    if(!binding)throw preconditionFailure('缺依据：田地没有该作物的产量规则');
    if(!e.byId.get(binding.product))throw preconditionFailure('缺依据：作物产物没有登记');
    const yearDays=e.rules.calendar.daysPerMonth*e.rules.calendar.monthsPerYear;
    // Registered acreage is available once per agricultural year (sownUnits),
    // even when a shortened growth period fits several times in sowDays.
    const annualSeasons=Math.min(1,Math.floor(yearDays/crop.growthDays),1+Math.floor((crop.sowDays[1]-crop.sowDays[0])/crop.growthDays));
    const yieldSource=binding.yieldSelector==='field:wheat'?'primitiveTables.yields.field:wheat':'rules.agriculture.crop.yieldPerHa';
    const yieldBase=privateCropYieldBase(e,{areaMu,seedItem:binding.seed,crop:binding.product,qualitySum:1,qualityDays:1})*annualSeasons;
    if(!Number.isFinite(yieldBase)||yieldBase<0||!Number.isFinite(annualSeasons)||annualSeasons<=0)throw preconditionFailure('缺依据：田地产量不明');
    const annualYield=explainDerived(e,d.document,'economy:yield',subject,{base:yieldBase}).value;
    const seedQuantity=binding.yieldSelector==='field:wheat'?
        Math.ceil(areaMu*e.world.primitiveTables.yields.rows.find(r=>r.key==='field:wheat/seed').seedPerUnit.qty*rule.kgPerJin/e.byId.get(binding.seed).weight):Math.ceil(areaMu*crop.seedPerHa/rule.muPerHectare);
    const share=e.rules.agriculture.fieldRent?.customaryShare;
    if(!Number.isSafeInteger(share?.numerator)||!(share.denominator>0))throw preconditionFailure('缺依据：地方惯例份额不明');
    if(!(e.byId.get(binding.product)?.basePrice>0))throw preconditionFailure('缺依据：作物没有可知报价');
    const quote=marketQuote(d,e,{item:binding.product,location:subject,quantity:1,base:regionalTradeBase(d,e,binding.product,subject)}),price=quote.listPrice;
    if(!Number.isFinite(price)||price<=0||!Number.isFinite(annualYield)||annualYield<0)throw preconditionFailure('缺依据：作物报价或产量不明');
    const monthlyAnchor=Math.max(1,Math.ceil(annualYield*price*share.numerator/share.denominator/e.rules.calendar.monthsPerYear));
    const minute=d.get('state','minute');
    return {areaMu,seedItem:binding.seed,crop:binding.product,annualSeasons,monthlyAnchor,
        seedBasis:{annualQuantity:seedQuantity*annualSeasons,item:binding.seed,source:binding.yieldSelector==='field:wheat'?'primitiveTables.yields.field:wheat/seed':'rules.agriculture.crop.seedPerHa'},
        annualYield:toRational(annualYield),annualRevenue:toRational(annualYield*price),
        yieldBasis:{minute,source:yieldSource,subject,projection:'economy:yield',base:toRational(yieldBase)},
        quoteBasis:{minute,source:'marketQuote',location:subject,item:binding.product,unitPrice:toRational(price),
            regionalBase:toRational(quote.explanation.base),scarcity:toRational(quote.explanation.scarcity),quality:toRational(quote.explanation.quality),depth:toRational(quote.explanation.depth)},
        share:{...share},shareSource:'rules.agriculture.fieldRent.customaryShare',shareCalibration:'待标定惯例'};
}
const buildingRentAnchor=(e,use)=>e.rules.economy.rentalCopperPerWeek*4*(use==='commercial'?2:1);
// The land's return excludes the cultivator's seed/labor return. Old signing
// snapshots predate annualRevenue/share, but retain their frozen rent anchor.
const fieldMonthlyIncome=(e,basis)=>basis.annualRevenue&&basis.share?
    fromRational(basis.annualRevenue)*basis.share.numerator/basis.share.denominator/e.rules.calendar.monthsPerYear:basis.monthlyAnchor;
function leaseMonthlyIncome(e,lease){
    const t=lease.tenancy,seed=lease.rentBasis?.seedBasis?.annualQuantity??0,months=e.rules.calendar.monthsPerYear;
    const ownerFraction=t?.inputPayer==='owner'?1:t?.inputPayer==='shared'?t.ownerInputNumerator/t.ownerInputDenominator:0;
    const cost=seed*(t?.seedPrice?fromRational(t.seedPrice):0)*ownerFraction/months;
    return (t?.rentMode==='share'?tenancyRentAmount(t,Math.floor(fromRational(lease.rentBasis.annualYield)),[{kind:'seed',quantity:seed,price:t.seedPrice}])*(t.rentPayment==='kind'?fromRational(t.cropPrice):1)/months:lease.monthlyRent)-cost;
}
import {ASSET_OPERATIONS} from './finance-operations.mjs';
export {ASSET_OPERATIONS};
const all=d=>Object.values(d.get('state','records')??{}),base=(e,s,id)=>s.created?.[id]??e.byId.get(id);
const alive=(s,id)=>s.npcs?.[id]&&!['死亡','濒死','昏迷','患病'].includes(s.npcs[id].status);
function ownsWorkshop(state,id,owner='player',engine){
    const leases=allState(state).filter(r=>r.kind==='asset_lease'&&r.subject===id&&engine&&leaseState(engine,state,r).active);
    if(leases.some(r=>contractTerms(r,state.minute).tenant!==owner))return false;
    return state.buildings?.[id]?.owner===owner||state.buildings?.[id]?.owners?.[owner]>0||leases.some(r=>contractTerms(r,state.minute).tenant===owner&&leaseState(engine,state,r).factor>0)||allState(state).some(r=>r.kind==='lease'&&r.subject===id&&r.parties?.[0]===owner&&r.status==='有效'&&r.deadline>state.minute);
}
function ownedPlace(d,e,args,allowLease=false){
    const id=e.resolve(args.location??d.get('state','location')),place=base(e,d.get('state'),id),asset=d.get('state','buildings',id);
    if(id!==d.get('state','location')||!place||!(allowLease?ownsWorkshop(d.get('state'),id,'player',e):asset?.owner==='player')||asset?.condition<=0)throw preconditionFailure('须在本人合法持有且完好的房屋、田地或铺面签约');
    return {id,place,asset};
}
export function rentalNeed(e,state,tenant,subject){
    const p=base(e,state,subject),occupation=personOccupation(e,state,tenant).value??'',h=personHousehold(e,state,tenant).value;
    if(!p||!alive(state,tenant)||personConstraint(e,state,tenant)||allState(state).some(r=>r.kind==='asset_lease'&&r.tenant===tenant&&r.status==='有效'&&r.deadline>state.minute))return null;
    const type=/田|耕|农地/.test(p.purpose??p.name)?'field':/铺|店|商|工坊/.test(p.purpose??p.name)?'commercial':'home';
    const home=h?.homeLocation??base(e,state,tenant)?.home?.location,work=personBusiness(e,state,tenant);
    const damaged=home&&state.buildings?.[home]?.condition<=0;
    if(type==='home'){
        const definition=base(e,state,home),capacity=definition?.lodging?.rooms??definition?.rooms?.length??Infinity;
        if(home&&!damaged&&(h?.members?.length??1)<=capacity)return null;
    }else if(type==='field'){
        if(!/农|耕|种|佃/.test(occupation))return null;
        if(Object.entries(state.buildings??{}).some(([id,r])=>r.owner===tenant&&/田|耕/.test(base(e,state,id)?.purpose??'')))return null;
    }else if(!/商|掌柜|匠|织|铁|陶|工坊/.test(occupation)&&!work?.open.value)return null;
    return {kind:type,reason:type==='home'?(damaged?'原住房损毁':home?'原住房拥挤':'无可用住房'):type==='field'?'农事需要田地':'经营需要铺面',oldHome:home??null,
        settlement:placeSettlement(e,state,subject).value};
}
const allState=s=>Object.values(s.records??{});
export function netAssets(d,e,id){
    const actor=d.get(...e.actorPath(id)),account=groupAccountView(e,d.get('state'),id);
    const goods=account?.items??actor?.inventory??{};
    // Holdings still come from their real accounts. Current stock value comes
    // from the common market value, before shop spread/regard/day pressure;
    // historical acquisition lots below remain historical costs.
    const location=actor?.location??base(e,d.get('state'),id)?.location??d.get('state','location');
    const stock=Object.entries(goods).reduce((n,[item,v])=>{
        const quantity=priceRead(d,{point:'assets.goods',account:account?.items?store(e,id,item):bag(e,id,item),legacy:()=>typeof v==='number'?v:v.quantity??0});
        if(!quantity||!e.byId.has(item))return n;
        const currency=currencyRow(e,item);
        if(currency){
            if(!currencyAccepted(e,d.get('state'),location,currency.resource)||currencyValue(d,e,{currency:item,location}).value===0)return n;
            return n+currencyTradePrice(d,e,{currency:item,quantity,location}).totalCoins;
        }
        if(!e.byId.get(item).basePrice)return n;
        const projection=marketQuote(d,e,{item,location,seller:id,quantity,base:regionalTradeBase(d,e,item,location)});
        return n+quantity*projection.explanation.value.value;
    },0);
    if(!account&&!actor&&d.get(...rec(`organization:${id}`))?.category!=='organization')throw preconditionFailure('资金当事人不存在');
    const cash=coinRead(d,{point:'assets.cash',account:partyAccount(e,d.get('state'),id),legacy:()=>financeBalance(d,e,id)});
    const state=d.get('state'),debt=obligationRows(state).filter(r=>r.debtor===id).reduce((n,r)=>n+obligationView(state,r).owed,0);
    return Math.max(1,cash+stock-debt);
}
// ---- 估值角色的登记（valuation.mjs）--------------------------------------------------------------
// 物品：市场估值投影（基准 × 稀缺 × 品质，不含商家价差与立场），按给定地点；货币按当地汇率。
// 估价对象自己的行囊不构成给自己的市场供给；apart 保留旧调用契约，估值统一排除 holder。
function goodsValuation(d,e,{item,quantity=1,location=d.get('state','location'),holder='player',apart=false,liquidation=false}){
    const def=e.byId.get(item);
    if(!def)return {value:null,unvaluable:'不是已登记的物品'};
    const currency=currencyRow(e,item);
    if(currency)return {value:currencyTradePrice(d,e,{currency:item,quantity,location}).totalCoins,basis:'currency'};
    if(!def.basePrice)return {value:null,unvaluable:'没有估值基准'};
    if(!(quantity>0))return {value:0,basis:'market-value'};
    const base=regionalTradeBase(d,e,item,location),supply=supplyApart(d,e,{item,location,owner:holder});
    if(liquidation)return {value:liquidationValue(d,e,{item,quantity,location,holder,base,supply}),basis:'market-liquidation'};
    const projection=marketQuote(d,e,{item,location,seller:holder,quantity,base,supply});
    return {value:quantity*projection.explanation.value.value,basis:'market-value'};
}
registerValuer('goods',goodsValuation);
// 抵押/质押按整批清算可回收值放款；少量沿用零售估值。
registerValuer('collateral',(d,e,asset)=>goodsValuation(d,e,{...asset,liquidation:true}));
installEventWorth((e,state,{item,quantity,location})=>goodsWorth(stateReader(state),e,{item,quantity,location,holder:null}));
// 股份：发行方净资产 × 持股比例。
registerValuer('share',(d,e,{issuer,fraction})=>{
    try{return {value:netAssets(d,e,issuer)*fraction,basis:'net-assets'};}
    catch{return {value:null,unvaluable:'发行方账目不可查，无法估计股份价值'};}
});
// 土地只资本化地租份额；租约仅改变剩余期间的收租权，到期后收益仍归业主。
// 建筑保留服务租金与完好度口径；两者都经 economy:landValue 修正。
registerValuer('property',(d,e,{subject,fraction=1,condition,right='owns',holder,contract})=>{
    const state=d.get('state'),place=base(e,state,subject);
    const field=e.rules.agriculture?.settlements.some(p=>p.fieldLocation===subject);
    if(!place||!(field||state.buildings?.[subject]||place.purpose))return {value:null,unvaluable:'没有租金或用途可资本化'};
    const kind=field||/田|耕|农地/.test(place.purpose??place.name)?'field':/铺|店|商|工坊/.test(place.purpose??place.name)?'commercial':'home';
    const [low,high]=e.rules.economy.loanMonthlyInterest;
    let monthly=buildingRentAnchor(e,kind),rentBasis,leaseAdjustment=0;
    const leases=kind==='field'?allState(state).filter(r=>r.kind==='asset_lease'&&r.subject===subject&&leaseState(e,state,r).active).map(r=>contractTerms(r,state.minute)):[];
    if(right==='leases'){
        const lease=leases.find(r=>r.id===contract&&r.tenant===holder);
        if(!lease||kind!=='field')return {value:null,unvaluable:'没有可估计的有效田地使用权收益'};
        if(!lease.rentBasis)return {value:null,unvaluable:'缺依据：租约没有签约时的市场地租依据'};
        // A lease transfers only its signed rent advantage, never labor income
        // or a new windfall from querying today's crop quotation.
        const marketRent=fieldMonthlyIncome(e,lease.rentBasis);
        return {value:Math.max(0,marketRent-leaseMonthlyIncome(e,lease))*(lease.deadline-state.minute)/MONTH*fraction,basis:'lease-rent-advantage',rentBasis:lease.rentBasis};
    }
    if(kind==='field'){
        try{rentBasis=fieldRentBasis(d,e,subject);}catch(error){return {value:null,unvaluable:error.message};}
        monthly=fieldMonthlyIncome(e,rentBasis);
    }
    for(const lease of leases){
        // Replace the leased acreage's market ground rent with actual rent
        // only until expiry. Capitalizing that temporary discount forever
        // would erase the owner's reversion and break the rights split.
        const marketRent=monthly*(lease.rentBasis?.areaMu??rentBasis.areaMu)/rentBasis.areaMu;
        // Allocate the whole remaining-period difference once in copper;
        // rounding each side separately would lose one at fractional months.
        leaseAdjustment+=Math.trunc((leaseMonthlyIncome(e,lease)-marketRent)*(lease.deadline-state.minute)/MONTH);
    }
    // condition 可显式给出（如估“受损前的完整价值”）；缺省按现状完好度。
    const intact=kind==='field'?1:Math.max(0,Math.min(100,condition??state.buildings?.[subject]?.condition??100))/100;
    const baseValue=monthly/((low+high)/2)*intact+leaseAdjustment;
    return {value:explainDerived(e,d.document??{state},'economy:landValue',subject,{kind:'land',base:baseValue}).value*fraction,basis:kind==='field'?'capitalized-field-income':'capitalized-rent',...(rentBasis?{rentBasis}:{})};
});
// Historical costs retain exact fractions through FIFO and credit settlement.
// Numbers remain readable for existing whole-cost records; no BigInt is saved.
const costFraction=value=>typeof value==='number'
    ?value<0?fraction(-decimalFraction(-value).numerator,decimalFraction(-value).denominator):decimalFraction(value)
    :fraction(BigInt(value.numerator),BigInt(value.denominator));
const costTimes=(value,count)=>{const a=costFraction(value),b=costFraction(count);return fraction(a.numerator*b.numerator,a.denominator*b.denominator);};
// Match currency's integer-string encoding when a reduced fraction exceeds
// the safe Number range; converting it to a double would change truncation.
const costInteger=n=>n>=-9007199254740991n&&n<=9007199254740991n?Number(n):String(n);
const savedCost=value=>{const r=costFraction(value),numerator=costInteger(r.numerator);return r.denominator===1n&&typeof numerator==='number'?numerator:{numerator,denominator:costInteger(r.denominator)};};
const floorCost=value=>{const r=costFraction(value),q=r.numerator/r.denominator;return Number(q-(r.numerator<0n&&r.numerator%r.denominator?1n:0n));};
export function operatingProfit(d,e,issuer){
    const recorded=d.get(...rec(`finance_profit:${issuer}`));
    const ledger=groupAccountView(e,d.get('state'),issuer)?.ledger??d.get(...rec(`organization:${issuer}`),'ledger')??[];
    // 成本批次的基准价：期初存货与无成交记录的出入库没有历史成本可查，取目录基准价作“无记录时的参照”；
    // 有成交记录的批次用实付价摊入。这是历史成本核算，不是现价/估值（现价走 goods 估值角色），故保留。
    const lots=new Map(Object.entries(e.world.factions?.find(f=>f.id===issuer)?.resources?.items??{}).map(([id,quantity])=>[id,[{quantity,price:e.byId.get(id)?.basePrice??0}]])),events=new Map();let net=costFraction(recorded?.netExact??recorded?.net??0);
    for(const l of ledger){
        if(l.kind==='商税'){net=addAccrual(net,costFraction(l.coins??0));continue;}
        // 阶段耗用物资的价值是耗用当时冻结在账上的 itemWorth（faction-clock 写入），历史成本不随现价重算。
        if(l.kind==='stage_cost'){net=addAccrual(addAccrual(net,costFraction(l.coins??0)),costFraction(l.itemWorth??0),-1n);continue;}
        if(l.kind!=='trade')continue;
        const key=l.sourceEvent,event=events.get(key)??{coins:0,items:{}};event.coins+=l.coins??0;
        for(const [id,q]of Object.entries(l.items??{}))event.items[id]=(event.items[id]??0)+q;
        events.set(key,event);
    }
    for(const event of events.values()){
        const acquired=Object.entries(event.items).filter(([,q])=>q>0),sold=Object.entries(event.items).filter(([,q])=>q<0);
        // 一笔换入多种物品的实付款，按目录基准价的相对比重摊到各物品上（摊派权重，不是估价）。
        if(acquired.length){const value=acquired.reduce((n,[id,q])=>n+q*(e.byId.get(id)?.basePrice??0),0);for(const [id,quantity]of acquired){const stock=lots.get(id)??[];stock.push({quantity,price:savedCost(fraction(BigInt(-event.coins)*BigInt(e.byId.get(id)?.basePrice??0),BigInt(Math.max(1,value))))});lots.set(id,stock);}}
        if(!sold.length)continue;
        let basis=costFraction(0);
        for(const [id,q]of sold){const stock=lots.get(id)??[];let remaining=-q;while(remaining&&stock.length){const n=Math.min(remaining,stock[0].quantity);basis=addAccrual(basis,costTimes(stock[0].price,n));stock[0].quantity-=n;remaining-=n;if(!stock[0].quantity)stock.shift();}basis=addAccrual(basis,costTimes(e.byId.get(id)?.basePrice??0,remaining));lots.set(id,stock);}
        net=addAccrual(addAccrual(net,costFraction(event.coins)),basis,-1n);
    }
    return floorCost(net);
}
// Real deliveries consume inventory basis once. Credit sales recognize income
// when the existing debt is repaid; purchases retain their actual lot prices.
export function recordFinanceSale(d,e,{buyer,seller,item,quantity,cost,tax=0,eventId,paid=true,settledBasis}){
    if(settledBasis===undefined&&buyer!=='player'&&d.get('state','npcs',buyer)){
        const key=`finance_profit:${buyer}`,old=d.get(...rec(key))??{category:'finance_profit',issuer:buyer,net:0,lots:{},entries:[]};
        const opening=bagStock(d,e,{point:'assets.basis',id:buyer,item,legacy:()=>e.quantity(d,buyer,item)})-quantity,prior=(old.lots[item]??(opening>0?[{quantity:opening,price:e.byId.get(item)?.basePrice??0}]:[])).map(row=>({...row,price:savedCost(row.price)}));
        const c=costFraction(cost),q=costFraction(quantity),price=savedCost(fraction(c.numerator*q.denominator,c.denominator*q.numerator));
        holdingSet(d,e,rec(key),{...old,lots:{...old.lots,[item]:[...prior,{quantity,price}]}},'finance-assets');
    }
    if(seller==='player'||!d.get('state','npcs',seller))return;
    const key=`finance_profit:${seller}`,old=d.get(...rec(key))??{category:'finance_profit',issuer:seller,net:0,lots:{},entries:[]},lots=(old.lots[item]??[]).map(row=>({...row,price:savedCost(row.price)}));
    let remaining=settledBasis===undefined?quantity:0,basis=costFraction(settledBasis??0);while(remaining&&lots.length){const n=Math.min(remaining,lots[0].quantity);basis=addAccrual(basis,costTimes(lots[0].price,n));remaining-=n;lots[0].quantity-=n;if(!lots[0].quantity)lots.shift();}
    basis=addAccrual(basis,costTimes(e.byId.get(item)?.basePrice??0,remaining));
    if(!paid){holdingSet(d,e,rec(key),{...old,lots:{...old.lots,[item]:lots}},'finance-assets');return savedCost(basis);}
    const profit=addAccrual(costFraction(cost-tax),basis,-1n),net=addAccrual(costFraction(old.netExact??old.net),profit);
    holdingSet(d,e,rec(key),{...old,net:floorCost(net),netExact:savedCost(net),lots:{...old.lots,[item]:lots},entries:[...old.entries,{sourceEvent:eventId,minute:d.get('state','minute'),revenue:cost,cost:savedCost(basis),tax,profit:savedCost(profit)}]},'finance-assets');
    return savedCost(basis);
}
// §15.1.1 价值有位置：收付双方（组织以现任代表为位置）同在一处才当面交付；不在场时，能付的款形成到期应付（真实债务），
// 由通用清偿运行时按在场、代收、汇票或承运结算，不凭空转账。
const payerAt=(e,state,id)=>groupAccountView(e,state,id)?groupRepresentative(e,state,id)??id:id;
function openClaim(d,e,key,debt){
    holdingSet(d,e,rec(key),debt,'finance-assets');adoptLegacyObligation(d,e,key);
}
function payDividend(d,e,row,at){
    row=contractTerms(row,at);
    const profit=operatingProfit(d,e,row.issuer),eligible=Math.max(0,Math.floor((profit-row.baselineProfit)*row.share/100)-row.distributed);
    // Earned claims precede the residual return on equity. Count a canonical
    // claim and its compatibility record only once, including unpaid wages.
    const state=d.get('state'),open=obligationRows(state).filter(r=>r.debtor===row.issuer);
    const priority=open.filter(r=>r.kind!=='dividend'&&r.kind!=='partnership').reduce((n,r)=>n+obligationView(state,r,at).amountDue,0);
    // Dividends already promised but not yet delivered are also owed out of the same cash.
    const promised=open.filter(r=>r.kind==='dividend').reduce((n,r)=>n+obligationView(state,r,at).owed,0);
    const payable=Math.min(eligible,Math.max(0,financeBalance(d,e,row.issuer)-priority-promised));
    const present=settlementPresent(e,state,payerAt(e,state,row.issuer),row.holder),key=`${row.id}:${at}`;
    let paid=0,claim=null;
    if(payable&&present){financeTransfer(d,e,row.issuer,row.holder,payable,key);paid=payable;}
    else if(payable){
        claim=`debt_dividend:${key}`;
        openClaim(d,e,claim,{category:'debt',kind:'dividend',debtor:row.issuer,creditor:row.holder,amount:payable,paid:0,status:'待偿还',createdAt:at,deadline:at+e.rules.economy.credit.loan.defaultGraceMinutes,source:row.source,contract:row.id,location:row.location,unpresented:true});
    }
    const next={...row,distributed:row.distributed+paid+(claim?payable:0),nextDividend:at+MONTH,payments:[...row.payments,{minute:at,paid,profit,eligible,...(claim?{claim,owed:payable}:{})}]};holdingSet(d,e,rec(row.id),next,'finance-assets');
    if(paid)financeEvent(d,e,{id:key,actor:row.issuer,target:row.holder,value:paid,minute:at,location:row.location,tags:['dividend']});
    return next;
}
export function workerSkill(e,s,id,recipe){const n=s.npcs[id],p=base(e,s,id);return Math.max(n?.proficiencies?.[recipe.skill]??0,p?.proficiencies?.[recipe.skill]??0,n?.skills?.[recipe.skill]?.proficiency??0);}
function employmentAccount(d,e,owner){const g=groupAccountView(e,d.get('state'),owner);if(g)return g;const r=d.get(...rec(`organization:${owner}`));return r?.category==='organization'?r:null;}
export function employmentStock(d,e,owner,item){const estate=d.get('state','records',`protocol_assets:${owner}`);if(estate){const v=estate.inventory?.[item];return typeof v==='number'?v:v?.quantity??0;}const g=employmentAccount(d,e,owner);return g?g.items?.[item]??0:e.quantity(d,owner,item);}
export function changeEmploymentStock(d,e,owner,item,delta,eventId,books){
    const estate=d.get('state','records',`protocol_assets:${owner}`);
    if(estate){const quantity=employmentStock(d,e,owner,item)+delta;if(quantity<0)throw Error('Estate inventory insufficient');
        bookStock(d,e,bag(e,owner,item),delta,books);holdingSet(d,e,['state','records',`protocol_assets:${owner}`,'inventory',item],quantity,'finance-assets');return;}

    const g=groupAccountView(e,d.get('state'),owner);
    if(!g){const org=d.get(...rec(`organization:${owner}`));if(org?.category==='organization'){
        const quantity=(org.items?.[item]??0)+delta;if(quantity<0)throw preconditionFailure('组织实际库存不足');
        bookStock(d,e,store(e,owner,item),delta,books);
        holdingSet(d,e,rec(`organization:${owner}`),{...org,items:{...org.items,[item]:quantity},ledger:[...org.ledger??[],{kind:'employment_production',items:{[item]:delta},sourceEvent:eventId}]},'finance-assets');return;
    }return changeItems(d,e,owner,item,delta,{books});}
    const row=ensureGroupAccount(d,e,owner),quantity=(row.items[item]??0)+delta;if(quantity<0)throw preconditionFailure('组织实际库存不足');
    bookStock(d,e,store(e,owner,item),delta,books);
    d.set(groupAccountPath(owner),{...row,items:{...row.items,[item]:quantity},ledger:[...row.ledger,{kind:'employment_production',items:{[item]:delta},sourceEvent:eventId}]});
}
// Shared F1 production: validate the complete batch before consuming anything.
export function employmentProductionPlan(d,e,row,{minutes=480,maximum=Infinity}={}){
    const s=d.get('state'),recipe=base(e,s,row.recipe),owner=row.owner??'player';
    const premises=owner==='player'&&ownsWorkshop(s,row.location,owner,e),inventory=premises?premisesInventory(s,owner,row.location):null;
    if(!recipe?.materials?.length||!recipe.output)return {reason:'配方已不可用'};
    const skill=workerSkill(e,s,row.worker,recipe),facility=facilityView(e,s,row.location);
    if(skill<(recipe.minimumProficiency??0))return {reason:'当前技能不足'};
    if(facility?.factor===0||s.buildings?.[row.location]?.condition<=0)return {reason:'工坊已停用'};
    const toolsOwner=employmentAccount(d,e,owner)||s.records?.[`protocol_assets:${owner}`]?row.worker:owner;
    let batches=Math.min(50,Math.floor(minutes/recipe.minutes*(1+skill/3000)),Math.floor(200/recipe.output.quantity),maximum);
    for(const p of recipe.byproducts??[])batches=Math.min(batches,Math.floor(200/p.amount));
    for(const m of recipe.materials){const held=inventory?.[m.item];const stock=premises?(typeof held==='number'?held:held?.quantity??0):employmentStock(d,e,owner,m.item);batches=Math.min(batches,Math.floor(stock/m.amount));}
    for(const tool of recipe.tools??[]){const held=heldUnit(d,e,toolsOwner,tool);if(!held||(held.durability??e.byId.get(tool)?.durability)<=0)return {reason:'缺少完好工具'};batches=Math.min(batches,Math.floor((held.durability??e.byId.get(tool)?.durability)/Math.max(1,recipe.toolWear??1)));}
    const place=base(e,s,row.location),station=recipe.workstation?(facility?.workstations??place?.workstations)?.find(st=>st.kind===recipe.workstation):null;
    if(recipe.location&&recipe.location!==row.location||recipe.workstation&&(!station||station.access!=='public'&&station.owner!==owner))return {reason:'工作台使用权已失效'};
    if(!batches)return {reason:'缺少可用材料或工时'};
    const fee=station?.owner===owner?0:(station?.fee??0)*batches;
    if(financeBalance(d,e,owner)<fee)return {reason:'工作台费用不足'};
    const quality=skill>=2100?'杰作':skill>=1500?'优秀':skill>=900?'精良':skill>=300?'普通':'粗糙';
    return {recipe,owner,toolsOwner,skill,batches,fee,station,quality,premises};
}
export function settleEmploymentProduction(d,e,row,at,plan){
    const {recipe,owner,toolsOwner,skill,batches,fee,station,quality,premises}=plan,eventId=`${row.id}:${at}`;
    if(fee){if(station.owner)financeTransfer(d,e,owner,station.owner,fee,`${eventId}:station`);else{financeChange(d,e,owner,-fee,`${eventId}:station`,{account:workshopFund(station.id),writer:'finance-bank',eventId});d.set(['state','workshopFunds',station.id],(d.get('state','workshopFunds',station.id)??0)+fee);}}
    for(const m of recipe.materials){if(premises)changePremisesItems(d,e,owner,row.location,m.item,-m.amount*batches,{books:craftInput('finance-assets',eventId)});else changeEmploymentStock(d,e,owner,m.item,-m.amount*batches,eventId,craftInput('finance-assets',eventId));}
    for(const tool of recipe.tools??[])wearItem(d,e,toolsOwner,tool,(recipe.toolWear??1)*batches);
    const instances=[],products=[recipe.output,...(recipe.byproducts??[]).map(p=>({item:p.item,quantity:p.amount}))];
    for(const p of products){
        if(premises)instances.push(...producePremisesItems(d,e,owner,row.location,p.item,p.quantity*batches,{eventId,recipe:recipe.id,workmanship:quality,maker:row.worker,books:craftOutput('finance-assets',eventId)}));
        else if(employmentAccount(d,e,owner)||d.get('state','records',`protocol_assets:${owner}`))changeEmploymentStock(d,e,owner,p.item,p.quantity*batches,eventId,craftOutput('finance-assets',eventId));
        else instances.push(...produceItems(d,e,p.item,p.quantity*batches,{eventId,recipe:recipe.id,workmanship:quality,owner,maker:row.worker,books:craftOutput('finance-assets',eventId)}));
    }
    // 行为人 = 受雇工匠 row.worker（雇主 owner 出料），发生地 = 工场所在地 row.location 的聚落。
    recordCraft(d,{engine:e,actor:row.worker,place:placeSettlement(e,d.get('state'),row.location).value,recipe:recipe.id,batches,inputs:Object.fromEntries(recipe.materials.map(m=>[m.item,m.amount*batches])),outputs:Object.fromEntries(products.map(p=>[p.item,p.quantity*batches])),writer:'finance-assets',eventId});
    return {minute:at,fee,batches,quality,skill,instances,quantity:recipe.output.quantity*batches};
}
function fairWage(e,s,worker,recipe){return laborValue(e,{state:s},{worker,observer:'player',proficiency:workerSkill(e,s,worker,recipe)}).daily;}
export function workshopStorage(d,e,args,eventId){
    const {id:location,place}=ownedPlace(d,e,args,true);
    if(!place.workstations?.length)throw preconditionFailure('这里没有登记工坊工作台');
    if(args.direction==='inspect')return {location,inventory:premisesInventory(d.get('state'),'player',location)};
    const item=e.resolve(args.item,'item');
    return transferPremisesItems(d,e,'player',location,item,args.quantity,args.direction,eventId);
}
export function assetTrade(d,e,args,id){
    if(args.operation?.startsWith('labor_'))return laborTrade(d,e,args,id);
    const op=args.operation,state=d.get('state'),now=state.minute,location=state.location;
    if(op==='workshop_stock')return workshopStorage(d,e,{...args,direction:args.mode??'inspect'},id);
    if(op==='dismiss'&&state.records?.[args.contract]?.kind==='asset_lease')return terminateAssetLease(d,e,{contract:args.contract,actor:'player'},id);
    if(op==='asset_inspect'){
        const subject=args.location?e.resolve(args.location):location;
        return {tax:tradeTax(e,state,subject),tariff:tradeTax(e,state,subject,'tariff'),tenants:Object.keys(state.npcs).map(tenant=>({tenant,need:rentalNeed(e,state,tenant,subject)})).filter(r=>r.need),
            contracts:all(d).filter(r=>['equity','asset_lease','workshop'].includes(r.kind)),operations:[...ASSET_OPERATIONS],
            note:'invest:business组织或seller商人,quantity股份%；share_transfer:contract,buyer；rent_out:location,coins月租；workshop:item配方,coins日薪；workshop_terms调整工资。'};
    }
    if(op==='invest'){
        const liability=args.liability??'limited';
        if(!['limited','unlimited'].includes(liability))throw preconditionFailure('责任形式须为 limited 或 unlimited');
        const issuer=args.business?e.resolve(args.business):e.resolve(args.seller),representative=args.business?groupRepresentative(e,state,issuer,args.seller):issuer;
        if(!representative)throw preconditionFailure('组织没有现任签约代表');counterpart(d,e,representative,{consent:args.consent});
        if(!args.business&&!personBusiness(e,state,issuer)?.open.value)throw preconditionFailure('对方没有当前可经营的商号');
        const share=int(args.quantity,1,90,'股份百分比'),sold=all(d).filter(r=>r.kind==='equity'&&r.issuer===issuer).reduce((n,r)=>n+r.share,0);
        if(sold+share>90)throw preconditionFailure('发行股份超过可转让比例');
        const value=Math.ceil(netAssets(d,e,issuer)*share/(100-share)),cost=int(args.coins??value,Math.max(1,Math.ceil(value*.8)),Math.max(1,Math.ceil(value*1.5)),'入股对价');
        financeTransfer(d,e,'player',issuer,cost,id);const key=`equity:${id}`;
        const row={category:'contract',kind:'equity',id:key,issuer,holder:'player',share,stake:cost,baselineProfit:operatingProfit(d,e,issuer),distributed:0,nextDividend:now+MONTH,payments:[],status:'有效',location,createdAt:now,source:id};
        holdingSet(d,e,rec(key),snapshotContractTerms({...row,liability:{form:liability,scope:liability==='limited'?'以出资为限':'可追及个人财产',contribution:cost,holder:'player',issuer,representative,consentEvent:id,signedAt:now}}),'finance-assets');
        return {contract:key,issuer,share,cost,liability};
    }
    if(op==='dividend'||op==='share_transfer'){
        const row=contractTerms(d.get(...rec(args.contract))??{},now);if(row?.kind!=='equity'||row.holder!=='player'||row.status!=='有效')throw preconditionFailure('需要本人持有的有效股份契约');
        if(op==='dividend'){
            if(now<row.nextDividend)throw preconditionFailure('尚未到分红期');return payDividend(d,e,row,now);
        }
        const buyer=counterpart(d,e,args.buyer,{consent:args.consent}),share=int(args.quantity??row.share,1,row.share,'转让股份');
        if(buyer===row.issuer)throw preconditionFailure('发行方回购须另签减资条款，不能形成自有股份');
        const value=Math.max(1,Math.ceil(netAssets(d,e,row.issuer)*share/100)),cost=int(args.coins??value,Math.max(1,Math.ceil(value*.8)),Math.ceil(value*1.5),'转让价款');
        financeTransfer(d,e,buyer,'player',cost,id);
        // Accrued undistributed entitlements transfer with the shares.
        const part=share/row.share,transferred=snapshotContractTerms({...row,clauses:undefined,amendments:[],id:`equity:${id}`,holder:buyer,share,stake:Math.floor(row.stake*part),distributed:Math.floor(row.distributed*part),source:id,liability:row.liability?{...row.liability,holder:buyer,contribution:Math.floor(row.stake*part),consentEvent:id,signedAt:now}:undefined});
        holdingSet(d,e,rec(row.id),{...row,share:row.share-share,stake:row.stake-transferred.stake,distributed:row.distributed-transferred.distributed,...(share===row.share?{endedAt:now}:{}),amendments:[...row.amendments??[],{minute:now,share:row.share-share,stake:row.stake-transferred.stake}],status:share===row.share?'已转让':'有效'},'finance-assets');holdingSet(d,e,rec(transferred.id),transferred,'finance-assets');
        return {contract:transferred.id,buyer,share,cost};
    }
    if(op==='rent_in'){
        const subject=e.resolve(args.location??location),place=base(e,state,subject),profile=e.rules.agriculture?.settlements.find(p=>p.fieldLocation===subject);
        const feature=profile&&place?.features?.find(f=>f.growth?.field===profile.fieldId);
        const nativeTitle=Object.values(d.document.holdings?.rows??{}).some(r=>r.kind==='owns'&&r.subject===subject);
        const title=Object.hasOwn(state.buildings?.[subject]??{},'owner')||nativeTitle?subject:feature?.id??subject;
        const owners=currentControllers({engine:e,document:d.document},title,{ownerOnly:true,principals:true});
        if(owners.length!==1||owners[0]==='player')throw preconditionFailure('须有唯一的他人登记持有人才能租入；可请持有人先核清产权');
        const owner=owners[0],collective=Boolean(state.settlements?.[owner]);
        let signatory=owner,government;
        if(collective){
            government=settlementGovernment(e,state,owner);
            const office=government.head.value&&personOffices(e,state,government.head.value,{settlement:owner,power:'public_property'})[0];
            if(!office)throw preconditionFailure('集体田地当前没有具备批地、公产管理职权的在任者；登记或主持会议不能代替授权，请待合法任职或授权后再来');
            signatory=office.value.holder;
        }
        if(location!==subject&&(!collective||location!==government.seat.value))throw preconditionFailure('租入须到资产所在地，集体田也可到该聚落议事登记处当面办理');
        if(state.npcs?.[signatory]?.location!==location)throw preconditionFailure('持有人或有权在任者不在场，不能代其出租；请等其到场或前往其合法办理地点');
        // Presence/capacity is checked separately from the NPC's decision below;
        // the caller's consent flag never supplies the landlord's agreement.
        counterpart(d,e,signatory,{consent:true});
        if(state.buildings?.[subject]?.condition<=0)throw preconditionFailure('资产已毁损，不能出租');
        if(all(d).some(r=>r.kind==='asset_lease'&&contractTerms(r,now).subject===subject&&leaseState(e,state,r,now).active))throw preconditionFailure('资产已有有效租约，不能重复出租');
        const use=profile?'field':/铺|店|商|工坊/.test(place?.purpose??place?.name)?'commercial':'home';
        const rentBasis=use==='field'?fieldRentBasis(d,e,subject,{areaMu:args.quantity,seedItem:args.item?e.resolve(args.item,'item'):undefined}):undefined;
        if(rentBasis)assertCropAvailable(d,subject,'player');
        const days=int(args.days??30,1,360,'租赁天数'),anchor=rentBasis?.monthlyAnchor??buildingRentAnchor(e,use),tenancy=fieldTenancy(d,e,args,rentBasis);
        if(tenancy?.rentMode==='share')return signShareLease(d,e,{args,id,subject,owner,tenant:'player',signatory,days,rentBasis,tenancy,location});
        const rent=int(args.coins??anchor,1,Number.MAX_SAFE_INTEGER,'每月租金'),initial=Math.ceil(rent*Math.min(days,30)/30);
        let paid=initial,rentDueAt,agreement;
        if(args.deadline!==undefined){
            const due=int(args.deadline,now+1,now+days*DAY-1,'约定交租时刻');
            const prepayment=int(args.deposit??0,0,initial,'当场先付租金');
            if(financeBalance(d,e,'player')<prepayment)throw preconditionFailure('付不起约定的先付租金，请先筹钱或降低先付额');
            // Only the landlord's known repayments and outstanding personal
            // claims inform credit capacity; never inspect the tenant's purse.
            const view=subjectiveView(e,d.document,signatory),known=view.self.obligations.filter(o=>o.debtor==='player');
            const repaid=known.reduce((n,o)=>n+(o.paid??0),0),owed=known.reduce((n,o)=>n+Math.max(0,(o.amount??0)-(o.paid??0)),0);
            // Count the same whole rental periods as rentDue, including the
            // final partial period; a short deferral still exposes the first bill.
            const exposure=Math.ceil(rent*Math.min(days,Math.ceil((due-now)/MONTH)*30)/30);
            const risk=Math.max(0,exposure-prepayment-Math.max(0,repaid-owed))/Math.max(1,exposure);
            // Conditional acceptance follows dialogue: actual advance payment
            // is reward with prepaid=true. The promised rent covers the base
            // value; any underpriced portion and unpaid exposure still cost.
            const value=anchor*Math.min(days,30)/30;
            agreement=requestContractConsent(d,e,{from:signatory,scope:'rent',subject,terms:{amount:rent,days,location:subject,prepayment,deadline:due,...(rentBasis?{quantity:rentBasis.areaMu,item:rentBasis.seedItem,...tenancyConsent(tenancy)}:{})},cost:{value:prepayment?Math.max(0,value-initial):value,risk},reward:prepayment||initial,prepaid:prepayment>0,eventId:id});
            if(agreement.allowed){paid=prepayment;rentDueAt=due;}else {
                const deferredRefusal=agreement.reason,deferredConditions=agreement.conditions;
                throw preconditionFailure(`出租人未接受本次${prepayment?'先付方案':'延期交租'}：${deferredRefusal}${deferredConditions?.prepay!==undefined?`（conditions.prepay=${deferredConditions.prepay}，为本次先付${prepayment}文提案上还需追加的差额）`:''}；可调整 deposit 合计额再谈，或另行选择现付（不传 deadline）`);
            }
        }
        else if(args.deposit!==undefined)throw preconditionFailure('部分先付须同时约定交租时刻 deadline');
        if(rentDueAt===undefined){
            if(financeBalance(d,e,'player')<paid)throw preconditionFailure('付不起首期租金，可缩短租期或先筹钱');
            agreement=requestContractConsent(d,e,{from:signatory,scope:'rent',subject,terms:{amount:rent,days,location:subject,prepayment:paid,...(rentBasis?{quantity:rentBasis.areaMu,item:rentBasis.seedItem,...tenancyConsent(tenancy)}:{})},cost:{value:anchor*Math.min(days,30)/30},reward:paid,eventId:id});
        }
        if(!agreement.allowed)throw preconditionFailure(`出租人未同意本次租约：${agreement.reason}；可稍后重新商议`);
        if(paid)financeTransfer(d,e,'player',owner,paid,id);
        const key=`asset_lease:${id}`,row={category:'contract',kind:'asset_lease',id:key,subject,tenant:'player',owner,use,settlement:placeSettlement(e,state,subject).value,
            monthlyRent:rent,paid,status:'有效',createdAt:now,deadline:now+days*DAY,nextRent:now+MONTH,location,source:id,signatory,consentEvent:agreement.source,...(rentBasis?{rentBasis,tenancy}:{}),...(rentDueAt!==undefined?{rentDueAt,...(paid?{prepayment:paid}:{})}:{})};
        row.clauses=leaseClauses(row);if(use==='field')row.clauses.unharvestedCrops=tenancy.unharvestedCrops==='owner'?'到期后未收作物留田归田主':'tenant';holdingSet(d,e,rec(key),row,'finance-assets');
        let debt;
        if(rentDueAt!==undefined&&initial>paid){
            debt=`debt_rent:${key}:${now}`;
            openClaim(d,e,debt,{category:'debt',kind:'rent',debtor:'player',creditor:owner,amount:initial-paid,paid:0,status:'待偿还',createdAt:now,dueAt:rentDueAt,deadline:rentDueAt+e.rules.economy.credit.loan.defaultGraceMinutes,source:id,contract:key,location});
        }
        return {contract:key,subject,owner,signatory,tenant:'player',rent,paid,deadline:row.deadline,consent:agreement.source,...(rentBasis?{rentBasis}:{}),
            ...(rentDueAt!==undefined?{rentDueAt,debt}:{}),
            ...(use==='field'?{note:'租期内作物归承租人，须在到期前收走；到期后未收作物留田归田主。'}:{})};
    }
    if(op==='rent_out'){
        // Presence/capacity only; requestContractConsent below obtains the
        // tenant's actual answer. A catalogue caller cannot supply that answer.
        const {id:subject}=ownedPlace(d,e,args),tenant=counterpart(d,e,args.seller,{consent:true}),need=rentalNeed(e,state,tenant,subject);
        if(!need)throw preconditionFailure('对方当前没有对应住房或经营租赁需求');
        if(all(d).some(r=>r.kind==='asset_lease'&&r.subject===subject&&r.status==='有效'&&leaseState(e,state,r,now).active))throw preconditionFailure('资产已出租');
        const rentBasis=need.kind==='field'?fieldRentBasis(d,e,subject,{areaMu:args.quantity,seedItem:args.item?e.resolve(args.item,'item'):undefined}):undefined;
        if(rentBasis)assertCropAvailable(d,subject,tenant);
        const days=int(args.days??30,1,360,'租赁天数'),anchor=rentBasis?.monthlyAnchor??buildingRentAnchor(e,need.kind),tenancy=fieldTenancy(d,e,args,rentBasis);
        if(tenancy?.rentMode==='share')return signShareLease(d,e,{args,id,subject,owner:'player',tenant,signatory:tenant,days,rentBasis,tenancy,location,need});
        const rent=int(args.coins??anchor,1,Number.MAX_SAFE_INTEGER,'每月租金');
        const initial=Math.ceil(rent*Math.min(days,30)/30);
        const rentDueAt=args.deadline===undefined?undefined:int(args.deadline,now+1,now+days*DAY-1,'约定交租时刻');
        if(rentDueAt===undefined&&args.deposit!==undefined)throw preconditionFailure('部分先付须同时约定交租时刻 deadline');
        const paid=rentDueAt===undefined?initial:int(args.deposit??0,0,initial,'当场先付租金');
        const agreement=requestContractConsent(d,e,{from:tenant,scope:'rent',subject,
            terms:{amount:rent,days,location:subject,prepayment:paid,...(rentDueAt!==undefined?{deadline:rentDueAt}:{}),...(rentBasis?{quantity:rentBasis.areaMu,item:rentBasis.seedItem,...tenancyConsent(tenancy)}:{})},
            cost:{coins:paid,value:initial-paid},reward:anchor*Math.min(days,30)/30,eventId:id});
        if(!agreement.allowed)throw preconditionFailure(`承租人未同意本次租约：${agreement.reason}；可调整租金或付款安排再谈`);
        if(paid)financeTransfer(d,e,tenant,'player',paid,id);
        const key=`asset_lease:${id}`,row={category:'contract',kind:'asset_lease',id:key,subject,tenant,owner:'player',use:need.kind,settlement:need.settlement,oldHome:need.oldHome,
            monthlyRent:rent,paid,status:'有效',createdAt:now,deadline:now+days*DAY,nextRent:now+MONTH,location,source:id,consentEvent:agreement.source,...(rentBasis?{rentBasis,tenancy}:{}),...(rentDueAt!==undefined?{rentDueAt,prepayment:paid}:{})};row.clauses=leaseClauses(row);if(need.kind==='field')row.clauses.unharvestedCrops=tenancy.unharvestedCrops==='owner'?'到期后未收作物留田归田主':'tenant';holdingSet(d,e,rec(key),row,'finance-assets');
        let debt;
        if(rentDueAt!==undefined&&initial>paid){
            debt=`debt_rent:${key}:${now}`;
            openClaim(d,e,debt,{category:'debt',kind:'rent',debtor:tenant,creditor:'player',amount:initial-paid,paid:0,status:'待偿还',createdAt:now,dueAt:rentDueAt,deadline:rentDueAt+e.rules.economy.credit.loan.defaultGraceMinutes,source:id,contract:key,location});
        }
        return {contract:key,tenant,rent,paid,need,consent:agreement.source,...(rentBasis?{rentBasis}:{}),...(rentDueAt!==undefined?{rentDueAt,debt}:{}),...(need.kind==='field'?{note:row.clauses.unharvestedCrops}:{})};
    }
    if(op==='workshop'){
        const {id:subject,place}=ownedPlace(d,e,args,true),worker=counterpart(d,e,args.seller,{consent:args.consent}),recipe=e.byId.get(e.resolve(args.item,'recipe'));
        if(!recipe?.materials?.length||!recipe.output||recipe.minutes>480)throw preconditionFailure('配方须有真实材料且工序可在一日内完成');
        const skills=base(e,state,worker)?.skills??[];
        const knows=Array.isArray(skills)?skills.includes(recipe.skill):Object.hasOwn(skills,recipe.skill);
        if(workerSkill(e,state,worker,recipe)<(recipe.minimumProficiency??0)||!(knows||state.npcs[worker].proficiencies?.[recipe.skill]))throw preconditionFailure('工人未掌握配方所需技能');
        if(recipe.location&&recipe.location!==subject||recipe.workstation&&!placeWorkstations(e,state,subject).some(s=>s.kind===recipe.workstation&&stationLicence(e,d,s,'player')))throw preconditionFailure('铺面没有合法可用的配方工作台');
        if(all(d).some(r=>r.kind==='workshop'&&r.worker===worker&&['有效','要求加薪','罢工'].includes(r.status)))throw preconditionFailure('工人已有未结束的雇佣合同');
        if(personConstraint(e,state,worker)||state.npcs[worker].levy||state.npcs[worker].caring)throw preconditionFailure('工人受拘押、服役或照护义务约束');
        if(personOffices(e,state,worker).length)throw preconditionFailure('现任公职不能被私人工坊排班覆盖');
        if(Object.values(state.projects??{}).some(p=>p.status==='施工中'&&p.public?.workers?.includes(worker)))throw preconditionFailure('工人已有公款工程排班');
        const wage=int(args.coins??fairWage(e,state,worker,recipe),1,1e6,'日薪'),days=int(args.days??30,1,360,'雇佣天数'),key=`workshop:${id}`;
        const row={category:'contract',kind:'workshop',id:key,worker,owner:'player',recipe:recipe.id,location:subject,wage,status:'有效',createdAt:now,deadline:now+days*DAY,
            starts:(Math.floor(now/DAY)+1)*DAY+480,nextWork:(Math.floor(now/DAY)+1)*DAY+1020,paid:0,produced:0,shifts:[],source:id};holdingSet(d,e,rec(key),row,'finance-assets');return {contract:key,worker,wage,recipe:recipe.id};
    }
    const row=contractTerms(d.get(...rec(args.contract))??{},now);if(row?.kind!=='workshop'||row.owner!=='player'||!['有效','要求加薪','罢工'].includes(row.status))throw preconditionFailure('需要尚未结束的本人工坊雇佣合同');
    if(row.location!==location)throw preconditionFailure('须到工坊修改或解除雇佣');
    if(op==='dismiss'){changeLegacyHoldings(d,e,{holder:row.worker,source:`contract:${row.id}`,reason:'vacated',eventId:id},()=>holdingSet(d,e,rec(row.id),{...row,status:'已解雇',endedAt:now},'finance-assets'));return {contract:row.id,status:'已解雇'};}
    if(op==='workshop_terms'){
        if(e.resolve(args.seller)!==row.worker)throw preconditionFailure('须由原雇工同意新工钱');counterpart(d,e,row.worker,{consent:args.consent});
        const wage=int(args.coins??fairWage(e,state,row.worker,e.byId.get(row.recipe)),1,1e6,'新日薪');holdingSet(d,e,rec(row.id),{...row,wage,status:'有效',raiseRequestedAt:null,amendments:[...row.amendments??[],{wage,minute:now,source:id}]},'finance-assets');return {contract:row.id,wage};
    }
    throw preconditionFailure('未知资产操作');
}
export function terminateAssetLease(d,e,{contract,actor,reason='退租'},eventId){
    const now=d.get('state','minute'),row=contractTerms(d.get(...rec(contract))??{},now);
    if(row.kind!=='asset_lease'||row.endedAt!==undefined||row.status!=='有效')throw preconditionFailure('需要尚未终止的资产租约');
    if(![row.owner,row.tenant].includes(actor))throw preconditionFailure('只有真实出租人或承租人可以终止租约');
    if(actor==='player'?d.get('state','location')!==row.location:d.get('state','npcs',actor,'location')!==row.subject)throw preconditionFailure('退租须实际到场交还租赁资产');
    // Assess every already due period before ending future use. Existing rent
    // claims remain separately collectible after the lease holding closes.
    advanceFinanceAssets(d,e,now,[contract]);
    const current=d.get(...rec(contract));
    endLeaseCrop(d,e,current,now,eventId);
    changeLegacyHoldings(d,e,{holder:row.tenant,source:`contract:${contract}`,reason:'vacated',eventId},()=>holdingSet(d,e,rec(contract),{...current,status:'已终止',endedAt:now,endSource:eventId,endReason:reason},'finance-assets'));
    finalizeShareAdvance(d,e,d.get(...rec(contract)),now);
    return {contract,status:'已终止',endedAt:now};
}
function rentDue(d,e,row,at){
    const terms=leaseState(e,d.get('state'),row,at),owner=contractTerms(row,at).owner??'player',state=d.get('state');
    const key=`debt_rent:${row.id}:${at}`,amount=Math.ceil(terms.monthlyRent*Math.min(MONTH,terms.clauses.expires-at)/MONTH);
    // §15.1.1：房客与业主不在同处时租金不凭空转账，形成到期应付，等当面、代收或寄汇清偿。
    const deferred=terms.clauses.rentDueAt!==undefined&&at<terms.clauses.rentDueAt;
    const present=settlementPresent(e,state,payerAt(e,state,row.tenant),owner),paid=!deferred&&present?Math.min(amount,financeBalance(d,e,row.tenant)):0;
    if(paid)financeTransfer(d,e,row.tenant,owner,paid,key);
    if(paid<amount){
        const debt={category:'debt',kind:'rent',debtor:row.tenant,creditor:owner,amount,paid,status:'待偿还',createdAt:at,deadline:(deferred?terms.clauses.rentDueAt:at)+e.rules.economy.credit.loan.defaultGraceMinutes,source:row.source,contract:row.id,location:row.location,...(deferred?{dueAt:terms.clauses.rentDueAt}:present?{}:{unpresented:true})};holdingSet(d,e,rec(key),debt,'finance-assets');
        adoptLegacyObligation(d,e,key);
    }
    holdingSet(d,e,rec(row.id),{...row,paid:row.paid+paid,nextRent:at+MONTH},'finance-assets');
    financeEvent(d,e,{id:key,actor:row.tenant,target:owner,value:paid,minute:at,location:row.location,tags:['rent']});
}
function workshopShift(d,e,row,at){
    row=contractTerms(row,at);const owner=row.owner??'player';
    const s=d.get('state'),recipe=base(e,s,row.recipe),worker=s.npcs[row.worker],regard=standing(e,s,row.worker,'player'),wage=fairWage(e,s,row.worker,recipe);
    const end=(status,reason)=>{const next={...row,status,reason,nextWork:at+DAY,...(['已辞工','已到期'].includes(status)?{endedAt:at}:{})};
        if(next.endedAt!==undefined)return changeLegacyHoldings(d,e,{holder:row.worker,source:`contract:${row.id}`,eventId:`${row.id}:end:${at}`},()=>holdingSet(d,e,rec(row.id),next,'finance-assets'));
        holdingSet(d,e,rec(row.id),next,'finance-assets');};
    if(!alive(s,row.worker)||regard< -40||row.raiseRequestedAt&&at-row.raiseRequestedAt>=3*DAY)return end('已辞工','工人无法继续或不再接受现有工钱');
    if(base(e,s,row.worker)?.schedule?.restDays?.includes(e.calendar(at).day)){holdingSet(d,e,rec(row.id),{...row,nextWork:at+DAY},'finance-assets');return;}
    if(personConstraint(e,s,row.worker,at)||worker.levy||worker.caring)return end('罢工','工人受拘押、服役或照护限制');
    // F083: the day's work is the minutes the worker really spent at the workshop (late arrival, an absent day, a walk home
    // that ate part of the window all count as they happened); nothing is paid or produced for minutes not worked.
    const start=Math.floor(at/DAY)*DAY+480,minutes=Math.min(480,row.attendance?.[String(Math.floor(start/DAY))]??0);
    if(!minutes){holdingSet(d,e,rec(row.id),{...withAbsenceBreach(row,{at,start}),nextWork:at+DAY,reason:'没有实际到岗工时'},'finance-assets');return;}
    try{e.assertNpcObligationAction(d,[row.worker],{start,minutes:540,kind:'employment'});e.assertNpcAutonomyAction(s,[row.worker],{start,minutes:540});}
    catch(error){if(!/冲突|自主工作/.test(error.message))throw error;return end('罢工','本班与已有义务冲突');}
    if(!ownsWorkshop(s,row.location,owner,e)||s.buildings?.[row.location]?.condition<=0)return end('罢工','工坊产权或状态不再可用');
    if(row.wage<wage&&row.raiseRequestedAt)return end('罢工','加薪要求尚未解决');
    // Day wage pro rata to the minutes worked; the cumulative units make the rounding exact (never more than the wage per day).
    const units=row.wageUnits??0,total=units+row.wage*minutes,earned=Math.ceil(total/480)-Math.ceil(units/480);
    // 15 §15.1.1: an owner who keeps a counter pays his hands from it and from nothing else (same rule as labor-market settleEmploymentPay).
    const counter=dedicatedCoinAccount(s,owner,'counter'),wageFunds=()=>counter?counterCash(d,owner):financeBalance(d,e,owner);
    if(wageFunds()<earned)return end('罢工','雇主付不起本班工钱');
    const plan=employmentProductionPlan(d,e,{...row,owner},{minutes});
    if(plan.reason)return end('罢工',plan.reason);
    if(financeBalance(d,e,owner)<plan.fee+(counter?0:earned))return end('罢工','工钱与工作台费用不足');
    if(counter)payFromCounter(d,e,{owner,to:row.worker,amount:earned,writer:'finance-assets',eventId:`${row.id}:${at}`});
    else financeTransfer(d,e,owner,row.worker,earned,`${row.id}:${at}`);
    const {quantity,...shift}=settleEmploymentProduction(d,e,{...row,owner},at,plan),eventId=`${row.id}:${at}`;
    const next={...row,nextWork:at+DAY,paid:row.paid+earned,wageUnits:total,produced:row.produced+quantity,status:row.wage<wage?'要求加薪':'有效',
        ...(row.wage<wage?{raiseRequestedAt:at,requestedWage:wage}:{}),shifts:[...row.shifts,{...shift,wage:row.wage,minutes,earned}]};holdingSet(d,e,rec(row.id),next,'finance-assets');
    financeEvent(d,e,{id:eventId,actor:row.worker,target:owner,minute:at,location:row.location,value:earned,tags:['workshop']});
}
export function advanceFinanceAssets(d,e,minute,recordIds){
    for(const stored of (recordIds?recordIds.map(id=>d.get('state','records',id)).filter(Boolean):all(d))){
        const initial=stored.category==='contract'?contractTerms(stored,minute):stored;
        if(initial.kind==='equity'&&initial.status==='有效')for(let at=initial.nextDividend;at<=minute;at+=MONTH)payDividend(d,e,d.get(...rec(initial.id)),at);
        if(initial.kind==='asset_lease'&&leaseState(e,d.get('state'),initial,leaseClauses(initial).starts).active){
            const expires=leaseClauses(initial).expires;
            if(initial.tenancy?.rentMode!=='share')for(let at=initial.nextRent;at<=minute&&at<expires;at+=MONTH)rentDue(d,e,d.get(...rec(initial.id)),at);
            if(minute>=expires){
                // Uncollected crops stay on the land for its registered owner;
                // ending a lease changes title, not physical stock or its lot.
                endLeaseCrop(d,e,initial,expires,`${initial.id}:expired`);
                changeLegacyHoldings(d,e,{holder:initial.tenant,source:`contract:${initial.id}`,reason:'expired',eventId:`${initial.id}:expired`},()=>holdingSet(d,e,rec(initial.id),{...d.get(...rec(initial.id)),status:'已到期',endedAt:expires},'finance-assets'));
                finalizeShareAdvance(d,e,d.get(...rec(initial.id)),expires);
            }
        }
        if(initial.kind==='workshop'&&!initial.laborMarket&&['有效','要求加薪','罢工'].includes(initial.status)){
            for(let at=initial.nextWork;at<=minute&&at<contractTerms(initial,at).deadline;at+=DAY){const row=contractTerms(d.get(...rec(initial.id)),at);if(row.endedAt!==undefined||row.resolvedAt!==undefined||!['有效','要求加薪','罢工'].includes(row.status))break;workshopShift(d,e,row,at);}
            if(minute>=contractTerms(initial,minute).deadline&&['有效','要求加薪','罢工'].includes(contractTerms(d.get(...rec(initial.id)),minute).status))changeLegacyHoldings(d,e,{holder:initial.worker,source:`contract:${initial.id}`,reason:'expired',eventId:`${initial.id}:expired`},()=>holdingSet(d,e,rec(initial.id),{...d.get(...rec(initial.id)),status:'已到期',endedAt:contractTerms(initial,minute).deadline},'finance-assets'));
        }
    }
    for(const [id,row]of (recordIds?recordIds.map(id=>[id,d.get('state','records',id)]).filter(([,row])=>row):Object.entries(d.get('state','records')??{})))if(row.kind==='rent'&&row.category==='debt'&&row.amount>row.paid&&row.deadline<=minute&&!row.defaulted&&!row.unpresented){// 未能当面交付的租金不是违约，催收见 collect
        const legalCase=registerCreditDefault(d,e,{debt:id,row,value:row.amount-row.paid,minute:row.deadline});holdingSet(d,e,rec(id),{...row,status:'逾期',defaulted:{case:legalCase,remaining:row.amount-row.paid,minute:row.deadline}},'finance-assets');
    }
}
