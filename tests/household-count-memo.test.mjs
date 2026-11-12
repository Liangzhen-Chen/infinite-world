import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {withRecordIndex,setRecordIndexCheck} from '../server-plugin/storage.mjs';
import {settlementHouseholds} from '../server-plugin/market.mjs';

// 聚落户数的状态记忆：依赖由被调用方的声明组合（户口视图、身份、生命周期）。打开既有的记忆校验开关（storage.setRecordIndexCheck：命中后复算比对，过期即抛），
// 再依次做三种写入：新增 use=home 的有效租约、时间推过租约到期、写一条转场记录（生命周期读 records['transition:<id>']）。
// 每次变化后读户数，断言读数正确且校验不报“过期”。租约与到期只改户口事实的来源标注、不改户数，所以这两步断言数不变（校验开关负责抓过期）；
// 转场记录让一个单人户唯一的成员死亡，现有户少一户，数必须正好少 1——记忆若没随生命周期作废，读数仍是旧值，断言失败，校验也会抛。
const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const place='loc_hw',tenant='npc_hw_xuling';

test('settlementHouseholds 记忆：租约新增、租约到期、转场记录之后读数正确，校验开关不报过期',()=>{
 setRecordIndexCheck(true);
 try{
  const e=new WorldEngine(structuredClone(world)),doc=e.createCharacter(legacy,{},'household-count-memo'),d=e.primitiveDraft(doc);
  withRecordIndex(()=>{
   const read=()=>settlementHouseholds(e,d.get('state'),place);
   const first=read();
   assert.ok(first>0);assert.equal(read(),first);
   d.set(['state','npcs',tenant,'coins'],(d.get('state','npcs',tenant,'coins')??0)+1);
   assert.equal(read(),first,'成交只改钱：户数不变');
   const now=d.get('state','minute');
   d.set(['state','records','lease_count_memo'],{id:'lease_count_memo',kind:'asset_lease',tenant,status:'有效',use:'home',subject:'bld_hw_riverhome',createdAt:now-1,deadline:now+1440});
   assert.equal(read(),first,'新增租约后户数不变，读数不报过期');
   d.set(['state','minute'],now+2*1440);
   assert.equal(read(),first,'租约到期后户数不变，读数不报过期');
   // 单人户（house_hw_03）唯一成员死亡：现有户少一户。
   d.set(['state','records',`transition:${tenant}`],{id:`transition:${tenant}`,category:'transition',generation:0,gone:true,basis:'death',actualDeath:d.get('state','minute')});
   assert.equal(read(),first-1,'转场记录让单人户的唯一成员死亡后，户数少 1');
  });
 }finally{setRecordIndexCheck(false);}
});
