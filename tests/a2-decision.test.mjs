import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {subjectiveView,subjectiveFact} from '../server-plugin/subjective-view.mjs';
import {npcDecision,DECISION_ORDER,npcDecisionLibrary} from '../server-plugin/npc-decision.mjs';
import {standing} from '../server-plugin/standing.mjs';
const world=await loadWorld(),engine=new WorldEngine(world),npc='npc_hw_linsui';
const seed=JSON.parse(fs.readFileSync('tests/fixtures/legacy/seed.json','utf8'));
function fresh(){const d=engine.initialFromLegacy(seed,'a2');d.state.npcs[npc].goals={};return d;}
test('五步骨架与四种答复，explain 是确定性的库函数，不依赖 LLM',()=>{
 const v=subjectiveView(engine,fresh(),npc);assert.equal(npcDecisionLibrary.npcDecision,npcDecision);
 assert.equal(npcDecision(v,{kind:'greet'}).outcome,'agree');
 assert.equal(npcDecision(v,{kind:'public_key'}).outcome,'refuse');
 const key=npcDecision(v,{kind:'public_key'}),basis=key.explain().at(-1).basis;
 assert.equal(basis.publicKey,true);assert.match(basis.publicKeyRule,/有职权的管事/);
 assert.equal(key.outcome,'refuse');assert.match(key.reason,/公共仓库.*管事/);
 assert.equal(npcDecision(v,{kind:'help',cost:{minutes:9999}}).outcome,'conditional');
 const busy=structuredClone(v);busy.self.activity='睡眠';assert.equal(npcDecision(busy,{kind:'help'}).outcome,'defer');
 const a=npcDecision(v,{kind:'greet'}),b=npcDecision(v,{kind:'greet'});
 assert.deepEqual(a,b);assert.deepEqual(a.explain().map(r=>r.stage),DECISION_ORDER);
 const trace=a.explain();trace[0].basis.values.push('bad');assert.notDeepEqual(trace,a.explain());
});
test('禁区优先；关系、欠情、收益、急事、已知义务冲突均进入裁决',()=>{
 const v=subjectiveView(engine,fresh(),npc);v.self.redLines=[{action:'betray',reason:'不出卖家人'}];v.self.activity='睡眠';
 assert.equal(npcDecision(v,{kind:'betray'}).outcome,'refuse');
 v.self.activity='营业';v.self.relations.player={trust:0,favors:[]};
 assert.equal(npcDecision(v,{kind:'help',cost:{minutes:60}}).outcome,'conditional');
 v.self.relations.player.favors=[{status:'未还'}];assert.equal(npcDecision(v,{kind:'help',cost:{minutes:60}}).outcome,'agree');
 v.self.obligations=[{id:'booked',status:'进行中',start:v.minute,deadline:v.minute+30}];assert.equal(npcDecision(v,{kind:'help'}).outcome,'refuse');
 v.self.goals={short:[{content:'救助家人',urgency:10}]};assert.equal(npcDecision(v,{kind:'help'}).outcome,'defer');
});
test('I25 双世界：秘密会籍不泄漏视图、立场与决策；belief 可改变主观决策',()=>{
 const a=fresh(),b=structuredClone(a),other='npc_hw_ayan';
 a.state.npcs[other].location=b.state.npcs[other].location='bld_hw_mill';
 const secret='org_secret_a2';
 a.state.records[`organization:${secret}`]={category:'organization',id:secret,source:'created',name:'秘密会籍',kind:'结社',seat:'bld_hw_mill',members:{[other]:{position:'成员'}},treasury:0};
 b.state.records[`organization:${secret}`]={category:'organization',id:secret,source:'created',name:'秘密会籍',kind:'结社',seat:'bld_hw_mill',members:{},treasury:0};
 const contract={id:'remote',type:'付款',promisor:other,promisee:npc,content:'远方货款',deadline:9000,status:'待履行'};
 a.state.obligations.remote=contract;b.state.obligations.remote={...contract,status:'已完成'};
 b.state.records.secret={category:'organization',members:[other],secret:true};
 b.state.records.ship={category:'wreck',status:'沉没'};b.state.marketReports={far:{grain:999}};
 const av=subjectiveView(engine,a,npc),bv=subjectiveView(engine,b,npc);
 assert.deepEqual(av.self.relations[other],bv.self.relations[other]);
 assert.deepEqual(av.self.holdings,bv.self.holdings);assert.deepEqual(av.observable.people,bv.observable.people);
 assert.deepEqual(av.knowledge.facts,bv.knowledge.facts);
 assert.deepEqual(npcDecision(av,{kind:'help'}),npcDecision(bv,{kind:'help'}));
 assert.equal(standing(engine,a.state,npc,other),standing(engine,b.state,npc,other));
 const believed=structuredClone(bv);believed.knowledge.facts.secret_membership={value:true,kind:'belief',credence:0.8};
 const disbelieved=structuredClone(bv);disbelieved.knowledge.facts.secret_membership={value:false,kind:'belief',credence:0.8};
 const request={kind:'help',proposition:'secret_membership'};
 assert.notEqual(npcDecision(believed,request).outcome,npcDecision(disbelieved,request).outcome);
 assert.ok(!JSON.stringify(bv).includes('沉没'));assert.equal(bv.self.clauses[0].status,undefined);
});
test('知情和 belief 读版本；揭穿覆盖信念，分支读取不会污染另一分支',()=>{
 const a=fresh();a.state.npcs[npc].memoryStream=[{id:'belief',kind:'belief',proposition:'bank_safe',value:false,content:'钱庄要倒',minute:1,credence:0.8}];
 const b=structuredClone(a);b.state.npcs[npc].memoryStream.push({id:'reveal',kind:'reveal',proposition:'bank_safe',value:true,content:'亲自兑付',minute:2});
 const before=subjectiveView(engine,a,npc),after=subjectiveView(engine,b,npc);
 assert.equal(subjectiveFact(before,'bank_safe').value,false);assert.equal(subjectiveFact(after,'bank_safe').value,true);
 assert.equal(npcDecision(before,{kind:'bill',proposition:'bank_safe'}).outcome,'refuse');
 assert.equal(npcDecision(after,{kind:'bill',proposition:'bank_safe'}).outcome,'agree');
 assert.deepEqual(subjectiveView(engine,a,npc),before);
});
test('留存资产：花出去但仍归本人的现钱按净支出计，现金门槛仍按全额',()=>{
 const v=subjectiveView(engine,fresh(),npc),coins=v.self.coins,moneyCost=r=>npcDecision(v,{kind:'help',...r}).explain().find(s=>s.stage==='cost_benefit').basis.cost;
 const price=Math.max(2,Math.floor(coins/2)),retained=price-1;
 // 规则：cost 按 (coins-retained+value) 计，所以把 retained 全部归入 value 与把 coins 减去 retained 等价；
 assert.equal(moneyCost({cost:{coins:price,retained}}),moneyCost({cost:{coins:price-retained}}));
 assert.equal(moneyCost({cost:{coins:price,retained:0}}),moneyCost({cost:{coins:price}}));
 // 留存部分不会超过支出（不会变成负开销）。
 assert.equal(moneyCost({cost:{coins:price,retained:price*10}}),moneyCost({cost:{}}));
 // 同一笔支出：留存越多，开销越低，且不低于只付净额的开销。
 assert.ok(moneyCost({cost:{coins:price,retained}})<moneyCost({cost:{coins:price}}));
 // 现金门槛按全额：拿不出全额现钱，留存再多也不行。
 const broke=npcDecision(v,{kind:'help',cost:{coins:coins+1,retained:coins+1}});
 assert.equal(broke.outcome,'refuse');assert.match(broke.reason,/随身钱款/);
});
