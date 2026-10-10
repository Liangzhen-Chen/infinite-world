import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createPlaytestServer} from '../tools/playtest-runner.mjs';

test('浏览器 MESSAGE_RECEIVED 等待纯文字改写后再提交唯一尾注，配置与诊断不含凭据',{timeout:60000},async t=>{
 const requests=[];let releaseRewrite;
 const barrier=new Promise(resolve=>{releaseRewrite=resolve;});
 const final='<q who="npc_hw_linsui">面包给你。</q><回合 额外="0分" 地点="bld_hw_qingdeng" 在场="npc_hw_linsui"/>';
 const client={async generate(body,label){
  requests.push({body,label});
  if(label.startsWith('consistency-rewrite:')){await barrier;return{choices:[{finish_reason:'stop',message:{content:final}}]};}
  return{choices:[{finish_reason:'tool_calls',message:{tool_calls:[{type:'function',function:{name:'report_consistency_issues',arguments:'{"issues":[]}'}}]}}]};
 }};
 const server=await createPlaytestServer({consistencyClient:client});t.after(()=>server.close());
 const created=await server.api('create',{});
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage(),endpoints=[];
 const runtime=(await fs.readFile('extension/runtime.js','utf8')).replace("import { getContext } from '../../../extensions.js';",'const getContext=()=>window.fixtureContext;');
 await page.route('**/runtime.js',route=>route.fulfill({contentType:'text/javascript',body:runtime}));
 for(const name of ['turn.mjs','state-read.mjs','tools.mjs','prompt.mjs','message-view.mjs'])await page.route(`**/${name}`,async route=>route.fulfill({contentType:'text/javascript',body:await fs.readFile(`extension/${name}`,'utf8')}));
 await page.route('**/api/plugins/infinite-fields/**',async route=>{
  const endpoint=new URL(route.request().url()).pathname.split('/infinite-fields/')[1],body=JSON.parse(route.request().postData());endpoints.push({endpoint,body});
  try{await route.fulfill({json:await server.api(endpoint,body)});}catch(error){await route.fulfill({status:400,json:{ok:false,error:error.message}});}
 });
 await page.route('**/fixture.html',route=>route.fulfill({contentType:'text/html',body:'<div id="sheld"></div><div class="mes" mesid="1"><div class="mes_block"><div class="mes_text"></div></div></div>'}));
 await page.goto('http://fields.test/fixture.html');
 await page.evaluate(reference=>{
  const handlers=new Map();window.fixtureHandlers=handlers;
  window.fixtureContext={characters:[{name:'无限原野·世界主持人'}],characterId:0,chatId:'review-fixture',chatMetadata:{infinite_fields:reference},
   chat:[{is_user:true,mes:'我付钱买一个面包',extra:{fields_anchor:'browser-bread'}}],
   getRequestHeaders:()=>({'Content-Type':'application/json'}),saveChat:async()=>{},setExtensionPrompt:()=>{},registerFunctionTool:()=>{},stopGeneration:()=>{},
   eventTypes:new Proxy({},{get:(_,key)=>key}),eventSource:{on:(event,handler)=>handlers.set(event,handler)}};
 },created.reference);
 await page.evaluate(async()=>{await import('/runtime.js');await window.infiniteFieldsV2.refresh();await window.fixtureHandlers.get('GENERATION_STARTED')('normal',{},false);});
 assert.equal(await page.locator('#fields-consistency-toggle').isChecked(),true);
 await page.evaluate(()=>window.infiniteFieldsV2.execute('world_trade',{seller:'林穗',item:'面包',quantity:1},'browser-trade'));
 await page.evaluate(()=>{
  window.fixtureContext.chat.push({mes:'<q who="npc_unregistered">面包给你。</q><回合 额外="0分" 地点="bld_hw_qingdeng" 在场="npc_hw_linsui"/>',name:'主持人'});
  window.reviewPromise=Promise.all([window.fixtureHandlers.get('MESSAGE_RECEIVED')(1),window.fixtureHandlers.get('MESSAGE_RECEIVED')(1)]);
 });
 await page.waitForFunction(()=>document.querySelector('.mes_text').hidden);
 assert.equal(endpoints.filter(r=>r.body.tool==='world_turn').length,0);
 releaseRewrite();await page.evaluate(()=>window.reviewPromise);
 const message=await page.evaluate(()=>window.fixtureContext.chat[1]);
 assert.equal(message.mes,final);assert.equal(message.extra.fields_consistency.status,'verified');assert.equal(message.extra.fields_consistency.attempts,1);
 assert.equal(endpoints.filter(r=>r.body.tool==='world_trade').length,1);assert.equal(endpoints.filter(r=>r.body.tool==='world_turn').length,1);assert.equal(requests.length,3);
 assert.equal(await page.locator('.mes_text').innerText(),'林穗：面包给你。');assert.equal(await page.locator('.mes_text').isVisible(),true);
 assert.equal(await page.evaluate(()=>window.infiniteFieldsV2.view.document.state.player.coins),178);
 assert.doesNotMatch(JSON.stringify(endpoints),/DEEPSEEK_API_KEY|Authorization|Bearer/);
 await page.locator('#fields-consistency-toggle').uncheck();assert.equal(await page.evaluate(()=>window.fixtureContext.chatMetadata.fields_consistency_enabled),false);
});
