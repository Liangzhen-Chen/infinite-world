// 性能缓存不改结果：同一份状态上，走缓存的读取与不走缓存的读取，逐项完全相等。
// 缓存挂在读取器上：游标草稿（engine.primitiveDraft）按游标 revision 记忆；只读作用域内的读取器（withReadScope + documentReader）按状态对象记忆；
// 作用域之外的 documentReader 是正式代码里本来就有的“无 memo、非游标”读取器，所有记忆函数（budgetRead、shop 的 read/reach、marketSupply）都直接重算。
// 本测试用这个旁路作对照，没有为测试加任何开关。
// 比较项：每户（抽样）每天的可买来源（食物来源解析器原始输出 + 惯常性标注的 rich/luxury，即 accessibleSources 的 deferred 依据）、
// householdResources 整份（含 market.purchases、nextFoodAt）、对若干食物的 marketSupply。
// 三种读取：游标（先暖缓存，并刻意换调用顺序）、只读作用域、无缓存。三者必须深度相等。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {documentReader,withReadScope} from '../server-plugin/read-scope.mjs';
import {householdResources,registerHouseholdFoodSources,registerHouseholdFoodHabit} from '../server-plugin/household-budget.mjs';
import {marketSupply} from '../server-plugin/market.mjs';

const DAYS=Number(process.env.CACHE_EQUIVALENCE_DAYS??2),OWNERS=Number(process.env.CACHE_EQUIVALENCE_OWNERS??1);
const world=await loadWorld(),legacy=JSON.parse(await fs.readFile(new URL('fixtures/legacy/seed.json',import.meta.url),'utf8'));

function setup(){
 const w=structuredClone(world),host='npc_hw_linsui',inn='bld_hw_qingdeng';
 for(const npc of w.npcs.filter(n=>n.id===host))npc.schedule={default:[{start:0,end:1440,location:inn,activity:'营业',services:['trade']}]};
 const engine=new WorldEngine(w),document=engine.createCharacter(legacy,{},'household-cache-equivalence');
 document.state.minute=600;document.state.location=inn;document.state.player.coins=2000;
 Object.assign(document.state.npcs[host],{location:inn,activity:'营业',status:'正常'});
 return {engine,document,inn};
}
// 抽样：每户第一位在世成员，按编号排序；优先取当天确有可买来源的户（用缓存读取器先筛，只决定抽谁，比较仍以无缓存读取为准），不足再按编号补齐。
function sampleOwners(engine,document){
 const state=document.state,ids=engine.world.households.map(h=>h.members.find(m=>state.npcs?.[m]?.location&&!['死亡','濒死','昏迷'].includes(state.npcs[m].status))).filter(Boolean).sort();
 const cursor=engine.primitiveDraft(structuredClone(document)),withSources=ids.filter(id=>registerHouseholdFoodSources.fn(cursor,engine,id,{}).length>0);
 return [...withSources,...ids.filter(id=>!withSources.includes(id))].slice(0,OWNERS);
}
function readAll(d,engine,owners,inn,foods,reverse){
 const out={};
 for(const owner of reverse?[...owners].reverse():owners){
  const sources=registerHouseholdFoodSources.fn(d,engine,owner,{});
  const habit=registerHouseholdFoodHabit.fn(d,engine,owner,sources.filter(r=>r.unitPrice>0),{view:null});
  out[owner]={sources,habit,resources:householdResources(d,engine,owner),supply:Object.fromEntries(foods.map(f=>[f,marketSupply(d,engine,f,inn)]))};
 }
 return out;
}
test('缓存读取与旁路（无记忆读取器）读取逐项相等：可买来源、惯常性、家户资源、市场供给',async()=>{
 const {engine,document:start,inn}=setup(),foods=engine.world.items.filter(i=>(i.nutrition?.satiety??0)>0).map(i=>i.id).slice(0,1);
 let document=start,compared=0,sources=0;
 for(let day=0;day<DAYS;day++){
  const output=await engine.reduce(document,{tool:'world_time',args:{minutes:1440},eventId:`cache_equivalence_day_${day}`});
  document=applyPatches(document,output.patches);
  const owners=sampleOwners(engine,document);
  const plain=readAll(documentReader(document),engine,owners,inn,foods,false);
  const scoped=withReadScope(()=>readAll(documentReader(document),engine,owners,inn,foods,true));
  const cursor=engine.primitiveDraft(structuredClone(document)),cached=readAll(cursor,engine,owners,inn,foods,day%2===1);
  assert.deepStrictEqual(scoped,plain,`第 ${day+1} 天：只读作用域读取与无缓存读取不一致`);
  assert.deepStrictEqual(cached,plain,`第 ${day+1} 天：游标缓存读取与无缓存读取不一致`);
  compared+=owners.length;for(const o of owners)sources+=plain[o].sources.length;
 }
 assert.ok(compared>=DAYS,'比较了足够多的户日');
 assert.ok(sources>0,'比较里必须出现过可买来源，否则等于什么都没比');
});
