import test from 'node:test';
import assert from 'node:assert/strict';
import {environmentFeatures} from '../server-plugin/environment.mjs';
import {PatchCursor} from '../server-plugin/storage.mjs';
import {emptyHoldings} from '../server-plugin/holdings.mjs';
import {advanceMindSpace} from '../server-plugin/magic-mind-space.mjs';
import {advanceMagicObjects} from '../server-plugin/magic-object.mjs';
import {advanceCare} from '../server-plugin/magic-care.mjs';
import {advanceWaterEarth} from '../server-plugin/magic-water-earth.mjs';

const fixture=()=>({
 engine:{world:{locations:[{id:'place_a',features:[
  {id:'cup',kind:'container',position:[1,2],owner:'old_owner'},
  {id:'stone',kind:'object',position:[3,4]},
 ]}]}},
 document:{state:{location:'place_a',records:{},npcs:{},creatures:{}},holdings:emptyHoldings()},
});

test('ingress selection still rejects a conflicting materialized non-container record',()=>{
 const {engine,document}=fixture();
 document.state.records['physical_feature:stone']={category:'wrong',id:'stone',location:'place_a',state:{}};
 const d={get:(...p)=>p.reduce((v,k)=>v?.[k],document)};engine.airDraft=d;
 assert.throws(()=>advanceMindSpace(d,engine,0,1),/心契空间对象状态键冲突/);
});

test('catalog selection preserves order and live rows without resolving unrelated objects',()=>{
 const {engine,document}=fixture();let reads=0;
 Object.defineProperty(document.holdings.locations,'stone',{enumerable:true,get(){reads++;return {mode:'place',at:'place_a'};}});
 const expected=environmentFeatures(engine,document).filter(r=>r.kind==='container');
 reads=0;
 assert.deepEqual(environmentFeatures(engine,document,r=>r.kind==='container'),expected);
 assert.equal(reads,0);
});

test('idle advancement systems do not resolve unrelated catalog placement',()=>{
 for(const advance of [
  (d,engine)=>advanceMagicObjects(d,engine,1),
  (d,engine)=>advanceCare(d,engine,0,1),
  (d,engine)=>advanceWaterEarth(d,engine,0,1),
  (d,engine)=>advanceMindSpace(d,engine,0,1),
 ]){
  const {engine,document}=fixture();
  Object.defineProperty(document.holdings.locations,'stone',{get(){throw Error('unrelated placement was resolved');}});
  const d={get:(...p)=>p.reduce((v,k)=>v?.[k],document)};engine.airDraft=d;
  advance(d,engine);
 }
});

test('selected rows reread placement, state and owners after in-place draft writes',()=>{
 const {engine,document}=fixture(),cursor=new PatchCursor(document);let rootReads=0;
 engine.airDraft={
  get document(){rootReads++;return cursor.expose(cursor.root);},
  get(...path){return cursor.expose(path.reduce((v,k)=>v?.[k],cursor.root));},
  peek(...path){return path.reduce((v,k)=>v?.[k],cursor.root);},
 };
 const set=(path,value)=>cursor.apply({op:'set',path,value});
 set(['state','records','physical_feature:cup'],{location:'place_b',position:[5,6]});
 const root=cursor.root,selected=()=>environmentFeatures(engine,undefined,r=>r.id==='cup')[0];
 assert.deepEqual(selected(),{id:'cup',kind:'container',location:'place_b',position:[5,6],owner:'old_owner'});
 set(['state','records','physical_feature:cup','location'],'place_c');
 set(['state','records','physical_feature:cup','position'],[7,8]);
 assert.equal(cursor.root,root);
 assert.equal(selected().location,'place_c');
 assert.deepEqual(selected().position,[7,8]);
 set(['holdings','locations','cup'],{mode:'carried',at:'npc_carrier'});
 set(['state','npcs','npc_carrier'],{location:'place_d'});
 set(['holdings','rows','h1'],{id:'h1',kind:'owns',holder:'new_owner',subject:'cup'});
 set(['holdings','seq'],1);
 assert.equal(cursor.root,root);
 assert.equal(selected().location,'place_d');
 assert.equal(selected().owner,'new_owner');
 set(['state','npcs','npc_carrier','location'],'place_e');
 set(['holdings','rows','h1','holder'],'next_owner');
 set(['holdings','seq'],2);
 assert.equal(cursor.root,root);
 assert.equal(selected().location,'place_e');
 assert.equal(selected().owner,'next_owner');
 assert.deepEqual(environmentFeatures(engine,undefined,()=>false),[]);
 assert.equal(rootReads,0);
 assert.equal(document.state.records['physical_feature:cup'],undefined);
});
