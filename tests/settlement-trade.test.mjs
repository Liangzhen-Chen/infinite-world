// 区域基准价的运输因子由物品 origin 整类推导（transport.unitFreight，R5③）：本文件的价格期望已按该规律独立手推（公里数 × 计费重量 × 驮畜费率）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {resyncBooks} from './helpers/ledger-sync.mjs';
import {regionalTradePrice,regionalTradeBase,validateSettlementTradeRules} from '../server-plugin/settlement-trade.mjs';
import {settlementTradeRules} from '../world/design/m5-trade-rules.mjs';
import {createTransportAsset} from '../server-plugin/transport.mjs';
import {bag} from '../server-plugin/stock.mjs';
import transportTable from '../world/rules/tables/balance/transport.json' with {type:'json'};
import {handTarget} from './helpers/hand-targets.mjs';
import {marketSupply} from '../server-plugin/market.mjs';
import {thinGranaries} from './helpers/granary-fixture.mjs';
import {granaryCapacity} from '../server-plugin/facility-state.mjs';

const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const DAY=1440,DEPART=7*DAY+540,lanes=world.rules.settlementTrade.lanes;
const key=(lane,day=7)=>`settlement-trade:${lane.id}:${day}`;
const farm=(doc,id)=>doc.state.records[`agriculture:${id}`];
function setup({source=world,realNpcs=false}={}){
    const w=structuredClone(source);
    if(!realNpcs){
        for(const n of w.npcs){delete n.schedule;delete n.tier;}
        // This fixture isolates public-granary trade. K04 structural hiring
        // remains active without schedule/tier: omit unrelated mineral veins
        // too, so mine wages/breach events cannot change its private-assets
        // or partition anchors. The realNpcs scenario keeps the full world.
        for(const place of w.locations)place.minerals=[];
    }
    const engine=new WorldEngine(w),doc=engine.createCharacter(legacy,{},'trade-test');
    // 开局各村存粮 = 目标持有，买方本无需求；夹具把四村实存压到目标的 80%（见 helpers/granary-fixture.mjs，前置条件在那里断言）。
    thinGranaries(engine,doc);
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
    // S5-04 W2b: a shop keeper's operating counter (money_account) is still his money; the cash he sets aside there for wages and stock stays in the total (15 §15.1.1). The incense real visitors gave sits in the temple's account (faction_assets ledger rows 香火捐献) and is counted as money still in the world (S5-04 香火).
    const questEscrow=Object.values(doc.state.quests??{}).filter(q=>!q.fundedBy?.faction).reduce((n,q)=>n+(q.escrow??0),0);
    // K2（卡 E）依据：军队买口粮改为向产粮村粮仓买、付给村公账（原为付出模拟范围外），郡府公库的钱进了村公账，所以郡府公库也要算进来。
    const polities=(world.rules.military?.polities??[]).reduce((n,p)=>n+(doc.state.records?.[`polity:${p.id}`]?.coins??p.treasuryCopper??0),0);
    return polities+doc.state.player.coins+Object.values(doc.state.npcs).reduce((n,p)=>n+p.coins,0)+Object.values(doc.state.settlements).reduce((n,s)=>n+s.treasury,0)+Object.values(doc.state.workshopFunds??{}).reduce((n,copper)=>n+copper,0)+Object.values(doc.state.records).filter(r=>r.category==='money_account').reduce((n,r)=>n+r.coins,0)+Object.values(doc.state.records).filter(r=>r.category==='faction_assets').flatMap(r=>r.ledger??[]).filter(l=>l.kind==='香火捐献').reduce((n,l)=>n+l.coins,0)+Object.values(doc.state.records).filter(r=>r.category==='settlement_trade').reduce((n,o)=>n+o.escrowCopper,0)+questEscrow;
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
// 让买方"需求 > 0 而仓容已满"：把一部分存粮改记为非谷物批（'fresh'，周贸易的需求只数谷物批，grain()），再把基础仓容设为 实存 + 种粮，
// 并让（基础 + 设施）仓容与基础相等（本夹具无设施，断言之），这样空位 = 0，而目标持有（读同一仓容）仍大于谷物存量。
function fillWithNonGrain(engine,doc,id,minute){
    const r=farm(doc,id),s=doc.state.settlements[id],g=r.batches.find(b=>b.kind==='grain'),k=Math.max(1,Math.floor(g.amount/4));
    g.amount-=k;r.batches.push({id:'fixture_non_grain',kind:'fresh',amount:k,harvestDay:g.harvestDay,expiresDay:g.expiresDay,source:'isolated fixture non-grain stock'});
    r.granary.capacity=s.food+r.field.seedBank;
    assert.equal(granaryCapacity(engine,doc.state,id,r.granary.capacity),r.granary.capacity);
    const grainStock=r.batches.filter(b=>b.kind==='grain').reduce((n,b)=>n+b.amount,0),profile=engine.rules.agriculture.settlements.find(p=>p.settlement===id);
    assert.ok(handTarget(engine,doc.state,profile,minute)>grainStock,'前置：谷物存量低于目标，需求 > 0');
    assert.equal(r.granary.capacity-s.food-r.field.seedBank,0,'前置：空位 = 0');
    resyncBooks(engine,doc);
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
    // K15: daily household meals legitimately consume private food during the
    // week. Adjust the original exact snapshot ONLY for successful meal writes;
    // public trade must still leave every other private item and coin untouched.
    const itemDelta=engine.itemDelta.bind(engine);
    globalThis.__LEDGER_TRACE__=[];// 既有调试钩子：账本每笔转移的记录，用来核对自采入库的来源
    engine.itemDelta=(d,owner,item,delta,books,options)=>{
        const result=itemDelta(d,owner,item,delta,books,options);
        // 合入 F 后：家户烧柴、用盐、日用品损耗（npc-life 的 fuel/seasoning/wear）同样是真实消耗，与吃饭一并调整快照。
        if(books?.writer==='npc-life'&&['meal','fuel','seasoning','wear'].includes(books.purpose)){
            assert.ok(delta<0);const inventory=privateAssets.npcs[owner].inventory,old=inventory[item];
            const quantity=(typeof old==='number'?old:old?.quantity??0)+delta;assert.ok(quantity>=0);
            if(!quantity)delete inventory[item];
            else if(books.purpose==='wear'){
                // 损耗是用坏一件：剩下的件数照算，耐久等件况以实际写入为准（F 的 wear 记余件的实际耐久）。
                const now=d.get('state','npcs',owner,'inventory',item);assert.equal(typeof now==='number'?now:now?.quantity,quantity);inventory[item]=structuredClone(now);
            }else{const def=engine.byId.get(item);inventory[item]={...(typeof old==='object'?old:{quality:def.quality,durability:def.durability,weight:def.weight}),quantity};}
        }
        // 家户自采入库：来源写入者（林木/据点资源点账户）已把货记进取货人行囊账户，这里只是同一批货进入私人行囊的旧字段。
        // 通用口径：已记账（booked）、带 writer/purpose/eventId 标注的正数写入，且账本里确有同一事件从资源点账户（forest:/site:）流入该行囊账户的记录；
        // 缺任一项都不计入快照，照旧使"其余私人物品不得增加"的核心断言失败。
        if(books?.booked===true&&books.writer&&books.purpose&&delta>0){
            assert.ok(books.eventId,'已记账的自采入库必须带事件编号，来源才可查');
            const account=bag(engine,owner,item),sourced=globalThis.__LEDGER_TRACE__.filter(t=>t.eventId===books.eventId&&t.to===account&&/^(forest|site):/.test(t.from)).reduce((n,t)=>n+t.amount,0);
            assert.ok(sourced>=delta,`${owner} 自采 ${item}×${delta} 在账本里没有对应的资源点账户流出（${sourced}）`);
            const inventory=privateAssets.npcs[owner].inventory,old=inventory[item],def=engine.byId.get(item);
            inventory[item]={...(typeof old==='object'?old:{quality:def.quality,durability:def.durability,weight:def.weight}),quantity:(typeof old==='number'?old:old?.quantity??0)+delta};
        }
        return result;
    };
    // W8-E8 (c930d578): the forge stocks one sickle on day 1 (next: day 8). K2（卡 E）依据：原先这把铁镰从模拟范围外进货、
    // 20 铜付给公账；现在铁匠向本聚落真实持货人进货。夹具让一位村民手里有 2 把铁镰：铁匠得 1 把、付出货款，
    // 村民少 1 把、收到货款减去他缴的商税；其余私人钱物照旧不动。
    const holder='npc_hw_shendu',sickle={quality:'木',durability:100,weight:0.5};
    doc.state.npcs[holder].inventory.item_sickle={...sickle,quantity:2};privateAssets.npcs[holder].inventory.item_sickle={...sickle,quantity:2};
    const before=structuredClone(doc),first=await wait(engine,doc,DEPART);assert.deepEqual(doc,before);
    let c=first.doc;
    const bought=c.state.records['shop:shop_hw_forge'].entries.find(e=>e.item==='item_sickle'&&e.added);
    const tax=Object.values(c.state.records).filter(r=>r.category==='trade_tax'&&r.payer===holder).reduce((n,r)=>n+r.amount,0);
    assert.equal(bought.added,1);assert.deepEqual(bought.from,[holder]);assert.ok(bought.paidCopper>0);
    privateAssets.npcs.npc_hw_duanyan.coins-=bought.paidCopper;
    privateAssets.npcs.npc_hw_duanyan.inventory.item_sickle={...sickle,quantity:1};
    privateAssets.npcs[holder].coins+=bought.paidCopper-tax;privateAssets.npcs[holder].inventory.item_sickle={...sickle,quantity:1};assert.equal(snapshotCash(c),cash);conservation(c);
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
    // 合入 F 后：在用的日用品每天按寿命磨损耐久（npc-life wearHeld 经 items.wearItem，件数不变）。件数仍须一件不差，只把开始计耐久（数字换成带耐久的件况）与耐久下降按实际记入快照。
    const qtyOf=v=>typeof v==='number'?v:v?.quantity??0,durOf=(v,item)=>typeof v==='number'?engine.byId.get(item).durability:v?.durability;
    for(const [id,n]of Object.entries(c.state.npcs))for(const [item,v]of Object.entries(n.inventory??{})){
        const want=privateAssets.npcs[id]?.inventory?.[item];
        if(want!==undefined&&qtyOf(want)===qtyOf(v)&&typeof v==='object'&&durOf(v,item)<=durOf(want,item)&&!v.instances?.length)privateAssets.npcs[id].inventory[item]=structuredClone(v);
    }
    assert.deepEqual({player:c.state.player.coins,inventory:c.state.inventory,npcs:Object.fromEntries(Object.entries(c.state.npcs).map(([id,n])=>[id,{coins:n.coins,inventory:n.inventory}]))},privateAssets);
    delete globalThis.__LEDGER_TRACE__;
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
        if(scenario==='labour')doc.state.settlements[seller].population=40;
        const prepared=(await wait(engine,doc,DEPART-1)).doc;
        // Change actual capacity/cash immediately before the weekly consumer.
        if(scenario==='grain')setGrain(prepared,seller,prepared.state.settlements[seller].population*90);
        if(scenario==='capacity')fillWithNonGrain(engine,prepared,buyer,DEPART);
        if(scenario==='partial')prepared.state.settlements[buyer].treasury=11;
        const cash=snapshotCash(prepared),c=(await wait(engine,prepared,DEPART)).doc,o=c.state.records[key(lane)];
        assert.equal(snapshotCash(c),cash);conservation(c);
        if(scenario==='partial'){assert.equal(o.status,'in-transit');assert.equal(o.quantity,Math.floor(11/o.unitPriceCopper));assert.ok(o.quantity<40);}
        // 仓容：夹具（fillWithNonGrain）让仓里一部分是非谷物批（不计入需求的粮存）而仓已满，于是需求 > 0 且空位 = 0，走到"仓容已满"这条拒绝；前置条件在夹具里断言。
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
test('公共报价只读且随真实供给重派生，距离与运输风险进入环境基准；未知仓不生成库存',()=>{
    const {engine,doc}=setup(),lane=lanes[0],d=draft(doc),minute=DEPART;
    const before=structuredClone(d.document),first=regionalTradePrice(d,engine,'item_oats',lane.buyer,minute);
    assert.deepEqual(d.document,before,'15.2/15.4: quotes are projections, not saved truth');
    // 区域基准的运输因子（R5③、8c5a266c）按物品整类推导，与周贸易班线无关：运输因子 = 1 + 单位运费 ÷ 目录基价 3。
    // 单位运费取"供给源"到目的聚落的最小值：供给源 = 产地聚落（燕麦产地 loc_hw_fields 在 loc_hw）+ 所有自产燕麦的聚落（农事档案聚落，或统计产粮 foodPerDay>0 的聚落）；
    // 目的聚落自己就是供给源（自产）时没有路程，运费 0、因子 1；否则按一年各月能走通的路线里最便宜的一条：Σ 路段公里 × 计费重量 × 驮畜费率；
    // 计费重量 = max(0.5 公斤, 体积 × 250, 1 公斤) = 1 公斤，驮畜费率 0.02 铜/公里·公斤。此处独立地用路网与费率、聚落数据手算，不调用任何定价函数。
    const rate=transportTable.rows.find(r=>r.key==='carrier:pack').rate,oats=engine.byId.get('item_oats');
    assert.equal(rate,0.02);assert.equal(oats.basePrice,3);assert.ok(Math.max(oats.weight,(oats.volumeM3??oats.weight/250)*250,1)===1);
    const grows=id=>engine.rules.agriculture.settlements.some(p=>p.settlement===id)||doc.state.settlements[id]?.foodPerDay>0;
    // 买方村是农事档案聚落：自产燕麦，运费 0，因子 1，基准就是目录基价 3（环境因子本夹具为 1）。
    assert.ok(grows(lane.buyer));assert.equal(regionalTradeBase(d,engine,'item_oats',lane.buyer,minute),3);
    // 距离仍进入基准：白石镇是只开公款账的聚落（granary:false，无日产粮），自己不产燕麦，运费取各供给源里最便宜的一条。
    const dest='loc_bs';assert.ok(!grows(dest));
    const sources=Object.keys(doc.state.settlements).filter(id=>id!==dest&&grows(id));assert.ok(sources.includes('loc_hw'));
    const costs=[];
    for(const src of sources)for(let month=0;month<12;month++){
        let r=null;try{r=engine.route(src,dest,'walk',month*30*DAY,doc.randomSeed);}catch(error){if(!error.message.startsWith('没有当前季节'))throw error;}
        if(r)costs.push(r.edges.reduce((n,id)=>n+engine.world.routes.find(x=>x.id===id).lengthKm*1*rate,0)+(r.cost??0));
    }
    const limits=engine.rules.economy.priceFactorLimits.transport,transport=Math.max(limits[0],Math.min(limits[1],1+Math.min(...costs)/3));
    assert.ok(costs.length>0&&transport>1);assert.equal(regionalTradeBase(d,engine,'item_oats',dest,minute),3*transport);
    // Changed stock is a non-examined premise; synchronize the existing books.
    setGrain(d.document,lane.buyer,100);resyncBooks(engine,d.document);assert.ok(regionalTradePrice(d,engine,'item_oats',lane.buyer,minute+1)>first);
    const next=regionalTradePrice(d,engine,'item_oats',lane.buyer,minute+DAY);assert.ok(next>first);
    // 河湾木料：目录基价 4，产地就在本聚落（运输因子 1，不计运费）；价 = 4 × 稀缺度，稀缺度 = 目标持有 ÷ 实际持有，夹取在 [0.5, 3]。
    // 实际持有 = 公仓木料存量（开局 28，与上面一致的公账）；目标持有取供给原语 marketSupply 的需求（户用日耗 × 补给间隔等，已在 market-food-pool 另行手推）。
    // 需求远大于 3 × 存量，稀缺度被钳在上限 3：价 = 4 × 3 = 12。
    const outside=draft(structuredClone(doc)),unchanged=structuredClone(doc),timber=marketSupply(outside,engine,'item_wood','loc_hw');
    assert.equal(engine.byId.get('item_wood').basePrice,4);assert.equal(timber.supply,doc.state.settlements.loc_hw.wood);assert.ok(timber.demand>=engine.rules.economy.priceFactorLimits.region[1]*timber.supply);
    assert.equal(regionalTradePrice(outside,engine,'item_wood','loc_hw'),4*engine.rules.economy.priceFactorLimits.region[1]);assert.deepEqual(outside.document,unchanged);
});
test('玩家world_trade消费实时区域价并扣真实商人库存；同日深度与次日复位',async()=>{
    const {engine,doc}=setup(),sid=lanes[0].seller,seller='npc_hw_ayan';
    // Isolated encounter fixture: the existing merchant visits this public hall.
    // Inventory and both wallets are the unchanged source assets; no NPC is added.
    doc.state.location='bld_yp_hall';doc.state.npcs[seller].location=doc.state.location;
    const cash=snapshotCash(doc),initial=engine.quantity(draft(doc),seller,'item_oats'),wallet=doc.state.player.coins;
    const run=async(c,id)=>{const out=await engine.reduce(c,{tool:'world_trade',args:{seller,item:'item_oats',quantity:1},eventId:id});return{doc:applyPatches(c,out.patches),out};};
    const first=await run(doc,'local-buy');let c=first.doc;
    const day=Math.floor(doc.state.minute/DAY);
    // 手推（R5③ 之后）：价 = 目录基价 3 × 运输因子 × 稀缺度（品质、立场、深度、修正均为 1）。
    //  · 运输因子 = 1 + 单位运费 ÷ 3；单位运费取供给源（产地聚落 + 所有自产燕麦的聚落）到目的聚落的最小值（8c5a266c）。目的聚落 loc_bs_yupo 是农事档案聚落、自产燕麦，
    //    它自己就是供给源，没有路程：运费 0，因子 1（距离进入基准的情形见上一条测试里的白石镇）；
    //  · 稀缺度 = 目标持有 ÷ 实际持有 = farmTargetFood ÷ 粮仓实存（夹具把实存压到目标的 80%，故约 1.25；周贸易夹具的前置断言见 granary-fixture），落在 [0.5, 3] 内不夹取；
    //  · 成交按整单一次截断：trunc(价)。
    const origin=engine.world.locations.find(x=>x.id===engine.byId.get('item_oats').origin);
    assert.ok(origin&&engine.byId.get('item_oats').weight<1);assert.ok(engine.rules.agriculture.settlements.some(p=>p.settlement===sid),'前置：目的聚落自产燕麦');
    const profile=engine.rules.agriculture.settlements.find(p=>p.settlement===sid),scarcity=handTarget(engine,doc.state,profile,doc.state.minute)/doc.state.settlements[sid].food;
    assert.ok(scarcity>=0.5&&scarcity<=3);
    const exact=3*scarcity,price=Math.trunc(exact);assert.ok(price>=1);
    assert.equal(first.out.result.cost,price);assert.ok(Math.abs(first.out.result.pricing.listPrice-exact)<=1e-9*exact);assert.equal(first.out.result.pricing.depth,1);
    assert.equal(c.state.player.coins,wallet-price);assert.equal(engine.quantity(draft(c),seller,'item_oats'),initial-1);assert.equal(snapshotCash(c),cash);
    setGrain(c,sid,500);resyncBooks(engine,c);const second=await run(c,'same-day-buy');c=second.doc;
    // 15.2/15.4 intentionally replace same-day lock-in with current supply.
    assert.ok(second.out.result.cost>price);assert.ok(second.out.result.pricing.depth>1);assert.equal(engine.quantity(draft(c),seller,'item_oats'),initial-2);
    c=(await wait(engine,c,(day+1)*DAY+540)).doc;
    const third=await run(c,'next-day-buy');c=third.doc;
    assert.ok(third.out.result.cost>price);assert.equal(third.out.result.pricing.depth,1);assert.equal(Object.keys(c.state.quotes).length,0);assert.equal(snapshotCash(c),cash);assert.equal(engine.quantity(draft(c),seller,'item_oats'),initial-3);conservation(c);
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
    assert.equal(c.state.records[key(lanes[0])].status,'delivered');
    // F010: shops restocking from other settlements in the same days pay their porters through sink:export (read from the ledger flows).
    const freight=(c.ledger.flows['sink:export|coin_river|freight']??0)-(doc.ledger?.flows?.['sink:export|coin_river|freight']??0);
    assert.equal(snapshotCash(c)+freight,cash);conservation(c);
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
    // W8-E8 (c930d578) 的铁镰原先从模拟范围外进货、货款 40 进本地公账；K2（卡 E）依据：本地货架改向本聚落持货人进货，
    // 货款进持货人钱袋，公账只收真实成交的商税。quest escrow remains public money, and no managed village or weekly order is created.
    const taxes=Object.values(c.state.records).filter(r=>r.category==='trade_tax'&&r.settlement==='loc_hw').reduce((n,r)=>n+r.amount,0);
    assert.equal(c.state.records['settlement-trade:clock'],undefined);assert.equal(publicCash(c),cash+taxes);
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
