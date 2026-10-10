import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {loadWorld} from '../tools/load-world.mjs';
import {withAgricultureRules} from '../world/design/agriculture-foundation.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {CampaignStorage,applyPatches} from '../server-plugin/storage.mjs';
import {initializeAgriculture,planAgricultureMigration} from '../server-plugin/agriculture-migration.mjs';
import {validateWorld} from '../tools/validate-world.mjs';
import {weatherAt} from '../server-plugin/weather.mjs';
const legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const source=withAgricultureRules(await loadWorld());
const record=c=>c.state.records['agriculture:loc_hw'];
function setup(seed='agriculture-test'){
    const world=structuredClone(source),engine=new WorldEngine(world),c=engine.createCharacter(legacy,{},seed);
    const run=async(doc,tool,args,id)=>{const out=await engine.reduce(doc,{tool,args,eventId:id});return {document:applyPatches(doc,out.patches),result:out.result};};
    return{world,engine,c,run};
}
function conservation(c){
    const r=record(c),s=c.state.settlements.loc_hw,l=r.ledger;
    assert.equal(r.batches.reduce((a,b)=>a+b.amount,0),s.food);
    assert.equal(r.field.seedBatches.reduce((a,b)=>a+b.amount,0),r.field.seedBank);
    assert.equal(l.openingFood+l.openingSeed+l.freshProduced+l.harvested+l.donated,
        s.food+r.field.seedBank+l.eaten+l.spoiled+l.overflow+l.seedSpent+l.sold);
    assert.ok(s.food+r.field.seedBank<=r.granary.capacity,'食粮与种粮共同占仓容');
}
function atCounter(c){c.state.location='bld_hw_council';c.state.minute=Math.floor(c.state.minute/1440)*1440+540;
    c.state.npcs.npc_hw_chenbai.location='bld_hw_council';c.state.npcs.npc_hw_chenbai.status='正常';c.state.npcs.npc_hw_chenbai.activity='办公';}
test('农业引用、种粮、仓容及保存条件校验，不把任意食物转换为粮种',()=>{
    assert.equal(validateWorld(source).ok,true);
    for(const mutate of [w=>w.rules.agriculture.grainItem='item_ration',w=>w.rules.agriculture.settlements[0].manager='npc_missing',
        w=>w.rules.agriculture.settlements[0].initialSeed=1,w=>w.rules.agriculture.settlements[0].granaryCapacity=1,
        w=>w.rules.agriculture.crop.sowDays=[25,5],w=>w.rules.agriculture.settlements[0].protectedStorageDays=999]){
        const bad=structuredClone(source);mutate(bad);assert.equal(validateWorld(bad).ok,false);
    }
});
test('新战役按源建粮账；旧存档迁移保留财物和记忆，幂等且拒绝编号冲突',()=>{
    const{engine,c}=setup();assert.equal(c.state.settlements.loc_hw.food,8000);assert.equal(record(c).field.seedBank,1680);conservation(c);
    assert.throws(()=>initializeAgriculture(engine,c),/重复/);
    const old=engine.initialFromLegacy(legacy,'import',{prepare:false}),before=structuredClone(old),patches=planAgricultureMigration(old,engine.rules);
    const migrated=applyPatches(old,patches);assert.deepEqual(old,before);assert.deepEqual(migrated.state.player,old.state.player);
    assert.deepEqual(migrated.state.inventory,old.state.inventory);assert.deepEqual(migrated.memories,old.memories);
    assert.deepEqual(migrated.state.settlements,old.state.settlements);assert.equal(migrated.state.minute,old.state.minute);
    assert.equal(record(migrated).mode,'legacy');assert.equal(record(migrated).field.seedBank,0);assert.deepEqual(planAgricultureMigration(migrated,engine.rules),[]);
    record(migrated).format=2;assert.throws(()=>planAgricultureMigration(migrated,engine.rules),/冲突/);
    const late=structuredClone(old);late.state.minute=1440;assert.throws(()=>initializeAgriculture(engine,late),/第一日/);
});
test('实际春播消耗种粮；未成熟不产谷物，换年不补种子',async()=>{
    const{c,run}=setup();let doc=(await run(c,'world_time',{minutes:30*1440},'spring')).document;
    assert.equal(record(doc).field.seedBank,0);assert.equal(record(doc).ledger.seedSpent,1680);
    assert.equal(record(doc).ledger.harvested,0);assert.equal(record(doc).field.sownUnits,1400);conservation(doc);
    doc.state.location='loc_hw_fields';await assert.rejects(run(doc,'world_farm',{operation:'harvest'},'early'),/尚未成熟/);
    for(let i=0;i<12;i++)doc=(await run(doc,'world_time',{minutes:30*1440},`later_${i}`)).document;
    assert.ok(record(doc).ledger.harvested>0);assert.equal(record(doc).ledger.openingFood,8000);assert.equal(record(doc).ledger.openingSeed,1680);conservation(doc);
});
test('跨季长等待与每日结算的库存、粮种和全部农业账一致',async()=>{
    const{c,run}=setup();let long=c,split=c;
    for(let month=0;month<12;month++)long=(await run(long,'world_time',{minutes:30*1440},`month_${month}`)).document;
    for(let day=0;day<360;day++)split=(await run(split,'world_time',{minutes:1440},`day_${day}`)).document;
    assert.deepEqual(record(long),record(split));assert.deepEqual(long.state.settlements,split.state.settlements);conservation(long);
});
test('粮仓买卖、交粮和留种转移真实谷物与铜钱，并保留种粮原到期日',async()=>{
    const{c,run}=setup();atCounter(c);const coins=c.state.player.coins,treasury=c.state.settlements.loc_hw.treasury;
    let out=await run(c,'world_farm',{operation:'buy',quantity:2},'buy'),doc=out.document;
    assert.equal(doc.state.inventory.item_oats.quantity,2);assert.equal(doc.state.player.coins,coins-6);
    assert.equal(doc.state.settlements.loc_hw.treasury,treasury+6);assert.equal(doc.state.settlements.loc_hw.food,7998);conservation(doc);
    doc=(await run(doc,'world_farm',{operation:'donate',quantity:1},'donate')).document;
    assert.equal(doc.state.inventory.item_oats.quantity,1);assert.equal(record(doc).ledger.donated,1);conservation(doc);
    const oldExpiry=record(doc).batches[0].expiresDay;
    doc=(await run(doc,'world_farm',{operation:'reserve_seed',quantity:3},'reserve')).document;
    assert.equal(record(doc).field.seedBank,1683);assert.equal(record(doc).field.seedBatches.at(-1).expiresDay,oldExpiry);conservation(doc);
    await assert.rejects(run(doc,'world_farm',{operation:'buy',quantity:8000},'oversell'),/余粮/);
    await assert.rejects(run(doc,'world_farm',{operation:'donate',quantity:10},'fake_donate'),/行囊/);
});
test('柜台在场、清醒和开放要求；被拒操作不改变输入存档',async()=>{
    const{c,run}=setup();atCounter(c);
    for(const change of [d=>d.state.location='loc_hw',d=>d.state.npcs.npc_hw_chenbai.status='睡眠',
        d=>d.state.npcs.npc_hw_chenbai.location='loc_hw',d=>d.state.minute=60]){
        const doc=structuredClone(c);change(doc);const before=structuredClone(doc);
        await assert.rejects(run(doc,'world_farm',{operation:'buy',quantity:1},'refuse'),/需要本人|开放/);assert.deepEqual(doc,before);
    }
});
test('破损粮仓按原收获日缩短期限，过期粮食和种粮实际扣除，观察不重复扣月损耗',async()=>{
    const{c,run}=setup();record(c).granary.condition=40;
    let doc=c;doc=(await run(doc,'world_time',{minutes:29*1440},'day29')).document;
    const prior=structuredClone(doc);doc=(await run(doc,'world_farm',{operation:'inspect'},'inspect1')).document;
    doc=(await run(doc,'world_farm',{operation:'inspect'},'inspect2')).document;assert.deepEqual(doc,prior);
    doc=(await run(doc,'world_time',{minutes:1440},'expiry')).document;
    assert.ok(!record(doc).batches.some(b=>b.id==='source_opening'));assert.equal(record(doc).field.seedBank,0);
    assert.ok(record(doc).ledger.spoiled>0);conservation(doc);
});
test('缺劳力或农具会影响生产；修理确实消耗公共木铁，不能空口修复',async()=>{
    const{c,run}=setup();const noWorkers=structuredClone(c);noWorkers.state.settlements.loc_hw.population=1;
    const poor=(await run(noWorkers,'world_time',{minutes:30*1440},'poor')).document;assert.equal(record(poor).ledger.freshProduced,0);assert.equal(record(poor).field.sownUnits,0);
    const broken=structuredClone(c);record(broken).tools.condition=0;
    const noTool=(await run(broken,'world_time',{minutes:20*1440},'no_tool')).document;assert.equal(record(noTool).field.sownUnits,0);
    atCounter(broken);const wood=broken.state.settlements.loc_hw.wood,iron=broken.state.settlements.loc_hw.iron;
    const repaired=(await run(broken,'world_farm',{operation:'repair'},'repair')).document;
    assert.equal(record(repaired).tools.condition,20);assert.equal(repaired.state.settlements.loc_hw.wood,wood-2);assert.equal(repaired.state.settlements.loc_hw.iron,iron-1);
    broken.state.settlements.loc_hw.iron=0;await assert.rejects(run(broken,'world_farm',{operation:'repair'},'no_iron'),/实际公共/);
});
test('旧粮账显式切换保留原库存，不赠送种粮；旧世界缺农事规则保留原语义',async()=>{
    const{engine}=setup();let old=engine.initialFromLegacy(legacy,'old',{prepare:false});atCounter(old);
    // The adopt action belongs to verified historical replay; current games use R1.
    const run=async(doc,tool,args,eventId)=>({document:applyPatches(doc,(await engine.reduce(doc,{tool,args,eventId},{replay:true})).patches)});
    const originalFood=old.state.settlements.loc_hw.food;old=(await run(old,'world_farm',{operation:'adopt'},'adopt')).document;
    assert.equal(old.state.settlements.loc_hw.food,originalFood);assert.equal(record(old).field.seedBank,0);conservation(old);
    old=(await run(old,'world_farm',{operation:'reserve_seed',quantity:120},'old_seed')).document;assert.equal(record(old).field.seedBank,120);assert.equal(old.state.settlements.loc_hw.food,originalFood-120);conservation(old);
    const world=structuredClone(source);delete world.rules.agriculture;delete world.rules.wildlife.farmPests;const archived=new WorldEngine(world),doc=archived.createCharacter(legacy,{},'without_agri');assert.equal(record(doc),undefined);
});
test('志愿播种按实际检定与耗时执行，无私人赠粮，失败和越季不冒出作物',async()=>{
    const{engine,c,run}=setup();let day;
    for(let d=5;d<=25;d++)if(!['storm','snow'].includes(weatherAt(engine,c.randomSeed,'loc_hw_fields',d*1440+540).kind)){day=d;break;}
    let doc=(await run(c,'world_time',{minutes:day*1440},'reach_spring')).document;doc.state.location='loc_hw_fields';
    const before=structuredClone(doc),out=await run(doc,'world_farm',{operation:'sow'},'volunteer');
    assert.equal(out.document.state.minute,before.state.minute+90);assert.deepEqual(out.document.state.inventory,before.state.inventory);
    if(out.result.success){assert.ok(record(out.document).field.seedBank<record(before).field.seedBank);assert.ok(out.result.units>0);}else assert.deepEqual(record(out.document),record(before));
    conservation(out.document);doc.state.minute=40*1440+540;await assert.rejects(run(doc,'world_farm',{operation:'sow'},'late'),/播种窗口|雨雪/);
});
test('三年实际日结守恒；20个独立天气种子不饥荒，源开局资产仅记一次',async()=>{
    for(let n=0;n<20;n++){
        const{c,run}=setup(`agriculture-year-${n}`);let doc=c;
        for(let month=0;month<36;month++){doc=(await run(doc,'world_time',{minutes:30*1440},`m${month}`)).document;conservation(doc);
            assert.equal(doc.state.settlements.loc_hw.population,58,`seed ${n}, month ${month}`);assert.equal(doc.state.settlements.loc_hw.unmetMeals??0,0);}
        assert.equal(record(doc).ledger.openingFood,8000);assert.equal(record(doc).ledger.openingSeed,1680);
    }
});
test('农事库存随服务器重启、导出导入和删消息回滚保存，不再次发开局粮',async t=>{
    const{engine,c}=setup(),directory=await fs.mkdtemp(path.join(os.tmpdir(),'agriculture-store-'));
    t.after(()=>fs.rm(directory,{recursive:true,force:true}));const reducer=(doc,input)=>engine.reduce(doc,input),store=new CampaignStorage(directory,{reducer});
    await store.create({id:'farm',worldVersion:engine.world.version,document:c});
    await store.transact('farm',{id:'spring',anchor:'a1',input:{tool:'world_time',args:{minutes:30*1440},eventId:'spring'}},reducer);
    const saved=(await store.read('farm')).document;
    assert.deepEqual((await new CampaignStorage(directory,{reducer}).read('farm')).document,saved);
    assert.deepEqual((await store.import(await store.export('farm'),'copy')).document,saved);conservation(saved);
    assert.deepEqual((await store.reconcile('farm',[],null)).document,c);conservation((await store.read('farm')).document);
});
test('满仓收获先保住下一季种粮，食粮与种粮合计不能突破仓容',async()=>{
    // Isolated mature-crop boundary fixture; not proof of acquiring crops in normal play.
    const{c,run}=setup();const r=record(c);r.granary.capacity=9680;r.field.seedBank=0;r.field.seedBatches=[];
    r.ledger.seedSpent=1680;c.state.settlements.loc_hw.food=9680;r.batches[0].amount=9680;r.ledger.donated=1680;
    r.field.cohorts=[{id:'mature-fixture',sownDay:0,areaUnits:100,grownDays:180,qualitySum:180,qualityDays:180,ready:true,harvestedUnits:0,harvestedFood:0}];
    const doc=(await run(c,'world_time',{minutes:1440},'full_harvest')).document;
    assert.ok(record(doc).field.seedBank>0);conservation(doc);assert.ok(record(doc).ledger.overflow>0);
});
test('加工劳力不足时先吃鲜食，谷物食用不得超过实际加工额度',async()=>{
    const{world,c}=setup();world.rules.agriculture.settlements[0].processingPerWorker=1;
    const engine=new WorldEngine(world);record(c).batches[0].id='donation-fixture';record(c).batches[0].expiresDay=1;
    const out=await engine.reduce(c,{tool:'world_time',args:{minutes:1440},eventId:'limited_processing'}),doc=applyPatches(c,out.patches);
    const report=record(doc).lastReport;assert.ok(report.fresh>0);
    assert.equal(report.grainEaten,Math.min(2,58-report.fresh));assert.equal(report.freshEaten,Math.min(58,report.fresh));
    assert.equal(report.eaten,report.freshEaten+report.grainEaten);conservation(doc);
});
test('独立迁移CLI保留原文件，仅写新副本，拒绝已有目标和密钥文件路径',async t=>{
    const{engine}=setup(),directory=await fs.mkdtemp(path.join(os.tmpdir(),'agriculture-migration-'));
    t.after(()=>fs.rm(directory,{recursive:true,force:true}));const input=path.join(directory,'original.json'),output=path.join(directory,'migrated.json');
    const doc=engine.initialFromLegacy(legacy,'migration-cli',{prepare:false}),bytes=JSON.stringify(doc);await fs.writeFile(input,bytes);
    const command=(a,b)=>spawnSync(process.execPath,['tools/migrate-agriculture.mjs',a,b],{encoding:'utf8'});
    const result=command(input,output);assert.equal(result.status,0,result.stderr);
    assert.equal(await fs.readFile(input,'utf8'),bytes);const migrated=JSON.parse(await fs.readFile(output,'utf8'));
    assert.deepEqual(migrated.state.settlements,doc.state.settlements);assert.equal(record(migrated).mode,'legacy');
    const saved=await fs.readFile(output,'utf8');assert.notEqual(command(input,output).status,0);assert.equal(await fs.readFile(output,'utf8'),saved);
    assert.notEqual(command(input,input).status,0);const rejected=command(path.join(directory,'secrets.json'),path.join(directory,'forbidden.json'));
    assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/拒绝接触密钥/);
});
