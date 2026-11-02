import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {makeTempDir} from '../tools/tmp-root.mjs';

test('the formal loader archives sourced opening inputs and preserves their unresolved nulls',async()=>{
 const world=await loadWorld(),file=JSON.parse(await fs.readFile('world/economy/town-income.json','utf8'));
 assert.deepEqual(world.townIncome,file);assert.equal(world.townIncome.settlements[0].money.value,null);
 assert.ok(world.townIncome.settlements[0].unresolved.includes('money.value'));
});
test('the loader rejects unsourced or fractional copper and allows an edition with no opening file',async t=>{
 const root=makeTempDir('income-world-',t);await fs.cp('world',root,{recursive:true});
 const file=path.join(root,'economy/town-income.json'),original=JSON.parse(await fs.readFile(file,'utf8'));
 const missing=structuredClone(original);delete missing.settlements[0].money.basis;
 await fs.writeFile(file,JSON.stringify(missing));await assert.rejects(loadWorld(root),/town-income/);
 const fraction=structuredClone(original);fraction.settlements[0].money.value=10.5;
 await fs.writeFile(file,JSON.stringify(fraction));await assert.rejects(loadWorld(root),/town-income/);
 await fs.unlink(file);assert.equal((await loadWorld(root)).townIncome,undefined);
});
