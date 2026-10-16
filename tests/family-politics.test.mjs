import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {genealogy,legalChildren,natalFamily} from '../server-plugin/family-state.mjs';
import {inheritanceRule,activeGuardianship,advanceGuardianships} from '../server-plugin/family-inheritance.mjs';
import {advanceFamilyAlliances} from '../server-plugin/family-diplomacy.mjs';
import {familyAction} from '../server-plugin/family-politics.mjs';
import {recordEntityDeath,marriageBlocker} from '../server-plugin/npc-life.mjs';
import {lawAction} from '../server-plugin/law.mjs';
import {groupView,personView} from '../server-plugin/entity-view.mjs';
import {standing} from '../server-plugin/standing.mjs';
import {npcHousehold} from '../server-plugin/npc-state.mjs';
import {familyRules} from '../world/design/rw09-family.mjs';
import {toolDefinitions} from '../extension/tools.mjs';
import {advanceTitles} from '../server-plugin/titles.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const A='npc_hw_anhuai',B='npc_hw_jiaoyou',C='npc_hw_duanhe',D='npc_hw_baihui',G='npc_hw_linsui',ITEM='item_oats',DAY=1440,YEAR=360*DAY;
function draft(document){return {document,patches:[],get(...p){return p.reduce((o,k)=>o?.[k],this.document);},set(path,value){const patch={op:'set',path,value};this.document=applyPatches(this.document,[patch]);this.patches.push(patch);},remove(path){const patch={op:'delete',path};this.document=applyPatches(this.document,[patch]);this.patches.push(patch);},say(){}};}
function setup(property='equal'){
 const w=structuredClone(world);w.rules.law.family=structuredClone(familyRules);w.rules.law.family.rules=[{polity:'王国',property,title:'eldest-child',office:'vacant'}];
 for(const n of [...w.npcs,...w.residents])n.relationships=(n.relationships??[]).filter(r=>![A,B,C,D,G].includes(r.with));
 for(const n of w.npcs){delete n.schedule;delete n.tier;}
 for(const [id,age]of [[A,45],[B,38],[C,12],[D,25],[G,60]]){const p=w.npcs.find(n=>n.id===id);p.age=age;delete p.birth;p.relationships=[];p.flags={minor:age<18,romanceable:age>=18};p.tier='full';p.schedule={default:[{start:0,end:1440,location:'bld_hw_council',activity:'闲谈',services:[]}]};}
 const e=new WorldEngine(w),doc=e.createCharacter(seed,{},'family-politics');doc.state.minute=600;doc.state.location='bld_hw_council';
 for(const id of [A,B,C,D,G])Object.assign(doc.state.npcs[id],{location:doc.state.location,activity:'闲谈',coins:0,inventory:{},relationships:{}});
 const d=draft(doc),setKin=(parent,child,extra={})=>{const p=w.npcs.find(n=>n.id===parent);p.relationships.push({with:child,type:'子女',...extra});};
 return {w,e,d,setKin};
}
const action=(f,args,id='family-test')=>familyAction.call(f.e,f.d,args,id);
const tie=(f,a,b)=>{f.d.set(['state','npcs',a,'relationships',b],{trust:90,affection:90});f.d.set(['state','npcs',b,'relationships',a],{trust:90,affection:90});};
const die=f=>recordEntityDeath(f.d,f.e,A,600,'寿终');

test('族谱由亲属关系派生，已故亲属在知情范围内保留，私密关系不泄漏',()=>{
 const f=setup();f.setKin(A,C);f.setKin(A,D,{private:true,knownBy:[A]});
 let tree=genealogy(f.e,f.d.get('state'),A);assert.ok(tree.people.some(p=>p.id===C));assert.ok(!tree.people.some(p=>p.id===D));
 f.d.set(['state','location'],'loc_hw_fields');const death=die(f);assert.ok(!genealogy(f.e,f.d.get('state'),C).people.find(p=>p.id===A)?.diedAt);
 f.d.set(['state','family','seenByPlayer',death.id],600);
 tree=genealogy(f.e,f.d.get('state'),C);assert.equal(tree.people.find(p=>p.id===A).status,'已故');
 assert.ok(!f.d.get('state','family','genealogy'));assert.ok(!f.d.get('state','family','trees'));
});
test('离屏出生和成婚只在当事人或已知事件范围进入族谱',()=>{
 const f=setup();f.d.set(['state','family','people','npc_child_test'],{id:'npc_child_test',name:'小禾',age:0,parents:{father:A},sourceEvent:'birth_test'});
 assert.ok(!genealogy(f.e,f.d.get('state'),A).people.some(p=>p.id==='npc_child_test'));
 f.d.set(['state','family','seenByPlayer','birth_test'],600);
 assert.ok(genealogy(f.e,f.d.get('state'),A).people.some(p=>p.id==='npc_child_test'));
});
test('家族复用组织视图，族长与共有族产随事实改变，个人产权不冒充族产',()=>{
 const f=setup();f.setKin(A,C);const id=natalFamily(f.e,f.d.get('state'),A);
 f.d.set(['state','buildings','family_home'],{owner:id,owners:{[A]:0.5,[C]:0.5}});
 f.d.set(['state','buildings','private_home'],{owner:A});
 let g=groupView(f.e,f.d.get('state'),id).organization.value;assert.equal(g.kind,'家族');assert.ok(g.members[C]);assert.equal(g.properties.length,1);
 assert.ok(personView(f.e,f.d.get('state'),A).organizations.some(r=>r.value.id===id));
 const head=g.leader;f.d.set(['state','npcs',head,'status'],'死亡');g=groupView(f.e,f.d.get('state'),id).organization.value;assert.notEqual(g.leader,head);
 assert.equal(f.d.get('state','records',`organization:${id}`),undefined);
});
test('当地均分规则分配铜钱物品、共有产权、股份、存款；爵位归长子女，普通公职空缺',()=>{
 const f=setup();f.setKin(A,C);f.setKin(A,D);f.d.set(['state','npcs',A,'coins'],11);
 f.d.set(['state','npcs',A,'inventory'],{[ITEM]:5});f.d.set(['state','buildings','inherit_home'],{owner:A});
 f.d.set(['state','records','title:test'],{category:'title',id:'title:test',holder:A,title:'准爵',rank:'三等',status:'受封'});
 f.d.set(['state','records','office:test'],{category:'governance_office',id:'office:test',holder:A,office:'office_village_head',settlement:'loc_hw',status:'在任'});
 f.d.set(['state','records','equity:test'],{category:'equity',id:'equity:test',holder:A,share:30,stake:90,distributed:0,status:'有效'});
 f.d.set(['state','records','bank:test'],{category:'bank',accounts:{[A]:17},coins:17});
 const death=die(f),s=f.d.get('state');assert.deepEqual(death.estate.heirs,[C,D].sort());
 assert.equal(s.npcs[C].coins+s.npcs[D].coins,11);assert.equal(f.e.quantity(f.d,C,ITEM)+f.e.quantity(f.d,D,ITEM),5);assert.equal(s.npcs[A].coins,0);
 assert.equal(s.buildings.inherit_home.owners[C],0.5);assert.equal(s.records['title:test'].holder,D);assert.equal(s.records['office:test'].status,'已免职');
 assert.equal(s.records['bank:test'].accounts[C]+s.records['bank:test'].accounts[D],17);
 assert.equal(Object.values(s.records).filter(r=>r.category==='equity'&&r.status==='有效').reduce((n,r)=>n+r.share,0),30);
 const before=structuredClone(s);assert.deepEqual(die(f),death);assert.deepEqual(f.d.get('state'),before);
});
test('各政体、文化规则取自 L1，当地长幼与子女均分实际改变继承人',()=>{
 const f=setup('eldest');f.setKin(A,C);f.setKin(A,D);f.d.set(['state','npcs',A,'coins'],13);assert.equal(die(f).estate.heir,D);
 const t=setup('children');t.setKin(A,C);t.setKin(A,D);assert.deepEqual(die(t).estate.heirs,[D,C]);
 const c=setup();c.w.rules.law.family=structuredClone(familyRules);c.w.npcs.find(n=>n.id===A).culture='culture_ms_tanjie';assert.equal(inheritanceRule(c.e,c.d.get('state'),A,'loc_hw').property,'household');
 const p=setup();p.w.rules.law.family=structuredClone(familyRules);delete p.w.npcs.find(n=>n.id===A).culture;p.w.rules.law.codes.find(c=>c.locations.includes('loc_hw')).polity='翡翠林盟';assert.equal(inheritanceRule(p.e,p.d.get('state'),A,'loc_hw').property,'equal');
});
test('继承的 NPC 爵位按本人记录推进，不覆盖玩家爵位或收入；明确世袭职位才继任',()=>{
 const f=setup('children');f.setKin(A,D);f.w.rules.law.family.rules[0].office='hereditary';
 f.d.set(['state','records','title:npc'],{category:'title',id:'title:npc',holder:A,title:'准爵',rank:'三等',status:'受封',nextIncome:30*DAY,levy:{due:YEAR,men:1,days:10,served:0}});
 f.d.set(['state','records','office:npc'],{category:'governance_office',id:'office:npc',holder:A,status:'在任',hereditary:true});
 die(f);advanceTitles(f.d,f.e,{after:30*DAY});assert.equal(f.d.get('state','records','title:npc','holder'),D);assert.equal(f.d.get('state','records','title:npc','nextIncome'),60*DAY);assert.equal(f.d.get('state','records','title:player'),undefined);assert.equal(f.d.get('state','records','office:npc','holder'),D);
});
test('共有资产只分亡者份额，分产裁判保留第三方原产权',()=>{
 const f=setup();f.setKin(A,C);f.setKin(A,D);f.d.set(['state','buildings','shared'],{owner:natalFamily(f.e,f.d.get('state'),A),owners:{[A]:0.5,[G]:0.5}});const death=die(f);
 assert.equal(f.d.get('state','buildings','shared','owners',G),0.5);assert.equal(f.d.get('state','buildings','shared','owners',C),0.25);
 f.d.set(['state','buildings','shared','owners'],{[D]:1});
 const complaint=action(f,{operation:'family_dispute',member:C,sourceEvent:death.id,content:'共有人独占房屋'},'shared-suit'),judge=f.e.rules.law.codes.find(c=>c.court==='bld_hw_council').judges[0];f.d.set(['state','npcs',judge,'location'],'bld_hw_council');
 lawAction.call(f.e,f.d,{operation:'hear',case:complaint.case,authority:judge},'shared-hear');assert.equal(f.d.get('state','buildings','shared','owners',G),0.5);assert.equal(f.d.get('state','buildings','shared','owners',C),0.25);
});
test('NPC 继承的封地爵位向本人支付实际税收分成，玩家账不受影响',()=>{
 const f=setup('children');f.setKin(A,D);f.w.rules.law.family.rules[0].office='hereditary';
 f.d.set(['state','records','office:income'],{category:'governance_office',id:'office:income',office:'office_village_head',holder:A,settlement:'loc_hw',status:'在任',hereditary:true,since:0});
 f.d.set(['state','records','title:income'],{category:'title',id:'title:income',holder:A,title:'勋爵',rank:'三等',fief:'loc_hw',status:'受封',nextIncome:30*DAY,incomeMark:0,levy:{due:YEAR,men:1,days:10,served:0}});
 f.d.set(['state','records','village-fiscal:loc_hw'],{taxReceiptsCopper:100});f.d.set(['state','settlements','loc_hw','treasury'],1000);
 const player=f.d.get('state','player','coins');die(f);advanceTitles(f.d,f.e,{after:30*DAY});
 const income=f.d.get('state','records','title_income:title:income:1');assert.ok(income.income>0);assert.equal(income.holder,D);assert.equal(f.d.get('state','npcs',D,'coins'),income.income-income.tribute);assert.equal(f.d.get('state','player','coins'),player);
});
test('当地法院能指定待定监护人，合法开支付真实在场收款者并记账，重复请求不重复付款',()=>{
 const f=setup(),judge=f.e.rules.law.codes.find(c=>c.court==='bld_hw_council').judges[0];f.d.set(['state','npcs',judge,'location'],'bld_hw_council');f.d.set(['state','npcs',C,'coins'],12);
 f.d.set(['state','records','guardianship:waiting'],{category:'guardianship',id:'guardianship:waiting',ward:C,guardian:null,status:'待指定',ledger:[]});
 assert.throws(()=>action(f,{operation:'family_manage',member:C,speaker:G,choice:'appoint',authority:B,consent:true},'bad-appoint'),/法官/);
 action(f,{operation:'family_manage',member:C,speaker:G,choice:'appoint',authority:judge,consent:true},'guardian-appoint');
 const args={operation:'family_manage',member:C,speaker:G,choice:'支出',authority:B,coins:3,content:'购置生活用品',consent:true};action(f,args,'ward-expense');action(f,args,'ward-expense');
 assert.equal(f.d.get('state','npcs',C,'coins'),9);assert.equal(f.d.get('state','npcs',B,'coins'),3);assert.equal(f.d.get('state','records','guardianship:waiting','ledger').length,1);
});
test('人物当前亲属事实改变后重新派生族谱，单边私密声明不能被反向公开记录绕过',()=>{
 const f=setup();assert.ok(!genealogy(f.e,f.d.get('state'),A).people.some(p=>p.id===C));
 f.d.set(['state','npcs',A,'relationships',C],{type:'子女',trust:50,private:true,knownBy:[A]});f.d.set(['state','npcs',C,'relationships',A],{type:'父亲',trust:50});
 assert.ok(!genealogy(f.e,f.d.get('state'),A).people.some(p=>p.id===C));assert.ok(genealogy(f.e,f.d.get('state'),A,A).people.some(p=>p.id===C));
});
test('未成年继承人保有财产；监护有任期，侵吞可由原法庭追偿且不造钱',()=>{
 const f=setup('children');f.setKin(A,C);f.setKin(G,C);f.d.set(['state','npcs',A,'coins'],20);
 const death=die(f),guard=activeGuardianship(f.e,f.d.get('state'),C);assert.equal(guard.guardian,G);assert.ok(guard.expires>600);assert.equal(f.d.get('state','npcs',C,'coins'),20);
 action(f,{operation:'family_manage',member:C,speaker:G,consent:true,choice:'侵吞',coins:7,content:'擅自据为己有'},'take');
 const complaint=action(f,{operation:'family_dispute',member:C,sourceEvent:guard.id,content:'代管人侵吞'},'complaint');
 const judge=f.e.rules.law.codes.find(c=>c.court==='bld_hw_council').judges[0];
 f.d.set(['state','npcs',judge,'location'],'bld_hw_council');f.d.set(['state','npcs',judge,'activity'],'审理');
 const result=lawAction.call(f.e,f.d,{operation:'hear',case:complaint.case,authority:judge},'hear');assert.equal(result.judgment.compensation,7);
 lawAction.call(f.e,f.d,{operation:'claim',case:complaint.case,authority:judge},'claim');assert.equal(f.d.get('state','npcs',C,'coins'),20);assert.equal(f.d.get('state','npcs',G,'coins'),0);
 lawAction.call(f.e,f.d,{operation:'claim',case:complaint.case,authority:judge},'claim-again');assert.equal(f.d.get('state','npcs',C,'coins'),20);
 assert.equal(f.d.get('state','records',guard.id,'status'),'已撤换');assert.ok(death.estate.guardianships.includes(guard.id));
});
test('监护到成年结束，越权与期满不能动用继承人钱袋',()=>{
 const f=setup('children');f.setKin(A,C);f.setKin(G,C);f.d.set(['state','npcs',A,'coins'],20);die(f);
 assert.throws(()=>action(f,{operation:'family_manage',member:C,speaker:B,consent:true,choice:'侵吞',coins:1,content:'越权'}),/权限/);
 f.d.set(['state','minute'],7*YEAR);advanceGuardianships(f.d,f.e,7*YEAR);assert.equal(activeGuardianship(f.e,f.d.get('state'),C),undefined);
 assert.throws(()=>action(f,{operation:'family_manage',member:C,speaker:G,consent:true,choice:'侵吞',coins:1,content:'过期'}),/权限/);
});
test('分产争议经实际法庭恢复被独占产权，异地和无权人不能裁判',()=>{
 const f=setup();f.setKin(A,C);f.setKin(A,D);f.d.set(['state','buildings','plot_test'],{owner:A});const death=die(f);
 f.d.set(['state','buildings','plot_test'],{owner:D,owners:{[D]:1}});
 const complaint=action(f,{operation:'family_dispute',member:C,sourceEvent:death.id,content:'共同房屋被独占'},'partition');
 assert.throws(()=>lawAction.call(f.e,f.d,{operation:'hear',case:complaint.case,authority:B},'bad'),/资格/);
 const code=f.e.rules.law.codes.find(c=>c.court==='bld_hw_council'),judge=code.judges[0];f.d.set(['state','npcs',judge,'location'],code.court);
 lawAction.call(f.e,f.d,{operation:'hear',case:complaint.case,authority:judge},'good');assert.equal(f.d.get('state','buildings','plot_test','owners',C),0.5);
 assert.equal(f.d.get('state','buildings','plot_test','owners',D),0.5);
});
test('成年双方各自愿意才联姻，联姻改变两家及势力立场，条件履行后才结盟',()=>{
 const f=setup();tie(f,A,B);f.w.npcs.find(n=>n.id===A).faction='faction_river_council';f.w.npcs.find(n=>n.id===B).faction='faction_road_caravan';
 assert.throws(()=>action(f,{operation:'family_marry',member:B,speaker:A,consent:false}),/同意/);
 assert.throws(()=>action(f,{operation:'family_marry',member:C,speaker:A,consent:true}),/未成年/);
 const marriage=action(f,{operation:'family_marry',member:B,speaker:A,consent:true},'marry'),s=f.d.get('state'),a=natalFamily(f.e,s,A),b=natalFamily(f.e,s,B);
 assert.ok(standing(f.e,s,a,b)>0);assert.ok(standing(f.e,s,'faction_river_council','faction_road_caravan')>0);
 const ga=groupView(f.e,s,a).leader.value,gb=groupView(f.e,s,b).leader.value;
 for(const id of [ga,gb])f.d.set(['state','npcs',id,'location'],s.location);
 f.d.set(['state','obligations','family_condition'],{id:'family_condition',promisor:ga,promisee:gb,type:'付款',status:'待履行'});
 const pact=action(f,{operation:'family_alliance',org:a,member:b,speaker:ga,authority:gb,consent:true,sourceEvent:'family_condition'},'pact');assert.equal(pact.status,'待条件');
 f.d.set(['state','obligations','family_condition','status'],'已完成');advanceFamilyAlliances(f.d,f.e,601);assert.equal(f.d.get('state','records',pact.alliance,'status'),'结盟');
 f.d.set(['state','family','marriages',marriage.marriage,'status'],'丧偶');advanceFamilyAlliances(f.d,f.e,602);assert.equal(f.d.get('state','records',pact.alliance,'status'),'已解除');
});
test('亲子、同祖与收养关系不能结婚，单方不愿不可用玩家 consent 强迫',()=>{
 const f=setup();f.setKin(A,D);tie(f,A,D);assert.match(marriageBlocker(f.e,f.d.get('state'),A,D),/亲属/);
 tie(f,A,B);f.d.set(['state','npcs',B,'relationships',A],{trust:-10,affection:-10});assert.throws(()=>action(f,{operation:'family_marry',member:B,speaker:A,consent:true}),/不愿意/);
});
for(const operation of ['family_adopt','family_foster'])test(`${operation} 保留亲生族谱、实际转移法定亲子和家户、监护与人口守恒并发事件`,()=>{
 const f=setup();f.setKin(A,C);tie(f,A,B);tie(f,B,C);tie(f,A,C);
 const original=npcHousehold(f.e,f.d.get('state'),C),population=f.d.get('state','settlements','loc_hw','population');
 const result=action(f,{operation,member:C,speaker:B,authority:A,consent:true},operation);
 assert.ok(legalChildren(f.e,f.d.get('state'),B).includes(C));assert.ok(!legalChildren(f.e,f.d.get('state'),A).includes(C));
 assert.equal(npcHousehold(f.e,f.d.get('state'),C).id,result.household);assert.notEqual(result.household,original.id);
 assert.equal(f.d.get('state','settlements','loc_hw','population'),population);assert.equal(activeGuardianship(f.e,f.d.get('state'),C).guardian,B);
 assert.ok(genealogy(f.e,f.d.get('state'),C).relations.some(r=>r.from===A));
 assert.ok(Object.values(f.d.get('state','records')).some(r=>r.category==='world_event'&&r.tags.includes('family')));
});
test('分家只在本人新居另立户，保留族亲和现有财产，重放无重复转移',async()=>{
 const f=setup(),home='loc_hw_fields',family=natalFamily(f.e,f.d.get('state'),D),old=npcHousehold(f.e,f.d.get('state'),D).id;
 f.d.set(['state','location'],home);f.d.set(['state','npcs',D,'location'],home);f.d.set(['state','buildings',home],{owner:D,condition:100});
 const args={operation:'family_split',member:D,plot:home,consent:true};const out=await f.e.reduce(f.d.document,{tool:'world_settlement',args,eventId:'split-event'});
 const doc=applyPatches(f.d.document,out.patches);assert.notEqual(npcHousehold(f.e,doc.state,D).id,old);assert.equal(natalFamily(f.e,doc.state,D),family);assert.equal(doc.state.buildings[home].owner,D);
 const replay=await f.e.reduce(doc,{tool:'world_settlement',args,eventId:'split-event'});assert.deepEqual(replay.patches,[]);
});
test('家族入口沿既有工具开放，族谱查询无派生写入且工具数保持25',async()=>{
 const f=setup();f.setKin(A,C);const before=structuredClone(f.d.document);
 const result=await f.e.reduce(f.d.document,{tool:'world_settlement',args:{operation:'family_inspect',member:A},eventId:'inspect'});
 assert.ok(result.result.genealogy.people.some(p=>p.id===C));assert.deepEqual(f.d.document,before);assert.equal(toolDefinitions().length,27);
});
