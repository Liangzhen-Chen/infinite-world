import fs from 'node:fs/promises';
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyIntentSetup} from './a3-score.mjs';
const e=new WorldEngine(await loadWorld()),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),rows=JSON.parse(await fs.readFile('tests/fixtures/a3-intents-v2.json','utf8'));
for(const n of [170,172,205]){const r=applyIntentSetup(e,e.createCharacter(seed,{},'p-debug'),rows[n-1].setup);console.log(JSON.stringify({n,unmet:r.setupUnmet,lair:n===172?r.document.state.records['lair:lair_mud_tusk']:null,creature:n===172?r.document.state.creatures?.boss_mud_tusk:null,inscription:rows[n-1].setup.itemInstances?.[0]?.inscription}));}
