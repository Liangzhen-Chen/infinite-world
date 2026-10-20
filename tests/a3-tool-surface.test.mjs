import test from 'node:test';
import assert from 'node:assert/strict';
import {toolDefinitions,resolveToolCall} from '../extension/tools.mjs';
import {loadPromptBundle} from '../tools/build-card.mjs';

test('A3-D 第1轮复用动作目录与执行职责，公开工具完整集合及旧别名保留',()=>{
 const expected='world_act,world_actions,world_attributes,world_cast,world_catalog,world_check,world_combat,world_companion,world_craft,world_create,world_field,world_law,world_learn,world_move,world_practice,world_profession,world_promise,world_quest,world_read,world_relation,world_remember,world_research,world_revival,world_search,world_settlement,world_time,world_trade'.split(',');
 assert.deepEqual(toolDefinitions().map(d=>d.function.name).sort(),expected);
 assert.deepEqual(resolveToolCall('world_field',{operation:'weather_inspect'}),{tool:'world_weather',args:{operation:'inspect'}});
 assert.deepEqual(resolveToolCall('world_weather',{operation:'inspect'}),{tool:'world_weather',args:{operation:'inspect'}});
 assert.deepEqual(resolveToolCall('world_act',{action:'core:trade.buy',slots:{quantity:1}}),{tool:'world_act',args:{action:'core:trade.buy',slots:{quantity:1}}});
});

test('A3-D 静态提示含 schema 的现有 A1 10593 口径与12000硬上限保留',async()=>{
 const {budget}=await loadPromptBundle();
 assert.ok(budget.estimatedTokens<=10593,`A1静态提示 ${budget.estimatedTokens}`);
 assert.ok(budget.estimatedTokens<=12000);
});
