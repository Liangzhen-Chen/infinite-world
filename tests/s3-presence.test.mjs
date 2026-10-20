import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,host,inn,post} from './helpers/finance.mjs';
import {repayDebt} from '../server-plugin/contracts.mjs';
import {assertSettlementPresent,settlementLocation} from '../server-plugin/obligation-presence.mjs';

test('清偿前校验到场，拒绝不能先扣款或登记已还；在途不是到场',()=>{
    const f=fixture({at:post}),id='debt_presence',row={category:'debt',debtor:'player',creditor:host,amount:20,paid:0,createdAt:0,deadline:1000,status:'待偿还'};
    f.doc.state.records[id]=row;f.doc.state.npcs[host].location=inn;
    const before=JSON.stringify(f.doc),d=f.draft();
    assert.throws(()=>repayDebt(d,f.e,{buyer:'player',seller:host,debt:id},'absent'),/在场.*寄汇/);
    assert.equal(JSON.stringify(f.doc),before);
    f.doc.state.npcs[host].location=post;
    assert.doesNotThrow(()=>assertSettlementPresent(f.e,f.doc.state,'player',host));
    f.doc.state.npcs[host].scheduleTravel={arrive:1000};
    assert.throws(()=>assertSettlementPresent(f.e,f.doc.state,'player',host),/在场/);
});
test('网点账户取网点位置，工程和遗产取工地、seat 或执行人',()=>{
    const f=fixture(),bank=f.e.rules.economy.credit.banks[0];
    assert.equal(settlementLocation(f.e,f.doc.state,bank.id),bank.location);
    f.doc.state.projects.project_test={location:post};
    assert.equal(settlementLocation(f.e,f.doc.state,'project_test'),post);
    f.doc.state.records['protocol_assets:estate_test']={seat:inn};
    assert.equal(settlementLocation(f.e,f.doc.state,'estate_test'),inn);
});
