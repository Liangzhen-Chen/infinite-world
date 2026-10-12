import fs from 'node:fs';
import {patchRows as parentRows,revision,incrementLimitYuan} from '../design.mjs';
export {revision,incrementLimitYuan};
const background=JSON.parse(fs.readFileSync(new URL('./shared-repair-background.json',import.meta.url),'utf8'));
const event=background.events.find(e=>e.id==='memory_wt_depth_group_3');
export const patchRows=structuredClone(parentRows);
for(const id of event.actors)patchRows.find(r=>r.id===id).patches.find(p=>p.path==='memorySeeds[2]').value.event=event.narrative;
