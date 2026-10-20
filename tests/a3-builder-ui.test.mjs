import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createPlaytestServer} from '../tools/playtest-runner.mjs';

test('真实后端无模型构造器：手机/桌面四步、预览取消、确认、stale及拒绝',{timeout:120000},async t=>{
 const server=await createPlaytestServer({consistencyClient:{async generate(){throw Error('测试叙述模型离线');}}});t.after(()=>server.close());
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
   const handlers=new Map();window.fixtureHandlers=handlers;window.fixtureTools=new Map();
   window.fixtureContext={characters:[{name:'无限原野·世界主持人'}],characterId:0,chatId:'a3-builder-ui',chatMetadata:{infinite_fields:reference},chat:[{mes:'你在酒馆里。',name:'主持人'}],
    getRequestHeaders:()=>({'Content-Type':'application/json'}),saveChat:async()=>{},setExtensionPrompt:()=>{},registerFunctionTool:tool=>window.fixtureTools.set(tool.name,tool),stopGeneration:()=>{},
    eventTypes:new Proxy({},{get:(_,key)=>key}),eventSource:{on:(event,handler)=>handlers.set(event,handler)}};
  },created.reference);
  await page.evaluate(async()=>{await import('/runtime.js');await window.infiniteFieldsV2.refresh();});
  const modelMenu=await page.evaluate(async()=>JSON.parse(await window.fixtureTools.get('world_actions').action({query:'core:craft'})));
  assert.ok(modelMenu.actions.some(a=>a.slots.some(s=>s.name==='helpers'&&s.multiple===true)));
  await page.locator('.fields-menu-toggle').click();await page.locator('#fields-toolbar [data-panel="actions"]').click();
  const dialog=page.locator('#fields-dialog');await page.locator('.fields-actions-scene').waitFor();
  await dialog.getByRole('button',{name:/^林穗/}).click();
  const builder=dialog.locator('.fields-action-builder');
  const fill=async(quantity=1)=>{
   await dialog.getByRole('button',{name:'其他…',exact:true}).click();
   await builder.getByRole('button',{name:'买东西',exact:true}).click();
   assert.equal(await builder.locator('#fields-builder-seller').inputValue(),'npc_hw_linsui');
   await builder.getByRole('button',{name:'下一步',exact:true}).click();await builder.locator('#fields-builder-item').selectOption('item_bread');
   await builder.getByRole('button',{name:'下一步',exact:true}).click();await builder.locator('#fields-builder-quantity').fill(String(quantity));
   await builder.getByRole('button',{name:'预览代价与结果',exact:true}).click();
  };
  const read=()=>server.api('read',{campaignId}),before=await read();
  await fill();await builder.locator('.fields-builder-preview').waitFor();assert.match(await builder.innerText(),/费用：2文/);
  assert.deepEqual((await read()).document,before.document,'预览不改变真实后端');
  await builder.getByRole('button',{name:'取消',exact:true}).click();assert.deepEqual((await read()).document,before.document);
  await fill();await builder.getByRole('button',{name:'确认执行',exact:true}).click();
  await page.waitForFunction(coins=>window.infiniteFieldsV2.view.document.state.player.coins===coins-2,before.document.state.player.coins);
  const bought=await read();assert.equal(bought.document.state.inventory.item_bread.quantity??bought.document.state.inventory.item_bread,1);
  const executedAt=requests.findIndex(r=>r.endpoint==='execute'),execute=requests[executedAt],preview=requests.slice(0,executedAt).filter(r=>r.endpoint==='propose').at(-1);assert.equal(execute.body.eventId,preview.body.eventId);assert.equal(execute.body.anchor,null);
  await fill();await builder.locator('.fields-builder-preview').waitFor();
  await server.api('execute',{campaignId,tool:'world_act',args:{action:'core:time',slots:{minutes:1}},eventId:`external-${viewport.width}`,anchor:null,expectedSequence:bought.reference.sequence});
  const changed=await read();await builder.getByRole('button',{name:'确认执行',exact:true}).click();
  await builder.getByRole('alert').filter({hasText:'情形已变化'}).waitFor();assert.deepEqual((await read()).document,changed.document);
  await builder.getByRole('button',{name:'取消',exact:true}).click();
  await fill(100000);await builder.getByRole('alert').waitFor();assert.equal(await builder.getByRole('button',{name:'确认执行',exact:true}).count(),0);assert.deepEqual((await read()).document,changed.document);
  await builder.getByRole('button',{name:'取消',exact:true}).click();
  const timeAction=(await server.api('actions',{campaignId,query:'core:time'})).actions.find(a=>a.id==='core:time');
  await dialog.getByRole('button',{name:'其他…',exact:true}).click();await builder.locator('#fields-builder-intent').fill('core:time');await builder.getByRole('button',{name:'找相近的动作',exact:true}).click();
  await builder.getByRole('button',{name:timeAction.label,exact:true}).click();await builder.getByRole('button',{name:'下一步',exact:true}).click();await builder.getByRole('button',{name:'下一步',exact:true}).click();
  const targetMinute=changed.document.state.minute+15;
  for(const [key,value]of [['dayOffset',Math.floor(targetMinute/1440)-Math.floor(changed.document.state.minute/1440)],['hour',Math.floor(targetMinute%1440/60)],['minute',targetMinute%60]]){
   await builder.locator(`#fields-builder-until-${key}`).fill(String(value));await builder.locator(`#fields-builder-until-${key}`).press('Tab');
  }
  await builder.getByRole('button',{name:'预览代价与结果',exact:true}).click();await builder.locator('.fields-builder-preview').waitFor();assert.deepEqual((await read()).document,changed.document);
  await builder.getByRole('button',{name:'确认执行',exact:true}).click();await page.waitForFunction(minute=>window.infiniteFieldsV2.view.document.state.minute===minute,targetMinute);
  const timed=await read();assert.equal(timed.document.state.minute,targetMinute);
  const attributes=(await server.api('actions',{campaignId,query:'core:attributes'})).actions.find(a=>a.id==='core:attributes');
  await dialog.getByRole('button',{name:'其他…',exact:true}).click();await builder.locator('#fields-builder-intent').fill('core:attributes');await builder.getByRole('button',{name:'找相近的动作',exact:true}).click();
  await builder.getByRole('button',{name:attributes.label,exact:true}).click();await builder.getByRole('button',{name:'下一步',exact:true}).click();await builder.getByRole('button',{name:'下一步',exact:true}).click();
  await builder.locator('#fields-builder-attributes-体质').fill('1');await builder.locator('#fields-builder-attributes-体质').press('Tab');
  await builder.getByRole('button',{name:'预览代价与结果',exact:true}).click();await builder.getByRole('alert').waitFor();assert.equal(await builder.getByRole('button',{name:'确认执行',exact:true}).count(),0);assert.deepEqual((await read()).document,timed.document);
  await builder.getByRole('button',{name:'取消',exact:true}).click();
  // Real reply review uses an offline client. Runtime must display replayed
  // templates and finish the UI turn without committing the narrator's tail.
  await page.evaluate(async()=>{
   window.fixtureContext.chat.push({is_user:true,mes:'等待一分钟。',extra:{}});
   await window.infiniteFieldsV2.execute('world_time',{minutes:1},'fallback-wait');
  });
  const settled=await read();
  await page.evaluate(async()=>{
   const chat=window.fixtureContext.chat;chat.push({is_user:false,mes:'你瞬间得到一座金山。',extra:{}});await window.fixtureHandlers.get('MESSAGE_RECEIVED')(chat.length-1);
  });
  const fallback=await page.evaluate(()=>window.fixtureContext.chat.at(-1));
  assert.equal(fallback.extra.fields_turn.fallback,true);assert.ok(!fallback.mes.includes('金山'));assert.match(fallback.mes,/1分钟/);
  assert.deepEqual((await read()).document,settled.document);assert.equal((await read()).reference.sequence,settled.reference.sequence);
  const layout=await dialog.evaluate(e=>({scroll:e.scrollWidth,client:e.clientWidth,small:[...e.querySelectorAll('.fields-action-builder button,.fields-action-builder select,.fields-action-builder input')].filter(n=>n.offsetParent&&n.getBoundingClientRect().height<44).length}));
  assert.ok(layout.scroll<=layout.client+1);assert.equal(layout.small,0);assert.deepEqual(errors,[]);
  assert.equal(requests.some(r=>/generate|model/.test(r.endpoint)),false);
  await page.close();
 }
});
