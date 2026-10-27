// 账本双写退出第一期：漂移上报（只统计、不拒绝，不改变游戏行为）。
// 三类漂移 + 持有被拒都计入不封顶的累计次数，刻末审计把累计值写进 ledger.driftReport；
// 对账 helper（tests/helpers/ledger-audit.mjs）见到任何漂移即断言失败（F011）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {applyPatches} from '../server-plugin/storage.mjs';
import {emptyLedger,transfer,declareLedgerWriter,driftCounts,stampDriftReport} from '../server-plugin/ledger.mjs';
import {purse,bookSide,source} from '../server-plugin/money.mjs';
import {bookStock,bag} from '../server-plugin/stock.mjs';
import {emptyHoldings,recordHoldingDrift} from '../server-plugin/holdings.mjs';
import {registerAdvance} from '../server-plugin/advance-registry.mjs';
import {reconcile,assertNoDrift} from './helpers/ledger-audit.mjs';
import {openedCampaign} from './helpers/invariant-campaign.mjs';

declareLedgerWriter('drift-probe',{sources:{'src:import':{coin_river:Infinity}}});
const draft=document=>({document,get(...p){return p.reduce((v,k)=>v?.[k],this.document);},
    set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);}});
const fresh=()=>draft({state:{minute:0},ledger:emptyLedger(),holdings:emptyHoldings()});

test('四类漂移各自计数且清单封顶后累计不丢；刻末报告与累计一致',()=>{
    const d=fresh();
    transfer(d,{from:source('import','seed'),to:purse(null,'player'),amount:10,writer:'drift-probe'});
    assert.deepEqual(driftCounts(d.document),{gap:0,unbooked:0,holding:0},'无漂移时全为零');
    stampDriftReport(d);assert.equal(d.document.ledger.driftReport,undefined,'无漂移不留报告');
    transfer(d,{from:purse(null,'player'),to:purse(null,'npc_x'),amount:15,writer:'drift-probe'});// 余额不足 → src:drift 补足
    bookSide(d,purse(null,'player'),3,undefined);// 漏传 books
    bookStock(d,null,bag(null,'player','item_bread'),2,undefined);// 库存漏传 books
    recordHoldingDrift(d,{source:'probe',code:'E-PROBE',reason:'rejected'});// 持有被注册形状拒绝
    assert.deepEqual(driftCounts(d.document),{gap:1,unbooked:2,holding:1});
    for(let i=0;i<60;i++)bookSide(d,purse(null,'player'),1,undefined);
    assert.equal(d.document.ledger.drift.length,50,'清单只留最近 50 条');
    assert.equal(driftCounts(d.document).unbooked,62,'累计不封顶');
    stampDriftReport(d);
    assert.deepEqual({...d.document.ledger.driftReport,minute:undefined},{gap:1,unbooked:62,holding:1,minute:undefined});
});

test('没有账本的草稿不记漂移（预演与单元测试草稿不是战役）',()=>{
    const d=draft({state:{minute:0}});
    bookSide(d,purse(null,'player'),3,undefined);
    assert.equal(d.document.ledger,undefined);
});

test('真实引擎刻末审计报出漂移，且只上报不拒绝：推进照常完成',{timeout:600000},async()=>{
    const c=await openedCampaign('drift-report'),engine=c.engine,opened=structuredClone(c.doc);
    opened.state.scheduler={wireAdvance:true};
    let fired=0;
    const remove=registerAdvance({id:'drift_probe',order:1e9,advance(e,d){
        if(fired++)return;
        bookSide(d,purse(null,'npc_drift_probe'),7,undefined);// 漏传 books：只留漂移记录，不动余额
    }});
    try{
        const out=await engine.reduce(opened,{tool:'world_time',args:{minutes:30},eventId:'dr-time'});
        const after=applyPatches(opened,out.patches);
        assert.equal(fired>0,true);
        assert.equal(after.state.minute,opened.state.minute+30,'推进完成，没有被拒绝');
        assert.equal(after.ledger.driftReport.unbooked,1);assert.equal(after.ledger.driftTally.unbooked,1);
        assert.deepEqual(driftCounts(after),{gap:0,unbooked:1,holding:0});
        assert.throws(()=>assertNoDrift(after),/漂移/,'对账 helper 见到漂移即失败');
    }finally{remove();}
});

test('F011：对账 helper 在无漂移的真实存档上通过，在有漂移的存档上抛错',async()=>{
    const c=await openedCampaign('f011');
    assert.deepEqual(reconcile(c.engine,c.doc).drift,[]);
    const tampered=structuredClone(c.doc);
    tampered.ledger.drift=[{account:'x|coin_river|purse',gap:1}];
    assert.throws(()=>reconcile(c.engine,tampered),/漂移/);
    const held=structuredClone(c.doc);held.holdings={...held.holdings,drift:[{source:'p',code:'E'}]};
    assert.throws(()=>reconcile(c.engine,held),/漂移/);
    const tallied=structuredClone(c.doc);tallied.ledger.driftTally={unbooked:1};
    assert.throws(()=>reconcile(c.engine,tallied),/漂移/);
});
