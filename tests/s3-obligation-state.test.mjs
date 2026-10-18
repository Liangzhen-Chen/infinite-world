import test from 'node:test';
import assert from 'node:assert/strict';
import {DAY,grace,installmentState,debtDue,accruedInterest,addObligationSchedule} from '../server-plugin/obligation-state.mjs';
import {ScheduleHeap} from '../server-plugin/scheduler.mjs';
import {obligationKind,snapshotObligationTerms} from '../server-plugin/obligation-kinds.mjs';
import {snapshotContractTerms,contractTerms} from '../server-plugin/contract-state.mjs';

const loan={category:'debt',kind:'loan',createdAt:0,deadline:90*DAY,amount:101,principal:100,monthlyInterest:0.01,paid:0,installments:3,status:'待偿还'};
test('分期按总额取整；部分清偿不提前消去下一期',()=>{
    assert.equal(installmentState(loan,30*DAY).target,34);
    assert.equal(installmentState({...loan,paid:33},30*DAY).completed,0);
    assert.equal(installmentState({...loan,paid:34},30*DAY).nextDue,60*DAY);
    assert.equal(installmentState({...loan,paid:101},90*DAY).nextDue,Infinity);
    assert.equal(installmentState(loan,90*DAY).overdueCount,3);
});
test('I29：在途、失能、拘留及协议程序均不免除到期与违约；只有条款延后',()=>{
    const before=structuredClone(loan);
    for(const status of ['在途','昏迷','拘留','羁押','软禁','出神','附身']){
        const row={...loan,actorStatus:status,location:'远方',procedure:'notice'};
        assert.equal(debtDue(row,30*DAY).overdue,true,status);
    }
    const row={...loan,terms:{grace:{days:2}}};
    assert.equal(debtDue(row,31*DAY).overdue,false);
    assert.equal(debtDue(row,32*DAY).overdue,true);
    assert.equal(grace(row,0,{civil:{days:10}}).basis,'contract');
    assert.equal(grace(loan,0,{civil:{days:3}}).minutes,3*DAY);
    assert.deepEqual(loan,before);
});
test('利息闭式仅查询；360天不逐日写，终止后不累计，提前还款保留旧取整口径',()=>{
    const row={...loan,deadline:360*DAY,principal:1000,monthlyInterest:0.005};
    const before=JSON.stringify(row);
    assert.equal(accruedInterest(row,360*DAY),60);
    assert.equal(accruedInterest({...row,endedAt:45*DAY},360*DAY),7);
    assert.equal(accruedInterest(row,DAY,{round:'ceil'}),1);
    assert.equal(JSON.stringify(row),before);
});
test('义务分期、宽限和存款结息使用 S2b 日程堆',()=>{
    const heap=new ScheduleHeap(),engine={rules:{economy:{credit:{loan:{defaultGraceMinutes:DAY},depositInterest:{periodDays:30}}}}};
    addObligationSchedule(heap,engine,{...loan,terms:{grace:{days:2}}},0,100*DAY);
    assert.deepEqual(heap.ticksBetween(0,100*DAY),[32*DAY]);
    addObligationSchedule(heap,engine,{category:'bank',id:'bank',interestAt:DAY},0,100*DAY);
    assert.deepEqual(heap.ticksBetween(0,100*DAY),[31*DAY,32*DAY]);
    addObligationSchedule(heap,engine,{...loan,status:'已还清'},0,100*DAY);
    assert.equal(heap.entries.length,2);
});
test('forward、开放 bounty、approval 和生灵义务可注册；签署代理与条款不随输入修改',()=>{
    for(const kind of ['forward','bounty','approval','pact','gratitude','grievance','vow'])assert.equal(obligationKind({kind}).id,kind);
    const row={kind:'pact',actedAs:{source:'office',authority:['contract'],version:1},terms:{deferredPrice:{years:3}},createdAt:0};
    const signed=snapshotObligationTerms(row),contract=snapshotContractTerms(row);
    row.actedAs.authority.push('destroy');row.terms.deferredPrice.years=100;
    assert.deepEqual(signed.terms.actedAs.authority,['contract']);assert.equal(signed.terms.deferredPrice.years,3);
    assert.deepEqual(contractTerms(contract,10).actedAs.authority,['contract']);
    const amended={...contract,amendments:[{minute:5,actedAs:{source:'new-office',authority:['destroy'],version:2},inName:'someone-else',wage:30}]};
    assert.deepEqual(contractTerms(amended,10).actedAs.authority,['contract']);
    assert.equal(contractTerms(amended,10).wage,30);
    assert.equal(signed.terms.onDebtorGone,'pursue');
    assert.equal(obligationKind({kind:'gratitude'}).onCreditorGone,'heirs');
    const delivery=snapshotObligationTerms({reservationVersion:1,deliveryVersion:1,promisor:'courier',promisee:'player'});
    assert.equal(delivery.terms.onDebtorGone,'substitute_performance','送货义务不可被预约兼容字段误归为人身承诺');
});
