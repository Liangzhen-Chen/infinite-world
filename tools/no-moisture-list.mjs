// 列出没有含水率数据的食物（其水分按规则保持 0，不为它们新造数据）。只读：node tools/no-moisture-list.mjs > F:/dnd-tmp/water/no-moisture-list.md
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {isItemClass,materialProps} from '../server-plugin/item-class.mjs';
const engine=new WorldEngine(structuredClone(await loadWorld()));
const rows=engine.world.items.filter(i=>isItemClass(engine,i.id,'food')&&!materialProps(engine,i.id).moisture.known).map(i=>i.id).sort();
console.log(`# 无含水率数据的食物（水分保持 0）\n\n共 ${rows.length} 条\n\n${rows.map(r=>`- ${r}`).join('\n')}`);
