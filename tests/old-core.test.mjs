import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {clockTransaction} from '../server-plugin/effects.mjs';
import {nativePrimitiveTransaction} from '../server-plugin/native-primitives.mjs';
import {transition} from '../server-plugin/transition.mjs';
import {accountKey,openLedger,auditLedger} from '../server-plugin/ledger.mjs';
import {legacyMoney} from '../server-plugin/money.mjs';

const world=await loadWorld(),seed=JSON.parse(fs.readFileSync('tests/fixtures/legacy/seed.json','utf8'));
function fresh(){
 const engine=new WorldEngine(structuredClone(world));
 return {engine,d:engine.primitiveDraft(engine.createCharacter(seed,{},'old-core'))};
}
function native(d,engine,id){
 return nativePrimitiveTransaction(d,{engine,family:'old-core',sourceEvent:id,program:{id},
  primitives:[{op:'emit',verb:'effect_applied',visibility:'private',payload:{}}],
  apply(tx){tx.set(['state','records',`world_event:${id}`],{category:'world_event',id,verb:'effect_applied',minute:tx.get('state','minute'),visibility:'private'});return {applied:true};}});
}

test('clock transaction commits nested native sequence cursors across sibling programs',()=>{
 const {engine,d}=fresh();
 d.scheduler.nextSeq(); // Parent may be ahead of the last persisted event.
 const before=d.scheduler.seq;
 clockTransaction(d,tx=>{
  assert.notEqual(tx.scheduler,d.scheduler);
  native(tx,engine,'clock-first');
  const first=tx.get('state','records','world_event:clock-first').seq;
  assert.ok(first>before);
  clockTransaction(tx,inner=>native(inner,engine,'clock-nested'));
  native(tx,engine,'clock-last');
  assert.equal(d.scheduler.seq,before,'parent cursor stays unchanged until commit');
  return {applied:true};
 });
 const seqs=['clock-first','clock-nested','clock-last'].map(id=>d.get('state','records',`world_event:${id}`).seq);
 assert.ok(seqs[0]<seqs[1]&&seqs[1]<seqs[2]);
 assert.ok(d.scheduler.nextSeq()>seqs[2]);
});

for(const failure of ['refused','throw'])test(`clock transaction rolls back nested native cursor and patches on ${failure}`,()=>{
 const {engine,d}=fresh(),before=structuredClone(d.document),seq=d.scheduler.seq,patches=d.patches.length;
 const apply=()=>clockTransaction(d,tx=>{
  native(tx,engine,'rolled-back');
  assert.ok(tx.scheduler.seq>seq);
  if(failure==='throw')throw Error('clock abort');
  return {applied:false,reason:'clock abort'};
 });
 if(failure==='throw')assert.throws(apply,/clock abort/);else assert.equal(apply().applied,false);
 assert.equal(d.scheduler.seq,seq);
 assert.equal(d.patches.length,patches);
 assert.deepEqual(d.document,before);
 native(d,engine,'after-abort');
 assert.equal(d.get('state','records','world_event:after-abort').seq,seq+1);
});

for(const salvage of [0,0.5,1])test(`building destruction mirrors workstation fund source and salvage destination (${salvage})`,()=>{
 const {engine,d}=fresh(),building=engine.world.locations.find(p=>p.workstations?.length),station=building.workstations[0].id;
 const source=accountKey(station,'coin_river','fund');
 d.set(['state','workshopFunds',station],46);
 d.set(['ledger'],openLedger(engine,d.document));
 const before=legacyMoney(engine,d.get('state'));
 const result=transition(d,engine,{entity:building.id,basis:'destruction',origin:'destruction',salvage:{coin_river:salvage},eventId:`fund-destruction:${salvage}`});
 const saved=Math.floor(46*salvage),destination=accountKey(result.wreck,'coin_river','fund');
 assert.equal(d.get('ledger','accounts',source)??0,0);
 assert.equal(d.get('state','workshopFunds',station),0);
 assert.equal(d.get('ledger','accounts',destination)??0,saved);
 assert.equal(legacyMoney(engine,d.get('state')).get(destination)??0,saved);
 const after=legacyMoney(engine,d.get('state'));
 for(const key of new Set([...before.keys(),...after.keys()]))assert.equal(d.get('ledger','accounts',key)??0,after.get(key)??0,key);
 assert.deepEqual(auditLedger(d.get('ledger')),[]);
});
