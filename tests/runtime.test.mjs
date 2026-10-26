import {applyIntentSetup} from '../tools/a3-score.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot,artifactPath}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {once}from'node:events';
import express from 'express';
import {chromium}from'playwright-core';
import {init}from'../server-plugin/index.mjs';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches}from'../server-plugin/storage.mjs';
test('E2/E19 浏览器：失败对账阻止出站生成，编辑撤销刷新玩家账本，元数据只留引用',{timeout:60000},async t=>{
    const directory=await fs.mkdtemp(path.join(tmpRoot(),'infinite-fields-browser-'));
    t.after(()=>fs.rm(directory,{recursive:true,force:true}));
    const app=express();app.use(express.json());const router=express.Router();await init(router,{baseRoot:directory});app.use('/api/plugins/infinite-fields',router);
    const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
    const origin=`http://127.0.0.1:${server.address().port}`;
    const response=await fetch(`${origin}/api/plugins/infinite-fields/create`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    const created=await response.json();
    const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});t.after(()=>browser.close());
    const page=await browser.newPage(),pageErrors=[],consoleErrors=[];let failReconcile=false,generationRequests=0,preReleaseFixture=false;
    page.on('pageerror',error=>pageErrors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
    await page.route('**/favicon.ico',route=>route.fulfill({status:204}));
    await page.route(/\.(?:mjs|js|css)(?:\?.*)?$/,async route=>{
        const relative=decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
        let body=await fs.readFile(path.join('extension',relative),'utf8');
        if(relative==='runtime.js')body=body.replace("import { getContext } from '../../../extensions.js';","const getContext=()=>window.fixtureContext;");
        await route.fulfill({contentType:`${relative.endsWith('.css')?'text/css':'text/javascript'}; charset=utf-8`,body});
    });
    await page.route('**/api/plugins/infinite-fields/**',async route=>{
        const request=route.request(),url=new URL(request.url());
        if(failReconcile&&url.pathname.endsWith('/reconcile'))return route.fulfill({status:400,json:{ok:false,error:'故意损坏的回放夹具'}});
        const actual=await fetch(origin+url.pathname,{method:request.method(),headers:{'Content-Type':'application/json'},body:request.postData()});
        const json=await actual.json();
        if(preReleaseFixture&&url.pathname.endsWith('/read'))delete json.document.releaseVersion;
        await route.fulfill({status:actual.status,json});
    });
    await page.route('**/api/backends/chat-completions/generate',async route=>{generationRequests++;await route.fulfill({json:{error:'不应到达这里'}});});
    await page.route('**/fixture.html',route=>route.fulfill({contentType:'text/html',body:'<div id="sheld"></div><textarea id="send_textarea"></textarea>'}));
    await page.goto(`${origin}/fixture.html`);
    await page.addStyleTag({content:await fs.readFile('extension/style.css','utf8')});
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
    // The actual extension hook begins capture, and its registered tool sends
    // that server token. Both calls reach the temporary HTTP server.
    const searchEvidence=await page.evaluate(async()=>{
        const calls=[];const originalFetch=window.fetch;
        window.fetch=async(url,options)=>{if(String(url).includes('/api/plugins/infinite-fields/'))calls.push({endpoint:String(url).split('/').at(-1),body:JSON.parse(options.body)});return originalFetch(url,options);};
        window.fixtureContext.getTokenCountAsync=async()=>1;
        await window.infiniteFieldsV2.historyInterceptor(window.fixtureContext.chat,8192,()=>{},'normal');
        const before=await originalFetch('/api/plugins/infinite-fields/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({campaignId:window.infiniteFieldsV2.view.reference.campaignId})}).then(r=>r.json());
        const found=await window.fixtureTools.get('world_search').action({query:'林穗'});
        const after=await originalFetch('/api/plugins/infinite-fields/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({campaignId:window.infiniteFieldsV2.view.reference.campaignId})}).then(r=>r.json());
        window.fetch=originalFetch;return {calls,found,before,after};
    });
    const beginRequest=searchEvidence.calls.find(row=>row.endpoint==='begin'),searchRequest=searchEvidence.calls.find(row=>row.endpoint==='search');
    assert.equal(beginRequest.body.captureSearch,true);assert.match(searchRequest.body.token,/^[a-f0-9]{64}$/);
    assert.equal(searchRequest.body.anchor,'original');assert.equal(searchRequest.body.campaignId,created.reference.campaignId);
    assert.equal(searchRequest.body.expectedSequence,created.reference.sequence);assert.ok(searchEvidence.found.results.length);
    assert.deepEqual(searchEvidence.after.events,searchEvidence.before.events);assert.deepEqual(searchEvidence.after.initial,searchEvidence.before.initial);
    const captured=JSON.parse(await fs.readFile(path.join(directory,'infinite-fields',created.reference.campaignId,'consistency',`${searchRequest.body.token}.json`),'utf8'));
    assert.deepEqual(captured.retrieval.calls[0].result,searchEvidence.found);
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
    await page.getByRole('button',{name:'重新对账',exact:true}).click();
    await page.waitForFunction(()=>window.infiniteFieldsV2.blocked===null);
    await page.evaluate(()=>window.fixtureHandlers.get('MESSAGE_EDITED')(0));
    assert.equal(await page.evaluate(()=>window.infiniteFieldsV2.view.document.state.location),'bld_hw_qingdeng');
    assert.equal(typeof await page.evaluate(()=>typeof window.fixtureHandlers.get('MESSAGE_EDITED')),'string');
    assert.equal(generationRequests,0);
    // Real browser rendering consumes active server events, never prose or cached chat extras.
    await page.evaluate(()=>window.infiniteFieldsV2.reconcile('normal',{},false));
    const rented=await page.evaluate(()=>window.infiniteFieldsV2.execute('world_trade',{seller:'林穗',service:'住宿',days:1},'rent-ui'));
    assert.equal(rented.ok,true);assert.match(await page.locator('#fields-pending').innerText(),/钱袋 -6铜，现有 174/);
    await page.evaluate(async()=>{
        window.fixtureContext.chat.push({is_system:true,mes:'tool payload',extra:{tool_invocations:[{}]}});
        window.fixtureContext.chat.push({name:'主持人',mes:'<q who="npc_hw_linsui">房间备好了。</q>\n<回合 额外="0分" 地点="bld_hw_qingdeng" 在场="npc_hw_linsui"/>',extra:{fields_notices:[{text:'过期缓存不应出现'}]}});
        const chat=document.createElement('div');chat.id='chat';chat.innerHTML='<div class="mes" mesid="1"><div class="mes_text"></div></div><div class="mes" mesid="2"><div class="mes_block"><details class="mes_reasoning_details" open><summary>思考</summary>内部推理</details><div class="mes_text"></div></div></div>';document.body.append(chat);
        await window.fixtureHandlers.get('MESSAGE_RECEIVED')(2);
    });
    assert.equal(await page.locator('.mes[mesid="1"]').isVisible(),false);
    assert.equal(await page.locator('.mes_reasoning_details').isVisible(),false);
    assert.deepEqual((await page.locator('.mes[mesid="2"] .mes_text').innerText()).split('\n').filter(Boolean),['林','林穗','房间备好了。']);
    assert.match(await page.locator('.fields-notices').innerText(),/钱袋 -6铜，现有 174/);
    assert.doesNotMatch(await page.locator('.fields-notices').innerText(),/过期缓存/);
    assert.equal(await page.evaluate(()=>window.infiniteFieldsV2.view.document.state.minute),550);
    await page.evaluate(()=>window.infiniteFieldsV2.refresh());
    assert.equal(await page.locator('.fields-notices').count(),1);
    await page.evaluate(()=>window.infiniteFieldsV2.execute('world_trade',{seller:'林穗',service:'住宿',days:1},'rent-ui'));
    assert.equal(await page.evaluate(()=>window.infiniteFieldsV2.view.document.state.player.coins),174);
    const failed=await page.evaluate(()=>window.infiniteFieldsV2.execute('world_trade',{seller:'林穗',item:'item_bread',quantity:999999},'bad-ui'));
    assert.equal(failed.ok,false);assert.match(await page.locator('#fields-error').innerText(),/操作未完成/);
    assert.equal(await page.evaluate(()=>window.infiniteFieldsV2.view.document.state.player.coins),174);
    await page.getByRole('button',{name:'世界账本',exact:true}).click();
    assert.match(await page.locator('#fields-ledger-content').innerText(),/174 铜/);
    assert.match(await page.locator('.fields-ledger-recent').innerText(),/钱袋 -6铜，现有 174/);
    assert.doesNotMatch(await page.locator('#fields-ledger-content').innerText(),/npc_hw_|bld_hw_|item_staff|fields_anchor|过期缓存/);
    await page.evaluate(()=>window.infiniteFieldsV2.reconcile('regenerate',{},false));
    assert.match(await page.locator('#fields-ledger-content').innerText(),/180 铜/);
    assert.doesNotMatch(await page.locator('.fields-ledger-recent').innerText(),/钱袋 -6铜/);
    await page.keyboard.press('Escape');
    await page.locator('#fields-dialog').waitFor({state:'detached'});
    assert.equal(await page.locator('#fields-dialog').count(),0);
    assert.equal(await page.locator('.fields-notices').count(),0);
    assert.equal(await page.evaluate(()=>window.infiniteFieldsV2.view.document.state.player.coins),180);
    const credit=await page.evaluate(()=>window.infiniteFieldsV2.execute('world_trade',{seller:'林穗',service:'住宿',payment:'credit',creditMinutes:60},'credit-ui'));
    assert.equal(credit.ok,true);
    assert.match(await page.locator('.fields-notices').innerText(),/欠林穗 6铜 · 待偿还/);
    await page.getByRole('button',{name:'世界账本',exact:true}).click();
    assert.match(await page.locator('#fields-dialog').innerText(),/欠款：林穗 · 未还 6铜 · 待偿还/);
    // P3 / design section 9 and P3: relocate evidence only; retain all screenshot, ledger, layout and gameplay assertions.
    const reportDirectory=artifactPath('测试报告','最新');
    await fs.mkdir(reportDirectory,{recursive:true});
    const consoleStart=consoleErrors.length;
    await page.setViewportSize({width:1440,height:900});
    await page.screenshot({path:`${reportDirectory}/T20-ledger-desktop.png`});
    await page.setViewportSize({width:390,height:844});
    const layout=await page.evaluate(()=>({document:document.documentElement.scrollWidth<=innerWidth,dialog:document.querySelector('#fields-dialog').scrollWidth<=document.querySelector('#fields-dialog').clientWidth,content:document.querySelector('#fields-ledger-content').getBoundingClientRect().right<=innerWidth}));
    assert.deepEqual(layout,{document:true,dialog:true,content:true});
    await page.screenshot({path:`${reportDirectory}/T20-ledger-mobile-state.png`});
    await page.locator('#fields-dialog').evaluate(node=>{node.scrollTop=node.scrollHeight;});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.screenshot({path:`${reportDirectory}/T20-ledger-mobile-changes.png`});
    assert.equal(await page.getByRole('button',{name:'关闭',exact:true}).isVisible(),true);
    assert.deepEqual(pageErrors,[]);
    assert.deepEqual(consoleErrors.slice(consoleStart),[]);
    // NPC-to-NPC commitments and unaccepted public quests are not the player's ledger.
    const projection=await page.evaluate(async()=>{
        const {renderLedger}=await import('/ledger-view.mjs'),state=structuredClone(window.infiniteFieldsV2.view.document.state),container=document.createElement('div');
        state.obligations={mine:{promisor:'npc_hw_linsui',promisee:'player',content:'我与林穗约定收取包裹',status:'待履行'},private:{promisor:'npc_secret_a',promisee:'npc_secret_b',content:'秘密会面细节',status:'进行中'}};
        state.quests={accepted:{publisher:'npc_hw_linsui',taker:'player',content:'我已接下的送货',status:'进行中'},posted:{publisher:'player',taker:null,content:'我发布的修理委托',status:'公开'},unseen:{publisher:'npc_secret_a',taker:null,content:'未知告示内容',status:'公开'}};
        state.created={npc_secret_a:{name:'未获知的真名'}};state.player.companions=['npc_secret_a'];
        renderLedger(container,state,{},[], '当前日期');return container.textContent;
    });
    assert.match(projection,/我与林穗约定收取包裹/);
    assert.match(projection,/我已接下的送货/);
    assert.match(projection,/我发布的修理委托/);
    assert.doesNotMatch(projection,/秘密会面细节|未知告示内容|未获知的真名|npc_secret/);
    const ledgerReport={pass:true,fixture:'isolated local server and temporary campaign; no user saves',viewport:{width:390,height:844},layout,pageErrors,consoleErrors:consoleErrors.slice(consoleStart),consoleScope:'Ledger screenshots only; deliberate failed API fixtures earlier in this test are outside this scope',checks:['current server receipts and balances','edit rollback removes stale balances and receipts','only player obligations and accepted or player-published quests','unknown created names stay hidden','literal DOM text instead of raw JSON','Escape and close button','390x844 document and drawer have no horizontal overflow'],screenshots:['T20-ledger-desktop.png','T20-ledger-mobile-state.png','T20-ledger-mobile-changes.png'],scope:'Player ledger drawer only; M6 full interface and deployed SillyTavern remain unverified'};
    await page.getByRole('button',{name:'关闭',exact:true}).click();
    await page.getByRole('button',{name:'面板',exact:true}).click();
    await page.getByRole('button',{name:'世界账本',exact:true}).click();
    assert.match(await page.locator('#fields-dialog').innerText(),/欠款：林穗 · 未还 6铜 · 待偿还/);
    await page.evaluate(()=>window.infiniteFieldsV2.execute('world_time',{minutes:60},'credit-wait-ui'));
    assert.match(await page.locator('.fields-notices').innerText(),/欠林穗 6铜 · 逾期/);
    assert.match(await page.locator('#fields-ledger-content').innerText(),/欠款：林穗 · 未还 6铜 · 逾期/);
    assert.match(await page.locator('.fields-ledger-recent').innerText(),/欠林穗 6铜 · 逾期/);
    await page.evaluate(()=>window.infiniteFieldsV2.refresh());
    assert.equal(await page.evaluate(()=>window.infiniteFieldsV2.view.document.state.player.coins),180);
    await page.evaluate(()=>window.infiniteFieldsV2.reconcile('regenerate',{},false));
    assert.equal(await page.locator('.fields-notices').count(),0);
    assert.doesNotMatch(await page.locator('#fields-ledger-content').innerText(),/欠款：林穗/);
    assert.match(await page.locator('.fields-ledger-recent').innerText(),/暂无已提交的变化/);
    // Opening an old chat must not silently migrate or save its metadata.
    await page.evaluate(async()=>{
        window.fixtureContext.chatId='old-chat';window.fixtureContext.chatMetadata={infinite_fields:{version:1,untouched:true}};
        window.savedMetadata=null;await window.infiniteFieldsV2.refresh();
    });
    assert.equal(await page.locator('#fields-dialog').count(),0);
    assert.equal(await page.evaluate(()=>window.savedMetadata),null);
    assert.equal(await page.getByRole('button',{name:'在副本上启用新版'}).count(),1);
    assert.equal(await page.locator('.mes_reasoning_details').isVisible(),true);
    preReleaseFixture=true;
    await page.evaluate(async reference=>{
        window.fixtureContext.chatId='pre-release-native';window.fixtureContext.chatMetadata={infinite_fields:reference};
        window.savedMetadata=null;await window.infiniteFieldsV2.refresh();
    },created.reference);
    assert.equal(await page.evaluate(()=>window.savedMetadata),null);
    assert.equal(await page.evaluate(()=>window.infiniteFieldsV2.view),null);
    assert.equal(await page.getByRole('button',{name:'在副本上启用新版'}).count(),1);
    assert.deepEqual(pageErrors,[]);
    await fs.writeFile(`${reportDirectory}/T20-ledger-browser.json`,JSON.stringify({...ledgerReport,generatedAt:new Date().toISOString()},null,2)+'\n');
});

test('T41 浏览器：现有账本显示实际居民与分村贡献，重绘不叠加且不展示其他人物贡献',{timeout:30000},async t=>{
    const world=await loadWorld();for(const npc of world.npcs){delete npc.schedule;delete npc.tier;}
    const engine=new WorldEngine(world),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json'));
    let doc=engine.createCharacter(legacy,{},'civic-browser');doc.state.player.coins=1000;doc.state.location='bld_hw_qingdeng';doc.state.npcs.npc_hw_linsui.location=doc.state.location;
    const run=async(tool,args,eventId)=>{const out=await engine.reduce(doc,{tool,args,eventId});doc=applyPatches(doc,out.patches);return out.result;};
    await run('world_trade',{seller:'npc_hw_linsui',service:'住宿',days:7},'room');
    doc.state.minute=doc.state.records.contract_room_room.starts+3*1440;doc.state.location='bld_hw_council';
    for(const id of ['npc_hw_linsui','npc_hw_chenbai']){doc.state.npcs[id].location=doc.state.location;doc.state.npcs[id].activity='商谈';}
    const args={settlement:'loc_hw',sponsor:'npc_hw_linsui',authority:'npc_hw_chenbai'};
    await run('world_settlement',{...args,operation:'civic_residence'},'residence');
    await run('world_settlement',{...args,operation:'civic_sponsor'},'sponsor');
    await run('world_settlement',{...args,operation:'civic_apply_resident'},'resident');
    // S5-01: declare the unrelated donation stock in the actual resource account, preserving its ten-unit contribution.
    const staged=applyIntentSetup(engine,doc,{inventory:{item_oats:10}});assert.deepEqual(staged.setupUnmet,[]);doc=staged.document;
    const donation=await run('world_farm',{operation:'donate',settlement:'loc_hw',quantity:10},'grain');
    const other={category:'civic_contribution',subject:'npc_hw_luqing',settlement:'loc_bs_yupo',kind:'teaching',points:99};
    doc.state.records['civic_source:private-teacher']=other;
    const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});t.after(()=>browser.close());
    const page=await browser.newPage({viewport:{width:390,height:844}});
    await page.route('http://ledger.fixture/**',async route=>route.fulfill({contentType:route.request().url().endsWith('.mjs')?'text/javascript':'text/html',body:route.request().url().endsWith('.mjs')?await fs.readFile('extension/ledger-view.mjs','utf8'):'<div id="ledger"></div>'}));
    await page.goto('http://ledger.fixture/');await page.addStyleTag({content:await fs.readFile('extension/style.css','utf8')});
    const payload={state:doc.state,labels:Object.fromEntries(engine.entities.map(row=>[row.id,row.name])),events:[{notices:donation.notices}]};
    await page.evaluate(async payload=>{window.civicPayload=payload;window.renderCivic=(await import('/ledger-view.mjs')).renderLedger;window.renderCivic(document.querySelector('#ledger'),payload.state,payload.labels,payload.events);},payload);
    let text=await page.locator('#ledger').innerText();
    assert.match(text,/户籍与聚落贡献/);assert.match(text,/河湾村 · 居住起日 1/);assert.match(text,/居民 · 已登记 · 已付 5铜/);assert.match(text,/河湾村 · 贡献 2/);
    assert.doesNotMatch(text,/贡献 99|private-teacher|公民 · 已登记/);
    await page.evaluate(()=>window.renderCivic(document.querySelector('#ledger'),window.civicPayload.state,window.civicPayload.labels,window.civicPayload.events));
    assert.equal(await page.locator('#ledger').innerText(),text);
    await page.evaluate(()=>window.renderCivic(document.querySelector('#ledger'),{...window.civicPayload.state,records:{}},window.civicPayload.labels,[]));
    text=await page.locator('#ledger').innerText();assert.match(text,/居住史尚未登记/);assert.doesNotMatch(text,/居民 · 已登记|贡献 2/);
});
