import test from 'node:test';
import assert from 'node:assert/strict';
import {PatchCursor,withRecordIndex} from '../server-plugin/storage.mjs';
import {scheduleAt,withScheduleCache} from '../server-plugin/npc-schedule.mjs';
import {liveNpcReservations} from '../server-plugin/npc-obligations.mjs';
import {sameScheduleInputs} from '../server-plugin/education-state.mjs';
import {registerAdvance} from '../server-plugin/advance-registry.mjs';
import {PHASE} from '../server-plugin/scheduler.mjs';
import {setup} from './farm-pests-fixture.mjs';

function fixture(){
 const routine=location=>({default:[{start:0,end:1440,location,activity:'work',services:[]}]});
 const npc={id:'npc_cache'};
 const engine={world:{npcs:[npc],locations:[],professions:[],festivals:[{id:'festival_cache'}]},rules:{},byId:new Map([[npc.id,npc]]),
  calendar:()=>({market:false,day:1,season:0}),educationCourseContext:[]};
 const cursor=new PatchCursor({state:{minute:100,npcs:{[npc.id]:{location:'home',routine:routine('home')}},records:{},obligations:{},player:{}}});
 const draft={cursor,get:()=>cursor.expose(cursor.root.state)};
 const write=(path,value)=>cursor.apply({op:'set',path:['state',...path],value});
 const read=()=>scheduleAt(engine,npc.id,100,draft.get());
 return {engine,cursor,draft,write,read,routine,id:npc.id};
}

test('schedule cache reuses reads and invalidates routine, location, bookings and legal changes',()=>{
 const f=fixture();
 withScheduleCache(f.engine,f.draft,()=>{
  const first=f.read();assert.equal(f.read(),first);
  f.write(['obligations','bank-interest'],{kind:'deposit',amount:10});assert.equal(f.read(),first);
  f.write(['records','bank'],{category:'bank',coins:100});assert.equal(f.read(),first);
  f.write(['npcs',f.id,'memoryStream'],[{id:'memory'}]);assert.equal(f.read(),first);
  f.write(['npcs',f.id,'routine'],f.routine('new-home'));
  assert.notEqual(f.read(),first);assert.equal(f.read().location,'new-home');
  let old=f.read();f.write(['npcs',f.id,'location'],'market');assert.notEqual(f.read(),old);
  old=f.read();f.write(['obligations','meeting'],{kind:'promise',reservationVersion:1,start:100});assert.notEqual(f.read(),old);
  f.write(['records','hold'],{category:'legal_detention',subject:f.id,location:'court',minute:0,expires:200});
  assert.equal(f.read().location,'court');
  f.cursor.apply({op:'delete',path:['state','records','hold']});assert.equal(f.read().location,'new-home');
  f.write(['records','festival'],{category:'festival',formal:true,status:'held',participants:[f.id],due:90,endsAt:200,location:'fair',name:'Fair'});
  assert.equal(f.read().location,'fair');assert.equal(f.read().until,200);
 });
 assert.equal(f.engine.scheduleReadCache,undefined);
});

test('FIELDS_INDEX_CHECK recomputes a hit and rejects a bypassed schedule write',()=>{
 const f=fixture(),previous=process.env.FIELDS_INDEX_CHECK;process.env.FIELDS_INDEX_CHECK='1';
 try{withScheduleCache(f.engine,f.draft,()=>{
  const first=f.read();assert.equal(f.read(),first);
  // Deliberately bypass the immutable write contract to exercise the checker.
  f.cursor.root.state.npcs[f.id].routine.default[0].location='changed';
  assert.throws(f.read,/schedule cache mismatch/);
 });}finally{if(previous===undefined)delete process.env.FIELDS_INDEX_CHECK;else process.env.FIELDS_INDEX_CHECK=previous;}
});

test('hypothetical presence drafts isolate their cache from the live advance',()=>{
 const live=fixture(),simulated=fixture(),child=Object.create(live.engine);
 withScheduleCache(live.engine,live.draft,()=>{
  const original=live.engine.scheduleReadCache,slot=live.read();
  withScheduleCache(child,simulated.draft,()=>{
   assert.equal(child.scheduleReadCache.draft,simulated.draft);
   assert.equal(live.engine.scheduleReadCache,original);
  });
  assert.equal(child.scheduleReadCache,original);assert.equal(live.read(),slot);
 });
 assert.equal(child.scheduleReadCache,undefined);
});

test('teaching service obligations remain schedule inputs when unrelated finance is ignored',()=>{
 const base={minute:100,npcs:{},records:{job:{kind:'workshop',serviceObligation:'service'}},obligations:{service:{kind:'employment',status:'pending'}}};
 const finance={...base,obligations:{...base.obligations,loan:{kind:'loan',amount:10}}};
 assert.equal(sameScheduleInputs(base,finance),true);
 assert.equal(sameScheduleInputs(finance,{...finance,obligations:{...finance.obligations,service:{kind:'employment',status:'closed'}}}),false);
});

test('reservation buckets retain pre-S3 saves and follow nested writes and reclassification',()=>{
 const reservation=(id,kind)=>({id,...(kind?{kind}:{}),reservationVersion:1,status:'待履行',start:100});
 const cursor=new PatchCursor({state:{obligations:{a:reservation('a','promise'),b:reservation('b'),bank:{id:'bank',kind:'loan'}}}});
 const rows=()=>liveNpcReservations(cursor.expose(cursor.root.state));
 withRecordIndex(()=>{
  assert.deepEqual(rows().map(r=>r.id),['a','b']);assert.deepEqual(rows().map(r=>r.id),['a','b']);
  cursor.apply({op:'set',path:['state','obligations','a','status'],value:'已完成'});
  assert.deepEqual(rows().map(r=>r.id),['b']);
  cursor.apply({op:'set',path:['state','obligations','bank'],value:reservation('bank','delivery')});
  assert.deepEqual(rows().map(r=>r.id),['b','bank']);
  cursor.apply({op:'delete',path:['state','obligations','b']});assert.deepEqual(rows().map(r=>r.id),['bank']);
 });
});

test('heap-selected actors preserve the complete trace of settling every actor',async()=>{
 const f=setup('r40-selected-schedules'),input={tool:'world_time',args:{minutes:3*1440},eventId:'compare'};
 const selected=await f.engine.reduce(f.c,input);
 const unregister=registerAdvance({id:'r40_full_schedule_reference',order:99,phase:PHASE.clock,packId:'core',ruleId:'000099:r40_full_schedule_reference',
  advance:(e,d)=>{d.scheduleEducation=null;}});
 try{assert.deepEqual(await f.engine.reduce(f.c,input),selected);}finally{unregister();}
});
