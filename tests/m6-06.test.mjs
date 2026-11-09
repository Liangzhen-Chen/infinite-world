import{browserExecutablePath}from'./helpers/browser-path.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot,artifactPath}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {once} from 'node:events';
import express from 'express';
import {chromium} from 'playwright-core';
import {init} from '../server-plugin/index.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {history as visibleHistory} from '../server-plugin/ui-history.mjs';
import {prepareDeployment} from '../tools/deploy-engine.mjs';
import {arrivalText,makeBackup,unpackBackup,remapSession,hostBridge,serializeActions} from '../extension/start/play-town.js';

async function fixture(t){
    const root=await fs.mkdtemp(path.join(tmpRoot(),'fields-m6-06-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const app=express();app.use(express.json({limit:'100mb'}));const router=express.Router();
    await init(router,{baseRoot:root,npcPlanningEnabled:false,consistencyEnabled:false});app.use('/api/plugins/infinite-fields',router);
    app.use('/scripts/extensions/third-party/infinite-fields/assets',express.static(path.resolve('assets')));
    app.use('/scripts/extensions/third-party/infinite-fields',express.static(path.resolve('extension')));
    app.get('/play-town.html',(_req,res)=>res.sendFile(path.resolve('extension/start/play-town.html')));
    const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
    const origin=`http://127.0.0.1:${server.address().port}`;
    const request=async(endpoint,body={})=>{const response=await fetch(`${origin}/api/plugins/infinite-fields/${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const value=await response.json();assert.equal(response.status,200,value.error);return value;};
    return {origin,request};
}

test('M6-06 创建采用实际新角色规则，前情只读已发生的可见事实；完整备份导入保留账本、聊天、笔记与设置',async t=>{
    const {request}=await fixture(t),created=await request('create',{character:{name:'归来的旅人',gender:'女',appearance:'带着旧围巾。'}}),campaignId=created.reference.campaignId;
    assert.deepEqual(created.document.state.spells,{});assert.equal(created.document.state.location,'loc_hw');
    const overview=await request('ui/overview',{campaignId}),empty=await request('ui/history',{campaignId});
    const opening=arrivalText(overview,empty,{opening:true});assert.match(opening.paragraphs.join(''),/三辆装粮的车/);assert.doesNotMatch(opening.paragraphs.join(''),/会照明术/);
    await request('execute',{campaignId,tool:'world_remember',args:{subject:'player',key:'归途',content:'你在桥头看过商旅的地图。'},eventId:'visible',anchor:'walk'});
    const privateDocument=structuredClone(created.document);
    privateDocument.memories.secret={private:true,content:'未获知的私密暗号',minute:540};
    const filtered=visibleHistory(new WorldEngine(await loadWorld()),privateDocument,{facts:[{minute:540,visibleTo:['npc_hw_linsui'],participants:['npc_hw_linsui'],text:'未获知的私密暗号'}]});
    assert.doesNotMatch(arrivalText(overview,filtered).paragraphs.join(''),/私密暗号/);
    const before=await request('export',{campaignId}),history=await request('ui/history',{campaignId,level:'scenes',pageSize:5});
    const recap=arrivalText(overview,history);assert.match(recap.paragraphs.join(''),/桥头看过/);assert.doesNotMatch(recap.paragraphs.join(''),/私密暗号/);
    assert.deepEqual(await request('export',{campaignId}),before);
    const session={reference:history.reference,name:'归来的旅人',chatId:'test-chat',chat:[{is_user:true,mes:'我看地图。'},{is_user:false,mes:'你在桥头看过商旅的地图。'}],
        metadata:{infinite_fields:history.reference,fields_people_history:{campaignId,notes:{npc_hw_linsui:'下次询问住店'},judgments:{rumor_one:'存疑'}},fields_history_window:{anchor:'old'},fields_consistency_enabled:false}};
    const settings={theme:'light',fontSize:22,highContrast:true,reducedMotion:true,muted:true,volume:35};
    const backup=unpackBackup(JSON.parse(JSON.stringify(makeBackup(before,session,settings))));
    const imported=await request('import',{bundle:backup.bundle}),rebound=remapSession(backup.session,imported.reference);
    assert.notEqual(imported.reference.campaignId,campaignId);assert.deepEqual(imported.document,(await request('read',{campaignId})).document);
    assert.deepEqual(rebound.chat,session.chat);assert.equal(rebound.chatId,null);assert.equal(rebound.metadata.fields_people_history.campaignId,imported.reference.campaignId);
    assert.deepEqual(rebound.metadata.fields_people_history.notes,session.metadata.fields_people_history.notes);assert.deepEqual(rebound.metadata.fields_people_history.judgments,session.metadata.fields_people_history.judgments);
    assert.equal(rebound.metadata.fields_history_window,undefined);assert.deepEqual(backup.settings,settings);
    const restored=await request('ui/history',{campaignId:imported.reference.campaignId,level:'scenes',pageSize:5});assert.deepEqual(restored.chronicle,history.chronicle);
    await request('reconcile',{campaignId:imported.reference.campaignId,validAnchors:[]});
    assert.doesNotMatch(arrivalText(overview,await request('ui/history',{campaignId:imported.reference.campaignId})).paragraphs.join(''),/桥头看过/);
    assert.deepEqual(await request('export',{campaignId}),before);
});

test('M6-06 备份接受旧服务器格式，拒绝错配角色；前情顺序稳定且没有代替玩家决策',()=>{
    const old={format:'infinite-fields-server-v2'};assert.equal(unpackBackup(old).bundle,old);
    assert.throws(()=>unpackBackup({format:'other'}),/请选择/);
    assert.throws(()=>makeBackup({metadata:{id:'other'}},{reference:{campaignId:'one'}},{}),/不一致/);
    assert.throws(()=>unpackBackup({format:'infinite-fields-play-v1',bundle:{metadata:{id:'other'}},session:{reference:{campaignId:'one'},chat:[],metadata:{}}}),/不一致/);
    const overview={date:{text:'雨月一日'},locationPath:['河湾村'],player:{name:'旅人',coins:180}};
    const history={chronicle:{items:[{time:'稍后',text:'收好围巾。'},{time:'早些时候',text:'桥头停步。'}]}};
    assert.deepEqual(arrivalText(overview,history).paragraphs.slice(1),['早些时候：桥头停步。','稍后：收好围巾。']);
    assert.match(arrivalText(overview,{chronicle:{items:[]}}).paragraphs.at(-1),/尚无已登记/);
});

test('M6-06 隔离包带同名开始入口及全部相对依赖，不激活安装',async t=>{
    const destination=await fs.mkdtemp(path.join(tmpRoot(),'fields-start-package-'));t.after(()=>fs.rm(destination,{recursive:true,force:true}));
    const report=await prepareDeployment(destination);assert.equal(report.activation,false);
    for(const relative of ['public/play-town.html','extension/start/play-town.js','extension/start/play-town.css','extension/ui-settings.mjs','extension/runtime.js']){
        assert.ok(report.files.some(file=>file.path===relative),relative);await fs.access(path.join(destination,relative));
    }
    const html=await fs.readFile(path.join(destination,'public/play-town.html'),'utf8');assert.match(html,/charset="utf-8"/);assert.match(html,/infinite-fields\/start\/play-town.js/);
});

test('M6-06 启动握手等待异步 runtime 就绪，iframe 先 load 不丢请求；已就绪宿主直接响应',async t=>{
    const originalWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),originalLocation=Object.getOwnPropertyDescriptor(globalThis,'location');
    t.after(()=>{for(const [key,descriptor]of [['window',originalWindow],['location',originalLocation]])if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});
    const origin='http://fixture.local',handlers=[],loads=[],sent=[];
    Object.defineProperty(globalThis,'location',{configurable:true,value:{origin}});
    Object.defineProperty(globalThis,'window',{configurable:true,value:{addEventListener:(_type,fn)=>handlers.push(fn)}});
    const host={postMessage:(data,targetOrigin)=>sent.push({data,targetOrigin})},frame={contentWindow:host,addEventListener:(_type,fn)=>loads.push(fn)};
    const deliver=data=>handlers.forEach(fn=>fn({origin,source:host,data}));
    const bridge=hostBridge(frame),hello=bridge('hello');
    loads.forEach(fn=>fn());assert.deepEqual(sent,[]);
    // Unrelated windows and origins cannot mark this frame as ready.
    handlers.forEach(fn=>fn({origin:'http://other.local',source:host,data:{type:'fields-start-ready'}}));
    handlers.forEach(fn=>fn({origin,source:{},data:{type:'fields-start-ready'}}));assert.deepEqual(sent,[]);
    host.infiniteFieldsV2={};deliver({type:'fields-start-ready'});
    assert.equal(sent.length,1);assert.equal(sent[0].data.action,'hello');assert.equal(sent[0].targetOrigin,origin);
    deliver({type:'fields-start-result',id:sent[0].data.id,value:{ready:true}});assert.deepEqual(await hello,{ready:true});
    loads.forEach(fn=>fn());deliver({type:'fields-start-ready'});assert.equal(sent.length,1);
    const lateBridge=hostBridge(frame),lateHello=lateBridge('hello');assert.equal(sent.length,2);
    deliver({type:'fields-start-result',id:sent[1].data.id,value:{ready:true}});assert.deepEqual(await lateHello,{ready:true});
});

test('M6-06 返回开始页还在保存时选择备份，导入保留并在快照完成后执行',async()=>{
    let finishSnapshot,snapshotStarted;
    const snapshot=new Promise(resolve=>finishSnapshot=resolve),started=new Promise(resolve=>snapshotStarted=resolve),events=[],run=serializeActions(task=>task());
    const home=run(async()=>{events.push('保存快照');snapshotStarted();await snapshot;events.push('显示开始页');});
    await started;
    let imported=false;
    const importing=run(async()=>{imported=true;events.push('导入备份');return arrivalText({date:{text:'雨月一日'},locationPath:['河湾村'],player:{name:'旅人',coins:180}},{chronicle:{items:[]}});});
    await Promise.resolve();assert.equal(imported,false);finishSnapshot();await home;
    const recap=await importing;assert.equal(imported,true);assert.equal(recap.title,'前情提要');assert.match(recap.paragraphs.at(-1),/尚无已登记/);
    assert.deepEqual(events,['保存快照','显示开始页','导入备份']);
});

test('M6-06 浏览器：创建→固定回复发送→保存→导入→继续，双主题桌面与390手机开始页及前情截图',{timeout:90000},async t=>{
    const {origin,request}=await fixture(t);
    const browser=await chromium.launch({executablePath:browserExecutablePath(),headless:true});t.after(()=>browser.close());
    const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true}),errors=[],consoleErrors=[];
    page.on('pageerror',error=>errors.push(error.stack??error.message));
    page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
    let fixedCalls=0,otherModelCalls=0;
    await page.route('**/favicon.ico',route=>route.fulfill({status:204}));
    await page.route('**/api/backends/**',route=>{otherModelCalls++;return route.abort();});
    await page.route('**/api/backends/chat-completions/generate',route=>{fixedCalls++;return route.fulfill({json:{text:'你在桥头看过商旅的地图。'}});});
    await page.route(/\/runtime.js$/,async route=>{
        const body=(await fs.readFile('extension/runtime.js','utf8')).replace("import { getContext } from '../../../extensions.js';","const getContext=()=>window.fixtureContext;");
        await route.fulfill({contentType:'text/javascript; charset=utf-8',body});
    });
    await page.route(/\/assets\/fonts\//,async route=>route.fulfill({body:await fs.readFile(`assets/fonts/${new URL(route.request().url()).pathname.split('/').at(-1)}`)}));
    // A host fixture preserves independent chat files and awaits actual runtime
    // events. This catches transition queue deadlocks without opening a real host.
    await page.route(url=>url.href===`${origin}/`,route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><link rel="stylesheet" href="/scripts/extensions/third-party/infinite-fields/style.css"></head><body><div id="sheld"><div id="chat"></div><form id="send_form"><textarea id="send_textarea" aria-label="行动"></textarea><button>发送</button></form></div><script type="module">
        const chats=new Map(),handlers=new Map();
        const ctx=window.fixtureContext={characters:[{name:'无限原野·世界主持人',avatar:'fixture.png'}],characterId:0,chatId:'old-chat',chatMetadata:{original:true},chat:[{is_user:false,mes:'原聊天保留'}],
        getRequestHeaders:()=>({'Content-Type':'application/json'}),saveChat:async()=>{chats.set(ctx.chatId,{chat:structuredClone(ctx.chat),metadata:structuredClone(ctx.chatMetadata)});},setExtensionPrompt:()=>{},registerFunctionTool:()=>{},stopGeneration:()=>{},selectCharacterById:async id=>ctx.characterId=id,
        eventTypes:new Proxy({},{get:(_,key)=>key}),eventSource:{on:(key,fn)=>{const rows=handlers.get(key)??[];rows.push(fn);handlers.set(key,rows);}},
        openCharacterChat:async id=>{ctx.chatId=id;const saved=chats.get(id);ctx.chat=saved?structuredClone(saved.chat):[{is_user:false,mes:'默认旧开场'}];ctx.chatMetadata=saved?structuredClone(saved.metadata):{};for(const key of ['CHAT_CHANGED','CHAT_LOADED'])for(const fn of handlers.get(key)??[])await fn();document.querySelector('#chat').replaceChildren();for(const row of ctx.chat){const p=document.createElement('p');p.className='mes_text';p.textContent=row.mes;document.querySelector('#chat').append(p);}}};
        await ctx.saveChat();window.fixtureChats=chats;
        await import('/scripts/extensions/third-party/infinite-fields/runtime.js');
        document.querySelector('#send_form').onsubmit=async event=>{event.preventDefault();const input=document.querySelector('#send_textarea'),anchor=crypto.randomUUID();ctx.chat.push({is_user:true,mes:input.value,extra:{fields_anchor:anchor}});
            const reply=await fetch('/api/backends/chat-completions/generate',{method:'POST',body:'{}'}).then(r=>r.json());
            const result=await window.infiniteFieldsV2.execute('world_remember',{subject:'player',key:'桥头',content:reply.text},crypto.randomUUID());if(result.ok===false)throw Error(result.error);
            ctx.chat.push({name:'世界主持人',is_user:false,mes:reply.text});await ctx.saveChat();const p=document.createElement('p');p.textContent=reply.text;document.querySelector('#chat').append(p);input.value='';};
        </script></body></html>`}));
    try{
    await page.goto(`${origin}/play-town.html`);await page.getByText('可以继续游戏或创建角色。',{exact:true}).waitFor();
    // P3 / design section 9 and P3: relocate screenshot output only; retain every screenshot call and UI/layout assertion.
    const report=artifactPath('测试报告','最新','M6-06');await fs.mkdir(report,{recursive:true});
    async function screenshots(kind){
        for(const theme of ['dark','light'])for(const [size,viewport]of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]){
            await page.setViewportSize(viewport);await page.evaluate(async theme=>{const {updateSettings}=await import('/scripts/extensions/third-party/infinite-fields/ui-settings.mjs');updateSettings({theme});},theme);
            await page.evaluate(()=>document.fonts.ready);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
            await page.screenshot({path:`${report}/${theme}-${size}-${kind}.png`});
        }
    }
    await screenshots('start');await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByLabel('正文字号').selectOption('22');await page.getByText('减少动画',{exact:true}).locator('input').check();await page.keyboard.press('Escape');
    await page.getByLabel('姓名',{exact:true}).fill('桥头旅人');await page.getByRole('button',{name:'创建并进入'}).click();await page.getByRole('heading',{name:'初到河湾'}).waitFor();await screenshots('opening');
    await page.getByRole('button',{name:'进入游戏',exact:true}).click();await page.locator('body.fields-start-playing').waitFor();
    const host=page.frameLocator('#game-host');await host.getByLabel('行动',{exact:true}).fill('我看看桥头的地图。');await host.getByRole('button',{name:'发送',exact:true}).click();await host.getByText('你在桥头看过商旅的地图。',{exact:true}).waitFor();
    await page.locator('#game-host').evaluate(async frame=>{const ctx=frame.contentWindow.fixtureContext;ctx.chatMetadata.fields_people_history={campaignId:ctx.chatMetadata.infinite_fields.campaignId,notes:{npc_hw_linsui:'记得问房价'},judgments:{rumor_one:'存疑'}};await ctx.saveChat();});
    const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'保存备份',exact:true}).click()]);
    const bytes=await fs.readFile(await download.path()),backup=JSON.parse(bytes);assert.match(backup.session.chat.at(-1).mes,/桥头看过/);assert.equal(backup.settings.fontSize,22);assert.equal(backup.settings.reducedMotion,true);
    const oldId=backup.session.reference.campaignId,oldBundle=await request('export',{campaignId:oldId});
    await page.getByRole('button',{name:'开始页',exact:true}).click();
    const [importResponse]=await Promise.all([page.waitForResponse(response=>response.url()===`${origin}/api/plugins/infinite-fields/import`),page.getByLabel('导入备份').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:bytes})]);
    assert.equal(importResponse.status(),200);await page.getByRole('heading',{name:'前情提要'}).waitFor();
    await page.getByText(/你在桥头看过商旅的地图/).waitFor();await screenshots('recap');
    await page.getByRole('button',{name:'进入游戏',exact:true}).click();await page.locator('body.fields-start-playing').waitFor();
    const restored=await page.locator('#game-host').evaluate(frame=>{const ctx=frame.contentWindow.fixtureContext;return {reference:ctx.chatMetadata.infinite_fields,notes:ctx.chatMetadata.fields_people_history,chat:ctx.chat,old:frame.contentWindow.fixtureChats.get('old-chat')};});
    assert.notEqual(restored.reference.campaignId,oldId);assert.equal(restored.notes.campaignId,restored.reference.campaignId);assert.equal(restored.notes.notes.npc_hw_linsui,'记得问房价');assert.equal(restored.notes.judgments.rumor_one,'存疑');assert.deepEqual(restored.chat,backup.session.chat);assert.equal(restored.old.chat[0].mes,'原聊天保留');
    await page.getByRole('button',{name:'开始页',exact:true}).click();await page.locator('.start-save').first().getByRole('button',{name:'继续',exact:true}).click();await page.getByRole('heading',{name:'前情提要'}).waitFor();
    await page.getByRole('button',{name:'进入游戏',exact:true}).click();await page.locator('body.fields-start-playing').waitFor();
    assert.deepEqual(await request('export',{campaignId:oldId}),oldBundle);assert.equal(fixedCalls,1);assert.equal(otherModelCalls,0);assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);
    }catch(error){
        const status=await page.locator('#start-status').textContent({timeout:1000}).catch(()=>null);
        throw new Error(`${error.message}\n浏览器诊断：${JSON.stringify({status,pageerror:errors,consoleError:consoleErrors})}`,{cause:error});
    }
});
