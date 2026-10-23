import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWorld} from '../tools/load-world.mjs';
import {entriesFor,validateEntry,verify} from '../world/design/a3-people-life-approval.mjs';

test('六名 A3 人物保留玩法身份并有完整、地点有效的作息',async()=>{
 const world=await loadWorld(),entries=await entriesFor(world);
 assert.equal(entries.length,6);
 for(const entry of entries)assert.deepEqual(validateEntry(world,entry),[],entry.id);
});

test('人物层级、职业作息和未成年人边界不能被审批回执掩盖',async()=>{
 const world=await loadWorld(),entries=await entriesFor(world),minor=structuredClone(entries.find(x=>x.id==='npc_a3_repair_apprentice'));
 minor.row.tier='full';assert.match(validateEntry(world,minor).join(';'),/roster/);
 minor.row.tier='roster';minor.row.flags.romanceable=true;assert.match(validateEntry(world,minor).join(';'),/未成年人保护/);
});

test('L1/L2/L4 回执与六个人物当前字节绑定',async()=>assert.equal((await verify()).approved,6));
