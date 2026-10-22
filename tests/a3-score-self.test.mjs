import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {executeIntent,scoreRows,signatureMatches as matchSignature,signatureEffects,applyIntentSetup,validateCheckBranch,loadCorpus,v2CorpusPath,oldCorpusPath} from '../tools/a3-score.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';
import {magicStatusStats} from '../server-plugin/magic-status.mjs';
import {knowledgeProficiency,knowsKnowledge} from '../server-plugin/education-state.mjs';
import {effectiveProficiency} from '../server-plugin/professions.mjs';
import {aliveHoldings,auditHoldings} from '../server-plugin/holdings.mjs';
import {capacity,canAct} from '../server-plugin/action-capacity.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const signatureMatches=(expected,effects,receipt,requested,document)=>matchSignature(expected,effects,receipt,requested,world,document);
const engine=new WorldEngine(world),initial=engine.initialFromLegacy(seed,'a3-score-self');
const v2Rows=JSON.parse(await fs.readFile(new URL('./fixtures/a3-intents-v2-r5.json',import.meta.url),'utf8'));
const v2Row=id=>v2Rows.find(row=>row.id===`A3V2-${id}`);
// A known awake witness at the starting shop, as in the mark integration tests.
initial.state.npcs.npc_hw_linsui.location=initial.state.location;
initial.state.npcs.npc_hw_linsui.activity='闲逛';
initial.state.npcs.npc_hw_linsui.scheduleTravel=null;
initial.state.npcs.npc_hw_linsui.cognitionTravel=null;
const expected=(route,signature,other={})=>({route,signature,outOfBounds:false,fallback:false,constructor:false,...other});
// The intent names the offered tag label (警告), as a form user would pick it.
const markSlots={intent:'在店门边刻下警告路人的记号',form:'刻痕',tags:['mark:warning']};
const rows=[
 {id:'self-open',intent:'说一句今天的见闻',proposal:{intent:'xyzzy说见闻',effects:[{op:'emit',verb:'tell',visibility:'public',payload:{text:'今天路上有一只鸟'}}]},expected:expected('open:proposal',['emit'])},
 {id:'self-refuse',intent:'凭空给自己一百枚铜钱',proposal:{intent:'xyzzy凭空造钱',effects:[{op:'transfer',from:'src:genesis|coin_river|purse',to:'player|coin_river|purse',qty:100}]},expected:expected('reject',[],{outOfBounds:true})},
 {id:'self-clarify',intent:'对不知道是谁的人说句话',proposal:{intent:'xyzzy向谁说话',participants:{target:'不存在的路人'},effects:[{op:'emit',verb:'tell',target:'不存在的路人',visibility:'public',payload:{text:'你好'}}]},expected:expected('clarify',[])},
 {id:'self-fallback',intent:'凭想象创造一座飞天茶壶',proposal:{intent:'xyzzy飞天茶壶',effects:[{op:'create',kind:'item',facts:{name:'飞天茶壶'}}]},expected:expected('open:leave_mark',['create'],{fallback:true})},
 {id:'self-builder',intent:markSlots.intent,builder:{action:'open:leave_mark',slots:markSlots},expected:expected('open:leave_mark',['create'],{fallback:true,constructor:true})},
 {id:'self-registered',intent:'留下痕迹',proposal:{intent:'留下痕迹',effects:[{op:'create',kind:'mark',facts:{intent:markSlots.intent,form:markSlots.form},tags:markSlots.tags}]},expected:expected('open:leave_mark',['create'],{fallback:true})},
];
const options={world,seed,document:initial};
// 05 §5.3 / review 10-22 P1: a corpus office is loaded only as a narrowed
// instance of an office in its organization's charter. The shipped world has
// no charter for the white-stone watch and registry desks yet (reported to the
// main session), so the legal regressions attach a test-local charter to
// loc_bs instead of letting corpus rows grant themselves powers.
const charterWorld=structuredClone(world);
charterWorld.locations.find(l=>l.id==='loc_bs').offices=[
 {id:'office_test_bs_watch_desk',seat:'bld_bs_watch',authority:{operations:['receive_report','collect_fine','handle_case','guard']}},
 {id:'office_test_bs_arrest',seat:'bld_bs_watch',authority:{operations:['holding.open','move']}},
 {id:'office_test_bs_registry',seat:'bld_bs_office',authority:{operations:['receive_appeal','receive_claim']}},
];
const charterEngine=new WorldEngine(charterWorld),charterOptions={...options,world:charterWorld};
// A declared distance is a premise only when native geometry measures it
// (review 10-22 P1); person-to-person distances are a reported S4 gap. The
// regressions below do not read distance, so they drop that premise.
const withoutPositions=row=>{const {positions,...setup}=row.setup??{};return {...row,setup};};

test('A3 signature r10: conditional legal consequences require their native submission and recipient decision',async()=>{
 const corpus=JSON.parse(await fs.readFile(new URL('./fixtures/a3-intents-v2-r7.json',import.meta.url),'utf8')).map(withoutPositions);
 for(const number of ['051','052','056','058']){
  const row=corpus.find(r=>r.id===`A3V2-${number}`),run=await executeIntent(charterEngine,initial,row);
  const check=(effects=run.effects,receipt=run.receipt,document=run.document)=>signatureMatches(row.expected.signature,effects,receipt,run.requested,document);
  assert.equal(run.actual.committed,true,row.id);
  assert.equal(check(),true,`${row.id}: submitted, not accepted`);
  assert.equal(signatureMatches(row.expected.signature,run.effects,run.receipt,run.requested),false,'conditional scoring needs native world records');
  assert.equal(check([],run.receipt),false,'a missing request never earns conditional credit');
  assert.equal(check(run.effects,{...run.receipt,legacy:{...run.receipt.legacy,accepted:true}}),true,'receipt acceptance alone is not a native decision');
  const doc=structuredClone(run.document),requestId=run.receipt.legacy.request,request=doc.state.records[requestId];
  const accepted={category:'world_event',id:'r10-accept',verb:'accept',actor:request.receiver,target:request.actor,minute:doc.state.minute,
   payload:{request:requestId,kind:request.request.kind,case:request.case??'r10-new-case'}};
  doc.state.records['world_event:r10-accept']=accepted;
  let consequence;
  if(number==='058')consequence={op:'transfer',resource:'coin_river',from:'player|coin_river|purse',to:`${request.receiver}|coin_river|purse`,qty:request.request.terms.amount};
  else if(number==='052'){
   const native=doc.state.records[request.case],before=native.stage;native.stage='appeal';
   consequence={op:'fact.set',entity:request.case,field:'stage',value:'appeal',result:{path:['state','records',request.case,'stage'],before,after:'appeal'}};
  }else{
   // A cargo claim is a civil matter (law.mjs civilMatter); theft is not.
   const native={category:'legal_case',id:'r10-new-case',sourceEvent:accepted.id,stage:'pending',offense:request.request.kind,
    victim:request.actor,offender:request.request.accused??request.request.carrier,...(number==='056'?{civilMatter:'cargo_damage'}:{})};
   doc.state.records[native.id]=native;
   consequence={op:'create',kind:'case',result:{path:['state','records',native.id],before:null,after:structuredClone(native)}};
  }
  const effects=[...run.effects,consequence];
  assert.equal(check(run.effects,run.receipt,doc),false,`${row.id}: acceptance requires the consequence`);
  assert.equal(check(effects,run.receipt,doc),true,`${row.id}: exact accepted consequence`);
  const repeated=structuredClone(doc);repeated.state.records['world_event:r10-accept-again']={...structuredClone(accepted),id:'r10-accept-again'};
  assert.equal(check(run.effects,run.receipt,repeated),false,'repeated acceptance cannot waive the consequence');
  assert.equal(check(effects),false,`${row.id}: consequence before acceptance`);
  const mutate=change=>{
   const changed={effects:structuredClone(effects),document:structuredClone(doc)};change(changed);
   assert.equal(check(changed.effects,run.receipt,changed.document),false,row.id);
  };
  mutate(({document})=>{document.state.records['world_event:r10-accept'].actor='npc_hw_wushuo';});
  mutate(({document})=>{document.state.records['world_event:r10-accept'].payload.request='another-request';});
  mutate(({document})=>{document.state.records['world_event:r10-accept'].minute++;});
  mutate(({document})=>{delete document.state.records[requestId];});
  mutate(({document})=>{document.state.records['world_event:r10-accept'].verb='tell';});
  // A pre-existing case judgment without this request link is not acceptance.
  mutate(({document})=>{const event=document.state.records['world_event:r10-accept'];event.verb='judged';event.payload.accepted=true;delete event.payload.request;});
  const judged=structuredClone(doc);judged.state.records['world_event:r10-accept'].verb='judged';judged.state.records['world_event:r10-accept'].payload.accepted=true;
  assert.equal(check(effects,run.receipt,judged),true,'a linked native adjudication can record acceptance');
  if(number==='058'){
   mutate(({effects})=>{effects.at(-1).to='npc_hw_wushuo|coin_river|purse';});
   mutate(({effects})=>{effects.at(-1).to=`${request.receiver}|coin_river|legal_treasury`;});
   mutate(({effects})=>{effects.at(-1).qty++;});
   mutate(({effects})=>{effects.at(-1).resource='item_bread';});
   const cost={...consequence,role:'additional_cost'};
   assert.equal(check([...run.effects,cost],{...run.receipt,cost:{resources:[cost]}}),false,'cost filtering cannot hide an unaccepted payment');
  }else if(number==='052'){
   mutate(({effects})=>{effects.at(-1).entity='another-case';});
   mutate(({effects})=>{effects.at(-1).value='closed';});
   mutate(({document})=>{document.state.records[request.case].stage='judged';});
  }else{
   mutate(({document})=>{delete document.state.records['r10-new-case'];});
   mutate(({effects})=>{effects.at(-1).kind='mark';});
   mutate(({document})=>{document.state.records['r10-new-case'].sourceEvent='unrelated';});
   mutate(({effects,document})=>{const native=document.state.records['r10-new-case'];native.offender='npc_hw_linsui';effects.at(-1).result.after=structuredClone(native);});
   mutate(({effects,document})=>{const native=document.state.records['r10-new-case'];native.offense='unrelated';effects.at(-1).result.after=structuredClone(native);});
   // Review 10-22 P0: civil_claim is checked on the native case, not ignored.
   if(number==='056')mutate(({effects,document})=>{const native=document.state.records['r10-new-case'];delete native.civilMatter;effects.at(-1).result.after=structuredClone(native);});
  }
 }
 const score=await scoreRows(corpus.filter(r=>/-(051|052|056|058)$/.test(r.id)),charterOptions);
 for(const result of score.results){
  assert.equal(result.scores.signature,true,`${result.id}: scored submission`);
  // 标杆 B07.4 / review 10-22: constructor credit is the model-free form
  // search, judged separately; it is no longer a replay of this proposal.
  assert.equal(result.constructorSearch.method,'model-free form',result.id);
 }
});

test('A3 signature r10: 055 quote-only negotiation does not satisfy a signed defence contract and payment',async()=>{
 const corpus=JSON.parse(await fs.readFile(new URL('./fixtures/a3-intents-v2-r7.json',import.meta.url),'utf8'));
 const row=corpus.find(r=>r.id==='A3V2-055'),run=await executeIntent(engine,initial,row);
 assert.equal(row.proposal.effects[0].payload.terms.quoteOnly,true);
 assert.equal(run.receipt.legacy.submitted,true);
 assert.equal(run.receipt.legacy.accepted,null);
 assert.deepEqual(run.effects.map(e=>e.op),['emit']);
 assert.equal(signatureMatches(row.expected.signature,run.effects,run.receipt,run.requested,run.document),false);
});

test('A3 loader r8: default uses the checked-in v2 corpus and explicit missing paths never fall back',async()=>{
 const loaded=await loadCorpus();
 assert.equal(loaded.corpusPath,v2CorpusPath);
 assert.equal(v2CorpusPath,fileURLToPath(new URL('./fixtures/a3-intents-v2.json',import.meta.url)));
 assert.deepEqual(loaded.rows,JSON.parse(await fs.readFile(new URL('./fixtures/a3-intents-v2.json',import.meta.url),'utf8')));
 const legacy=await loadCorpus({corpusPath:oldCorpusPath});
 assert.equal(legacy.corpusPath,oldCorpusPath);assert.ok(legacy.rows.length);
 await assert.rejects(loadCorpus({corpusPath:new URL('./fixtures/a3-r8-does-not-exist.json',import.meta.url)}),{code:'ENOENT'});
});

test('A3 signature r8: ledger endpoint aliases require exact purpose and recipe provenance',()=>{
 const recipe=world.recipes.find(r=>r.id==='recipe_wooden_pegs');
 const input={op:'transfer',resource:'item_wood',from:'player|item_wood|inventory',to:'sink:consume|item_wood|craft'};
 assert.equal(signatureMatches(['transfer(resource:item_wood,self->sink:craft)'],[input]),true);
 assert.equal(signatureMatches(['transfer(resource:item_wood,self->sink:craft)'],[{...input,to:'sink:consume|item_wood|meal'}]),false);
 assert.equal(signatureMatches(['transfer(resource:item_wood,self->sink:craft)'],[{...input,to:'npc_hw_linsui|item_wood|craft'}]),false);
 assert.equal(signatureMatches(['transfer(resource:item_wood,self->sink:craft)'],[{...input,to:'sink:craft|item_wood|meal'}]),false);
 const output={op:'transfer',resource:recipe.output.item,from:`src:craft|${recipe.output.item}|craft`,to:`player|${recipe.output.item}|inventory`};
 const receipt={legacy:{recipe:recipe.id}};
 for(const endpoint of [recipe.id,`${recipe.name}的产出来源`]){
  const signature=[`transfer(resource:${recipe.output.item},${endpoint}->self)`];
  assert.equal(signatureMatches(signature,[output],receipt),true);
  assert.equal(signatureMatches(signature,[output],{legacy:{recipe:'recipe_wrong'}}),false);
  assert.equal(signatureMatches(signature,[{...output,from:`src:genesis|${recipe.output.item}|craft`}],receipt),false);
  assert.equal(signatureMatches(signature,[{...output,from:`src:craft|${recipe.output.item}|other`}],receipt),false);
 }
 assert.equal(signatureMatches([`transfer(resource:${recipe.output.item},recipe_wooden_pegs_extra->self)`],[output],receipt),false);
});

test('A3 signature r8: required effects are a multiset and extras need companion evidence',()=>{
 const emit={op:'emit',target:'npc_hw_linsui'},other={...emit,target:'npc_hw_wushuo'};
 const learn={op:'learn',target:'player',subject:'skill_life_6_core',mode:'practice',result:{path:['state','skills','skill_life_6_core']}};
 const wear={op:'fact.set',entity:'item_whittling_knife',field:'durability',value:79,result:{before:80,after:79}};
 const time={op:'time',minutes:20},drain={op:'vital',target:'player',type:'body:fatigue',need:'fatigue',delta:1,result:{after:{value:1}}};
 const receipt={actor:'player',cost:{time:20},legacy:{spent:{toolWear:[{item:wear.entity,before:80,after:79}]}}};
 const signature=['emit(person:npc_hw_linsui)'];
 assert.equal(signatureMatches(signature,[emit,learn,wear,time,drain],receipt),true);
 assert.equal(signatureMatches(signature,[emit,other],receipt),false);
 assert.equal(signatureMatches(['emit','emit'],[emit],receipt),false);
 assert.equal(signatureMatches(['emit','emit'],[emit,other],receipt),true);
 assert.equal(signatureMatches(Array(63).fill('emit'),[...Array(63).fill(emit),{op:'status'}],receipt),false);
 const taught={...learn,subject:'skill_literacy',mode:'teacher'};
 // Review 10-22 P0: a companion (here practice XP) never satisfies a required
 // effect even when its qualifiers would match; two non-companion learns do.
 assert.equal(signatureMatches(['learn','learn(person:self,skill_life_6_core)'],[learn,taught],receipt),false);
 assert.equal(signatureMatches(['learn','learn(person:self,skill_life_6_core)'],[{...learn,mode:'teacher'},taught],receipt),true);
 assert.equal(signatureMatches(signature,[learn,wear],receipt),false);
 assert.equal(signatureMatches(signature,[emit,{...learn,mode:'teacher'}],receipt),false);
 assert.equal(signatureMatches(signature,[emit,{...learn,result:{path:['state','spells','spell_light']}}],receipt),false);
 assert.equal(signatureMatches(signature,[emit,{...wear,value:81}],receipt),false);
 assert.equal(signatureMatches(signature,[emit,wear]),false);
 assert.equal(signatureMatches(signature,[emit,{...drain,delta:-1}],receipt),false);
 assert.equal(signatureMatches(signature,[emit,{...wear,entity:'player',field:'xp',value:30}],receipt),false);
 const fee={op:'transfer',from:'player|coin_river|purse',to:'npc_hw_linsui|coin_river|purse',qty:2};
 assert.equal(signatureMatches(signature,[emit,fee],{cost:{resources:[fee]}}),false);
 const additional={...fee,role:'additional_cost'};
 assert.equal(signatureMatches(signature,[emit,additional],{cost:{resources:[additional]}}),true);
 // Review 10-22 P0: an excluded cost cannot satisfy a requirement; the same
 // payment counts only when the request itself asked for it.
 assert.equal(signatureMatches([...signature,'transfer(resource:coin,self->npc_hw_linsui)'],[emit,additional],{cost:{resources:[additional]}}),false);
 assert.equal(signatureMatches([...signature,'transfer(resource:coin,self->npc_hw_linsui)'],[emit,additional],{cost:{resources:[additional]}},[{op:'transfer',resource:'coin',from:'self',to:'npc_hw_linsui',qty:2}]),true);
 assert.equal(signatureMatches(signature,[emit,additional]),false);
});

const checkedAction=(id,outcomes,difficulty=10)=>({id,label:'check branch',narration:'test.check',synonyms:[],visibility:{catalog:'here'},slots:[],check:{attribute:engine.rules.attributes[0],difficulty},outcomes});
const branchOptions=action=>{
 const branchWorld=structuredClone(world);branchWorld.actionDefinitions={format:1,actions:[action]};
 return {...options,world:branchWorld};
};

test('A3 signature r9: role endpoints use resolved counterparties and exact account purposes',async()=>{
 // r9 added explicit endpoints to the live corpus; this regression exercises
 // the earlier role-only signatures and must keep that original contract.
 const corpus=JSON.parse(await fs.readFile(new URL('./fixtures/a3-intents-v2-r7.json',import.meta.url),'utf8'));
 for(const number of ['031','032','037','038','039','054','095']){
  const row=corpus.find(r=>r.id===`A3V2-${number}`),run=await executeIntent(charterEngine,initial,row),receipt=run.receipt;
  assert.equal(run.actual.committed,true,row.id);
  const signatures=row.expected.signature.filter(s=>s.includes('->'));
  for(const signature of signatures){
   const effect=run.effects.find(e=>signatureMatches([signature],[e],receipt));
   assert.ok(effect,`${row.id}: ${signature}`);
   assert.equal(signatureMatches([signature],[effect],{}),false,'roles need native resolution');
   const counterpart=effect.from==='player'||effect.from?.startsWith('player|')?'to':'from';
   const wrong={...effect,[counterpart]:effect[counterpart].replace(/^[^|]+/,'wrong_counterparty')};
   assert.equal(signatureMatches([signature],[wrong],receipt),false,'exact entity required');
   assert.equal(signatureMatches([signature],[{...effect,from:effect.to,to:effect.from}],receipt),false,'direction required');
   if(effect.op==='transfer'){
    assert.equal(signatureMatches([signature],[{...effect,[counterpart]:effect[counterpart].replace(/[^|]+$/,'wrong_purpose')}],receipt),false,'account purpose required');
   }
  }
  // 06 §6.9: resolving a role never hides real transfers or holding closures.
  if(['037','095'].includes(number))assert.equal(signatureMatches(row.expected.signature,run.effects,receipt,run.requested),false);
  // 01 §1.6 / 06 §6.8: the agreed remittance total is one native payment;
  // resolving the role still exposes the full payment and bill obligation.
  if(number==='038')assert.equal(signatureMatches(row.expected.signature,run.effects,receipt,run.requested),true);
  if(number==='095'){
   const effect=run.effects.find(e=>e.op==='holding.transfer');
   assert.equal(signatureMatches(['holding.transfer(new_holder:buyer)'],[effect],receipt),true);
   assert.equal(signatureMatches([`holding.transfer(new_holder:${receipt.legacy.buyer})`],[effect],receipt),true);
   assert.equal(signatureMatches(['holding.transfer(new_holder:buyer)'],[{...effect,newHolder:'wrong_buyer'}],receipt),false);
  }
  if(number==='054'){
   const effect=run.effects.find(e=>e.op==='transfer');
   for(const role of ['court','creditor']){
    assert.equal(signatureMatches([`transfer(self->${role})`],[effect],receipt),true);
    assert.equal(signatureMatches([`transfer(self->${role})`],[{...effect,to:`${receipt.legacy.payment.collector}|coin_river|purse`}],receipt),false);
   }
  }
 }
 const receipt={routed:'core:trade.buy',legacy:{seller:'npc_hw_linsui'}};
 const effect={op:'transfer',from:'player|coin_river|purse',to:'npc_hw_linsui|coin_river|purse'};
 assert.equal(signatureMatches(['transfer(self->seller)'],[effect],receipt),true);
 assert.equal(signatureMatches(['transfer(self->seller_extra)'],[effect],receipt),false);
 assert.equal(signatureMatches(['transfer(self->seller)'],[{...effect,to:'npc_hw_wushuo|coin_river|purse'}],receipt),false);
});

test('A3 signature r11: role endpoints require a native counterparty even when literal endpoints match',()=>{
 const roles=['bank','local_bank','pawnshop','buyer','seller','court','authorized_collector','creditor','recipient'];
 for(const role of roles){
  for(const to of [`${role}|coin_river|purse`,'npc_hw_linsui|coin_river|purse']){
   const effect={op:'transfer',from:'player|coin_river|purse',to};
   for(const receipt of [undefined,{}, {routed:'core:trade.buy',legacy:{}},
    {routed:'core:trade.buy',legacy:{buyer:'npc_hw_wushuo'},routing:{slots:{seller:'npc_hw_linsui'}}}]){
    assert.equal(signatureMatches([`transfer(self->${role})`],[effect],receipt),false,role);
   }
  }
  const effect={op:'holding.transfer',newHolder:role};
  assert.equal(signatureMatches([`holding.transfer(new_holder:${role})`],[effect]),false,role);
 }
});

test('A3 checks r11: failed native certification consumes time but never charges or grants certification',async()=>{
 const row={id:'certification-r11',action:'core:profession.certify',slots:{profession:'profession_mage',teacher:'npc_hw_xuling'},
  setup:{location:'bld_hw_riverhome',present:['npc_hw_xuling'],minute:540,coins:1000,
   abilities:{skills:{skill_light:100},spells:[],recipes:[],licenses:[]},
   body:{player:{level:10}}},
  expected:expected('core:profession.certify',['holding.open','transfer'])};
 const result=(await scoreRows([row],options)).results[0];
 assert.deepEqual(result.setupUnmet,[]);
 assert.equal(result.checkBranches.success.ok,true,JSON.stringify(result.checkBranches.success));
 assert.equal(result.checkBranches.failure.ok,true,JSON.stringify(result.checkBranches.failure));
 const high=await executeIntent(engine,{...initial,randomSeed:result.checkBranches.success.randomSeed},row);
 const low=await executeIntent(engine,{...initial,randomSeed:result.checkBranches.failure.randomSeed},row);
 const role=engine.byId.get('profession_mage');
 assert.equal(high.receipt.legacy.certified,true);
 assert.equal(high.document.state.player.coins,high.before.state.player.coins-role.fee);
 assert.ok(aliveHoldings(engine.primitiveDraft(high.document),{kind:'certified',holder:'player'}).some(h=>h.subject==='office_cert:profession_mage'));
 assert.equal(low.receipt.legacy.certified,false);
 assert.equal(low.document.state.player.coins,low.before.state.player.coins);
 assert.equal(low.document.state.minute-low.before.state.minute,role.entry.minutes);
 assert.equal(validateCheckBranch(engine,low,row,'failure').ok,true);
 const mutate=change=>{
  const run={...low,document:structuredClone(low.document),receipt:structuredClone(low.receipt),effects:structuredClone(low.effects)};
  change(run);assert.equal(validateCheckBranch(engine,run,row,'failure').ok,false);
 };
 mutate(run=>{run.receipt.legacy.certified=true;});
 mutate(run=>{run.receipt.legacy.success=true;});
 mutate(run=>{run.document.state.professions.combat=role.id;});
 mutate(run=>{run.document.state.careers??={};run.document.state.careers[role.id]={certification:{source:run.receipt.eventId}};});
 mutate(run=>{run.document.holdings.rows.injected={kind:'certified',holder:'player',subject:`office_cert:${role.id}`};});
 mutate(run=>{run.document.state.player.coins-=role.fee;});
 mutate(run=>{run.document.ledger=structuredClone(high.document.ledger);});
 mutate(run=>{run.effects.push({op:'transfer',from:'player|coin_river|purse',to:'npc_hw_xuling|coin_river|purse',qty:role.fee});});
 mutate(run=>{run.effects.push({op:'holding.open',kind:'certified',holder:'player',subject:`office_cert:${role.id}`});});
 mutate(run=>{run.receipt.cost.time--;});
 mutate(run=>{run.document.state.minute--;});
 // 05 §5.7: the failed attempt keeps exactly one native application record to
 // the institution the receipt names; a second, misdirected or altered record fails.
 const application=low.effects.find(e=>e.op==='emit'&&e.verb==='request'&&e.payload?.kind==='certification');
 assert.ok(application);assert.equal(application.target,low.receipt.legacy.institution);
 mutate(run=>{run.effects.push(structuredClone(application));});
 mutate(run=>{run.effects.find(e=>e.op==='emit'&&e.verb==='request').target='faction_not_examining';});
 mutate(run=>{run.effects.find(e=>e.op==='emit'&&e.verb==='request').payload.terms.profession='profession_other';});
 mutate(run=>{run.effects.push({op:'emit',verb:'announce',target:application.target,payload:{kind:'certification'}});});
 // The native entry gate rejects insufficient skill before rolling or charging.
 const unskilled=structuredClone(row);unskilled.setup.abilities.skills.skill_light=role.entry.minimumProficiency-1;
 const rejected=await executeIntent(engine,initial,unskilled);
 assert.equal(rejected.actual.committed,false);
 assert.equal(rejected.document.state.player.coins,rejected.before.state.player.coins);
 assert.deepEqual(rejected.document.state.professions,rejected.before.state.professions);
 assert.deepEqual(rejected.document.holdings,rejected.before.holdings);
});

test('A3 checks r9: failed native repair preserves durability and pays materials, fee and tool wear',async()=>{
 const row=(await loadCorpus()).rows.find(r=>r.id==='A3V2-028'),result=(await scoreRows([row],options)).results[0];
 assert.equal(result.checkBranches.failure.ok,true,JSON.stringify(result.checkBranches.failure));
 const low=await executeIntent(engine,{...initial,randomSeed:result.checkBranches.failure.randomSeed},row);
 assert.equal(validateCheckBranch(engine,low,row,'failure').ok,true);
 const mutate=change=>{
  const run={...low,document:structuredClone(low.document),receipt:structuredClone(low.receipt),effects:structuredClone(low.effects)};
  change(run);assert.equal(validateCheckBranch(engine,run,row,'failure').ok,false);
 };
 mutate(run=>{run.document.state.itemInstances[run.receipt.legacy.instance].durability++;});
 mutate(run=>{run.receipt.legacy.after.durability++;});
 mutate(run=>{run.effects=run.effects.filter(e=>!(e.op==='transfer'&&e.resource==='item_hemp_thread'));});
 mutate(run=>{run.effects=run.effects.filter(e=>!(e.op==='transfer'&&e.resource==='coin_river'));});
 mutate(run=>{run.effects.find(e=>e.op==='transfer'&&e.resource==='coin_river').qty++;});
 mutate(run=>{run.receipt.legacy.spent.toolWear[0].after++;});
 mutate(run=>{run.effects=run.effects.filter(e=>!(e.op==='fact.set'&&e.entity==='item_sewing_needle'));});
 mutate(run=>{run.effects.push({op:'create',kind:'item'});});
});

test('A3 checks r9: native sequence exercises each child failure after successful predecessors',async()=>{
 const row=withoutPositions((await loadCorpus()).rows.find(r=>r.id==='A3V2-079')),result=(await scoreRows([row],options)).results[0];
 const branches=result.checkBranches;
 assert.deepEqual(Object.keys(branches),['success','failure:0','failure:1']);
 for(const branch of Object.values(branches))assert.equal(branch.ok,true,JSON.stringify(branch));
 assert.deepEqual(branches.success.checks.map(c=>c.success),[true,true]);
 assert.deepEqual(branches['failure:0'].checks.map(c=>c.success),[false]);
 assert.deepEqual(branches['failure:1'].checks.map(c=>c.success),[true,false]);
 const low=await executeIntent(engine,{...initial,randomSeed:branches['failure:1'].randomSeed},row);
 assert.equal(validateCheckBranch(engine,low,row,'failure',branches['failure:1'].target).ok,true);
 // A balanced committed sequence cannot smuggle a success into its failed child.
 low.receipt.steps[1].applied.push({op:'create',kind:'item'});
 low.effects.push({op:'create',kind:'item',stepIndex:1});
 assert.equal(validateCheckBranch(engine,low,row,'failure',branches['failure:1'].target).ok,false);
 const hidden=(await scoreRows([row],{...options,document:{...initial,randomSeed:branches['failure:0'].randomSeed}})).results[0];
 assert.deepEqual(Object.keys(hidden.checkBranches),['success','failure:0','failure:1']);
 assert.ok(Object.values(hidden.checkBranches).every(b=>b.ok));
});

test('A3 signature r9: clarification earns request-signature credit only with zero raw effects',async t=>{
 const row=withoutPositions((await loadCorpus()).rows.find(r=>r.id==='A3V2-086'));
 assert.ok(row.expected.signature.length);
 const result=(await scoreRows([row],options)).results[0];
 assert.equal(result.actual.clarified,true);assert.equal(result.scores.signature,true);
 assert.deepEqual(result.expected.signature,row.expected.signature);
 for(const source of [rows[0],rows[1]]){
  const wrong=(await scoreRows([{...source,expected:row.expected}],options)).results[0];
  assert.equal(wrong.scores.signature,false);
 }
 const cost={op:'transfer',from:'player|coin_river|purse',to:'sink:consume|coin_river|purse',qty:1,role:'additional_cost'};
 t.mock.method(WorldEngine.prototype,'previewAction',async()=>({receipt:{status:'not_submitted',applied:[cost],cost:{resources:[cost]},routing:{status:'needs_entities'}}}));
 const mutated=(await scoreRows([row],options)).results[0];
 assert.equal(mutated.actual.clarified,true);assert.equal(mutated.scores.signature,false);
});
test('A3 checks r8: native seed input exercises both outcomes and expected selects one signature',async()=>{
 const action=checkedAction('test:branches',[
  {op:'emit',target:'npc_hw_linsui',verb:'tell',visibility:'public',payload:{kind:'branch_success'}},
 ]),opts=branchOptions(action);
 const row={id:'both-checks',action:action.id,expected:expected(action.id,['emit(person:npc_hw_linsui)'],{constructor:true})};
 const scored=await scoreRows([row],opts),result=scored.results[0];
 assert.equal(result.scores.signature,true,JSON.stringify(result));
 assert.equal(result.scores.constructor,true,JSON.stringify(result));
 assert.equal(result.checkBranches.success.checks[0].die,20);
 assert.equal(result.checkBranches.failure.checks[0].die,1);
 assert.equal(result.checkBranches.success.ok,true);assert.equal(result.checkBranches.failure.ok,true);
 assert.equal(result.checkBranches.success.actual.committed,true);assert.equal(result.checkBranches.failure.actual.committed,true);
 assert.equal(result.actual.signatureEffects[0].payload.kind,'branch_success');
 const failed=await scoreRows([{...row,expected:expected(action.id,['emit'],{checkOutcome:'failure'})}],opts);
 assert.equal(failed.results[0].scores.signature,true,JSON.stringify(failed.results[0]));
 assert.equal(failed.results[0].actual.signatureEffects[0].payload.kind,'action_exposed');
 const wrong=await scoreRows([{...row,expected:expected(action.id,['create'])}],opts);
 assert.equal(wrong.results[0].scores.signature,false);
 const checkEngine=new WorldEngine(opts.world),failureRow={...row,id:row.id};
 const failDoc={...initial,randomSeed:result.checkBranches.failure.randomSeed};
 const run=await executeIntent(checkEngine,failDoc,failureRow);
 assert.equal(validateCheckBranch(checkEngine,run,failureRow,'failure').ok,true);
 // A branch may commit and balance its books yet grant a forbidden effect.
 run.effects.push({op:'create',kind:'item',result:{entity:'unexpected'}});
 const invalid=validateCheckBranch(checkEngine,run,failureRow,'failure');
 assert.equal(invalid.ok,false);assert.ok(invalid.issues.includes('failed action granted create'));
});

test('A3 checks r8: authored failure programs are allowed, undeclared outputs fail',async()=>{
 const success={op:'emit',target:'npc_hw_linsui',verb:'tell',visibility:'public',payload:{kind:'won'}};
 const failure={...success,target:'npc_hw_wushuo',payload:{kind:'lost'}};
 const action=checkedAction('test:authored_branches',{success:[success],failure:[failure],fumble:[failure]}),opts=branchOptions(action);
 const row={id:'authored-check',action:action.id,expected:expected(action.id,['emit(person:npc_hw_wushuo)'],{checkOutcome:'failure'})};
 const result=(await scoreRows([row],opts)).results[0];
 assert.equal(result.scores.signature,true,JSON.stringify(result));
 assert.equal(result.checkBranches.failure.ok,true);assert.equal(result.checkBranches.success.ok,true);
 const checkEngine=new WorldEngine(opts.world),run=await executeIntent(checkEngine,{...initial,randomSeed:result.checkBranches.failure.randomSeed},row);
 run.effects.push({...failure,target:'npc_hw_luqing'});
 assert.equal(validateCheckBranch(checkEngine,run,row,'failure').ok,false);
});

test('A3 checks r8: maximum dice that still fail are reported as impossible',async()=>{
 const difficulty=Math.max(...Object.values(engine.rules.check.difficulties));
 const action=checkedAction('test:impossible',[{op:'emit',verb:'tell',visibility:'public',payload:{kind:'won'}}],difficulty),opts=branchOptions(action);
 const row={id:'impossible-check',action:action.id,setup:{facts:[{path:['state','player','attributes',engine.rules.attributes[0]],value:1}]},expected:expected(action.id,['emit'])};
 const result=(await scoreRows([row],opts)).results[0];
 assert.equal(result.checkBranches.success.checks[0].die,20);
 assert.equal(result.checkBranches.success.impossible,true,JSON.stringify(result));
 assert.equal(result.scores.signature,false);assert.equal(result.scores.supported,false);
 assert.equal(result.checkBranches.failure.ok,true);
});

test('A3 checks r8: derived XP has native consequence evidence; an unlisted XP primitive still fails',async()=>{
 const row=v2Row('021'),result=(await scoreRows([row],options)).results[0];
 assert.equal(result.checkBranches.success.ok,true,JSON.stringify(result.checkBranches.success));
 assert.equal(result.checkBranches.failure.ok,true,JSON.stringify(result.checkBranches.failure));
 // 06 §6.3 / §6.10.3: progression owns XP; fact.set(xp) is forbidden.
 // The adapter now reports its real reward as a consequence, not a proposal
 // primitive. Keep the scorer's independent rejection of an extra XP effect.
 assert.equal(result.scores.signature,true);
 const high=await executeIntent(engine,{...initial,randomSeed:result.checkBranches.success.randomSeed},row);
 const growth=high.receipt.consequences.find(c=>c.type==='progression'&&c.field==='xp');
 assert.ok(growth);assert.equal(growth.result.after,high.document.state.player.xp);
 assert.ok(growth.awards.some(a=>a.eventId===high.receipt.eventId));
 assert.ok(!high.effects.some(e=>e.op==='fact.set'&&e.field==='xp'));
 const injected=[...high.effects,{op:'fact.set',entity:'player',field:'xp',value:high.document.state.player.xp,role:'progression'}];
 assert.equal(signatureMatches(row.expected.signature,injected,high.receipt,high.requested),false);
 const withoutXP=injected.filter(e=>!(e.op==='fact.set'&&e.field==='xp'));
 assert.equal(signatureMatches(row.expected.signature,withoutXP,high.receipt,high.requested),true);
 const low=await executeIntent(engine,{...initial,randomSeed:result.checkBranches.failure.randomSeed},row);
 low.effects.push({op:'create',kind:'item'});
 assert.equal(validateCheckBranch(engine,low,row,'failure').ok,false);
});

test('A3 checks r8: a failed paid lesson keeps its fee and grants no knowledge',async()=>{
 const row=v2Row('012'),result=(await scoreRows([row],options)).results[0];
 assert.equal(result.checkBranches.failure.ok,true,JSON.stringify(result.checkBranches.failure));
 const low=await executeIntent(engine,{...initial,randomSeed:result.checkBranches.failure.randomSeed},row);
 // 06 §6.7: confirming the original proposal preserves its explicitly requested
 // payment. A failed lesson still pays the same native fee, with no knowledge.
 assert.ok(low.effects.some(e=>e.op==='transfer'&&e.role==='requested_consumption'&&e.qty===4));
 assert.equal(low.document.state.recipes.recipe_wooden_pegs,undefined);
 // applyPatches shares unchanged branches; inject into a separate after-state.
 low.document=structuredClone(low.document);
 low.document.state.recipes.recipe_wooden_pegs={learnedAt:low.document.state.minute};
 const invalid=validateCheckBranch(engine,low,row,'failure');
 assert.equal(invalid.ok,false);assert.ok(invalid.issues.includes('failed learning granted knowledge'));
});
test('A3 constructor scorer: credit comes from the model-free form, never from the corpus proposal',async()=>{
 // 标杆 B07.4 / review 10-22 P1: the intent text is the form's catalog search;
 // slots take only offered options. The row has no proposal at all.
 const before=structuredClone(initial);
 const greet={id:'ctor-greet',intent:'向林穗打个招呼，寒暄两句',expected:expected('core:dialogue.greet',['emit(person:npc_hw_linsui,greet)'])};
 const scored=await scoreRows([greet],options),result=scored.results[0];
 assert.equal(result.actual.error.code,'A3-SCORE-INPUT');
 assert.equal(result.scores.constructor,true,JSON.stringify(result.constructorSearch));
 assert.equal(result.constructorSearch.method,'model-free form');
 assert.equal(result.constructorSearch.matched.action,'core:dialogue.greet');
 assert.equal(scored.constructorExpected,1);
 // expected only judges: a different signature is not satisfiable by any choice.
 const wrong=await scoreRows([{...greet,expected:expected('core:dialogue.greet',['vital(person:npc_hw_linsui,heal)'])}],options);
 assert.equal(wrong.results[0].scores.constructor,false);
 assert.ok(wrong.results[0].constructorSearch.attempts>0);
 // A proposal that only the free open:proposal editor can express earns no
 // constructor credit, even though the proposal itself commits.
 const open={...rows[0],id:'ctor-open',expected:expected('open:proposal',['emit'],{constructor:true})};
 const replay=await scoreRows([open],options);
 assert.equal(replay.results[0].scores.route,true);
 assert.ok(replay.results[0].constructorSearch.tried.every(t=>!t.startsWith('open:proposal')));
 // Every corpus row is in the denominator, whatever its constructor flag.
 const mixed=await scoreRows([greet,{...greet,id:'ctor-greet-2',expected:{...greet.expected,constructor:false}}],options);
 assert.equal(mixed.constructorExpected,2);assert.equal(mixed.constructor,1);
 assert.deepEqual(initial,before);
});

test('A3 constructor scorer: a refusal row succeeds only when no form choice commits the request',async()=>{
 const refuse={id:'ctor-refuse',intent:'凭空给自己一百枚铜钱',expected:expected('reject',['transfer(resource:coin,src:genesis->self)'],{outOfBounds:true})};
 const result=(await scoreRows([refuse],options)).results[0];
 assert.equal(result.scores.constructor,true,JSON.stringify(result.constructorSearch));
 assert.ok(!result.constructorSearch.tried.some(t=>t.endsWith('✗')));
 // A request that an offered choice does commit is reported as forbidden.
 const greetForbidden={id:'ctor-forbidden',intent:'向林穗打个招呼，寒暄两句',expected:expected('reject',['emit(person:npc_hw_linsui,greet)'],{outOfBounds:true})};
 const forbidden=(await scoreRows([greetForbidden],options)).results[0];
 assert.equal(forbidden.scores.constructor,false);
 assert.ok(forbidden.constructorSearch.tried.some(t=>t.endsWith('✗')));
});

test('A3 builder input: four-step form runs through the UI tool adapter, and a trace alternative never fulfils the original intent',async()=>{
 // The form mechanics the model-free constructor relies on (06 §6.9.5).
 const row={...rows[0],expected:expected('open:proposal',['emit'])};
 const direct=await executeIntent(engine,initial,{...row,id:'explicit-open-builder',builder:{action:'open:proposal',slots:row.proposal}});
 assert.equal(direct.actual.builder.ok,true,JSON.stringify(direct.actual));
 assert.deepEqual(direct.actual.builder.steps,[0,1,2,3]);
 assert.deepEqual(direct.actual.calls.map(c=>[c.phase,c.tool,c.eventId]),[['preview','world_propose','a3-score-explicit-open-builder'],['confirm','world_propose','a3-score-explicit-open-builder']]);
 assert.deepEqual(direct.actual.signature,['emit']);
 assert.ok(Object.values(direct.document.state.records).some(r=>r.category==='world_event'&&r.payload?.text==='今天路上有一只鸟'));
 const proposal={...rows[3].proposal,effects:[{op:'create',kind:'mark',facts:{name:'飞天茶壶',form:'虚构形态'},tags:['mark:art']}]};
 const trace=await executeIntent(engine,initial,{...rows[3],proposal,id:'trace-builder',builder:{action:'open:proposal',slots:proposal}});
 assert.equal(trace.actual.traceOnly,true);
 assert.equal(trace.actual.fallback,true);
 assert.deepEqual(trace.actual.calls.map(c=>[c.phase,c.tool]),[['preview','world_propose'],['preview','world_act'],['confirm','world_act']]);
 assert.ok(world.openActionRules.mark.forms.includes(trace.document.state.created[trace.actual.entity].form));
 const mark=trace.effects.find(e=>e.op==='create'&&e.kind==='mark');
 assert.deepEqual(Object.keys(mark.facts).sort(),['form','intent']);
 assert.equal(mark.facts.intent,proposal.intent);
});

test('A3 signature: adopted effects exclude only receipt-proven derived resource costs',async()=>{
 const requested={op:'emit',actor:'player',verb:'tell',visibility:'public',payload:{text:'hello'}};
 // 06 §6.7 / round 8: only receipt-labelled additional costs may be omitted.
 const cost={op:'transfer',from:'player|item_charcoal|inventory',to:'sink:consume|item_charcoal|action',qty:1,role:'additional_cost'};
 const receipt={status:'committed',source:{id:'open:proposal'},actor:'player',applied:[{index:0,...cost,result:{transferred:1}},{index:1,...requested}],cost:{time:5,body:{stamina:{value:98}},resources:[cost]}};
 assert.equal(signatureMatches(['emit(person:self,tell)'],receipt.applied,receipt),true);
 assert.deepEqual(signatureEffects(receipt.applied,receipt).excluded,[receipt.applied[0]]);
 // No provenance means no exclusion, even for a plausible material sink.
 assert.equal(signatureMatches(['emit'],receipt.applied),false);
 const explicitConsumption=[requested,{op:'transfer',resource:'item_charcoal',from:'self',to:'sink:consume',qty:1}];
 assert.equal(signatureMatches(['emit','transfer(resource:item_charcoal,self->sink:consume)'],receipt.applied,receipt,explicitConsumption),true);
 assert.equal(signatureMatches(['emit'],receipt.applied,receipt,explicitConsumption),false);
 assert.equal(signatureMatches(['emit'],[...receipt.applied,{...cost}],receipt),false);
 // Authority evidence is unrelated to cost provenance.
 assert.equal(signatureMatches(['emit'],[requested,{op:'vital',target:'player',delta:-1,actedAs:{kind:'office',id:'test'}}]),false);
 // A wrong requested primitive must survive filtering and fail exact equality.
 assert.equal(signatureMatches(['emit'],[...receipt.applied,{op:'status',target:'player',status:'fear'}],receipt),false);
 const mock={previewAction:async()=>({receipt:{status:'preview'}}),reduce:async()=>({patches:[],result:{receipt}})};
 const run=await executeIntent(mock,initial,{id:'cost-provenance',proposal:{intent:'hello',effects:[requested]}});
 assert.deepEqual(run.actual.signature,['emit']);assert.equal(run.actual.excludedCosts.length,1);
 assert.equal(signatureMatches(['emit'],run.effects,run.receipt),true);
});
test('A3 signature: qualifiers belong to the same adopted primitive, never prose or authority',()=>{
 const effects=[{op:'emit',target:'npc_hw_linsui',signatureKind:'person',verb:'tell',payload:{text:'npc_hw_wushuo greet'}},{op:'status',target:'player',status:'fear'}];
 assert.equal(signatureMatches(['emit(person:npc_hw_linsui,tell)','status(person:self,fear)'],effects),true);
 assert.equal(signatureMatches(['emit(person:npc_hw_wushuo,tell)','status'],effects),false);
 // Review 10-22 P0 (06 §6.7): description words are structured evidence, not
 // ignorable prose. greet must be the adopted verb; prose mentioning greet is not.
 assert.equal(signatureMatches(['emit(person:npc_hw_linsui,greet)','status'],effects),false);
 assert.equal(signatureMatches(['emit(person:npc_hw_linsui,greet)','status'],[{...effects[0],verb:'greet'},effects[1]]),true);
 assert.equal(signatureMatches(['emit(person:self,tell)','status'],effects),false);
 // Type labels are checked against the referenced entity: an NPC is a person.
 assert.equal(signatureMatches(['emit(thing:npc_hw_linsui,tell)','status'],effects),false);
 // An unrecognised descriptor never matches; fear is a status, not an emit word.
 assert.equal(signatureMatches(['emit(person:npc_hw_linsui,fear)','status'],effects),false);
 assert.equal(signatureMatches(['emit(person:npc_hw_linsui,tell)','status(person:self,fear)'],[effects[0],{...effects[1],status:'calm'}]),false);
 assert.equal(signatureMatches(['create(thing:mark,mark:warning+mark:art)'],[{op:'create',kind:'mark',tags:['mark:warning','mark:art']}]),true);
 // Every listed mark tag must be on the created mark.
 assert.equal(signatureMatches(['create(thing:mark,mark:warning+mark:art)'],[{op:'create',kind:'mark',tags:['mark:warning']}]),false);
});
test('A3 signature v2: real references, initiator and direction are machine checked',()=>{
 const effect={op:'transfer',resource:'coin_river',from:'player|coin_river|purse',to:'npc_hw_linsui|coin_river|purse',qty:30};
 const signature=['transfer(resource:coin,self->npc_hw_linsui)'];
 assert.equal(signatureMatches(signature,[effect]),true);
 assert.equal(signatureMatches(signature,[{...effect,to:'npc_hw_wushuo|coin_river|purse'}]),false);
 assert.equal(signatureMatches(signature,[{...effect,from:effect.to,to:effect.from}]),false);
 assert.equal(signatureMatches(['transfer(resource:item_bread,self->npc_hw_linsui)'],[effect]),false);
 // Review 10-22 P0: a trailing quantity is the exact committed quantity.
 assert.equal(signatureMatches(['transfer(resource:coin,self->npc_hw_linsui:30)'],[effect]),true);
 assert.equal(signatureMatches(['transfer(resource:coin,self->npc_hw_linsui:30)'],[{...effect,qty:999}]),false);
 assert.equal(signatureMatches(['transfer(resource:coin,self->npc_hw_linsui:30_or_so)'],[effect]),false);
 const emit={op:'emit',target:'npc_hw_xuling',verb:'request',payload:{kind:'different_description'}};
 assert.equal(signatureMatches(['emit(person:npc_hw_xuling,request:teach_spell_light)'],[emit]),false);
 // request:teach_spell_light = the request kind teach about the registered spell.
 assert.equal(signatureMatches(['emit(person:npc_hw_xuling,request:teach_spell_light)'],[{...emit,payload:{kind:'teach',terms:{subject:'spell_light'}}}]),true);
 assert.equal(signatureMatches(['emit(person:npc_hw_xuling,request:teach_spell_light)'],[{...emit,payload:{kind:'teach',terms:{subject:'spell_fire_01'}}}]),false);
 assert.equal(signatureMatches(['emit(person:npc_hw_xuling,request:teach_spell_light)'],[{...emit,verb:'tell',payload:{kind:'teach',terms:{subject:'spell_light'}}}]),false);
 // Unrecognised descriptions are not ignored.
 assert.equal(signatureMatches(['emit(person:npc_hw_xuling,other_description)'],[emit]),false);
 assert.equal(signatureMatches(['emit(person:npc_hw_xuling,request:spell_light)'],[emit]),false);
 assert.equal(signatureMatches(['emit(person:npc_hw_xuling,request:spell_light)'],[{...emit,payload:{spell:'spell_light'}}]),true);
 assert.equal(signatureMatches(['emit(person:npc_hw_xuling,request:spell_light)'],[emit,{op:'emit',payload:{spell:'spell_light'}}]),false);
 assert.equal(signatureMatches(['emit(person:npc_hw_xuling)'],[{op:'emit',payload:{text:'npc_hw_xuling'},actedAs:{id:'npc_hw_xuling'},result:{target:'npc_hw_xuling'}}]),false);
 assert.equal(signatureMatches(['emit(person:self)'],[{op:'emit',actor:'npc_hw_xuling'}],{actor:'npc_hw_xuling'}),true);
 assert.equal(signatureMatches(['emit(person:self)'],[{op:'emit',target:'npc_hw_linsui'}],{actor:'npc_hw_xuling'}),false);
 assert.equal(signatureMatches(['emit(person:self)'],[{op:'emit',actor:'player'}],{actor:'npc_hw_xuling'}),false);
 // Embedded book_/teacher_ IDs are the native learning source and mode.
 const taught={op:'learn',target:'player',subject:'skill_literacy',mode:'teacher',learningSource:'npc_hw_luqing'};
 assert.equal(signatureMatches(['learn(person:self,teacher_npc_hw_luqing)'],[taught]),true);
 assert.equal(signatureMatches(['learn(person:self,teacher_npc_hw_luqing)'],[{...taught,learningSource:'npc_hw_ayan'}]),false);
 assert.equal(signatureMatches(['learn(person:self,teacher_npc_hw_luqing)'],[{...taught,mode:'book'}]),false);
 assert.equal(signatureMatches(['transfer(resource:item_wood_shavings)'],[{op:'transfer',resource:'item_wood_shavings'}]),true);
 assert.equal(signatureMatches(['transfer(resource:item_wood_shavings)'],[{op:'transfer',resource:'item_wood'}]),false);
 // Sign words: heal needs a positive delta, harm a negative one.
 const vital={op:'vital',target:'npc_hw_linsui',need:'hp',type:'heal',delta:5};
 assert.equal(signatureMatches(['vital(person:npc_hw_linsui,heal)'],[vital]),true);
 assert.equal(signatureMatches(['vital(person:npc_hw_linsui,heal)'],[{...vital,type:'harm',delta:-5}]),false);
 assert.equal(signatureMatches(['vital(person:npc_hw_linsui,harm)'],[{...vital,type:'harm',delta:-5}]),true);
 assert.equal(signatureMatches(['vital(person:npc_hw_linsui,harm:staff)'],[{...vital,type:'harm',delta:-5,weapon:'item_staff'}]),true);
 assert.equal(signatureMatches(['vital(person:npc_hw_linsui,harm:staff)'],[{...vital,type:'harm',delta:-5,weapon:'item_whittling_knife'}]),false);
 // Direction words: fear:reduce needs the native status to weaken.
 const fear={op:'status',target:'player',status:'fear',removed:true,result:{before:{power:1},after:null}};
 assert.equal(signatureMatches(['status(person:self,fear:reduce)'],[fear]),true);
 assert.equal(signatureMatches(['status(person:self,fear:reduce)'],[{...fear,removed:false,result:{before:{power:1},after:{power:2}}}]),false);
 assert.equal(signatureMatches(['status(person:self,fear)'],[fear]),false);
 // Settlement amounts and completion are read from the native obligation.
 const settle={op:'obligation.settle',id:'o1',obligationKind:'deposit',debtor:'bank_hw_post',creditor:'player',from:'bank_hw_post',to:'player',amount:50,result:{before:{amount:100,paid:0},after:{amount:100,paid:50}}};
 assert.equal(signatureMatches(['obligation.settle(obligation:own_deposit,partial:50)'],[settle]),true);
 assert.equal(signatureMatches(['obligation.settle(obligation:own_deposit,partial:50)'],[{...settle,amount:999}]),false);
 assert.equal(signatureMatches(['obligation.settle(obligation:own_deposit,full)'],[settle]),false);
 assert.equal(signatureMatches(['obligation.settle(obligation:own_loan,partial:50)'],[settle]),false);
});
test('A3 signature: real registered action pays derived costs without adding them to the requested signature',async()=>{
 const action={id:'test:score_cost',label:'说一句话',narration:'test.score_cost',slots:[],cost:{owner:'primitives',time:1,resources:[{resource:'coin_river',qty:1}]},outcomes:[{op:'emit',actor:'player',verb:'tell',visibility:'public',payload:{text:'hello'}}]};
 const costWorld=structuredClone(world);costWorld.actionDefinitions={format:1,actions:[action]};
 const costEngine=new WorldEngine(costWorld);
 const row={id:'real-cost',action:action.id,setup:{coins:5},expected:expected(action.id,['emit(person:self,tell)'])};
 const run=await executeIntent(costEngine,initial,row);
 assert.equal(run.receipt.status,'committed');
 assert.deepEqual(run.receipt.applied.map(e=>e.op),['transfer','emit']);
 assert.equal(run.receipt.cost.resources.length,1);assert.equal(run.receipt.cost.time,1);
 assert.equal(run.document.state.player.coins,4);
 assert.equal(signatureMatches(row.expected.signature,run.effects,run.receipt),true);
 assert.deepEqual(run.actual.signature,['emit']);
 const scored=await scoreRows([row],{...options,world:costWorld});
 assert.equal(scored.results[0].scores.signature,true);
});
test('A3 setup: two independent scenes execute the two-phase protocol with balanced opening books',async()=>{
 // The witness is awake at the starting shop; each scene places it with the
 // native location writer.
 const baseline=structuredClone(initial),awake=structuredClone(initial);
 const locations=world.locations.filter(l=>l.id!==initial.state.location).slice(0,2).map(l=>l.id);
 assert.equal(locations.length,2);
 const setups=locations.map((location,i)=>({location,present:['npc_hw_linsui'],inventory:{item_ration:i+2},coins:41+i,minute:initial.state.minute+10+i,status:'正常',facts:[{path:['state','player','hp'],value:initial.state.player.maxHp-1}]}));
 const cases=[{...rows[0],id:'setup-say',setup:setups[0]},{...rows[5],id:'setup-mark',setup:setups[1]}];
 const scored=await scoreRows(cases,{...options,document:awake});
 assert.equal(scored.setupUnmetCount,0);assert.deepEqual(scored.setupUnmet,[]);
 for(const [i,row] of cases.entries()){
  const result=scored.results[i],run=await executeIntent(engine,awake,row);
  assert.equal(result.scores.route,true,JSON.stringify(result));
  assert.equal(result.scores.signature,true,JSON.stringify(result));
  assert.equal(result.scores.supported,true,JSON.stringify(result));
  assert.equal(result.actual.preview.status,'preview');
  assert.equal(result.actual.calls[0].phase,'preview');assert.equal(result.actual.calls.at(-1).phase,'confirm');
  assert.equal(run.document.state.location,setups[i].location);
  assert.equal(run.document.state.npcs.npc_hw_linsui.location,setups[i].location);
  // Presence places the witness but never rewrites its status (02 I3).
  assert.equal(run.document.state.npcs.npc_hw_linsui.status,awake.state.npcs.npc_hw_linsui.status);
  assert.equal(run.document.state.npcs.npc_hw_linsui.scheduleTravel,null);
  assert.equal(run.document.state.inventory.item_ration.quantity,i+2);
  assert.equal(run.document.state.player.coins,41+i);
  assert.equal(run.document.state.player.hp,initial.state.player.maxHp-1);
  assert.equal(run.document.ledger.accounts['player|coin_river|purse'],41+i);
  assert.equal(run.document.ledger.accounts['player|item_ration|inventory'],i+2);
  assert.deepEqual(reconcile(engine,run.document),{mismatches:[],lots:[],drift:[],audit:[]});
  const fixture=applyIntentSetup(engine,awake,setups[i]);
  assert.equal(fixture.document.state.minute,setups[i].minute);
 }
 assert.deepEqual(initial,baseline);
 // 02 I3/I16, review 10-22 P1: presence is verified, never written. A
 // comatose, sleeping or travelling witness stays so and the scene is unmet.
 const asleep=structuredClone(initial);
 asleep.state.npcs.npc_hw_linsui.activity='睡眠';
 asleep.state.npcs.npc_hw_linsui.status='昏迷';
 const kept=applyIntentSetup(engine,asleep,setups[0]);
 assert.ok(kept.setupUnmet.some(x=>x.item.startsWith('present')),JSON.stringify(kept.setupUnmet));
 assert.equal(kept.document.state.npcs.npc_hw_linsui.status,'昏迷');
 assert.equal(kept.document.state.npcs.npc_hw_linsui.activity,'睡眠');
 const travelling=structuredClone(initial);
 travelling.state.npcs.npc_hw_linsui.scheduleTravel={to:'loc_hw'};
 const away=applyIntentSetup(engine,travelling,setups[0]);
 assert.ok(away.setupUnmet.some(x=>x.item==='present[0]'),JSON.stringify(away.setupUnmet));
 assert.deepEqual(away.document.state.npcs.npc_hw_linsui.scheduleTravel,{to:'loc_hw'});
 const unmet=await scoreRows([cases[0]],{...options,document:asleep});
 assert.equal(unmet.setupUnmetCount,1);assert.equal(unmet.results[0].scores.signature,false);
 assert.equal(asleep.state.npcs.npc_hw_linsui.status,'昏迷');
 // The builder replay must receive the same setup as the initial execution.
 const built=await scoreRows([{...rows[4],setup:setups[0]}],{...options,document:awake});
 assert.equal(built.results[0].scores.constructor,true,JSON.stringify(built.results[0]));
});

test('A3 setup: unmet items are reported separately and earn no credit, even empty signatures',async()=>{
 const row={...rows[0],id:'setup-missing',setup:{location:'missing:place',present:['missing:person'],inventory:{missing_item:1},coins:-1,minute:-1,status:{missing_actor:'正常'},facts:[{path:['state','player','invented'],value:true}]}},before=structuredClone(initial);
 const failed=await scoreRows([row],options),result=failed.results[0];
 assert.equal(failed.setupUnmetCount,1);assert.equal(failed.setupUnmet[0].id,row.id);
 for(const key of ['location','present[0]','inventory.missing_item','coins','minute','status.missing_actor','facts[0]'])assert.ok(result.setupUnmet.some(x=>x.item===key),key);
 assert.ok(Object.values(result.scores).every(x=>x===false));
 assert.deepEqual(result.actual.calls,[]);assert.equal(result.actual.preview,null);
 assert.equal(result.actual.error.code,'A3-SCORE-SETUP');assert.deepEqual(initial,before);
 const empty=await scoreRows([{...rows[2],setup:{location:'missing:place'}}],options);
 assert.equal(empty.signature,0);assert.equal(empty.route,0);
});

test('A3 setup: existing creature instances and native special statuses are real state',()=>{
 const baseline=structuredClone(initial);
 baseline.state.creatures={test_creature:{name:'fixture creature',species:world.monsters[0].id,location:initial.state.location,hp:20,maxHp:20,status:'正常',activity:'闲逛'}};
 const setup={location:world.locations.find(l=>l.id!==initial.state.location).id,present:['test_creature'],minute:initial.state.minute+30,status:[{target:'player',status:'fear',power:2,duration:60}]};
 const built=applyIntentSetup(engine,baseline,setup);
 assert.deepEqual(built.setupUnmet,[]);
 assert.equal(built.document.state.creatures.test_creature.location,setup.location);
 assert.equal(built.document.state.creatures.test_creature.activity,'闲逛');
 assert.equal(magicStatusStats(engine.primitiveDraft(built.document),'player').hit,-0.04);
 assert.equal(built.document.state.effects['a3-score:setup-status:0'].expires,setup.minute+60);
 assert.equal(baseline.state.creatures.test_creature.location,initial.state.location);
 // 02 I3/I16, review 10-22 P1: a sleeping creature is not woken by presence.
 const sleeping=structuredClone(baseline);sleeping.state.creatures.test_creature.activity='睡眠';
 const kept=applyIntentSetup(engine,sleeping,setup);
 assert.ok(kept.setupUnmet.some(x=>x.item==='present.test_creature'),JSON.stringify(kept.setupUnmet));
 assert.equal(kept.document.state.creatures.test_creature.activity,'睡眠');
 const bad=applyIntentSetup(engine,baseline,{status:[{target:'player',status:'invented',power:2,duration:60}]});
 assert.equal(bad.setupUnmet[0].item,'status[0]');
});

test('A3 setup r7: all seven declared scenes open native entities, holdings and status without changing the source',()=>{
 const before=structuredClone(initial),catalog=structuredClone(world.factionPeople);
 for(const id of ['009','057','070','089','090','091','106']){
  // 057/090/091 offices are narrowed instances of the test-local charter.
  const result=applyIntentSetup(charterEngine,initial,v2Row(id).setup);
  assert.deepEqual(result.setupUnmet,[],id);
  assert.deepEqual(auditHoldings(engine.primitiveDraft(result.document)),[],id);
  assert.deepEqual(reconcile(engine,result.document),{mismatches:[],lots:[],drift:[],audit:[]},id);
 }
 assert.deepEqual(initial,before);assert.deepEqual(world.factionPeople,catalog);
});

test('A3 setup r7: existing pet uses its species body and native ownership books without withdrawing wildlife',()=>{
 const {document,bindings}=applyIntentSetup(engine,initial,v2Row('009').setup),d=engine.primitiveDraft(document),id='a3v2_009_goat';
 const pet=document.state.creatures[id],species=world.monsters.find(m=>m.id===pet.species);
 assert.equal(pet.species,'monster_bent_horn_goat');assert.equal(pet.level,species.levelRange[0]);
 assert.ok(pet.hp>0);assert.equal(pet.hp,pet.maxHp);assert.equal(pet.care.hunger,80);assert.equal(pet.care.bond,30);
 assert.equal(pet.owner,'player');assert.equal(document.state.pets[id].following,true);
 assert.equal(document.state.created[id].monster,species.id);
 for(const kind of ['owns','tamed_by'])assert.equal(aliveHoldings(d,{kind,holder:'player',subject:id}).length,1);
 assert.equal(d.get('holdings','rows',bindings.a3v2_009_owns,'terms','share'),1);
 assert.deepEqual(Object.fromEntries(Object.entries(document.state.records).filter(([,r])=>r.category==='ecology')),Object.fromEntries(Object.entries(initial.state.records).filter(([,r])=>r.category==='ecology')));
 assert.equal(document.state.inventory.item_oats.quantity,1);
});

test('A3 setup r7: office license aliases bind to native rows and fear stays a finite, non-incapacitating effect',()=>{
 const office=applyIntentSetup(charterEngine,initial,v2Row('057').setup),id=office.bindings.a3v2_057_arrest_office;
 assert.equal(office.document.holdings.entities[id].kind,'office');
 assert.equal(office.document.holdings.entities[id].facts.onDuty,true);
 assert.deepEqual(office.document.holdings.entities[id].facts.authority,v2Row('057').setup.instances[0].authority);
 assert.equal(office.document.holdings.rows[office.bindings.a3v2_057_holds_office].subject,id);
 assert.equal(office.document.state.npcs.npc_bs_032_1.location,'bld_bs_watch');
 assert.equal(office.document.state.player.onDuty,undefined);
 const {document}=applyIntentSetup(engine,initial,v2Row('070').setup),effects=Object.values(document.state.effects).filter(e=>e.status==='fear');
 assert.equal(effects.length,1);assert.equal(effects[0].power,1);assert.equal(effects[0].expires,630);
 assert.equal(capacity({engine,document},'player','cast').level,'full');
 assert.equal(magicStatusStats(engine.primitiveDraft(document),'player').hit,-0.02);
});

test('A3 setup r7: native custody keeps conversation and capacity while preventing ordinary departure',()=>{
 for(const id of ['089','090','091']){
  const {document}=applyIntentSetup(engine,initial,v2Row(id).setup),context={engine,document},d=engine.primitiveDraft(document);
  const custody=aliveHoldings(d,{kind:'guest_of',holder:'player'}).filter(h=>h.variant==='detained');
  assert.equal(custody.length,1,id);assert.equal(custody[0].subject,'loc_bs');
  assert.equal(capacity(context,'player','talk').level,'full');assert.equal(canAct(context,'player','talk').allowed,true);
  assert.equal(canAct(context,'player','move',{to:'loc_bs_nanshi'}).allowed,false);
  assert.equal(canAct(context,'player','holding.close',{closing:{holding:custody[0].id,reason:'escaped'}}).allowed,false);
  assert.equal(document.state.player.confined,undefined);
 }
 const {document}=applyIntentSetup(engine,initial,v2Row('106').setup),shares=aliveHoldings(engine.primitiveDraft(document),{kind:'share',subject:'faction_saltboat'});
 assert.equal(document.state.npcs.npc_w5_saltboat_leader.location,'bld_bs_guild');
 assert.equal(document.state.created.npc_w5_saltboat_leader.age,48);
 assert.deepEqual(shares.map(h=>[h.holder,h.terms.share]).sort(),[['npc_w5_saltboat_leader',0.9],['player',0.1]]);
});

test('A3 setup r7: unknown structure and native share violations remain unmet, never narrative success',()=>{
 const unknown=applyIntentSetup(engine,initial,{status:{player:{confined:true,fear:{magnitude:1,remainingMinutes:30,extra:true},onDuty:true}},holdings:[{id:'bad_regime',kind:'guest_of',holder:'player',subject:'loc_bs',terms:{mode:'detained',regime:'unknown'}}],instances:[{id:'unknown_creature',kind:'creature',template:'agent',species:'unknown',location:'loc_hw_fields'}]});
 for(const item of ['status.player.confined','status.player.fear','status.player.onDuty','holdings[0]','instances[0]'])assert.ok(unknown.setupUnmet.some(r=>r.item===item),item);
 const setup=structuredClone(v2Row('106').setup);setup.holdings[1].terms.share=1;
 const badShares=applyIntentSetup(engine,initial,setup);
 assert.ok(badShares.setupUnmet.some(r=>r.item==='holdings[1]'));
 assert.equal(aliveHoldings(engine.primitiveDraft(badShares.document),{kind:'share',subject:'faction_saltboat'}).reduce((n,r)=>n+r.terms.share,0),0.1);
 assert.equal(badShares.document.state.created.unknown_creature,undefined);
});

test('A3 setup: abilities populate native player knowledge and certification consumers',async()=>{
 const before=engine.createCharacter(seed,{},'setup-abilities'),snapshot=structuredClone(before);
 const skill=world.skills.find(row=>world.professions.some(p=>p.id===row.profession&&p.kind==='life'));
 const spell=world.spells.find(row=>row.id==='spell_light'),recipe=world.recipes[0];
 const abilities={skills:{[skill.id]:450,[spell.skill]:125},spells:[spell.id],recipes:[recipe.id],literacy:100,licenses:[skill.profession]};
 const built=applyIntentSetup(engine,before,{abilities});
 assert.deepEqual(built.setupUnmet,[]);
 const state=built.document.state;
 assert.equal(knowledgeProficiency(engine,state,'player',skill.id),450);
 assert.equal(effectiveProficiency(engine.primitiveDraft(built.document),engine,skill.id),450);
 assert.equal(knowledgeProficiency(engine,state,'player','skill_literacy'),100);
 assert.equal(knowsKnowledge(engine,state,'player',spell.id),true);
 assert.equal(knowsKnowledge(engine,state,'player',recipe.id),true);
 assert.equal(state.skills[spell.skill].proficiency,125);
 assert.ok(state.skills[recipe.skill]);assert.deepEqual(state.skills[skill.id].daily,{});
 assert.deepEqual(state.skills[skill.id].breakthroughs,[]);
 assert.equal(state.spells[spell.id].learnedAt,state.minute);
 assert.equal(state.professions.life.includes(skill.profession),true);
 assert.ok(Object.values(built.document.holdings.rows).some(edge=>edge.kind==='certified'&&edge.holder==='player'&&edge.subject===`office_cert:${skill.profession}`));
 const cast=await engine.reduce(built.document,{tool:'world_cast',args:{spell:spell.id,target:'item_staff'},eventId:'setup-known-spell'});
 assert.equal(cast.result.spell,spell.id);
 assert.equal(cast.patches.find(p=>p.path.join('.')==='state.player.mp').value,state.player.mp-spell.mp);
 const projected=applyIntentSetup(engine,built.document,{abilities:{skills:{[skill.id]:600},licenses:[skill.profession]}});
 assert.deepEqual(projected.setupUnmet,[]);
 assert.equal(effectiveProficiency(engine.primitiveDraft(projected.document),engine,skill.id),600);
 const license=Object.values(projected.document.holdings.rows).filter(edge=>edge.kind==='certified'&&edge.holder==='player'&&edge.subject===`office_cert:${skill.profession}`&&edge.until===undefined);
 assert.equal(license.length,1);
 assert.deepEqual(applyIntentSetup(engine,projected.document,{abilities:{licenses:[license[0].id]}}).setupUnmet,[]);
 const closed=structuredClone(projected.document);closed.holdings.rows[license[0].id].until=closed.state.minute;
 assert.ok(applyIntentSetup(engine,closed,{abilities:{licenses:[license[0].id]}}).setupUnmet.some(x=>x.item==='abilities.licenses[0]'));
 const scored=await scoreRows([{...rows[0],setup:{abilities}}],{...options,document:before});
 assert.equal(scored.setupUnmetCount,0);assert.equal(scored.results[0].scores.supported,true);
 assert.deepEqual(before,snapshot);
 const readable=applyIntentSetup(engine,before,{abilities:{literacy:true}});
 assert.equal(readable.document.state.skills.skill_literacy.proficiency,engine.rules.books.minimumLiteracy);
 const illiterate=applyIntentSetup(engine,readable.document,{abilities:{literacy:false}});
 assert.equal(illiterate.document.state.skills.skill_literacy.proficiency,0);
 assert.equal(knowsKnowledge(engine,illiterate.document.state,'player',spell.id),false);
});

test('A3 setup: invalid abilities are setupUnmet and cannot earn rejection credit',async()=>{
 const abilities={skills:{missing_skill:5,skill_literacy:2700},spells:['missing_spell'],recipes:['missing_recipe'],literacy:-1,licenses:['missing_license'],invented:true};
 const row={...rows[1],setup:{abilities},expected:{...rows[1].expected,signature:['transfer(resource:coin,self)']}};
 const result=(await scoreRows([row],options)).results[0];
 for(const key of ['skills.missing_skill','skills.skill_literacy','spells[0]','recipes[0]','literacy','licenses[0]','invented'])assert.ok(result.setupUnmet.some(x=>x.item===`abilities.${key}`),key);
 assert.ok(Object.values(result.scores).every(value=>value===false));assert.deepEqual(result.actual.calls,[]);
 const malformed=applyIntentSetup(engine,initial,{abilities:{skills:[],spells:{},recipes:'recipe',licenses:null}});
 for(const key of ['skills','spells','recipes','licenses'])assert.ok(malformed.setupUnmet.some(x=>x.item===`abilities.${key}`),key);
 assert.equal(applyIntentSetup(engine,initial,{abilities:null}).setupUnmet[0].item,'abilities');
});

test('A3 rejection signature: request descriptions earn credit only for actual refusal with zero applied effects',async t=>{
 const rejected={...rows[1],expected:{...rows[1].expected,signature:['transfer(resource:coin,self)']}};
 const variants=[rejected,{...rejected,expected:{...rejected.expected,outOfBounds:false}}];
 const report=await scoreRows(variants,options);
 for(const result of report.results){assert.equal(result.actual.refused,true);assert.equal(result.scores.signature,true);assert.deepEqual(result.expected.signature,rejected.expected.signature);}
 // Out of bounds with a concrete route is a bounded outcome (06 §6.7): a
 // refusal there neither earns signature credit nor counts as supported.
 const bounded=await scoreRows([{...rejected,expected:{...rejected.expected,route:'open:proposal'}}],options);
 assert.equal(bounded.results[0].actual.refused,true);assert.equal(bounded.results[0].bounded,true);
 assert.equal(bounded.results[0].scores.signature,false);assert.equal(bounded.results[0].scores.supported,false);
 assert.deepEqual(bounded.outOfBoundsLeaks,[bounded.results[0].id]);
 const clarification=await scoreRows([{...rows[2],expected:rejected.expected}],options);
 assert.equal(clarification.results[0].scores.signature,false);
 const committed=await scoreRows([{...rows[0],expected:rejected.expected}],options);
 assert.equal(committed.results[0].scores.signature,false);
 // A rejected receipt may not hide applied effects, even matching cost rows.
 // Retain the rejection mutation guard even when this is a labelled cost.
 const cost={op:'transfer',from:'player|coin_river|purse',to:'sink:consume|coin_river|purse',qty:1,role:'additional_cost'};
 t.mock.method(WorldEngine.prototype,'previewAction',async()=>({receipt:{status:'rejected',applied:[cost],cost:{resources:[cost]}}}));
 const mutated=await scoreRows([rejected],options);
 assert.equal(mutated.results[0].actual.refused,true);assert.equal(mutated.results[0].scores.signature,false);
 assert.deepEqual(mutated.results[0].actual.excludedCosts,[cost]);
 t.mock.restoreAll();
 t.mock.method(WorldEngine.prototype,'previewAction',async()=>{throw Error('implementation failure');});
 const broken=await scoreRows([rejected],options);
 assert.equal(broken.results[0].actual.refused,false);assert.equal(broken.results[0].scores.signature,false);
});

test('A3 preview: clarification, rejection and fallback retain original diagnostics',async()=>{
 const clarification=await executeIntent(engine,initial,rows[2]);
 assert.equal(clarification.actual.preview.status,'not_submitted');
 assert.equal(clarification.actual.preview.routingStatus,'needs_entities');
 assert.ok(clarification.actual.preview.ambiguities.length);
 const refusal=await executeIntent(engine,initial,rows[1]);
 assert.equal(refusal.actual.preview.status,'rejected');assert.ok(refusal.actual.preview.reason);
 const fallback=await executeIntent(engine,initial,rows[3]);
 assert.equal(fallback.actual.preview.status,'not_submitted');
 assert.equal(fallback.actual.previews.length,2);assert.equal(fallback.actual.previews[1].status,'preview');
});

const report=await scoreRows(rows,options);
for(const row of rows)test(`A3 scorer self: ${row.id} — ${row.intent}`,async()=>{
 const result=report.results.find(r=>r.id===row.id);
 assert.equal(result.scores.route,true,JSON.stringify(result));
 assert.equal(result.scores.signature,true,JSON.stringify(result));
 assert.equal(result.scores.outOfBounds,true,JSON.stringify(result));
 assert.equal(result.scores.supported,true,JSON.stringify(result));
 const run=await executeIntent(engine,initial,row);
 if(row.id==='self-open'){
  assert.equal(run.receipt.status,'committed');assert.deepEqual(run.actual.signature,['emit']);
  assert.deepEqual(run.actual.calls.map(c=>[c.phase,c.tool,c.eventId]),[['preview','world_propose','a3-score-self-open'],['confirm','world_propose','a3-score-self-open']]);
  assert.ok(Object.values(run.document.state.records).some(r=>r.category==='world_event'&&r.payload?.text==='今天路上有一只鸟'));
  // Mutating the oracle must fail; extra or substring primitives cannot pass.
  const wrong=await scoreRows([{...row,expected:expected('open:leave_mark',['vital'])}],options);
  assert.equal(wrong.results[0].scores.route,false);assert.equal(wrong.results[0].scores.signature,false);
  assert.equal(signatureMatches(['emit'],[{op:'emit'},{op:'vital'}]),false);
  assert.equal(signatureMatches(['emit','tell'],[{op:'emit',verb:'retell'}]),false);
  // 06 §6.8: a qualified signature requires evidence for subject and field.
  assert.equal(signatureMatches(['emit(person:self,tell)'],[{op:'emit'}]),false);
  const broken=await executeIntent({previewAction:async()=>{throw Error('implementation failure');}},initial,row);
  assert.equal(broken.actual.refused,false);assert.equal(broken.actual.committed,false);
  const noInput=await scoreRows([{id:'text-only',intent:row.intent,expected:expected('open:proposal',[])}],options);
  assert.deepEqual(noInput.inputMissing,['text-only']);assert.equal(noInput.results[0].scores.signature,false);
 }else if(row.id==='self-refuse'){
  assert.equal(run.actual.error.code,'E-OPEN-TRANSFER');assert.deepEqual(run.document,initial);
  assert.equal(run.actual.calls.length,1);assert.equal(run.actual.committed,false);
  // Rejection earns no effect credit from the requested transfer.
  assert.equal(signatureMatches(['transfer'],run.effects),false);
 }else if(row.id==='self-clarify'){
  assert.equal(run.prepared.status,'needs_entities');assert.equal(run.actual.refused,false);
  assert.equal(run.receipt.status,'not_submitted');assert.equal(run.actual.calls.length,1);assert.deepEqual(run.document,initial);
 }else{
  assert.equal(run.receipt.status,'committed');assert.equal(run.actual.fallback,true);
  const id=run.actual.entity;assert.equal(run.document.holdings.entities[id].kind,'mark');
  assert.ok(run.document.state.created[id].tags.length);assert.ok(run.actual.reactions>0);
  assert.equal(run.receipt.fallback.originalIntentFulfilled,false);
  if(row.id==='self-builder'){
   assert.equal(result.scores.constructor,true);assert.deepEqual(run.actual.builder.steps,[0,1,2,3]);
   // 标杆 B07.4: every row is in the constructor denominator.
   assert.equal(report.constructorExpected,rows.length);
   assert.equal(report.constructor,report.results.filter(r=>r.scores.constructor).length/rows.length);
   assert.equal(report.fallbackExpected,3);assert.equal(report.fallbackReacted,3);assert.equal(report.fallbackReactionRate,1);
  }
  if(row.id==='self-registered'){
   assert.equal(run.prepared.status,'routed');
   // 06 §6.9.1: confirm the same proposal the UI previewed, retaining its
   // request identity and requested costs instead of dropping into bare slots.
   assert.deepEqual(run.actual.calls.map(c=>[c.tool,c.action??null]),[['world_propose',null],['world_propose',null]]);
   assert.equal(run.actual.calls[0].eventId,run.actual.calls[1].eventId);
   assert.equal(signatureMatches(['create','mark:warning'],run.effects),true);
  }
  if(row.id==='self-fallback'){
   assert.deepEqual(run.actual.calls.map(c=>[c.phase,c.tool]),[['preview','world_propose'],['preview','world_act'],['confirm','world_act']]);
   const unseen=structuredClone(initial);for(const npc of Object.values(unseen.state.npcs))npc.activity='睡眠';
   const noReaction=await executeIntent(engine,unseen,row);
   assert.equal(noReaction.actual.committed,true);assert.ok(noReaction.actual.entity);assert.equal(noReaction.actual.fallback,false);
  }
 }
});
