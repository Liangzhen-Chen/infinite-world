// S2a 持有存储与注册表（01 §1.3、02 I5/I8、附录 A §A.4 / §A.15）：注册形状完整性、唯一写入点的校验
// （写入者、两端模板、变体、互斥、份额与 rescale、容量、incompatibleWith 四策略、缔结快照）、实体化对象、
// 位置事实（随身 / 容器）、懒开账，以及 effective() / confined() / 钉住三个派生接口。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {emptyHoldings,openHolding,closeHolding,transferHolding,rescaleHolding,aliveHoldings,holdingRow,createEntity,updateEntity,endEntity,entityRow,
    setLocation,clearLocation,located,locationOf,declareHoldingWriter,registerHoldingKind,auditHoldings,ensureHoldings,HoldingRejected,holdingKind,holdingKindIds} from '../server-plugin/holdings.mjs';
import {validateHoldingKinds,confined,effective,pinnedBy} from '../server-plugin/holding-kinds.mjs';
import '../server-plugin/holding-sources.mjs';

const registry=JSON.parse(fs.readFileSync(new URL('../world/ontology/holdings.json',import.meta.url),'utf8'));
function draft(document,original=null){return {document,original,patches:[],get(...p){return structuredClone(p.reduce((v,k)=>v?.[k],this.document));},peek(...p){return p.reduce((v,k)=>v?.[k],this.document);},
    set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);this.patches.push({op:'set',path,value});},
    remove(path){this.document=applyPatches(this.document,[{op:'delete',path}]);this.patches.push({op:'delete',path});}};}
const engine={world:{npcs:[{id:'npc_a'},{id:'npc_b'},{id:'npc_c'}],residents:[],factions:[{id:'faction_x'},{id:'faction_y'}],households:[],locations:[{id:'loc_inn_room',capacity:1}],bosses:[],monsters:[]},
    rules:{},byId:new Map([['loc_inn_room',{id:'loc_inn_room',type:'loc',capacity:1}]])};
const state=()=>({minute:600,npcs:{npc_a:{},npc_b:{},npc_c:{}},records:{},itemInstances:{item_box:{id:'item_box'},item_ring:{id:'item_ring'}},buildings:{bld_mill:{owner:'npc_a'}}});
const fresh=()=>draft({state:state(),holdings:emptyHoldings()});
declareHoldingWriter('holdings-test',{kinds:['*'],entities:['*'],locations:true});
declareHoldingWriter('holdings-narrow',{kinds:['member_of']});
const W={writer:'holdings-test',engine};
const rejects=(fn,code)=>assert.throws(fn,e=>e instanceof HoldingRejected&&e.code===code,code);

test('注册表：v10 持有种类全部登记，四条必填钩子齐全，13 章七种与设计列出的种类都在',()=>{
    const ids=holdingKindIds();
    for(const k of ['devotee_of','possesses','cursed_by','commands','seals','enshrined_in','invited','guest_of','banished','wanted','branch','allied_with',
        'holds_office','owns','share','kin','member_of','governs','administers','fief','guardian_of','mentor_of','lodges','frozen','pledged','permit','companion','certified','citizen_of','resident_of'])assert.ok(ids.includes(k),`缺 ${k}`);
    assert.ok(!ids.includes('located_in'),'容器与内容物是位置事实，不是持有');
    for(const id of ids){const k=holdingKind(id);for(const t of ['gone','vacated','defected'])assert.ok(t in k.handover,`${id}.handover.${t}`);assert.ok('onSubjectGone' in k);assert.notEqual(k.handover.gone,'stay');}
    assert.deepEqual(Object.keys(holdingKind('guest_of').variants).sort(),['detained','voluntary']);
    assert.equal(holdingKind('guest_of').variants.detained.pins,'holder');
    assert.equal(holdingKind('holds_office').contest,'rank');assert.equal(holdingKind('holds_office').pins,'holder');
    assert.equal(holdingKind('owns').sum,1);assert.equal(holdingKind('owns').exclusive,false);
    assert.deepEqual(holdingKind('devotee_of').incompatibleWith,[{kind:'devotee_of',policy:'auto_vacate'}]);
    assert.equal(holdingKind('governs').handover.gone,'succeed');
    assert.deepEqual(validateHoldingKinds(registry.entries),[]);
    assert.ok(registry.reasons.map(r=>r.id).includes('escaped'));
});

test('I5：缺必填项、gone=stay、governs 非 succeed、未知模板 / 策略 / 钩子、RX 过滤器都使注册失败',()=>{
    const base=registry.entries.find(e=>e.id==='member_of');
    const bad=(patch,field)=>{const e={...structuredClone(base),id:'test_bad',...patch};const errors=validateHoldingKinds([...registry.entries,e]);assert.ok(errors.some(x=>x.kind==='test_bad'&&x.field.startsWith(field)),`${field}: ${JSON.stringify(errors)}`);};
    bad({handover:{gone:'close',vacated:'close'}},'handover.defected');
    bad({handover:{gone:'stay',vacated:'close',defected:'close'}},'handover.gone');
    bad({onSubjectGone:'vanish'},'onSubjectGone');
    bad({holderKinds:['ghost']},'holderKinds');
    bad({pins:'left'},'pins');
    bad({contest:'coin_flip'},'contest');
    bad({incompatibleWith:[{kind:'no_such',policy:'forbid'}]},'incompatibleWith');
    bad({incompatibleWith:[{kind:'member_of',policy:'maybe'}]},'incompatibleWith');
    bad({incompatibleWith:[{kind:'member_of',policy:'needs_permission'}]},'incompatibleWith');
    bad({incompatibleWith:[{kind:'member_of',policy:'flag',subjectFilter:'subject.kind == "guild"'}]},'incompatibleWith');
    bad({hooks:[{on:'whenever',do:'close'}]},'hooks[0].on');
    bad({hooks:[{on:'holder.gone',do:[{op:'teleport'}]}]},'hooks[0].do');
    bad({sum:1,exclusive:true},'sum');
    const g=structuredClone(registry.entries.find(e=>e.id==='governs'));g.handover.gone='close';
    assert.ok(validateHoldingKinds(registry.entries.map(e=>e.id==='governs'?g:e)).some(x=>x.kind==='governs'),'governs 必 succeed（I9）');
});

test('唯一写入点：写入者、写入权、未登记种类、变体、两端模板与实体存在都先校验',()=>{
    const d=fresh();
    assert.throws(()=>openHolding(d,{kind:'member_of',holder:'npc_a',subject:'faction_x',writer:'nobody',engine}),/未登记的持有写入者/);
    assert.throws(()=>openHolding(d,{kind:'owns',holder:'npc_a',subject:'bld_mill',terms:{share:1},writer:'holdings-narrow',engine}),/没有持有种类 owns 的写入权/);
    rejects(()=>openHolding(d,{kind:'teleported',holder:'npc_a',subject:'faction_x',...W}),'E-HOLDING-KIND');
    rejects(()=>openHolding(d,{kind:'guest_of',holder:'npc_a',subject:'faction_x',...W}),'E-HOLDING-VARIANT');
    rejects(()=>openHolding(d,{kind:'member_of',variant:'spouse',holder:'npc_a',subject:'faction_x',...W}),'E-HOLDING-VARIANT');
    rejects(()=>openHolding(d,{kind:'member_of',holder:'npc_a',subject:'npc_b',...W}),'E-HOLDING-TEMPLATE');
    rejects(()=>openHolding(d,{kind:'member_of',holder:'npc_a',subject:'nowhere',...W}),'E-HOLDING-ENTITY');
    const id=openHolding(d,{kind:'member_of',holder:'npc_a',subject:'faction_x',writer:'holdings-narrow',engine});
    rejects(()=>openHolding(d,{kind:'member_of',holder:'npc_a',subject:'faction_x',...W}),'E-HOLDING-DUPLICATE');
    assert.throws(()=>closeHolding(d,{id,reason:'evaporated',writer:'holdings-test'}),/未登记的持有变更原因/);
    closeHolding(d,{id,reason:'defected',writer:'holdings-test'});
    assert.equal(holdingRow(d,id).until,600);assert.equal(holdingRow(d,id).reason,'defected');
    rejects(()=>closeHolding(d,{id,reason:'vacated',writer:'holdings-test'}),'E-HOLDING-CLOSED');
    assert.equal(aliveHoldings(d,{holder:'npc_a'}).length,0,'关闭后不再存活，但历史保留');
    // 没有持有分区的裸草稿（预演、单元测试）不记。
    assert.equal(openHolding(draft({state:state()}),{kind:'member_of',holder:'npc_a',subject:'faction_x',...W}),null);
});

test('I8：互斥种类同一标的只有一个持有人；份额之和恒为 1，rescale 同一事务改写全部份额',()=>{
    const d=fresh();
    createEntity(d,{id:'office_hw_head',kind:'office',facts:{settlement:'loc_hw'},writer:'holdings-test'});
    const a=openHolding(d,{kind:'holds_office',holder:'npc_a',subject:'office_hw_head',...W});
    rejects(()=>openHolding(d,{kind:'holds_office',holder:'npc_b',subject:'office_hw_head',...W}),'E-HOLDING-EXCLUSIVE');
    const b=transferHolding(d,{id:a,holder:'npc_b',...W});
    assert.equal(holdingRow(d,a).reason,'transferred');assert.equal(holdingRow(d,b).holder,'npc_b');
    rejects(()=>openHolding(d,{kind:'owns',holder:'npc_a',subject:'bld_mill',...W}),'E-HOLDING-SHARE');
    openHolding(d,{kind:'owns',holder:'npc_a',subject:'bld_mill',terms:{share:0.5},...W});
    assert.deepEqual(auditHoldings(d),['份额之和 ≠ 1：owns|bld_mill = 0.5']);
    openHolding(d,{kind:'owns',holder:'npc_b',subject:'bld_mill',terms:{share:0.5},...W});
    rejects(()=>openHolding(d,{kind:'owns',holder:'npc_c',subject:'bld_mill',terms:{share:0.1},...W}),'E-HOLDING-SUM');
    assert.deepEqual(auditHoldings(d),[]);
    rejects(()=>rescaleHolding(d,{kind:'owns',subject:'bld_mill',shares:{npc_a:0.5,npc_c:0.6},...W}),'E-HOLDING-SUM');
    rescaleHolding(d,{kind:'owns',subject:'bld_mill',shares:{npc_a:0.25,npc_b:0.5,npc_c:0.25},...W});
    const owners=aliveHoldings(d,{kind:'owns',subject:'bld_mill'});
    assert.deepEqual(owners.map(r=>[r.holder,r.terms.share]).sort(),[['npc_a',0.25],['npc_b',0.5],['npc_c',0.25]]);
    assert.ok(owners.find(r=>r.holder==='npc_b').since===600,'份额未变的边不重开');
    assert.deepEqual(auditHoldings(d),[]);
    // 容量：lodges 非互斥但受节点 capacity 约束。
    openHolding(d,{kind:'lodges',holder:'npc_a',subject:'loc_inn_room',...W});
    rejects(()=>openHolding(d,{kind:'lodges',holder:'npc_b',subject:'loc_inn_room',...W}),'E-HOLDING-CAPACITY');
});

test('incompatibleWith：auto_vacate 同一事务关闭旧持有，forbid 拒绝，needs_permission 读许可，flag 只打标记',()=>{
    const d=fresh();
    const old=openHolding(d,{kind:'devotee_of',holder:'npc_a',subject:'faction_x',...W});
    const neu=openHolding(d,{kind:'devotee_of',holder:'npc_a',subject:'faction_y',...W});
    assert.equal(holdingRow(d,old).reason,'vacated','改宗：旧信奉 auto_vacate');assert.deepEqual(holdingRow(d,neu).vacated,[old]);
    openHolding(d,{kind:'kin',variant:'spouse',holder:'npc_a',subject:'npc_b',...W});
    rejects(()=>openHolding(d,{kind:'kin',variant:'spouse',holder:'npc_a',subject:'npc_c',...W}),'E-HOLDING-INCOMPATIBLE');
    openHolding(d,{kind:'kin',variant:'parent',holder:'npc_a',subject:'npc_c',...W});
    registerHoldingKind({...structuredClone(registry.entries.find(e=>e.id==='member_of')),id:'test_guild_hunter',label:'行会猎户',
        incompatibleWith:[{kind:'devotee_of',policy:'needs_permission',permit:'secular_trade'}]});
    registerHoldingKind({...structuredClone(registry.entries.find(e=>e.id==='member_of')),id:'test_village_head',label:'村正',incompatibleWith:[{kind:'holds_office',policy:'flag'}]});
    rejects(()=>openHolding(d,{kind:'test_guild_hunter',holder:'npc_a',subject:'faction_x',...W}),'E-HOLDING-PERMISSION');
    createEntity(d,{id:'office_temple_abbot',kind:'office',writer:'holdings-test'});
    openHolding(d,{kind:'permit',holder:'office_temple_abbot',subject:'npc_a',terms:{scope:'secular_trade'},...W});
    assert.ok(openHolding(d,{kind:'test_guild_hunter',holder:'npc_a',subject:'faction_x',...W}));
    openHolding(d,{kind:'holds_office',holder:'npc_b',subject:'office_temple_abbot',...W});
    const flagged=openHolding(d,{kind:'test_village_head',holder:'npc_b',subject:'faction_x',...W});
    assert.deepEqual(holdingRow(d,flagged).flags,['conflict:holds_office']);
});

test('缔结快照：由一次行为开立的结构性持有在开立时记 {time, place, lawVersion, form}',()=>{
    const d=fresh();
    const m=openHolding(d,{kind:'kin',variant:'spouse',holder:'npc_a',subject:'npc_b',place:'loc_hw',lawVersion:'law_kingdom@1',form:'ceremony',...W});
    assert.deepEqual(holdingRow(d,m).concluded,{time:600,place:'loc_hw',lawVersion:'law_kingdom@1',form:'ceremony'});
    const s=openHolding(d,{kind:'kin',variant:'sibling',holder:'npc_a',subject:'npc_c',...W});
    assert.equal(holdingRow(d,s).concluded,undefined,'兄弟不是缔结');
});

test('实体化对象：编号前缀、永不复用、慢变事实只经写入点、消失留墓碑',()=>{
    const d=fresh();
    assert.throws(()=>createEntity(d,{id:'npc_case',kind:'case',writer:'holdings-test'}),/case_/);
    assert.throws(()=>createEntity(d,{id:'citizen_1',kind:'citizen',writer:'holdings-test'}),/未实体化/);
    assert.throws(()=>createEntity(d,{id:'case_1',kind:'case',writer:'holdings-narrow'}),/没有实体种类 case/);
    for(const [id,kind] of [['office_x','office'],['estate_death_1','estate'],['case_legal_1','case'],['motion_org_1','motion'],['wreck_boar_1','wreck']])createEntity(d,{id,kind,facts:{phase:'open'},writer:'holdings-test'});
    rejects(()=>createEntity(d,{id:'case_legal_1',kind:'case',writer:'holdings-test'}),'E-ENTITY-DUPLICATE');
    updateEntity(d,{id:'case_legal_1',facts:{phase:'closed'},writer:'holdings-test'});
    assert.equal(entityRow(d,'case_legal_1').facts.phase,'closed');
    // 职位、案件、遗产都可被持有或持有：任职、冻结……
    const h=openHolding(d,{kind:'holds_office',holder:'npc_a',subject:'office_x',...W});assert.ok(h);
    setLocation(d,{entity:'wreck_boar_1',at:'loc_inn_room',mode:'place',writer:'holdings-test',engine});
    endEntity(d,{id:'wreck_boar_1',basis:'destruction',writer:'holdings-test'});
    assert.equal(entityRow(d,'wreck_boar_1').basis,'destruction');assert.equal(locationOf(d,'wreck_boar_1'),null,'消失的实体不再有位置');
    rejects(()=>updateEntity(d,{id:'wreck_boar_1',facts:{phase:'x'},writer:'holdings-test'}),'E-ENTITY-GONE');
    rejects(()=>createEntity(d,{id:'wreck_boar_1',kind:'wreck',writer:'holdings-test'}),'E-ENTITY-DUPLICATE');
});

test('位置事实：地点、随身、容器；有效位置沿载体派生，容器不成环，形态与载体模板相符',()=>{
    const d=fresh();
    setLocation(d,{entity:'item_box',at:'npc_a',mode:'carried',writer:'holdings-test',engine});
    setLocation(d,{entity:'item_ring',at:'item_box',mode:'container',writer:'holdings-test',engine});
    assert.equal(located(d,'item_ring',x=>x==='npc_a'?'loc_hw':null),'loc_hw','戒指在匣中、匣随身，位置随人');
    rejects(()=>setLocation(d,{entity:'item_box',at:'item_ring',mode:'container',writer:'holdings-test',engine}),'E-LOCATION-CYCLE');
    rejects(()=>setLocation(d,{entity:'item_box',at:'loc_inn_room',mode:'carried',writer:'holdings-test',engine}),'E-LOCATION-TEMPLATE');
    assert.throws(()=>setLocation(d,{entity:'item_box',at:'npc_a',mode:'carried',writer:'holdings-narrow',engine}),/没有位置事实的写入权/);
    setLocation(d,{entity:'item_box',at:'loc_inn_room',mode:'place',writer:'holdings-test',engine});
    assert.equal(located(d,'item_ring'),'loc_inn_room','匣放下，戒指随匣');
    clearLocation(d,{entity:'item_ring',writer:'holdings-test'});assert.equal(locationOf(d,'item_ring'),null);
    assert.deepEqual(auditHoldings(d),[]);
});

test('懒开账：第一次写入时从事件前的文档开出分区；没有事件前文档的草稿不开',()=>{
    const original={state:state()},d=draft(structuredClone(original),original);
    assert.equal(ensureHoldings(d,engine),true);
    assert.equal(d.document.holdings.version,1);assert.equal(d.patches[0].path[0],'holdings');
    assert.equal(ensureHoldings(draft({state:state()}),engine),false);
});

test('派生接口：受限 confined、职能有效 effective、钉住侧',()=>{
    const d=fresh();
    createEntity(d,{id:'office_hw_head',kind:'office',writer:'holdings-test'});
    const office=openHolding(d,{kind:'holds_office',holder:'npc_a',subject:'office_hw_head',...W});
    const job=openHolding(d,{kind:'employed_by',holder:'npc_a',subject:'faction_x',...W});
    assert.equal(effective(d,office),true);
    assert.equal(effective(d,office,{impaired:x=>x==='npc_a'}),false,'失能：持有不动，职能无效');
    const custody=openHolding(d,{kind:'guest_of',variant:'detained',holder:'npc_a',subject:'faction_y',terms:{mode:'detained',regime:{keepsEffective:['employed_by']}},...W});
    assert.equal(confined(d,'npc_a'),true);
    assert.equal(effective(d,office),false,'受限：职位有效为假，持有仍存活');
    assert.equal(effective(d,job),true,'劳役的雇佣在 keepsEffective 内');
    assert.ok(aliveHoldings(d,{kind:'holds_office',holder:'npc_a'}).length,'受限不是协议触发：持有不动');
    assert.ok(pinnedBy(d,'npc_a').includes(custody)&&pinnedBy(d,'npc_a').includes(office));
    closeHolding(d,{id:custody,reason:'released',writer:'holdings-test'});
    assert.equal(confined(d,'npc_a'),false);assert.equal(effective(d,office),true,'释放即恢复，不需要重新任命');
});
