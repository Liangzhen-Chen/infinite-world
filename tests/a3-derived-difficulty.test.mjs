import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {deriveOpenLimits,deriveOpenSourceLimits,limitOpenEffects} from '../server-plugin/action-limits.mjs';
import {checkDerivedActor} from '../server-plugin/primitives-checks.mjs';
import '../server-plugin/primitives-runtime.mjs';
import {openHoldings,declareHoldingWriter,createEntity,setLocation,openHolding} from '../server-plugin/holdings.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {withLedger,auditLedger} from '../server-plugin/ledger.mjs';
import {INTELLIGENCE_VERSION,trickKey} from '../server-plugin/npc-intelligence.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const writer='a3-derived-test';
declareHoldingWriter(writer,{entities:['item'],locations:true,kinds:['owns']});
function fixture(){
 const engine=new WorldEngine(structuredClone(world));
 let document=withLedger(engine,engine.createCharacter(seed,{},'a3-derived-difficulty')).document;
 document.holdings=openHoldings(engine,document);
 const d=engine.primitiveDraft(document);
 for(const [id,material] of [['item_df_wood','wood'],['item_df_metal','metal'],['item_df_unknown',null]]){
  createEntity(d,{id,kind:'item',facts:{name:id,condition:100,...(material?{material}:{})},writer});
  setLocation(d,{entity:id,at:'player',mode:'carried',engine,writer});
  openHolding(d,{kind:'owns',holder:'player',subject:id,terms:{share:1},writer,engine});
 }
 document=applyPatches(document,d.patches);
 // Real held staff supplies the tool cap; stage is an item property.
 const tool=engine.byId.get('item_staff');tool.tags=['tool'];tool.stage=4;
 document.state.inventory.item_staff={quantity:1,durability:100,quality:tool.quality};
 return {engine,document};
}
const work=(delta=-1,entity='item_df_wood')=>({intent:'在随身物件表面磨去一点',means:{item:'item_staff'},effects:[{op:'fact.set',entity,field:'condition',delta}]});
// A real composite request has no single registered equivalent; it exercises
// the open path without removing catalog actions or installing a fake runtime.
const openWork=(delta,entity)=>{const p=work(delta,entity);return {...p,intent:'一边打磨一边说话',effects:[...p.effects,{op:'emit',verb:'tell',visibility:'witnessed',payload:{text:'我在打磨'}}]};};
const limited=(f,p,nearest=null)=>limitOpenEffects(p,deriveOpenLimits(f.engine,f.document,p,nearest));
const row=r=>r.difficultyBreakdown.effects[0];

test('derived difficulty: same native source, harder material and deeper hostility are harder',()=>{
 const f=fixture(),wood=limited(f,work()),metal=limited(f,work(-1,'item_df_metal'));
 assert.equal(wood.sources[0].id,metal.sources[0].id);assert.equal(metal.difficulty-wood.difficulty,3);
 assert.equal(row(wood).parts.find(p=>p.kind==='material').value[0],'wood');
 const target=Object.keys(f.document.state.npcs)[0],npc=f.document.state.npcs[target];
 const p={intent:'击中眼前目标',effects:[{op:'vital',target,type:'physical',delta:-1}]};
 npc.trust=60;delete npc.relationships?.player;
 const friendly=limited(f,p);npc.trust=-80;const hostile=limited(f,p);
 assert.equal(hostile.difficulty-friendly.difficulty,4);
 npc.attributes={...npc.attributes,精神:24};assert.ok(limited(f,p).difficulty>hostile.difficulty);
});

test('derived difficulty: exact quarter boundaries increase 0/1/2/3 after clipping',()=>{
 const f=fixture(),source=deriveOpenSourceLimits(f.engine,f.document,work(),work().effects[0]);
 assert.equal(source.bounds.delta,16);assert.ok(Object.isFrozen(source.bounds));
 const values=[1,4,5,8,9,12,13,16,99].map(n=>limited(f,work(-n)));
 assert.deepEqual(values.map(r=>row(r).amplitude),[0,0,1,1,2,2,3,3,3]);
 assert.deepEqual(values.map(r=>r.difficulty-values[0].difficulty),[0,0,1,1,2,2,3,3,3]);
 const clipped=values.at(-1);assert.equal(clipped.effects[0].delta,-16);
 assert.ok(clipped.trimmed.some(t=>t.requested===-99&&t.applied===-16&&t.reason));
 assert.equal(row(clipped).amplitudes[0].ratio,1);
 const snapshot=structuredClone(f.document),before=structuredClone(work());
 deriveOpenSourceLimits(f.engine,f.document,before,before.effects[0]);assert.deepEqual(f.document,snapshot);assert.deepEqual(before,work());
});

test('derived difficulty: zero source cap refuses with a reason; unknown resistance stays explicitly missing',()=>{
 const f=fixture();f.engine.world.openActionRules.sourceCaps.factWork[4]=0;
 const r=limited(f,work());assert.deepEqual(r.effects,[]);assert.match(r.blocked[0].reason,/上限为0/);
 assert.equal(r.difficultyBreakdown.effects.length,0);
 f.engine.world.openActionRules.sourceCaps.factWork[4]=16;
 const unknown=limited(f,work(-1,'item_df_unknown'));assert.ok(row(unknown).parts.some(p=>p.bonus===null&&p.reason.includes('该类抗性无数据')));
});

test('derived difficulty: a current checkpoint guard is harder when alert and on post, without inventing missing data',()=>{
 const f=fixture(),post=[...f.engine.rules.smuggling.checkpoints,...f.engine.world.routes.map(r=>({...r,location:r.to}))].find(p=>p.location&&p.guards?.some(id=>f.document.state.npcs[id]));
 assert.ok(post,'published checkpoint guard exists');
 const target=post.guards.find(id=>f.document.state.npcs[id]),npc=f.document.state.npcs[target];
 const p={intent:'击中当前目标',effects:[{op:'vital',target,type:'physical',delta:-1}]};
 npc.location=post.location;npc.activity='巡守';delete npc.mental;delete npc.scheduleTravel;delete npc.cognitionTravel;
 const missing=limited(f,p);assert.ok(row(missing).parts.some(p=>p.bonus===null&&p.reason.includes('守卫警觉')));
 npc.mental={fatigue:0,stress:0,alertness:25,interference:[]};const calm=limited(f,p);
 npc.mental.alertness=100;const alert=limited(f,p);assert.equal(alert.difficulty-calm.difficulty,3);
 npc.activity='睡眠';const asleep=limited(f,p);assert.equal(alert.difficulty-asleep.difficulty,2);
 assert.equal(row(alert).parts.find(p=>p.kind==='onDuty').value,true);
 assert.equal(row(asleep).parts.find(p=>p.kind==='onDuty').value,false);
});

test('derived difficulty: multiple effects take the maximum with every effect and magnitude dimension explained',()=>{
 const f=fixture(),p=work(-1);p.effects.push(work(-13,'item_df_metal').effects[0]);
 const r=limited(f,p),details=r.difficultyBreakdown.effects;
 assert.equal(details.length,2);assert.deepEqual(details.map(d=>d.amplitude),[0,3]);
 assert.equal(r.difficulty,Math.max(...details.map(d=>d.total))+2);assert.ok(details.every(d=>d.reason&&d.parts.length&&d.amplitudes.length));
 const source={id:'native:status',stage:1,time:1,difficulty:10,bounds:{duration:120,magnitude:4}};
 const status=limitOpenEffects({intent:'施加状态',effects:[{op:'status',target:'npc_one',duration:120,magnitude:1}]},{actor:'player',sourceFor:()=>source});
 assert.deepEqual(row(status).amplitudes.map(a=>a.bonus),[3,0]);assert.equal(row(status).amplitude,3);
});

test('derived difficulty: proposal cannot supply resistance or caps, and bounded context remains separate',async()=>{
 const f=fixture();
 for(const [key,value] of [['resistance',-99],['upperLimit',999],['bounds',{delta:999}]]){
  for(const place of ['proposal','means','effect']){
   const p=openWork(-1);(place==='proposal'?p:place==='means'?p.means:p.effects[0])[key]=value;
   assert.throws(()=>limited(f,p),{code:'E-OPEN-BOUND'});
   await assert.rejects(f.engine.previewAction(f.document,{tool:'world_propose',eventId:`forged-${place}-${key}`,args:p}),{code:'E-OPEN-BOUND'});
  }
 }
 const base=limited(f,work());
 for(const modifier of [-5,5]){
  const p={...work(),context:{modifier,reason:'当前地面和光照'}};const r=limited(f,p);
  assert.equal(r.difficulty,base.difficulty+modifier);assert.equal(r.difficultyBreakdown.world,base.difficulty);
  assert.equal(r.context.modifier,modifier);assert.equal(r.difficultyBreakdown.context.reason,p.context.reason);
 }
 for(const context of [{modifier:6,reason:'x'},{modifier:-6,reason:'x'},{modifier:1},{modifier:.5,reason:'x'}])assert.throws(()=>limited(f,{...work(),context}),{code:'E-OPEN-CONTEXT'});
 const d=f.engine.primitiveDraft(f.document);
 assert.throws(()=>f.engine.primitiveCheck(d,{difficulty:13},'public-tier'));
 assert.throws(()=>f.engine.primitiveCheck(d,{difficulty:10,context:6,contextReason:'x'},'public-context'));
});

test('derived difficulty: preview and commit use the exact threshold and context, preserve caps and ledger',async()=>{
 const f=fixture(),before=structuredClone(f.document),p={...openWork(-99),context:{modifier:5,reason:'背光处操作'}};
 const input={tool:'world_propose',eventId:'df-preview-commit',args:p};
 const preview=await f.engine.previewAction(f.document,input),out=await f.engine.reduce(f.document,input),a=preview.receipt,b=out.result.receipt;
 assert.equal(a.routing.status,'open');assert.ok(a.check);assert.equal(a.check.difficulty,a.routing.difficulty);
 assert.equal(b.check.difficulty,b.routing.difficulty);assert.deepEqual(a.check,b.check);assert.deepEqual(a.difficultyBreakdown,b.difficultyBreakdown);
 assert.equal(b.check.difficulty,b.difficultyBreakdown.world+5);assert.ok(b.trimmed.some(t=>t.reason==='source_or_daily_bound'));
 const after=applyPatches(f.document,out.patches);
 assert.ok(after.holdings.entities.item_df_wood.facts.condition>=84);
 assert.deepEqual(auditLedger(after.ledger),[]);assert.deepEqual(after.ledger.accounts,f.document.ledger.accounts);
 assert.deepEqual(f.document,before);
});

test('derived difficulty: real open checks reduce success frequency on a harder target without changing dice',async()=>{
 const f=fixture();let easy=0,hard=0,changed=0;
 for(let i=0;i<24;i++){
  const eventId=`df-distribution-${i}`;
  const a=(await f.engine.previewAction(f.document,{tool:'world_propose',eventId,args:openWork(-4)})).receipt.check;
  const b=(await f.engine.previewAction(f.document,{tool:'world_propose',eventId,args:openWork(-16,'item_df_metal')})).receipt.check;
  assert.equal(a.die,b.die);assert.equal(a.total,b.total);assert.ok(b.difficulty>a.difficulty);
  easy+=Number(a.success);hard+=Number(b.success);if(a.success&&!b.success)changed++;
 }
 assert.ok(easy>hard);assert.ok(changed>0);
});

test('derived difficulty: source cap does not grow with player level or unrelated skill tier',()=>{
 const f=fixture(),p=work(-99),low=deriveOpenSourceLimits(f.engine,f.document,p,p.effects[0]);
 f.document.state.player.level=100;f.document.state.skills.skill_light={proficiency:2699};
 const high=deriveOpenSourceLimits(f.engine,f.document,p,p.effects[0]);
 assert.deepEqual(high.bounds,low.bounds);assert.equal(high.stage,low.stage);
});

test('derived difficulty: opposed checks retain adaptation and do not add fixed resistance a second time',()=>{
 const f=fixture(),target=Object.keys(f.document.state.npcs)[0];f.document.state.location=f.document.state.npcs[target].location;
 const npc=f.document.state.npcs[target];npc.intelligence={level:5};npc.adaptation={[trickKey('力量',null)]:{count:4,lastMinute:f.document.state.minute}};
 f.engine.replayResult={npcIntelligenceVersion:INTELLIGENCE_VERSION};
 const args={attribute:'力量',opponent:{npc:target,attribute:'精神'},context:5,contextReason:'地势'},id='df-opposed';
 const original=f.engine.primitiveCheck(f.engine.primitiveDraft(f.document),args,id);
 const result=checkDerivedActor(f.engine.primitiveDraft(f.document),f.engine,args,id,'player',{world:999,context:{modifier:5,reason:'地势'},effects:[{resistance:999}]});
 for(const key of ['die','total','difficulty','degree','success','opponent'])assert.deepEqual(result[key],original[key]);
 assert.equal(result.opponent.wary,4);
 assert.equal(result.difficultyBreakdown.resistanceApplied,false);
});

test('derived difficulty: native unconsented healing delegates target resistance to its existing opposed path',()=>{
 const f=fixture(),target=Object.keys(f.document.state.npcs)[0],npc=f.document.state.npcs[target],spell=f.engine.byId.get('spell_s3_mend_palm');
 npc.attributes={...npc.attributes,精神:30};npc.trust=-80;
 f.document.state.skills[spell.skill]={proficiency:0};f.document.state.spells[spell.id]={known:true};
 const p={intent:'用所学术法疗伤',means:{spell:spell.id},effects:[{op:'vital',target,type:'healing',delta:1}]};
 const unconsented=limited(f,p);assert.equal(row(unconsented).opposed,true);assert.equal(row(unconsented).resistance,0);
 assert.ok(row(unconsented).parts.every(part=>part.counted===false&&part.reason.includes('对抗')));
 f.document.state.consentEvents=[{id:'df-healing-consent',type:'consent_given',from:target,to:'player',scope:'healing',at:f.document.state.minute,until:f.document.state.minute+100}];
 const consented=limited(f,p);assert.equal(row(consented).opposed,undefined);assert.ok(row(consented).resistance>0);
});
