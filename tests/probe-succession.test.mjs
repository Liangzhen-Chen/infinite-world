// PR-01 death and succession: replays probe run-001 events E02, E03 and E11.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {recordEntityDeath} from '../server-plugin/npc-life.mjs';
import {settlementGovernment,personOffices} from '../server-plugin/entity-view.mjs';
import {advanceByElections} from '../server-plugin/elections.mjs';
import {advanceLaborMarket} from '../server-plugin/labor-market.mjs';
import {governanceAction} from '../server-plugin/governance.mjs';
import {organization} from '../server-plugin/organizations.mjs';
import {adjustStanding} from '../server-plugin/standing.mjs';
import {activeGuardianship} from '../server-plugin/family-inheritance.mjs';
import {familyRules} from '../world/design/rw09-family.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const DAY=1440,YP='loc_bs_yupo',HEAD='npc_yp_zhaofeng',BANK=world.rules.economy.credit.banks[0];
function draft(document){return {document,patches:[],get(...p){return p.reduce((o,k)=>o?.[k],this.document);},
 set(path,value){const patch={op:'set',path,value};this.document=applyPatches(this.document,[patch]);this.patches.push(patch);},
 remove(path){const patch={op:'delete',path};this.document=applyPatches(this.document,[patch]);this.patches.push(patch);},say(){}};}
function setup(edit=()=>{}){
 const w=structuredClone(world);for(const n of w.npcs)delete n.schedule;edit(w);
 const engine=new WorldEngine(w),doc=engine.createCharacter(seed,{},'probe-succession');doc.state.player.coins=50000;
 const run=async(c,tool,args,eventId)=>{const out=await engine.reduce(c,{tool,args,eventId});return {document:applyPatches(c,out.patches),result:out.result};};
 return {engine,doc,run,w};
}
const cases=c=>Object.entries(c.state.records).filter(([k,r])=>r.category==='legal_case'&&k.startsWith('legal_case:default:'));
function debt(c,key,row){c.state.records[key]={category:'debt',paid:0,status:'待偿还',createdAt:c.state.minute-DAY,deadline:c.state.minute+20*DAY,location:YP,source:'probe',...row};}

test('E02 死者债务按法定顺序从遗产清偿，不足部分记坏账；不对死者立案，分期不再扣款',async()=>{
 const {engine,doc,run}=setup(),c=structuredClone(doc),worker='npc_yp_gaoxin';
 debt(c,'debt_lend_probe',{kind:'player_loan',debtor:HEAD,representative:HEAD,creditor:'player',principal:3000,interest:300,amount:3300,installments:10,nextInstallment:1,nextPayment:c.state.minute+2*DAY});
 debt(c,'debt_bank_probe',{kind:'loan',debtor:HEAD,creditor:BANK.id,bank:BANK.id,amount:2000});
 debt(c,'debt_wage_probe',{kind:'wage',debtor:HEAD,creditor:worker,amount:500});
 c.state.npcs[HEAD].coins=5000;
 const player=c.state.player.coins,wage=c.state.npcs[worker].coins,d=draft(c),bank=d.get('state','records',BANK.id)?.coins??BANK.reserveCopper??0;
 const death=recordEntityDeath(d,engine,HEAD,c.state.minute,'猝死'),r=d.get('state','records');
 assert.ok(death.estate.heirs.length,'赵枫有继承人');
 const heirsBefore=Object.fromEntries(death.estate.heirs.map(h=>[h,doc.state.npcs[h]?.coins??0]));
 // Wages first, then the bank, then the private loan; the shortfall is bad debt.
 assert.equal(r.debt_wage_probe.status,'已还清');assert.equal(d.get('state','npcs',worker,'coins'),wage+500);
 assert.equal(r.debt_bank_probe.status,'已还清');assert.equal(d.get('state','records',BANK.id).coins,bank+2000);
 assert.equal(r.debt_lend_probe.status,'坏账');assert.equal(r.debt_lend_probe.paid,2500);assert.equal(r.debt_lend_probe.badDebt.remaining,800);
 assert.equal(d.get('state','player','coins'),player+2500);
 assert.equal(death.estate.coins,0);for(const h of death.estate.heirs)assert.equal(d.get('state','npcs',h,'coins'),heirsBefore[h],'债务不转嫁继承人');
 assert.deepEqual(death.estate.settlements.map(s=>s.debt),['debt_wage_probe','debt_bank_probe','debt_lend_probe']);
 // Forty days later: no installment taken from the dead, no default case against him.
 let after=d.document;for(let i=0;i<2;i++)after=(await run(after,'world_time',{minutes:20*DAY},`wait${i}`)).document;
 assert.equal(after.state.records.debt_lend_probe.paid,2500);assert.equal(after.state.records.debt_lend_probe.status,'坏账');
 assert.deepEqual(cases(after),[]);

 // Enough estate: debts are cleared and only the remainder is divided.
 const rich=structuredClone(doc);debt(rich,'debt_lend_probe',{kind:'player_loan',debtor:HEAD,creditor:'player',amount:3300});rich.state.npcs[HEAD].coins=5000;
 const r2=draft(rich),full=recordEntityDeath(r2,engine,HEAD,rich.state.minute,'猝死');
 assert.equal(r2.get('state','records','debt_lend_probe','status'),'已还清');assert.equal(full.estate.coins,1700);
 assert.equal(full.estate.allocations.reduce((n,a)=>n+a.coins,0),1700);
});

test('E02 雇主身故：继承人承接雇佣；无继承人时官府封存遗产，欠薪照常累计，付不出即停工且不立案',()=>{
 const {engine,doc}=setup(),W='npc_hw_ayan',contract=(owner,id)=>{const at=doc.state.minute,start=Math.floor(at/DAY)*DAY+DAY+480;
  return {category:'contract',kind:'workshop',laborMarket:1,id,owner,worker:W,task:'受雇做工',location:'loc_hw',wage:20,workMinutes:480,deadline:at+30*DAY,parties:[W,owner],
   starts:start,nextWork:start+540,createdAt:at,status:'有效',paid:0,produced:0,workedMinutes:0,attendance:{},shifts:[],source:id,settlement:'loc_hw'};};
 // With an heir the heir becomes the employer.
 const a=structuredClone(doc);a.state.records['workshop:heir']=contract(HEAD,'workshop:heir');
 const da=draft(a),withHeir=recordEntityDeath(da,engine,HEAD,a.state.minute,'猝死'),row=da.get('state','records','workshop:heir');
 assert.equal(row.status,'有效');assert.equal(row.owner,withHeir.estate.heir);assert.equal(row.succession.mode,'继承人承接');assert.deepEqual(withHeir.employment,['workshop:heir']);
 // Without an heir the estate is sealed and keeps paying until it runs dry.
 const O='npc_hw_wushuo',b=structuredClone(doc);b.state.records['workshop:sealed']=contract(O,'workshop:sealed');b.state.npcs[O].coins=50;
 const db=draft(b),sealed=recordEntityDeath(db,engine,O,b.state.minute,'猝死');
 assert.deepEqual(sealed.estate.heirs,[]);const estate=db.get('state','records',sealed.estate.sealed);
 assert.equal(estate.status,'官府封存');assert.equal(estate.coins,50);assert.equal(estate.settlement,'loc_hw');
 assert.equal(db.get('state','records','workshop:sealed','owner'),estate.id);
 const start=db.get('state','records','workshop:sealed','starts'),days=[0,1,2,3,4,5].map(i=>Math.floor(start/DAY)+i),coins=db.get('state','npcs',W,'coins');
 db.set(['state','records','workshop:sealed','attendance'],Object.fromEntries(days.map(x=>[String(x),480])));
 const before=db.get('state','minute');advanceLaborMarket(db,engine,{before,after:start+6*DAY,id:'sealed-wages'});
 const job=db.get('state','records','workshop:sealed');
 assert.equal(db.get('state','records',estate.id,'coins'),0);assert.equal(db.get('state','npcs',W,'coins'),coins+50);
 const arrears=Object.values(db.get('state','records')).filter(r=>r.kind==='wage'&&r.contract==='workshop:sealed');
 assert.ok(arrears.length&&arrears.every(r=>r.debtor===estate.id),'欠薪记在封存遗产名下');
 assert.ok(['罢工','已辞工'].includes(job.status),job.status);assert.equal(job.shifts[2].arrears,10);
 assert.deepEqual(cases(db.document),[]);
});

test('E02 头人暴毙：副职代理，住户自荐补选，当选人按现行规则就任领俸',()=>{
 const {engine,doc}=setup(),d=draft(structuredClone(doc)),now=doc.state.minute;
 recordEntityDeath(d,engine,HEAD,now,'猝死');
 const gov=settlementGovernment(engine,d.get('state'),YP);
 assert.equal(gov.head.value,null);assert.equal(gov.acting.value,'npc_yp_lisha');
 advanceByElections(d,engine,{before:now,after:now+DAY});
 const election=Object.values(d.get('state','records')).find(r=>r.category==='election'&&r.settlement===YP);
 assert.ok(election?.byElection);assert.equal(election.status,'竞选中');assert.ok(election.candidates.length>=1);
 for(const c of election.candidates){assert.notEqual(c.candidate,'player');assert.equal(c.by,c.candidate);}
 advanceByElections(d,engine,{before:now+DAY,after:now+5*DAY});
 const done=d.get('state','records',election.id);assert.equal(done.status,'已选出');
 assert.ok(done.candidates.some(c=>c.candidate===done.winner));
 d.set(['state','minute'],now+5*DAY);
 assert.equal(settlementGovernment(engine,d.get('state'),YP).head.value,done.winner);
 const office=personOffices(engine,d.get('state'),done.winner,{settlement:YP}).find(o=>o.value.office==='office_village_head');
 assert.equal(office.value.name,'村长');assert.ok(office.value.monthlySalaryCopper>0);
 // The player can still join a by-election that residents opened.
 const e2=draft(structuredClone(doc));recordEntityDeath(e2,engine,HEAD,now,'猝死');advanceByElections(e2,engine,{before:now,after:now+DAY});
 assert.ok(Object.values(e2.get('state','records')).some(r=>r.byElection&&r.status==='竞选中'));
});

test('E02 监护人死亡按族谱顺位改指定；无合格亲属才交官府待指定',()=>{
 const A='npc_hw_anhuai',B='npc_hw_jiaoyou',C='npc_hw_duanhe',D='npc_hw_baihui',G='npc_hw_linsui';
 const {engine,doc,w}=setup(w=>{w.rules.law.family=structuredClone(familyRules);w.rules.law.family.rules=[{polity:'王国',property:'children',title:'eldest-child',office:'vacant'}];
  for(const n of [...w.npcs,...w.residents])n.relationships=(n.relationships??[]).filter(r=>![A,B,C,D,G].includes(r.with));
  for(const [id,age]of [[A,45],[B,38],[C,12],[D,25],[G,60]]){const p=w.npcs.find(n=>n.id===id);p.age=age;delete p.birth;p.flags={minor:age<18,romanceable:age>=18};p.tier='full';
   p.relationships=id===A?[{with:C,type:'子女'},{with:D,type:'子女'}]:id===G?[{with:C,type:'子女'}]:[];}
 });
 for(const id of [A,B,C,D,G])Object.assign(doc.state.npcs[id],{coins:0,inventory:{},relationships:{}});doc.state.npcs[A].coins=20;
 const d=draft(doc),m=doc.state.minute;
 recordEntityDeath(d,engine,A,m,'寿终');
 const first=activeGuardianship(engine,d.get('state'),C);assert.equal(first.guardian,G);
 const gDeath=recordEntityDeath(d,engine,G,m+DAY,'寿终');
 const second=d.get('state','records',first.id);assert.equal(second.status,'代管中');assert.equal(second.guardian,D,'父母之后由成年兄姊接任');assert.equal(second.previousGuardian,G);
 assert.ok(gDeath.guardianships.includes(first.id));
 // No qualified kin left: the household adult is dead too, so the court appoints.
 for(const x of w.households.find(h=>h.members.includes(C)).members)if(x!==C)d.set(['state','npcs',x,'status'],'死亡');
 recordEntityDeath(d,engine,D,m+2*DAY,'寿终');
 const third=d.get('state','records',first.id);assert.equal(third.guardian,null);assert.equal(third.status,'待指定');assert.equal(third.custodian,'官府');
});

test('E03 升镇后管事职名派生为镇管事；任命人去职后管事留任，由继任头人经任免入口撤换',()=>{
 const {engine,doc}=setup(),c=structuredClone(doc),now=c.state.minute,hall='bld_yp_hall',steward='npc_yp_gaoxin';
 const k=`governance_office:${YP}:office_village_head:player`;
 c.state.records[k]={category:'governance_office',id:k,holder:'player',settlement:YP,office:'office_village_head',status:'在任',since:now,until:now+360*DAY,nextReview:now+90*DAY};
 c.state.records['housing_steward:p']={category:'housing_steward',id:'housing_steward:p',steward,grantor:'player',settlement:YP,createdAt:now,expires:now+360*DAY,hall,rules:{plots:[],fees:{}}};
 const names=s=>personOffices(engine,s,steward).map(o=>o.value.name);
 assert.deepEqual(names(c.state),['村管事']);
 c.state.records[`settlement_rank:${YP}`]={category:'settlement_rank',id:`settlement_rank:${YP}`,settlement:YP,level:'镇',superior:'loc_bs',since:now};
 assert.deepEqual(names(c.state),['镇管事']);
 c.state.records[k]={...c.state.records[k],status:'已免职',removedAt:now};
 assert.deepEqual(names(c.state),['镇管事'],'任命人去职，管事默认留任');
 const successor='npc_yp_lisha',key=`governance_office:${YP}:office_village_head:${successor}`;
 c.state.records[key]={category:'governance_office',id:key,holder:successor,settlement:YP,office:'office_village_head',status:'在任',since:now+1,until:now+360*DAY,nextReview:now+90*DAY};
 c.state.minute=now+1;c.state.location=hall;for(const x of [successor,steward])Object.assign(c.state.npcs[x],{location:hall,activity:'议事',status:'正常'});
 assert.equal(settlementGovernment(engine,c.state,YP).head.value,successor);assert.deepEqual(names(c.state),['镇管事']);
 const d=draft(c);
 assert.throws(()=>governanceAction.call(engine,d,{operation:'governance_revoke',settlement:YP,authorization:'housing_steward:p',authority:'npc_yp_gaoxin'},'bad-revoke'),/头人/);
 governanceAction.call(engine,d,{operation:'governance_revoke',settlement:YP,authorization:'housing_steward:p',authority:successor},'revoke');
 assert.equal(d.get('state','records','housing_steward:p','revokedBy'),successor);assert.deepEqual(names(d.get('state')),[]);
});

test('E11 掌门坐化：首脑空缺后长老自荐按章程议决；相持不下时两位长老约斗，败者依约认输；NPC之间可直接约斗',async()=>{
 const A='npc_hw_linsui',B='npc_hw_ayan',C='npc_hw_chenbai',W='npc_hw_gucen';
 const {engine,doc:start,run}=setup(w=>{for(const id of [B,C])w.npcs.find(n=>n.id===id).personality.traits=['尚武'];});
 let doc=structuredClone(start);doc.state.minute=540;
 for(const id of [A,B,C,W])Object.assign(doc.state.npcs[id],{location:doc.state.location,activity:'闲谈',coins:100,status:'正常'});
 const act=async(tool,args,id)=>{const out=await run(doc,tool,args,id);doc=out.document;return out.result;},org=(args,id)=>act('world_settlement',args,id);
 const id=(await act('world_create',{type:'org',name:'清虚观',data:{notes:'道门',occupation:'教会'}},'found')).organization;
 for(const m of [A,B,C]){const j=await org({operation:'org_join',org:id,member:m,consent:true},'join'+m);if(j.proposal)await org({operation:'org_vote',org:id,proposal:j.proposal,opinion:'approve'},'v'+m);}
 for(const m of [B,C])await org({operation:'org_propose',org:id,action:'appoint',member:m,name:'长老'},'el'+m);
 await org({operation:'org_propose',org:id,action:'appoint',member:A,name:'主祭'},'lead');
 assert.equal(organization(engine,doc.state,id).leader,A);
 // The two elders distrust each other, so each self-nomination is voted down.
 const d=draft(doc);adjustStanding(d,engine,B,C,-30,{sourceEvent:'feud',reason:'争位'});adjustStanding(d,engine,C,B,-30,{sourceEvent:'feud',reason:'争位'});
 recordEntityDeath(d,engine,A,doc.state.minute,'坐化');doc=d.document;
 assert.equal(organization(engine,doc.state,id).leader,null);
 await act('world_time',{minutes:DAY},'day1');
 const motions=()=>Object.values(doc.state.records).filter(r=>r.category==='organization_proposal'&&r.org===id&&r.succession);
 assert.ok(motions().length>=1);assert.ok(motions().every(p=>p.proposer!=='player'&&p.motion.member===p.proposer));
 await act('world_time',{minutes:4*DAY},'day5');
 const duel=Object.values(doc.state.records).find(r=>r.category==='duel'&&r.stakes?.org===id);
 assert.ok(duel,'相持后约斗');assert.equal(duel.status,'已结束');assert.equal(duel.rule,'touch');
 const view=organization(engine,doc.state,id);assert.equal(view.leader,duel.winner);assert.ok(view.members[duel.loser],'点到为止，败者仍是成员');
 assert.equal(view.treasury,0);

 // A death duel between two NPCs through the ordinary duel entry.
 let other=structuredClone(start);other.state.minute=540;for(const x of [B,C,W])Object.assign(other.state.npcs[x],{location:other.state.location,activity:'闲谈',status:'正常'});
 const o=draft(other);adjustStanding(o,engine,C,B,-80,{sourceEvent:'grudge',reason:'旧仇'});other=o.document;
 const out=await run(other,'world_settlement',{operation:'duel_challenge',speaker:B,member:C,authority:W,choice:'death'},'npc-duel');
 assert.equal(out.result.status,'已结束');assert.ok([B,C].includes(out.result.winner));
 const loser=out.result.loser;assert.equal(out.document.state.npcs[loser].status,'死亡');
 assert.ok(Object.values(out.document.state.family.deaths).some(r=>r.person===loser&&r.cause==='决斗身亡'));
});
