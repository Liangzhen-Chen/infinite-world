import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const entry=JSON.parse(fs.readFileSync(new URL('../跑团资料/战役入口.json',import.meta.url)));
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({locale:'zh-CN'});
const page=await context.newPage();
page.setDefaultTimeout(60000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>localStorage.setItem('language','zh-cn'));
await page.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>window.infiniteFields && document.querySelector('#fields-toolbar'));
await page.waitForFunction(()=>SillyTavern.getContext().onlineStatus !== 'no_connection');
const testName=`配置验证-${Date.now()}`;
const original=await page.evaluate(()=>SillyTavern.getContext().chatId);
console.log('中文界面、主持人、工具与自动连接已载入。');
try {
    await page.evaluate(async({name,avatar})=>{
        const c=SillyTavern.getContext();
        const saved=[{user_name:'旅人',character_name:c.name2,chat_metadata:structuredClone(c.chatMetadata)},...structuredClone(c.chat)];
        saved[0].chat_metadata.integrity=crypto.randomUUID();
        const r=await fetch('/api/chats/save',{method:'POST',headers:c.getRequestHeaders(),body:JSON.stringify({avatar_url:avatar,file_name:name,force:true,chat:saved})});
        if(!r.ok) throw new Error('Cannot create test branch');
        await c.openCharacterChat(name);
    },{name:testName,avatar:entry.avatar});
    const send=async text=>{
        await page.waitForFunction(async()=>!(await import('/script.js')).is_send_press,{},{timeout:60000});
        await page.locator('#send_textarea').fill(text);
        await page.evaluate(()=>SillyTavern.getContext().generate('normal'));
        return page.evaluate(()=>{
            const c=SillyTavern.getContext();
            return {reply:[...c.chat].reverse().find(v=>!v.is_system && !v.is_user)?.mes,state:structuredClone(window.infiniteFields.campaign()),chatLength:c.chat.length,tools:c.chat.filter(v=>v.extra?.tool_invocations).flatMap(v=>v.extra.tool_invocations.map(t=>t.name))};
        });
    };
    const rent=await send('我对林穗说：“我先住一晚，六枚铜币。”我数出六枚铜币交给她，确认她收下，再把行囊拿到她安排的房间。');
    fs.writeFileSync(new URL('../logs/租房实测.json',import.meta.url),JSON.stringify(rent,null,2));
    assert.equal(rent.state.state.player.coins,174,'租房必须实际扣六铜');
    assert.ok(Object.values(rent.state.state.records).some(v=>/客房|租房|住宿|房间/.test(v.name+v.content)),'租房须有持久记录');
    assert.ok(rent.tools.includes('world_commit'));
    assert.doesNotMatch(rent.reply,/下楼时|你[^。\n]{0,15}下楼/,'不能替玩家安排本次意图以外的下楼行动');
    console.log('真实 DeepSeek 租房回复完成：180铜 → 174铜，住宿记录已保存。');
    const spell=await send('我在房间里对旧木杖施放已学会的照明术，看看杖头的光能否照亮桌面。');
    fs.writeFileSync(new URL('../logs/施法实测.json',import.meta.url),JSON.stringify(spell,null,2));
    assert.equal(spell.state.state.player.mp,9,'照明术须实际消耗1MP');
    assert.ok(spell.tools.includes('world_cast'));
    console.log('真实 DeepSeek 施法回复完成：10MP → 9MP。');
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.infiniteFields && document.querySelector('#fields-toolbar'));
    const reloaded=await page.evaluate(()=>window.infiniteFields.campaign().state.player);
    assert.equal(reloaded.coins,174);assert.equal(reloaded.mp,9);
    console.log('页面重载后账本保持一致。');
    // Exercise persisted long-term memory and full-history search while a recent
    // summary deliberately omits the old detail.
    const memory=await page.evaluate(async()=>{
        const c=SillyTavern.getContext();
        await c.ToolManager.invokeFunctionTool('world_remember',{subject:'林穗',key:'旧船票',content:'曾给旅人看过一张蓝色雁渡船票，编号雁渡-73。',keywords:['船票','雁渡','林穗']});
        c.chat.at(-1).extra ??= {};c.chat.at(-1).extra.memory='近期旅人正在房间试照明术。';
        await c.saveChat();
        return JSON.parse(await c.ToolManager.invokeFunctionTool('world_search',{query:'林穗 雁渡 船票',limit:4}));
    });
    assert.ok(memory.results.some(v=>v.text.includes('雁渡-73')));
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.infiniteFields && document.querySelector('#fields-toolbar'));
    const persisted=await page.evaluate(()=>window.infiniteFields.campaign().memories['林穗::旧船票']);
    assert.ok(persisted.content.includes('雁渡-73'));
    console.log('近期摘要未包含的长期事实，重载后仍能检索。');
    // Export/import uses a distinct chat file and does not replace the source.
    const backup=await page.evaluate(()=>{
        const c=SillyTavern.getContext();
        return {format:'infinite-fields-backup-v1',campaign:structuredClone(window.infiniteFields.campaign()),chatMetadata:structuredClone(c.chatMetadata),chat:structuredClone(c.chat),chatId:c.chatId};
    });
    await page.locator('#fields-toolbar button').click();
    await page.locator('#fields-dialog input[type=file]').setInputFiles({name:'test-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
    await page.waitForFunction(()=>SillyTavern.getContext().chatId.startsWith('导入存档-') && window.infiniteFields.campaign().state.player.coins===174);
    const imported=await page.evaluate(()=>window.infiniteFields.campaign());
    assert.equal(imported.state.player.coins,174);assert.equal(imported.state.player.mp,9);
    assert.ok(imported.memories['林穗::旧船票'].content.includes('雁渡-73'));
    console.log('完整存档导入为独立战役后，资源与长期记忆一致。');
    console.log(JSON.stringify({passed:true,pageErrors:errors}));
} finally {
    await page.evaluate(async name=>{await SillyTavern.getContext().openCharacterChat(name);},original).catch(()=>{});
    await browser.close();
}
