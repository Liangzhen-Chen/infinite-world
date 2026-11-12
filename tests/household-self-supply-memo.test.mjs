import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {withRecordIndex,setRecordIndexCheck} from '../server-plugin/storage.mjs';
import {upkeepSelfSupply,upkeepSelfTrips} from '../server-plugin/household-subsistence.mjs';

// 户内自给的状态记忆：声明的依赖要覆盖规划读到的状态。打开既有的记忆校验开关（storage 的 setRecordIndexCheck：命中后复算比对，过期即抛）；
// 测试不为此改生产代码的形状，只断言读数在每次写入之后都正确且不报“过期”：成交（改 inventory、coins）之后读数不变；公共工程开工、完工（state.projects，
// 日程里"施工中"开关的来源）之后读数仍与现场重算一致——依赖若漏了 projects，记忆命中时校验开关复算比对到不同值就会抛。
const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const owner='npc_hw_xuling';

test('upkeepSelfSupply 记忆：成交写入后读数不变，公共工程状态变化后读数仍正确，校验开关不报过期',()=>{
 setRecordIndexCheck(true);
 try{
  const e=new WorldEngine(structuredClone(world)),doc=e.createCharacter(legacy,{},'self-supply-memo'),d=e.primitiveDraft(doc);
  withRecordIndex(()=>{
   const read=()=>({supply:upkeepSelfSupply(e,d.get('state'),owner),trips:upkeepSelfTrips(e,d.get('state'),owner)});
   const first=read();
   assert.deepEqual(read(),first,'同状态再读结果不变');
   // 成交只写持有与钱：记忆保留（命中时校验开关会复算比对，值不同即抛“过期”）。
   d.set(['state','npcs',owner,'coins'],(d.get('state','npcs',owner,'coins')??0)+1);
   assert.deepEqual(read(),first,'钱变了不该改自给');
   // 公共工程开工、完工：日程读 state.projects，记忆必须随之作废并重算（读数每次都要能被校验开关复算核对）。
   d.set(['state','projects','proj_memo'],{id:'proj_memo',public:{},status:'施工中'});
   const building=read();
   assert.deepEqual(read(),building);
   d.set(['state','projects','proj_memo','status'],'完工');
   assert.deepEqual(read(),read());
  });
 }finally{setRecordIndexCheck(false);}
});
