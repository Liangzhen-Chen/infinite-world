// S1a 账本：货币的双写对账与守恒（02 I1/I2/I15，10 §10.5 双写 + 对账）。
// 对账失败即阻塞：每一步之后旧字段余额必须逐账户等于新账户余额，且没有漂移；
// 守恒逐事件成立：全局货币总量的变化 = 源净流入 − 汇流出。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import fc from 'fast-check';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {accountKey,resourceKey,parseAccount,transfer,declareLedgerWriter,emptyLedger,auditLedger,ledgerTotals,ledgerWriters,LEDGER_COIN} from '../server-plugin/ledger.mjs';
import {legacyMoney,purse,treasury,source,sink,bookSide} from '../server-plugin/money.mjs';
import {loadOntology} from '../tools/ontology.mjs';
import {reconcile,eventDiscrepancies,flowDelta,legacyTotal} from './helpers/ledger-audit.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile(new URL('fixtures/legacy/seed.json',import.meta.url),'utf8'));
const DAY=1440,inn='bld_hw_qingdeng',post='bld_hw_post';
const host='npc_hw_linsui',clerk='npc_hw_shendu',worker='npc_hw_ayan';

// A bare draft over a plain document (the shape modules see in unit tests).
function draft(document){return {document,patches:[],get(...p){return p.reduce((v,k)=>v?.[k],this.document);},
    set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);this.patches.push({op:'set',path,value});}};}
declareLedgerWriter('ledger-test',{sources:{'src:import':{coin_river:100}},sinks:['sink:export']});

test('资源键与账户键：core 命名空间可省略，包资源保留命名空间，非法键拒绝',()=>{
    assert.equal(resourceKey('core:coin_river'),'coin_river');assert.equal(resourceKey('coin_river'),'coin_river');
    assert.equal(resourceKey('xiuxian:spirit_stone'),'xiuxian:spirit_stone');
    assert.equal(accountKey('player','core:coin_river','purse'),'player|coin_river|purse');
    assert.deepEqual(parseAccount('npc_a|xiuxian:spirit_stone|purse'),{owner:'npc_a',resource:'xiuxian:spirit_stone',purpose:'purse'});
    for(const bad of ['Coin','coin river','1coin',''])assert.throws(()=>resourceKey(bad),/资源键无效/);
    assert.throws(()=>accountKey('a|b','coin_river','purse'),/账户键无效/);
});

test('转移是唯一写入点：源汇写入权、每日预算熔断、源只出汇只进、余额不足记漂移而不为负',()=>{
    const d=draft({state:{minute:0},ledger:{...emptyLedger(),accounts:{[purse(null,'player')]:50},flows:{[source('genesis','opening')]:50}}});
    assert.throws(()=>transfer(d,{from:purse(null,'player'),to:purse(null,'npc_x'),amount:1,writer:'nobody'}),/未登记的账本写入者/);
    assert.throws(()=>transfer(d,{from:source('mint','test'),to:purse(null,'player'),amount:1,writer:'ledger-test'}),/没有 src:mint 的写入权/);
    assert.throws(()=>transfer(d,{from:purse(null,'player'),to:sink('death','test'),amount:1,writer:'ledger-test'}),/没有 sink:death 的写入权/);
    assert.throws(()=>transfer(d,{from:sink('export','x'),to:purse(null,'player'),amount:1,writer:'ledger-test'}),/源只能流出/);
    assert.throws(()=>transfer(d,{from:source('import','x'),to:sink('export','x'),amount:1,writer:'ledger-test'}),/源不能直接流入汇/);
    assert.throws(()=>transfer(d,{from:purse(null,'player'),to:accountKey('npc_x','pack:gem','purse'),amount:1,writer:'ledger-test'}),/资源不同/);
    transfer(d,{from:source('import','wage'),to:purse(null,'player'),amount:60,writer:'ledger-test'});
    assert.throws(()=>transfer(d,{from:source('import','wage'),to:purse(null,'player'),amount:41,writer:'ledger-test'}),/预算熔断/);
    d.document.state.minute=DAY;transfer(d,{from:source('import','wage'),to:purse(null,'player'),amount:41,writer:'ledger-test'});
    transfer(d,{from:purse(null,'player'),to:sink('export','fee'),amount:150,writer:'ledger-test'});
    const l=d.document.ledger;
    assert.equal(l.accounts[purse(null,'player')],1);assert.equal(l.flows[sink('export','fee')],150);assert.deepEqual(l.drift??[],[]);
    transfer(d,{from:purse(null,'player'),to:purse(null,'npc_x'),amount:5,writer:'ledger-test'});
    assert.equal(d.document.ledger.accounts[purse(null,'player')],0,'账户永不为负（I2）');
    assert.equal(d.document.ledger.drift.at(-1).gap,4,'旧字段多付的部分记为漂移，对账即失败');
    assert.deepEqual(auditLedger(d.document.ledger),[],'含漂移源仍守恒');
    // 没有账本的文档（预演、单元测试草稿）不记账。
    const bare=draft({state:{minute:0}});assert.equal(transfer(bare,{from:purse(null,'player'),to:purse(null,'npc_x'),amount:5,writer:'ledger-test'}),0);
    // 漏改的单边写入点不拦旧结算，记一条未入账漂移。
    const e=draft({state:{minute:0},ledger:emptyLedger()});bookSide(e,purse(null,'player'),7,undefined);assert.equal(e.document.ledger.drift[0].unbooked,7);
});

test('性质：任意转移序列后逐资源 Σ账户 = Σ源 − Σ汇，账户非负',()=>{
    const owners=['player','npc_a','npc_b','loc_x'];
    fc.assert(fc.property(fc.array(fc.tuple(fc.integer({min:0,max:5}),fc.integer({min:0,max:5}),fc.integer({min:1,max:40}),fc.integer({min:0,max:3})),{maxLength:60}),steps=>{
        const d=draft({state:{minute:0},ledger:emptyLedger()});
        const side=i=>i<owners.length?purse(null,owners[i]):i===4?source('import','wage'):sink('export','fee');
        steps.forEach(([a,b,n,day],k)=>{
            d.document.state.minute=(k+day)*DAY;
            const from=side(a),to=side(b);
            try{transfer(d,{from,to,amount:n,writer:'ledger-test'});}catch(e){if(!/源|汇|相同|预算/.test(e.message))throw e;}
        });
        assert.deepEqual(auditLedger(d.document.ledger),[]);
        for(const v of Object.values(d.document.ledger.accounts))assert.ok(v>=0);
    }),{numRuns:200});
});

test('源汇词条登记在词汇表，铸币按政体与金属分种的资源形状已建，写入者全部声明',()=>{
    const o=loadOntology();assert.deepEqual(o.errors,[]);
    const resources=o.entries.resources,coin=resources.get(`core:${LEDGER_COIN}`);
    assert.equal(coin.family,'currency');assert.equal(coin.ledger,true);assert.equal(coin.broader,'coin');assert.ok(coin.money.metal&&coin.money.issuer);
    for(const c of world.rules.economy.credit.coinages)assert.ok([...resources.values()].some(r=>r.money?.coinage===c.id),`${c.id} 有资源词条`);
    const vocabulary=new Set(JSON.parse(readFileSync(new URL('../world/ontology/resources.json',import.meta.url),'utf8')).sourcesAndSinks.map(s=>s.id));
    const writers=ledgerWriters();
    for(const [w,row] of Object.entries(writers))for(const id of [...Object.keys(row.sources),...row.sinks])assert.ok(vocabulary.has(id),`${w} 用到的 ${id} 已登记`);
    assert.ok(Object.keys(writers).length>=40,'各写入模块已声明');
});

// ---- 多日推演的对账 -------------------------------------------------------------
function campaign(){
    const w=structuredClone(world),placeOf={[host]:inn,[worker]:inn,[clerk]:post};
    // 三位对手方全天在岗（与 credit.test 的夹具相同），其余人物照常作息、自治与离屏推进。
    for(const npc of w.npcs.filter(n=>placeOf[n.id]))npc.schedule={default:[{start:0,end:1440,location:placeOf[npc.id],activity:'营业',services:npc.id===host?['trade']:[]}]};
    const engine=new WorldEngine(w);
    const doc=engine.createCharacter(seed,{},'ledger-reconcile');
    doc.state.minute=600;doc.state.location=inn;doc.state.player.coins=600;
    for(const [id,location] of [[host,inn],[worker,inn],[clerk,post]])Object.assign(doc.state.npcs[id],{location,activity:'营业',status:'正常'});
    doc.state.npcs[host].inventory.item_ration=40;// 一笔够缴商税的外路货
    return {engine,doc};
}
async function step(c,tool,args,eventId,log){
    const before=c.doc,out=await c.engine.reduce(before,{tool,args,eventId}),after=applyPatches(before,out.patches);
    const bad=eventDiscrepancies(c.engine,before,after);
    assert.deepEqual(bad,[],`${eventId}：旧余额变化与新账户变化不一致`);
    const r=reconcile(c.engine,after);
    assert.deepEqual(r.mismatches,[],`${eventId}：旧余额 ≠ 新账户余额`);
    assert.deepEqual(r.drift,[],`${eventId}：双写漂移`);assert.deepEqual(r.audit,[],`${eventId}：账本不守恒`);
    // 守恒：全局货币总量变化 = 源净流入 − 汇流出（开账事件的开账额计入源）。
    const flows=flowDelta(before.ledger?before:{ledger:{flows:{}}},after,LEDGER_COIN),delta=legacyTotal(c.engine,after.state)-(before.ledger?legacyTotal(c.engine,before.state):0);
    assert.equal(delta,flows.sources-flows.sinks,`${eventId}：Δ总量 ${delta} ≠ 源 ${flows.sources} − 汇 ${flows.sinks}`);
    for(const [k,n] of Object.entries(flows.byFlow))log.set(k,(log.get(k)??0)+n);
    c.doc=after;return out.result;
}
test('多日推演对账：交易、借贷利息、受雇工钱、钱庄、商税、俸禄、周贸易与离屏推进，旧余额逐账户等于新账户',{timeout:600000},async()=>{
    const c=campaign(),log=new Map();
    assert.equal(c.doc.ledger,undefined,'新开局的第一次归约才开账');
    await step(c,'world_trade',{seller:host,item:'item_bread',quantity:2},'buy',log);
    assert.ok(c.doc.ledger.accounts[purse(null,'player')]>0);
    const opened=[...legacyMoney(c.engine,c.doc.state)].length;assert.ok(opened>250,'开账覆盖全部旧余额');
    // 店主转卖外路进货：商税从卖方钱袋转入聚落公账。
    await step(c,'world_trade',{seller:host,item:'item_ration',quantity:40},'buy-ration',log);
    assert.ok(Object.values(c.doc.state.records).some(r=>r.category==='trade_tax'&&r.amount>0),'商税经账本入公账');
    const loan=await step(c,'world_trade',{operation:'borrow',seller:host,consent:true,coins:40,days:10},'loan',log);
    await step(c,'world_trade',{operation:'work',seller:worker,consent:true,minutes:240},'work',log);
    await step(c,'world_move',{destination:post},'to-post',log);
    await step(c,'world_trade',{operation:'deposit',seller:clerk,coins:50},'deposit',log);
    await step(c,'world_trade',{operation:'withdraw',seller:clerk,coins:20},'withdraw',log);
    for(let i=0;i<6;i++)await step(c,'world_time',{minutes:DAY},`day-${i}`,log);
    await step(c,'world_move',{destination:inn},'to-inn',log);
    Object.assign(c.doc.state.npcs[host],{location:inn,activity:'营业',status:'正常'});
    const repaid=await step(c,'world_trade',{seller:host,payment:'repay',debt:loan.debt},'repay',log);
    assert.equal(repaid.repaid,loan.amount,'本息一并还清');
    // 离屏长推进：周贸易、委托托管与退款、官职月俸、人物自治交易都在其中发生。
    await step(c,'world_time',{minutes:24*DAY},'offscreen',log);
    const used=[...log.keys()].map(k=>parseAccount(k).owner);
    for(const flow of ['src:genesis','sink:export'])assert.ok(used.includes(flow),`推演中出现 ${flow}`);
    const records=Object.values(c.doc.state.records);
    assert.ok(records.some(r=>r.category==='office_salary'&&r.paid>0),'官职月俸经账本发放');
    assert.ok(records.some(r=>r.category==='settlement_trade'&&r.paidCopper>0),'周贸易货款经托管结清');
    assert.ok(Object.keys(c.doc.ledger.accounts).some(k=>k.startsWith(`${host}|`)),'借贷对手方在账');
    if(process.env.LEDGER_DEBUG)console.log(JSON.stringify({flows:Object.fromEntries(log),taxes:records.filter(r=>r.category==='trade_tax').length,transfers:c.doc.ledger.transfers,accounts:Object.keys(c.doc.ledger.accounts).length}));
    assert.deepEqual(auditLedger(c.doc.ledger),[]);
    const totals=ledgerTotals(c.doc.ledger)[LEDGER_COIN];assert.equal(totals.accounts,legacyTotal(c.engine,c.doc.state));
});
