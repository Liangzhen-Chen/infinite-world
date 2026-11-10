// 确定性探针：列出派生后 hydration>0 的物品（id、satiety、hydration、标签）。
import {loadRuntimeWorld}from'./load-world.mjs';
const w=await loadRuntimeWorld();
for(const i of w.items){const n=i.nutrition??{};if((n.hydration??0)>0)console.log([i.id,i.name,'sat='+(n.satiety??0),'hyd='+n.hydration,(i.tags??[]).join('|'),(i.use??'').slice(0,50)].join('\t'));}
