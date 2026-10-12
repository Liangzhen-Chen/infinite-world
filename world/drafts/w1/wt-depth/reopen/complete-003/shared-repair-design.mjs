import fs from 'node:fs';
const rows=JSON.parse(fs.readFileSync(new URL('./shared-repair-rows.json',import.meta.url),'utf8'));
export const revision="w1-wt-depth-audit-1";
export const incrementLimitYuan=3;
export const patchRows=rows;
