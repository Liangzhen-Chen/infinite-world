import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,host,worker,clerk,DAY,cash,grantLoanConsent} from './helpers/finance.mjs';
import {settleFinancialClaim} from '../server-plugin/finance-bank.mjs';
import {obligationView} from '../server-plugin/obligation-state.mjs';
import {settleEmploymentPay} from '../server-plugin/labor-market.mjs';
import {adoptLegacyObligation,openObligation,settleObligation} from '../server-plugin/obligation-runtime.mjs';
import {netAssets} from '../server-plugin/finance-assets.mjs';
import {standing} from '../server-plugin/standing.mjs';
import {worldActions} from '../server-plugin/action-affordances.mjs';
import {loadActionRegistry} from '../server-plugin/action-registry.mjs';
import {affairs} from '../server-plugin/ui-affairs.mjs';
import {collectChronicleFacts} from '../server-plugin/chronicle.mjs';
import {openLedger,auditLedger} from '../server-plugin/ledger.mjs';

test('R2-E1 义务子项：两张真实当票分别到期，异地不冻结，未到期条款不改写',async t=>{
 const f=fixture();
 // F007: pledges are valued by the valuation role (bread 2 x floor .5 = 1 copper a loaf), so 20 loaves back each 10-copper advance at 50%.
 const first=await f.act({operation:'pawn',seller:clerk,item:'item_bread',quantity:20,coins:10,days:1},'ticket-one');
 // 第15章典当沿用银行 loanMaximumDays=60，无典当期限例外；两张当票仍须有不同到期日。
 const second=await f.act({operation:'pawn',seller:clerk,item:'item_bread',quantity:20,coins:10,days:2},'ticket-two');
 const old=structuredClone(f.doc.state.records[second.contract]);
 f.doc.state.location='loc_bs';f.tick(600+10*DAY);
 assert.equal(f.doc.state.records[first.contract].status,'流当');
 assert.equal(f.doc.state.records[second.contract].deadline,old.deadline);assert.equal(f.doc.state.records[second.contract].amount,old.amount);assert.equal(f.doc.state.records[second.contract].paid,old.paid);
 t.diagnostic('覆盖到期/未到期分离；经营者死亡、NPC成交、真实风雪和条件宽限仍未构成整题证据。');
});
test('R2-E3 义务子项：真实欠薪只减一次股份净值，清偿前不分红',async t=>{
 const f=fixture(),equity=await f.act({operation:'invest',seller:host,quantity:20,consent:true},'pharmacy-equity');
 f.doc.state.records[`finance_profit:${host}`]={category:'finance_profit',issuer:host,net:1000};
 const before=f.draft(),value=netAssets(before,f.e,host);before.done();
 f.doc.state.npcs[host].coins=0;
 const d=f.draft(),job={id:'pharmacy-job',category:'contract',kind:'workshop',owner:host,worker,wage:20,location:f.doc.state.location,createdAt:0,starts:0,deadline:30*DAY,status:'有效',paid:0,workedMinutes:0};
 d.set(['state','records',job.id],job);const earned=settleEmploymentPay(d,f.e,job,600,480);assert.equal(earned.arrears,20);d.done();
 const claim=Object.values(f.doc.state.records).find(r=>r.kind==='wage');assert.ok(claim.obligation);
 const quote=f.draft();const once=netAssets(quote,f.e,host);assert.ok(once<value);adoptLegacyObligation(quote,f.e,claim.id??Object.keys(f.doc.state.records).find(k=>f.doc.state.records[k]===claim));assert.equal(netAssets(quote,f.e,host),once);quote.done();
 f.tick(f.doc.state.records[equity.contract].nextDividend);assert.equal(f.doc.state.records[equity.contract].distributed,0);
 t.diagnostic('覆盖实际欠薪/股份去重/分红顺序；幼子监护经营、贷款继承、认证不继承整链仍需补齐。');
});
test('R2-N1 义务子项：真实签署保存签约法域，钱款不能冒充粮食交割',t=>{
 const f=fixture();f.doc.ledger=openLedger(f.e,f.doc);const d=f.draft();
 const opened=openObligation(d,f.e,{id:'forward-grain',kind:'forward',debtor:'player',creditor:host,actor:'player',subject:'item_oats',resource:'item_oats',amount:10,deadline:600+30*DAY},'forward-sign');
 const row=obligationView(d.get('state'),opened.id).row;assert.equal(row.terms.signingPlace,f.doc.state.location);assert.ok(row.terms.signingLawVersion);
 const before=structuredClone(d.document);assert.throws(()=>settleObligation(d,f.e,{id:opened.id,amount:10},'fake-grain'),/Non-monetary/);assert.deepEqual(d.document,before);assert.deepEqual(auditLedger(d.get('ledger')),[]);
 t.diagnostic('仅覆盖签署快照与禁止凭空交粮；预付、短交、展期、继承及司法闭环未完成。');
});
test('R3-E15 义务子项：拘留不冻结分期，真实同城第三人代付不取得债务主体权利',async t=>{
 // A3 真实借贷同意补齐前提；代偿、债务主体与私密记忆断言不变。
 const f=fixture();f.doc=grantLoanConsent(f.e,f.doc,{lender:host,principal:50,days:30,eventId:'detained-loan-consent'});
 const loan=await f.act({operation:'borrow',seller:host,coins:50,days:30,quantity:3},'detained-loan');
 const start=f.doc.state.minute;f.doc.state.records.detention={category:'legal_detention',subject:'player',status:'生效',minute:start,expires:start+90*DAY};
 f.doc.state.location='loc_bs';f.tick(start+10*DAY);assert.equal(obligationView(f.doc.state,loan.debt).overdueCount,1);
 const total=cash(f.doc),payer=f.doc.state.npcs[worker].coins,d=f.draft();
 const paid=settleFinancialClaim(d,f.e,{claim:loan.debt,payer:worker,amount:10},'companion-pay');assert.equal(paid.transferred,10);d.done();
 assert.equal(f.doc.state.npcs[worker].coins,payer-10);assert.equal(cash(f.doc),total);assert.equal(obligationView(f.doc.state,loan.debt).row.debtor,'player');
 const memory=f.doc.state.npcs[host].memoryStream.find(m=>m.obligation===obligationView(f.doc.state,loan.debt).row.id&&m.kind==='debt');
 assert.equal(memory.payer,worker);assert.equal(memory.forDebtor,'player');assert.equal(memory.amount,10);assert.match(memory.content,/替/);
 t.diagnostic('覆盖到期与代偿；异地寄汇、租金代收、玉流当、90天折旧及同伴日程仍需整链验收。');
});
test('R10: 正常还款的规范回执及兼容投影只产生一次守信关系证据',async()=>{
 // A3 真实借贷同意替代布尔前提；一次守信证据与同屋旁人不可知断言保留。
 const f=fixture();f.doc=grantLoanConsent(f.e,f.doc,{lender:host,principal:50,days:30,eventId:'trust-loan-consent'});
 const loan=await f.act({operation:'borrow',seller:host,coins:50,days:30},'trust-loan');
 const before=standing(f.e,f.doc.state,host,'player');
 await f.act({seller:host,payment:'repay',debt:loan.debt},'trust-repay');
 assert.equal(standing(f.e,f.doc.state,host,'player'),before+3);
 const rows=Object.values(f.doc.state.relationEvidence??{}).filter(r=>r.to==='player'&&['信守约定','实际清偿'].includes(r.eventType));
 assert.equal(rows.length,1);
 const id=obligationView(f.doc.state,loan.debt).row.id,memories=f.doc.state.npcs[host].memoryStream.filter(m=>m.obligation===id);
 assert.equal(memories.filter(m=>/已签订/.test(m.content)).length,1);assert.equal(memories.filter(m=>/偿还/.test(m.content)).length,1);
 assert.ok(memories.every(m=>m.private===true));assert.equal(f.doc.state.npcs[worker].memoryStream.some(m=>m.obligation===id),false);
 assert.equal(f.doc.state.npcs[host].memoryStream.filter(m=>/偿还/.test(m.content)).length,1);
 assert.equal(f.doc.state.npcs[worker].memoryStream.some(m=>/偿还|欠款/.test(m.content)),false);
});
test('R10: 分期已经逾期，年终期限之前补清也不新增守信奖励',async()=>{
 // A3 真实借贷同意补齐前提；逾期补清不获守信奖励的断言不变。
 const f=fixture();f.doc=grantLoanConsent(f.e,f.doc,{lender:host,principal:50,days:30,eventId:'late-trust-loan-consent'});
 const loan=await f.act({operation:'borrow',seller:host,coins:50,days:30,quantity:3},'late-trust-loan');
 f.tick(f.doc.state.minute+11*DAY);const before=standing(f.e,f.doc.state,host,'player');
 await f.act({seller:host,payment:'repay',debt:loan.debt},'late-trust-repay');
 assert.equal(standing(f.e,f.doc.state,host,'player'),before);
 assert.equal(obligationView(f.doc.state,loan.debt).owed,0);
});
test('R01: 当面可偿的未到期债权保留候选，远方不可点还款但账目仍保留余额',async()=>{
 // A3 真实借贷同意补齐前提；还款候选的在场限制与远方余额断言不变。
 const f=fixture();f.doc=grantLoanConsent(f.e,f.doc,{lender:host,principal:50,days:30,eventId:'menu-loan-consent'});
 const loan=await f.act({operation:'borrow',seller:host,coins:50,days:30},'menu-loan');
 const registry=loadActionRegistry(),source=registry.actions.find(a=>a.slots.some(s=>s.options==='debts'));assert.ok(source);
 const only={...registry,actions:[{...source,preconditions:['hasDebt'],visibility:{catalog:'here'}}]};
 const view=()=>worldActions(f.e,f.doc,{registry:only});
 assert.ok(view().actions[0].slots.flatMap(s=>s.options??[]).some(o=>o.value===loan.debt));
 f.doc.state.npcs[host].location='loc_bs';assert.equal(view().actions.length,0);
 assert.ok(affairs(f.e,f.doc).obligations.some(r=>r.id===obligationView(f.doc.state,loan.debt).row.id&&r.outstanding>0));
});
test('R09: 钱庄柜员只记一次实际经手的借约与还款，同屋旁人不获知私债',async()=>{
 const f=fixture(),bank=f.e.rules.economy.credit.banks[0],quantity=Math.ceil(50*bank.collateralRatio/1);// F007: a loaf is valued 1 copper (base 2 x scarcity floor .5), not the catalogue 2
 const loan=await f.act({operation:'borrow',seller:clerk,coins:50,days:10,item:'item_bread',quantity,consent:true},'clerk-loan');
 await f.act({seller:clerk,payment:'repay',debt:loan.debt},'clerk-repay');
 const memories=f.doc.state.npcs[clerk].memoryStream;
 assert.equal(memories.filter(m=>/借约登记/.test(m.content)).length,1);
 assert.equal(memories.filter(m=>/偿还/.test(m.content)).length,1);
 assert.ok(memories.filter(m=>/借约登记|偿还/.test(m.content)).every(m=>m.private===true));
 assert.equal(f.doc.state.npcs[worker].memoryStream.some(m=>/借约|偿还|欠款/.test(m.content)),false);
});
test('R09: 他人代付不远程授予未在场NPC债务人付款知识',async()=>{
 const f=fixture(),loan=await f.act({operation:'lend',seller:host,coins:50,days:30,consent:true},'unseen-loan');
 f.doc.state.npcs[host].location='loc_bs';const beforeDoc=structuredClone(f.doc),before=structuredClone(f.doc.state.npcs[host].memoryStream),d=f.draft();
 settleFinancialClaim(d,f.e,{claim:loan.debt,payer:worker,amount:10},'unseen-payment');d.done();
 assert.deepEqual(f.doc.state.npcs[host].memoryStream,before);
 const memory=f.doc.state.npcs[worker].memoryStream.find(m=>m.forDebtor===host&&m.amount===10);
 assert.equal(memory.payer,worker);assert.equal(memory.location,f.doc.state.location);assert.equal(memory.private,true);
 const facts=collectChronicleFacts(f.e,beforeDoc,f.doc,{eventId:'unseen-payment',tool:'world_time'}).filter(r=>r.reference===`obligations:${memory.obligation}`);
 assert.equal(facts.length,1);assert.equal(facts[0].location,f.doc.state.location);assert.equal(facts[0].visibleTo.includes(host),false);assert.equal(facts[0].visibleTo.includes('player'),false);
});
