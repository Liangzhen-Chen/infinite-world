// 列出既没有自身含水率数据、也没有配方可派生含水量的食物（其水分按规则为 0，不为它们新造数据）。只读：node tools/no-moisture-list.mjs > F:/dnd-tmp/water/no-moisture-list.md
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {isItemClass,materialProps} from '../server-plugin/item-class.mjs';
const engine=new WorldEngine(structuredClone(await loadWorld()));
const producers=new Map();
for(const r of engine.world.recipes??[])if(r.output?.item&&r.output.quantity>0)producers.set(r.output.item,[...producers.get(r.output.item)??[],r]);
const known=(id,seen=new Set())=>{
  if(seen.has(id))return false;
  const rs=producers.get(id)??[];
  if(rs.length)return rs.some(r=>r.materials.some(m=>isItemClass(engine,m.item,'food')&&known(m.item,new Set([...seen,id]))));
  return materialProps(engine,id).moisture.known;
};
const rows=engine.world.items.filter(i=>isItemClass(engine,i.id,'food')&&!known(i.id)).map(i=>i.id).sort();
console.log(`# 既无自身含水率、也无配方可派生的食物（水分为 0）\n\n共 ${rows.length} 条\n\n${rows.map(r=>`- ${r}`).join('\n')}`);
