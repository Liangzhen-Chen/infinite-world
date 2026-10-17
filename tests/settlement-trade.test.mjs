import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {resyncBooks} from './helpers/ledger-sync.mjs';
import {regionalTradePrice,validateSettlementTradeRules} from '../server-plugin/settlement-trade.mjs';
import {settlementTradeRules} from '../world/design/m5-trade-rules.mjs';
import {createTransportAsset} from '../server-plugin/transport.mjs';

const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const DAY=1440,DEPART=7*DAY+540,lanes=world.rules.settlementTrade.lanes;
const key=(lane,day=7)=>`settlement-trade:${lane.id}:${day}`;
const farm=(doc,id)=>doc.state.records[`agriculture:${id}`];
function setup({source=world,realNpcs=false}={}){
    const w=structuredClone(source);if(!realNpcs)for(const n of w.npcs){delete n.schedule;delete n.tier;}
    const engine=new WorldEngine(w),doc=engine.createCharacter(legacy,{},'trade-test');
    return {world:w,engine,doc};
}
async function wait(engine,doc,end,eventId='wait'){
    assert.ok(end>doc.state.minute);
    const out=await engine.reduce(doc,{tool:'world_time',args:{minutes:end-doc.state.minute},eventId});
    return {doc:applyPatches(doc,out.patches),out};
}
function draft(doc){return {document:doc,get(...p){return p.reduce((v,k)=>v?.[k],this.document);},set(p,value){this.document=applyPatches(this.document,[{op:'set',path:p,value}]);}};}
function snapshotCash(doc){
    // NPC and village quest deposits remain part of these accounts while held in escrow.
    const questEscrow=Object.values(doc.state.quests??{}).filter(q=>!q.fundedBy?.faction).reduce((n,q)=>n+(q.escrow??0),0);
    return doc.state.player.coins+Object.values(doc.state.npcs).reduce((n,p)=>n+p.coins,0)+Object.values(doc.state.settlements).reduce((n,s)=>n+s.treasury,0)+Object.values(doc.state.workshopFunds??{}).reduce((n,copper)=>n+copper,0)+Object.values(doc.state.records).filter(r=>r.category==='settlement_trade').reduce((n,o)=>n+o.escrowCopper,0)+questEscrow;
}
function conservation(doc){
    for(const p of world.rules.agriculture.settlements.filter(p=>p.opening)){
        const r=farm(doc,p.settlement),s=doc.state.settlements[p.settlement],l=r.ledger;
        assert.equal(r.batches.reduce((n,b)=>n+b.amount,0),s.food);
        assert.equal(l.openingFood+l.openingSeed+l.freshProduced+l.harvested+l.donated+l.seedDonated,s.food+r.field.seedBank+l.eaten+l.spoiled+l.overflow+l.seedSpent+l.sold);
        assert.ok(s.food+r.field.seedBank<=r.granary.capacity);
        assert.ok(s.treasury>=0);
    }
    const os=Object.values(doc.state.records).filter(r=>r.category==='settlement_trade'&&r.transport);
    for(const o of os){
        assert.equal(o.quantity,o.batches.reduce((n,b)=>n+b.amount,0)+o.deliveredFood+o.spoiledFood+o.rejectedFood);
        assert.equal(o.quantity*o.unitPriceCopper,o.escrowCopper+o.paidCopper+o.refundCopper);
        assert.equal(o.taxCopper,Math.floor(o.paidCopper*o.taxBps/10000));
    }
    assert.equal(os.reduce((n,o)=>n+o.quantity,0),os.reduce((n,o)=>n+o.batches.reduce((n,b)=>n+b.amount,0)+o.deliveredFood+o.spoiledFood+o.rejectedFood,0));
}
function setGrain(doc,id,quantity,{expiresDay=210}={}){
    const r=farm(doc,id),s=doc.state.settlements[id];s.food=quantity;
    r.batches=quantity?[{id:'source_opening',kind:'grain',amount:quantity,harvestDay:-150,expiresDay,source:'isolated fixture actual stock'}]:[];
    r.ledger.openingFood=quantity;r.ledger.freshProduced=0;r.ledger.eaten=0;r.ledger.spoiled=0;r.ledger.overflow=0;
}
function tradeState(doc){return {settlements:doc.state.settlements,records:doc.state.records,quotes:doc.state.quotes};}

test('规则只使用现有四村、原税章与道路，正式配置和设计一致，非法来源拒绝',()=>{
    assert.deepEqual(world.rules.settlementTrade,settlementTradeRules);
    assert.deepEqual(validateSettlementTradeRules(world),[]);
    for(const mutate of [r=>r.lanes[0].buyer='loc_invented',r=>r.lanes[0].taxBps=9999,r=>r.lanes[0].routes=['invented'],r=>r.unitKg=1,r=>r.cycleDays=0,r=>r.workersMaximum=-1]){
        const bad=structuredClone(world);mutate(bad.rules.settlementTrade);assert.ok(validateSettlementTradeRules(bad).length);
    }
});
test('NPC公仓购买真实驮队服务，货批与预付款仍由原账只结算一次',async()=>{
    const {engine,doc,world:w}=setup(),lane=lanes[0],carrier='npc_hw_zhengshuisheng',origin=w.rules.agriculture.settlements.find(p=>p.settlement===lane.seller).counter;
    Object.assign(doc.state.npcs[carrier],{location:origin,activity:'营业',status:'正常',coins:1000});
    doc.state.creatures??={};doc.state.creatures.transport_bull={species:'monster_slate_horn_bull',owner:carrier,location:origin,hp:40,maxHp:40,status:'正常'};
    const d=draft(doc);createTransportAsset(d,engine,{owner:carrier,kind:'pack',animal:'transport_bull'},'grain-pack');
    const cash=snapshotCash(d.document),first=await wait(engine,d.document,DEPART),order=first.doc.state.records[key(lane)];assert.ok(order.carriage);
    const shipment=first.doc.state.records[order.carriage];assert.equal(shipment.externalOrder,key(lane));assert.deepEqual(shipment.cargo,[]);assert.equal(snapshotCash(first.doc),cash);conservation(first.doc);
    const arrived=(await wait(engine,first.doc,shipment.estimatedArrivalAt+DAY)).doc,o=arrived.state.records[key(lane)];assert.equal(o.status,'delivered');assert.equal(o.deliveredFood,o.quantity);assert.equal(o.escrowCopper,0);assert.equal(arrived.state.records[order.carriage].status,'delivered');assert.equal(snapshotCash(arrived),cash);conservation(arrived);
});

test('正常world_time周发货→逐路在途→到货税款；双方现金、粮批和玩家合同保持真实',async()=>{
    const {engine,doc}=setup(),cash=snapshotCash(doc),privateAssets=structuredClone({player:doc.state.player.coins,inventory:doc.state.inventory,npcs:Object.fromEntries(Object.entries(doc.state.npcs).map(([id,n])=>[id,{coins:n.coins,inventory:n.inventory}]))});
    const before=structuredClone(doc),first=await wait(engine,doc,DEPART);assert.deepEqual(doc,before);
    let c=first.doc;assert.equal(snapshotCash(c),cash);conservation(c);
    for(const lane of lanes){
        const o=c.state.records[key(lane)];assert.equal(o.status,'in-transit');assert.equal(o.quantity,40);assert.ok(o.estimatedArrivalAt>DEPART);assert.equal(o.escrowCopper,o.quantity*o.unitPriceCopper);assert.equal(o.paidCopper,0);
        const f=c.state.records[`village-fiscal:${lane.seller}`];assert.equal(f.taxReceiptsCopper,0);assert.equal(f.salesGrossCopper,0);
        assert.equal(c.state.records[`village-trade:${world.rules.agriculture.settlements.find(p=>p.settlement===lane.seller).tradeContract.id}`],undefined);
    }
    const end=Math.max(...lanes.map(l=>c.state.records[key(l)].estimatedArrivalAt));
    c=(await wait(engine,c,end)).doc;assert.equal(snapshotCash(c),cash);conservation(c);
    for(const lane of lanes){
        const o=c.state.records[key(lane)],f=c.state.records[`village-fiscal:${lane.seller}`];
        assert.equal(o.status,'delivered');assert.equal(o.arrivedAt,o.estimatedArrivalAt);assert.equal(o.deliveredFood,40);assert.equal(o.escrowCopper,0);assert.equal(o.taxCopper,Math.floor(o.paidCopper*.05));
        assert.equal(f.salesGrossCopper,f.salesNetCopper+f.taxReceiptsCopper);assert.ok(f.entries.some(e=>e.phase==='recognized'&&e.other===lane.buyer));
        const batches=farm(c,lane.buyer).batches.filter(b=>b.id.startsWith(o.id));assert.equal(batches.reduce((n,b)=>n+b.amount,0),40);assert.ok(batches.every(b=>b.expiresDay===210));
    }
    assert.deepEqual({player:c.state.player.coins,inventory:c.state.inventory,npcs:Object.fromEntries(Object.entries(c.state.npcs).map(([id,n])=>[id,{coins:n.coins,inventory:n.inventory}]))},privateAssets);
    assert.deepEqual(applyPatches(first.doc,first.out.patches),first.doc);
});
test('大小时间步、跨两周与JSON重启得到相同粮、现金、税账、在途和锁价',async()=>{
    const {engine,doc,world:w}=setup(),end=15*DAY+900,cash=snapshotCash(doc);
    const large=(await wait(engine,doc,end,'large')).doc;let small=doc;
    for(const at of [6*DAY+1300,DEPART,DEPART+20,8*DAY,9*DAY+123,13*DAY+22,14*DAY+540,end])small=(await wait(engine,small,at,`small-${at}`)).doc;
    assert.deepEqual(tradeState(small),tradeState(large));assert.equal(snapshotCash(large),cash);conservation(large);
    let restored=(await wait(engine,doc,DEPART+20)).doc;
    restored=JSON.parse(JSON.stringify(restored));restored=(await wait(new WorldEngine(w),restored,end,'restart')).doc;
    assert.deepEqual(tradeState(restored),tradeState(large));assert.ok(lanes.every(l=>large.state.records[key(l,14)].quantity>0));
});
test('封路拒发不扣货钱；后周重开沿真实路发货，不补发拒绝周',async()=>{
    const {engine,doc,world:w}=setup(),cash=snapshotCash(doc);w.routes.find(r=>r.id==='route_bs_yp').closedSeasons=[0];
    let c=(await wait(engine,doc,DEPART)).doc;
    assert.equal(c.state.records[key(lanes[0])].status,'refused');assert.match(c.state.records[key(lanes[0])].reason,/封路/);assert.equal(c.state.records[key(lanes[0])].quantity,0);assert.equal(snapshotCash(c),cash);
    w.routes.find(r=>r.id==='route_bs_yp').closedSeasons=[];c=(await wait(new WorldEngine(w),c,14*DAY+540)).doc;
    assert.equal(c.state.records[key(lanes[0],14)].status,'in-transit');assert.equal(c.state.records[key(lanes[0])].status,'refused');conservation(c);
});
test('途中下一路封闭会等待、继续腐坏；重启重开后才到货，返程也占用运力',async()=>{
    const {engine,doc,world:w}=setup(),cash=snapshotCash(doc);
    let c=(await wait(engine,doc,DEPART+1)).doc;
    const lane=lanes[0],order=c.state.records[key(lane)];
    w.routes.find(r=>r.id==='route_bs_wt').closedSeasons=[0];
    c=(await wait(new WorldEngine(w),c,DEPART+2*DAY)).doc;
    assert.equal(c.state.records[key(lane)].status,'in-transit');assert.match(c.state.records[key(lane)].transport.waitReason,/不通/);assert.equal(c.state.records[key(lane)].transport.location,'loc_bs');
    c=(await wait(new WorldEngine(w),c,14*DAY+540)).doc;
    assert.equal(c.state.records[key(lane,14)].status,'refused');assert.match(c.state.records[key(lane,14)].reason,/运力/);
    w.routes.find(r=>r.id==='route_bs_wt').closedSeasons=[];
    c=(await wait(new WorldEngine(w),JSON.parse(JSON.stringify(c)),16*DAY)).doc;
    assert.equal(c.state.records[key(lane)].status,'delivered');assert.ok(c.state.records[key(lane)].arrivedAt>order.estimatedArrivalAt);assert.equal(snapshotCash(c),cash);conservation(c);
});
test('足额粮不足、现金不足、仓容不足和空余劳力为零分别拒绝，部分现金只买实际支付量',async()=>{
    for(const scenario of ['grain','cash','capacity','labour','partial']){
        const {engine,doc}=setup(),lane=lanes[0],buyer=lane.buyer,seller=lane.seller;
        if(scenario==='grain')setGrain(doc,seller,doc.state.settlements[seller].population*90);
        if(scenario==='cash')doc.state.settlements[buyer].treasury=0;
        if(scenario==='capacity')farm(doc,buyer).granary.capacity=doc.state.settlements[buyer].food+farm(doc,buyer).field.seedBank;
        if(scenario==='labour')doc.state.settlements[seller].population=40;
        const prepared=(await wait(engine,doc,DEPART-1)).doc;
        // Change actual capacity/cash immediately before the weekly consumer.
        if(scenario==='grain')setGrain(prepared,seller,prepared.state.settlements[seller].population*90);
        if(scenario==='capacity')farm(prepared,buyer).granary.capacity=prepared.state.settlements[buyer].food+farm(prepared,buyer).field.seedBank;
        if(scenario==='partial')prepared.state.settlements[buyer].treasury=11;
        const cash=snapshotCash(prepared),c=(await wait(engine,prepared,DEPART)).doc,o=c.state.records[key(lane)];
        assert.equal(snapshotCash(c),cash);conservation(c);
        if(scenario==='partial'){assert.equal(o.status,'in-transit');assert.equal(o.quantity,Math.floor(11/o.unitPriceCopper));assert.ok(o.quantity<40);}
        else {assert.equal(o.status,'refused');assert.match(o.reason,{grain:/余粮/,cash:/现金/,capacity:/仓容/,labour:/劳力/}[scenario]);}
    }
});
test('到货前粮批过期逐批记损失、退款，不重置保质期；有效批仍交割并按实际货价记税',async()=>{
    const {engine,doc,world:w}=setup(),lane=lanes[0];
    // Actual route is lengthened in this isolated fixture; traversal crosses midnight.
    w.routes.find(r=>r.id==='route_bs_wt').lengthKm=40;
    let c=(await wait(engine,doc,DEPART-1)).doc;
    const r=farm(c,lane.seller),expired={...r.batches[0],id:'earliest',amount:20,expiresDay:8};
    r.batches[0].amount-=20;r.batches.unshift(expired);const cash=snapshotCash(c);
    c=(await wait(engine,c,DEPART)).doc;assert.equal(c.state.records[key(lane)].quantity,40);
    const eta=c.state.records[key(lane)].estimatedArrivalAt;assert.ok(eta>=8*DAY);
    c=(await wait(engine,c,eta)).doc;const o=c.state.records[key(lane)];
    assert.equal(o.status,'partial');assert.equal(o.spoiledFood,20);assert.equal(o.deliveredFood,20);assert.equal(o.refundCopper,20*o.unitPriceCopper);assert.equal(o.paidCopper,20*o.unitPriceCopper);assert.equal(snapshotCash(c),cash);conservation(c);
    assert.ok(farm(c,lane.buyer).batches.filter(b=>b.id.startsWith(o.id)).every(b=>b.expiresDay===210));
});
test('收货仓容被其他真实粮占满则拒收并退款，粮损只记在途损失',async()=>{
    const {engine,doc}=setup(),lane=lanes[0];let c=(await wait(engine,doc,DEPART)).doc;
    const o=c.state.records[key(lane)],r=farm(c,lane.buyer);r.granary.capacity=c.state.settlements[lane.buyer].food+r.field.seedBank;
    const cash=snapshotCash(c);c=(await wait(engine,c,o.estimatedArrivalAt)).doc;
    const ended=c.state.records[key(lane)];assert.equal(ended.status,'rejected');assert.equal(ended.deliveredFood,0);assert.equal(ended.rejectedFood,40);assert.equal(ended.refundCopper,40*ended.unitPriceCopper);assert.equal(ended.taxCopper,0);assert.equal(snapshotCash(c),cash);conservation(c);
});
test('公共报价同日不漂，需求、距离与季节进入次日报价；未知或旧仓不生成库存',()=>{
    const {engine,doc}=setup(),lane=lanes[0],d=draft(doc),minute=DEPART;
    const first=regionalTradePrice(d,engine,'item_oats',lane.buyer,minute),quote=d.get('state','records',`quote:region:7:${lane.buyer}:item_oats`);
    assert.equal(quote.distanceKm,world.routes.filter(e=>lane.routes.includes(e.id)).reduce((n,e)=>n+e.lengthKm,0));assert.ok(quote.transportFactor>1);assert.equal(quote.seasonFactor,.9);
    setGrain(d.document,lane.buyer,100);assert.equal(regionalTradePrice(d,engine,'item_oats',lane.buyer,minute+1),first);
    const next=regionalTradePrice(d,engine,'item_oats',lane.buyer,minute+DAY);assert.ok(next>first);
    const outside=draft(structuredClone(doc));assert.equal(regionalTradePrice(outside,engine,'item_wood','loc_hw'),4);assert.deepEqual(outside.document,doc);
});
test('玩家world_trade消费区域公共价并扣真实既有商人库存；两次成交同日锁价、次日重报',async()=>{
    const {engine,doc}=setup(),sid=lanes[0].seller,seller='npc_hw_ayan';
    // Isolated encounter fixture: the existing merchant visits this public hall.
    // Inventory and both wallets are the unchanged source assets; no NPC is added.
    doc.state.location='bld_yp_hall';doc.state.npcs[seller].location=doc.state.location;
    const cash=snapshotCash(doc),initial=engine.quantity(draft(doc),seller,'item_oats'),wallet=doc.state.player.coins;
    const run=async(c,id)=>{const out=await engine.reduce(c,{tool:'world_trade',args:{seller,item:'item_oats',quantity:1},eventId:id});return{doc:applyPatches(c,out.patches),out};};
    const first=await run(doc,'local-buy');let c=first.doc;
    const day=Math.floor(doc.state.minute/DAY),price=c.state.quotes[`region:${day}:${sid}:item_oats`];
    assert.ok(price>engine.byId.get('item_oats').basePrice);assert.equal(first.out.result.cost,price);
    assert.equal(c.state.player.coins,wallet-price);assert.equal(engine.quantity(draft(c),seller,'item_oats'),initial-1);assert.equal(snapshotCash(c),cash);
    setGrain(c,sid,500);resyncBooks(engine,c);const second=await run(c,'same-day-buy');c=second.doc;
    assert.equal(second.out.result.cost,price);assert.equal(engine.quantity(draft(c),seller,'item_oats'),initial-2);
    c=(await wait(engine,c,(day+1)*DAY+540)).doc;
    const third=await run(c,'next-day-buy');c=third.doc;
    assert.ok(third.out.result.cost>price);assert.equal(snapshotCash(c),cash);assert.equal(engine.quantity(draft(c),seller,'item_oats'),initial-3);conservation(c);
});
test('真实世界人物作息保留时world_time仍发运到货；只在本地柜台显示实际发货收货',async()=>{
    const {engine,doc}=setup({realNpcs:true});doc.state.location='bld_yp_hall';
    const cash=snapshotCash(doc),departure=await wait(engine,doc,DEPART);let c=departure.doc;
    assert.ok(departure.out.result.messages.some(s=>s.includes('weekly_yp_wt:7')&&s.includes('发货')));
    assert.ok(departure.out.result.messages.every(s=>!s.includes('weekly_wt_lq:7')));
    const order=c.state.records[key(lanes[0])];
    // Observer fixture moves to the destination hall before arrival, without
    // changing any shipment, NPC asset or accounting field.
    c.state.location='bld_wt_hall';const arrival=await wait(engine,c,order.estimatedArrivalAt);c=arrival.doc;
    assert.ok(arrival.out.result.messages.some(s=>s.includes(order.id)&&s.includes('到货')));
    assert.equal(c.state.records[key(lanes[0])].status,'delivered');assert.equal(snapshotCash(c),cash);conservation(c);
});
test('天气阻力和实际道路距离影响正常周货运，持续占用回程劳力',async()=>{
    const results=[];
    for(const kind of ['clear','rain']){
        const source=structuredClone(world);source.rules.weather.persistence=0;
        source.rules.weather.seasonalWeights=Array.from({length:4},()=>kind==='clear'?[100,0,0,0,0,0]:[0,0,100,0,0,0]);
        const {engine,doc}=setup({source});let c=(await wait(engine,doc,DEPART)).doc;
        const row=c.state.records[key(lanes[0])];results.push(row.estimatedArrivalAt-DEPART);
        c=(await wait(engine,c,row.estimatedArrivalAt)).doc;
        assert.equal(c.state.records[key(lanes[0])].arrivedAt,row.estimatedArrivalAt);
        assert.equal(c.state.records[key(lanes[0])].transport.phase,'returning');conservation(c);
    }
    assert.ok(results[1]>results[0]);
});
test('货已交割但长路返程尚未回村时下周不能再次动用同一运力',async()=>{
    const source=structuredClone(world);source.rules.settlementTrade.lanes=[source.rules.settlementTrade.lanes[0]];
    source.rules.weather.persistence=0;source.rules.weather.seasonalWeights=Array.from({length:4},()=>[100,0,0,0,0,0]);
    source.routes.find(r=>r.id==='route_bs_wt').lengthKm=150;
    const {engine,doc}=setup({source}),lane=lanes[0],cash=snapshotCash(doc);
    let c=(await wait(engine,doc,14*DAY+540)).doc;
    assert.equal(c.state.records[key(lane)].status,'delivered');assert.equal(c.state.records[key(lane)].transport.phase,'returning');
    assert.equal(c.state.records[key(lane,14)].status,'refused');assert.match(c.state.records[key(lane,14)].reason,/运力/);
    c=(await wait(engine,c,21*DAY+540)).doc;
    assert.equal(c.state.records[key(lane)].transport.phase,'home');assert.equal(c.state.records[key(lane,21)].status,'in-transit');assert.equal(snapshotCash(c),cash);conservation(c);
});
test('全部腐坏的周货运返还整笔预付款，不确认销售和税',async()=>{
    const {engine,doc,world:w}=setup(),lane=lanes[0];w.rules.settlementTrade.lanes=[w.rules.settlementTrade.lanes[0]];
    w.routes.find(r=>r.id==='route_bs_wt').lengthKm=40;
    let c=(await wait(engine,doc,DEPART-1)).doc;
    for(const b of farm(c,lane.seller).batches)if(b.kind==='grain')b.expiresDay=8;
    const cash=snapshotCash(c),buyerCash=c.state.settlements[lane.buyer].treasury;
    c=(await wait(engine,c,DEPART)).doc;const o=c.state.records[key(lane)];
    c=(await wait(engine,c,o.estimatedArrivalAt)).doc;const end=c.state.records[key(lane)];
    assert.equal(end.status,'spoiled');assert.equal(end.spoiledFood,40);assert.equal(end.refundCopper,o.quantity*o.unitPriceCopper);assert.equal(end.taxCopper,0);assert.equal(end.paidCopper,0);
    assert.equal(c.state.settlements[lane.buyer].treasury,buyerCash);assert.equal(c.state.records[`village-fiscal:${lane.seller}`].salesGrossCopper,0);assert.equal(snapshotCash(c),cash);conservation(c);
});
test('旧档沿正常world_time不生成四村公仓、现金或周订单',async()=>{
    const {engine}=setup();const old=engine.initialFromLegacy(legacy,'old-trade');
    // U17/T155 commissions move this public money into quest escrow.
    const publicCash=doc=>doc.state.settlements.loc_hw.treasury+Object.values(doc.state.quests??{}).filter(q=>q.fundedBy?.treasury==='loc_hw').reduce((n,q)=>n+(q.escrow??0),0);
    const cash=publicCash(old);
    const c=(await wait(engine,old,DEPART+DAY)).doc;
    for(const lane of lanes){assert.equal(c.state.settlements[lane.seller],undefined);assert.equal(c.state.records[key(lane)],undefined);}
    assert.equal(c.state.records['settlement-trade:clock'],undefined);assert.equal(publicCash(c),cash);
});
test('错误实际批次与篡改税账拒绝，reduce不修改传入存档',async()=>{
    for(const tamper of ['batch','fiscal']){
        const {engine,doc}=setup(),prepared=(await wait(engine,doc,DEPART-1)).doc;
        if(tamper==='batch')farm(prepared,lanes[0].seller).batches[0].amount++;
        else prepared.state.records[`village-fiscal:${lanes[0].seller}`]={category:'village_fiscal',openingTreasuryCopper:1200,advanceCopper:0,salesGrossCopper:7,salesNetCopper:0,taxReceiptsCopper:0,purchasesCopper:0,exportedFood:0,importedFood:0,entries:[]};
        const before=structuredClone(prepared);await assert.rejects(wait(engine,prepared,DEPART),/不守恒/);assert.deepEqual(prepared,before);
    }
});
test('JSON恢复后的在途粮量或预付款篡改不能生成退款、收入或重复发货',async()=>{
    const {engine,doc,world:w}=setup(),sent=(await wait(engine,doc,DEPART)).doc;
    for(const mutate of [o=>o.escrowCopper++,o=>o.batches[0].amount++,o=>o.paidCopper++,o=>o.workers++,o=>o.transport.nextAt=null,o=>o.id='forged',o=>o.seller=lanes[2].seller,o=>o.taxBps=0]){
        const c=JSON.parse(JSON.stringify(sent));mutate(c.state.records[key(lanes[0])]);const before=structuredClone(c);
        await assert.rejects(wait(new WorldEngine(w),c,DEPART+DAY),/不守恒/);assert.deepEqual(c,before);
    }
});
