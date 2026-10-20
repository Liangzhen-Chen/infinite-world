import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {withLedger,accountKey,auditLedger} from '../server-plugin/ledger.mjs';
import {executeLeaveMark} from '../server-plugin/mark-actions.mjs';
import {reactToMark} from '../server-plugin/mark-reactions.mjs';

const json=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const world=await loadWorld(),seed=await json('tests/fixtures/legacy/seed.json');
const rules=await json('world/rules/tables/open-actions.json'),tagging=await json('world/rules/open-tagging.json'),reactions=await json('world/rules/open-reactions.json');
function setup(){
 const engine=new WorldEngine(structuredClone(world));
 Object.assign(engine.world,{openActionRules:structuredClone(rules),openTagging:structuredClone(tagging),openReactions:structuredClone(reactions)});
 const document=withLedger(engine,engine.createCharacter(seed,{},'a3-mark')).document;
 const observer=Object.values(document.state.npcs).find(n=>n.location&&n.status!=='死亡'&&n.status!=='濒死'&&!n.scheduleTravel&&!n.cognitionTravel);
 assert.ok(observer);document.state.location=observer.location;observer.activity='闲坐';
 return {engine,document};
}
const input=(id,tags=['mark:warning'],materials=[])=>({eventId:id,args:{intent:'在门旁留下提醒来客的话',form:'刻痕',tags,materials}});

test('A3 mark: every core tag has a real observable reaction, never its claimed original effect',async()=>{
 const ontology=await json('world/ontology/tags.json');
 const tags=ontology.entries.filter(r=>r.family==='mark'&&r.id!=='mark:*').map(r=>r.id);
 assert.deepEqual([...tagging.tags].sort(),tags.sort());
 for(const tag of tags){
  const {engine,document}=setup(),before=structuredClone(document),out=executeLeaveMark(engine,document,input(`mark-${tag}`,[tag]));
  const after=applyPatches(document,out.patches),id=out.receipt.mark.entity;
  assert.ok(after.holdings.entities[id]);assert.equal(after.holdings.entities[id].kind,'mark');
  assert.equal(after.holdings.locations[id].at,document.state.location);
  assert.equal(out.receipt.fallback.originalIntentFulfilled,false);
  assert.ok(out.receipt.mark.reactions.length>0,tag);
  for(const r of out.receipt.mark.reactions){const event=after.state.records[`world_event:${r.event}`];assert.equal(event.verb,'tell');assert.equal(event.payload.mark,id);assert.ok(event.payload.text);}
  assert.deepEqual(after.ledger.accounts,document.ledger.accounts);assert.deepEqual(auditLedger(after.ledger),[]);
  assert.deepEqual(document,before);assert.equal(after.state.minute,document.state.minute+rules.mark.minutes);
  assert.ok(!Object.keys(after.ledger.accounts).some(k=>k.startsWith(id+'|')));
 }
});

test('A3 mark: real material costs, read-only preview, atomic rejection and save replay',()=>{
 const {engine,document}=setup(),item=Object.keys(document.state.inventory).find(id=>engine.world.items.some(i=>i.id===id)&&(document.ledger.accounts[accountKey('player',id,'inventory')]??0)>0);
 assert.ok(item);const key=accountKey('player',item,'inventory'),args=input('mark-material',['mark:art'],[{item,qty:1}]),before=structuredClone(document);
 const preview=executeLeaveMark(engine,document,args,{preview:true});assert.equal(preview.receipt.status,'preview');assert.deepEqual(document,before);
 const out=executeLeaveMark(engine,document,args),after=applyPatches(document,out.patches);
 assert.equal(after.ledger.accounts[key],document.ledger.accounts[key]-1);assert.deepEqual(auditLedger(after.ledger),[]);
 const duplicate=executeLeaveMark(engine,JSON.parse(JSON.stringify(after)),args);
 assert.equal(duplicate.receipt.duplicate,true);assert.deepEqual(duplicate.patches,[]);
 const impossible=input('mark-unaffordable',['mark:art'],[{item,qty:document.ledger.accounts[key]+1}]);
 assert.throws(()=>executeLeaveMark(engine,document,impossible),{code:'E-TRANSFER-BALANCE'});assert.deepEqual(document,before);
 assert.throws(()=>executeLeaveMark(engine,document,{...input('mark-fake'),args:{...args.args,coins:99}}),{code:'E-MARK-FACT'});
});

test('A3 mark: repetition decays, replacements stay observable with zero gain and do not reset history',()=>{
 const {engine,document}=setup();engine.world.openActionRules.mark.maximumPerAuthorPlace=2;
 let current=document;const receipts=[];
 for(let i=0;i<5;i++){const out=executeLeaveMark(engine,current,input(`mark-repeat-${i}`,['mark:insult']));current=applyPatches(current,out.patches);receipts.push(out.receipt.mark);}
 // delta is the policy budget on the persisted observer event; C still owns
 // its standing projection. These assertions do not claim a trust adjustment.
 assert.equal(receipts[0].reactions[0].delta,-2);assert.equal(receipts[1].reactions[0].delta,-1);
 assert.ok(receipts[2].reactions.length);assert.ok(receipts.slice(2).every(r=>r.suppressed&&r.reactions.every(x=>x.delta===0)));
 assert.equal(Object.values(current.state.records).filter(r=>r.category==='mark'&&r.active).length,2);
 assert.ok(current.holdings.entities[receipts[0].entity].goneAt!==undefined);
 assert.equal(current.state.created[receipts[0].entity],undefined);
 const draft=engine.primitiveDraft(current),mark=current.state.created[receipts[4].entity];
 assert.equal(reactToMark(draft,engine,mark,{eventId:'repeat-observation',suppressed:true}).triggered,false);
});

test('A3 mark: no awake observer means untriggered; a later observation can react once',()=>{
 const {engine,document}=setup();for(const n of Object.values(document.state.npcs))n.activity='睡眠';
 const out=executeLeaveMark(engine,document,input('mark-unseen'));assert.equal(out.receipt.mark.triggered,false);
 const after=applyPatches(document,out.patches),id=Object.keys(after.state.npcs).find(id=>after.state.npcs[id].location===after.state.location);
 assert.ok(id);after.state.npcs[id].activity='闲坐';
 const d=engine.primitiveDraft(after),result=reactToMark(d,engine,after.state.created[out.receipt.mark.entity],{eventId:'noticed-later'});
 assert.equal(result.triggered,true);assert.equal(result.reactions.length,1);
 assert.equal(result.reactions[0].observer,id);
});

test('A3 mark: seven-day decay expires, traits remain non-numeric and forbidden places stay protected',async()=>{
 const f=setup(),first=executeLeaveMark(f.engine,f.document,input('mark-window-one',['mark:insult','flammable'])),after=applyPatches(f.document,first.patches);
 assert.ok(after.holdings.entities[first.receipt.mark.entity].facts.tags.includes('flammable'));
 assert.equal(first.receipt.mark.reactions.length,first.receipt.mark.reactions.filter(r=>r.tag==='mark:insult').length);
 const waiting=await f.engine.reduce(after,{tool:'world_time',args:{minutes:rules.mark.reactionWindow},eventId:'mark-seven-days'}),later=applyPatches(after,waiting.patches);
 const observer=first.receipt.mark.reactions[0].observer;later.state.npcs[observer].location=later.state.location;later.state.npcs[observer].activity='闲坐';later.state.npcs[observer].scheduleTravel=null;later.state.npcs[observer].cognitionTravel=null;
 const second=executeLeaveMark(f.engine,later,input('mark-window-two',['mark:insult']));assert.equal(second.receipt.mark.reactions.find(r=>r.observer===observer).delta,-2);
 const place=f.engine.byId.get(f.document.state.location),saved=place.primitiveLimits;place.primitiveLimits={...saved,create:false};
 const before=structuredClone(f.document);assert.throws(()=>executeLeaveMark(f.engine,f.document,input('mark-forbidden')),{code:'E-PRIMITIVE-PLACE'});assert.deepEqual(f.document,before);
 place.primitiveLimits={...saved,create:'mark_only'};assert.ok(executeLeaveMark(f.engine,f.document,input('mark-only')).receipt.mark.entity);
});
