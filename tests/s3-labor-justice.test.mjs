import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,host,worker,clerk,DAY,cash} from './helpers/finance.mjs';
import {settleEmploymentPay,settleArrears} from '../server-plugin/labor-market.mjs';
import {obligationView} from '../server-plugin/obligation-state.mjs';
import {registerEarnedClaim} from '../server-plugin/obligation-claims.mjs';
import {lawAction,registerCreditDefault,adjudicateLegalCase} from '../server-plugin/law.mjs';
import {legalCodeAt} from '../server-plugin/law-codes.mjs';
import {mineEmployment} from '../server-plugin/extraction.mjs';
import {openLedger,auditLedger} from '../server-plugin/ledger.mjs';
import {legacyMoney} from '../server-plugin/money.mjs';
import {legacyStock} from '../server-plugin/stock.mjs';
import {commitNpcCrime} from '../server-plugin/npc-crime.mjs';

function setup(wage=7){
 const f=fixture(),row={id:'job',category:'contract',kind:'workshop',owner:host,worker,wage,location:f.doc.state.location,createdAt:0,starts:0,deadline:30*DAY,status:'有效',source:'signed',paid:0,workedMinutes:0};
 f.doc.state.records.job=row;return {f,row};
}
test('工资只按实际工时跨段取整；同次结算重放不重复付钱，换日不丢零头',()=>{
 const {f,row}=setup();let d=f.draft();
 const a=settleEmploymentPay(d,f.e,row,600,1),b=settleEmploymentPay(d,f.e,row,601,239),c=settleEmploymentPay(d,f.e,row,2040,240);
 assert.equal(a.earned+b.earned+c.earned,7);assert.equal(a.paid+b.paid+c.paid,7);
 const before=JSON.stringify(d.document);assert.deepEqual(settleEmploymentPay(d,f.e,row,2040,240),c);assert.equal(JSON.stringify(d.document),before);
 assert.throws(()=>settleEmploymentPay(d,f.e,row,2040,241),/不一致/);
 assert.throws(()=>settleEmploymentPay(d,f.e,row,2041,-1),/工时/);
});
test('欠薪只保留一份规范债权；失能和离职不抹已经赚得的工资',()=>{
 const {f,row}=setup(20);f.doc.state.npcs[host].coins=0;f.doc.state.npcs[worker].status='昏迷';
 const d=f.draft(),pay=settleEmploymentPay(d,f.e,row,600,480);assert.equal(pay.arrears,20);
 const id='debt_wage:job:600';assert.equal(obligationView(d.get('state'),id).owed,20);
 settleArrears(d,f.e,row,600+3*DAY);assert.equal(d.get('state','records','job','status'),'已辞工');
 assert.equal(obligationView(d.get('state'),id).owed,20);assert.ok(d.get('state','records',id,'defaulted','case'));
});
test('法院对活体雇主先执行真实NPC工资，再执行普通债权；账本与双端余额守恒',()=>{
 const f=fixture(),s=f.doc.state,code=legalCodeAt(f.e,s.location,s);assert.ok(code);
 s.location=code.court;for(const n of Object.values(s.npcs))n.location=code.court;
 s.npcs[host].coins=25;s.npcs[worker].coins=0;s.npcs[clerk].status='正常';
 const officer=code.officers.find(id=>id!==host&&id!==worker)??code.officers[0];
 s.npcs[officer]={...s.npcs[officer],location:code.court,status:'正常',activity:'办公',coins:s.npcs[officer]?.coins??0};
 f.doc.ledger=openLedger(f.e,f.doc);const d=f.draft();
 registerEarnedClaim(d,f.e,{id:'senior',kind:'wage',debtor:host,creditor:worker,amount:20,createdAt:0,deadline:1,location:code.court,source:'work'});
 registerEarnedClaim(d,f.e,{id:'junior',kind:'loan',debtor:host,creditor:'player',amount:30,createdAt:0,deadline:1,location:code.court,source:'loan'});
 const caseId=registerCreditDefault(d,f.e,{debt:'junior',row:d.get('state','records','junior'),value:30,minute:600});
 d.set(['state','records','junior','defaulted'],{case:caseId});
 const row=d.get('state','records',caseId);d.set(['state','records',caseId],{...row,status:'已裁定',judgment:{fine:0,compensation:30}});
 const result=lawAction.call(f.e,d,{operation:'pay',case:caseId,authority:officer},'execute');
 assert.equal(d.get('state','npcs',worker,'coins'),20);assert.equal(result.recovered,5);assert.equal(result.remaining,25);
 assert.equal(obligationView(d.get('state'),'senior').owed,0);assert.equal(obligationView(d.get('state'),'junior').owed,25);
 assert.deepEqual(auditLedger(d.get('ledger')),[]);
 for(const [key,value]of legacyMoney(f.e,d.get('state')))assert.equal(d.get('ledger','accounts',key),value,key);
});
test('实际NPC矿工消耗工具并从同一有限矿脉取矿；非法用工进入原法律案件',()=>{
 const {f,row}=setup(),location=row.location,place=f.e.byId.get(location),tool=f.e.rules.extraction.mining.tool;
 const item='item_iron';place.minerals=[{item,reserve:1,owner:clerk}];
 Object.assign(row,{task:'矿脉开采',item,owner:host,attendance:{0:480}});f.doc.state.records.job=row;
 f.doc.state.npcs[worker].inventory[tool]={quantity:1,durability:100};
 f.doc.state.npcs[worker].attributes={力量:1000,敏捷:1000,精神:1000};
 f.doc.ledger=openLedger(f.e,f.doc);
 let d=f.draft();const before=d.get('state','npcs',worker,'inventory',tool,'durability');
 const result=mineEmployment(d,f.e,row,600,480);assert.ok(result);assert.equal(result.success,true);
 assert.equal(result.illegal,true);assert.ok(result.case);assert.equal(d.get('state','records',result.case,'offender'),worker);
 assert.equal(d.get('state','records',`mineral:${location}:${item}`,'reserve'),0);
 assert.equal(f.e.quantity(d,host,item),1);assert.ok(d.get('state','npcs',worker,'inventory',tool,'durability')<before);
 const snapshot=JSON.stringify(d.document);assert.deepEqual(mineEmployment(d,f.e,row,600,480),result);assert.equal(JSON.stringify(d.document),snapshot);
 assert.deepEqual(auditLedger(d.get('ledger')),[]);for(const [key,value]of legacyStock(f.e,d.get('state')).balances)assert.equal(d.get('ledger','accounts',key),value,key);
 assert.throws(()=>mineEmployment(d,f.e,row,601,480),/枯竭/);
});
test('有实际代收授权的NPC挪用钱款并沿真实路线逃亡；伪造授权不得扣钱',()=>{
 const f=fixture(),s=f.doc.state;const before=s.npcs[host].coins,thief=s.npcs[worker].coins;
 s.records.cashGrant={id:'cashGrant',category:'authorization',action:'payment',grantor:host,grantee:worker,createdAt:0,expires:DAY};
 const d=f.draft(),plan={actor:worker,victim:host,offense:'fraud',embezzlement:true,authorization:'cashGrant',need:'money',intelligence:3,destination:'bld_hw_qingdeng'};
 const id=commitNpcCrime(d,f.e,plan,600);assert.ok(id);const row=d.get('state','records',id);
 assert.equal(d.get('state','npcs',host,'coins'),before-row.value);
 const flight=row.npcCrime.flight;assert.ok(flight?.arrive>flight.depart);assert.equal(d.get('state','npcs',worker,'location'),null);
 assert.equal(d.get('state','npcs',worker,'coins'),thief+row.value-flight.cost);
 const g=fixture(),snapshot=JSON.stringify(g.doc),fresh=g.draft();assert.equal(commitNpcCrime(fresh,g.e,{...plan,authorization:'forged'},600),null);assert.equal(JSON.stringify(fresh.document),snapshot);
});
test('合法矿工按可用工时连续作业，矿尽即止，只结实际开采耗时',()=>{
 const {f,row}=setup(),tool=f.e.rules.extraction.mining.tool;f.e.byId.get(row.location).minerals=[{item:'item_iron',reserve:3,owner:host}];
 Object.assign(row,{task:'矿脉开采',item:'item_iron',attendance:{0:480}});f.doc.state.records.job=row;
 f.doc.state.npcs[worker].inventory[tool]={quantity:1,durability:100};f.doc.state.npcs[worker].attributes={力量:1000,敏捷:1000,精神:1000};
 f.doc.ledger=openLedger(f.e,f.doc);
 const d=f.draft(),mined=mineEmployment(d,f.e,row,600,480);assert.equal(mined.obtained[0].quantity,3);assert.equal(mined.minutesSpent,3*f.e.rules.extraction.mining.minutes);assert.equal(mined.illegal,false);assert.deepEqual(mined.cases,[]);assert.equal(f.e.quantity(d,host,'item_iron'),3);
 assert.deepEqual(auditLedger(d.get('ledger')),[]);for(const [key,value]of legacyStock(f.e,d.get('state')).balances)assert.equal(d.get('ledger','accounts',key),value,key);
});
