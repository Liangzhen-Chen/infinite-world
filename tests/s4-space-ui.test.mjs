import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createPlaytestServer} from '../tools/playtest-runner.mjs';

test('S4 无模型空间菜单：真实等待裁剪人物，分区按钮移动并保留锁门边界', {timeout:120000},async t=>{
 const server=await createPlaytestServer({consistencyEnabled:false});t.after(()=>server.close());
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});t.after(()=>browser.close());
 for(const viewport of [{width:390,height:844},{width:1280,height:900}]){
  const created=await server.api('create',{}),campaignId=created.reference.campaignId;
  const page=await browser.newPage({viewport}),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route(/\.(?:mjs|js|css)(?:\?.*)?$/,async route=>{
   const relative=decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
   let body=await fs.readFile(`extension/${relative}`,'utf8');
   if(relative==='runtime.js')body=body.replace("import { getContext } from '../../../extensions.js';",'const getContext=()=>window.fixtureContext;');
   await route.fulfill({contentType:relative.endsWith('.css')?'text/css':'text/javascript',body});
  });
  await page.route('**/assets/**',async route=>{const relative=new URL(route.request().url()).pathname.split('/assets/')[1];await route.fulfill({body:await fs.readFile(`assets/${relative}`)});});
  await page.route('**/api/plugins/infinite-fields/**',async route=>{
   const endpoint=new URL(route.request().url()).pathname.split('/infinite-fields/')[1],body=JSON.parse(route.request().postData());requests.push({endpoint,body});
   try{await route.fulfill({json:await server.api(endpoint,body)});}catch(error){await route.fulfill({status:400,json:{ok:false,error:error.message}});}
  });
  await page.route('**/fixture.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/style.css"><div id="sheld"></div><div id="chat"></div>'}));
  await page.goto('http://localhost/fixture.html');
  await page.evaluate(reference=>{
   window.fixtureContext={characters:[{name:'无限原野·世界主持人'}],characterId:0,chatId:'s4-space',chatMetadata:{infinite_fields:reference},chat:[{mes:'你在酒馆里。',name:'主持人'}],
    getRequestHeaders:()=>({'Content-Type':'application/json'}),saveChat:async()=>{},setExtensionPrompt:()=>{},registerFunctionTool:()=>{},stopGeneration:()=>{},
    eventTypes:new Proxy({},{get:(_,key)=>key}),eventSource:{on:()=>{}}};
  },created.reference);
  await page.evaluate(async()=>{await import('/runtime.js');await window.infiniteFieldsV2.refresh();});
  if(await page.locator('.fields-menu-toggle').isVisible())await page.locator('.fields-menu-toggle').click();
  await page.locator('#fields-toolbar [data-panel="actions"]').click();
  const dialog=page.locator('#fields-dialog');await dialog.locator('.fields-actions-scene').waitFor();
  assert.match(await dialog.locator('.fields-actions-scene').innerText(),/林穗/);
  const minute=await page.evaluate(()=>window.infiniteFieldsV2.view.document.state.minute),wait=(1200-minute%1440+1440)%1440;
  await dialog.locator('.fields-actions-quick').getByRole('button',{name:'等待',exact:true}).click();
  const form=dialog.locator('form.fields-actions-form');await form.waitFor();
  await form.locator('#fields-slot-minutes').fill(String(wait));await form.locator('button[type="submit"]').click();
  await page.waitForFunction(m=>window.infiniteFieldsV2.view.document.state.minute===m,minute+wait);
  await page.waitForFunction(()=>!document.querySelector('.fields-actions-scene')?.textContent.includes('林穗'));
  assert.equal(await dialog.getByRole('button',{name:/^林穗/}).count(),0);
  const travelled=await page.evaluate(()=>window.infiniteFieldsV2.act('core:move',{destination:'bld_bs_reed_dao',mode:'walk'}));
  assert.equal(travelled.ok,true,travelled.error);
  await page.waitForFunction(()=>window.infiniteFieldsV2.view.document.state.location==='bld_bs_reed_dao');
  await dialog.getByRole('button',{name:/观门侧廊/}).first().click();
  await form.waitFor();await form.locator('button[type="submit"]').click();
  await page.waitForFunction(()=>window.infiniteFieldsV2.view.document.state.records.local_player_position?.zone==='zone_reed_side');
  assert.match(await dialog.locator('.fields-actions-scene').innerText(),/所在分区.*观门侧廊/);
  const current=await server.api('read',{campaignId}),menu=await server.api('actions',{campaignId});
  assert.equal(current.document.state.records.local_player_position.zone,'zone_reed_side');
  assert.equal(menu.objects.exits.find(e=>e.id==='zone_reed_library').permission.allowed,false);
  assert.ok(requests.some(r=>r.endpoint==='execute'&&r.body.tool==='world_act'&&r.body.args.action==='core:move'&&r.body.args.slots.destination==='zone_reed_side'));
  assert.equal(requests.some(r=>/generate|model/.test(r.endpoint)),false);
  const layout=await dialog.evaluate(e=>({scroll:e.scrollWidth,client:e.clientWidth}));
  assert.ok(layout.scroll<=layout.client+1);assert.deepEqual(errors,[]);
  await page.close();
 }
});
