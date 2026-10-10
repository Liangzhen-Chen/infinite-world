import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once}from'node:events';
import express from '../SillyTavern/node_modules/express/index.js';
import {chromium}from'../tools/node_modules/playwright-core/index.mjs';
import {init}from'../server-plugin/index.mjs';
test('E2/E19 浏览器：失败对账阻止出站生成，编辑与删除同步服务器，元数据只留引用',{timeout:60000},async t=>{
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'infinite-fields-browser-'));
    t.after(()=>fs.rm(directory,{recursive:true,force:true}));
    const app=express();app.use(express.json());const router=express.Router();await init(router,{baseRoot:directory});app.use('/api/plugins/infinite-fields',router);
    const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
    const origin=`http://127.0.0.1:${server.address().port}`;
    const response=await fetch(`${origin}/api/plugins/infinite-fields/create`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    const created=await response.json();
    const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});t.after(()=>browser.close());
    const page=await browser.newPage();let failReconcile=false,generationRequests=0;
    const runtime=(await fs.readFile('extension/runtime.js','utf8')).replace("import { getContext } from '../../../extensions.js';","const getContext=()=>window.fixtureContext;");
    await page.route('**/runtime.js',route=>route.fulfill({contentType:'text/javascript',body:runtime}));
    await page.route('**/turn.mjs',async route=>route.fulfill({contentType:'text/javascript',body:await fs.readFile('extension/turn.mjs','utf8')}));
    await page.route('**/state-read.mjs',async route=>route.fulfill({contentType:'text/javascript',body:await fs.readFile('extension/state-read.mjs','utf8')}));
    await page.route('**/api/plugins/infinite-fields/**',async route=>{
        const request=route.request(),url=new URL(request.url());
        if(failReconcile&&url.pathname.endsWith('/reconcile'))return route.fulfill({status:400,json:{ok:false,error:'故意损坏的回放夹具'}});
        const actual=await fetch(origin+url.pathname,{method:request.method(),headers:{'Content-Type':'application/json'},body:request.postData()});
        await route.fulfill({status:actual.status,json:await actual.json()});
    });
    await page.route('**/api/backends/chat-completions/generate',async route=>{generationRequests++;await route.fulfill({json:{error:'不应到达这里'}});});
    await page.route('**/fixture.html',route=>route.fulfill({contentType:'text/html',body:'<div id="sheld"></div><textarea id="send_textarea"></textarea>'}));
    await page.goto(`${origin}/fixture.html`);
    await page.evaluate(reference=>{
        const handlers=new Map(),tools=new Map();window.fixtureHandlers=handlers;window.fixtureTools=tools;
        window.fixtureContext={characters:[{name:'无限原野·世界主持人',avatar:'fixture.png'}],characterId:0,chatId:'fixture',
            chatMetadata:{infinite_fields:reference},chat:[{is_user:true,mes:'我在酒馆',extra:{fields_anchor:'original'}}],
            getRequestHeaders:()=>({'Content-Type':'application/json'}),saveChat:async()=>{window.savedMetadata=JSON.parse(JSON.stringify(window.fixtureContext.chatMetadata));},
            setExtensionPrompt:(_key,prompt)=>{window.scenePrompt=prompt;},registerFunctionTool:tool=>tools.set(tool.name,tool),
            stopGeneration:()=>{window.stopped=true;},eventTypes:new Proxy({},{get:(_,key)=>key}),eventSource:{on:(key,callback)=>handlers.set(key,callback)}};
    },created.reference);
    await page.evaluate(async()=>{await import('/runtime.js');await window.infiniteFieldsV2.refresh();});
    const read=await page.evaluate(async()=>{
        const tool=window.fixtureTools.get('world_read');
        return{inventory:JSON.parse(await tool.action({section:'行囊'})),player:JSON.parse(await tool.action({section:'玩家'})),invalid:JSON.parse(await tool.action({section:'不认识的栏目'}))};
    });
    assert.equal(read.inventory.item_staff.quantity,1);assert.equal(read.player.coins,180);assert.equal(read.invalid.ok,false);
    const move=await page.evaluate(()=>window.infiniteFieldsV2.execute('world_move',{destination:'河湾村'},'moved'));assert.equal(move.ok,true);
    const metadata=await page.evaluate(()=>window.savedMetadata.infinite_fields);
    assert.equal(metadata.format,2);assert.equal(metadata.state,undefined);assert.equal(metadata.journal,undefined);
    failReconcile=true;
    await page.evaluate(()=>window.infiniteFieldsV2.reconcile('regenerate',{},false));
    const blocked=await page.evaluate(async()=>{
        try{await fetch('/api/backends/chat-completions/generate',{method:'POST',body:'{}'});return false;}catch{return true;}
    });
    assert.equal(blocked,true);assert.equal(generationRequests,0);assert.equal(await page.evaluate(()=>window.stopped),true);
    failReconcile=false;
    await page.locator('#fields-toolbar button').nth(1).click();
    await page.waitForFunction(()=>window.infiniteFieldsV2.blocked===null);
    await page.evaluate(()=>window.fixtureHandlers.get('MESSAGE_EDITED')(0));
    assert.equal(await page.evaluate(()=>window.infiniteFieldsV2.view.document.state.location),'bld_hw_qingdeng');
    assert.equal(typeof await page.evaluate(()=>typeof window.fixtureHandlers.get('MESSAGE_EDITED')),'string');
    assert.equal(generationRequests,0);
});
