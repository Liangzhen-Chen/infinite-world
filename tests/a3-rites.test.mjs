import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {withLedger,accountKey,auditLedger} from '../server-plugin/ledger.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {executeRite} from '../server-plugin/action-rite.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),table=JSON.parse(await fs.readFile('world/rules/tables/open-actions.json','utf8'));
function setup({stages=2,check=null,actual=true}={}){
 const engine=new WorldEngine(structuredClone(world));engine.world.openActionRules=structuredClone(table);
 const document=withLedger(engine,engine.createCharacter(seed,{},'a3-rite')).document;
 document.state.player.attributes.精神=10;document.state.player.hp=4;document.state.player.tags=actual?['haunted']:[];
 document.state.records.rite_diagnosis={category:'knowledge',observer:'player',proposition:'player:needs_rite',value:true,sourceType:'传闻',minute:document.state.minute};
 const item=Object.keys(document.state.inventory).find(id=>(document.ledger.accounts[accountKey('player',id,'inventory')]??0)>=2);assert.ok(item);
 const action={id:'test:rite',label:'仪式测试',narration:'test.rite',synonyms:[],visibility:{catalog:'here'},slots:[{name:'target',kind:'entity',entity:'person',required:true},{name:'roles',kind:'roles'}],cost:{owner:'primitives',time:0},check,
  outcomes:[{op:'vital',target:{slot:'target'},delta:4,type:'healing'}],
  rite:{family:'rite:test',officiant:'actor == "player"',target:'believes(target, "needs_rite")',actualTarget:'some(truth.tags, t => t == "haunted")',expiresWithin:20,roles:[],limits:{vital:{heal:4,harm:2,rangeMeters:1.5}},
   stages:Array.from({length:stages},(_,i)=>({id:`stage-${i}`,minutes:1,materials:[{resource:item,qty:1}]})),backlash:{effects:[{op:'vital',target:'$actor',delta:-2,type:'physical'}]},interrupt:{effects:[{op:'emit',verb:'tell',visibility:'witnessed',payload:{kind:'rite_unfinished'}}]}}};
 engine.world.actionDefinitions={format:1,actions:[action]};
 return {engine,document,action,item,key:accountKey('player',item,'inventory')};
}
const input=(eventId,project=null)=>({eventId,args:{action:'test:rite',slots:{target:'player'},...(project?{project}:{})}});
const rollId=(document,die)=>{for(let i=0;i<1000;i++){const id=`rite-die-${die}-${i}`,roll=createHash('sha256').update(`${document.randomSeed}:${id}:rite-check:d20`).digest().readUInt32LE(0)%20+1;if(roll===die)return id;}throw Error('missing deterministic die');};

test('A3 rite: real multi-stage project consumes each finite source once, heals only at completion, survives save replay',()=>{
 const f=setup(),before=structuredClone(f.document),first=executeRite(f.engine,f.document,input('rite-stage-0'));
 const a=applyPatches(f.document,first.patches),project=first.receipt.rite.project;
 assert.ok(project);assert.equal(a.holdings.entities[project].kind,'project');assert.equal(first.receipt.rite.status,'active');
 assert.equal(a.state.player.hp,before.state.player.hp);assert.equal(a.ledger.accounts[f.key],before.ledger.accounts[f.key]-1);assert.equal(a.state.minute,before.state.minute+1);
 const secondInput=input('rite-stage-1',project),second=executeRite(f.engine,JSON.parse(JSON.stringify(a)),secondInput),b=applyPatches(a,second.patches);
 assert.equal(second.receipt.rite.status,'completed');assert.equal(b.state.player.hp,before.state.player.hp+4);assert.equal(b.ledger.accounts[f.key],before.ledger.accounts[f.key]-2);
 assert.deepEqual(auditLedger(b.ledger),[]);assert.deepEqual(f.document,before);
 const again=executeRite(f.engine,JSON.parse(JSON.stringify(b)),secondInput);assert.equal(again.receipt.duplicate,true);assert.deepEqual(again.patches,[]);
 assert.throws(()=>executeRite(f.engine,b,input('rite-reuse-project',project)),{code:'E-RITE-PROJECT'});
 const wrong={...secondInput,args:{...secondInput.args,slots:{target:'npc_foo'}}};assert.throws(()=>executeRite(f.engine,b,wrong),{code:'E-PRIMITIVE-DUPLICATE'});
});

test('A3 rite: subjective diagnosis has identical read-only previews for different hidden truths',()=>{
 const yes=setup({stages:1}),no=setup({stages:1,actual:false}),beforeYes=structuredClone(yes.document),beforeNo=structuredClone(no.document);
 const a=executeRite(yes.engine,yes.document,input('rite-diagnosis'),{preview:true}),b=executeRite(no.engine,no.document,input('rite-diagnosis'),{preview:true});
 assert.deepEqual(a,b);assert.deepEqual(yes.document,beforeYes);assert.deepEqual(no.document,beforeNo);
 const good=executeRite(yes.engine,yes.document,input('rite-diagnosis')),bad=executeRite(no.engine,no.document,input('rite-diagnosis'));
 assert.equal(applyPatches(yes.document,good.patches).state.player.hp,beforeYes.state.player.hp+4);
 const after=applyPatches(no.document,bad.patches);assert.equal(after.state.player.hp,beforeNo.state.player.hp);assert.equal(after.ledger.accounts[no.key],beforeNo.ledger.accounts[no.key]-1);
 assert.equal(bad.receipt.rite.status,'unfinished');assert.ok(!JSON.stringify(bad.receipt).includes('haunted'));
});

test('A3 rite: five-degree table supplies partial magnitude and real fumble backlash, with full failure costs',()=>{
 const f=setup({stages:1,check:{attribute:'精神',difficulty:10}}),partial=executeRite(f.engine,f.document,input(rollId(f.document,10)));
 assert.equal(partial.receipt.check.degree,'勉强成功');assert.equal(applyPatches(f.document,partial.patches).state.player.hp,f.document.state.player.hp+2);
 const broken=executeRite(f.engine,f.document,input(rollId(f.document,1))),after=applyPatches(f.document,broken.patches);
 assert.equal(broken.receipt.check.degree,'大失败');assert.equal(after.state.player.hp,f.document.state.player.hp-2);
 assert.equal(after.ledger.accounts[f.key],f.document.ledger.accounts[f.key]-1);assert.equal(after.state.minute,f.document.state.minute+2);
});

test('A3 rite: missing qualification, role or time window refuses atomically',()=>{
 const f=setup(),before=structuredClone(f.document);
 f.action.rite.officiant='actor == "npc_impossible"';assert.throws(()=>executeRite(f.engine,f.document,input('rite-no-qualification')),{code:'E-RITE-QUALIFICATION'});
 f.action.rite.officiant='true';f.action.rite.roles=[{role:'mourner',min:1,filter:'true'}];assert.throws(()=>executeRite(f.engine,f.document,input('rite-no-role')),{code:'E-RITE-ROLE'});
 f.action.rite.roles=[];f.action.rite.stages[0].window={from:before.state.minute+10,to:before.state.minute+20};assert.throws(()=>executeRite(f.engine,f.document,input('rite-no-window')),{code:'E-RITE-WINDOW'});
 assert.deepEqual(f.document,before);
});

test('A3 rite: project expiry and explicit interruption never consume the next stage or apply success',()=>{
 for(const operation of ['expiry','interrupt']){
  const f=setup(),first=executeRite(f.engine,f.document,input(`rite-start-${operation}`)),a=applyPatches(f.document,first.patches),project=first.receipt.rite.project;
  if(operation==='expiry')a.state.minute=a.state.records[`rite_project:${project}`].deadline;
  const args=input(`rite-stop-${operation}`,project);if(operation==='interrupt')args.args.operation='interrupt';
  const out=executeRite(f.engine,a,args),b=applyPatches(a,out.patches);
  assert.equal(out.receipt.rite.status,'unfinished');assert.equal(b.ledger.accounts[f.key],a.ledger.accounts[f.key]);assert.equal(b.state.player.hp,a.state.player.hp);
  assert.equal(b.state.records[`rite_project:${project}`].status,'unfinished');
  assert.ok(out.receipt.applied.some(e=>e.payload?.kind==='rite_unfinished'));
 }
});

test('A3 rite: naming an available NPC as a role never supplies their consent',()=>{
 const f=setup({stages:1}),npc=Object.keys(f.document.state.npcs).find(id=>f.document.state.npcs[id].location);
 assert.ok(npc);f.document.state.location=f.document.state.npcs[npc].location;
 f.action.rite.roles=[{role:'mourner',min:1,filter:'true'}];f.action.rite.stages[0].minutes=0;
 const args=input('rite-role-consent');args.args.slots.roles={mourner:[npc]};
 const before=structuredClone(f.document);
 assert.throws(()=>executeRite(f.engine,f.document,args),{code:'E-RITE-ROLE'});assert.deepEqual(f.document,before);
 f.document.state.consentEvents=[{id:'role-agreement',type:'consent_given',from:npc,to:'player',scope:'rite',purpose:['test:rite'],at:f.document.state.minute,until:f.document.state.minute+20}];
 const out=executeRite(f.engine,f.document,args);assert.equal(out.receipt.rite.status,'completed');
 f.document.state.consentEvents.push({type:'consent_revoked',from:npc,consent:'role-agreement',at:f.document.state.minute});
 assert.throws(()=>executeRite(f.engine,f.document,{...args,eventId:'rite-role-revoked'}),{code:'E-RITE-ROLE'});
});

test('A3 rite: a time window that closes during the stage leaves actual unfinished consequences',()=>{
 const f=setup({stages:1}),now=f.document.state.minute;f.action.rite.stages[0].minutes=2;f.action.rite.stages[0].window={from:now,to:now+1};
 const out=executeRite(f.engine,f.document,input('rite-window-interrupted')),after=applyPatches(f.document,out.patches);
 assert.equal(out.receipt.rite.status,'unfinished');assert.equal(after.state.player.hp,f.document.state.player.hp);
 assert.equal(after.state.minute,now+2);assert.equal(after.ledger.accounts[f.key],f.document.ledger.accounts[f.key]-1);
 assert.ok(out.receipt.applied.some(e=>e.payload?.kind==='rite_unfinished'));
});

test('A3 rite: continuation metadata fits registered world_act slots without changing the project target',()=>{
 const f=setup();f.action.slots.push({name:'project',kind:'text'},{name:'operation',kind:'enum',options:['perform','interrupt']});
 const first=executeRite(f.engine,f.document,input('rite-slot-project-start')),after=applyPatches(f.document,first.patches);
 const next=input('rite-slot-project-finish');next.args.slots.project=first.receipt.rite.project;next.args.slots.operation='perform';
 const done=executeRite(f.engine,after,next);assert.equal(done.receipt.rite.status,'completed');
 assert.equal(done.receipt.rite.project,first.receipt.rite.project);
});

test('A3 rite: day/night requires actual daylight data, not a guessed fixed clock window',()=>{
 const f=setup({stages:1});f.action.rite.stages[0].window='day';const before=structuredClone(f.document);
 assert.throws(()=>executeRite(f.engine,f.document,input('rite-needs-daylight')),{code:'E-PRIMITIVE-CONNECTOR'});assert.deepEqual(f.document,before);
});
