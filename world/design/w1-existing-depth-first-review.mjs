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
 const patches=row.patches.map(patch=>patch.path===association.path?{
  path:patch.path,value:{...structuredClone(patch.value),event:association.narrative,location:event.location},
 }:structuredClone(patch));
 // PLAN T10 authorizes only this real L2 hard. Paid candidate/records stay frozen;
 // the controlled revision must bind its original record and authorization hash.
 if(row.id==='npc_hw_luqing'){
  const step=patches.find(p=>p.path==='goals.long[0].steps[1].content');
  if(!step.value.includes('白蕙等学者'))throw Error('陆青原失效措辞已变，先核对原record');
  step.value=step.value.replace('白蕙等学者','白蕙等学员');
 }
 return{...structuredClone(row),patches};
});
