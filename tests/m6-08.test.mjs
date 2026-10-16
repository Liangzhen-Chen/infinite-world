import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import express from 'express';
import {chromium} from 'playwright-core';
import {init} from '../server-plugin/index.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {buildArt,backgroundSVG,crestFor,scenes,periods,weathers} from '../tools/build-m6-art.mjs';
import {BackgroundView,selectBackground,assetURL} from '../extension/background-view.mjs';
import {encodeCardPNG} from '../tools/build-card.mjs';

const world=await loadWorld(),people=[...world.npcs,...world.residents],art=JSON.parse(await fs.readFile('assets/visual/manifest.json','utf8'));

test('M6-08 80张实际原创场景覆盖10×2×4、全部已发布人物和地点，许可及逐人提示可追溯',async()=>{
    assert.equal(Object.keys(art.backgrounds).length,80);
    const bodies=[],files=[];
    for(const scene of Object.keys(scenes))for(const period of Object.keys(periods))for(const weather of Object.keys(weathers)){
        const row=art.backgrounds[`${scene}-${period}-${weather}`];assert.ok(row);
        const svg=await fs.readFile(`assets/visual/${row.file}`,'utf8');files.push(row.file);
        assert.equal(svg,backgroundSVG(scene,period,weather));
        assert.match(svg,/viewBox="0 0 1600 900"/);assert.match(svg,/<title>/);
        assert.doesNotMatch(svg,/<script|<foreignObject|href=|https?:\/\/(?!www.w3.org)/);
        bodies.push(createHash('sha256').update(svg.replace(/<title>.*?<\/title>/,'')).digest('hex'));
        if(['tavern','home','workshop','hall'].includes(scene)&&weather!=='clear')assert.match(svg,/<g clip-path="url\(#window\)">/);
        if(weather==='rain')assert.ok((svg.match(/l-25 65/g)??[]).length>=80);
        if(weather==='snow')assert.ok((svg.match(/<circle/g)??[]).length>=100);
    }
    assert.equal(new Set(files).size,80);assert.equal(new Set(bodies).size,80);
    assert.deepEqual(Object.keys(art.locations).sort(),world.locations.map(p=>p.id).sort());
    assert.deepEqual(new Set(Object.values(art.locations)),new Set(Object.keys(scenes)));
    assert.equal(art.locations.bld_hw_weaving,'workshop');assert.equal(art.locations.loc_wt_path,'road');
    const prompts=JSON.parse(await fs.readFile('world/art/portrait-prompts.json','utf8'));
    assert.deepEqual(Object.keys(art.portraits).sort(),people.map(n=>n.id).sort());assert.equal(prompts.length,people.length);
    for(const npc of people){
        const row=prompts.find(p=>p.id===npc.id);assert.equal(row.name,npc.name);assert.equal(row.occupation,npc.occupation);
        assert.equal(row.crest,art.portraits[npc.id]);assert.match(row.prompt,/日常职业纹章/);
        if(npc.flags?.minor===true||npc.age<18){assert.equal(row.crest,'crests/student.svg');assert.match(row.prompt,/无亲密或恋爱元素/);}
        assert.match(await fs.readFile(`assets/visual/${row.crest}`,'utf8'),/viewBox="0 0 128 128"/);
        assert.equal(Object.hasOwn(row,'memoryStream'),false);assert.equal(Object.hasOwn(row,'traits'),false);
    }
    assert.equal(crestFor('铁匠',true),'student');assert.equal(crestFor('未登记职业'),'household');
    assert.deepEqual(JSON.parse(await fs.readFile('world/art/mapping.json','utf8')),art);
    const licenses=await fs.readFile('assets/LICENSES.md','utf8');assert.match(licenses,/CC0 1.0 Universal/);assert.match(licenses,/tools\/build-m6-art.mjs/);
    const logo=await fs.readFile('assets/visual/logo.png');assert.equal(logo.readUInt32BE(16),128);assert.equal(logo.readUInt32BE(20),128);
    const card=encodeCardPNG({spec:'chara_card_v2',data:{name:'无限原野'}},logo);assert.ok(card.includes(Buffer.from('chara\0')));
    assert.match(await fs.readFile('tools/build-card.mjs','utf8'),/avatarPath\?\?path.join\(root,'assets\/visual\/logo.png'\)/);
});

test('M6-08 生成器在临时目录复现全部素材，不改变世界输入',async t=>{
    const temp=await fs.mkdtemp(path.join(tmpRoot(),'fields-art-'));t.after(()=>fs.rm(temp,{recursive:true,force:true}));
    const before=structuredClone(world),visual=path.join(temp,'visual'),source=path.join(temp,'art');
    assert.deepEqual(await buildArt({world,destination:visual,artDestination:source}),{backgrounds:80,portraits:people.length,locations:world.locations.length});
    assert.deepEqual(world,before);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(visual,'manifest.json'),'utf8')),art);
    for(const file of [...Object.values(art.backgrounds).map(row=>row.file),...new Set(Object.values(art.portraits)),'logo.svg','logo.png'])
        assert.deepEqual(await fs.readFile(path.join(visual,file)),await fs.readFile(`assets/visual/${file}`));
});

test('M6-08 场景选择复用顶栏的昼夜与天气，阴雾/暴雨有明确映射，未知不冒充晴天，不改时间钱袋位置',()=>{
    const view={date:{daylight:true},weather:{name:'晴'}},before=structuredClone(view);
    assert.equal(selectBackground(art,'bld_hw_qingdeng',view).file,'backgrounds/tavern-day-clear.svg');
    assert.deepEqual(view,before);
    for(const [name,group]of [['阴','overcast'],['雾','overcast'],['暴雨','rain'],['雪','snow']])
        assert.equal(selectBackground(art,'loc_hw_fields',{date:{daylight:false},weather:{name}}).file,`backgrounds/fields-night-${group}.svg`);
    assert.equal(selectBackground(art,'unknown',view),null);assert.equal(selectBackground(art,'loc_hw',{...view,weather:null}),null);
    assert.equal(selectBackground(art,'loc_hw',{...view,weather:{name:'未知'}}),null);
});

class Element{
    constructor(){this.children=[];this.dataset={};this.style={};this.classList={add:()=>{},remove:()=>{}};}
    append(e){this.children.push(e);}prepend(e){this.children.unshift(e);}setAttribute(k,v){this[k]=v;}
    remove(){this.removed=true;}get offsetWidth(){return 1600;}
}
function controllerFixture(){
    const host=new Element(),body=new Element(),pending=[];
    const doc={body,createElement:()=>new Element(),querySelector:selector=>selector==='#bg1'?host:null};
    const view=new BackgroundView({doc,loadImage:url=>new Promise((resolve,reject)=>pending.push({url,resolve,reject}))});
    return {view,host,body,pending};
}
test('M6-08 快速切景不被旧图片覆盖，未加载和失败保留前景，切聊天丢弃旧请求并清理，减少动画直接切换',async()=>{
    const {view,host,pending}=controllerFixture(),a=art.backgrounds['village-day-clear'],b=art.backgrounds['river-night-rain'];
    const first=view.select(a,{scope:'chat-a'}),second=view.select(b,{scope:'chat-a'});
    pending[1].resolve();await second;pending[0].resolve();await first;
    assert.equal(view.root.dataset.background,b.file);assert.equal(host.children.length,1);
    const next=view.select(a,{scope:'chat-a',reducedMotion:true});assert.equal(view.root.dataset.background,b.file);
    pending[2].resolve();await next;assert.equal(view.root.dataset.background,a.file);assert.equal(view.root.dataset.reducedMotion,'true');
    assert.deepEqual(view.root.children.map(e=>e.style.opacity).sort(),['0','1']);
    view.setReducedMotion(false);assert.equal(view.root.dataset.reducedMotion,'false');
    const failed=view.select(b,{scope:'chat-a'});pending[3].reject(Error('missing'));await failed;assert.equal(view.root.dataset.background,a.file);
    const stale=view.select(b,{scope:'chat-a'}),old=view.root;view.clear();pending[4].resolve();await stale;
    assert.equal(view.root,null);assert.equal(old.removed,true);
    const other=view.select(a,{scope:'chat-b'});pending[5].resolve();await other;assert.equal(view.root.dataset.reducedMotion,'false');
    const loading=view.select(b,{scope:'chat-b'});view.setReducedMotion(true);pending[6].resolve();await loading;
    assert.equal(view.root.dataset.reducedMotion,'true');
    const cancelled=view.select(a,{scope:'chat-b'});await view.select(b,{scope:'chat-b'});pending[7].resolve();await cancelled;
    assert.equal(view.root.dataset.background,b.file);assert.equal(pending.length,8);
    await view.select(null,{scope:'chat-b'});assert.equal(view.root,null);
    assert.match(assetURL(a.file),/extension\/assets\/visual\/backgrounds\/village-day-clear.svg$/);
});

async function fixture(t){
    const root=await fs.mkdtemp(path.join(tmpRoot(),'fields-m6-08-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const app=express();app.use(express.json());app.use('/assets',express.static('assets'));
    const router=express.Router();await init(router,{baseRoot:root,npcPlanningEnabled:false,consistencyEnabled:false});app.use('/api/plugins/infinite-fields',router);
    const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
    const origin=`http://127.0.0.1:${server.address().port}`;
    const request=async(endpoint,body={})=>{const response=await fetch(`${origin}/api/plugins/infinite-fields/${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
    return {origin,request};
}
test('M6-08 界面模块自动注册且所选战役只读，素材可由扩展内路径加载',async t=>{
    const {request,origin}=await fixture(t),created=await request('create',{name:'绘景旅人'}),campaignId=created.body.reference.campaignId;
    const before=await request('export',{campaignId});
    assert.ok((await request('ui/modules')).body.modules.includes('ui-art.mjs'));
    assert.equal((await fetch(`${origin}/assets/visual/manifest.json`)).status,200);
    assert.equal((await fetch(`${origin}/assets/visual/logo.svg`)).status,200);
    assert.equal((await request('ui/overview',{campaignId})).status,200);
    assert.deepEqual(await request('export',{campaignId}),before);
});

test('M6-08 浏览器：背景联系表、真实出行切景、头像知情过滤、减少动画、聊天清理，双主题桌面与390截图',{timeout:60000},async t=>{
    const {origin,request}=await fixture(t),created=await request('create',{name:'绘景旅人'}),campaignId=created.body.reference.campaignId;
    const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});t.after(()=>browser.close());
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/favicon.ico',route=>route.fulfill({status:204}));
    await page.route('**/api/backends/**',()=>{throw Error('视觉验收禁止模型请求');});
    await page.route('**/fixture.html',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"></head><body><div id="bg1"></div><div id="sheld"><div id="chat"><div class="mes" mesid="0"><div class="mes_block"><div class="mes_text"></div></div></div></div><div id="form_sheld"><form id="send_form"><textarea id="send_textarea"></textarea></form></div></div></body></html>'}));
    await page.route(/\.(?:mjs|js|css)(?:\?.*)?$/,async route=>{
        const relative=decodeURIComponent(new URL(route.request().url()).pathname).slice(1);let body=await fs.readFile(path.join('extension',relative),'utf8');
        if(relative==='runtime.js')body=body.replace("import { getContext } from '../../../extensions.js';","const getContext=()=>window.fixtureContext;");
        await route.fulfill({contentType:`${relative.endsWith('.css')?'text/css':'text/javascript'}; charset=utf-8`,body});
    });
    await page.goto(`${origin}/fixture.html`);await page.addStyleTag({content:await fs.readFile('extension/style.css','utf8')});
    await page.addStyleTag({content:'#bg1{position:fixed;inset:0;z-index:-2}#sheld{width:min(900px,100%);min-height:100dvh;margin:auto;box-sizing:border-box}#chat{padding:16px;box-sizing:border-box}'});
    const unknownId=Object.keys(art.portraits).find(id=>id.startsWith('npc_sb_'));assert.ok(unknownId);
    await page.evaluate(({reference,unknownId})=>{window.fixtureContext={characters:[{name:'无限原野·世界主持人'}],characterId:0,chatId:'m6-08',chatMetadata:{infinite_fields:reference,fields_speakers:{[unknownId]:'自起称呼'}},chat:[{mes:`<q who="npc_hw_linsui">先把房钱记清。</q><q who="${unknownId}">未知来客。</q>`}],getRequestHeaders:()=>({'Content-Type':'application/json'}),saveChat:async()=>{},setExtensionPrompt:()=>{},registerFunctionTool:()=>{},stopGeneration:()=>{},eventTypes:{},eventSource:{on:()=>{}}};},{reference:created.body.reference,unknownId});
    await page.evaluate(()=>window.fixtureContext.chat.push({is_user:true,mes:'我去南田看一看。',extra:{fields_anchor:'art-travel-user'}}));
    await page.evaluate(async()=>{await import('/runtime.js');await window.infiniteFieldsV2.refresh();await document.fonts.ready;});
    await page.locator('#fields-scenery[data-background]').waitFor();
    await page.locator('[data-speaker-id="npc_hw_linsui"] img').waitFor();
    assert.equal(await page.locator(`[data-speaker-id="${unknownId}"] img`).count(),0);
    assert.equal(await page.locator('.fields-game-logo').count(),1);
    const report='docs/测试报告/最新/M6-08';await fs.mkdir(report,{recursive:true});
    for(const theme of ['dark','light'])for(const [size,viewport]of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]){
        await page.setViewportSize(viewport);await page.evaluate(async theme=>{(await import('/ui-settings.mjs')).updateSettings({theme});},theme);
        await page.screenshot({path:`${report}/${theme}-${size}-scene-avatar.png`});
        await page.evaluate(async()=>{(await import('/ui-shell.mjs')).openPanel('art');});
        await page.locator('.fields-art-grid img').first().waitFor();assert.equal(await page.locator('.fields-art-grid img').count(),80);
        await page.locator('.fields-art-grid img').evaluateAll(async images=>{for(const image of images){image.loading='eager';await image.decode();}});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        await page.screenshot({path:`${report}/${theme}-${size}-contact-sheet.png`});
        if(size==='desktop'){
            const contactStyle=await page.addStyleTag({content:'#fields-dialog{max-height:none;overflow:visible}.fields-art-grid{grid-template-columns:repeat(4,minmax(0,1fr))}'});
            await page.locator('.fields-art-grid').screenshot({path:`${report}/${theme}-all-backgrounds.png`});
            await contactStyle.evaluate(e=>e.remove());
        }
        await page.getByRole('button',{name:'关闭',exact:true}).click();
    }
    const saved=await request('export',{campaignId});
    await page.evaluate(async()=>{const {updateBackground}=await import('/background-view.mjs');const original=window.infiniteFieldsV2.view;await updateBackground(original,{date:{daylight:false},weather:{name:'雪'}},'m6-08');});
    assert.equal(await page.locator('#fields-scenery').getAttribute('data-background'),'backgrounds/tavern-night-snow.svg');
    assert.deepEqual(await request('export',{campaignId}),saved);
    await page.screenshot({path:`${report}/night-snow.png`});
    await page.evaluate(async()=>{(await import('/ui-settings.mjs')).updateSettings({reducedMotion:true});});
    assert.equal(await page.locator('.fields-scenery-layer').first().evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
    const moved=await page.evaluate(()=>window.infiniteFieldsV2.execute('world_move',{destination:'南田'},'art-travel'));
    assert.equal(moved.ok,true,moved.error);
    await page.waitForFunction(()=>document.querySelector('#fields-scenery')?.dataset.background.startsWith('backgrounds/fields-'));
    await page.screenshot({path:`${report}/travel-fields-reduced-motion.png`});
    assert.equal(await page.evaluate(()=>window.fixtureContext.chatMetadata.custom_background),undefined);
    await page.evaluate(async()=>{window.fixtureContext.characters[0].name='其他角色';await window.infiniteFieldsV2.refresh();});
    assert.equal(await page.locator('#fields-scenery').count(),0);assert.equal(await page.locator('#bg1').count(),1);assert.deepEqual(errors,[]);
});
