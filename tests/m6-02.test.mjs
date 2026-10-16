import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {once} from 'node:events';
import express from 'express';
import {chromium} from 'playwright-core';
import {init} from '../server-plugin/index.mjs';
import {messageProjection} from '../server-plugin/ui-messages.mjs';
import {stateNotices,playerDocuments} from '../server-plugin/state-notices.mjs';
import {messageFeedback,technicalMessage,playerError,unknownSpeakers,setMessagePresentation} from '../extension/message-view.mjs';
import {inputForMode} from '../extension/input-view.mjs';
import {collectedDocuments} from '../extension/mail-view.mjs';

function sample(){
    return {player:{name:'旅人',coins:180,hp:10,maxHp:10,mp:5,maxMp:5},location:'inn',minute:10,
        npcs:{seen:{location:'inn'},hidden:{location:'elsewhere'}},turns:{a:{present:['met']}},
        records:{contract:{category:'contract',name:'住宿',parties:['player','met'],status:'有效',expires:30},
            privateContract:{category:'contract',name:'秘密合同',parties:['hidden','other'],status:'有效'},
            news:{category:'announcement',name:'招工告示',content:'招一位帮工。',knownBy:['player']},
            hiddenNews:{category:'announcement',name:'秘密公告',content:'别人的消息',visibility:'public',knownBy:['hidden']}},
        npcCognition:{messages:{received:{from:'met',to:'player',channel:'magic',status:'已交付',content:'明天见。'},
            transit:{from:'hidden',to:'player',channel:'magic',status:'在途',content:'在途秘密'},
            private:{from:'met',to:'hidden',channel:'magic',status:'已交付',content:'私人信件'}}}};
}
const engine={byId:new Map([['seen',{name:'酒馆伙计'}],['met',{name:'林穗'}],['hidden',{name:'未见人物真名'}]])};

test('M6-02 玩家投影只读，姓名与信件按见面及实际交付过滤',()=>{
    const document={state:sample()},before=structuredClone(document),result=messageProjection(engine,document);
    assert.deepEqual(document,before);assert.deepEqual(result.labels,{met:'林穗',seen:'酒馆伙计',player:'旅人'});
    assert.deepEqual(result.documents.map(row=>row.id),['record:contract','record:news','message:received']);
    assert.equal(result.documents[2].text,'明天见。');assert.equal(result.documents[0].deadline,30);
    assert.doesNotMatch(JSON.stringify(result),/未见人物|秘密|在途|hidden|private/);
});

test('M6-02 公告、合同及来信由实际事件生成，收藏不保留撤销内容',()=>{
    const after=sample(),before=structuredClone(after);before.records={};before.npcCognition.messages={};
    const notices=stateNotices(before,after,id=>engine.byId.get(id)?.name);
    assert.deepEqual(notices.filter(row=>row.card).map(row=>row.card.kind),['contract','announcement','letter']);
    assert.doesNotMatch(JSON.stringify(notices),/秘密|在途/);
    const chat=[{is_user:true,extra:{fields_anchor:'a'}},{mes:'收到信了',extra:{fields_notices:notices}}],events=[{anchor:'a',notices}];
    assert.equal(messageFeedback(chat,events).messages.get(1).length,3);
    assert.equal(messageFeedback(chat,[]).messages.size,0);
    chat[0].extra.fields_invalidated=true;assert.equal(messageFeedback(chat,events).messages.size,0);
    const context={chatMetadata:{fields_mail:['record:news','message:received']}};
    assert.equal(collectedDocuments(context,playerDocuments(after)).length,2);
    assert.deepEqual(collectedDocuments(context,playerDocuments(before)),[]);
});

test('M6-02 未登记说话人、说做切换及技术错误的确认状态',()=>{
    const context={chatId:'one',chatMetadata:{infinite_fields:{sequence:1}},chat:[{mes:'<q who="met">你好。</q><q who="unknown">等等。</q>'},{is_system:true,mes:'<q who="private">工具</q>'}]};
    setMessagePresentation(context,{key:`one:${JSON.stringify(context.chatMetadata.infinite_fields)}`,labels:{met:'林穗'}});
    assert.deepEqual(unknownSpeakers(context),['unknown']);context.chatMetadata.fields_speakers={unknown:'戴帽子的客人'};
    assert.deepEqual(unknownSpeakers(context),[]);context.chatMetadata.infinite_fields.sequence=2;assert.deepEqual(unknownSpeakers(context),['met']);
    context.chat.push({mes:'<q who="__proto__">等等。</q>'});assert.deepEqual(unknownSpeakers(context),['met','__proto__']);
    assert.equal(inputForMode('问问天气','say'),'我说：“问问天气”');assert.equal(inputForMode('我说：“问问天气”','do'),'我准备问问天气');
    assert.equal(inputForMode('我准备问问天气','say'),'我说：“问问天气”');
    assert.equal(technicalMessage({mes:'{"ok":true,"patches":[]}'}),true);assert.equal(technicalMessage({mes:'普通叙述'}),false);
    assert.match(playerError('执行结果尚未确认：spawn EPERM token=secret'),/尚未确认/);
    assert.equal(playerError('操作未完成：钱袋余额不足，需要 6 铜。'),'操作未完成：钱袋余额不足，需要 6 铜。');
    assert.doesNotMatch(playerError('行动已保存，显示更新失败：JSON invalid /root/private'),/JSON|root|private/);
});

async function fixture(t){
    const root=await fs.mkdtemp(path.join(tmpRoot(),'fields-m6-02-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const app=express();app.use(express.json());const router=express.Router();
    await init(router,{baseRoot:root,npcPlanningEnabled:false,consistencyEnabled:false});app.use('/api/plugins/infinite-fields',router);
    const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());const origin=`http://127.0.0.1:${server.address().port}`;
    const request=async(endpoint,body={})=>{
        const response=await fetch(`${origin}/api/plugins/infinite-fields/${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        return {status:response.status,body:await response.json()};
    };return {origin,request};
}

test('M6-02 消息路由按当前战役读取，不改变存档，模块自动注册',async t=>{
    const {request}=await fixture(t),created=await request('create',{name:'旅人'}),campaignId=created.body.reference.campaignId;
    const before=await request('export',{campaignId}),result=await request('ui/messages',{campaignId}),after=await request('export',{campaignId});
    assert.equal(result.status,200);assert.deepEqual(before,after);assert.deepEqual(result.body.reference,created.body.reference);
    assert.equal(result.body.labels.player,'旅人');assert.equal(result.body.npcs,undefined);assert.equal(result.body.document,undefined);
    assert.equal((await request('ui/messages',{campaignId:'../other-user'})).status,400);
    assert.equal((await request('ui/messages',{campaignId:'missing'})).status,404);
    assert.ok((await request('ui/modules')).body.modules.includes('ui-messages.mjs'));
});

test('M6-02 浏览器：名牌、登记、事件邮件、错误及手机输入，两主题截图', {timeout:60000},async t=>{
    const {origin,request}=await fixture(t),created=await request('create',{name:'旅人'});
    const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});t.after(()=>browser.close());
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
    const projection=messageProjection(engine,{state:sample()});let events=[{anchor:'a',notices:[{type:'coins',text:'钱袋 -6铜，现有 174'},...projection.documents.map(card=>({type:card.kind,text:card.title,card}))]}];
    await page.route('**/fixture.html',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"></head><body><div id="sheld"><div id="chat"><div class="mes" mesid="1"><div class="mes_block"><div class="mes_text"></div></div></div><div class="mes" mesid="2"><div class="mes_text"></div></div></div><div id="form_sheld"><form id="send_form"><textarea id="send_textarea" aria-label="行动输入"></textarea><button type="submit">发送</button></form></div></div></body></html>'}));
    await page.route('**/*.mjs',async route=>route.fulfill({contentType:'text/javascript; charset=utf-8',body:await fs.readFile(`extension/${new URL(route.request().url()).pathname.split('/').at(-1)}`,'utf8')}));
    await page.route('**/runtime.js',async route=>route.fulfill({contentType:'text/javascript; charset=utf-8',body:(await fs.readFile('extension/runtime.js','utf8')).replace("import { getContext } from '../../../extensions.js';","const getContext=()=>window.fixtureContext;")}));
    await page.route('**/assets/fonts/**',async route=>route.fulfill({body:await fs.readFile(`assets/fonts/${new URL(route.request().url()).pathname.split('/').at(-1)}`)}));
    await page.route('**/api/plugins/infinite-fields/ui/messages',route=>route.fulfill({json:projection}));
    await page.route('**/api/plugins/infinite-fields/feedback',route=>route.fulfill({json:{events}}));
    await page.goto(`${origin}/fixture.html`);await page.addStyleTag({content:await fs.readFile('extension/style.css','utf8')});
    await page.evaluate(reference=>{
        window.sent=0;document.querySelector('form').onsubmit=event=>{event.preventDefault();window.sent++;};
        window.fixtureContext={characters:[{name:'无限原野·世界主持人'}],characterId:0,chatId:'m6-02',chatMetadata:{infinite_fields:reference},
            chat:[{is_user:true,mes:'看看来信',extra:{fields_anchor:'a'}},{name:'主持人',mes:'雨停了。<q who="met">房间备好了。</q><q who="unknown">请等一下。</q><回合 额外="0分" 地点="inn"/>',extra:{fields_notices:[{text:'过期缓存'}]}},{mes:'{"ok":true,"patches":[],"token":"secret"}',extra:{tool_invocations:[{}]}}],
            getRequestHeaders:()=>({'Content-Type':'application/json'}),saveChat:async()=>{window.saved=structuredClone(window.fixtureContext.chat);},setExtensionPrompt:()=>{},registerFunctionTool:()=>{},stopGeneration:()=>{},eventTypes:{},eventSource:{on:()=>{}}};
    },created.body.reference);
    await page.evaluate(async()=>{await import('/runtime.js');await window.infiniteFieldsV2.refresh();await document.fonts.ready;});
    await page.waitForFunction(()=>document.querySelector('.fields-speaker')?.textContent.includes('林穗'));
    assert.equal(await page.evaluate(()=>document.characterSet),'UTF-8');assert.equal(await page.locator('.fields-dialogue').count(),2);
    assert.match(await page.locator('.mes_text').first().innerText(),/路人/);assert.doesNotMatch(await page.locator('.mes_text').first().innerText(),/回合|npc_|unknown/);
    assert.equal(await page.locator('.mes[mesid="2"]').isVisible(),false);assert.doesNotMatch(await page.locator('.fields-notices').innerText(),/过期缓存/);
    assert.equal(await page.evaluate(()=>window.saved[1].extra.fields_notices.length),4);
    await page.getByRole('button',{name:'观察',exact:true}).click();assert.equal(await page.getByLabel('行动输入').inputValue(),'我仔细观察周围。');
    await page.getByRole('button',{name:'说',exact:true}).click();assert.match(await page.getByLabel('行动输入').inputValue(),/^我说：“/);assert.equal(await page.evaluate(()=>window.sent),0);
    await page.locator('.fields-document-card').last().getByRole('button',{name:'收藏到邮件'}).click();
    const report='docs/测试报告/最新/M6-02';await fs.mkdir(report,{recursive:true});
    for(const theme of ['dark','light']){
        await page.evaluate(async theme=>(await import('/ui-settings.mjs')).updateSettings({theme}),theme);
        await page.setViewportSize({width:1440,height:900});await page.screenshot({path:`${report}/${theme}-desktop-messages.png`});
        await page.setViewportSize({width:390,height:844});
        await page.evaluate(()=>{const error=document.querySelector('#fields-error');error.hidden=false;error.textContent='执行结果尚未确认，请重新对账：spawn EPERM token=secret';});
        await page.waitForFunction(()=>!document.querySelector('#fields-error').textContent.includes('secret'));
        assert.match(await page.locator('#fields-error').innerText(),/尚未确认/);
        const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,items:[...document.querySelectorAll('.fields-topbar-context>*,.fields-mp')].every(node=>{const r=node.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&node.scrollWidth<=node.clientWidth;})}));
        assert.deepEqual(layout,{overflow:false,items:true});await page.screenshot({path:`${report}/${theme}-mobile-input-error.png`});
        await page.getByRole('button',{name:'面板',exact:true}).click();await page.getByRole('button',{name:'邮件',exact:true}).first().click();
        await page.getByLabel('只看收藏').check();assert.equal(await page.locator('#fields-dialog .fields-document-card').count(),1);assert.match(await page.locator('#fields-dialog').innerText(),/明天见/);
        await page.screenshot({path:`${report}/${theme}-mobile-mail.png`});await page.keyboard.press('Escape');
    }
    await page.getByRole('button',{name:'面板',exact:true}).click();await page.getByRole('button',{name:'说话人登记',exact:true}).first().click();
    await page.getByLabel('路人 1 的称呼').fill('戴帽子的客人');await page.getByRole('button',{name:'保存称呼',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#chat').textContent.includes('戴帽子的客人'));await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'面板',exact:true}).click();await page.getByRole('button',{name:'阅读设置',exact:true}).first().click();
    await page.getByLabel('输入快捷键 Alt+1 说、Alt+2 做').uncheck();await page.getByLabel('调试模式',{exact:true}).check();
    assert.equal(await page.locator('.mes[mesid="2"]').isVisible(),true);await page.getByLabel('调试模式',{exact:true}).uncheck();await page.keyboard.press('Escape');
    await page.getByLabel('行动输入').fill('保留原草稿');await page.getByLabel('行动输入').press('Alt+1');assert.equal(await page.getByLabel('行动输入').inputValue(),'保留原草稿');assert.equal(await page.evaluate(()=>window.sent),0);
    events=[];projection.documents=[];await page.evaluate(()=>window.infiniteFieldsV2.refresh());
    assert.equal(await page.locator('.fields-notices').count(),0);assert.deepEqual(await page.evaluate(()=>window.fixtureContext.chat[1].extra.fields_notices),[]);
    await page.getByRole('button',{name:'面板',exact:true}).click();await page.getByRole('button',{name:'邮件',exact:true}).first().click();await page.getByLabel('只看收藏').check();
    assert.equal(await page.locator('#fields-dialog .fields-document-card').count(),0);assert.deepEqual(errors,[]);
});
