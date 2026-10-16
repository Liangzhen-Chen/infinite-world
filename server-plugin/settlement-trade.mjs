import {escrow as escrowAccount,treasury as treasuryAccount,moveCoins} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
import {granary as granaryAccount,cargo as cargoAccount,moveStock} from './stock.mjs';
// S1b: 周贸易在途粮记在 settlement-trade:<id>|item_oats|cargo（带原粮批次）；途中过期进 sink:decay，仓容不足拒收的进 sink:destroy。
declareLedgerWriter('settlement-trade',{sinks:['sink:decay','sink:destroy']});
import {granaryCapacity} from './facility-state.mjs';
import {drawGranary,forestWaterPriceFactor} from './agriculture.mjs';
import {itemTraits,hasTrait} from './traits.mjs';
import {hazardPriceFactor} from './hazard-calendar.mjs';
import {tradeTax} from './finance-tax.mjs';
import {magicPriceFactor} from './magic-economy.mjs';
import {transportSegment} from './transport-route.mjs';
import {transportServices,quoteTransport,bookTransport} from './transport.mjs';

const DAY=1440, CLOCK='settlement-trade:clock';
const clone=value=>structuredClone(value);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const profile=(engine,id)=>engine.rules.agriculture?.settlements.find(p=>p.settlement===id);
const cargo=row=>row.batches.reduce((n,b)=>n+b.amount,0);
const orders=state=>Object.values(state.records??{}).filter(r=>r.category==='settlement_trade');
const integer=(v,min=0)=>Number.isSafeInteger(v)&&v>=min;

export function validateSettlementTradeRules(world){
    const r=world.rules.settlementTrade;if(!r)return[];
    const errors=[],ps=world.rules.agriculture?.settlements??[],ids=new Set();
    if(r.version!==1||!r.source||!integer(r.cycleDays,1)||!integer(r.firstDay,1)||!integer(r.dispatchMinute)||r.dispatchMinute>=DAY||!integer(r.targetDays,1)||!integer(r.workersMaximum,1)||!(r.unitKg>0)||!(r.carryKgPerWorker>0)||!(r.distanceFactorPerKm>=0)||r.seasonFactors?.length!==4||r.seasonFactors.some(n=>n<0.6||n>2)||!Array.isArray(r.lanes))errors.push('周贸易周期、运力或价格规则无效');
    const item=world.items.find(i=>i.id===r.item);
    if(!hasTrait(itemTraits(item),'grain')||item.weight!==r.unitKg)errors.push('周贸易标的与实际谷物重量不符');
    for(const l of r.lanes??[]){
        const seller=ps.find(p=>p.settlement===l.seller),buyer=ps.find(p=>p.settlement===l.buyer);
        if(!l.id||ids.has(l.id)||l.id===seller?.tradeContract?.id||!seller?.opening||!buyer?.opening||l.seller===l.buyer||r.targetDays<=seller.reserveDays||!integer(l.maximumQuantity,1)||!integer(l.taxBps)||l.taxBps!==seller?.tradeContract?.taxBps||l.mode!=='walk'||!l.routes?.length||l.routes.some(id=>!world.routes.some(e=>e.id===id)))errors.push(`周贸易来源、两端或税章无效：${l.id}`);
        ids.add(l.id);
    }
    return errors;
}
function assertRules(engine){
    const errors=validateSettlementTradeRules(engine.world);if(errors.length)throw Error(errors.join('；'));
}
function assertOrder(o){
    if(o.status==='refused'){
        if(o.quantity!==0||o.escrowCopper!==0||o.transport)throw Error('周贸易拒发账不守恒');
        return;
    }
    const invalid=()=>{throw Error('周贸易在途货物或资金账不守恒，拒绝结算或补齐');};
    if(!['in-transit','delivered','partial','spoiled','rejected'].includes(o.status)||!Array.isArray(o.batches)||!Array.isArray(o.entries)||!o.transport)invalid();
    if(['quantity','workers','unitPriceCopper'].some(k=>!integer(o[k],1))||['escrowCopper','paidCopper','refundCopper','taxCopper','spoiledFood','rejectedFood','deliveredFood'].some(k=>!integer(o[k])))invalid();
    if(o.batches.some(b=>!integer(b.amount,1)||!Number.isSafeInteger(b.expiresDay)||b.kind!=='grain'))invalid();
    const sent=o.entries.find(e=>e.phase==='dispatch'),cost=o.quantity*o.unitPriceCopper;
    if(o.quantity!==cargo(o)+o.spoiledFood+o.rejectedFood+o.deliveredFood||cost!==o.escrowCopper+o.paidCopper+o.refundCopper||o.taxCopper!==Math.floor(o.paidCopper*o.taxBps/10000))invalid();
    if(sent?.quantity!==o.quantity||sent?.workers!==o.workers||sent?.escrowCopper!==cost||sent?.seller!==o.seller||sent?.buyer!==o.buyer||sent?.item!==o.item||sent?.unitPriceCopper!==o.unitPriceCopper||sent?.taxBps!==o.taxBps||sent?.minute!==o.dispatchAt)invalid();
    if(o.status==='in-transit'?o.escrowCopper!==cost:o.escrowCopper!==0||cargo(o)!==0)invalid();
    if(!['outbound','returning','home'].includes(o.transport.phase)||o.transport.phase!=='home'&&!integer(o.transport.nextAt,1))invalid();
}
function managed(state,id){return state.settlements?.[id]&&state.records?.[`agriculture:${id}`]?.mode==='managed';}
function warehouse(d,id){
    const s=clone(d.get('state','settlements',id)),r=clone(d.get('state','records',`agriculture:${id}`));
    if(!s||r?.mode!=='managed')return null;
    if(!integer(s.food)||!integer(s.treasury)||!integer(s.population)||!Array.isArray(r.batches)||r.batches.some(b=>!integer(b.amount,1)||!Number.isSafeInteger(b.expiresDay))||r.batches.reduce((n,b)=>n+b.amount,0)!==s.food||r.field.seedBatches.reduce((n,b)=>n+b.amount,0)!==r.field.seedBank)throw Error('周贸易粮仓或现金账不守恒，拒绝补齐');
    return{s,r};
}
function putWarehouse(d,id,{s,r}){d.set(['state','settlements',id],s);d.set(['state','records',`agriculture:${id}`],r);}
function grain(w,day){return w.r.batches.filter(b=>b.kind==='grain'&&b.expiresDay>day).reduce((n,b)=>n+b.amount,0);}
function reserved(state,id){return orders(state).filter(o=>o.buyer===id&&o.status==='in-transit').reduce((n,o)=>n+cargo(o),0);}
function fiscal(d,id){
    const f=clone(d.get('state','records',`village-fiscal:${id}`)??{category:'village_fiscal',openingTreasuryCopper:d.get('state','settlements',id,'treasury'),advanceCopper:0,salesGrossCopper:0,salesNetCopper:0,taxReceiptsCopper:0,purchasesCopper:0,exportedFood:0,importedFood:0,entries:[]});
    const sum=k=>f.entries?.reduce((n,e)=>n+(e[k]??0),0);
    if(f.category!=='village_fiscal'||!Array.isArray(f.entries)||['openingTreasuryCopper','advanceCopper','salesGrossCopper','salesNetCopper','taxReceiptsCopper','purchasesCopper','exportedFood','importedFood'].some(k=>!integer(f[k]))||f.salesGrossCopper!==f.salesNetCopper+f.taxReceiptsCopper||f.advanceCopper!==sum('advanceCopper')||f.salesNetCopper!==sum('netCopper')||f.taxReceiptsCopper!==sum('taxCopper')||f.purchasesCopper!==-f.entries.filter(e=>e.phase==='deliver').reduce((n,e)=>n+e.copper,0)||f.exportedFood!==-f.entries.filter(e=>e.phase==='pickup').reduce((n,e)=>n+e.food,0)||f.importedFood!==f.entries.filter(e=>e.phase==='deliver').reduce((n,e)=>n+e.food,0))throw Error('周贸易税贸明细不守恒，拒绝覆盖');
    return f;
}
function region(engine,location){
    const seen=new Set();while(location&&!seen.has(location)){
        if(profile(engine,location)?.opening)return location;
        seen.add(location);location=engine.byId.get(location)?.parent;
    }
    return null;
}
export function regionalTradePrice(d,engine,item,location,minute=d.get('state','minute')){
    const base=engine.byId.get(item).basePrice,r=engine.rules.settlementTrade,sid=region(engine,location);
    // U3 price swings (hazard clocks) scale the seasonal coefficient here, so
    // shop quotes, business and village lanes all read one figure.
    // U10: life-magic price cuts settled at midnight (magic-economy.mjs).
    const swing=hazardPriceFactor(engine,d.get('state'),item,location,minute),magic=magicPriceFactor(engine,d.get('state'),item,location),resource=forestWaterPriceFactor(engine,d.get('state'),item,location),hazard=swing*magic*resource;
    if(!r||item!==r.item||!sid||!managed(d.get('state'),sid))return hazard===1?base:base*hazard;
    assertRules(engine);
    const day=Math.floor(minute/DAY),key=`region:${day}:${sid}:${item}`,existing=d.get('state','quotes',key);
    if(existing!==undefined){if(!integer(existing,1))throw Error('区域报价账无效');return existing;}
    const w=warehouse(d,sid),lane=r.lanes.find(l=>l.buyer===sid),target=w.s.population*r.targetDays;
    const actual=grain(w,day),demand=clamp(target/Math.max(1,actual),...engine.rules.economy.priceFactorLimits.region);
    const distanceKm=(lane?.routes??[]).reduce((n,id)=>n+engine.world.routes.find(e=>e.id===id).lengthKm,0);
    let route=null,closed=false;
    if(lane)try{route=engine.route(profile(engine,lane.seller).counter,profile(engine,sid).counter,lane.mode,minute,d.document.randomSeed);}catch(error){if(!error.message.startsWith('没有当前季节'))throw error;closed=true;}
    const travelRisk=closed?3:Math.max(1,(route?.movingMinutes??0)/Math.max(1,distanceKm/engine.rules.travel.walkKmh*60));
    const transport=clamp((1+distanceKm*r.distanceFactorPerKm)*travelRisk,...engine.rules.economy.priceFactorLimits.transport),season=r.seasonFactors[engine.calendar(minute).season]*hazard;
    const price=Math.max(1,Math.ceil(base*demand*transport*season));
    d.set(['state','quotes',key],price);
    d.set(['state','records',`quote:${key}`],{category:'regional_quote',day,settlement:sid,item,price,basePrice:base,grain:actual,targetFood:target,regionFactor:demand,transportFactor:transport,seasonFactor:season,...(swing!==1?{hazardFactor:swing}:{}),...(magic!==1?{magicFactor:magic}:{}),...(resource!==1?{resourceFactor:resource}:{}),distanceKm,routeMinutes:route?.minutes??null,closed,source:r.source});
    return price;
}
function spareWorkers(state,engine,sid){
    const p=profile(engine,sid),s=state.settlements[sid],r=engine.rules.settlementTrade;
    const available=Math.max(0,Math.floor(s.population*p.workerFraction)-(state.records?.[`levy:${sid}`]?.count??0));// U12 levy
    const spare=Math.max(0,available-p.processingWorkers-p.freshWorkers-p.farmWorkers-2);
    const busy=orders(state).filter(o=>o.seller===sid&&o.transport&&o.transport.phase!=='home').reduce((n,o)=>n+o.workers,0);
    return Math.max(0,Math.min(r.workersMaximum,spare)-busy);
}
function entry(o,phase,minute,detail={}){o.entries.push({phase,minute,...detail});}
function routeEdge(engine,o){return engine.world.routes.find(e=>e.id===o.transport.edges[o.transport.edgeIndex]);}
function schedule(d,engine,o,minute){
    const t=o.transport;
    if(t.edgeIndex>=t.edges.length){
        if(t.phase==='outbound'){
            arrive(d,engine,o,minute);
            t.phase='returning';t.edges=[...t.edges].reverse();t.edgeIndex=0;t.remainingKm=null;
            entry(o,'return',minute);
            return schedule(d,engine,o,minute);
        }
        t.phase='home';t.nextAt=null;o.homeAt=minute;entry(o,'home',minute);return;
    }
    const segment=transportSegment(engine,d.get('state'),d.document.randomSeed,t,o.mode,minute);
    if(segment.kind==='rest'){t.segment=segment;t.nextAt=minute+segment.minutes;return;}
    const edge=routeEdge(engine,o);
    if(segment.kind==='wait'){
        t.segment={kind:'wait',minutes:segment.minutes};t.nextAt=minute+t.segment.minutes;t.waitReason=segment.reason;
        entry(o,'blocked',minute,{location:t.location,edge:t.edges[t.edgeIndex]});return;
    }
    t.waitReason=null;
    if(t.remainingKm===null)t.remainingKm=edge.lengthKm;
    t.segment=segment;t.nextAt=minute+segment.minutes;
}
function spoil(d,engine,o,minute){
    const day=Math.floor(minute/DAY),gone=o.batches.filter(b=>b.expiresDay<=day),expired=gone.reduce((n,b)=>n+b.amount,0);
    for(const b of gone)moveStock(d,{from:cargoAccount(engine,`settlement-trade:${o.id}`,o.item),to:`sink:decay|${cargoAccount(engine,`settlement-trade:${o.id}`,o.item).split('|')[1]}|spoil`,amount:b.amount,writer:'settlement-trade',eventId:o.id,pick:[String(b.id)]});
    if(expired){o.batches=o.batches.filter(b=>b.expiresDay>day);o.spoiledFood+=expired;entry(o,'spoil',minute,{food:expired});}
}
function arrive(d,engine,o,minute){
    const a=warehouse(d,o.seller),b=warehouse(d,o.buyer);
    if(!a||!b)throw Error('周贸易到货两端真实账缺失；不能生成公仓');
    spoil(d,engine,o,minute);
    const space=Math.max(0,granaryCapacity(engine,d.get('state'),o.buyer,b.r.granary.capacity)-b.s.food-b.r.field.seedBank),accepted=Math.min(cargo(o),space);
    const gross=accepted*o.unitPriceCopper,refund=o.escrowCopper-gross,tax=Math.floor(gross*o.taxBps/10000);
    if(!integer(refund))throw Error('周贸易预付资金不守恒');
    let remaining=accepted;
    for(const [i,batch]of o.batches.entries()){
        const amount=Math.min(remaining,batch.amount);if(amount)b.r.batches.push({...batch,amount,id:`${o.id}:${i}`,source:`周贸易${o.id}原批${batch.id}`});remaining-=amount;
        const from=cargoAccount(engine,`settlement-trade:${o.id}`,o.item);
        moveStock(d,{from,to:granaryAccount(engine,o.buyer),amount,writer:'settlement-trade',eventId:o.id,pick:[String(batch.id)],lot:{id:`${o.id}:${i}`}});
        // 仓容不足拒收的部分不回原仓（旧账 rejectedFood），在交割处毁弃。
        moveStock(d,{from,to:`sink:destroy|${from.split('|')[1]}|rejected`,amount:batch.amount-amount,writer:'settlement-trade',eventId:o.id,pick:[String(batch.id)]});
    }
    moveCoins(d,{from:escrowAccount(`settlement-trade:${o.id}`),to:treasuryAccount(o.seller),amount:gross,writer:'settlement-trade',eventId:o.id});moveCoins(d,{from:escrowAccount(`settlement-trade:${o.id}`),to:treasuryAccount(o.buyer),amount:refund,writer:'settlement-trade',eventId:o.id});
    b.s.food+=accepted;b.r.ledger.donated+=accepted;b.s.treasury+=refund;a.s.treasury+=gross;
    const sf=fiscal(d,o.seller),bf=fiscal(d,o.buyer);
    sf.salesGrossCopper+=gross;sf.salesNetCopper+=gross-tax;sf.taxReceiptsCopper+=tax;
    sf.entries.push({eventId:o.id,contract:o.id,phase:'recognized',other:o.buyer,minute,food:0,copper:gross,netCopper:gross-tax,taxCopper:tax});
    bf.purchasesCopper+=gross;bf.importedFood+=accepted;
    bf.entries.push({eventId:o.id,contract:o.id,phase:'deliver',other:o.seller,minute,food:accepted,copper:-gross,refundCopper:refund});
    o.rejectedFood=cargo(o)-accepted;o.deliveredFood=accepted;o.paidCopper=gross;o.refundCopper=refund;o.taxCopper=tax;o.escrowCopper=0;o.arrivedAt=minute;
    o.status=accepted===o.quantity?'delivered':accepted?'partial':o.spoiledFood===o.quantity?'spoiled':'rejected';
    entry(o,'arrival',minute,{receivedFood:accepted,rejectedFood:o.rejectedFood,spoiledFood:o.spoiledFood,grossCopper:gross,netCopper:gross-tax,taxCopper:tax,refundCopper:refund});
    if(d.get('state','location')===profile(engine,o.buyer).counter)d.say?.(`周贸易${o.id}到货：入仓${accepted}份，货价${gross}铜，其中税款${tax}铜；粮损${o.spoiledFood+o.rejectedFood}份，退预付款${refund}铜`);
    o.batches=[];putWarehouse(d,o.seller,a);putWarehouse(d,o.buyer,b);
    d.set(['state','records',`village-fiscal:${o.seller}`],sf);d.set(['state','records',`village-fiscal:${o.buyer}`],bf);
}
function dispatch(d,engine,lane,minute){
    const r=engine.rules.settlementTrade,day=Math.floor(minute/DAY),id=`${lane.id}:${day}`,path=['state','records',`settlement-trade:${id}`];
    if(d.get(...path)){if(d.get(...path).category!=='settlement_trade')throw Error('周订单编号冲突，拒绝覆盖');return;}
    const a=warehouse(d,lane.seller),b=warehouse(d,lane.buyer);
    const reject=reason=>d.set(path,{category:'settlement_trade',id,lane:lane.id,seller:lane.seller,buyer:lane.buyer,status:'refused',reason,quantity:0,batches:[],escrowCopper:0,dispatchAt:minute,entries:[{phase:'refused',minute,reason}],source:r.source});
    if(!a||!b)return reject('缺已采用的真实公仓');
    const workers=spareWorkers(d.get('state'),engine,lane.seller);
    if(!workers)return reject('无空余劳力或运力仍在路上');
    let route;
    try{route=engine.route(profile(engine,lane.seller).counter,profile(engine,lane.buyer).counter,lane.mode,minute,d.document.randomSeed);}catch(error){if(!error.message.startsWith('没有当前季节'))throw error;return reject('封路或天气不通');}
    if(route.cost)return reject('路线收费没有登记的实际收款账');
    if(lane.routes.some(id=>!route.edges.includes(id)))return reject('实际路线偏离登记贸易道路');
    const reserve=a.s.population*profile(engine,lane.seller).reserveDays,surplus=Math.max(0,grain(a,day)-reserve);
    const pending=reserved(d.get('state'),lane.buyer),demand=Math.max(0,b.s.population*r.targetDays-grain(b,day)-pending);
    const space=Math.max(0,b.r.granary.capacity-b.s.food-b.r.field.seedBank-pending);
    if(!surplus)return reject('无实际可出口余粮');if(!demand)return reject('无登记目标内的实际需求');if(!space)return reject('收货仓容已满或已预留');
    const price=regionalTradePrice(d,engine,r.item,lane.buyer,minute);
    const quantity=Math.min(lane.maximumQuantity,Math.floor(workers*r.carryKgPerWorker/r.unitKg),surplus,demand,space,Math.floor(b.s.treasury/price));
    if(!quantity)return reject('买方无足额实际现金');
    const parts=[];let remaining=quantity;
    a.r.batches.sort((x,y)=>x.expiresDay-y.expiresDay||x.id.localeCompare(y.id));
    for(const batch of a.r.batches){if(batch.kind!=='grain'||batch.expiresDay<=day)continue;const amount=Math.min(remaining,batch.amount);if(amount){parts.push({...batch,amount});moveStock(d,{from:granaryAccount(engine,lane.seller),to:cargoAccount(engine,`settlement-trade:${id}`,r.item),amount,writer:'settlement-trade',eventId:id,pick:[String(batch.id)]});}batch.amount-=amount;remaining-=amount;if(!remaining)break;}
    a.r.batches=a.r.batches.filter(b=>b.amount>0);a.s.food-=quantity;a.r.ledger.sold+=quantity;
    const cost=quantity*price;moveCoins(d,{from:treasuryAccount(lane.buyer),to:escrowAccount(`settlement-trade:${id}`),amount:cost,writer:'settlement-trade',eventId:id});b.s.treasury-=cost;
    const sf=fiscal(d,lane.seller),bf=fiscal(d,lane.buyer);
    sf.exportedFood+=quantity;sf.entries.push({eventId:id,contract:id,phase:'pickup',other:lane.buyer,minute,food:-quantity,copper:0,advanceCopper:0,taxCopper:0});
    bf.entries.push({eventId:id,contract:id,phase:'reserve',other:lane.seller,minute,food:0,copper:-cost,escrowCopper:cost});
    const o={category:'settlement_trade',id,lane:lane.id,seller:lane.seller,buyer:lane.buyer,item:r.item,mode:lane.mode,source:r.source,status:'in-transit',quantity,workers:Math.ceil(quantity*r.unitKg/r.carryKgPerWorker),unitPriceCopper:price,taxBps:tradeTax(engine,d.get('state'),lane.seller).bps,batches:parts,spoiledFood:0,rejectedFood:0,deliveredFood:0,paidCopper:0,refundCopper:0,taxCopper:0,escrowCopper:cost,dispatchAt:minute,estimatedArrivalAt:minute+route.minutes,entries:[],transport:{phase:'outbound',edges:route.edges,edgeIndex:0,location:profile(engine,lane.seller).counter,remainingKm:null,movingMinutes:0,restedBudgets:0,nextAt:null,segment:null}};
    entry(o,'dispatch',minute,{seller:o.seller,buyer:o.buyer,item:o.item,unitPriceCopper:price,taxBps:o.taxBps,quantity,escrowCopper:cost,workers:o.workers,route:route.edges,estimatedMinutes:route.minutes});
    if(d.get('state','location')===profile(engine,lane.seller).counter)d.say?.(`周贸易${id}发货：${engine.byId.get(r.item).name}${quantity}份，运往${engine.byId.get(lane.buyer).name}，预付款${cost}铜入在途账`);
    putWarehouse(d,lane.seller,a);putWarehouse(d,lane.buyer,b);
    d.set(['state','records',`village-fiscal:${lane.seller}`],sf);d.set(['state','records',`village-fiscal:${lane.buyer}`],bf);
    schedule(d,engine,o,minute);assertOrder(o);d.set(path,o);
    const origin=profile(engine,lane.seller).counter,destination=profile(engine,lane.buyer).counter;
    // Gradual adoption: a real available carrier replaces only the outbound
    // movement; food batches, spoilage and purchase escrow remain this ledger.
    for(const service of transportServices(engine,d.get('state'),origin)){
        let quote;try{quote=quoteTransport(d,engine,{asset:service.asset,from:origin,to:destination,cargo:[{item:r.item,quantity}]});}catch{continue;}
        if(d.get('state','settlements',lane.seller,'treasury')<quote.total)continue;
        const trip=bookTransport(d,engine,{owner:lane.seller,recipient:lane.buyer,from:origin,to:destination,asset:service.asset,cargo:[{item:r.item,quantity}],externalOrder:`settlement-trade:${id}`},`grain:${id}`);
        o.carriage=trip.id;o.estimatedArrivalAt=trip.estimatedArrivalAt;d.set(path,o);break;
    }
}
function nextDispatch(engine,minute){
    const r=engine.rules.settlementTrade,first=r.firstDay*DAY+r.dispatchMinute,cycle=r.cycleDays*DAY;
    return minute<=first?first:first+Math.ceil((minute-first)/cycle)*cycle;
}
export function nextSettlementTradeMinute(state,engine,now){
    if(!engine.rules.settlementTrade)return Infinity;
    let next=state.records?.[CLOCK]?.nextDispatchAt??nextDispatch(engine,now);
    if(next<=now)next=nextDispatch(engine,now+1);
    for(const o of orders(state))if(!(o.carriage&&o.transport?.phase==='outbound')&&o.transport?.nextAt>now)next=Math.min(next,o.transport.nextAt);
    return next;
}
export function advanceSettlementTrade(d,engine,minute){
    if(!engine.rules.settlementTrade)return;
    const r=engine.rules.settlementTrade,state=d.get('state');
    if(!r.lanes.some(l=>managed(state,l.seller)&&managed(state,l.buyer))&&!orders(state).some(o=>o.transport?.nextAt))return;
    assertRules(engine);
    for(const [key,o]of Object.entries(state.records??{}))if(o.category==='settlement_trade'&&key!==`settlement-trade:${o.id}`)throw Error('周贸易记录编号不守恒，拒绝重复结算');
    for(const old of orders(state)){
        assertOrder(old);
        if(!old.transport||old.transport.phase==='home')continue;
        const o=clone(old);if(o.status==='in-transit')spoil(d,engine,o,minute);
        if(o.carriage&&o.transport.phase==='outbound'){
            const trip=d.get('state','records',o.carriage);
            if(trip?.status==='delivered'){
                o.transport.location=profile(engine,o.buyer).counter;o.transport.edgeIndex=o.transport.edges.length;
                schedule(d,engine,o,minute);
            }
            assertOrder(o);if(JSON.stringify(o)!==JSON.stringify(old))d.set(['state','records',`settlement-trade:${o.id}`],o);continue;
        }
        if(o.transport.nextAt<minute)throw Error('周贸易时钟越过未处理的在途节点');
        if(o.transport.nextAt===minute){
            const t=o.transport,s=t.segment;
            if(s.kind==='move'){
                t.remainingKm=Math.max(0,t.remainingKm-s.distanceKm);t.movingMinutes+=s.minutes;
                if(t.remainingKm<=1e-9){t.location=s.destination;t.edgeIndex++;t.remainingKm=null;entry(o,'waypoint',minute,{location:t.location});}
            }else if(s.kind==='rest')t.restedBudgets++;
            schedule(d,engine,o,minute);
        }
        assertOrder(o);
        if(JSON.stringify(o)!==JSON.stringify(old))d.set(['state','records',`settlement-trade:${o.id}`],o);
    }
    const clock=d.get('state','records',CLOCK)??{category:'settlement_trade_clock',initializedAt:minute,nextDispatchAt:nextDispatch(engine,minute)};
    if(clock.category!=='settlement_trade_clock'||!integer(clock.nextDispatchAt,1))throw Error('周贸易时钟记录无效');
    if(clock.nextDispatchAt<minute)throw Error('周贸易时钟越过未处理的周订单');
    if(clock.nextDispatchAt===minute){
        for(const lane of r.lanes)dispatch(d,engine,lane,minute);
        d.set(['state','records',CLOCK],{...clock,nextDispatchAt:minute+r.cycleDays*DAY,lastDispatchAt:minute});
    }else if(!d.get('state','records',CLOCK))d.set(['state','records',CLOCK],clock);
}

// Military quartermasters use the same regional quote, route availability and granary outflow.
export function armySupplyQuote(d,engine,base,location,minute){
    const item=engine.rules.settlementTrade?.item??engine.rules.agriculture?.grainItem??'item_oats';
    let closed=false;
    if(base!==location)try{engine.route(base,location,'walk',minute,d.document.randomSeed);}catch(error){if(!error.message.startsWith('没有当前季节'))throw error;closed=true;}
    return {price:Math.ceil(regionalTradePrice(d,engine,item,base,minute)),closed};
}
export function drawArmyRations(d,engine,settlement,quantity,options){return drawGranary(d,engine,settlement,quantity,options);}
