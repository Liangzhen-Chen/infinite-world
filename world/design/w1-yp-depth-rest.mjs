import fs from 'node:fs';
export const revision='w1-yp-depth-rest-1';
export const incrementLimitYuan=2;
const root=new URL('../drafts/w1/yp-depth-rest/',import.meta.url);
const base=JSON.parse(fs.readFileSync(new URL('base.json',root),'utf8'));
const plan=JSON.parse(fs.readFileSync(new URL('patch-plan.json',root),'utf8'));
export const patchRows=plan.map(row=>({...row,before:base.find(n=>n.id===row.id)}));
