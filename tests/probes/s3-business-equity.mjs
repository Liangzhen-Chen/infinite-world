import assert from 'node:assert/strict';
import {fixture,host,worker,clerk,inn,DAY,cash} from '../helpers/finance.mjs';
import {once} from './harness.mjs';
import {financeTransfer} from '../../server-plugin/finance-bank.mjs';
import {settleEmploymentPay,settleArrears} from '../../server-plugin/labor-market.mjs';
import {obligationView} from '../../server-plugin/obligation-state.mjs';
import {auditLedger} from '../../server-plugin/ledger.mjs';
import {legacyMoney} from '../../server-plugin/money.mjs';
import {legalCodeAt} from '../../server-plugin/law-codes.mjs';
import {organization,advanceOrganizations,DUES_PERIOD} from '../../server-plugin/organizations.mjs';
import {shareNpcMemory} from '../../server-plugin/npc-cognition.mjs';
import {knownTopics} from '../../server-plugin/public-opinion.mjs';
import {openHolding} from '../../server-plugin/holdings.mjs';

function books(f){
 assert.deepEqual(auditLedger(f.doc.ledger),[]);
 for(const [account,value] of legacyMoney(f.e,f.doc.state))assert.equal(f.doc.ledger.accounts[account]??0,value,account);
}
export const equityLiabilityScenario=once(async()=>{
 const results=[];
 for(const form of [undefined,'limited','unlimited']){
  const f=fixture(),total=cash(f.doc);
  const own=await f.act({operation:'invest',seller:host,quantity:10,consent:true,...(form?{liability:form}:{})},'sign');
  const terms=f.doc.state.records[own.contract].clauses.liability;
  assert.equal(terms.form,form??'limited');assert.equal(terms.contribution,own.cost);assert.equal(terms.consentEvent,'sign');
  const job={id:'job',category:'contract',kind:'workshop',owner:host,worker,wage:20,location:f.doc.state.location,createdAt:0,starts:0,deadline:30*DAY,status:'有效',source:'signed',paid:0,workedMinutes:0};
  let d=f.draft();d.set(['state','records','job'],job);financeTransfer(d,f.e,host,'player',d.get('state','npcs',host,'coins'),'insolvency');
  settleEmploymentPay(d,f.e,job,600,480);d.set(['state','minute'],600+3*DAY);settleArrears(d,f.e,job,600+3*DAY);d.done();
  assert.match(f.doc.state.records.job.status,/已辞/);
  const debt='debt_wage:job:600',caseId=f.doc.state.records[debt].defaulted.case,code=legalCodeAt(f.e,f.doc.state.location,f.doc.state);
  f.doc.state.location=code.court;for(const n of Object.values(f.doc.state.npcs)){n.location=code.court;n.activity='办公';}
  for(const n of f.w.npcs)delete n.schedule;
  await f.act({operation:'hear',case:caseId,authority:code.judges[0]},'hear','world_law');
  assert.ok(f.doc.state.records[caseId].judgment,'hearing must enter judgment');
  assert.equal(f.doc.state.npcs[host].coins,0,'insolvent issuer cash');
  const player=f.doc.state.player.coins,employee=f.doc.state.npcs[worker].coins,owed=obligationView(f.doc.state,debt).owed;
  if(form==='unlimited'){
   d=f.draft();financeTransfer(d,f.e,'player',clerk,player-5,'personal-spending');d.done();
   const partial=await f.act({operation:'pay',case:caseId,authority:code.officers[0]},'execute-part','world_law');
   assert.equal(partial.recovered,5);assert.equal(partial.remaining,owed-5);assert.equal(f.doc.state.player.coins,0);
   d=f.draft();financeTransfer(d,f.e,clerk,'player',owed-5,'personal-receipt');d.done();
   const paid=await f.act({operation:'pay',case:caseId,authority:code.officers[0]},'execute','world_law');
   assert.equal(paid.remaining,0);assert.equal(f.doc.state.player.coins,0);assert.equal(f.doc.state.npcs[worker].coins,employee+owed);
   assert.equal(paid.shareholderExecutions[0].contract,own.contract);assert.equal(obligationView(f.doc.state,debt).owed,0);
   const balance=f.doc.state.player.coins,workerBalance=f.doc.state.npcs[worker].coins;
   const again=await f.act({operation:'pay',case:caseId,authority:code.officers[0]},'again','world_law');
   assert.equal(again.recovered,0);assert.equal(f.doc.state.player.coins,balance);assert.equal(f.doc.state.npcs[worker].coins,workerBalance);
  }else{
   await assert.rejects(f.act({operation:'pay',case:caseId,authority:code.officers[0]},'execute','world_law'),/没有可执行资金/);
   assert.equal(f.doc.state.player.coins,player);assert.equal(obligationView(f.doc.state,debt).owed,owed);
  }
  assert.equal(cash(f.doc),total);books(f);results.push(form??'default-limited');
 }
 return results.join(' / ');
});

export const businessMembershipScenario=once(async()=>{
 const f=fixture({at:inn}),total=cash(f.doc),orgTool='world_settlement';
 f.doc.state.buildings[inn]={owner:host,condition:100};
 f.e.byId.get(host).creditPolicy={limitCopper:100000,maximumMinutes:60*DAY,minimumTrust:-100};
 const found=await f.act({type:'org',name:'商号会籍验收行会',data:{notes:'失信商号可议决除名',occupation:'行会'}},'guild','world_create'),id=found.organization;
 const lease=await f.act({operation:'lease',seller:host,consent:true,days:30,payment:'credit',creditMinutes:60*DAY},'shop-lease');
 const shop=lease.business;let d;
 await f.act({operation:'business_open',business:shop},'shop-open',orgTool);
 await f.act({operation:'org_propose',org:id,action:'charter',cost:7,coins:3,consent:false},'charter',orgTool);
 const before=f.doc.state.player.coins;
 // S4: this business belongs to the acting player; the action itself is their
 // consent. A caller flag cannot supply a different person's decision.
 await f.act({operation:'org_join',org:id,member:shop},'business-join',orgTool);
 await assert.rejects(f.act({operation:'org_join',org:id,member:shop,consent:true},'already-joined',orgTool),/已是成员/);
 let view=organization(f.e,f.doc.state,id);assert.equal(f.doc.state.player.coins,before-7);
 assert.equal(view.members[shop].representative,'player');assert.ok(view.members[shop].feeAccount);
 const edges=Object.values(f.doc.holdings.rows);assert.ok(edges.some(r=>r.kind==='business_member_of'&&r.holder===shop&&r.until===undefined));
 d=f.draft();assert.throws(()=>openHolding(d,{kind:'business_member_of',holder:'bld_hw_mill',subject:id,writer:'organizations',engine:f.e}));
 await assert.rejects(f.act({operation:'org_join',org:id,member:'bld_hw_mill',consent:true},'not-business',orgTool));
 // One due period, including the founder: both actual purses pay, never the business id as an NPC.
 const due=f.doc.state.records[`organization:${id}`].nextDues;
 d=f.draft();d.set(['state','minute'],due);advanceOrganizations(d,f.e,{before:due-1,after:due});d.done();
 assert.equal(organization(f.e,f.doc.state,id).members[shop].arrears,0);
 assert.ok(f.doc.state.records[`organization:${id}`].ledger.some(r=>r.party===shop&&r.amount===3));
 // An NPC leader must learn the public business event before judging it.
 // Sponsorship pays the admission cost; the present NPC still decides freely.
 await f.act({operation:'org_join',org:id,member:host,feePayer:'player'},'leader-join',orgTool);
 await f.act({operation:'org_propose',org:id,action:'appoint',member:host,name:'会长'},'leader',orgTool);
 d=f.draft();d.set(['state','npcs',host,'location'],'loc_bs');
 financeTransfer(d,f.e,'player',worker,d.get('state','player','coins'),'cash-loss');d.done();
 await f.act({operation:'business_bankrupt',business:shop},'business-failure',orgTool);
 assert.equal(f.doc.state.records[shop].status,'破产');assert.ok(obligationView(f.doc.state,lease.debt).owed>0);
 assert.equal([...knownTopics(f.e,f.doc,host).values()].some(t=>t.actor===shop),false);
 const motion=await f.act({operation:'org_propose',org:id,action:'expel',member:shop},'expel',orgTool);
 d=f.draft();const unawareAt=f.doc.state.minute;d.set(['state','minute'],unawareAt+1440);advanceOrganizations(d,f.e,{before:unawareAt,after:unawareAt+1440});d.done();
 assert.ok(organization(f.e,f.doc.state,id).members[shop]);assert.equal(f.doc.state.records[motion.proposal].status,'否决');
 d=f.draft();d.set(['state','npcs',host,'location'],f.doc.state.location);
 const memory=d.get('state','npcs',worker,'memoryStream').find(m=>m.sourceEvent==='business-failure:business-breach');assert.ok(memory?.eventRumor);
 shareNpcMemory(d,f.e,{from:worker,to:host,memoryId:memory.id,eventId:'retell'});d.done();
 assert.ok([...knownTopics(f.e,f.doc,host).values()].some(t=>t.actor===shop));
 const expel=await f.act({operation:'org_propose',org:id,action:'expel',member:shop},'expel-informed',orgTool);
 d=f.draft();const now=d.get('state','minute');d.set(['state','minute'],now+1440);advanceOrganizations(d,f.e,{before:now,after:now+1440});d.done();
 assert.equal(f.doc.state.records[expel.proposal].status,'通过');assert.equal(organization(f.e,f.doc.state,id).members[shop],undefined);
 assert.ok(!Object.values(f.doc.holdings.rows).some(r=>r.kind==='business_member_of'&&r.holder===shop&&r.until===undefined));
 assert.ok(f.doc.state.records[expel.proposal].votes.some(v=>v.voter===host&&v.basis.includes('商号失信')));
 assert.equal(cash(f.doc),total);books(f);
 return '真实商号会籍、代表、入会费/会费，未获知拒绝、传闻获知后依章程除名';
});
