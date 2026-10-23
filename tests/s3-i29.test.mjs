import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,clerk,host,inn,DAY,grantLoanConsent} from './helpers/finance.mjs';
import {advanceContracts} from '../server-plugin/contracts.mjs';
import {personConstraint} from '../server-plugin/entity-view.mjs';
import {pawnDeadline} from '../server-plugin/obligation-state.mjs';

test('R3-E15 / I29：真实借款入狱后分期照常到期；昏迷和远行也不冻结',async()=>{
    const f=fixture({at:inn});
    // A3 借约须真实同意；入狱、昏迷、远行不冻结分期的 I29 断言不变。
    f.doc=grantLoanConsent(f.e,f.doc,{lender:host,principal:50,days:30,eventId:'i29-loan-consent'});
    const loan=await f.act({operation:'borrow',seller:host,coins:50,days:30,quantity:3},'s3-prison-loan');
    const row=f.doc.state.records[loan.debt],at=row.createdAt+10*DAY;
    f.doc.state.records['s3:detention']={category:'legal_detention',subject:'player',status:'生效',minute:f.doc.state.minute,expires:at+90*DAY};
    assert.ok(personConstraint(f.e,f.doc.state,'player'));
    f.doc.state.player.status='昏迷';f.doc.state.location='loc_bs';
    f.tick(at);
    assert.equal(f.doc.state.records[loan.debt].status,'逾期');
    assert.equal(f.doc.state.records[loan.debt].installmentOverdueAt,at);
    assert.equal(f.doc.state.records[loan.debt].amount,row.amount);
});
test('R2-E1 / I29：当期到期与在场无关；只有明确宽限条款延后流当',async()=>{
    const f=fixture();
    const pawn=await f.act({operation:'pawn',seller:clerk,item:'item_bread',quantity:10,days:1},'s3-pawn');
    const row=f.doc.state.records[pawn.contract],at=pawnDeadline(row,f.e,row.createdAt);
    f.doc.state.player.status='昏迷';f.doc.state.location='loc_bs';
    f.tick(at);assert.equal(f.doc.state.records[pawn.contract].status,'流当');
    const g=fixture(),p=await g.act({operation:'pawn',seller:clerk,item:'item_bread',quantity:10,days:1},'s3-pawn-grace');
    const old=g.doc.state.records[p.contract],days=g.e.rules.economy.credit.pawn.graceDays+2;
    g.doc.state.records[p.contract]={...old,terms:{grace:{days}}};
    g.tick(old.auctionAt);assert.notEqual(g.doc.state.records[p.contract].status,'流当');
    g.tick(old.deadline+days*DAY);assert.equal(g.doc.state.records[p.contract].status,'流当');
});
test('通用欠款的宽限来自条款，违约保留所用依据',()=>{
    const f=fixture(),id='s3:debt';
    f.doc.state.records[id]={category:'debt',debtor:'player',creditor:clerk,createdAt:0,deadline:DAY,amount:10,paid:0,status:'待偿还',clauses:{grace:{days:2}}};
    let d=f.draft();advanceContracts(d,f.e,2*DAY,[id]);d.done();
    assert.equal(f.doc.state.records[id].status,'待偿还');
    d=f.draft();advanceContracts(d,f.e,3*DAY,[id]);d.done();
    assert.equal(f.doc.state.records[id].status,'逾期');
    assert.equal(f.doc.state.records[id].graceBasis.basis,'contract');
});
