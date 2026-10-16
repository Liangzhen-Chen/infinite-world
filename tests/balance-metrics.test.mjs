// S1 指标库骨架：纯统计函数、各指标在手造存档上的取值、登记表与目标表的对应、真实世界冒烟。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {withLedger} from '../server-plugin/ledger.mjs';
import {legacyMoney} from '../server-plugin/money.mjs';
import {METRICS,METRICS_FORMAT,computeMetrics,withCombat,gini,lorenz,topShare,median,inflationRate,tierOf,metricIds} from '../tools/balance-metrics.mjs';
import {balanceReport} from '../tools/balance-combat.mjs';
import {loadBalanceTablesSync} from '../tools/balance-tables.mjs';

const tables=loadBalanceTablesSync().tables;
const deepFreeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(deepFreeze);Object.freeze(v);}return v;};
const metric=(doc,world,id,extra={})=>computeMetrics(doc,{world,tables,only:[id],...extra}).metrics[id];

test('统计函数：基尼、洛伦兹、前段份额、中位数、通胀率、技能阶',()=>{
 assert.equal(gini([5,5,5,5]),0);
 assert.ok(Math.abs(gini([0,0,0,10])-0.75)<1e-12,'一人占有全部：(n−1)/n');
 assert.ok(Math.abs(gini([1,2,3,4])-0.25)<1e-12);
 assert.equal(gini([]),null);assert.equal(gini([0,0]),null);
 assert.deepEqual(lorenz([1,1,1,1],2),[[0.5,0.5],[1,1]]);
 assert.equal(topShare([1,1,1,97],0.25),0.97);
 assert.equal(median([3,1,2]),2);assert.equal(median([1,2,3,4]),2.5);assert.equal(median([]),null);
 assert.equal(inflationRate([{day:0,index:1},{day:360,index:Math.E}]),1);
 assert.equal(inflationRate([{day:0,index:1}]),null);
 assert.equal(inflationRate([{day:0,index:1},{day:360,index:1}]),0);
 assert.deepEqual([0,299,300,2699,2700,5000].map(tierOf),[0,0,1,8,8,8]);
});

test('货币总量与源汇分项：按用途汇总，逐资源守恒；没有账本的存档报“不可用”而不是 0',()=>{
 const doc={state:{minute:2880},ledger:{version:1,accounts:{'player|coin_river|purse':70,'npc_a|coin_river|purse':30,'bld_x|coin_river|treasury':50,'npc_a|pack:gem|purse':3},
  flows:{'src:genesis|coin_river|opening':160,'sink:consume|coin_river|meal':10,'src:genesis|pack:gem|opening':3}}};
 const m=metric(doc,null,'money.total').value;
 assert.equal(m.total,150);assert.deepEqual(m.byPurpose,{purse:100,treasury:50});assert.equal(m.conserved,true);
 assert.equal(m.byResource['pack:gem'].accounts,3);assert.equal(m.byResource.coin_river.accountCount,3);
 const f=metric(doc,null,'money.flows').value;
 assert.equal(f.coinSources,160);assert.equal(f.coinSinks,10);assert.equal(f.rows.length,3);
 doc.ledger.accounts['npc_a|coin_river|purse']=31;
 assert.equal(metric(doc,null,'money.total').value.conserved,false,'账户 ≠ 源 − 汇 时报不守恒');
 const none=metric({state:{minute:0}},null,'money.total');
 assert.equal(none.status,'unavailable');assert.match(none.reason,/没有账本/);
});

test('价格指数：区域报价 ÷ 基准价的均值、中位数、按商品',()=>{
 const records={'quote:a':{category:'regional_quote',item:'item_bread',price:3,basePrice:2},'quote:b':{category:'regional_quote',item:'item_bread',price:2,basePrice:2},
  'quote:c':{category:'regional_quote',item:'item_iron',price:6,basePrice:12},'other':{category:'x'}};
 const v=metric({state:{records}},null,'price.index').value;
 assert.equal(v.n,3);assert.equal(v.mean,1);assert.equal(v.median,1);assert.equal(v.byItem.item_bread.mean,1.25);assert.equal(v.min,0.5);
 assert.equal(metric({state:{records:{}}},null,'price.index').status,'unavailable');
});

test('家户钱袋基尼：家户 + 无户籍单人；不含玩家；前 1% 与洛伦兹',()=>{
 const world={npcs:[{id:'a',coins:777},{id:'b'},{id:'c'},{id:'d'},{id:'e',coins:40}],households:[{id:'h1',members:['a','b']}]};
 const doc={state:{minute:0,npcs:{a:{},b:{},c:{},d:{}}},ledger:{version:1,flows:{},accounts:{'a|coin_river|purse':10,'b|coin_river|purse':10,'c|coin_river|purse':0,'d|coin_river|purse':20,'player|coin_river|purse':999}}};
 const v=metric(doc,world,'wealth.gini').value;
 assert.equal(v.households,1);assert.equal(v.singles,3);assert.equal(v.unitCount,4);
 assert.ok(Math.abs(v.gini-gini([20,0,20,40]))<1e-6,'a 动过钱款取账本（10），不取世界数据的 777；e 没动过取世界数据 40');assert.equal(v.playerPurse,999);
 assert.equal(metric(doc,null,'wealth.gini').status,'unavailable');
});

test('技能阶分布、名额计数（读 learning.json 的 seats.*）、等级分布',()=>{
 const world={npcs:[
  {id:'n1',level:12,proficiencies:{s_a:50,s_b:150}},
  {id:'n2',level:35,proficiencies:{s_a:350,s_b:2450},skills:[]},
  {id:'n3',level:200,proficiencies:{s_b:2450,s_a:2150}},
  {id:'n4',level:200,proficiencies:{s_a:2150}},
  {id:'n5',level:200,proficiencies:{s_a:2150}},
  {id:'n6',level:181,proficiencies:{s_a:2150}},
 ]};
 // 存档里的成长优先于世界数据
 const doc={state:{minute:0,npcs:{n1:{skills:{s_a:{proficiency:400}}}}}};
 const t=metric(doc,world,'skill.tierDistribution').value;
 assert.equal(t.practitioners,9,'熟练度 < 100 的不算从业者（n1 的 s_a 被存档成长改为 400）');
 assert.deepEqual(t.counts,[1,2,0,0,0,0,0,4,2]);
 assert.deepEqual(t.bySkill.s_b,[1,0,0,0,0,0,0,0,2]);
 const s=metric(doc,world,'seats.holders').value;
 assert.deepEqual(s.cap,{saintPerSkill:2,divinePerSkill:1,level180:3});
 assert.deepEqual(s.holders.s_a,{saint:4,divine:0});assert.deepEqual(s.holders.s_b,{saint:0,divine:2});
 assert.equal(s.level180,4);
 assert.deepEqual(s.violations.map(v=>`${v.kind}:${v.skill??''}:${v.holders}`).sort(),['divine:s_b:2','level180::4','saint:s_a:4']);
 const clean=metric({state:{minute:0}},{npcs:[{id:'x',level:1,proficiencies:{s:150}}]},'seats.holders').value;
 assert.deepEqual(clean.violations,[]);
 const l=metric(doc,world,'level.distribution').value;
 assert.equal(l.population,6);assert.equal(l.atLeast['>=10'].count,6);assert.equal(l.atLeast['>=180'].count,4);assert.equal(l.atLeast['>=60'].share,0.666667);
});

test('物种存量：各栖地存量之和与 N ÷ K；灭绝列表',()=>{
 const records={'ecology:h1':{populations:{deer:{count:10},wolf:{count:0}}},'ecology:h2':{populations:{deer:{count:6}}},'quote:x':{populations:{deer:{count:999}}}};
 const world={monsters:[{id:'deer',wildlife:{capacity:20}},{id:'wolf',wildlife:{capacity:4}}]};
 const v=metric({state:{records}},world,'species.stock').value;
 assert.equal(v.species.deer.count,16);assert.equal(v.species.deer.habitats,2);assert.equal(v.species.deer.stockRatio,0.4);
 assert.deepEqual(v.extinct,['wolf']);assert.equal(v.total,16);
 assert.equal(metric({state:{records:{}}},world,'species.stock').status,'unavailable');
});

test('登记表：编号唯一，todo 写明缺什么，每个对应目标都在目标表里；纯函数不改输入、同输入同输出',()=>{
 const ids=metricIds();assert.equal(new Set(ids).size,ids.length);
 const targetIds=new Set(tables.targets.rows.map(r=>r.metric));
 for(const m of METRICS){
  assert.ok(['implemented','partial','registered','todo'].includes(m.status));
  assert.ok(m.targets.length&&m.targets.every(t=>targetIds.has(t)),`${m.id} 对应的目标都在 targets.json：${m.targets.filter(t=>!targetIds.has(t))}`);
  if(m.status==='todo'){assert.ok(m.needs?.length,`${m.id} 要写明缺什么`);assert.equal(m.compute,undefined);}
  if(m.status==='partial')assert.ok(m.needs?.length,`${m.id} 要写明哪部分未做`);
  if(m.status==='implemented'||m.status==='partial')assert.equal(typeof m.compute,'function');
 }
 assert.ok(METRICS.filter(m=>m.status==='implemented').length>=4);
 assert.ok(METRICS.filter(m=>m.status==='todo').length>=5);
 const doc=deepFreeze({state:{minute:1440,records:{},npcs:{}},ledger:{version:1,accounts:{'p|coin_river|purse':5},flows:{'src:genesis|coin_river|opening':5}}});
 const world=deepFreeze({npcs:[{id:'p',level:3,proficiencies:{s:120}}],households:[]});
 const a=computeMetrics(doc,{world,tables}),b=computeMetrics(doc,{world,tables});
 assert.equal(JSON.stringify(a),JSON.stringify(b));
 assert.equal(a.format,METRICS_FORMAT);assert.equal(a.day,1);assert.match(a.parameterHash,/^[0-9a-f]{64}$/);
 assert.deepEqual(Object.keys(a.metrics),ids);
 assert.equal(a.metrics['money.velocity'].status,'todo');
});

test('战斗胜率：登记 tools/balance-combat.mjs 的位置，--combat 才调用，行为不变',async()=>{
 const world=await loadWorld();
 const slot=computeMetrics({state:{minute:0}},{world,only:['combat.winRate']}).metrics['combat.winRate'];
 assert.equal(slot.status,'registered');assert.deepEqual(slot.provider,{module:'tools/balance-combat.mjs',export:'balanceReport'});assert.equal(slot.value,undefined,'默认不跑战斗模拟');
 assert.ok(fs.existsSync(new URL('../tools/balance-combat.mjs',import.meta.url)));
 const result=computeMetrics({state:{minute:0}},{world,only:['combat.winRate'],combat:true});
 await withCombat(result,world,{trials:300});
 const direct=balanceReport(world.rules,{trials:300});
 assert.deepEqual(result.metrics['combat.winRate'].value.rows.map(r=>[r.id,r.winRate]),direct.results.map(r=>[r.id,r.winRate]));
 assert.equal(result.metrics['combat.winRate'].value.rows.length,6);
});

test('真实世界冒烟：开账后货币总量等于旧字段余额之和，各指标不抛错',async()=>{
 const world=await loadWorld(),seed=JSON.parse(fs.readFileSync(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
 const engine=new WorldEngine(world);
 const {document}=withLedger(engine,structuredClone(seed));
 assert.ok(document.ledger);
 const r=computeMetrics(document,{world});
 const legacy=[...legacyMoney(engine,document.state).values()].reduce((a,b)=>a+b,0);
 assert.equal(r.metrics['money.total'].value.total,legacy);
 assert.equal(r.metrics['money.total'].value.conserved,true);
 assert.ok(r.metrics['wealth.gini'].value.gini>0&&r.metrics['wealth.gini'].value.gini<1);
 assert.ok(r.metrics['skill.tierDistribution'].value.practitioners>100);
 assert.deepEqual(r.metrics['seats.holders'].value.violations,[],'现有人物没有圣级、神级，也没有 180 级以上');
 assert.equal(r.metrics['level.distribution'].value.population,world.npcs.length);
 assert.match(r.parameterHash,/^[0-9a-f]{64}$/,'world.balance 随世界进入参数哈希');
});

test('命令行：--list 列登记表；读存档文档输出 JSON',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'metrics-'));
 try{
  const list=JSON.parse(execFileSync(process.execPath,['tools/balance-metrics.mjs','--list'],{encoding:'utf8'}));
  assert.equal(list.length,METRICS.length);
  const file=path.join(dir,'save.json');
  fs.writeFileSync(file,JSON.stringify({document:{state:{minute:0},ledger:{version:1,accounts:{'p|coin_river|purse':9},flows:{'src:genesis|coin_river|opening':9}}}}));
  const out=JSON.parse(execFileSync(process.execPath,['tools/balance-metrics.mjs',file,'--only','money.total,skill.tierDistribution'],{encoding:'utf8'}));
  assert.deepEqual(Object.keys(out.metrics),['money.total','skill.tierDistribution']);
  assert.equal(out.metrics['money.total'].value.total,9);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
