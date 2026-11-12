// A1 界面可操作（无 LLM）：浏览器里打开“可做之事”，用快捷栏与对象菜单买东西、出门、等待，
// 结果按事件流模板显示且与账本一致；390×844 可用，控制台无错误。截图写到 logs/a1-actions-ui.png。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createPlaytestServer} from '../tools/playtest-runner.mjs';

test('可做之事面板：快捷栏交易、出路移动、等待都直接结算，事件流显示已应用效果',{timeout:120000},async t=>{
 const server=await createPlaytestServer({aiProfile:'T0'/*no model client: local rules only*/,consistencyEnabled:false});t.after(()=>server.close());
 const created=await server.api('create',{});
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],endpoints=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route(/\.(?:mjs|js|css)(?:\?.*)?$/,async route=>{
  const relative=decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
  let body=await fs.readFile(`extension/${relative}`,'utf8');
  if(relative==='runtime.js')body=body.replace("import { getContext } from '../../../extensions.js';",'const getContext=()=>window.fixtureContext;');
  await route.fulfill({contentType:relative.endsWith('.css')?'text/css':'text/javascript',body});
 });
 await page.route('**/assets/**',async route=>{const relative=new URL(route.request().url()).pathname.split('/assets/')[1];await route.fulfill({body:await fs.readFile(`assets/${relative}`)});});
 await page.route('**/api/plugins/infinite-fields/**',async route=>{
  const endpoint=new URL(route.request().url()).pathname.split('/infinite-fields/')[1],body=JSON.parse(route.request().postData());endpoints.push({endpoint,body});
  try{await route.fulfill({json:await server.api(endpoint,body)});}catch(error){await route.fulfill({status:400,json:{ok:false,error:error.message}});}
 });
 await page.route('**/fixture.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/style.css"><div id="sheld"></div><div id="chat"></div>'}));
 await page.goto('http://localhost/fixture.html');
 await page.evaluate(reference=>{
  const handlers=new Map();window.fixtureHandlers=handlers;
  window.fixtureContext={characters:[{name:'无限原野·世界主持人'}],characterId:0,chatId:'a1-ui',chatMetadata:{infinite_fields:reference},chat:[{mes:'你在酒馆里。',name:'主持人'}],
   getRequestHeaders:()=>({'Content-Type':'application/json'}),saveChat:async()=>{},setExtensionPrompt:()=>{},registerFunctionTool:()=>{},stopGeneration:()=>{},
   eventTypes:new Proxy({},{get:(_,key)=>key}),eventSource:{on:(event,handler)=>handlers.set(event,handler)}};
 },created.reference);
 await page.evaluate(async()=>{await import('/runtime.js');await window.infiniteFieldsV2.refresh();});
 const coins=()=>page.evaluate(()=>window.infiniteFieldsV2.view.document.state.player.coins);
 const before=await coins();
 await page.locator('.fields-menu-toggle').click();await page.locator('#fields-toolbar [data-panel="actions"]').click();
 const dialog=page.locator('#fields-dialog');await dialog.waitFor({state:'visible'});
 await page.locator('.fields-actions-scene').waitFor();
 assert.match(await page.locator('.fields-actions-scene').innerText(),/青灯酒馆[\s\S]*林穗[\s\S]*出门是河湾村/);
 assert.equal(await page.locator('.fields-actions-quick button').count(),7);
 // 快捷栏「交易」→ 向林穗买东西 → 表单（物品选项来自她的存货）→ 确定
 await page.locator('.fields-actions-quick button',{hasText:'交易'}).click();
 await page.locator('button',{hasText:'向林穗买东西'}).click();
 const form=page.locator('form.fields-actions-form');await form.waitFor();
 await form.locator('#fields-slot-item').selectOption('item_bread');await form.locator('#fields-slot-quantity').fill('2');
 await page.screenshot({path:'logs/a1-actions-ui-form.png'});
 await form.locator('button[type="submit"]').click();
 await page.locator('.fields-actions-entry').first().waitFor();
 const bought=await page.locator('.fields-actions-stream').innerText();
 assert.match(bought,/你向林穗买下2份面包，付了\d+文/);assert.match(bought,/你得到面包×2/);
 const paid=Number(/付了(\d+)文/.exec(bought)[1]);assert.equal(await coins(),before-paid,'事件流里的金额就是账本的变化');
 const act=endpoints.find(e=>e.endpoint==='execute');assert.equal(act.body.tool,'world_act');assert.equal(act.body.anchor,null);assert.equal(act.body.args.action,'core:trade.buy');
 // 对象菜单：返回此处，出路按钮直接打开移动表单
 await page.locator('button',{hasText:'返回此处'}).click();
 await page.locator('.fields-actions-section button',{hasText:'河湾村'}).first().click();
 await form.waitFor();await form.locator('button[type="submit"]').click();
 await page.waitForFunction(()=>window.infiniteFieldsV2.view.document.state.location==='loc_hw');
 await page.locator('.fields-actions-stream p',{hasText:'你走出青灯酒馆，来到河湾村'}).first().waitFor();
 // 快捷栏「等待」：预设 30 分钟
 const minute=await page.evaluate(()=>window.infiniteFieldsV2.view.document.state.minute);
 await page.locator('.fields-actions-quick button',{hasText:'等待'}).click();
 await form.waitFor();await form.locator('.fields-actions-preset',{hasText:'30'}).click();await form.locator('button[type="submit"]').click();
 await page.waitForFunction(m=>window.infiniteFieldsV2.view.document.state.minute>=m+30,minute);
 await page.locator('.fields-actions-stream p',{hasText:'你等了30分钟'}).first().waitFor();
 // 拒绝时显示世界内原因，账本不变
 const atRefusal=await coins();
 const refused=await page.evaluate(()=>window.infiniteFieldsV2.act('core:trade.buy',{seller:'林穗',item:'面包',quantity:1}));
 assert.equal(refused.ok,false);assert.match(refused.error,/不在场/);assert.equal(await coins(),atRefusal);
 // 布局：390 宽不横向溢出，触控目标不小于 44px
 const layout=await page.evaluate(()=>({scroll:document.querySelector('#fields-dialog').scrollWidth,client:document.querySelector('#fields-dialog').clientWidth,
  small:[...document.querySelectorAll('#fields-dialog .fields-actions button')].filter(b=>b.getBoundingClientRect().height<44&&b.offsetParent).length}));
 assert.ok(layout.scroll<=layout.client+1,`横向溢出 ${layout.scroll}>${layout.client}`);assert.equal(layout.small,0);
 await page.screenshot({path:'logs/a1-actions-ui.png',fullPage:true});
 const feed=await page.evaluate(()=>window.fixtureContext.chatMetadata.fields_event_feed);assert.equal(feed.length,3);
 // 唯一的网络 400 是上面故意的拒绝；没有脚本错误。
 assert.deepEqual(errors.filter(e=>!/status of 400/.test(e)),[]);assert.equal(errors.length,1);
});
