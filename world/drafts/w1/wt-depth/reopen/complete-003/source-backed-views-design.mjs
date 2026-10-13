import fs from 'node:fs';
export {revision,incrementLimitYuan} from './l4-gender-repair-design.mjs';
export const patchRows=JSON.parse(fs.readFileSync(new URL('./source-backed-views-rows.json',import.meta.url),'utf8'));
