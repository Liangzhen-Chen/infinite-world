import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {withRecordIndex,setRecordIndexCheck} from '../server-plugin/storage.mjs';
import {upkeepSelfSupply} from '../server-plugin/household-subsistence.mjs';

// 户内自给的状态记忆：声明的依赖要覆盖规划读到的状态。成交（改 inventory、coins）不使它失效；公共工程状态（state.projects，
// 日程里"施工中"开关的来源）一变就必须重算。打开既有的记忆校验开关（storage 的 setRecordIndexCheck，命中后复算比对，过期即抛）。
const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const owner='npc_hw_xuling';

test('upkeepSelfSupply 记忆：成交写入保留记忆，公共工程状态变化使它失效',()=>{
 setRecordIndexCheck(true);
 try{
  const e=new WorldEngine(structuredClone(world)),doc=e.createCharacter(legacy,{},'self-supply-memo'),d=e.primitiveDraft(doc);
  withRecordIndex(()=>{
   const first=upkeepSelfSupply(e,d.get('state'),owner);
   assert.equal(upkeepSelfSupply(e,d.get('state'),owner),first,'同状态再读返回同一份记忆');
   // 成交只写持有与钱：记忆保留（命中时校验开关会复算比对，值不同即抛“过期”）。
   d.set(['state','npcs',owner,'coins'],(d.get('state','npcs',owner,'coins')??0)+1);
   assert.equal(upkeepSelfSupply(e,d.get('state'),owner),first,'钱变了不该重算自给');
   // 公共工程开工：日程读 state.projects 判断有没有施工队，记忆必须作废。
   d.set(['state','projects','proj_memo'],{id:'proj_memo',public:{},status:'施工中'});
   const building=upkeepSelfSupply(e,d.get('state'),owner);
   assert.notEqual(building,first,'公共工程状态变化后必须重算');
   assert.equal(upkeepSelfSupply(e,d.get('state'),owner),building);
   // 完工：再变一次，再作废。
   d.set(['state','projects','proj_memo','status'],'完工');
   assert.notEqual(upkeepSelfSupply(e,d.get('state'),owner),building,'施工中到完工也必须重算');
  });
 }finally{setRecordIndexCheck(false);}
});
