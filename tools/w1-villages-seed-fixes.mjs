// Run only after the active draft process has finished. Resume rechecks only
// entries whose own skeleton or referenced household facts changed.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {w1VillagesFoundation} from '../world/design/w1-villages.mjs';
import {hashContent} from './content-pipeline.mjs';
const root='world/drafts/w1/villages',file=`${root}/foundation.json`,old=JSON.parse(await fs.readFile(file,'utf8')),fresh=w1VillagesFoundation();
const fixes=[{id:'npc_yp_taoxun',from:43,to:49,reason:'陶珣是46岁陶咨的姐姐，原43岁与长幼矛盾。'},{id:'npc_lq_xulu',from:27,to:31,reason:'胥璐是29岁胥珑的姐姐，原27岁与长幼矛盾。'}];
for(const fix of fixes){const row=old.residents.find(p=>p.id===fix.id);assert.ok([fix.from,fix.to].includes(row.age));row.age=fix.to;}
assert.equal(hashContent(old),hashContent(fresh),'存在两项已审定年龄之外的骨架变更');
await fs.writeFile(file,JSON.stringify(fresh,null,2)+'\n');await fs.writeFile(`${root}/seed-corrections.json`,JSON.stringify({fixes,resume:'node tools/w1-villages.mjs',scope:'只对本条及引用了变化年龄的家庭上下文重新起草审核；其余通过条目跳过'},null,2)+'\n');console.log('两处兄姐年龄骨架已定点修正，须续跑复审引用家庭。');
