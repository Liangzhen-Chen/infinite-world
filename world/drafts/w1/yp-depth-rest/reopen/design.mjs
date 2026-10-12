import fs from 'node:fs';
import assert from 'node:assert/strict';
import {patchRows as original,revision,incrementLimitYuan} from '../../../../design/w1-yp-depth-rest.mjs';
export {revision,incrementLimitYuan};
const changes=JSON.parse(fs.readFileSync(new URL('./patch-diff.json',import.meta.url),'utf8'));
export const patchRows=structuredClone(original);
for(const change of changes){
 const row=patchRows.find(row=>row.id===change.id),patch=row?.patches.find(patch=>patch.path===change.path);
 assert.ok(patch,'修订须属于原候选路径');
 assert.deepEqual(patch.value,change.before,'原候选叶已改变');
 patch.value=structuredClone(change.after);
}
