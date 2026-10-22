import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {npcServices} from '../server-plugin/npc-state.mjs';
import {scheduleAt,assertNpcService} from '../server-plugin/npc-schedule.mjs';
import {qualifiedExaminers} from '../server-plugin/local-exams.mjs';
import {settlementGovernment,placeView,groupRepresentative} from '../server-plugin/entity-view.mjs';
import {ensureHoldings,aliveHoldings,holdingSet,declareHoldingWriter} from '../server-plugin/holdings.mjs';
import {changeHolding} from '../server-plugin/transition.mjs';
import {reconcileHoldings,reconciled} from '../server-plugin/holding-sources.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const make=()=>{const engine=new WorldEngine(structuredClone(world));return {engine,document:engine.createCharacter(seed,{},'content2')};};
declareHoldingWriter('content2-test',{kinds:['*'],entities:['*'],locations:true});
// Settlement root of a place: follow parents to the place with none (loc_hw, loc_bs ...).
const locationById=new Map(world.locations.map(l=>[l.id,l]));
const settlementOf=id=>{for(let i=0;i<12&&locationById.has(id);i++){const parent=locationById.get(id).parent;if(!parent)return id;id=parent;}return null;};
const examOffice=id=>world.factions.flatMap(f=>f.offices??[]).find(o=>o.id===id);
// Carpentry examiner Yinge's published seat. It must be his own settlement (the former
// Baishi guild seat made him commute 24 km every morning); see also the all-offices test.
const carpentrySeat=examOffice('office_exam_life_6').seat;

test('考官接待从当前职位派生，保留原档作息、家务与非接待劳动',()=>{
 const {engine,document}=make(),s=document.state,person=world.npcs.find(n=>n.id==='npc_hw_yinge');
 const original=structuredClone(person.schedule);
 assert.equal(person.location,'bld_hw_home_22');
 assert.equal(scheduleAt(engine,person.id,500,s).location,'bld_hw_home_22');
 assert.equal(scheduleAt(engine,person.id,500,s).services.includes('teach'),false);
 assert.equal(carpentrySeat,'bld_hw_mill');assert.equal(settlementOf(carpentrySeat),settlementOf(person.location),'席位与考官住处同一聚落');
 assert.equal(scheduleAt(engine,person.id,600,s).location,carpentrySeat);
 assert.ok(scheduleAt(engine,person.id,600,s).services.includes('teach'));
 assert.equal(scheduleAt(engine,person.id,780,s).location,'bld_hw_mill');
 assert.equal(scheduleAt(engine,person.id,780,s).services.includes('teach'),false);
 s.npcs[person.id].proficiencies={skill_life_6_core:99};
 assert.equal(scheduleAt(engine,person.id,600,s).location,'bld_hw_mill');
 assert.equal(scheduleAt(engine,person.id,600,s).services.includes('teach'),false);
 assert.deepEqual(person.schedule,original);
});

test('每个普通职业都有路线可达、按真实作息能完成考核的合格考官',()=>{
 const {engine,document}=make(),s=document.state,reachable=new Set(['loc_bs']);
 for(let changed=true;changed;){changed=false;for(const r of world.routes)for(const [a,b] of [[r.from,r.to],[r.to,r.from]])if(reachable.has(a)&&!reachable.has(b)){reachable.add(b);changed=true;}}
 const offices=world.factions.flatMap(f=>f.offices??[]).filter(o=>o.authority.operations.includes('certify'));
 assert.equal(offices.length,28);
 for(const o of offices){const holder=world.npcs.find(n=>n.id===o.holder);assert.equal(settlementOf(o.seat),settlementOf(holder.location),`${o.id} 的席位须与考官 ${o.holder} 的住处同一聚落`);}
 for(const role of world.professions.filter(p=>p.kind!=='hidden')){
  const holders=world.npcs.filter(n=>n.services?.includes(role.id)||offices.some(o=>o.authority.profession===role.id&&o.holder===n.id));
  assert.ok(holders.some(n=>{
   const office=offices.find(o=>o.authority.profession===role.id&&o.holder===n.id);
   for(let minute=480;minute<=900;minute+=30){
    s.minute=minute;const slot=scheduleAt(engine,n.id,minute,s);
    if(!slot?.services.includes('teach')||slot.until-minute<(role.entry?.minutes??120)||!reachable.has(slot.location)||office&&office.seat!==slot.location)continue;
    s.npcs[n.id].location=slot.location;s.location=slot.location;
    if(!qualifiedExaminers(engine,s,role.id,slot.location).includes(n.id))continue;
    assertNpcService(engine.primitiveDraft(document),engine,n.id,'teach',role.entry?.minutes??120);
    return true;
   }
   return false;
  }),`${role.id}必须有能抵达并完成原时长考核的真实考官`);
 }
});

test('020 题设按真实席位（旧磨坊）搭建后，能唯一找到木工考官，申请不预先授予资格；白石行会窗口没有木工考官',async()=>{
 const {engine,document}=make(),corpus=JSON.parse(await fs.readFile('tests/fixtures/a3-intents-v2-r12.json','utf8'));
 // Corpus A3V2-020 stages the window at bld_bs_guild with the Hewan carpenter present. The
 // examiner's published seat is bld_hw_mill, so the premise is staged at that seat; the corpus
 // row is not edited (premise/seat mismatch is reported to the coordinator).
 const row=corpus.find(r=>r.id==='A3V2-020'),setup=applyIntentSetup(engine,document,JSON.parse(JSON.stringify(row.setup).replaceAll('bld_bs_guild',carpentrySeat)));
 assert.deepEqual(setup.setupUnmet,[]);
 assert.deepEqual(qualifiedExaminers(engine,setup.document.state,'profession_life_6',carpentrySeat),['npc_hw_yinge']);
 assert.ok(!qualifiedExaminers(engine,setup.document.state,'profession_life_6','bld_bs_guild').includes('npc_hw_yinge'),'白石行会不是尹葛的席位');
 assert.equal(setup.document.state.professions.life.includes('profession_life_6'),false);
 assert.equal(setup.document.state.player.coins,20);
 const d=engine.primitiveDraft(setup.document);ensureHoldings(d,engine);
 assert.ok(aliveHoldings(d,{kind:'holds_office',holder:'npc_hw_yinge',subject:'office_exam_life_6'}).length);
 assert.equal(groupRepresentative(engine,d.get('state'),'faction_lampbridge','npc_hw_yinge'),null,'考官职位不附送整个行会资产的代表权');
 assert.equal(world.npcs.find(n=>n.id==='npc_hw_ayan').services.includes('profession_life_6'),false);
});

test('同一窗口多个登记职位仍需消歧，在岗布尔值不能代造授予权',async()=>{
 const {engine,document}=make(),corpus=JSON.parse(await fs.readFile('tests/fixtures/a3-intents-v2-r12.json','utf8'));
 const setup=structuredClone(corpus.find(r=>r.id==='A3V2-020').setup);
 const office={...structuredClone(setup.instances[0]),id:'a3_content2_second_referral'};
 setup.instances.push(office);
 setup.holdings.push({id:'a3_content2_second_office_holding',kind:'holds_office',holder:'npc_hw_yanzhe',subject:office.id,terms:{}});
 const loaded=applyIntentSetup(engine,document,setup);
 assert.ok(loaded.setupUnmet.some(r=>r.item==='status.npc_hw_yanzhe.onDuty'&&/exactly one/.test(r.reason)));
 assert.equal(loaded.document.state.professions.life.includes('profession_life_6'),false);
});

test('考官换任与免职经持有协议更新当前授予者，明确空缺不恢复原任',()=>{
 const {engine,document}=make(),d=engine.primitiveDraft(document);ensureHoldings(d,engine);
 d.set(['state','minute'],600);holdingSet(d,engine,['state','npcs','npc_sb_yexun','location'],carpentrySeat,'content2-test');
 holdingSet(d,engine,['state','npcs','npc_hw_yinge','location'],scheduleAt(engine,'npc_hw_yinge',600,d.get('state')).location,'content2-test');
 assert.ok(npcServices(engine,d.get('state'),'npc_hw_yinge').includes('profession_life_6'));
 const office=aliveHoldings(d,{kind:'holds_office',subject:'office_exam_life_6'})[0];
 changeHolding(d,engine,{op:'transfer',id:office.id,holder:'npc_sb_yexun',eventId:'content2-reassign'});
 assert.equal(npcServices(engine,d.get('state'),'npc_hw_yinge').includes('profession_life_6'),false);
 assert.ok(npcServices(engine,d.get('state'),'npc_sb_yexun').includes('profession_life_6'));
 const current=aliveHoldings(d,{kind:'holds_office',subject:'office_exam_life_6'})[0];
 changeHolding(d,engine,{op:'close',id:current.id,reason:'vacated',eventId:'content2-dismiss'});
 assert.equal(npcServices(engine,d.get('state'),'npc_sb_yexun').includes('profession_life_6'),false);
 assert.equal(npcServices(engine,d.get('state'),'npc_hw_yinge').includes('profession_life_6'),false);
 assert.equal(d.get('state','records','organization:faction_lampbridge','offices','office_exam_life_6','holder'),null);
 const reconciliation=reconcileHoldings(engine,d.document);
 assert.ok(reconciled(reconciliation),JSON.stringify(reconciliation));
});

test('考官职位不绕过入职技能或费用，失败不写认证与扣款',async()=>{
 const {engine,document}=make();document.state.location=carpentrySeat;document.state.minute=600;
 // 05 §5.8: the office projects his duty route; moving the clock in a fixture
 // does not physically move a person out of his frozen initial home location.
 document.state.npcs.npc_hw_yinge.location=scheduleAt(engine,'npc_hw_yinge',600,document.state).location;
 document.state.player.level=1;
 document.state.skills.skill_life_6_core={proficiency:99,breakthroughs:[],daily:{}};document.state.player.coins=20;
 const before=structuredClone(document);
 await assert.rejects(engine.reduce(document,{tool:'world_profession',args:{profession:'profession_life_6',teacher:'npc_hw_yinge'},eventId:'content2-underqualified'}),/技能|手艺/);
 assert.deepEqual(document,before);
 document.state.skills.skill_life_6_core.proficiency=100;document.state.player.coins=19;
 await assert.rejects(engine.reduce(document,{tool:'world_profession',args:{profession:'profession_life_6',teacher:'npc_hw_yinge'},eventId:'content2-unpaid'}),/费用/);
 assert.equal(document.state.professions.life.includes('profession_life_6'),false);
 assert.equal(document.state.player.coins,19);
});

test('环城按纲要具名治理，公共设施归组织，换任跟随当前首长',()=>{
 const {engine,document}=make(),s=document.state,org='faction_huancheng_government';
 assert.equal(settlementGovernment(engine,s,'loc_far_huancheng').head.value,'npc_hc_yicen');
 const d=engine.primitiveDraft(document);ensureHoldings(d,engine);
 assert.ok(aliveHoldings(d,{kind:'holds_office',holder:'npc_hc_yicen',subject:`office_org:${org}:leader`}).length);
 assert.ok(aliveHoldings(d,{kind:'holds_office',holder:'npc_hc_liwang',subject:'office_huancheng_deputy'}).length);
 for(const id of ['bld_hc_citywall','bld_hc_stone_gate'])assert.equal(placeView(engine,s,id).owner.value,org);
 holdingSet(d,engine,['state','records',`organization:${org}`],{category:'organization',id:org,leader:'npc_hc_liwang'},'content2-test');
 assert.equal(settlementGovernment(engine,d.get('state'),'loc_far_huancheng').head.value,'npc_hc_liwang');
 holdingSet(d,engine,['state','records',`organization:${org}`,'leader'],null,'content2-test');
 assert.equal(settlementGovernment(engine,d.get('state'),'loc_far_huancheng').head.value,null);
 assert.equal(engine.byId.get('site_w5_indigo_ditch').owner,null,'废染坊不随城务接线变成郡署财产');
});
