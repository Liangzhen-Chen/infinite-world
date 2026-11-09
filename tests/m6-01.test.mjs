import{browserExecutablePath}from'./helpers/browser-path.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import express from 'express';
import {chromium} from 'playwright-core';
import {init} from '../server-plugin/index.mjs';
import {overview} from '../server-plugin/ui-overview.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {prepareDeployment} from '../tools/deploy-engine.mjs';
import {normalizeSettings} from '../extension/ui-settings.mjs';
import {moneyText} from '../extension/topbar.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fixture(t){
    const root=await fs.mkdtemp(path.join(tmpRoot(),'fields-m6-01-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const app=express();app.use(express.json());const router=express.Router();
    await init(router,{baseRoot:root,npcPlanningEnabled:false,consistencyEnabled:false});
    app.use('/api/plugins/infinite-fields',router);
    const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
    const origin=`http://127.0.0.1:${server.address().port}`;
    const request=async(endpoint,body={})=>{
        const response=await fetch(`${origin}/api/plugins/infinite-fields/${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        return {status:response.status,body:await response.json()};
    };
    return {root,origin,request};
}

test('M6-01 概览只读、按当前战役读取，失败保留用户目录边界',async t=>{
    const {request}=await fixture(t),created=await request('create',{name:'测试旅人'}),campaignId=created.body.reference.campaignId;
    const before=await request('export',{campaignId}),result=await request('ui/overview',{campaignId}),after=await request('export',{campaignId});
    assert.equal(result.status,200);assert.deepEqual(after,before);
    assert.deepEqual(result.body.reference,created.body.reference);assert.match(result.body.date.text,/春历.*雨月/);
    assert.equal(result.body.date.period,'巳时');assert.ok(result.body.locationPath.includes('青灯酒馆'));
    assert.equal(result.body.player.coins,180);assert.equal(result.body.qualities.length,16);
    assert.equal(result.body.npcs,undefined);assert.equal(result.body.document,undefined);
    assert.equal((await request('ui/overview',{campaignId:'../other-user'})).status,400);
    assert.equal((await request('ui/overview',{campaignId:'missing'})).status,404);
    const modules=await request('ui/modules');assert.ok(Array.isArray(modules.body.modules)&&modules.body.modules.every(name=>/^ui-[a-z0-9-]+\.mjs$/.test(name)));
});

test('M6-01 同行者名字须有玩家经历，效果不泄漏他人私密或过期记录',async()=>{
    const engine=new WorldEngine(await loadWorld()),legacy=JSON.parse(await fs.readFile('server-plugin/legacy/seed.json','utf8'));
    const document=engine.initialFromLegacy(legacy,'m6-01'),s=document.state;
    s.player.companions=['npc_hw_linsui','npc_hidden'];s.created.npc_hidden={id:'npc_hidden',name:'隐秘真名'};
    s.turns.known={present:['npc_hw_linsui']};
    s.effects={mine:{target:'player',spell:'spell_light_01',expires:s.minute+12},item:{target:'item_staff',expires:s.minute+20},
        hidden:{target:'npc_hidden',spell:'隐秘法术',expires:s.minute+30},expired:{target:'player',expires:s.minute}};
    const before=structuredClone(document),result=overview(engine.scoped(document),document);
    assert.deepEqual(document,before);assert.equal(result.companions[0].name,'林穗');assert.equal(result.companions[1].name,'未识别同行者');
    assert.equal(result.effects.length,2);assert.deepEqual(result.effects.map(row=>row.remainingMinutes),[12,20]);
    assert.doesNotMatch(JSON.stringify(result),/隐秘真名|npc_hidden|隐秘法术|memoryStream|knowledge/);
    s.minute=23*60;assert.equal(overview(engine,document).date.period,'子时');
});

test('M6-01 设置范围、钱袋拆分与原铜账一致',()=>{
    assert.deepEqual(normalizeSettings({fontSize:999,theme:'bogus',volume:999,highContrast:true}),{theme:'dark',fontSize:18,volume:100,highContrast:true,reducedMotion:false,muted:false});
    assert.equal(moneyText(123456),'12金 34银 56铜');assert.equal(moneyText(180),'0金 1银 80铜');
    assert.deepEqual(normalizeSettings(null??{}).fontSize,18);
});

test('M6-01 新服务端模块直接注册 /ui/*；注册点没有写存档接口',async t=>{
    const directory=await fs.mkdtemp(path.join(tmpRoot(),'fields-ui-registry-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
    await fs.copyFile('server-plugin/ui-routes.mjs',path.join(directory,'ui-routes.mjs'));
    await fs.writeFile(path.join(directory,'ui-next.mjs'),"export function registerUIRoutes({post,readCampaign}){post('/ui/next',async req=>{const {document,engine}=await readCampaign(req);return {name:engine.name,minute:document.state.minute};});}");
    const {registerUIRoutes}=await import(pathToFileURL(path.join(directory,'ui-routes.mjs'))),routes=new Map();let reads=0;
    const document={worldHash:'old-world',state:{minute:123}},engine={scoped:doc=>{assert.equal(doc,document);return {name:'saved-world'};}};
    await registerUIRoutes({post:(route,callback)=>routes.set(route,callback)},{handle:callback=>callback,getStore:()=>({read:async id=>{reads++;assert.equal(id,'campaign');return {document};},worldRegistry:{get:async hash=>{assert.equal(hash,'old-world');return engine;}}})});
    assert.deepEqual(await routes.get('/ui/next')({body:{campaignId:'campaign'}}),{name:'saved-world',minute:123});assert.equal(reads,1);
});

test('M6-01 隔离打包包含界面模块、完整字体和许可，二进制哈希可核对', {timeout:120000},async t=>{
    const directory=await fs.mkdtemp(path.join(tmpRoot(),'fields-m6-bundle-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
    const report=await prepareDeployment(directory);assert.equal(report.activation,false);
    assert.equal(report.files.some(row=>['extension/index.js','extension/core.js','extension/seed.json'].includes(row.path)),false);
    const packaged=await import(pathToFileURL(path.join(directory,'plugin/index.mjs'))),routes=new Map();
    await packaged.init({post:(route,callback)=>routes.set(route,callback),get:()=>{}},{baseRoot:path.join(directory,'campaigns'),npcPlanningEnabled:false,consistencyEnabled:false});
    assert.ok(routes.has('/ui/overview'));assert.ok(routes.has('/ui/modules'));
    let moduleList;await routes.get('/ui/modules')({}, {json:value=>{moduleList=value;}});assert.ok(Array.isArray(moduleList.modules)&&moduleList.modules.every(name=>/^ui-[a-z0-9-]+\.mjs$/.test(name)));
    for(const relative of ['extension/ui-shell.mjs','extension/ui-settings.mjs','extension/topbar.mjs','plugin/server-plugin/ui-routes.mjs','plugin/server-plugin/ui-overview.mjs',
        'extension/assets/fonts/NotoSerifSC-Regular.woff2','extension/assets/fonts/LXGWWenKai-Regular.woff2','extension/assets/fonts/SourceHanSansSC-Regular.woff2','extension/assets/LICENSES.md']){
        const row=report.files.find(row=>row.path===relative);assert.ok(row,relative);
        const bytes=await fs.readFile(path.join(directory,relative));assert.equal(sha(bytes),row.sha256);
        if(relative.endsWith('.woff2'))assert.equal(bytes.subarray(0,4).toString(),'wOF2');
    }
    for(const name of ['LXGW-OFL.txt','NotoSerifSC-OFL.txt','SourceHanSansSC-OFL.txt'])assert.match(await fs.readFile(path.join(directory,'extension/assets/fonts',name),'utf8'),/SIL OPEN FONT LICENSE/);
});

test('M6-01 浏览器：双主题、两行顶栏、全屏抽屉、字号持久化与键盘焦点', {timeout:60000},async t=>{
    const {origin,request}=await fixture(t),created=await request('create',{name:'测试旅人'});
    const browser=await chromium.launch({executablePath:browserExecutablePath(),headless:true});t.after(()=>browser.close());
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    const narrative='雨停之后，檐角仍在滴水。';
    await page.route('**/fixture.html',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>无限原野界面测试</title></head><body><div id="sheld"><div id="chat"><div class="mes_text"><p>${narrative}</p></div></div><div id="form_sheld"><form id="send_form"><textarea id="send_textarea" aria-label="行动输入"></textarea></form></div></div></body></html>`}));
    await page.route(/\.(?:mjs|js|css)(?:\?.*)?$/,async route=>{
        const relative=decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
        if(relative==='ui-next.mjs')return route.fulfill({contentType:'text/javascript; charset=utf-8',body:"export function registerUI({registerPanel,registerSettingsSection}){registerPanel({id:'next',title:'后续面板',render:node=>node.textContent='已挂载'});registerSettingsSection({id:'next',title:'后续设置',render:node=>node.append(document.createTextNode('已挂载设置'))});}"});
        let body=await fs.readFile(path.join('extension',relative),'utf8');
        if(relative==='runtime.js')body=body.replace("import { getContext } from '../../../extensions.js';","const getContext=()=>window.fixtureContext;");
        await route.fulfill({contentType:`${relative.endsWith('.css')?'text/css':'text/javascript'}; charset=utf-8`,body});
    });
    await page.route('**/assets/fonts/**',async route=>route.fulfill({body:await fs.readFile(`assets/fonts/${new URL(route.request().url()).pathname.split('/').at(-1)}`)}));
    await page.route('**/api/plugins/infinite-fields/ui/modules',route=>route.fulfill({json:{modules:['ui-next.mjs']}}));
    await page.goto(`${origin}/fixture.html`);await page.addStyleTag({content:await fs.readFile('extension/style.css','utf8')});
    await page.evaluate(reference=>{
        window.fixtureContext={characters:[{name:'无限原野·世界主持人'}],characterId:0,chatId:'m6-01',chatMetadata:{infinite_fields:reference},chat:[],
            getRequestHeaders:()=>({'Content-Type':'application/json'}),saveChat:async()=>{},setExtensionPrompt:()=>{},registerFunctionTool:()=>{},stopGeneration:()=>{},eventTypes:{},eventSource:{on:()=>{}}};
    },created.body.reference);
    await page.evaluate(async()=>{await import('/runtime.js');await window.infiniteFieldsV2.refresh();await document.fonts.ready;});
    assert.equal(await page.evaluate(()=>document.characterSet),'UTF-8');
    assert.equal(await page.locator('#chat .mes_text p').innerText(),narrative);
    assert.match(await page.locator('#fields-status').innerText(),/春历.*雨月/);assert.match(await page.locator('#fields-status').innerText(),/青灯酒馆/);
    assert.match(await page.locator('#fields-status').innerText(),/0金 1银 80铜/);
    // 截图默认写到临时目录（进程退出时清理），不改写 docs 下已跟踪的存档图；设 M6_UPDATE_SCREENSHOTS=1 才更新它们。
    const report=process.env.M6_UPDATE_SCREENSHOTS==='1'?'docs/测试报告/最新/M6-01':path.join(tmpRoot(),'m6-01-shots');await fs.mkdir(report,{recursive:true});
    for(const theme of ['dark','light']){
        assert.equal(await page.locator('#fields-dialog').count(),0);
        await page.evaluate(async theme=>{const {updateSettings}=await import('/ui-settings.mjs');updateSettings({theme,fontSize:20,highContrast:false,reducedMotion:false});},theme);
        assert.equal(await page.locator('#chat .mes_text p').innerText(),narrative);
        const colors=await page.evaluate(()=>{
            const body=getComputedStyle(document.body),input=getComputedStyle(document.querySelector('#send_textarea'));
            return {body:body.backgroundColor,chat:getComputedStyle(document.querySelector('#chat')).backgroundColor,input:input.backgroundColor,inputText:input.color,scheme:body.colorScheme};
        });
        assert.deepEqual(colors,theme==='dark'?{body:'rgb(24, 35, 28)',chat:'rgb(24, 35, 28)',input:'rgb(34, 49, 39)',inputText:'rgb(238, 232, 216)',scheme:'dark'}:
            {body:'rgb(245, 239, 223)',chat:'rgb(245, 239, 223)',input:'rgb(233, 223, 200)',inputText:'rgb(46, 48, 39)',scheme:'light'});
        await page.setViewportSize({width:1440,height:900});await page.screenshot({path:`${report}/${theme}-desktop.png`});
        await page.setViewportSize({width:390,height:844});
        const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,rows:document.querySelector('#fields-status').children.length}));
        assert.deepEqual(layout,{overflow:false,rows:2});await page.screenshot({path:`${report}/${theme}-mobile.png`});
        await page.getByRole('button',{name:'面板',exact:true}).click();await page.getByRole('button',{name:'阅读设置',exact:true}).first().click();
        assert.match(await page.locator('#fields-dialog').innerText(),/已挂载设置/);
        assert.equal(await page.getByLabel('高对比度').isChecked(),false);assert.equal(await page.getByLabel('减少动画').isChecked(),false);
        await page.getByLabel('正文字号').selectOption('24');await page.getByLabel('高对比度').check();await page.getByLabel('减少动画').check();
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(()=>document.activeElement.matches(':focus-visible')),true);
        assert.equal(await page.locator('.fields-reading-sample').evaluate(node=>getComputedStyle(node).fontSize),'24px');
        const drawer=await page.locator('#fields-dialog').boundingBox();assert.equal(drawer.width,390);assert.equal(drawer.height,844);
        assert.equal(await page.locator('#fields-dialog').evaluate(node=>node.scrollWidth<=node.clientWidth),true);
        await page.screenshot({path:`${report}/${theme}-settings-focus.png`});
        await page.keyboard.press('Escape');assert.equal(await page.locator('#fields-dialog').count(),0);
        assert.equal(await page.getByRole('button',{name:'面板',exact:true}).evaluate(node=>node===document.activeElement),true);
        for(const control of ['主题','高对比度']){
            await page.getByRole('button',{name:'面板',exact:true}).click();await page.getByRole('button',{name:'阅读设置',exact:true}).first().click();
            await page.getByLabel(control,{exact:true}).focus();await page.keyboard.press('Escape');assert.equal(await page.locator('#fields-dialog').count(),0);
        }
        await page.evaluate(async()=>{const {updateSettings}=await import('/ui-settings.mjs');updateSettings({highContrast:false,reducedMotion:false});});
    }
    await page.getByRole('button',{name:'面板',exact:true}).click();await page.getByRole('button',{name:'后续面板',exact:true}).first().click();assert.match(await page.locator('#fields-dialog').innerText(),/已挂载/);await page.keyboard.press('Escape');
    await page.evaluate(async()=>{const {updateSettings,initializeSettings}=await import('/ui-settings.mjs');updateSettings({theme:'light',fontSize:22,muted:true,volume:27});initializeSettings();});
    assert.deepEqual(await page.evaluate(async()=>{const {getSettings}=await import('/ui-settings.mjs');return getSettings();}),{theme:'light',fontSize:22,highContrast:false,reducedMotion:false,volume:27,muted:true});
    await page.evaluate(()=>window.infiniteFieldsV2.refresh());assert.equal(await page.locator('#fields-mute').innerText(),'取消静音');assert.equal(await page.locator('#fields-volume').inputValue(),'27');
    assert.deepEqual(errors,[]);
});
