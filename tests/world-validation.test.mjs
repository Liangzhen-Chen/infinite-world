import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWorld}from'../tools/load-world.mjs';
import {validateWorld}from'../tools/validate-world.mjs';
import {buildWorld}from'../tools/build-world.mjs';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {catalogProgress,catalogMinimum}from'../tools/catalog-progress.mjs';
import {validateNpcDepth} from '../tools/npc-profile-validation.mjs';
import {pathParts} from '../tools/npc-depth-content.mjs';

// Synthetic complete world tests the build boundary; no authored source is changed.
function completeDepth(world){
 const full=world.npcs.filter(n=>n.tier==='full');
 for(const [index,n] of full.entries()){
  const tail=full.length%2&&index>=full.length-3,start=tail?full.length-3:Math.floor(index/2)*2;
  const group=full.slice(start,start+(tail?3:2)),other=group[(group.indexOf(n)+1)%group.length],location=world.locations.find(l=>l.id===n.location);
  n.knowledge={known:[{fact:`曾在${location.name}核对木料账。`,source:location.id,reliability:'亲历'},{fact:`${other.name}曾帮忙搬运木板。`,source:other.id,reliability:'亲历'},{fact:'雨后保留了旧账页，尚未商定补桥次序。',source:n.id,reliability:'亲历'}],unknown:['石桥缺口是否需要先补木板']};
  for(const goals of Object.values(n.goals))for(const goal of goals)goal.steps=[{content:'到石桥核对旧木板数量',status:'pending'}];
  n.voice.register='话语平缓，使用完整句子';n.voice.habits[0]='开口先叫对方姓名';
  for(const relation of n.relationships)relation.note='雨后曾一起核对木料账，对漏记一行仍有分歧。';
  n.memorySeeds=[{id:`quality_pair_${start}`,event:'雨后在石桥核对木料账，还没商定补桥次序。',knownBy:group.map(n=>n.id).sort(),location:world.locations[0].id,reliability:'亲历',salience:5},{id:`quality_private_${index}`,event:'雨后在石桥检查过一块木板。',knownBy:[n.id],reliability:'亲历',salience:3}];
  n.traits=n.traits.map(t=>/待扩|待补/.test(t)?'守时':t);n.personality.traits=['守时','谨慎'];
 }
 for(const issue of validateNpcDepth(world).issues.filter(i=>i.code==='rule-wording')){
  const n=world.npcs.find(n=>n.id===issue.id),parts=pathParts(issue.field),last=parts.pop();parts.reduce((v,k)=>v[k],n)[last]='曾在石桥核对木料账，尚未商定补桥次序。';
 }
 assert.deepEqual(validateNpcDepth(world).issues,[]);return world;
}
test('世界校验：兼容种子通过基础结构，全规则数量不足不能标为完成',async()=>{
    const world=await loadWorld();assert.equal(validateWorld(world).ok,true);
    // T105后正式目录各项已达全规则门槛；用正式目录少一条历史的副本核对数量门槛仍拒绝。
    assert.deepEqual(validateWorld(world,{stage:'rules'}).errors.filter(error=>error.includes('数量不足')),[]);
    const short=structuredClone(world);short.history=short.history.slice(0,catalogMinimum.history-1);assert.equal(validateWorld(short).ok,true);
    const rules=validateWorld(short,{stage:'rules'});assert.equal(rules.ok,false);assert.deepEqual(rules.errors,[`目录数量不足：history ${catalogMinimum.history-1}<${catalogMinimum.history}`]);
    await assert.rejects(buildWorld({source:short,stage:'rules'}),/构建拒绝/);
});
test('世界校验：坏引用、同范围别名、未成年和屏蔽名称都阻止构建',async()=>{
    const world=await loadWorld();
    world.spells[0].materials=[{item:'item_missing',amount:1}];
    world.npcs[1].aliases=['老板娘'];world.npcs[1].age=16;world.npcs[1].flags.romanceable=true;
    world.items[0].name='阿斯兰木剑';
    const result=validateWorld(world);assert.equal(result.ok,false);
    for(const pattern of ['引用不存在','称呼冲突','未成年标记','屏蔽表'])assert.ok(result.errors.some(error=>error.includes(pattern)),pattern);
});
test('世界校验：孤立路线、负库存、过便宜的制造产物拒绝',async()=>{
    const world=await loadWorld();world.routes=world.routes.filter(route=>route.to!=='loc_capital'&&route.from!=='loc_capital');
    world.npcs[0].coins=-1;assert.equal(validateWorld(world).ok,false);world.npcs[0].coins=450;
    world.recipes=[{id:'recipe_bad',name:'虚亏木材',skill:'skill_light',minimumProficiency:0,materials:[{item:'item_iron',amount:10}],minutes:10,difficulty:10,output:{item:'item_wood',quantity:1},tools:[]}];
    const result=validateWorld(world);assert.ok(result.errors.some(error=>error.includes('孤立')));assert.ok(result.errors.some(error=>error.includes('低于材料')));
});

test('世界校验拒绝未接入法术与越界防护，不能用文字和数量填满目录',async()=>{
    const world=await loadWorld(),spell=world.spells[0];
    spell.effectSpec={kind:'status',status:'stone_skin',power:5000};
    assert.ok(validateWorld(world).errors.some(error=>error.includes('规则表')));
    delete spell.effectSpec;spell.mechanism='fake_city_simulation';
    assert.ok(validateWorld(world).errors.some(error=>error.includes('尚未接入')));
    delete spell.mechanism;
    assert.equal(validateWorld(world).ok,true,'旧兼容数据在引擎开发模式仍可读取');
    assert.ok(validateWorld(world,{stage:'rules'}).errors.some(error=>error.includes('法术处理器不完整')));
});

test('发布构建要求全体人物深度，仍拒绝坏引用、年龄冲突、屏蔽名称和未实现法术',async t=>{
    const current=await loadWorld(),world=completeDepth(structuredClone(current)),destination=await fs.mkdtemp(path.join(tmpRoot(),'infinite-fields-build-'));
    t.after(()=>fs.rm(destination,{recursive:true,force:true}));
    assert.equal(validateWorld(current,{stage:'release'}).ok,true,'五村深度发布后正式世界通过 release');
    const incomplete=structuredClone(current);incomplete.npcs[0].voice.register=incomplete.npcs[0].voice.habits[0];
    assert.ok(validateWorld(incomplete,{stage:'release'}).errors.some(e=>e.startsWith('完整人物深度：')),'任一完整档缺口必须拒绝');
    await assert.rejects(buildWorld({source:incomplete,stage:'release',destination}),/完整人物深度/);
    assert.equal((await buildWorld({source:world,stage:'release',destination})).ok,true);
    assert.equal(JSON.parse(await fs.readFile(path.join(destination,'manifest.json'),'utf8')).stage,'release');
    // 全体深度齐备且目录达标时final通过；任一目录低于门槛时final只因数量不足拒绝，且与rules一致。
    const final=validateWorld(world,{stage:'final'});
    assert.equal(final.ok,true,final.errors.join('\n'));
    assert.deepEqual(final.errors,validateWorld(world,{stage:'rules'}).errors);
    const short=structuredClone(world);short.history=short.history.slice(0,catalogMinimum.history-1);
    const shortFinal=validateWorld(short,{stage:'final'});
    assert.equal(shortFinal.ok,false);
    assert.ok(shortFinal.errors.length&&shortFinal.errors.every(error=>error.includes('数量不足')),shortFinal.errors.join('\n'));
    assert.deepEqual(shortFinal.errors,validateWorld(short,{stage:'rules'}).errors);
    const mutations=[
        value=>{value.spells[0].materials=[{item:'item_missing',amount:1}];},
        value=>{value.npcs[0].age=16;value.npcs[0].flags.romanceable=true;},
        value=>{value.items[0].name='阿斯兰木剑';},
        value=>{delete value.spells[0].effectSpec;delete value.spells[0].mechanism;},
    ];
    for(const mutate of mutations){
        const broken=structuredClone(world);mutate(broken);
        await assert.rejects(buildWorld({source:broken,stage:'release',destination}),/构建拒绝/);
    }
    assert.throws(()=>validateWorld(world,{stage:'relase'}),/未知构建阶段/);
    const progress=catalogProgress(world);
    assert.equal(progress.catalogs.find(row=>row.catalog==='spells').current,world.spells.length);
    assert.equal(progress.catalogs.find(row=>row.catalog==='spells').target,150);
});


test('release/final不接受所选32人、地区或skip过滤，未选任一full缺口仍拒绝',async()=>{
 const world=completeDepth(await loadWorld()),selectedIds=world.npcs.filter(n=>n.tier==='full').slice(0,32).map(n=>n.id),unselected=world.npcs.find(n=>n.tier==='full'&&!selectedIds.includes(n.id));
 unselected.voice.register=unselected.voice.habits[0];
 for(const stage of ['release','final']){
  const result=validateWorld(world,{stage,selectedIds,region:'河湾',skipNpcDepth:true});
  assert.ok(result.errors.some(e=>e.includes(unselected.id)&&e.includes('voice.register')));
  await assert.rejects(buildWorld({source:world,stage}),/完整人物深度/);
 }
 unselected.voice.register='说话缓慢，停顿清楚';
 for(const stage of ['release','final'])assert.ok(!validateWorld(world,{stage}).errors.some(e=>e.startsWith('完整人物深度：')));
 unselected.notes='主持人不要让玩家查看木料账。';
 for(const stage of ['release','final'])assert.ok(validateWorld(world,{stage}).errors.some(e=>e.includes(`${unselected.id}/notes`)));
});

test('世界校验：水分>0且无饱腹的物品必须带drinkable，带drinkable的物品必须有水分',async()=>{
    const world=await loadWorld();
    assert.deepEqual(validateWorld(world).errors.filter(error=>error.includes('drinkable')),[]);
    // 温果醋饮派生后水分>0、饱腹0：去掉标签即拒绝；牛乳有热量带标签合法，不报。
    const noTag=structuredClone(world);const vinegar=noTag.items.find(i=>i.id==='item_warm_vinegar_drink');vinegar.tags=vinegar.tags.filter(t=>t!=='drinkable');
    assert.ok(validateWorld(noTag).errors.some(error=>error.includes('饮品缺 drinkable 标签')&&error.includes('item_warm_vinegar_drink')));
    // 干粮派生后无水分：误挂标签即拒绝。
    const wrongTag=structuredClone(world);const ration=wrongTag.items.find(i=>i.id==='item_ration');ration.tags=[...(ration.tags??[]),'drinkable'];
    assert.ok(validateWorld(wrongTag).errors.some(error=>error.includes('水分须>0')&&error.includes('item_ration')));
});
