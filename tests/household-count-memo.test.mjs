import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {withRecordIndex,setRecordIndexCheck,recordIndexCheck} from '../server-plugin/storage.mjs';
import {settlementHouseholds,settlementCensus} from '../server-plugin/market.mjs';

// 聚落户数的状态记忆：依赖由被调用方的声明组合（户口视图、身份、生命周期）。打开既有的记忆校验开关（storage.setRecordIndexCheck：命中后复算比对，过期即抛），
// 再依次做三种写入：新增 use=home 的有效租约、时间推过租约到期、写一条转场记录（生命周期读 records['transition:<id>']）。
// 每次变化后读户数，断言读数正确且校验不报“过期”。租在本聚落、租约到期不改户数，这两步断言数不变（校验开关负责抓过期）；
// 租住别的聚落（loc_bs）的 home 租约让该户离开 loc_hw，转场记录让另一个单人户唯一的成员死亡：各少一户，数必须正好少 1——记忆若没随租约、生命周期作废，读数仍是旧值，断言失败，校验也会抛。
const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const place='loc_hw',tenant='npc_hw_xuling';

test('settlementHouseholds 记忆：租约新增、租约到期、转场记录之后读数正确，校验开关不报过期',()=>{
 setRecordIndexCheck(true);
 const violationsBefore=recordIndexCheck.violations.length;
 try{
  const e=new WorldEngine(structuredClone(world)),doc=e.createCharacter(legacy,{},'household-count-memo'),d=e.primitiveDraft(doc);
  withRecordIndex(()=>{
   const read=()=>settlementHouseholds(e,d.get('state'),place);
   const first=read();
   // 手推：entity-view 口径 = 档案 householdCount + 现有户 − 初始户；开局户全在世、都有人，现有户 = 初始户，所以等于档案值。
   assert.equal(first,world.settlementProfiles.find(p=>p.id===place).householdCount);assert.equal(read(),first);
   // stateMemo 命中：同状态再读得到同一份普查对象（memoHits 只计 recordsMemo，不适用于 stateMemo）。
   const census=()=>settlementCensus(e,d.get('state'),place),c0=census();
   assert.equal(census(),c0,'同状态再读命中同一份记忆');
   d.set(['state','npcs',tenant,'coins'],(d.get('state','npcs',tenant,'coins')??0)+1);
   assert.equal(read(),first,'成交只改钱：户数不变');assert.equal(census(),c0,'钱变了不该重算普查（保留同一份记忆）');
   const now=d.get('state','minute');
   // 租约行照真实写入的形状（finance-assets.mjs:575、607）：category contract、owner、settlement、月租、首期、到期与下次交租时刻、来源。
   const lease=(id,settlement,subject,createdAt,deadline)=>({category:'contract',kind:'asset_lease',id,subject,tenant,owner:'player',use:'home',settlement,monthlyRent:10,paid:10,status:'有效',createdAt,deadline,nextRent:createdAt+43200,location:subject,source:id});
   d.set(['state','records','asset_lease:memo_a'],lease('asset_lease:memo_a','loc_hw','bld_hw_riverhome',now-1,now+1440));
   assert.equal(read(),first,'租在本聚落：户数不变，读数不报过期');
   d.set(['state','minute'],now+2*1440);
   assert.equal(read(),first,'租约到期后户数不变，读数不报过期');
   // 租住另一个聚落（loc_bs）的 home 租约：该户的聚落变成 loc_bs，loc_hw 少一户（entity-view.settlementPopulation 按 h.settlement===id 过滤）。
   const later=d.get('state','minute');
   d.set(['state','records','asset_lease:memo_b'],lease('asset_lease:memo_b','loc_bs','loc_bs',later-1,later+1440));
   assert.equal(read(),first-1,'租住别的聚落后，本聚落户数少 1（记忆随租约记录作废）');
   // 另一个单人户（house_hw_05）唯一成员死亡：再少一户。
   const lone='npc_hw_wushuo';
   d.set(['state','records',`transition:${lone}`],{id:`transition:${lone}`,category:'transition',generation:0,gone:true,basis:'death',actualDeath:later});
   assert.equal(read(),first-2,'转场记录让单人户的唯一成员死亡后，户数再少 1');
  });
  assert.equal(recordIndexCheck.violations.length,violationsBefore,'校验开关没有记下任何过期违例');
 }finally{setRecordIndexCheck(false);}
});
