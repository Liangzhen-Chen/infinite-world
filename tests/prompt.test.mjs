import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {buildCard,loadPromptBundle,presetFor,encodeCardPNG}from'../tools/build-card.mjs';
import {assembleMessages,isOutOfCharacter,injectToolExamples,staticMessages}from'../extension/prompt.mjs';
import {toolDefinitions}from'../extension/tools.mjs';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {catalogDefinition}from'../server-plugin/catalog.mjs';

test('新卡与预设来自同一提示源，静态在前、场景在尾，禁用旧世界书与模型回合工具',async()=>{
    const bundle=await loadPromptBundle(),messages=assembleMessages(bundle,[{role:'user',content:'住一晚'}],'现在九点');
    assert.equal(messages[0].content,bundle.constitution);assert.equal(messages.at(-1).content,'现在九点');
    assert.equal(messages.filter(row=>row.name==='example_assistant').length,9);
    assert.equal(messages.filter(row=>row.role==='tool').length,1);
    assert.doesNotMatch(messages.map(row=>row.content).join('\n'),/undefined|world_commit|world_roll|再生者/);
    assert.equal(bundle.card.data.extensions.world,'');assert.equal(bundle.card.data.character_book,undefined);
    const tools=toolDefinitions();assert.ok(tools.every(row=>row.function.description.length<=60));assert.ok(!tools.some(row=>row.function.name==='world_turn'));
    const preset=presetFor(bundle);assert.equal(preset.show_thoughts,true);assert.equal(preset.function_calling,true);
    assert.ok(isOutOfCharacter('  （场外）看看余额'));assert.equal(isOutOfCharacter('我问场外有什么'),false);
    assert.equal(bundle.budget.exact,false);
    assert.equal(bundle.budget.limit,12000);
    assert.ok(bundle.budget.estimatedTokens<=bundle.budget.limit,`静态提示加工具估算 ${bundle.budget.estimatedTokens} token`);
    assert.ok(bundle.budget.estimatedTokens<=bundle.budget.limit,`静态提示估算超过硬上限：${bundle.budget.estimatedTokens}`);
});

test('静态纲要保留起始地点名，原地点详情仍可从只读目录取得',async()=>{
    const world=await loadWorld(),bundle=await loadPromptBundle({world}),engine=new WorldEngine(world);
    const seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
    const document=engine.initialFromLegacy(seed,'prompt-location-details'),before=structuredClone(document);
    assert.match(bundle.card.data.description,/地点详情用world_catalog按名查询/);
    for(const place of world.locations.filter(row=>row.id==='loc_hw'||row.scope==='loc_hw')){
        assert.ok(bundle.card.data.description.includes(place.name),place.name);
        const detail=catalogDefinition(engine,document,{entity:place.name,kind:'location'});
        assert.equal(detail.id,place.id);assert.equal(detail.description,place.description??'');
    }
    assert.deepEqual(document,before);
});

test('酒馆事件注入与试玩共用相同调用示例，重复事件不重复注入，示例不改玩家历史',async()=>{
    const bundle=await loadPromptBundle(),history=[{role:'user',content:'去酒馆'}];
    const native=[...staticMessages(bundle),...structuredClone(history),{role:'system',content:'场景'}];
    injectToolExamples(native,bundle.card);injectToolExamples(native,bundle.card);
    assert.deepEqual(native,assembleMessages(bundle,history,'场景'));
    assert.equal(native.at(-2).content,'去酒馆');assert.equal(history.length,1);
    const receipt=JSON.parse(native.find(message=>message.role==='tool').content);
    assert.ok(receipt);assert.doesNotMatch(JSON.stringify(receipt),/privateState/);
    const truncated=[{role:'system',content:'规则'},...history];
    injectToolExamples(truncated,bundle.card.data);
    assert.equal(truncated[1].content,bundle.card.data.extensions.fields_tool_examples[0].content);
});

test('生成PNG可读回完整角色卡，重新嵌入不保留旧卡元数据',async t=>{
    const destination=await fs.mkdtemp(path.join(tmpRoot(),'fields-card-'));t.after(()=>fs.rm(destination,{recursive:true,force:true}));
    await buildCard({destination});const card=JSON.parse(await fs.readFile(path.join(destination,'host.json'),'utf8'));
    const png=encodeCardPNG(card,await fs.readFile(path.join(destination,'host.png'))),chunks=[];
    for(let offset=8;offset<png.length;){const length=png.readUInt32BE(offset),kind=png.toString('ascii',offset+4,offset+8);if(kind==='tEXt')chunks.push(png.subarray(offset+8,offset+8+length).toString());offset+=12+length;}
    const metadata=chunks.filter(row=>row.startsWith('chara\0'));assert.equal(metadata.length,1);
    assert.deepEqual(JSON.parse(Buffer.from(metadata[0].slice(6),'base64').toString()),card);
});
