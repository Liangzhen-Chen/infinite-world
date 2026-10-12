import fs from 'node:fs';
import * as prior from '../sourced/design.mjs';

// A separate, unreviewed view. Never rewrite the controlled candidate or records.
const changes=JSON.parse(fs.readFileSync(new URL('./patch-diff.json',import.meta.url),'utf8'));
export const revision=prior.revision;
export const incrementLimitYuan=prior.incrementLimitYuan;
export const authorBatches=prior.authorBatches.map(batch=>{
 const event=changes.find(c=>batch.ids.includes(c.id)&&c.path.startsWith('memorySeeds['));
 return {...structuredClone(batch),...(event?{event:event.after.event}:{})};
});
export const patchRows=prior.patchRows.map(row=>({...structuredClone(row),patches:row.patches.map(patch=>{
 const change=changes.find(c=>c.id===row.id&&c.path===patch.path);
 return {path:patch.path,value:structuredClone(change?change.after:patch.value)};
})}));
