// 夹具前提：让某件食物在引擎里的最终饱腹恰为 target（手算锚点用）。
// 手写 satiety 是“按热量的基值”，加载时还要乘生产的饱腹系数（server-plugin/item-class.mjs satietyFactor），
// 所以这里用生产的系数函数反解基值：floor(基值 × 系数(基值)) === target。基值×系数随基值单调增，二分即可；不改物品克数，也不绕过系数。
import {satietyFactor} from '../../server-plugin/item-class.mjs';
export function pinSatiety(world,itemId,target){
 const item=world.items.find(i=>i.id===itemId);if(!item)throw Error(`pinSatiety：没有物品 ${itemId}`);
 const g=b=>b*satietyFactor(world,item,b);
 let lo=0,hi=target*10+10;
 for(let i=0;i<200;i++){const mid=(lo+hi)/2;if(g(mid)<target+0.5)lo=mid;else hi=mid;}
 const base=(lo+hi)/2;
 if(Math.floor(g(base))!==target)throw Error(`pinSatiety：${itemId} 无法反解到 ${target}`);
 item.nutrition={...(item.nutrition??{}),satiety:base};
 return base;
}
