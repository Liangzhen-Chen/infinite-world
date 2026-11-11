// 确定性探针：列出有 drinkable 标签的物品的含水率来源、重量、派生前后水分。
import {loadRuntimeWorld}from'./load-world.mjs';
import {materialProps}from'../server-plugin/item-class.mjs';
const w=await loadRuntimeWorld();const byId=new Map(w.items.map(i=>[i.id,i]));
console.log('classes',Object.keys(w.materialProps?.classes??{}).join(','));
for(const i of w.items)if((i.tags??[]).includes('drinkable')){const m=materialProps({world:w,byId},i.id);
 console.log([i.id,'w='+i.weight,'moist='+JSON.stringify(m.moisture),'nutrition='+JSON.stringify(i.nutrition),'content='+JSON.stringify(i.nutrientContent),'props='+JSON.stringify(i.props)].join('\t'));}
