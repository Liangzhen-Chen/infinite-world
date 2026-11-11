// 列出既没有自身含水率、也无法由选中配方派生含水量的食物（其水分按规则为 0，不为它们新造数据）。只读：node tools/no-moisture-list.mjs > F:/dnd-tmp/water/no-moisture-list.md
// 直接读引擎派生记下的 nutrientBase.waterKnown（与实现同口径：有配方以选中配方为准）。
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {isItemClass} from '../server-plugin/item-class.mjs';
const engine=new WorldEngine(structuredClone(await loadWorld()));
const rows=engine.world.items.filter(i=>isItemClass(engine,i.id,'food')&&i.nutrientBase&&!i.nutrientBase.waterKnown).map(i=>i.id).sort();
console.log(`# 既无自身含水率、也无法由选中配方派生含水量的食物（水分为 0）\n\n共 ${rows.length} 条\n\n${rows.map(r=>`- ${r}`).join('\n')}`);
