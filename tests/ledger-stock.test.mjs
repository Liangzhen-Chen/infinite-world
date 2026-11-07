// S1b 账本：物品、粮与库存的双写对账与守恒（02 I1/I2/I15，10 §10.5 双写 + 对账）。
// 对账失败即阻塞：逐日推进的每一步之后，每个实体的旧库存（行囊、公库、公仓、种粮、在途、资源点……）
// 必须逐账户等于新账户余额，批次形状（入库日、到期日、类别）与旧粮批一致，没有漂移；
// 守恒逐事件、逐资源成立：Δ总量 = 源净流入 − 汇流出。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import fc from 'fast-check';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {transfer,declareLedgerWriter,emptyLedger,auditLedger,ledgerWriters,reviseLots,lotAccount,parseAccount,isSource} from '../server-plugin/ledger.mjs';
import {bag,granary,seedBank,itemResource,legacyStock,LOT_PURPOSES,bookStock} from '../server-plugin/stock.mjs';
import {reconcile,eventDiscrepancies,conservation} from './helpers/ledger-audit.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile(new URL('fixtures/legacy/seed.json',import.meta.url),'utf8'));
const DAY=1440;
function draft(document){return {document,patches:[],get(...p){return p.reduce((v,k)=>v?.[k],this.document);},
    set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);this.patches.push({op:'set',path,value});},
    remove(path){this.document=applyPatches(this.document,[{op:'delete',path}]);this.patches.push({op:'delete',path});}};}
declareLedgerWriter('stock-test',{sources:{'src:regrowth':{'*':100},'src:import':{item_salt:5}},sinks:['sink:consume','sink:decay']});

test('资源键按物品模板，铸币物品记为铸币资源；批次只在仓储与田间作物用途启用',()=>{
    const engine=new WorldEngine(world);
    assert.equal(itemResource(engine,'item_bread'),'item_bread');
    assert.equal(itemResource(engine,'item_coin_civic'),'coin_civic');assert.equal(itemResource(engine,'item_coin_coast'),'coin_coast');
    assert.equal(bag(engine,'player','item_coin_civic'),'player|coin_civic|inventory');
    // D05 §5.5 / S5-05：田间作物也是带入库期、品质的批次；保持用途白名单精确相等。
    assert.deepEqual([...LOT_PURPOSES].sort(),['cargo','crop','granary','seed']);
    assert.equal(lotAccount('loc_hw_fields|item_oats|crop'),true);
    assert.equal(lotAccount(granary(engine,'loc_hw')),true);assert.equal(lotAccount(seedBank(engine,'loc_hw')),true);assert.equal(lotAccount(bag(engine,'player','item_oats')),false);
});

test('批次：转入带元数据、转出先进先出或指定批次、携带到下一仓、白名单改写，Σ批次 = 余额',()=>{
    const g='loc_x|item_oats|granary',h='loc_y|item_oats|granary',p='player|item_oats|inventory';
    const d=draft({state:{minute:3*DAY},ledger:emptyLedger()});
    transfer(d,{from:'src:regrowth|item_oats|harvest',to:g,amount:30,writer:'stock-test',lot:{id:'a',day:3,expiresDay:20,kind:'grain'}});
    transfer(d,{from:'src:regrowth|item_oats|harvest',to:g,amount:20,writer:'stock-test',lot:{id:'b',day:3,expiresDay:10,kind:'fresh'}});
    transfer(d,{from:g,to:h,amount:25,writer:'stock-test'});// 先到期的 b 先出，再 a
    assert.deepEqual(d.document.ledger.lots[h].map(l=>[l.id,l.qty]),[['b',20],['a',5]]);
    transfer(d,{from:h,to:g,amount:5,writer:'stock-test',pick:['a'],lot:{id:'back'}});
    assert.deepEqual(d.document.ledger.lots[g].find(l=>l.id==='back'),{id:'back',qty:5,day:3,expiresDay:20,kind:'grain'},'携带原批次的入库日与到期日');
    transfer(d,{from:g,to:p,amount:10,writer:'stock-test'});assert.equal(d.document.ledger.lots[p],undefined,'行囊不分批次');
    transfer(d,{from:p,to:g,amount:4,writer:'stock-test',lot:{id:'donation',day:4,expiresDay:180,kind:'grain'}});
    reviseLots(d,g,l=>({...l,expiresDay:Math.min(l.expiresDay,15)}));
    assert.ok(d.document.ledger.lots[g].every(l=>l.expiresDay<=15));
    assert.throws(()=>reviseLots(d,g,l=>({...l,day:0})),/只能改保质期/);
    transfer(d,{from:h,to:'sink:decay|item_oats|spoil',amount:20,writer:'stock-test',pick:['b']});
    assert.deepEqual(auditLedger(d.document.ledger),[]);
    assert.equal(d.document.ledger.lots[h],undefined,'取空的批次账户不留空表');
});

test('通配预算：源对未逐种声明的资源按 * 预算熔断，逐种声明优先',()=>{
    const d=draft({state:{minute:0},ledger:emptyLedger()});
    transfer(d,{from:'src:regrowth|item_herb|gather',to:'player|item_herb|inventory',amount:100,writer:'stock-test'});
    assert.throws(()=>transfer(d,{from:'src:regrowth|item_herb|gather',to:'player|item_herb|inventory',amount:1,writer:'stock-test'}),/预算熔断/);
    assert.throws(()=>transfer(d,{from:'src:import|item_salt|trade',to:'player|item_salt|inventory',amount:6,writer:'stock-test'}),/预算熔断/);
    assert.throws(()=>transfer(d,{from:'src:import|item_herb|trade',to:'player|item_herb|inventory',amount:1,writer:'stock-test'}),/没有 src:import 的写入权/);
    const e=draft({state:{minute:0},ledger:emptyLedger()});bookStock(e,null,'player|item_herb|inventory',-2,undefined);assert.equal(e.document.ledger.drift[0].unbooked,-2,'漏记的单边写入记未入账漂移');
});

test('性质：批次账户与普通账户之间任意转移后，Σ批次 = 余额，逐资源 Σ账户 = Σ源 − Σ汇',()=>{
    const sides=['loc_x|item_oats|granary','loc_y|item_oats|seed','npc_a|item_oats|inventory','player|item_oats|inventory','src:regrowth|item_oats|harvest','sink:consume|item_oats|meal'];
    fc.assert(fc.property(fc.array(fc.tuple(fc.integer({min:0,max:5}),fc.integer({min:0,max:5}),fc.integer({min:1,max:30}),fc.integer({min:0,max:40})),{maxLength:60}),steps=>{
        const d=draft({state:{minute:0},ledger:emptyLedger()});
        steps.forEach(([a,b,n,exp],k)=>{
            d.document.state.minute=k*DAY;
            try{transfer(d,{from:sides[a],to:sides[b],amount:n,writer:'stock-test',lot:{id:`l${k%3}`,day:k,expiresDay:k+exp,kind:'grain'}});}catch(e){if(!/源|汇|相同|预算/.test(e.message))throw e;}
        });
        assert.deepEqual(auditLedger(d.document.ledger),[]);
    }),{numRuns:200});
});

test('持有人库存的减少 = 各用途汇流入：两个持有人入账、烧柴、制作后，各自账户余额与汇的 flows 逐项对得上',()=>{
    const d=draft({state:{minute:DAY},ledger:emptyLedger()}),w='stock-test';
    for(const who of ['npc_a','npc_b'])transfer(d,{from:'src:regrowth|item_wood|harvest',to:`${who}|item_wood|inventory`,amount:20,writer:w});
    const burn=(who,n,purpose)=>transfer(d,{from:`${who}|item_wood|inventory`,to:`sink:consume|item_wood|${purpose}`,amount:n,writer:w});
    burn('npc_a',3,'fuel');burn('npc_a',2,'craft');burn('npc_b',5,'fuel');burn('npc_b',1,'craft');burn('npc_a',1,'fuel');
    const L=d.document.ledger;
    assert.equal(L.accounts['npc_a|item_wood|inventory'],14);assert.equal(L.accounts['npc_b|item_wood|inventory'],14);
    assert.equal(L.flows['sink:consume|item_wood|fuel'],9);assert.equal(L.flows['sink:consume|item_wood|craft'],3);
    assert.equal(L.flows['src:regrowth|item_wood|harvest'],40);
    assert.deepEqual(auditLedger(L),[]);
});

test('源汇：S1b 用到的源汇都登记在词汇表，写入者声明的每个源都带每日预算',()=>{
    const vocabulary=new Set(JSON.parse(readFileSync(new URL('../world/ontology/resources.json',import.meta.url),'utf8')).sourcesAndSinks.map(s=>s.id));
    for(const id of ['src:genesis','src:regrowth','src:craft','src:harvest','src:husbandry','src:import','sink:consume','sink:decay','sink:destroy','sink:export'])assert.ok(vocabulary.has(id),`${id} 已登记`);
    const writers=ledgerWriters();
    for(const [w,row] of Object.entries(writers)){
        for(const id of [...Object.keys(row.sources),...row.sinks])assert.ok(vocabulary.has(id),`${w} 用到的 ${id} 已登记`);
        for(const [source,budgets] of Object.entries(row.sources))assert.ok(Object.keys(budgets).length,`${w} 对 ${source} 声明了预算`);
    }
    for(const w of ['agriculture','manufacturing','extraction','forest-water','military','settlement-trade','npc-autonomy','remote-generation'])assert.ok(writers[w],`${w} 已声明`);
    assert.ok(writers.manufacturing.sources['src:craft'],'制作经 src:craft');assert.ok(writers.agriculture.sources['src:regrowth'],'收成经 src:regrowth');
});

// ---- 逐日推进的对账 -------------------------------------------------------------
function campaign(){
    const w=structuredClone(world),host='npc_hw_linsui',inn='bld_hw_qingdeng';
    for(const npc of w.npcs.filter(n=>n.id===host))npc.schedule={default:[{start:0,end:1440,location:inn,activity:'营业',services:['trade']}]};
    const engine=new WorldEngine(w),doc=engine.createCharacter(seed,{},'ledger-stock');
    doc.state.minute=600;doc.state.location=inn;doc.state.player.coins=2000;
    Object.assign(doc.state.npcs[host],{location:inn,activity:'营业',status:'正常'});
    // 制作与钓鱼的工具与材料、配方许可（与 manufacturing / verbs-extra 测试的夹具相同）。
    const put=(item,quantity,durability=100)=>doc.state.inventory[item]={quantity,quality:w.items.find(i=>i.id===item).quality,durability,weight:w.items.find(i=>i.id===item).weight};
// D15.2 requires real bait for each cast; keep all original catch, wear and conservation assertions.
    put('item_wood',6);put('item_whittling_knife',1,80);put('item_fishing_bait',10);put('item_kitchen_knife',1);put('item_water',10);put('item_oats',5);
    doc.state.skills.skill_life_6_core={proficiency:120,daily:{},breakthroughs:[]};doc.state.recipes.recipe_wooden_pegs={source:{type:'teacher',id:'npc_hw_ayan'}};
    return {engine,doc,host,inn};
}
// 制造守恒对：投入 = 配方投入 × 批数；产出不超过配方产出（成品与副产品）× 批数，失败回收不超过投入 × 回收率。
function checkCrafts(c){
    for(const x of c.doc.ledger.crafts??[]){
        const recipe=c.engine.world.recipes.find(r=>r.id===x.recipe);if(!recipe)continue;
        const inputs=Object.fromEntries(recipe.materials.map(m=>[m.item,m.amount*x.batches]));
        assert.deepEqual(x.inputs,inputs,`${x.recipe} 投入 = 配方投入`);
        const cap={[recipe.output.item]:recipe.output.quantity*x.batches};
        for(const b of recipe.byproducts??[])cap[b.item]=(cap[b.item]??0)+b.amount*x.batches;
        for(const m of recipe.materials)cap[m.item]=Math.max(cap[m.item]??0,Math.floor(m.amount*x.batches*(recipe.failure?.recoverFraction??0)));
        for(const [item,n] of Object.entries(x.outputs))assert.ok(n<=(cap[item]??0),`${x.recipe} 产出 ${item} ${n} 不超过配方`);
    }
}
async function step(c,tool,args,eventId,log,{allowFailure=false}={}){
    const before=c.doc;let out;
    try{out=await c.engine.reduce(before,{tool,args,eventId});}catch(e){if(allowFailure)return null;throw e;}
    const after=applyPatches(before,out.patches);
    assert.deepEqual(eventDiscrepancies(c.engine,before,after),[],`${eventId}：旧库存变化与新账户变化不一致`);
    const r=reconcile(c.engine,after);
    assert.deepEqual(r.mismatches,[],`${eventId}：旧库存 ≠ 新账户余额`);
    assert.deepEqual(r.lots,[],`${eventId}：批次与旧粮批不一致`);
    assert.deepEqual(r.drift,[],`${eventId}：双写漂移`);assert.deepEqual(r.audit,[],`${eventId}：账本审计失败`);
    assert.deepEqual(conservation(c.engine,before,after),[],`${eventId}：逐资源 Δ总量 ≠ 源 − 汇`);
    const fb=before.ledger?.flows??{};for(const [k,n] of Object.entries(after.ledger?.flows??{}))if(n!==(fb[k]??0))log.set(k,(log.get(k)??0)+n-(fb[k]??0));
    c.doc=after;return out.result;
}
test('逐日推进对账：交易、制作、钓鱼、交粮、农业一季（播种、生长、收获、腐坏、吃粮）与离屏推进，旧库存逐账户等于新账户',{timeout:1800000},async()=>{
    const c=campaign(),log=new Map();
    assert.equal(c.doc.ledger,undefined,'新开局的第一次归约才开账');
    // 正式白石镇只有公共钱账（granary=false），日产粮0；其余5个聚落均为托管农事，不能要求虚构的旧日产粮源。
    assert.equal(c.doc.state.settlements.loc_bs.granary,false);assert.equal(c.doc.state.settlements.loc_bs.foodPerDay,0);
    // D05 §5.5 / S505 正式绑定：声明非考查的竹竿与蚯蚓前提；开户流仍纳入本次完整源汇检查。
    const equipped=applyIntentSetup(c.engine,c.doc,{inventory:{item_bamboo_fishing_rod:1,item_earthworm_bait:10}});
    assert.deepEqual(equipped.setupUnmet,[]);c.doc=equipped.document;
    for(const [key,n]of Object.entries(c.doc.ledger.flows??{}))log.set(key,n);
    await step(c,'world_trade',{seller:c.host,item:'item_bread',quantity:2},'buy',log);
    const opened=legacyStock(c.engine,c.doc.state).balances;assert.ok(opened.size>300,'开账覆盖全部旧库存');
    assert.ok(Object.keys(c.doc.ledger.lots).some(k=>k.endsWith('|granary')),'粮仓按批次开户');
    await step(c,'world_trade',{seller:'player',buyer:c.host,item:'item_oats',quantity:2},'sell',log,{allowFailure:true});
    // 制作：木楔配方（投入木料，产出木楔与刨花），在磨坊工作台。
    await step(c,'world_move',{destination:'bld_hw_mill'},'walk-craft',log);
    for(let i=0;i<3;i++)await step(c,'world_craft',{recipe:'recipe_wooden_pegs'},`craft-${i}`,log);
    const crafts=c.doc.ledger.crafts??[];assert.ok(crafts.filter(x=>x.writer==='manufacturing').length>=3,'每次制作留下制造凭据');
    checkCrafts(c);
    // 钓鱼：在河湾码头。
    // D05 身体慢事实的 asOf 不能倒流：制作已耗真实工时，等待下一次10:00，而非把 minute 回拨至当日600。
    const fishingAt=Math.floor(c.doc.state.minute/DAY)*DAY+600;
    await step(c,'world_time',{minutes:(fishingAt>c.doc.state.minute?fishingAt:fishingAt+DAY)-c.doc.state.minute},'wait-fishing',log);
    await step(c,'world_move',{destination:'loc_hw_dock'},'walk-fishing',log);
    for(let i=0;i<4;i++)await step(c,'world_field',{operation:'wildlife_fish'},`fish-${i}`,log);
    // 4竿×1蚯蚓=4；10−4=6，未命中也必须扣除实际饵料。
    assert.equal(c.doc.state.inventory.item_earthworm_bait.quantity,6);
    // 农业一季：逐日推进到收获之后（播种窗口、积温生长、收获入仓、种粮预留、腐坏、每日吃粮与柴火）。
    for(let day=0;day<215;day++)await step(c,'world_time',{minutes:DAY},`day-${day}`,log);
    // 离屏长推进：周贸易在途粮、军粮、商店补货、人物自治制作与交易。
    await step(c,'world_time',{minutes:24*DAY},'offscreen',log);
    checkCrafts(c);
    const used=new Set([...log.keys()].map(k=>{const {owner,purpose}=parseAccount(k);return `${owner}|${purpose}`;}));
    // D05 §5.5 / S505：公共田成熟时经 crop 入资源账户，采收仅转移；本场景没有旧日产粮的消费者。
    // 用同样严格的源用途必现断言核对 crop，不能让不相干的旧 harvest 名称替代真实成熟入账。
    for(const flow of ['src:genesis|opening','src:regrowth|crop','src:regrowth|fresh','sink:consume|meal','sink:consume|craft','src:craft|craft','sink:consume|sow'])
        assert.ok(used.has(flow),`推演中出现 ${flow}`);
    assert.ok([...log.keys()].some(k=>k.startsWith('src:regrowth|item_oats|crop')),'成熟的粮经 src:regrowth 先入田间账户');
    const farm=c.doc.state.records['agriculture:loc_hw'];assert.ok(farm.ledger.harvested>0,'一季内实际收获');
    if(process.env.LEDGER_DEBUG)console.log(JSON.stringify({flows:Object.fromEntries([...log].filter(([k])=>isSource(parseAccount(k).owner)||k.startsWith('sink:'))),accounts:Object.keys(c.doc.ledger.accounts).length,lots:Object.keys(c.doc.ledger.lots).length,transfers:c.doc.ledger.transfers}));
    assert.deepEqual(auditLedger(c.doc.ledger),[]);
});
