import fs from 'node:fs';
const read=file=>JSON.parse(fs.readFileSync(new URL(file,import.meta.url),'utf8'));
const foundation=read('../sourced/foundation.json'),basis=read('./basis-rows.json');
const changes=JSON.parse(fs.readFileSync(new URL('./patch-diff.json',import.meta.url),'utf8'));
export const revision=foundation.revision;
export const incrementLimitYuan=3;
export const patchRows=basis.map(row=>({...structuredClone(row),patches:row.patches.map(patch=>{
 const change=changes.find(c=>c.id===row.id&&c.path===patch.path);
 return {path:patch.path,value:structuredClone(change?change.after:patch.value)};
})}));
