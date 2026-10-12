import fs from 'node:fs';
import * as original from './w1-existing-depth.mjs';

export const revision='w1-existing-depth-first-review-v1';
// The directory change does not create a new card or an additional allowance.
export const incrementLimitYuan=original.incrementLimitYuan;
export const base=original.base;
export const scopeAudit=original.scopeAudit;
export const authorBatches=original.authorBatches;
export const authoredBackground=JSON.parse(fs.readFileSync(new URL('../drafts/w1/existing-depth/first-review/authored-background.json',import.meta.url),'utf8'));
export const patchRows=original.patchRows.map(row=>{
 const event=authoredBackground.events.find(e=>e.actors.includes(row.id));
 if(!event)return structuredClone(row);
 const association=event.associations.find(a=>a.id===row.id);
 return{...structuredClone(row),patches:row.patches.map(patch=>patch.path===association.path?{
  path:patch.path,value:{...structuredClone(patch.value),event:association.narrative,location:event.location},
 }:structuredClone(patch))};
});
