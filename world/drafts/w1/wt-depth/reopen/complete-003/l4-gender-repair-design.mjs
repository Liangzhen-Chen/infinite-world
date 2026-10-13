import fs from 'node:fs';
export {revision,incrementLimitYuan} from './leaf-repair-design.mjs';
export const patchRows=JSON.parse(fs.readFileSync(new URL('./l4-gender-repair-rows.json',import.meta.url),'utf8'));
