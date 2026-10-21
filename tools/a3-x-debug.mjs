import fs from 'node:fs/promises';
import {scoreRows} from './a3-score.mjs';
const rows=JSON.parse(await fs.readFile('tests/fixtures/a3-intents-v2.json','utf8'));
const ids=process.argv.slice(2).map(Number);
const report=await scoreRows(rows.filter(r=>(ids.length?ids:[126,151,152,153,156,157,158,159]).includes(Number(r.id.split('-').at(-1)))));
await fs.writeFile('F:/dnd/logs/sessions/A3F-X-probe.json',JSON.stringify(report,null,2));
for(const r of report.results)console.log(JSON.stringify({id:r.id,scores:r.scores,unmet:r.setupUnmet,route:r.actual.route,error:r.actual.error,operations:r.actual.session?.operations.map(s=>s.operation),final:r.actual.session?.final}));
