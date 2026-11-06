import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import '../server-plugin/primitives-runtime.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {normStack,normClause,normCode,normSnapshot,casePenalty,placeCulture,validateNormBindings} from '../server-plugin/norm-stack.mjs';
import {legalCodes,legalCodeAt,applicableLawAt,miningJurisdiction} from '../server-plugin/law-codes.mjs';
import {acceptReported,submitKnownWitnesses} from './helpers/filing-actions.mjs';
import {officeScene} from './helpers/office-actions.mjs';
import {adjudicateLegalCase} from '../server-plugin/law.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const HOME='law_royal_xichui',INN='bld_hw_qingdeng';
const fixture=()=>{const w=structuredClone(world),engine=new WorldEngine(w);return {w:engine.world,engine,state:engine.initialFromLegacy(seed,'s403').state};};/* A1：夹具的世界改指引擎世界 */
const stack=(f,location=INN,actor=null)=>normStack(f.engine,f.state,actor,location,f.state.minute,{codes:legalCodes(f.w,f.state)});
const sovereign=f=>f.w.rules.law.templates.find(c=>c.id===HOME);
const local=f=>f.w.rules.law.codes.find(c=>c.id==='law_hw_property');
async function act(engine,document,action,slots,eventId){
 const input={tool:'world_act',args:{action,slots},eventId},out=await engine.reduce(document,input);
 assert.notEqual(out.result.receipt?.status,'rejected',JSON.stringify(out.result));
 return {...out,input,before:document,document:applyPatches(document,out.patches)};
}

test('target:I9/I24 parent 绑定与真实郡主权有序合成，缺罪名继承且读取不写状态',()=>{
 const f=fixture(),before=structuredClone(f.state),rows=stack(f);
 assert.deepEqual(rows.map(r=>r.layer),['subordinate','sovereign']);
 assert.equal(rows[0].code.id,'law_hw_property');assert.equal(rows[1].code.id,HOME);
 const rule=normClause(rows,'penalties.illegal_mining');
 // Published regions.json assigns 河湾 to 龙渠郡; no neighboring court is borrowed.
 assert.equal(rule.source,'regions:county_xichui_longqu.ruler');
 assert.deepEqual(rule.value,sovereign(f).penalties.illegal_mining);
 assert.deepEqual(applicableLawAt(f.engine,INN,f.state).penalties.illegal_mining,rule.value);
 assert.ok(legalCodeAt(f.engine,INN,f.state).normSources.every(r=>r.source&&r.version.startsWith('sha256:')));
 assert.deepEqual(f.state,before);
});

test('相同行为在不同已发布法域选择不同条款及来源，不按地点 ID 特判',()=>{
 const f=fixture(),codes=f.w.rules.law.codes;
 // Isolated law revisions of existing codes exercise precedence, not new world content.
 codes[0].penalties.theft={baseFine:17,valueMultiplier:1};codes[1].penalties.theft={baseFine:41,valueMultiplier:2};
 const a=normClause(stack(f,codes[0].locations[0]),'penalties.theft'),b=normClause(stack(f,codes[1].locations[0]),'penalties.theft');
 assert.notEqual(a.source,b.source);assert.notDeepEqual(a.value,b.value);
 assert.equal(a.value.baseFine,17);assert.equal(b.value.baseFine,41);
});

test('主权明确 reserved 的条款不受地方绑定覆盖，拒绝来源可解释',()=>{
 const f=fixture();sovereign(f).reserved=['penalties.theft'];
 const expected=structuredClone(sovereign(f).penalties.theft);
 local(f).penalties.theft={baseFine:999,valueMultiplier:99};
 const rule=normClause(stack(f),'penalties.theft');
 assert.deepEqual(rule.value,expected);assert.equal(rule.layer,'sovereign');
 assert.deepEqual(rule.denied,[{source:'world/meta/rules.json#law.codes/law_hw_property',path:'penalties.theft',reason:'reserved'}]);
 assert.deepEqual(legalCodeAt(f.engine,INN,f.state).penalties.theft,expected);
});

test('inherit 逐事项回落，明确 null 不造罪；完全缺失不会猜阈值或刑罚',()=>{
 const f=fixture();local(f).penalties.theft='inherit';
 assert.deepEqual(normClause(stack(f),'penalties.theft').value,sovereign(f).penalties.theft);
 local(f).penalties.theft=null;assert.equal(normClause(stack(f),'penalties.theft').value,null);
 delete local(f).penalties.illegal_mining;delete sovereign(f).penalties.illegal_mining;
 assert.equal(normClause(stack(f),'penalties.illegal_mining').value,undefined);
 assert.throws(()=>miningJurisdiction(f.engine,f.state,INN),/缺少illegal_mining/);
 delete local(f).evidenceRequired;delete sovereign(f).evidenceRequired;
 assert.equal(normCode(stack(f)).evidenceRequired,undefined);
 assert.throws(()=>adjudicateLegalCase(f.engine.primitiveDraft({state:f.state}),f.engine,{},normCode(stack(f)),'npc_hw_chenbai','missing-threshold'),/证据阈值/);
});

test('地点子树的法典与文化绑定继承；同节点冲突显式拒绝，与数组顺序无关',()=>{
 const f=fixture(),culture=f.w.cultures[0].id;
 f.w.rules.law.bindings=[{place:'loc_bs',value:HOME,source:'existing-statute'},
  {place:'loc_bs',slot:'place.culture',value:culture,source:'existing-culture'}];
 assert.deepEqual(validateNormBindings(f.w),[]);
 assert.equal(stack(f,'bld_bs_guild')[0].source,'existing-statute');
 assert.equal(placeCulture(f.engine,f.state,'bld_bs_guild').value,culture);
 f.w.rules.law.bindings.push({place:'loc_bs',value:HOME,source:'second-pack'});
 assert.ok(validateNormBindings(f.w).some(e=>e.includes('E-CONFLICT-SLOT')));
 assert.throws(()=>stack(f,'bld_bs_guild'),/E-CONFLICT-SLOT/);
 f.w.rules.law.bindings.reverse();assert.throws(()=>stack(f,'bld_bs_guild'),/E-CONFLICT-SLOT/);
});

test('文化槽冲突、原地点自带槽冲突与无效引用在校验期报告',()=>{
 const f=fixture(),culture=f.w.cultures[0].id;
 f.w.locations.find(l=>l.id==='loc_bs').culture=culture;
 f.w.rules.law.bindings=[{place:'loc_bs',slot:'place.culture',value:culture}];
 assert.ok(validateNormBindings(f.w).some(e=>e.includes('place.culture@loc_bs')));
 assert.throws(()=>placeCulture(f.engine,f.state,'bld_bs_guild'),/E-CONFLICT-SLOT/);
 f.w.rules.law.bindings=[{place:'missing',value:'missing'}];
 const errors=validateNormBindings(f.w);assert.ok(errors.some(e=>e.includes('unknown place')));assert.ok(errors.some(e=>e.includes('unknown value')));
});

test('绑定生效区间来自真实当前分钟，父链循环报错',()=>{
 const f=fixture();f.w.rules.law.bindings=[{place:'loc_bs',value:HOME,effectiveFrom:f.state.minute+1}];
 assert.notEqual(stack(f,'bld_bs_guild')[0]?.source,'place.lawCode@loc_bs');
 f.w.locations.find(l=>l.id==='loc_bs').parent='bld_bs_guild';
 assert.throws(()=>stack(f,'bld_bs_guild'),/E-NORM-PARENT/);
});

test('当前实体位置决定属地栈，成员来源不混入民事/程序默认选序',()=>{
 const f=fixture(),actor='npc_hw_linsui';
 const rows=normStack(f.engine,f.state,actor);
 assert.equal(rows[0].place,f.state.npcs[actor].location);
 const members=rows.filter(r=>r.layer==='membership');
 assert.ok(rows.every(r=>r.source));
 for(const row of members)assert.match(row.source,/^organization:/);
 assert.equal(normClause([{layer:'membership',source:'charter',code:{civil:{rent:99}}}],'civil.rent').value,undefined);
});

test('R10A 适用规范不凭空产生法院，真实移动后犯罪不自动立案或执行',async()=>{
 const engine=new WorldEngine(world),initial=engine.initialFromLegacy(seed,'s403-no-court');
 const moved=await act(engine,initial,'core:move',{destination:'bld_bs_guild',mode:'walk'},'s403-move');
 moved.document=officeScene(engine,moved.document,{location:moved.document.state.location,minute:moved.document.state.minute,present:['npc_hw_linsui']});
 const before=structuredClone(moved.document);
 assert.ok(applicableLawAt(engine,before.state.location,before.state));
 assert.equal(legalCodeAt(engine,before.state.location,before.state),null);
 // D/E: physical theft can occur without an executable court; it must not
 // fabricate a case or levy a penalty from the merely applicable norm stack.
 const out=await engine.reduce(before,{tool:'world_crime',args:{operation:'steal',target:'npc_hw_linsui',coins:1},eventId:'s403-no-authority'});
 assert.equal(out.result.case,null);
 const after=applyPatches(before,out.patches);
 assert.equal(Object.values(after.state.records).filter(r=>r.category==='legal_case').length,Object.values(before.state.records).filter(r=>r.category==='legal_case').length);
 assert.equal(Object.values(after.state.records).filter(r=>r.category==='legal_treasury').length,Object.values(before.state.records).filter(r=>r.category==='legal_treasury').length);
 assert.deepEqual(moved.document,before);
});

test('行为时规范快照不随条文修改；取轻比较整条刑罚，不拼凑第三种条文',()=>{
 const f=fixture(),rows=stack(f),saved=normSnapshot(rows,'theft'),before=structuredClone(saved);
 local(f).penalties.theft={baseFine:9999,valueMultiplier:99};
 assert.deepEqual(saved,before);
 assert.deepEqual(casePenalty(saved,local(f).penalties.theft,10),saved.penalty);
 const low={baseFine:1,valueMultiplier:0};assert.deepEqual(casePenalty(saved,low,10),low);
 assert.deepEqual(casePenalty(saved,null),saved.penalty);
 assert.equal(casePenalty({penalty:null},low),null);
 assert.deepEqual(casePenalty(null,low),low,'旧案无快照继续原有兼容读取');
});

test('target:I9/I24 真实动作与等待形成旧事，当前改法不得加重既有行为，程序从新',async()=>{
 const engine=new WorldEngine(world),initial=engine.initialFromLegacy(seed,'s403-history');
 const waited=await act(engine,initial,'core:time',{minutes:1},'s403-before-crime');
 const incident=await act(engine,waited.document,'core:crime.steal',{target:'npc_hw_linsui',coins:1},'s403-theft');
 const id=incident.result.case,row=incident.document.state.records[id];
 assert.ok(row.normSnapshot);assert.equal(row.normSnapshot.minute,row.minute);
 const saved=structuredClone(row.normSnapshot),changed=structuredClone(world),revised=changed.rules.law.codes.find(c=>c.id===row.law);
 revised.penalties[row.offense]={baseFine:9999,valueMultiplier:999};revised.hearingMinutes=7;
 const currentEngine=new WorldEngine(changed);
 let next=await act(currentEngine,incident.document,'core:move',{destination:'loc_hw_gate',mode:'walk'},'s403-to-officer');
 next=await act(currentEngine,next.document,'core:law.confess',{case:id,authority:'npc_hw_gucen'},'s403-confess');
 next.document=(await acceptReported(currentEngine,next.document,next.result,'s403-file')).document;
 assert.equal(next.document.state.records[id].category,'legal_case');
 assert.deepEqual(next.document.state.records[id].normSnapshot,saved,'受理保留行为时实体法，不能按立案时法律加重');
 assert.equal(next.document.state.records[id].evidence.some(e=>e.kind==='confession'),true);
 next=await act(currentEngine,next.document,'core:move',{destination:'bld_hw_council',mode:'walk'},'s403-to-court');
 next.document=await submitKnownWitnesses(currentEngine,next.document,id,'s403-witness');
 const start=next.document.state.minute;
 const hearing=await act(currentEngine,next.document,'core:law.hear',{case:id,authority:'npc_hw_chenbai'},'s403-judgment');
 assert.equal(hearing.result.convicted,true);assert.equal(hearing.result.fineCalculation.base,saved.penalty.baseFine);
 assert.equal(hearing.document.state.minute-start,7,'听审耗时按当前程序条款');
 assert.deepEqual(row.normSnapshot,saved);
 // Old events do not acquire new snapshot fields during replay.
 const oldWorld=structuredClone(world);delete oldWorld.rules.law.normStackVersion;delete oldWorld.rules.law.bindings;
 const old=await new WorldEngine(oldWorld).reduce(incident.before,incident.input,{replay:true,result:incident.result});
 assert.equal(applyPatches(incident.before,old.patches).state.records[id].normSnapshot,undefined);
});

test('新事件记录规范版本，可原样回放行为时快照',async()=>{
 const engine=new WorldEngine(world),document=engine.initialFromLegacy(seed,'s403-replay');
 const incident=await act(engine,document,'core:crime.steal',{target:'npc_hw_linsui',coins:1},'s403-replay-theft');
 assert.equal(world.rules.law.normStackVersion,1,'新规范语义随获批绑定的世界版本归档');
 const replay=await engine.reduce(incident.before,incident.input,{replay:true,result:incident.result});
 assert.deepEqual(applyPatches(incident.before,replay.patches),incident.document);
});
