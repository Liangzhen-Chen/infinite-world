import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createPlaytestServer} from '../tools/playtest-runner.mjs';

test('浏览器 MESSAGE_RECEIVED 等待纯文字改写后再提交唯一尾注，配置与诊断不含凭据',{timeout:60000},async t=>{
 const requests=[];let releaseRewrite,holdReviewReply=null;
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
 for(const name of ['turn.mjs','state-read.mjs','tools.mjs','prompt.mjs','message-view.mjs','ledger-view.mjs'])await page.route(`**/${name}`,async route=>route.fulfill({contentType:'text/javascript',body:await fs.readFile(`extension/${name}`,'utf8')}));
 await page.route('**/api/plugins/infinite-fields/**',async route=>{
  const endpoint=new URL(route.request().url()).pathname.split('/infinite-fields/')[1],body=JSON.parse(route.request().postData());endpoints.push({endpoint,body});
  try{const result=await server.api(endpoint,body);if(endpoint==='review/reply'&&holdReviewReply)await holdReviewReply;await route.fulfill({json:result});}catch(error){await route.fulfill({status:400,json:{ok:false,error:error.message}});}
 });
 await page.route('**/fixture.html',route=>route.fulfill({contentType:'text/html',body:'<div id="sheld"></div><div class="mes" mesid="2"><div class="mes_block"><div class="mes_text"></div></div></div>'}));
 await page.goto('http://localhost/fixture.html');
 await page.evaluate(reference=>{
  const handlers=new Map();window.fixtureHandlers=handlers;
  window.fixtureContext={characters:[{name:'无限原野·世界主持人'}],characterId:0,chatId:'review-fixture',chatMetadata:{infinite_fields:reference},
   chat:[{mes:'柜台前有空位。',name:'主持人'}],
   getRequestHeaders:()=>({'Content-Type':'application/json'}),saveChat:async()=>{},setExtensionPrompt:()=>{},registerFunctionTool:()=>{},stopGeneration:()=>{},
   eventTypes:new Proxy({},{get:(_,key)=>key}),eventSource:{on:(event,handler)=>handlers.set(event,handler)}};
 },created.reference);
 await page.evaluate(async()=>{await import('/runtime.js');await window.infiniteFieldsV2.refresh();await window.fixtureHandlers.get('GENERATION_STARTED')('normal',{},false);
  window.fixtureContext.chat.push({is_user:true,mes:'我付钱买一个面包',extra:{fields_anchor:'browser-bread'}});await window.fixtureHandlers.get('MESSAGE_SENT')(1);
 });
 assert.equal(endpoints.filter(row=>row.endpoint==='review/begin').length,1);assert.equal(endpoints.find(row=>row.endpoint==='review/begin').body.playerText,'我付钱买一个面包');
 assert.equal(await page.locator('#fields-consistency-toggle').isChecked(),true);
 await page.evaluate(()=>window.infiniteFieldsV2.execute('world_trade',{seller:'林穗',item:'面包',quantity:1},'browser-trade'));
 await page.evaluate(()=>{
  window.fixtureContext.chat.push({mes:'<q who="npc_unregistered">面包给你。</q><回合 额外="0分" 地点="bld_hw_qingdeng" 在场="npc_hw_linsui"/>',name:'主持人'});
  window.reviewPromise=Promise.all([window.fixtureHandlers.get('MESSAGE_RECEIVED')(2),window.fixtureHandlers.get('MESSAGE_RECEIVED')(2)]);
 });
 await page.waitForFunction(()=>document.querySelector('.mes_text').hidden);
 assert.equal(endpoints.filter(r=>r.body.tool==='world_turn').length,0);
 releaseRewrite();await page.evaluate(()=>window.reviewPromise);
 const message=await page.evaluate(()=>window.fixtureContext.chat[2]);
 assert.equal(message.mes,final);assert.equal(message.extra.fields_consistency.status,'verified');assert.equal(message.extra.fields_consistency.attempts,1);
 assert.equal(endpoints.filter(r=>r.body.tool==='world_trade').length,1);assert.equal(endpoints.filter(r=>r.body.tool==='world_turn').length,1);assert.equal(requests.length,3);
 assert.equal(await page.locator('.mes_text').innerText(),'林穗：面包给你。');assert.equal(await page.locator('.mes_text').isVisible(),true);
 assert.equal(await page.evaluate(()=>window.infiniteFieldsV2.view.document.state.player.coins),178);
 assert.doesNotMatch(JSON.stringify(endpoints),/DEEPSEEK_API_KEY|Authorization|Bearer/);

 assert.equal(await page.locator('.fields-consistency-notice').count(),0);
 await page.evaluate(()=>{
  const m=window.fixtureContext.chat[2];m.extra.fields_consistency={status:'issues',verified:true,canCommit:true,text:m.mes,issues:[{severity:'warning',reason:'npc_private token_hidden prompt_hidden'}],feedback:'不能展示的内部证据'};
  document.querySelector('#fields-error').textContent='短暂全局提示';document.querySelector('#fields-error').hidden=false;
  window.fixtureHandlers.get('MESSAGE_UPDATED')(2);
 });
 assert.match(await page.locator('.fields-consistency-notice').innerText(),/仍需复核/);
 assert.equal(await page.locator('.fields-notices').getAttribute('aria-label'),'本回合已提交变化');
 await page.evaluate(async()=>{window.fixtureContext.chat=JSON.parse(JSON.stringify(window.fixtureContext.chat));await window.infiniteFieldsV2.refresh();});
 assert.equal(await page.locator('.fields-consistency-notice').count(),1);
 await page.evaluate(()=>window.infiniteFieldsV2.execute('world_time',{minutes:1},'review-later-success'));
 assert.equal(await page.locator('#fields-error').isHidden(),true);
 assert.match(await page.locator('.fields-consistency-notice').innerText(),/仍需复核/);
 assert.doesNotMatch(await page.locator('.fields-consistency-notice').innerText(),/npc_|token|prompt|内部证据/);
 await page.evaluate(()=>{
  for(const [status,canCommit]of [['unverified',true],['issues',false],['verified',true]]){
   const index=window.fixtureContext.chat.length,mes=`历史回复${index}`;window.fixtureContext.chat.push({mes,name:'主持人',extra:{fields_consistency:{status,canCommit,verified:status!=='unverified',text:mes,issues:[]}}});
   const element=document.createElement('div');element.className='mes';element.setAttribute('mesid',index);element.innerHTML='<div class="mes_block"><div class="mes_text"></div></div>';document.body.append(element);
  }
  window.fixtureHandlers.get('MESSAGE_UPDATED')();
 });
 assert.equal(await page.locator('.fields-consistency-notice').count(),3);
 assert.match(await page.locator('.mes[mesid="3"] .fields-consistency-notice').innerText(),/未验证/);
 assert.match(await page.locator('.mes[mesid="4"] .fields-consistency-notice').innerText(),/收尾已暂停/);
 await page.evaluate(()=>{window.fixtureContext.chat[1].extra.fields_invalidated=true;window.fixtureHandlers.get('MESSAGE_UPDATED')();});
 assert.equal(await page.locator('.fields-consistency-notice').count(),0);
 await page.evaluate(()=>{window.fixtureContext.chat[1].extra.fields_invalidated=false;window.fixtureHandlers.get('MESSAGE_UPDATED')();});
 await page.evaluate(async()=>{const m=window.fixtureContext.chat[2],original=m.mes;m.mes='编辑后的回复';await window.fixtureHandlers.get('MESSAGE_EDITED')(2);m.mes=original;window.fixtureHandlers.get('MESSAGE_UPDATED')();});
 assert.equal(await page.locator('.mes[mesid="2"] .fields-consistency-notice').count(),0);
 assert.equal(await page.evaluate(()=>window.fixtureContext.chat[2].extra.fields_consistency),undefined);
 await page.evaluate(()=>{window.fixtureContext.chat[3].extra.fields_invalidated=true;window.fixtureContext.chat[4].mes='另一次编辑尚未发事件';window.fixtureHandlers.get('MESSAGE_UPDATED')();});
 assert.equal(await page.locator('.fields-consistency-notice').count(),0);
 // A response returning after an assistant edit must not restore its stale review or overwrite the edit.
 let releaseReview;holdReviewReply=new Promise(resolve=>{releaseReview=resolve;});
 const turnsBeforeEdit=endpoints.filter(r=>r.body.tool==='world_turn').length;
 await page.evaluate(async()=>{window.fixtureContext.chat.push({is_user:true,mes:'我只看看柜台',extra:{fields_anchor:'browser-edited-review'}});await window.fixtureHandlers.get('MESSAGE_SENT')(6);window.fixtureContext.chat.push({mes:'柜台上没有新的动静。<回合 额外="0分" 地点="bld_hw_qingdeng" 在场="npc_hw_linsui"/>',name:'主持人'});const element=document.createElement('div');element.className='mes';element.setAttribute('mesid','7');element.innerHTML='<div class="mes_block"><div class="mes_text"></div></div>';document.body.append(element);window.editedReviewPromise=window.fixtureHandlers.get('MESSAGE_RECEIVED')(7);});
 await page.waitForFunction(()=>document.querySelector('.mes[mesid="7"] .mes_text').hidden);
 await page.evaluate(async()=>{window.fixtureContext.chat[7].mes='我手工保留的修订';await window.fixtureHandlers.get('MESSAGE_EDITED')(7);});
 releaseReview();await page.evaluate(()=>window.editedReviewPromise);holdReviewReply=null;
 assert.equal(await page.evaluate(()=>window.fixtureContext.chat[7].mes),'我手工保留的修订');
 assert.equal(await page.locator('.mes[mesid="7"] .fields-consistency-notice').count(),0);
 assert.equal(endpoints.filter(r=>r.body.tool==='world_turn').length,turnsBeforeEdit);
 await page.evaluate(async()=>{const m=window.fixtureContext.chat[4];m.mes='待撤销的旧回复';m.extra.fields_consistency={status:'unverified',verified:false,text:m.mes};window.fixtureHandlers.get('MESSAGE_UPDATED')();await window.fixtureHandlers.get('MESSAGE_EDITED')(1);});
 assert.equal(await page.locator('.fields-consistency-notice').count(),0);
 // The browser uses the same server normalization as the offline runner.
 const turnsBeforeWait=endpoints.filter(row=>row.body.tool==='world_turn').length;
 const startMinute=await page.evaluate(()=>window.infiniteFieldsV2.view.document.state.minute);
 await page.evaluate(async()=>{
  window.fixtureContext.chat.push({is_user:true,mes:'我原地休息十分钟，不再聊天。',extra:{fields_anchor:'browser-wait'}});
  await window.fixtureHandlers.get('MESSAGE_SENT')(8);
  await window.infiniteFieldsV2.execute('world_time',{minutes:10},'browser-wait-time');
  window.fixtureContext.chat.push({mes:'<q who="npc_hw_linsui">歇好了。<回合 额外="5分" 地点="bld_hw_qingdeng" 在场="npc_hw_linsui"/>',name:'主持人'});
  const element=document.createElement('div');element.className='mes';element.setAttribute('mesid','9');element.innerHTML='<div class="mes_block"><div class="mes_text"></div></div>';document.body.append(element);
  await Promise.all([window.fixtureHandlers.get('MESSAGE_RECEIVED')(9),window.fixtureHandlers.get('MESSAGE_RECEIVED')(9)]);
 });
 const waited=await page.evaluate(()=>window.fixtureContext.chat[9]);
 assert.equal(waited.extra.fields_consistency.protocol.changed,true);assert.match(waited.extra.fields_consistency.original,/额外="5分"/);assert.match(waited.mes,/额外="0分"/);
 assert.equal(await page.evaluate(()=>window.infiniteFieldsV2.view.document.state.minute)-startMinute,10);
 assert.equal(endpoints.filter(row=>row.body.tool==='world_turn').length-turnsBeforeWait,1);
 assert.match(await page.locator('.mes[mesid="9"] .mes_text').innerText(),/林穗/);assert.doesNotMatch(await page.locator('.mes[mesid="9"] .mes_text').innerText(),/npc_|who=|<q/);
 await page.locator('#fields-consistency-toggle').uncheck();assert.equal(await page.evaluate(()=>window.fixtureContext.chatMetadata.fields_consistency_enabled),false);
});
