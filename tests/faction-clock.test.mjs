import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {CampaignStorage,applyPatches} from '../server-plugin/storage.mjs';
import {assertFactionClockRules,factionClockRules} from '../server-plugin/faction-clock.mjs';
import {assertWorldClockRules} from '../server-plugin/world-clock.mjs';
import {toolDefinitions} from '../extension/tools.mjs';

const source=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),DAY=1440;
const owner='faction_saltboat',peer='faction_riverhomes',location='loc_hw_dock';
const relation=(delta=10)=>({kind:'relation',target:peer,delta});
const stage=(id,effect=relation(),cost={coins:3,items:{item_oats:2}},condition={kind:'always'})=>({id,name:id,condition,cost,effect});
function setup(stages=[stage('start')],{intervalDays=1,probability=1}={}){
 const world=structuredClone(source);for(const npc of world.npcs){delete npc.tier;delete npc.schedule;}
 // Isolate the authored test rule from settlement clocks published in the catalog.
 for(const f of world.factions)if(f.clock?.stages){const {settlement,source,cycle,stages,contact,interventions,...plan}=f.clock;f.clock=plan;}
 const f=world.factions.find(f=>f.id===owner);f.resources.treasuryCopper=40;f.resources.items={item_oats:10};
 const other=world.factions.find(f=>f.id===peer);other.resources.treasuryCopper=50;other.resources.items={item_oats:0};
 const rule={id:'test_plan',faction:owner,settlement:'loc_hw',source:'test authored runtime',intervalDays,probability,stages,
  contact:{location,representative:f.leader},interventions:[
   {id:'stop',stage:stages[0].id,location,minutes:10,cost:{coins:2},effect:'pause'},
   {id:'continue',stage:stages[0].id,location,minutes:10,cost:{coins:1},effect:'resume'},
  ]};
 world.rules.factionClock={version:1,clocks:[rule]};
 const engine=new WorldEngine(world),doc=engine.createCharacter(legacy,{},'faction-test');
 const run=async(doc,tool,args,eventId='event')=>{const out=await engine.reduce(doc,{tool,args,eventId});return {doc:applyPatches(doc,out.patches),out};};
 const wait=async(doc,minutes,id='wait')=>(await run(doc,'world_time',{minutes},id)).doc;
 return {world,engine,doc,rule,run,wait,f};
}
const clock=doc=>doc.state.records['faction-clock:test_plan'];
const assets=(doc,id=owner)=>doc.state.records[`faction-assets:${id}`];
const accounts=doc=>Object.fromEntries(Object.entries(doc.state.records).filter(([,r])=>['faction_clock','faction_assets','faction_event'].includes(r.category)));
function atContact(s,doc=s.doc){
 const next=structuredClone(doc);next.state.location=location;
 next.state.npcs[s.f.leader]={name:s.f.leader,location,status:'正常',coins:0,hp:10,maxHp:10,activity:'登记',trust:0,developments:[]};return next;
}

test('旧文字计划不执行；运行参数与未知效果明确拒绝，不以名册生成NPC',()=>{
 // Only factions that publish runtime stages execute; declarative W5 plans never do.
 const published=factionClockRules(new WorldEngine(source));
 assert.ok(published.every(r=>source.factions.find(f=>f.id===r.faction)?.clock?.stages===r.stages));
 assert.deepEqual(published.filter(r=>!source.factions.find(f=>f.id===r.faction)?.clock?.stages),[]);
 assert.ok(!published.some(r=>[owner,peer].includes(r.faction)));
 const s=setup();assert.doesNotThrow(()=>assertFactionClockRules(s.engine));
 for(const mutate of [r=>r.intervalDays=2,r=>r.stages[0].effect={kind:'made_up'},r=>r.stages[0].cost.items.item_oats=-1,r=>r.stages[0].cost={labor:5},r=>r.stages[0].condition={kind:'made_up'}]){
  const c=setup();mutate(c.rule);assert.throws(()=>assertFactionClockRules(c.engine));
 }
 s.rule.stages=[stage('awaken',{kind:'awakening',target:'animal'})];for(const i of s.rule.interventions)i.stage='awaken';
 assert.doesNotThrow(()=>assertFactionClockRules(s.engine));
 s.rule.stages=[stage('awaken',{kind:'awakening',target:'animal',points:0})];assert.throws(()=>assertFactionClockRules(s.engine),/觉醒效果点数无效/);
 delete s.engine.wildlifeAwakening;assert.throws(()=>assertFactionClockRules(s.engine),/觉醒效果未实现.*T160/);
});

test('日阶段付真实钱粮，关系和争端变更有回执；不注入远方现场或消息',async()=>{
 const s=setup([stage('contact'),stage('argue',{kind:'dispute',target:peer,id:'shore',status:'open'}),
  stage('settle',{kind:'dispute',target:peer,id:'shore',status:'settled'},{coins:2},{kind:'dispute',target:peer,id:'shore',status:'open'})]);
 const before=structuredClone(s.doc),after=await s.wait(s.doc,3*DAY-s.doc.state.minute);
 assert.deepEqual(s.doc,before);assert.equal(clock(after).phase,3);
 assert.equal(assets(after).coins,32);assert.equal(assets(after).items.item_oats,6);
 assert.equal(assets(after).relations[peer],s.f.relations.find(r=>r.faction===peer).score+10);
 assert.equal(assets(after).disputes[`${peer}:shore`].status,'settled');
 assert.equal(assets(after).ledger.reduce((n,e)=>n+e.coins,0),-8);
 assert.equal(new Set(clock(after).history.map(e=>e.sourceEvent)).size,3);
 assert.ok(clock(after).history.every(e=>after.state.records[e.sourceEvent]?.category==='faction_event'&&e.scope==='regional'));
 assert.deepEqual(Object.keys(after.state.npcs),Object.keys(before.state.npcs));assert.deepEqual(after.state.created,before.state.created);
 assert.equal(after.state.player.coins,before.state.player.coins);assert.deepEqual(after.memories,before.memories);
 assert.ok(!Object.values(after.state.npcs).some(n=>n.memoryStream?.some(m=>m.sourceEvent?.startsWith('faction-clock:'))));
});

test('阶段钱粮不足、关系门槛或概率不满足时无扣费或部分效果',async()=>{
 for(const cost of [{coins:41},{items:{item_oats:11}}]){
  const s=setup([stage('short',relation(),cost)]),after=await s.wait(s.doc,2*DAY);
  assert.equal(clock(after).phase,0);assert.match(clock(after).blocked,/资源不足/);assert.equal(assets(after).coins,40);
  assert.equal(assets(after).items.item_oats,10);assert.equal(assets(after).ledger.length,0);
 }
 for(const options of [{probability:0},{}]){
  const s=setup([stage('blocked',relation(),{coins:3},{kind:'relation',target:peer,minimum:100})],options);
  const after=await s.wait(s.doc,3*DAY);assert.equal(clock(after).phase,0);assert.equal(assets(after).ledger.length,0);
 }
 const s=setup([stage('zero')],{probability:0}),after=await s.wait(s.doc,3*DAY);
 assert.equal(clock(after).phase,0);assert.equal(assets(after).coins,40);
});

test('真实双边交易钱粮守恒；买方不足则连同前置关系效果与代价回滚',async()=>{
 const trade={kind:'trade',target:peer,item:'item_oats',quantity:3,unitPrice:4};
 const s=setup([stage('sale',trade,{coins:2})]),after=await s.wait(s.doc,DAY);
 assert.equal(assets(after).items.item_oats,7);assert.equal(assets(after,peer).items.item_oats,3);
 assert.equal(assets(after).coins,50);assert.equal(assets(after,peer).coins,38);
 assert.equal(assets(after).coins+assets(after,peer).coins,88);
 const bad=setup([{...stage('bad'),effects:[relation(),{...trade,unitPrice:100}]}]),refused=await bad.wait(bad.doc,DAY);
 assert.equal(clock(refused).phase,0);assert.equal(assets(refused).coins,40);assert.equal(assets(refused).items.item_oats,10);
 assert.equal(assets(refused).relations[peer],bad.f.relations.find(r=>r.faction===peer).score);
 assert.equal(assets(refused,peer),undefined);assert.equal(assets(refused).ledger.length,0);
});

test('长短步日周结果一致，旧档不补过去，年循环仅在到期边界重置',async()=>{
 for(const intervalDays of [1,7]){
  const s=setup([stage('a'),stage('b'),stage('c')],{intervalDays,probability:0.45});
  // Existing-save fixture: align daily cursors without inventing past yields.
  s.doc.state.minute=355*DAY+540;
  for(const row of Object.values(s.doc.state.records))if(Number.isSafeInteger(row.lastDay))row.lastDay=354;
  s.rule.cycle='year';
  const big=await s.wait(s.doc,30*DAY,'big');let split=s.doc;
  for(let i=0;i<30;i++)split=await s.wait(split,DAY,`small-${i}`);
  assert.deepEqual(accounts(split),accounts(big));assert.ok(clock(big).history.every(e=>e.minute>s.doc.state.minute));
  assert.equal(clock(big).year,2);assert.ok(clock(big).nextAt>big.state.minute);
 }
 const s=setup([stage('only')]),after=await s.wait(s.doc,30*DAY);
 assert.equal(clock(after).history.length,1);assert.equal(assets(after).ledger.length,1);
});

test('玩家在登记地点付代价暂停、继续与改道，供资从私有账转入势力账',async()=>{
 const s=setup([stage('original'),stage('alternative',relation(1))]);
 s.rule.interventions.push({id:'redirect',stage:'original',location,minutes:10,cost:{coins:1},effect:'redirect',nextStage:'alternative'});
 assert.ok(toolDefinitions().find(t=>t.function.name==='world_settlement').function.parameters.properties.operation.enum.includes('faction_intervene'));
 await assert.rejects(s.run(s.doc,'world_settlement',{operation:'faction_intervene',clock:s.rule.id,choice:'stop'}),/登记地点/);
 let doc=atContact(s);const coins=doc.state.player.coins;
 doc=(await s.run(doc,'world_settlement',{operation:'faction_intervene',clock:s.rule.id,choice:'stop'},'stop')).doc;
 assert.equal(doc.state.player.coins,coins-2);doc=await s.wait(doc,DAY,'paused');assert.equal(clock(doc).phase,0);assert.equal(assets(doc).coins,40);
 doc=(await s.run(doc,'world_settlement',{operation:'faction_intervene',clock:s.rule.id,choice:'continue'},'continue')).doc;
 assert.equal(clock(doc).paused,false);
 const after=await s.wait(doc,DAY,'resume');assert.equal(clock(after).phase,1);
 let redirected=atContact(s);redirected=(await s.run(redirected,'world_settlement',{operation:'faction_intervene',clock:s.rule.id,choice:'redirect'},'redirect')).doc;
 redirected=await s.wait(redirected,DAY,'alternative');assert.equal(clock(redirected).history[0].stage,'alternative');assert.equal(clock(redirected).history.length,1);
 let contributed=atContact(s);contributed=(await s.run(contributed,'world_settlement',{operation:'faction_contribute',clock:s.rule.id,coins:2},'donation')).doc;
 assert.equal(assets(contributed).coins,42);assert.equal(contributed.state.player.coins,coins-2);
 assert.equal(assets(contributed).ledger[0].kind,'player_contribution');
 const noRepresentative=structuredClone(contributed);delete noRepresentative.state.npcs[s.f.leader];
 await assert.rejects(s.run(noRepresentative,'world_settlement',{operation:'faction_contribute',clock:s.rule.id,coins:1}),/代表未清醒在场/);
});

test('觉醒接口消费原生态个体；未实现或消费者拒绝不改身份与阶段',async()=>{
 const s=setup([stage('awaken',{kind:'awakening',target:'test_animal'},{coins:2})]);
 s.engine.wildlifeAwakening={validate(){},apply(d,engine,effect,context){
  const actor=d.get('state','creatures',effect.target);
  d.set(['state','creatures',effect.target],{...actor,awakened:true,sourceEvent:context.sourceEvent});return {applied:true,target:effect.target};
 }};
 s.doc.state.created.test_animal={id:'test_animal',name:'原个体',monster:'monster_red_ear_fox'};
 s.doc.state.creatures={test_animal:{species:'monster_red_ear_fox',ecology:'habitat_hw_wood',location:'loc_hw_northwood',owner:'player',hp:10,maxHp:10,status:'正常'}};
 const population=s.doc.state.records['ecology:habitat_hw_wood'].populations.monster_red_ear_fox;population.count--;population.withdrawn++;
 const before=structuredClone(s.doc),after=await s.wait(s.doc,DAY);
 assert.equal(after.state.creatures.test_animal.awakened,true);assert.deepEqual(Object.keys(after.state.creatures),Object.keys(before.state.creatures));
 assert.deepEqual(after.state.created,before.state.created);assert.deepEqual(Object.keys(after.state.npcs),Object.keys(before.state.npcs));
 assert.equal(after.state.records['ecology:habitat_hw_wood'].populations.monster_red_ear_fox.withdrawn,population.withdrawn);
 assert.equal(clock(after).phase,1);assert.equal(assets(after).coins,38);
 s.engine.wildlifeAwakening.apply=(d,engine,effect)=>{d.remove(['state','creatures',effect.target]);return {applied:false,reason:'尚未具备经历'};};
 const declined=await s.wait(s.doc,DAY);assert.equal(clock(declined).phase,0);assert.equal(assets(declined).coins,40);
 assert.equal(declined.state.creatures.test_animal.hp,10);assert.equal(assets(declined).ledger.length,0);
 delete s.engine.wildlifeAwakening;
 await assert.rejects(s.wait(s.doc,DAY),/觉醒效果未实现.*T160/);assert.deepEqual(s.doc,before);
 // world-clock uses the same consumer, rather than treating awakening as a quote.
 const w=setup();const r=w.world.rules.worldClock.clocks[0];r.intervalDays=1;r.stages=[{name:'开灵',condition:{kind:'managed_granary'},effect:{kind:'awakening',target:'test_animal'}}];
 assert.doesNotThrow(()=>assertWorldClockRules(w.engine));delete w.engine.wildlifeAwakening;
 assert.throws(()=>assertWorldClockRules(w.engine),/觉醒效果未实现/);
 w.engine.wildlifeAwakening={validate(){},apply(d,engine,effect,context){d.set(['state','creatures',effect.target,'awakened'],context.sourceEvent);return {applied:true};}};
 w.doc.state.created.test_animal=before.state.created.test_animal;w.doc.state.creatures={test_animal:before.state.creatures.test_animal};
 const awakened=await w.wait(w.doc,DAY);assert.match(awakened.state.creatures.test_animal.awakened,/world-clock:/);
 assert.equal(awakened.state.records[`world-clock:${r.id}`].phase,1);
});

test('后续社会消费者取得有代价的阶段上下文与可追溯回执',async()=>{
 const s=setup([stage('society',{kind:'society',target:'community'},{coins:4,items:{item_oats:1}})]);
 s.engine.factionEffectConsumers={society:{validate(engine,effect){assert.equal(effect.target,'community');},apply(d,engine,effect,context){
  assert.equal(context.scope,'regional');d.set(['state','records','community'],{...effect,minute:context.minute,sourceEvent:context.sourceEvent});return {applied:true,target:effect.target};
 }}};
 const after=await s.wait(s.doc,DAY);assert.equal(assets(after).coins,36);assert.equal(assets(after).items.item_oats,9);
 assert.equal(after.state.records.community.sourceEvent,clock(after).history[0].sourceEvent);
});

test('存档重复事务与回放不重复阶段扣耗或干预代价',async t=>{
 const s=setup(),root=await fs.mkdtemp(path.join(os.tmpdir(),'faction-clock-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const storage=new CampaignStorage(root,{reducer:s.engine.reduce.bind(s.engine)});
 const document=atContact(s);await storage.create({id:'clock',worldVersion:s.doc.worldVersion,document});
 const input={tool:'world_settlement',args:{operation:'faction_intervene',clock:s.rule.id,choice:'stop'},eventId:'stop'};
 const reducer=s.engine.reduce.bind(s.engine),request={id:'stop',anchor:'stop-anchor',input};
 const first=await storage.transact('clock',request,reducer);
 const duplicate=await storage.transact('clock',request,reducer);
 assert.equal(duplicate.duplicate,true);assert.deepEqual(first.result,duplicate.result);
 const view=await storage.read('clock');const fresh=new CampaignStorage(root,{reducer});
 assert.deepEqual((await fresh.read('clock')).document,view.document);
 const replay=await s.engine.reduce(document,input,{replay:true,result:first.result});assert.deepEqual(applyPatches(document,replay.patches),view.document);
 assert.equal(clock(view.document).interventions.length,1);
 assert.deepEqual((await storage.reconcile('clock',[],null)).document,document);
});

test('目录内运行阶段经正式schema接受，共用势力资产；旧事务回放不补新阶段',async()=>{
 const s=setup();s.world.rules.factionClock.clocks=[];s.f.clock={...s.f.clock,...s.rule};delete s.f.clock.faction;
 const {default:Ajv}=await import('ajv');const schema=JSON.parse(await fs.readFile('schemas/world.schema.json','utf8'));
 const validate=new Ajv({allErrors:true,strict:true,allowUnionTypes:true}).compile(schema);
 assert.equal(validate(s.world),true,JSON.stringify(validate.errors));
 const second={...s.rule,id:'another',stages:[stage('second',relation(2),{coins:1})],interventions:[]};s.world.rules.factionClock.clocks=[second];
 const after=await s.wait(s.doc,DAY);assert.equal(assets(after).coins,36);assert.equal(assets(after).items.item_oats,8);
 assert.equal(Object.values(after.state.records).filter(r=>r.category==='faction_assets').length,1);
 const old=await s.engine.reduce(s.doc,{tool:'world_time',args:{minutes:DAY},eventId:'old'},{replay:true,result:{}});
 assert.deepEqual(accounts(applyPatches(s.doc,old.patches)),{});
});
