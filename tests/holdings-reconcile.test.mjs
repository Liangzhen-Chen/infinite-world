// S2a 持有双写对账（10 §10.5 双写 + 对账，02 I5/I8）：每一步之后，旧字段应有的持有 / 实体 / 位置事实与存储逐条相等，
// 本步旧字段的变化与存储的变化一致（漏写 0），存储自身不违反互斥与份额约束（I8）。
// 场景：组织（创立、入会议案、表决）、商号（租铺、经营、雇工）、受雇、借贷、多日与离屏推进；
// 犯罪立案 → 认罪 → 逮捕羁押（受限 guest_of{detained}）→ 羁押期满；成婚与死亡（遗产、监护、合同终止、宠物与同行）。
import test from 'node:test';
import {advanceProcedure,transitionState} from '../server-plugin/transition.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {reconcileHoldings,reconciled,legacyHoldings} from '../server-plugin/holding-sources.mjs';
import {auditHoldings,ensureHoldings,aliveHoldings} from '../server-plugin/holdings.mjs';
import {marry,recordEntityDeath} from '../server-plugin/npc-life.mjs';
import {withLawRules} from '../world/design/law-foundation.mjs';
import {holdingsDiscrepancies} from './helpers/holdings-audit.mjs';
import {grantLoanConsent} from './helpers/finance.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile(new URL('fixtures/legacy/seed.json',import.meta.url),'utf8'));
const DAY=1440,inn='bld_hw_qingdeng',post='bld_hw_post',host='npc_hw_linsui',clerk='npc_hw_shendu',worker='npc_hw_ayan';
const view=document=>({peek:(...p)=>p.reduce((v,k)=>v?.[k],document)});
function check(engine,before,after,label){
    assert.deepEqual(holdingsDiscrepancies(engine,before,after),[],`${label}：旧字段的变化 ≠ 存储的变化（漏写）`);
    if(after.holdings){
        const r=reconcileHoldings(engine,after);
        assert.ok(reconciled(r),`${label}：旧字段 ≠ 存储 ${JSON.stringify({missing:r.missing.slice(0,5),extra:r.extra.slice(0,5),entities:r.entities.slice(0,5),locations:r.locations.slice(0,5)})}`);
        assert.deepEqual(auditHoldings(view(after)),[],`${label}：存储违反互斥或份额约束`);
    }
}
async function step(c,tool,args,eventId){
    const before=c.doc,out=await c.engine.reduce(before,{tool,args,eventId}),after=applyPatches(before,out.patches);
    check(c.engine,before,after,eventId);c.doc=after;return out.result;
}
// 引擎草稿的最小替身（事件前文档 original、引擎、读写与补丁），用于直接调用写入函数的场景。
function engineDraft(engine,document){
    return {original:document,engine,document,patches:[],messages:[],get(...p){return structuredClone(p.reduce((v,k)=>v?.[k],this.document));},peek(...p){return p.reduce((v,k)=>v?.[k],this.document);},
        set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);this.patches.push({op:'set',path,value});},
        remove(path){this.document=applyPatches(this.document,[{op:'delete',path}]);this.patches.push({op:'delete',path});},say(m){this.messages.push(m);}};
}
const kindsOf=document=>new Set(Object.values(document.holdings.rows).map(r=>r.variant?`${r.kind}:${r.variant}`:r.kind));

test('开账：新开局的旧字段全部转为持有、职位实体与位置事实，且通过注册形状校验',()=>{
    const engine=new WorldEngine(structuredClone(world)),doc=engine.createCharacter(seed,{},'holdings-genesis');
    const d=engineDraft(engine,doc);assert.equal(ensureHoldings(d,engine),true);
    const h=d.document.holdings,legacy=legacyHoldings(engine,doc.state);
    assert.equal(Object.keys(h.rows).length,legacy.holdings.length,'每条旧关系一条持有');
    assert.ok(Object.values(h.rows).every(r=>r.writer==='genesis'&&r.until===undefined));
    for(const k of ['member_of','holds_office','kin:spouse','kin:parent','household_member','resides','resident_of','owns','controls','certified','branch'])assert.ok(kindsOf(d.document).has(k),`开账含 ${k}`);
    assert.ok(Object.values(h.entities).some(e=>e.kind==='office'&&e.id.startsWith('office_gov:')),'村长是职位实体');
    assert.ok(Object.values(h.rows).filter(r=>r.kind==='kin'&&r.variant==='spouse').every(r=>r.concluded?.form==='authored'),'作者数据的婚姻记开局缔结');
    assert.ok(reconciled(reconcileHoldings(engine,d.document)));assert.deepEqual(auditHoldings(view(d.document)),[]);
});

test('多日推演对账：组织、议案、商号租铺与雇工、受雇、借贷、离屏推进，旧字段与存储逐条相等、漏写 0',{timeout:900000},async()=>{
    const w=structuredClone(world),placeOf={[host]:inn,[worker]:inn,[clerk]:post};
    // 雇工全天在店里歇着（与 save-roundtrip 同一夹具），才有完整空档受雇。
    for(const npc of w.npcs.filter(n=>placeOf[n.id]))npc.schedule={default:[{start:0,end:1440,location:placeOf[npc.id],activity:npc.id===worker?'休息':'营业',services:npc.id===host?['trade']:[]}]};
    const engine=new WorldEngine(w),doc=engine.createCharacter(seed,{},'holdings-reconcile');
    doc.state.minute=600;doc.state.location=inn;doc.state.player.coins=800;
    for(const [id,location] of [[host,inn],[worker,inn],[clerk,post]])Object.assign(doc.state.npcs[id],{location,activity:id===worker?'休息':'营业',status:'正常',coins:100});
    const c={engine,doc};
    await step(c,'world_trade',{seller:host,item:'item_bread',quantity:1},'buy');
    const org=(await step(c,'world_create',{type:'org',name:'青灯互助会',data:{notes:'互相照应',occupation:'行会'}},'found')).organization;
    assert.ok(c.doc.holdings,'第一次写持有时开出分区');
    await step(c,'world_settlement',{operation:'org_propose',org,action:'charter',cost:5},'fee');
    const apply=await step(c,'world_settlement',{operation:'org_join',org,member:worker,consent:true},'apply');
    await step(c,'world_settlement',{operation:'org_vote',org,proposal:apply.proposal,opinion:'approve'},'approve');
    assert.ok(aliveHoldings(view(c.doc),{kind:'member_of',holder:worker,subject:org}).length,'表决通过后入会');
    assert.ok(c.doc.holdings.entities[`motion_${apply.proposal}`],'议案是实体');
    const lease=await step(c,'world_trade',{operation:'lease',seller:host,consent:true,days:3,deposit:3},'lease'),shop=lease.business;
    const order=await step(c,'world_trade',{operation:'procure',business:shop,seller:host,consent:true,item:'item_bread',quantity:2},'procure');
    await step(c,'world_trade',{operation:'fulfill',business:shop,seller:host,contract:order.contract},'delivered');
    await step(c,'world_settlement',{operation:'business_open',business:shop},'open');
    assert.ok(aliveHoldings(view(c.doc),{kind:'operates',holder:'player',subject:shop}).length,'开张即经营');
    await step(c,'world_trade',{operation:'hire',business:shop,seller:worker,consent:true,task:'stocktake',minutes:30,item:'item_bread',quantity:2},'hire');
    // A3 真实同意替代旧布尔前提；持有逐步对账与离屏推进断言不变。
    const beforeConsent=c.doc;
    c.doc=grantLoanConsent(engine,c.doc,{lender:host,principal:40,days:10,eventId:'holdings-loan-consent'});
    check(engine,beforeConsent,c.doc,'loan-consent');
    const loan=await step(c,'world_trade',{operation:'borrow',seller:host,coins:40,days:10},'loan');
    await step(c,'world_move',{destination:post},'to-post');
    for(let i=0;i<3;i++)await step(c,'world_time',{minutes:DAY},`day-${i}`);
    await step(c,'world_move',{destination:inn},'to-inn');
    Object.assign(c.doc.state.npcs[host],{location:inn,activity:'营业',status:'正常'});
    await step(c,'world_trade',{seller:host,payment:'repay',debt:loan.debt},'repay');
    await step(c,'world_time',{minutes:24*DAY},'offscreen');
    const rows=Object.values(c.doc.holdings.rows);
    for(const k of ['member_of','holds_office','leases','operates'])assert.ok(rows.some(r=>r.kind===k&&r.writer!=='genesis'),`推演中写过 ${k}`);
    assert.ok(rows.some(r=>r.until!==undefined),'租期、受雇等结束的持有关闭并保留历史');
    assert.ok(c.doc.holdings.entities[`office_org:${org}:leader`],'组织首领是职位实体');
});

test('犯罪立案到羁押：案件实体、受限 guest_of{detained} 开立，羁押期满关闭',{timeout:600000},async()=>{
    const victim='npc_hw_linsui',guard='npc_hw_gucen';
    const w=withLawRules(structuredClone(world));for(const npc of w.npcs)if([victim,guard,'npc_hw_chenbai','npc_hw_hezhou'].includes(npc.id)){delete npc.schedule;delete npc.tier;}
    const engine=new WorldEngine(w),doc=engine.initialFromLegacy(seed,'holdings-law');
    doc.state.location=inn;doc.state.npcs[victim].inventory.item_bread=4;
    const c={engine,doc};
    let incident=null;
    for(let i=0;i<500&&!incident;i++){const before=c.doc,r=await step(c,'world_crime',{operation:'steal',target:victim,item:'item_bread'},`theft_${i}`);if(r.checkSuccess)incident=r;else c.doc=before;}
    assert.ok(incident?.case,'立案');
    assert.ok(c.doc.holdings?.entities[`case_${incident.case}`],'案件是实体');
    c.doc.state.npcs[guard].location=c.doc.state.location;
    await step(c,'world_law',{operation:'confess',case:incident.case,authority:guard},'confess');
    c.doc.state.npcs[guard].location=c.doc.state.location;
    await step(c,'world_law',{operation:'arrest',case:incident.case,authority:guard},'arrest');
    const held=aliveHoldings(view(c.doc),{kind:'guest_of',holder:'player'}).filter(r=>r.variant==='detained');
    assert.equal(held.length,1,'羁押 = 受限');assert.equal(held[0].terms.case,`case_${incident.case}`);
    await step(c,'world_time',{minutes:DAY},'custody-expired');
    assert.equal(aliveHoldings(view(c.doc),{kind:'guest_of',holder:'player'}).length,0,'期满即解除');
    assert.equal(c.doc.holdings.entities[`case_${incident.case}`].facts.phase,c.doc.state.records[incident.case].status,'案件阶段随旧状态');
});

test('成婚与死亡：婚姻双向两条、遗产实体、合同终止、继承改写的所有与职位，旧字段与存储一致',{timeout:600000},async()=>{
    const engine=new WorldEngine(structuredClone(world)),doc=engine.createCharacter(seed,{},'holdings-family');
    const a='npc_hw_ayan',b='npc_hw_xuling';
    let d=engineDraft(engine,doc);
    marry(d,engine,[a,b],{since:doc.state.minute},doc.state.minute);
    check(engine,doc,d.document,'marry');
    const spouses=aliveHoldings(view(d.document),{kind:'kin'}).filter(r=>r.variant==='spouse'&&[a,b].includes(r.holder)&&[a,b].includes(r.subject));
    assert.equal(spouses.length,2,'配偶双向两条');assert.equal(spouses[0].concluded.form,'act');
    const married=d.document;d=engineDraft(engine,married);
    const death=recordEntityDeath(d,engine,host,married.state.minute,'寿终');
    assert.ok(death);check(engine,married,d.document,'death');
    const estate=transitionState(d,host).successor;
    assert.equal(death.estate.id,estate,'兼容凭据指向同一个协议遗产');
    assert.ok(d.document.holdings.entities[estate],'遗产是实体');
    assert.equal(d.document.holdings.entities[estate].facts.phase,'notice','先公告，不提前处分遗产');
    const pending=d.document;d=engineDraft(engine,pending);
    d.set(['state','minute'],pending.state.minute+2*1440);advanceProcedure(d,engine,estate);
    assert.equal(d.document.holdings.entities[estate].facts.phase,'closed','公告、申报后完成清偿与分配');
    check(engine,pending,d.document,'estate distribution');
});
