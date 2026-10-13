import fs from 'node:fs';
export {revision,incrementLimitYuan} from './source-repair-design.mjs';
export const patchRows=JSON.parse(fs.readFileSync(new URL('./leaf-repair-rows.json',import.meta.url),'utf8'));
