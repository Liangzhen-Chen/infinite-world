import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {withRecordIndex,setRecordIndexCheck} from '../server-plugin/storage.mjs';
import {settlementHouseholdsRead} from '../server-plugin/market.mjs';

// 聚落户数的状态记忆：依赖由被调用方的声明组合（户口视图、身份、生命周期），这里验证三类会改变户口/在世判断的写入都使它作废：
// 新增一条 use=home 的有效租约（asset_lease，户口视图读它）、时间推过租约到期（租约按 createdAt<=minute<deadline 判有效）、写一条转场记录（生命周期读 records['transition:<id>']）。
// 记忆值是对象，用对象身份判断是否重算；同时打开既有的记忆校验开关（命中后复算比对，过期即抛）。
const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const place='loc_hw',tenant='npc_hw_xuling';

test('settlementHouseholds 记忆：租约新增、租约到期、转场记录各自使记忆作废；无关写入（钱）保留',()=>{
 setRecordIndexCheck(true);
 try{
  const e=new WorldEngine(structuredClone(world)),doc=e.createCharacter(legacy,{},'household-count-memo'),d=e.primitiveDraft(doc);
  withRecordIndex(()=>{
   const read=()=>settlementHouseholdsRead(e,d.get('state'),place);
   const first=read();
   assert.equal(read(),first,'同状态再读返回同一份记忆');
   d.set(['state','npcs',tenant,'coins'],(d.get('state','npcs',tenant,'coins')??0)+1);
   assert.equal(read(),first,'成交只改钱：不该重算户数');
   // 1) 新增 use=home 的有效租约。
   const now=d.get('state','minute');
   d.set(['state','records','lease_count_memo'],{id:'lease_count_memo',kind:'asset_lease',tenant,status:'有效',use:'home',subject:'bld_hw_riverhome',createdAt:now-1,deadline:now+1440});
   const afterLease=read();assert.notEqual(afterLease,first,'新增租约后必须重算');
   assert.equal(read(),afterLease);
   // 2) 时间推过租约到期。
   d.set(['state','minute'],now+2*1440);
   const afterExpiry=read();assert.notEqual(afterExpiry,afterLease,'时间推过到期后必须重算');
   // 3) 转场记录（生命周期读它）。
   d.set(['state','records',`transition:${tenant}`],{id:`transition:${tenant}`,category:'transition',generation:0,gone:true,basis:'death',actualDeath:d.get('state','minute')});
   assert.notEqual(read(),afterExpiry,'写转场记录后必须重算');
  });
 }finally{setRecordIndexCheck(false);}
});
