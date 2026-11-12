import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {digest} from '../server-plugin/storage.mjs';
import {loadDigestExclude,validateDigestExclude,excludeFromDigest,ruleStateDigest} from '../server-plugin/digest-exclude.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';

const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const table=loadDigestExclude();
const clone=value=>structuredClone(value);

test('排除口径表：加载校验通过；每条有层、前缀、键与数据出处；坏表被拒绝',()=>{
 assert.ok(table.rules.length>0);
 assert.deepEqual([...new Set(table.rules.map(r=>r.layer))].sort(),Object.keys(table.layers).sort());
 const broken=mutate=>{const t=clone(table);mutate(t);return t;};
 assert.throws(()=>validateDigestExclude(broken(t=>{delete t.rules[0].source;})),/E-DIGEST-EXCLUDE.*source/);
 assert.throws(()=>validateDigestExclude(broken(t=>{t.rules[0].layer='nope';})),/E-DIGEST-EXCLUDE.*layer/);
 assert.throws(()=>validateDigestExclude(broken(t=>{t.rules[0].prefix=[];})),/E-DIGEST-EXCLUDE.*prefix/);
 assert.throws(()=>validateDigestExclude(broken(t=>{t.rules[0].keys=[];})),/E-DIGEST-EXCLUDE.*keys/);
 assert.throws(()=>validateDigestExclude(broken(t=>{t.rules.push(clone(t.rules[0]));})),/E-DIGEST-EXCLUDE.*重复/);
 assert.throws(()=>validateDigestExclude({version:2,layers:{},rules:[]}),/E-DIGEST-EXCLUDE/);
});

test('只删限定路径下的字符串值：对象、数组、数字同名键与路径外同名键一律保留',()=>{
 const document={state:{
  created:{p1:{id:'p1',name:'甲',background:'旧背景',currentConcern:{text:'对象值保留'},visibleFeature:['数组值保留'],notes:7,personality:{background:'深层同名字符串不被删'}}},
  npcs:{n1:{name:'乙',background:'路径外的字符串保留',coins:3}},
  population:{s1:{profiles:{p1:{status:'full',profileHash:'abc',generator:{model:'m1',calls:2}}}}}
 }};
 const out=excludeFromDigest(document,{table,layers:['narration']});
 assert.deepEqual(out.state.created.p1,{id:'p1',name:'甲',currentConcern:{text:'对象值保留'},visibleFeature:['数组值保留'],notes:7,personality:{background:'深层同名字符串不被删'}});
 assert.equal(out.state.npcs.n1.background,'路径外的字符串保留');assert.equal(out.state.npcs.n1.name,'乙');
 assert.deepEqual(out.state.population.s1.profiles.p1,{status:'full',generator:{calls:2}});
 assert.equal(document.state.created.p1.background,'旧背景');
 const named=excludeFromDigest(document,{table,layers:['names']});
 assert.equal(named.state.created.p1.name,undefined);assert.equal(named.state.npcs.n1.name,undefined);assert.equal(named.state.created.p1.background,'旧背景');
});

async function realDocument(){
 const engine=new WorldEngine(await loadWorld()),document=engine.initialFromLegacy(seed,'ai18-digest');
 return document;
}

test('反向对照：改持有数量，规则状态哈希必变；改显示名与叙述文字、换生成模型，哈希不变；完整性 digest 仍随名字变',async()=>{
 const document=await realDocument(),npc=Object.keys(document.state.npcs)[0];
 assert.equal(typeof document.state.player.coins,'number');assert.equal(typeof document.state.player.name,'string');
 document.state.npcs[npc].name='乙';
 // 一个已展开的居民：叙述字段与生成器标识在表内路径上。
 document.state.created={p1:{id:'p1',name:'甲',background:'旧背景',currentConcern:'旧担忧',goals:['做稳']}};
 document.state.population={s1:{profiles:{p1:{status:'full',profileHash:'h1',generator:{model:'m1',calls:2}}}}};
 const base=ruleStateDigest(document);

 const quantity=clone(document);quantity.state.player.coins+=1;
 assert.notEqual(ruleStateDigest(quantity),base);
 const holding=clone(document);holding.state.created.p1.goals=['做不稳'];
 assert.notEqual(ruleStateDigest(holding),base,'数组值不是字符串，不被删，改动必须反映');
 const player=clone(document);player.state.player.name='别名旅人';
 assert.equal(ruleStateDigest(player),base,'玩家显示名在 names 层');

 const renamed=clone(document);renamed.state.npcs[npc].name='新名字';renamed.state.created.p1.name='新甲';
 assert.equal(ruleStateDigest(renamed),base);
 assert.notEqual(ruleStateDigest(renamed,{layers:['narration']}),base,'只启用叙述层时，改名必须被看见');
 assert.notEqual(digest(renamed),digest(document),'storage.mjs digest 是完整性校验，含名字，算法未改');

 const prose=clone(document);prose.state.created.p1.background='全新的背景文字';prose.state.created.p1.currentConcern='新担忧';
 prose.state.population.s1.profiles.p1.profileHash='h2';prose.state.population.s1.profiles.p1.generator.model='m2';
 assert.equal(ruleStateDigest(prose),base);
 assert.notEqual(ruleStateDigest(prose,{layers:['names']}),ruleStateDigest(document,{layers:['names']}),'只启用名字层时，叙述文字改动必须被看见');
 const calls=clone(document);calls.state.population.s1.profiles.p1.generator.calls=3;
 assert.notEqual(ruleStateDigest(calls),base,'调用次数是数字，不在排除之列');
});
