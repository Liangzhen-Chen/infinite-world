import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import entries,{VILLAGES,REGISTRAR_OCCUPATIONS} from '../world/design/m5-authority.mjs';
import {validateAll,authorityRules,reviewState,validateEntry} from '../tools/m5-authority.mjs';

const world=await loadWorld(),authority=world.rules.governance.authority;
const read=async file=>JSON.parse(await fs.readFile(new URL(`../world/drafts/m5-authority/${file}`,import.meta.url),'utf8'));

test('治理来源15–25条，覆盖上级职责、官职额度、地块费率、公库与九级爵位，发布与设计一致',()=>{
 assert.deepEqual(validateAll(world).errors,[]);
 assert.ok(entries.length>=15&&entries.length<=25);
 // W8-E8 / 05 §5.7.3 extends the chief seat with public-property actions.
 // Retain byte-for-byte coverage of every M5 field plus the exact extension;
 // the old reviewed M5 skeleton and its receipts remain unchanged.
 const expected=authorityRules(),head=expected.offices.office_village_head;
 head.powers.push('public_property');
 head.powerSources={public_property:'公产使用与出租；05:129、05 §5.7.3：聚落行为经首领或相关职位的现任持有人执行，财产仍归聚落。'};
 head.seatPowers=['public_property'];
 // K10b's seven-entry L2/L4 publication extends only the existing fiscal
 // coverage to Hewan; keep every M5 amount and all other charter fields exact.
 expected.treasury.settlements.push('loc_hw');
 head.seatPowersSource='05 §5.7.3：首领职位持有人执行聚落行为；本项随席位保留，不受行政等级覆盖。';
 assert.deepEqual(authority,expected);
 assert.deepEqual(authority.titles.map(t=>t.name),world.rules.governance.titles);
 assert.deepEqual(authority.titles.map(t=>t.ranks.length),world.rules.governance.titleRanks);
 assert.equal(authority.titles.find(t=>t.name==='男爵').monthlyQuotaD.at(-1),world.rules.quests.monthlyQuotaD.cityHeadFirstBaron);
 assert.equal(authority.offices.office_village_head.monthlyQuotaD,world.rules.quests.monthlyQuotaD.villageHead);
 assert.equal(world.rules.governance.villageHead.contribution,authority.offices.office_village_head.requires.contribution);
 for(const t of authority.titles)assert.ok(t.text.length>40&&t.counterLine);
 // Only the two lowest titles can currently be granted, and never without a petition basis.
 assert.deepEqual(authority.titles.filter(t=>t.grantable).map(t=>t.name),['准爵','勋爵']);
 for(const t of authority.titles.filter(t=>t.grantable))assert.ok(t.bases.min>=1&&!t.bases.from.includes('贡献'));
});

test('上级由T92既有官署人物登记，不另造同职官员；地块都在有任命的四村之内',()=>{
 const charter=authority.superiors.auth_bs_office_charter;
 const staff=world.npcs.filter(n=>n.workplace?.location===charter.seat&&REGISTRAR_OCCUPATIONS.includes(n.occupation));
 assert.ok(staff.length>=2);assert.ok(staff.every(n=>n.tier==='full'));
 // M5 did not add these offices; 13ac0697 separately approved the A3 town head.
 assert.deepEqual(world.npcs.filter(n=>/镇长|城主|封册/.test(n.occupation??'')).map(n=>n.id),['npc_bs_townhead']);
 assert.deepEqual(charter.jurisdiction,VILLAGES);
 const byId=new Map(world.locations.map(l=>[l.id,l]));
 assert.deepEqual(Object.values(authority.plots).map(p=>p.settlement).sort(),[...VILLAGES].sort());
 for(const p of Object.values(authority.plots)){assert.equal(byId.get(p.location).parent,p.settlement);assert.ok(p.feeCopper>0&&p.slots>0&&p.annualRentCopper>0);}
 assert.equal(authority.treasury.wagePerWorkerDayCopper,world.rules.economy.wageCopperPerHalfDay[1]);
});

test('L1拒绝未经设计的数字、分成与场外词',()=>{
 const entry=structuredClone(entries.find(e=>e.id==='title_2_xunjue'));
 entry.prose.text+='另收99铜，封地收入有三成归勋爵。玩家可自选。';
 const errors=validateEntry(entry,world).errors.join('\n');
 assert.match(errors,/99/);assert.match(errors,/场外/);
 entry.prose.text=entries.find(e=>e.id==='title_2_xunjue').prose.text.replace('一成','两成半');
 assert.match(validateEntry(entry,world).errors.join('\n'),/分成/);
});

test('真实L2与L4记录：本卡预算账≤0.8元，每条通过L2或有对应现文的人工L4，随机10条六项均分≥4、单项≥3',async()=>{
 const budget=await read('budget.json'),l4=await read('l4.json');
 assert.equal(budget.card,'T123');assert.ok(budget.spentYuan>0&&budget.spentYuan<=0.8);
 assert.ok(Object.values(budget.failures).every(n=>n<=2));
 const state=await reviewState(),hash=e=>JSON.stringify({s:e.skeleton,p:e.prose});
 for(const r of state)assert.ok(r.current&&r.record.status==='passed'||l4.manual[r.entry.id]?.hash===hash(r.entry),r.entry.id);
 const all=Object.values(l4.scores).flat();
 assert.equal(Object.keys(l4.scores).length,10);assert.ok(Math.min(...all)>=3);assert.ok(all.reduce((a,b)=>a+b,0)/all.length>=4);
});
