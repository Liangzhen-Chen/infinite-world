// 修订的派生级联：修订某个已审事实后，按"同一条派生规则"重算所有依赖它的派生值，列为级联修订条目。
// 条目的 after 由规则直接算出，不手填。登记表 DERIVATIONS 每项给出：哪些正式行的哪个字段是规则派生的，以及怎样用规则从一个世界算出全部派生值。
// 新增派生规则时只往登记表加一项；级联判定本身（修订前后各算一遍、取差）对所有规则通用。
import assert from 'node:assert/strict';
import {hashContent} from './content-pipeline.mjs';
import {economyW3Journey} from '../world/design/economy-w3-journey.mjs';

const same=(a,b)=>hashContent(a??null)===hashContent(b??null);
const rowOf=(world,collection,id)=>world[collection].find(r=>r.id===id);

// derive(world) -> Map<行id, {value, trace}>；只含"被规则派生"的行（手定价的物品不在内）。
// 手定价骨架（economy-w3 / economy-w3-trades）只校验"售价不低于材料"，没有派生规则，不在此登记。
export const DERIVATIONS=[
 {name:'w3-journey 配方成品价（材料成本+工费）',rule:'world/design/economy-w3-journey.mjs: journeyPrice',collection:'items',file:'world/meta/items.json',path:['basePrice'],
  designSource:'world/drafts/w3/journey/bones.json',
  derive(world){
   const traces=new Map(),bones=economyW3Journey(world,(id,t)=>traces.set(id,t));
   return new Map(bones.items.filter(x=>traces.has(x.id)).map(x=>[x.id,{value:x.basePrice,trace:traces.get(x.id)}]));
  }},
];

// 把一批修订条目（{target,file,path,before,after}）按方向应用到世界副本上；path 目前只支持物品/配方/地点的顶层或嵌套键。
export function withRevisions(world,entries,direction,{getPath,setPath,rowOf:rowFor}){
 const w=structuredClone(world);
 for(const e of entries)setPath(rowFor(w,e.file,e.target),e.path,direction==='before'?e.before:e.after);
 return w;
}

// 级联条目：对每条派生规则，在"修订前世界"与"修订后世界"各算一遍，取值变了的行就是依赖该修订的派生值。
// world 是当前正式世界，revisions 是已发布或待发布的上游修订条目（两种状态都成立：before/after 两个方向都重设）。
// 当前正式值必须等于修订前的派生值（过期，要更新）或等于修订后的派生值（已级联，跳过）；两者都不是说明正式行被另外改过，报错。
export function cascadeEntries(world,revisions,helpers){
 const before=withRevisions(world,revisions,'before',helpers),after=withRevisions(world,revisions,'after',helpers),out=[];
 for(const d of DERIVATIONS){
  const was=d.derive(before),now=d.derive(after);
  for(const [id,{value,trace}] of now){
   const old=was.get(id);
   if(!old||same(old.value,value))continue;
   const row=rowOf(world,d.collection,id);assert.ok(row,`正式世界缺少派生行 ${id}`);
   const formal=helpers.getPath(row,d.path);
   if(same(formal,value))continue;
   assert.ok(same(formal,old.value),`${id}.${d.path.join('.')} 正式值 ${JSON.stringify(formal)} 既不是修订前派生值 ${JSON.stringify(old.value)} 也不是修订后派生值 ${JSON.stringify(value)}`);
   out.push({derivation:d,id,before:formal,after:value,trace,oldTrace:was.get(id).trace});
  }
 }
 return out;
}
