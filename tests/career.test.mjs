import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches}from'../server-plugin/storage.mjs';
import {recordCareerMetrics,spellElements,variantProgress}from'../server-plugin/career-metrics.mjs';
import {catalogDefinition}from'../server-plugin/catalog.mjs';
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const world=await loadWorld(),mentor=world.npcs.find(row=>row.id==='npc_hw_xuling');mentor.promotionRanks={profession_mage:6};
const engine=new WorldEngine(world),fresh=()=>engine.initialFromLegacy({state:seed.state,memories:seed.memories},'career-test');
const run=async(c,tool,args,eventId='test')=>{const out=await engine.reduce(c,{tool,args,eventId});return{document:applyPatches(c,out.patches),result:out.result};};
async function until(c,tool,args,done,label){for(let i=0;i<120;i++){const row=await run(c,tool,args,`${label}_${i}`);if(done(row))return row;}throw new Error(`${label}夹具未出现成功`);}
// A minimal draft for feeding the subscriber one settled call directly.
const draft=document=>({document,get(...path){return path.reduce((o,k)=>o?.[k],this.document);},set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);},messages:[],say(text){this.messages.push(text);}});
const career=id=>world.careers[id];
const atMentor=c=>{c.state.location='bld_hw_riverhome';c.state.npcs.npc_hw_xuling.location=c.state.location;return c;};

test('指标：实战、杀生、地点、公共工程与研究完成由世界事件统计，关键实战与研究留下突破凭据',async()=>{
    let c=fresh();c.state.npcs.npc_hw_linsui.hp=1;c.state.professions.combat='profession_warrior';
    c.state.skills.skill_warrior_combat_01={proficiency:299,breakthroughs:[],daily:{}};
    for(let i=0;i<20&&c.state.npcs.npc_hw_linsui.status!=='死亡';i++)c=(await run(c,'world_combat',{target:'林穗'},`fight_${i}`)).document;
    const m=c.state.careerMetrics,fights=Object.values(m.battles).reduce((a,b)=>a+b,0);
    assert.equal(m.kills,1);assert.equal(m.lastKill,c.state.minute);assert.ok(fights>=1);assert.ok(m.visited[c.state.location]);
    const battle=Object.values(m.evidence).find(row=>row.kind==='battle');assert.deepEqual(battle.skills,{skill_warrior_combat_01:0});
    c.state.records.authorized={category:'authorization',settlement:'loc_hw'};
    c=(await run(c,'world_settlement',{settlement:'河湾村',authorization:'authorized',operation:'start_project',wood:5,days:2,name:'补桥'},'bridge')).document;
    c=(await run(c,'world_time',{minutes:2880},'days')).document;
    assert.equal(c.state.careerMetrics.counters.publicProjects,1);
    c.state.skills.skill_light.proficiency=300;c.state.professions.combat='profession_mage';
    c.state.projects.research_fixture={id:'research_fixture',type:'研究',name:'光点',concept:'测试',skills:['skill_light'],stage:'原型',progress:2,investment:0,days:[1,2,3],result:null};
    const done=await until(c,'world_research',{project:'research_fixture'},row=>row.result.stage==='打磨','research');
    assert.equal(done.document.state.careerMetrics.counters.researchCompleted,1);
    assert.deepEqual(done.document.state.careerMetrics.evidence['research:research_fixture'].skills,{skill_light:1});
    // Legacy replays never count.
    const d=draft(fresh());recordCareerMetrics(d,engine,[{id:'x',verb:'craft',actor:'player'}],{tool:'craft',detail:{success:true},before:d.document.state,legacy:true});
    assert.equal(d.document.state.careerMetrics,undefined);
});

test('指标：制作、抄书、救治、驯养与守约按事件计数；元素按法术特征归类',async()=>{
    const c=fresh(),d=draft(c),before=structuredClone(c.state),book=world.recipes.find(row=>world.items.find(item=>item.id===row.output?.item)?.book);
    d.document=applyPatches(d.document,[{op:'set',path:['state','obligations','o1'],value:{type:'送货',promisor:'player',promisee:'npc_hw_linsui',status:'已完成'}},{op:'set',path:['state','pets','creature_a'],value:{petFormat:1}}]);
    const prior={...before,obligations:{...before.obligations,o1:{type:'送货',promisor:'player',promisee:'npc_hw_linsui',status:'进行中'}}};
    recordCareerMetrics(d,engine,[{id:'e1',verb:'craft',actor:'player',tool:'craft'}],{tool:'craft',args:{},detail:{success:true,recipe:book?.id},before:prior,eventId:'e1'});
    recordCareerMetrics(d,engine,[{id:'e2',verb:'help',actor:'player',target:'npc_hw_linsui',tags:['magic','heal'],tool:'cast'}],{tool:'cast',args:{},detail:{},before:d.document.state,eventId:'e2'});
    const counters=d.document.state.careerMetrics.counters;
    assert.equal(counters.craftSuccesses,1);if(book)assert.equal(counters.booksCopied,1);
    assert.equal(counters.promisesKept,1);assert.equal(counters.contractsCompleted,1);assert.equal(counters.tamedCreatures,1);assert.equal(counters.healingSuccesses,1);
    assert.ok(spellElements(world.spells.find(row=>row.id==='spell_fire_08')).includes('fire'));
});

test('契机：条件达成且到10级才提示一次；取得需完成经历检定，唯一性与重试等待生效，并得到终极技能',async()=>{
    const role=world.professions.find(row=>row.name==='寒炉工师');
    let c=fresh();c.state.careerMetrics={since:0,counters:{craftSuccesses:role.trigger.minimum},visited:{},battles:{},elements:{},students:{},kills:0,lastKill:null,evidence:{},opportunities:{},attempts:{}};
    await assert.rejects(run(c,'world_profession',{profession:role.name},'early'),/至少10级/);
    const low=await run(c,'world_time',{minutes:1},'low');assert.ok(!low.result.messages.some(text=>text.includes('契机')));
    c.state.player.level=10;
    const hint=await run(c,'world_time',{minutes:1},'hint');
    assert.ok(hint.result.messages.some(text=>text.includes('隐约感到某种契机')&&text.includes(role.name)));
    const again=await run(hint.document,'world_time',{minutes:1},'again');assert.ok(!again.result.messages.some(text=>text.includes('契机')));
    assert.equal(catalogDefinition(engine,hint.document,{entity:role.id}).opportunity,true);
    // Full world capacity: no place left.
    const full=structuredClone(hint.document);Object.keys(full.state.npcs).slice(0,role.capacity).forEach(id=>{full.state.npcs[id].hiddenProfessions=[role.id];full.state.npcs[id].status='正常';});
    await assert.rejects(run(full,'world_profession',{profession:role.name},'full'),/已无空缺/);
    // No opportunity and metric unmet: refused.
    const none=structuredClone(c);none.state.careerMetrics.counters.craftSuccesses=1;
    await assert.rejects(run(none,'world_profession',{profession:role.name},'none'),/独立触发条件/);
    let failed=null,acquired=null;
    for(let i=0;i<120&&!(failed&&acquired);i++){const row=await run(hint.document,'world_profession',{profession:role.name},`init_${i}`);if(row.result.acquired)acquired??=row;else failed??=row;}
    assert.ok(failed&&acquired);
    assert.equal(failed.document.state.minute-hint.document.state.minute,career(role.id).initiationCheck.minutes);
    await assert.rejects(run(failed.document,'world_profession',{profession:role.name},'retry'),/时日/);
    const s=acquired.document.state;assert.deepEqual(s.professions.hidden,[role.id]);assert.equal(s.careers[role.id].certification.experience,role.initiation);
    assert.equal(s.skills[career(role.id).ultimate.skill].source.type,'hidden_profession');assert.equal(acquired.result.ultimate,career(role.id).ultimate.skill);
    await assert.rejects(run(acquired.document,'world_profession',{profession:role.name},'twice'),/已经取得/);
    assert.deepEqual(Object.keys(catalogDefinition(engine,acquired.document,{entity:role.id})).sort(),['ability','cost','id','name']);
});

test('变异升职：十二战斗职业每阶至少两条地域、元素或信仰路线；条件可观察，未达成拒绝，达成后经考核取得',async()=>{
    for(const row of world.professions.filter(p=>p.kind==='combat')){
        const c=career(row.id);assert.equal(c.variants.length,row.promotions.length);
        assert.ok(c.variants.every(step=>step.length>=2)&&row.promotions.every(step=>step.choices.length===2));
        assert.ok(c.variants[0].every(v=>['region','element','faith'].includes(v.variant.kind)&&v.variant.minimum>0&&v.variant.description));
        assert.ok(c.entryTask.name&&c.ultimate.task.name);
    }
    const role=world.professions.find(row=>row.id==='profession_mage'),fire=career(role.id).variants[0].find(v=>v.variant.key==='fire');
    const c=atMentor(fresh());c.state.professions.combat=role.id;c.state.player.level=30;c.state.player.coins=1000;
    c.state.skills[fire.requiredSkill]={proficiency:100,breakthroughs:[],daily:{}};
    c.state.careerMetrics={since:0,counters:{},visited:{},battles:{},elements:{fire:fire.variant.minimum-1},students:{},kills:0,lastKill:null,evidence:{},opportunities:{},attempts:{}};
    await assert.rejects(run(c,'world_profession',{profession:'法师',teacher:'许苓',operation:'promote',choice:fire.id},'short'),/变异路线条件未满足/);
    c.state.careerMetrics.elements.fire=fire.variant.minimum;
    const done=await until(c,'world_profession',{profession:'法师',teacher:'许苓',operation:'promote',choice:fire.id},row=>row.result.promoted,'variant');
    const history=done.document.state.careers[role.id].promotions;assert.equal(history[0].name,fire.name);assert.equal(history[0].variant.key,'fire');
    assert.equal(done.document.state.player.coins,1000-fire.fee);
    // Region routes count real exchanges at matching places (name, terrain or parent).
    const coast=career('profession_warrior').variants[0].find(v=>v.variant.kind==='region'&&v.variant.key==='海岸');
    assert.equal(variantProgress(engine,{minute:0,careerMetrics:{battles:{site_salt_reeds:3,bld_hw_qingdeng:5},elements:{},counters:{}}},coast.variant),3);
});

test('突破：杰作、研究完成、关键实战三种凭据各用一次，仅限同一阶段同一技能',async()=>{
    const c=fresh();c.state.professions.combat='profession_mage';c.state.skills.skill_light.proficiency=299;
    const d=draft(structuredClone(c)),recipe=world.recipes.find(row=>row.skill==='skill_light')??{id:'recipe_fixture',skill:'skill_light'};
    if(!world.recipes.includes(recipe)){world.recipes.push({...recipe,name:'夹具',output:{item:'item_staff',quantity:1}});engine.byId.set(recipe.id,world.recipes.at(-1));}
    recordCareerMetrics(d,engine,[{id:'m1',verb:'craft',actor:'player',tool:'craft'}],{tool:'craft',args:{},detail:{success:true,degree:'大成功',recipe:recipe.id},before:c.state,eventId:'m1'});
    const metrics=d.document.state.careerMetrics;
    assert.deepEqual(metrics.evidence['masterpiece:m1'].skills,{skill_light:0});
    metrics.evidence['research:r1']={kind:'research',skills:{skill_light:0},minute:0};metrics.evidence['battle:b1']={kind:'battle',skills:{skill_light:1},minute:0};
    c.state.careerMetrics=metrics;
    const capped=await run(c,'world_practice',{skill:'照明术',target:'墙'},'cap');assert.deepEqual(capped.result.breakthroughPaths.sort(),['杰作','研究完成'].sort());
    const master=await run(c,'world_practice',{skill:'照明术',breakthroughSource:'杰作'},'bt1');
    assert.equal(master.result.breakthrough,true);assert.equal(master.result.path,'masterpiece');assert.deepEqual(master.document.state.skills.skill_light.breakthroughs,[1]);
    assert.ok(master.document.state.careerMetrics.evidence['masterpiece:m1'].usedFor);
    await assert.rejects(run(master.document,'world_practice',{skill:'照明术',breakthroughSource:'杰作'},'reuse'),/杰作记录/);
    const research=await run(c,'world_practice',{skill:'照明术',breakthroughSource:'研究'},'bt2');assert.equal(research.result.path,'research');
    // Battle evidence was earned at stage 1: not usable for the 299 cap, usable at 599.
    await assert.rejects(run(c,'world_practice',{skill:'照明术',breakthroughSource:'实战'},'bt3'),/关键实战记录/);
    const later=structuredClone(master.document);later.state.skills.skill_light.proficiency=599;
    const battle=await run(later,'world_practice',{skill:'照明术',breakthroughSource:'实战'},'bt4');
    assert.equal(battle.result.path,'battle');assert.deepEqual(battle.document.state.skills.skill_light.breakthroughs,[1,2]);
    const mid=structuredClone(c);mid.state.skills.skill_light.proficiency=200;
    await assert.rejects(run(mid,'world_practice',{skill:'照明术',breakthroughSource:'研究'},'early'),/阶段上限/);
    const uncertified=structuredClone(c);uncertified.state.professions.combat='';
    await assert.rejects(run(uncertified,'world_practice',{skill:'照明术',breakthroughSource:'研究'},'uncert'),/未认证/);
});

test('终极技能：职业任务需三次升职、核心技能900、考官与费用；入职任务记录在认证中',async()=>{
    const role=world.professions.find(row=>row.id==='profession_mage');
    const c=atMentor(fresh());c.state.player.level=10;c.state.player.coins=2000;c.state.skills.skill_light.proficiency=100;
    const joined=await until(c,'world_profession',{profession:'法师',teacher:'许苓'},row=>row.result.certified,'join');
    assert.equal(joined.result.entryTask,career(role.id).entryTask.name);assert.equal(joined.document.state.careers[role.id].certification.task,career(role.id).entryTask.name);
    const u=(await run(joined.document,'world_time',{until:{dayOffset:1,hour:8}},'morning')).document;u.state.player.level=90;u.state.skills.skill_light.proficiency=900;
    u.state.careers[role.id].promotions=role.promotions.slice(0,2).map(step=>({...step.choices[0],level:step.level}));
    await assert.rejects(run(u,'world_profession',{profession:'法师',teacher:'许苓',operation:'promote',choice:'终极技能'},'two'),/3次升职/);
    u.state.careers[role.id].promotions.push({...role.promotions[2].choices[0],level:90});
    const coins=u.state.player.coins;
    const done=await until(u,'world_profession',{profession:'法师',teacher:'许苓',operation:'promote',choice:'终极技能'},row=>row.result.ultimate,'ultimate');
    const s=done.document.state;assert.equal(s.skills[career(role.id).ultimate.skill].source.type,'profession_task');assert.equal(s.player.coins,coins-career(role.id).ultimate.fee);
    assert.equal(s.careers[role.id].ultimate.task,career(role.id).ultimate.task.name);
    await assert.rejects(run(done.document,'world_profession',{profession:'法师',teacher:'许苓',operation:'promote',choice:'终极技能'},'again'),/已经掌握/);
});
