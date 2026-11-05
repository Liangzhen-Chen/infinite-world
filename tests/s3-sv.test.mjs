import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,host,worker} from './helpers/finance.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {npcServices} from '../server-plugin/npc-state.mjs';
import {personTeaching} from '../server-plugin/entity-view.mjs';
import {scheduleAt,npcAvailability,assertNpcService} from '../server-plugin/npc-schedule.mjs';
import {applyNpcPlan,npcPlanFingerprint,advanceNpcAutonomy} from '../server-plugin/npc-autonomy.mjs';
import {openLedger} from '../server-plugin/ledger.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';
import {laborOffers} from '../server-plugin/labor-market.mjs';
import {readFileSync} from 'node:fs';
// K5：配方工位类别对应的设备（world/ontology/fixtures.json）。
const fixtureFor=kind=>JSON.parse(readFileSync('world/ontology/fixtures.json','utf8')).entries.find(row=>row.affords===kind).id;

const smith='npc_hw_duanyan',recipe='recipe_smelt_iron',forge='bld_hw_forge';
function setup(){
    const f=fixture({at:forge});
    f.doc.state.minute=840;
    f.doc.state.npcs[smith]={location:forge,status:'正常',coins:200,inventory:{}};
    return f;
}

test('SV: published smith derives services at a live workstation without changing his profile',()=>{
    const {e,doc}=setup(),base=e.byId.get(smith),before=structuredClone(base);
    assert.deepEqual(base.services,[]);
    assert.ok(base.schedule.default.every(s=>!s.services.includes('teach')));
    assert.ok(npcServices(e,doc.state,smith).includes(recipe));
    assert.equal(personTeaching(e,doc.state,smith,recipe),true);
    assert.ok(npcAvailability(e,doc.state,smith).services.includes('teach'));
    assert.deepEqual(base,before);
    assert.equal(doc.state.npcs[smith].recipes,undefined);
});

test('SV: live skill threshold, arrival, work hours and facility condition control derived services',()=>{
    const {e,doc}=setup(),s=doc.state,r=e.byId.get(recipe);
    // The recipe threshold, rather than a particular teacher ID, is authoritative.
    r.minimumProficiency=220;
    s.npcs[smith].skills={[r.skill]:219};
    assert.ok(!npcServices(e,s,smith).includes(recipe));
    assert.equal(personTeaching(e,s,smith,recipe),false);
    s.npcs[smith].skills[r.skill]=220;
    assert.ok(npcServices(e,s,smith).includes(recipe));
    s.npcs[smith].location='loc_hw';
    assert.ok(!npcServices(e,s,smith).includes(recipe));
    assert.equal(personTeaching(e,s,smith,recipe),false);
    assert.deepEqual(npcAvailability(e,s,smith).services,[]);
    s.npcs[smith].location=forge;
    s.minute=730; // Lunch at the same forge is not a working slot.
    assert.ok(!npcServices(e,s,smith).includes(recipe));
    assert.ok(!scheduleAt(e,smith,s.minute,s).services.includes('teach'));
    s.minute=840;s.buildings[forge]={condition:0};
    assert.ok(!npcServices(e,s,smith).includes(recipe));
    assert.equal(personTeaching(e,s,smith,recipe),false);
});

test('SV: another skilled worker at another matching workstation derives the same recipe',()=>{
    const {e,doc,draft}=setup(),s=doc.state,location='bld_sv_workshop',r=e.byId.get(recipe);
    // K5：新建工坊只给一件能做此配方的设备（公开、不收费），代替手写工位。
    s.created[location]={id:location,fixtures:[{fixture:fixtureFor(r.workstation),id:'station_sv_smith',fee:0}]};
    e.byId.get(host).schedule={default:[{start:0,end:1440,location,activity:'当班制作',production:true,services:[]}]};
    s.location=location;s.npcs[host].location=location;s.npcs[host].skills={[r.skill]:220};
    assert.ok(npcServices(e,s,host).includes(recipe));
    assert.equal(personTeaching(e,s,host,recipe),true);
    assertNpcService(draft(),e,host,'teach',120);
    s.created[location].fixtures=[];
    assert.ok(!npcServices(e,s,host).includes(recipe));
    assert.equal(personTeaching(e,s,host,recipe),false);
});

test('SV: derived recipe can actually be crafted with real inputs, time and conservation',()=>{
    const f=setup(),s=f.doc.state,r=f.e.byId.get(recipe),actor=s.npcs[smith];
    r.teachers=[]; // No authored teacher or learned recipe grants this action.
    for(const m of r.materials)actor.inventory[m.item]={quantity:m.amount};
    for(const item of r.tools)actor.inventory[item]={quantity:1,durability:100};
    f.e.byId.get(forge).fixtures.find(x=>x.fixture===fixtureFor(r.workstation)).fee=0;// K5：改设备上的主人报价
    f.doc.ledger=openLedger(f.e,f.doc);
    const d=f.draft(),input={kind:'npc-plan',version:1,minute:s.minute,stateFingerprint:npcPlanFingerprint(f.doc),proposals:[{npc:smith,actions:[{kind:'craft',recipe}]}]};
    const result=applyNpcPlan(d,f.e,input,'sv-craft');
    assert.equal(result.results[0].status,'进行中',result.results[0].reason);
    assert.equal(d.get('state','npcs',smith,'inventory',r.output.item),undefined);
    const beforeState=structuredClone(d.get('state')),finish=result.results[0].finish;
    assert.ok(finish>s.minute);
    d.set(['state','minute'],finish);
    advanceNpcAutonomy(d,f.e,s.minute,finish,'sv-finish',{beforeState});
    const action=d.get('state','npcAutonomy','actions',result.results[0].id);
    assert.ok(action);
    for(const m of r.materials)assert.equal(f.e.quantity(d,smith,m.item),0);
    assert.equal(f.e.quantity(d,smith,r.output.item),action.outcome.success?r.output.quantity:0);
    d.done();
    assert.deepEqual(reconcile(f.e,f.doc),{mismatches:[],lots:[],drift:[],audit:[]});
    assert.equal(f.doc.state.npcs[smith].recipes,undefined);
});

test('SV: workshop demand uses derived services without bypassing station permissions',()=>{
    const f=setup(),s=f.doc.state,r=f.e.byId.get(recipe),actor=s.npcs[smith];
    r.teachers=[];
    for(const m of r.materials)actor.inventory[m.item]={quantity:m.amount};
    for(const item of r.tools)actor.inventory[item]={quantity:1,durability:100};
    s.buildings[forge]={condition:100,owner:smith};
    assert.ok(laborOffers(f.e,s).some(o=>o.source===`workshop:${forge}:${recipe}`));
    // K5：设备另属他人且不对外收费（原为手写 access='private'、owner=host）。
    const station=f.e.byId.get(forge).fixtures.find(x=>x.fixture===fixtureFor(r.workstation));
    delete station.fee;station.owner=host;
    f.doc.ledger=openLedger(f.e,f.doc);
    const d=f.draft(),before=structuredClone(f.doc);
    const result=applyNpcPlan(d,f.e,{kind:'npc-plan',version:1,minute:s.minute,stateFingerprint:npcPlanFingerprint(f.doc),proposals:[{npc:smith,actions:[{kind:'craft',recipe}]}]},'sv-permission');
    assert.equal(result.results[0].status,'拒绝');
    assert.match(result.results[0].reason,/工作台/);
    assert.deepEqual(d.document,before);
});

test('SV: a derived teacher can complete a scheduled recipe course for an NPC',async()=>{
 for(const segments of [[120],[60,60]]){
    const f=setup(),r=f.e.byId.get(recipe);
    r.teachers=[];
    f.doc.state.npcs[worker].skills={[r.skill]:0};
    const run=async(tool,args,eventId)=>{
        const out=await f.e.reduce(f.doc,{tool,args,eventId});
        f.doc=applyPatches(f.doc,out.patches);return out.result;
    };
    await run('world_learn',{operation:'school_open',source:smith,entity:recipe,kind:'recipe',students:[worker],start:840,minutes:120,days:1,consent:true},'sv-course');
    for(const [i,minutes] of segments.entries())await run('world_time',{minutes},`sv-dismiss-${i}`);
    assert.ok(f.doc.state.npcs[worker].recipes?.[recipe],`course split: ${segments}`);
    assert.equal(f.doc.state.npcs[worker].recipes[recipe].source.id,smith);
    assert.equal(f.doc.state.npcs[smith].recipes,undefined);
 }
});
