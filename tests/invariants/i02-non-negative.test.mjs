// I2 非负（02 §I2）：任何账户在任何时刻都不为负，没有例外；透支用义务表达，不用负余额。
// 性质：随机真实动作（含超出现金的买入、超额取款）后，账本账户与旧字段余额全部为非负整数，被拒的动作不改变存档；
// 转移层面：任意透支尝试永不使账户为负，且每一次不足都被计入漂移上报（只上报不拒绝）。
// 反例：测试内构造负余额/非整数余额文档，审计必须抓住。
import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {auditLedger,transfer,emptyLedger,declareLedgerWriter,driftCounts} from '../../server-plugin/ledger.mjs';
import {purse,source} from '../../server-plugin/money.mjs';
import {canonical,applyPatches} from '../../server-plugin/storage.mjs';
import {reconcile,legacyBooks} from '../helpers/ledger-audit.mjs';
import {openedCampaign,actionArb,stepAction} from '../helpers/invariant-campaign.mjs';

const SEED=1002,RUNS=5,STEPS=8;
declareLedgerWriter('i02-probe',{sources:{'src:import':{coin_river:Infinity}}});

test('I2 性质：随机合法动作序列后，账本与旧字段余额无负数，被拒动作不改存档',{timeout:1800000},async()=>{
    await fc.assert(fc.asyncProperty(fc.array(actionArb,{minLength:STEPS,maxLength:STEPS}),async actions=>{
        const c=await openedCampaign('i02');
        for(const [i,action] of actions.entries()){
            const snapshot=canonical(c.doc),step=await stepAction(c,action,`i02-${i}`);
            if(!step){assert.equal(canonical(c.doc),snapshot,`步 ${i}：被拒动作不得改存档`);continue;}
            for(const [key,n] of Object.entries(step.after.ledger?.accounts??{}))assert.ok(Number.isSafeInteger(n)&&n>=0,`步 ${i}：账户 ${key}=${n}`);
            for(const [key,n] of legacyBooks(c.engine,step.after.state).balances)assert.ok(n>=0,`步 ${i}：旧字段 ${key}=${n}`);
            assert.deepEqual(auditLedger(step.after.ledger),[]);
        }
        reconcile(c.engine,c.doc);// 无漂移、无对账差异
        return true;
    }),{seed:SEED,numRuns:RUNS});
});

test('I2 性质：任意透支转移永不产生负余额，且每次不足都被计入漂移累计（本期只上报）',()=>{
    const owners=['player','npc_a','npc_b'];
    fc.assert(fc.property(fc.array(fc.tuple(fc.integer({min:0,max:2}),fc.integer({min:0,max:3}),fc.integer({min:1,max:50})),{minLength:10,maxLength:40}),steps=>{
        const d={document:{state:{minute:0},ledger:emptyLedger()},get(...p){return p.reduce((v,k)=>v?.[k],this.document);},
            set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);}};
        let expectedGaps=0;
        transfer(d,{from:source('import','seed'),to:purse(null,'player'),amount:100,writer:'i02-probe'});
        for(const [a,b,n] of steps){
            const from=purse(null,owners[a]),to=purse(null,b===3?'npc_c':owners[b]);if(from===to)continue;
            if((d.document.ledger.accounts[from]??0)<n)expectedGaps++;
            transfer(d,{from,to,amount:n,writer:'i02-probe'});
            for(const v of Object.values(d.document.ledger.accounts))assert.ok(Number.isSafeInteger(v)&&v>=0);
        }
        assert.equal(driftCounts(d.document).gap,expectedGaps,'每次余额不足都被统计');
        assert.deepEqual(auditLedger(d.document.ledger),[],'含漂移源仍守恒');
    }),{seed:SEED+1,numRuns:100});
});

test('I2 反例：负余额、非整数余额的文档被审计抓住',()=>{
    const ledger={...emptyLedger(),accounts:{[purse(null,'player')]:-1}};
    assert.match(auditLedger(ledger).join(';'),/账户为负或非整数/);
    assert.match(auditLedger({...emptyLedger(),accounts:{[purse(null,'player')]:0.5}}).join(';'),/账户为负或非整数/);
});
