// 性能缓存不改结果：同一份状态上，走缓存的读取与不走缓存的读取，逐项完全相等；并且写入之后重读仍然相等。
// 缓存挂在读取器上：游标草稿（engine.primitiveDraft）按游标 revision 记忆；只读作用域内的读取器（withReadScope + documentReader）按状态对象记忆；
// 作用域之外的 documentReader 是正式代码里本来就有的“无 memo、非游标”读取器，budgetRead、shop 的 read/reach、marketSupply、foodHabit 现金都直接重算。
// 本测试用这个旁路作对照，没有为测试加任何生产开关。注意：旁路只绕开上述几处新缓存；stateMemo、recordsMemo 等旧缓存在旁路里仍可能生效，不在被测范围。
// 主观视图（view 非空）本来就不进缓存，不在本测试范围。
//
// 比较项（逐项 deepStrictEqual）：食物来源解析器原始输出、惯常性标注（rich 与每项 luxury，即 accessibleSources 的 deferred 依据）、
// householdResources 整份（含 market.purchases、nextFoodAt）、marketSupply（businessOwners 取 [] 与 [本聚落店主] 两种）。
// 三种读取：游标缓存；只读作用域；无缓存对照。
// 抽样：每个聚落最多 3 户（编号序，玩家所在聚落含 'player'），3 种食物。无缓存对照很贵（嵌套重算，随聚落人数平方增长），
// 所以无缓存对照只取每个聚落的前 CACHE_EQUIVALENCE_REF 户（默认 1）与 player，且只在居民数 ≤ CACHE_EQUIVALENCE_REF_MAX_RESIDENTS（默认 60）的聚落做：
// 本机实测一户无缓存读取，居民上百的大聚落约 360 秒，几十人的小聚落约 13 秒；大聚落与其余户只做“游标缓存 = 只读作用域”的交叉比较（仍覆盖写后重读）。
// 无缓存对照的 marketSupply 只取第一种食物，写后重读的对照只取买方一户；缓存侧仍读 3 种食物与全部抽样户。
// 默认 1 天：本机探针（三个重任务并行）实测 495 秒，2 天约 16 分钟会超出 15 分钟预算；夜间要更长用 CACHE_EQUIVALENCE_DAYS（每多一天约 +7 分钟）。
// 写后重读：在同一游标上先暖缓存，再用正式入口写一笔账本（moveCoins，购买付款同款）与一笔库存（ledger transfer：卖家行囊 → 买方行囊），
// 立刻在同一游标上重读，与“写后文档上的无缓存读取”比较；再在同一只读作用域里先读写前文档、再读写后文档（换 state 对象），与无缓存对照比较。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {documentReader,withReadScope} from '../server-plugin/read-scope.mjs';
import {householdResources,registerHouseholdFoodSources,registerHouseholdFoodHabit} from '../server-plugin/household-budget.mjs';
import {marketSupply} from '../server-plugin/market.mjs';
import {declareLedgerWriter,transfer} from '../server-plugin/ledger.mjs';
import {moveCoins,purse} from '../server-plugin/money.mjs';
import {bag} from '../server-plugin/stock.mjs';
import {placeSettlement} from '../server-plugin/entity-view.mjs';

const DAYS=Number(process.env.CACHE_EQUIVALENCE_DAYS??1),REF_MAX_RESIDENTS=Number(process.env.CACHE_EQUIVALENCE_REF_MAX_RESIDENTS??60),PER_SETTLEMENT=Number(process.env.CACHE_EQUIVALENCE_PER_SETTLEMENT??3),REF=Number(process.env.CACHE_EQUIVALENCE_REF??1),FOODS=Number(process.env.CACHE_EQUIVALENCE_FOODS??3);
const world=await loadWorld(),legacy=JSON.parse(await fs.readFile(new URL('fixtures/legacy/seed.json',import.meta.url),'utf8'));
declareLedgerWriter('cache-equivalence');

function setup(){
 const w=structuredClone(world),host='npc_hw_linsui',inn='bld_hw_qingdeng';
 for(const npc of w.npcs.filter(n=>n.id===host))npc.schedule={default:[{start:0,end:1440,location:inn,activity:'营业',services:['trade']}]};
 const engine=new WorldEngine(w),document=engine.createCharacter(legacy,{},'household-cache-equivalence');
 document.state.minute=600;document.state.location=inn;document.state.player.coins=2000;
 Object.assign(document.state.npcs[host],{location:inn,activity:'营业',status:'正常'});
 return {engine,document};
}
const alive=(state,m)=>state.npcs?.[m]?.location&&!['死亡','濒死','昏迷'].includes(state.npcs[m].status);
// 每个聚落最多 PER_SETTLEMENT 户（每户第一位在世成员，编号序）；玩家所在聚落并入 'player'。返回 [{owner,place,location}]。
function sample(engine,state){
 const byPlace=new Map();
 const add=(owner,location)=>{
  const place=placeSettlement(engine,state,location).value;if(!place)return;
  const rows=byPlace.get(place)??[];if(!rows.some(r=>r.owner===owner))rows.push({owner,place,location});byPlace.set(place,rows);
 };
 for(const h of [...engine.world.households].sort((a,b)=>a.id<b.id?-1:1)){const m=h.members.find(x=>alive(state,x));if(m)add(m,state.npcs[m].location);}
 add('player',state.location);
 const out=[];
 for(const [place,rows] of [...byPlace].sort((a,b)=>a[0]<b[0]?-1:1)){
  const player=rows.find(r=>r.owner==='player'),others=rows.filter(r=>r.owner!=='player').slice(0,PER_SETTLEMENT-(player?1:0));
  out.push(...(player?[player]:[]),...others);
 }
 return out;
}
const residentsAt=new Map();
function residents(state,place){const key=`${state.minute}|${place}`;if(!residentsAt.has(key))residentsAt.set(key,Object.values(state.npcs??{}).filter(n=>n.location&&placeSettlement(engineRef,state,n.location).value===place).length);return residentsAt.get(key);}
let engineRef=null;
const keeperOf=(engine,place)=>engine.rules.economy?.shops?.stores?.find(s=>s.settlement===place)?.keeper??null;
function readAll(d,engine,rows,foods){
 const out={};
 for(const {owner,place,location} of rows){
  const sources=registerHouseholdFoodSources.fn(d,engine,owner,{});
  const habit=registerHouseholdFoodHabit.fn(d,engine,owner,sources.filter(r=>r.unitPrice>0),{view:null});
  const keeper=keeperOf(engine,place),supply={};
  for(const f of foods){
   supply[`${f}|none`]=marketSupply(d,engine,f,location);
   if(keeper)supply[`${f}|${keeper}`]=marketSupply(d,engine,f,location,{businessOwners:[keeper]});
  }
  out[owner]={sources,habit,resources:householdResources(d,engine,owner),supply};
 }
 return out;
}
// 无缓存对照的 marketSupply 最贵（逐人嵌套重算），对照只取第一种食物（两种经营者选项都留）；缓存侧读 3 种食物，比较时按对照的食物收窄。
const pick=(all,rows,foods=null)=>Object.fromEntries(rows.map(r=>[r.owner,foods?{...all[r.owner],supply:Object.fromEntries(Object.entries(all[r.owner].supply).filter(([k])=>foods.includes(k.split('|')[0])))}:all[r.owner]]));
const plain=(document,engine,rows,foods)=>readAll(documentReader(document),engine,rows,foods.slice(0,1));
const scoped=(documents,engine,rows,foods)=>withReadScope(()=>documents.map(doc=>readAll(documentReader(doc),engine,rows,foods)).at(-1));

test('缓存读取与无缓存旁路逐项相等，且写入后重读仍相等（游标、只读作用域换状态对象）',async()=>{
 const {engine,document:start}=setup();engineRef=engine;const foods=engine.world.items.filter(i=>(i.nutrition?.satiety??0)>0).map(i=>i.id).slice(0,FOODS);
 let document=start,compared=0,sources=0,writes=0;
 for(let day=0;day<DAYS;day++){
  const output=await engine.reduce(document,{tool:'world_time',args:{minutes:1440},eventId:`cache_equivalence_day_${day}`});
  document=applyPatches(document,output.patches);
  const rows=sample(engine,document.state);
  // 1. 同一状态：游标缓存（首次、倒序再读一次走命中路径）与作用域缓存对全体一致；无缓存对照取 refRows：
  // 每个聚落优先取当天确有可买来源的 REF 户（由游标缓存读取先筛，只决定抽谁，比较仍以无缓存为准），加 player。
  const cursor=engine.primitiveDraft(structuredClone(document)),first=readAll(cursor,engine,rows,foods),again=readAll(cursor,engine,[...rows].reverse(),foods);
  const refRows=[...new Set(rows.map(r=>r.place))].flatMap(place=>{
   const here=rows.filter(r=>r.place===place&&r.owner!=='player'&&residents(document.state,place)<=REF_MAX_RESIDENTS),withSources=here.filter(r=>first[r.owner].sources.length);
   return [...withSources,...here.filter(r=>!withSources.includes(r))].slice(0,REF);
  }).concat(rows.filter(r=>r.owner==='player'&&residents(document.state,r.place)<=REF_MAX_RESIDENTS));
  for(const r of rows)r.ref=refRows.includes(r);
  const scopedAll=scoped([document],engine,rows,foods),reference=plain(document,engine,refRows,foods);
  assert.deepStrictEqual(again,first,`第 ${day+1} 天：游标缓存命中与首次读取不一致`);
  assert.deepStrictEqual(scopedAll,first,`第 ${day+1} 天：只读作用域与游标缓存不一致`);
  assert.deepStrictEqual(pick(first,refRows,foods.slice(0,1)),reference,`第 ${day+1} 天：缓存读取与无缓存对照不一致`);
  compared+=rows.length;for(const r of refRows)sources+=reference[r.owner].sources.length;
  // 2. 写后重读：同一游标上写一笔账本、一笔库存，立刻重读。买方取有可买来源的对照户（否则取第一户），卖家取本聚落店主。
  const sellable=refRows.filter(r=>keeperOf(engine,r.place)&&keeperOf(engine,r.place)!==r.owner),buyer=sellable.find(r=>reference[r.owner].sources.length)??sellable[0];
  if(!buyer)continue;
  const keeper=keeperOf(engine,buyer.place);
  const cash=cursor.get('ledger','accounts',purse(engine,buyer.owner))??0;
  if(cash>0){moveCoins(cursor,{from:purse(engine,buyer.owner),to:purse(engine,keeper),amount:1,writer:'cache-equivalence'});writes++;}
  const food=foods.find(f=>(cursor.get('ledger','accounts',bag(engine,keeper,f))??0)>=1);
  if(food){transfer(cursor,{from:bag(engine,keeper,food),to:bag(engine,buyer.owner,food),amount:1,writer:'cache-equivalence'});writes++;}
  const after=cursor.document,checkRows=[buyer];
  const reread=readAll(cursor,engine,rows,foods),afterReference=plain(after,engine,checkRows,foods);
  assert.deepStrictEqual(pick(reread,checkRows,foods.slice(0,1)),afterReference,`第 ${day+1} 天：写入后游标重读与无缓存对照不一致`);
  // 作用域：同一 withReadScope 里先读写前文档（未被游标改过的 document），再读写后文档（另一个 state 对象）。
  const rescoped=scoped([document,after],engine,rows,foods);
  assert.deepStrictEqual(rescoped,reread,`第 ${day+1} 天：作用域内换 state 对象后重读与游标重读不一致`);
  assert.deepStrictEqual(pick(rescoped,checkRows,foods.slice(0,1)),afterReference,`第 ${day+1} 天：作用域换状态后与无缓存对照不一致`);
 }
 assert.ok(compared>=DAYS,'比较了足够多的户日');
 assert.ok(sources>0,'比较里必须出现过可买来源，否则等于什么都没比');
 assert.ok(writes>0,'必须真的写过账本或库存，否则没有测到写后重读');
});
