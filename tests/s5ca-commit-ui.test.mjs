// S5-A F081：交易已提交、随后聊天保存失败，界面显示已成交；再点同一笔不再扣钱、不再给货，取回原回执。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createPlaytestServer} from '../tools/playtest-runner.mjs';

test('提交成功后保存失败：显示已成交并要求对账；再点同一笔复用原请求编号，只成交一次',{timeout:120000},async t=>{
 const server=await createPlaytestServer({consistencyEnabled:false});t.after(()=>server.close());
 const created=await server.api('create',{});
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:390,height:844}}),executes=[];
 await page.route(/\.(?:mjs|js|css)(?:\?.*)?$/,async route=>{
  const relative=decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
  let body=await fs.readFile(`extension/${relative}`,'utf8');
  if(relative==='runtime.js')body=body.replace("import { getContext } from '../../../extensions.js';",'const getContext=()=>window.fixtureContext;');
  await route.fulfill({contentType:relative.endsWith('.css')?'text/css':'text/javascript',body});
 });
 await page.route('**/assets/**',async route=>{const relative=new URL(route.request().url()).pathname.split('/assets/')[1];await route.fulfill({body:await fs.readFile(`assets/${relative}`)});});
 await page.route('**/api/plugins/infinite-fields/**',async route=>{
  const endpoint=new URL(route.request().url()).pathname.split('/infinite-fields/')[1],body=JSON.parse(route.request().postData());if(endpoint==='execute')executes.push(body);
  try{await route.fulfill({json:await server.api(endpoint,body)});}catch(error){await route.fulfill({status:400,json:{ok:false,error:error.message}});}
 });
 await page.route('**/fixture.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/style.css"><div id="sheld"></div><div id="chat"></div>'}));
 await page.goto('http://localhost/fixture.html');
 await page.evaluate(reference=>{
  const handlers=new Map();window.fixtureHandlers=handlers;window.failSave=false;
  // 宿主的保存函数：测试里替换成会失败的一次。
  window.fixtureContext={characters:[{name:'无限原野·世界主持人'}],characterId:0,chatId:'s5ca',chatMetadata:{infinite_fields:reference},chat:[{mes:'你在酒馆里。',name:'主持人'}],
   getRequestHeaders:()=>({'Content-Type':'application/json'}),saveChat:async()=>{if(window.failSave)throw new Error('聊天保存失败');},setExtensionPrompt:()=>{},registerFunctionTool:()=>{},stopGeneration:()=>{},
   eventTypes:new Proxy({},{get:(_,key)=>key}),eventSource:{on:(event,handler)=>handlers.set(event,handler)}};
 },created.reference);
 await page.evaluate(async()=>{await import('/runtime.js');await window.infiniteFieldsV2.refresh();});
 const snapshot=()=>server.api('read',{campaignId:created.reference.campaignId}).then(v=>({coins:v.document.state.player.coins,bread:v.document.state.inventory.item_bread?.quantity??0,sequence:v.reference.sequence}));
 const before=await snapshot();
 await page.locator('.fields-menu-toggle').click();await page.locator('#fields-toolbar [data-panel="actions"]').click();
 await page.locator('#fields-dialog').waitFor({state:'visible'});await page.locator('.fields-actions-scene').waitFor();
 const buy=async(quantity=2)=>{
  await page.locator('.fields-actions-quick button',{hasText:'交易'}).click();
  await page.locator('button',{hasText:'向林穗买东西'}).click();
  const form=page.locator('form.fields-actions-form');await form.waitFor();
  await form.locator('#fields-slot-item').selectOption('item_bread');await form.locator('#fields-slot-quantity').fill(String(quantity));
  await form.locator('button[type="submit"]').click();
 };
 // 第一次：成交后保存失败。
 await page.evaluate(()=>{window.failSave=true;});
 await buy();
 await page.locator('.fields-actions-entry').first().waitFor();
 const shown=await page.locator('.fields-actions-stream').innerText();
 assert.match(shown,/你向林穗买下2份面包/,'界面显示已成交的回执');assert.match(shown,/已成交/);assert.match(shown,/重新对账|不会重复成交/);assert.doesNotMatch(shown,/没能/);
 const paid=await snapshot();assert.equal(paid.sequence,before.sequence+1);assert.ok(paid.coins<before.coins);assert.equal(paid.bread,before.bread+2);
 // 第二次：保存恢复，再点同一笔——取回原回执，不再扣钱不再给货。
 await page.evaluate(()=>{window.failSave=false;});
 await buy();
 await page.waitForFunction(()=>!/没能|已成交，但/.test(document.querySelector('.fields-actions-stream')?.innerText??'x'));
 const retried=await page.locator('.fields-actions-stream').innerText();assert.match(retried,/你向林穗买下2份面包/);
 const after=await snapshot();assert.deepEqual(after,paid,'重试没有新的经济事件');
 assert.equal(executes.length,2);assert.equal(executes[1].eventId,executes[0].eventId,'重试复用原请求编号');
 // 收尾成功后，同一笔买卖若再发生就是新的一笔（新请求编号）：库存已被前两份买走，被如实拒绝，不会被当成旧请求。
 await buy();
 await page.locator('.fields-actions-stream p',{hasText:'没能买东西'}).first().waitFor();
 assert.equal(executes.length,3);assert.notEqual(executes[2].eventId,executes[0].eventId);
 assert.deepEqual(await snapshot(),paid);
});
