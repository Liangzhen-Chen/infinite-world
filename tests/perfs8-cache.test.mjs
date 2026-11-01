import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {canonical,canonicalEqual,applyPatches,PatchCursor} from '../server-plugin/storage.mjs';
import {weatherAt,calendarDateAt} from '../server-plugin/weather.mjs';

const source=await loadWorld();
function diamond(){
 const world=structuredClone(source);delete world.rules.weather;
 world.rules.travel.walkKmh=60;
 world.locations=['loc_hw','loc_bs','loc_yp','loc_hw_northwood'].map(id=>({id,name:id}));
 const edge=(id,from,to,toll)=>({id,from,to,toll,lengthKm:10,modes:['walk'],closedSeasons:[]});
 world.routes=[edge('late1','loc_hw','loc_yp',7),edge('late2','loc_yp','loc_hw_northwood',7),edge('early1','loc_hw','loc_bs',1),edge('early2','loc_bs','loc_hw_northwood',2)];
 return new WorldEngine(world);
}

test('cached source frontier preserves ties, resumes for new destinations, and returns independent routes',()=>{
 const engine=diamond(),cache=new Map();
 const query=to=>engine.route('loc_hw',to,'walk',0,'seed',null,cache);
 // Hand anchors: two 10-minute edges; equal paths choose the earlier world
 // location (Baishi), with toll 1+2=3 rather than 7+7=14.
 const first=query('loc_bs');assert.equal(first.minutes,10);
 const end=query('loc_hw_northwood');
 assert.deepEqual(end,{minutes:20,movingMinutes:20,cost:3,edges:['early1','early2']});
 for(const to of ['loc_hw','loc_yp','loc_bs','loc_hw_northwood'])assert.deepEqual(query(to),engine.route('loc_hw',to,'walk',0,'seed'));
 end.minutes=999;end.edges.push('caller');assert.equal(query('loc_hw_northwood').minutes,20);assert.deepEqual(query('loc_hw_northwood').edges,['early1','early2']);
 // An outgoing route that fails must not be inspected after reaching a goal.
 const other=diamond();Object.defineProperty(other.world.routes[1],'lengthKm',{get(){throw Error('outgoing');}});
 const failingCache=new Map();
 assert.equal(other.route('loc_hw','loc_yp','walk',0,'seed',null,failingCache).minutes,10);
 // A failed continuation must not publish a partially explored frontier.
 for(let i=0;i<2;i++)assert.throws(()=>other.route('loc_hw','loc_hw_northwood','walk',0,'seed',null,failingCache),/outgoing/);
});

test('route cache retains live facility factors, closures, expiry and action checkpoints',()=>{
 const engine=diamond(),cache=new Map();
 engine.byId.set('bridge',{id:'bridge',type:'bld',facilityType:'bridge',route:'early1'});
 const cursor=new PatchCursor({state:{minute:0,records:{},created:{},buildings:{bridge:{condition:100}},effects:{}}});
 engine.airDraft={peek:(...p)=>p.reduce((v,k)=>v?.[k],cursor.root),get:(...p)=>p.reduce((v,k)=>v?.[k],cursor.root)};
 const query=(minute=0)=>engine.route('loc_hw','loc_hw_northwood','walk',minute,'seed',null,cache);
 // Bridge multiplier1.25: ceil(10/75*60)+10=18; half-condition
 // gives ceil(10/37.5*60)+10=26, so the 20-minute alternate wins.
 assert.equal(query().minutes,18);
 cursor.apply({op:'set',path:['state','buildings','bridge','condition'],value:50});assert.equal(query().minutes,20);assert.equal(query().cost,14);
 cursor.apply({op:'set',path:['state','buildings','bridge','condition'],value:100});assert.equal(query().minutes,18);
 cursor.apply({op:'set',path:['state','records','war'],value:{category:'war_disruption',since:0,until:1440,routes:['early1']}});assert.equal(query().cost,14);
 assert.equal(query(1440).minutes,18);
 engine.npcObligationAction={tool:'move'};
 assert.deepEqual(query(1440).checkpoints.map(p=>p.location),['loc_bs','loc_hw_northwood']);
 engine.npcObligationAction=null;assert.equal(query(1440).checkpoints,undefined);
});

test('weather and route caches match uncached seeds, exact departures, seasons and year boundaries',()=>{
 const engine=new WorldEngine(structuredClone(source)),graph=new Map(),sequences=new Map();
 const attempt=f=>{try{return {route:f()};}catch(e){return {error:e.message};}};
 for(const seed of ['alpha','beta'])for(const minute of [0,539,540,1439,1440,90*1440,359*1440,360*1440])for(const to of ['loc_bs','loc_hw_northwood']){
  const expected=attempt(()=>engine.route('loc_hw',to,'walk',minute,seed));
  for(let i=0;i<2;i++)assert.deepEqual(attempt(()=>engine.route('loc_hw',to,'walk',minute,seed,sequences,graph)),expected);
 }
 const locations=['loc_hw','bld_hw_qingdeng','unknown'];
 for(const calendar of ['legacy:30-day','core:calendar_default'])for(const minute of [0,1439,1440,359*1440,360*1440])for(const location of locations){
  const expected=weatherAt(engine,'weather',location,minute,null,calendar);
  const actual=weatherAt(engine,'weather',location,minute,sequences,calendar);assert.deepEqual(actual,expected);
  if(actual){const date=calendarDateAt(engine,minute,calendar);assert.equal(actual.season,Math.floor((date.month-1)/3));actual.travelFactors.walk=999;assert.deepEqual(weatherAt(engine,'weather',location,minute,sequences,calendar),expected);}
 }
});

test('short and deep draft reads preserve missing values and exposed snapshots',()=>{
 const engine=diamond(),initial={state:{records:{r:{nested:{leaf:{value:7}}}}}};
 const draft=engine.primitiveDraft(initial);
 for(const p of [[],['state'],['state','records'],['state','records','r'],['state','records','r','nested'],['state','records','r','nested','leaf','value'],['state','missing','field']])assert.deepEqual(draft.get(...p),p.reduce((v,k)=>v?.[k],initial));
 const old=draft.get('state','records','r');
 draft.set(['state','records','r','nested','leaf','value'],9);
 assert.equal(old.nested.leaf.value,7);assert.equal(initial.state.records.r.nested.leaf.value,7);assert.deepEqual(draft.document,applyPatches(initial,draft.patches));
});

test('cache self-check equality retains canonical number and undefined semantics',()=>{
 fc.assert(fc.property(fc.jsonValue(),fc.jsonValue(),(a,b)=>assert.equal(canonicalEqual(a,b),canonical(a)===canonical(b))),{seed:20261101,numRuns:300});
 for(const a of [null,undefined,NaN,Infinity,-Infinity,-0,0,1,'1',true,false,Symbol('x'),()=>0])for(const b of [null,undefined,NaN,Infinity,-Infinity,-0,0,1,'1',true,false,Symbol('y'),()=>1])assert.equal(canonicalEqual(a,b),canonical(a)===canonical(b));
});
