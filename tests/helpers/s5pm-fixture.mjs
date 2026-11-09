// s5-law-public-maintenance 测试与剖析工具共用的夹具（从测试文件原样迁出，逻辑未改）。
import assert from 'node:assert/strict';
import {advanceNpcAutonomy,npcAutonomyBusy} from '../../server-plugin/npc-autonomy.mjs';
import fs from 'node:fs/promises';
import {world} from './finance.mjs';
import {DAY} from './finance.mjs';
import {WorldEngine} from '../../server-plugin/engine.mjs';
import {applyPatches} from '../../server-plugin/storage.mjs';
import {appointOfficeRecord} from '../../server-plugin/governance.mjs';
import {withLedger} from '../../server-plugin/ledger.mjs';
const seed=JSON.parse(await fs.readFile(new URL('../fixtures/legacy/seed.json',import.meta.url),'utf8'));
export const nativeChief='npc_hw_chenbai',nativeWorker='npc_hw_zhengshuisheng';
export function nativeScenario(building){
 const w=structuredClone(world),e=new WorldEngine(w);let doc=e.createCharacter(seed,{},'native-public-maintenance');
 delete w.rules.weather;
 Object.assign(w.rules.facilities.maintenance,{horizonDays:90,delayMaxPermille:0,stubbornPermille:0,noisePermille:0});
 const base=e.byId.get(building),manager=base.site?.manager??base.lodging.host;
 doc.state.minute=600;doc.state.location='loc_bs';
 for(const [id,location] of [[nativeChief,'bld_hw_council'],[nativeWorker,'bld_hw_council'],[manager,building]]){
  Object.assign(doc.state.npcs[id],{location,status:'正常',activity:'工作',goals:{}});
  w.npcs.find(n=>n.id===id).schedule={default:[{start:0,end:1440,location,activity:'工作',services:[]}]};
 }
 doc.state.npcs=Object.fromEntries([nativeChief,nativeWorker,manager].map(id=>[id,doc.state.npcs[id]]));
 doc.state.npcs[nativeWorker].coins=0;
 doc.state.buildings[building]={...doc.state.buildings[building],condition:59};
 Object.assign(doc.state.settlements.loc_hw,{treasury:1000,wood:100,stone:100});
 doc=withLedger(e,{...doc,ledger:undefined}).document;
 return {e,w,building,manager,get doc(){return doc;},set doc(v){doc=v;},mutate(fn){const d=e.primitiveDraft(doc),r=fn(d);doc=applyPatches(doc,d.patches);return r;}};
}
export const settlement='loc_bs_yupo',building='bld_yp_hall';
export const village=world.settlementProfiles.find(p=>p.id===settlement);export const official=village.details.governance.head;
export const worker=village.details.governance.coordinators.find(id=>id!==official);
export const officeId=`governance_office:${settlement}:office_works_deputy:${official}`;
export function scenario(){
 const w=structuredClone(world),e=new WorldEngine(w);let doc=e.createCharacter(seed,{},'public-maintenance');
 delete w.rules.weather;
 Object.assign(w.rules.facilities.maintenance,{horizonDays:90,delayMaxPermille:0,stubbornPermille:0,noisePermille:0});
 doc.state.minute=600;doc.state.location='loc_hw';
 // Campaign premises: an existing collective hall has a registered public
 // title and a formally appointed works deputy. No new place/person or power.
 doc.state.buildings[building]={...doc.state.buildings[building],owner:settlement,condition:24};
 Object.assign(doc.state.settlements[settlement],{treasury:1000,wood:100,stone:100});
 for(const id of [official,worker]){
  Object.assign(doc.state.npcs[id],{location:building,status:'正常',activity:'休息',goals:{}});
  w.npcs.find(n=>n.id===id).schedule={default:[{start:0,end:1440,location:building,activity:'休息',services:[]}]};
 }
 // An existing resident needs income; a24/day public offer is real, while
 // the market's30/day reference quote is not an alternative signed job.
 doc.state.npcs[worker].coins=0;
 const draft=e.primitiveDraft(doc),def=w.rules.governance.authority.offices.office_works_deputy;
 appointOfficeRecord(draft,e,{category:'governance_office',id:officeId,holder:official,settlement,office:def.id,status:'在任',since:0,until:180*DAY,
  nextReview:30*DAY,appointedBy:def.appointedBy,source:def.source,sourceEvent:'appointment'},'appointment');
 doc=withLedger(e,applyPatches(doc,draft.patches)).document;
 return {e,w,get doc(){return doc;},set doc(v){doc=v;},mutate(fn){const d=e.primitiveDraft(doc),r=fn(d);doc=applyPatches(doc,d.patches);return r;}};
}

// 子测「真实自治提案…」(tests/s5-law-public-maintenance.test.mjs) 的推进步骤：600 分钟选择提案、630 分钟完成行动（原样迁出）。
export function proposalAdvance(s){
 return s.mutate(d=>{
  advanceNpcAutonomy(d,s.e,600,600,'choose',{beforeState:d.get('state')});
  assert.equal(npcAutonomyBusy(d.get('state'),official,600)?.action.kind,'public_maintenance');
  d.set(['state','minute'],630);advanceNpcAutonomy(d,s.e,600,630,'finish');
 });
}
