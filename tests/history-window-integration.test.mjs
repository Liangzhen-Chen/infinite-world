import{browserExecutablePath}from'./helpers/browser-path.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createPlaytestServer,runPlaytest} from '../tools/playtest-runner.mjs';
import {loadPromptBundle} from '../tools/build-card.mjs';
import {groupHistory,planHistoryWindow} from '../extension/history-window.mjs';

async function campaign(server,count=24){
 const created=await server.api('create',{}),campaignId=created.reference.campaignId,chat=[];let view=created;
 for(let i=0;i<count;i++){
  const anchor=`history-${i}`;chat.push({is_user:true,mes:i?'（场外）核对旧事'+i:'买一个面包，想起蓝色风筝。',extra:{fields_anchor:anchor}});
  if(!i)await server.api('execute',{campaignId,anchor,eventId:'old-bread',tool:'world_trade',args:{seller:'林穗',item:'面包',quantity:1},expectedSequence:view.reference.sequence});
  view=await server.api('read',{campaignId});
  await server.api('execute',{campaignId,anchor,eventId:`turn_${anchor}`,tool:'world_turn',args:{outOfCharacter:true},expectedSequence:view.reference.sequence});
  view=await server.api('read',{campaignId});chat.push({mes:i?'已核对。':'面包放在柜台上。',name:'主持人'});
 }
 await server.api('sync-index',{campaignId,start:0,messages:chat,total:chat.length});
 return {campaignId,chat,view};
}
const grouped=chat=>groupHistory(chat,{format:'host',tokenCounts:chat.map(()=>100)});
test('HTTP 覆盖证明来自当前编年史与原文索引；裁剪后可查旧事，编辑撤销使旧游标失效',async t=>{
 const server=await createPlaytestServer({consistencyEnabled:false});t.after(()=>server.close());const row=await campaign(server);
 const proof=await server.api('history/coverage',{campaignId:row.campaignId,expectedSequence:row.view.reference.sequence});
 assert.ok(proof.anchors['history-0'].factIds.length);assert.ok(proof.anchors['history-0'].eventIds.includes('old-bread'));assert.equal(proof.anchors['history-0'].indexed,true);
 const original=JSON.stringify(row.chat),groups=await grouped(row.chat),window=planHistoryWindow(groups,{coverage:proof,contextTokens:5000,reservedTokens:200});
 assert.equal(window.reason,'batch-trimmed');assert.equal(window.removed.length,8);assert.equal(JSON.stringify(row.chat),original);
 const search=await server.api('search',{campaignId:row.campaignId,query:'蓝色风筝'});assert.ok(search.results.some(hit=>hit.source==='原始对话'&&hit.text.includes('蓝色风筝')));
 const copied=planHistoryWindow(await grouped(structuredClone(row.chat)),{coverage:proof,cursor:JSON.parse(JSON.stringify(window.cursor)),contextTokens:5000,reservedTokens:200});assert.equal(copied.reset,false);assert.equal(copied.batch,null);
 const updated=await server.api('reconcile',{campaignId:row.campaignId,validAnchors:row.chat.filter(m=>m.is_user).map(m=>m.extra.fields_anchor),excludeAnchor:'history-0'});
 row.chat[0]={...row.chat[0],mes:'我没有买面包，只提到红色风筝。'};await server.api('edit-index',{campaignId:row.campaignId,index:0,message:row.chat[0]});
 const next=await server.api('history/coverage',{campaignId:row.campaignId,expectedSequence:updated.reference.sequence});assert.equal(next.anchors['history-0'].processed,false);
 const reset=planHistoryWindow(await grouped(row.chat),{coverage:next,cursor:window.cursor,contextTokens:5000,reservedTokens:200});assert.equal(reset.reset,true);assert.equal(reset.removed.length,0);assert.equal(reset.needsCoverage,true);
 const old=await server.api('search',{campaignId:row.campaignId,query:'蓝色风筝'});assert.equal(old.results.some(hit=>hit.text.includes('蓝色风筝')),false);
 await assert.rejects(server.api('history/coverage',{campaignId:row.campaignId,expectedSequence:proof.reference.sequence}),/变化/);
});

test('试玩复用同一窗口，跨批次保留稳定历史开头且完整聊天仍可搜索',async t=>{
 const server=await createPlaytestServer({consistencyEnabled:false});t.after(()=>server.close());const starts=[];
 const client={async generate({messages}){starts.push(messages.find(m=>m.role==='user'&&m.content?.startsWith('（场外）'))?.content);return {choices:[{finish_reason:'stop',message:{content:'已核对。'}}]};}};
 const scenario={id:'history-window-runner',turns:Array.from({length:24},(_,i)=>({input:`（场外）第${i+1}次核对，记着蓝色风筝`,assertions:[{kind:'unchanged',paths:['state.player.coins']}]}))};
 const report=await runPlaytest({scenario,api:server.api,client,bundle:await loadPromptBundle(),countTokens:()=>100,historyWindow:{contextTokens:5000}});
 assert.equal(report.pass,true,JSON.stringify(report.turns.filter(t=>t.errors.length)));const trimmed=report.turns.filter(t=>t.historyWindow?.batch);assert.ok(trimmed.length>=1);assert.ok(trimmed.length<5);
 const first=report.turns.findIndex(t=>t.historyWindow?.batch);assert.equal(starts[first],starts[first+1]);assert.equal(starts[first],starts[first+2]);assert.notEqual(starts[0],starts[first]);
});

test('原生生成拦截器只裁当前请求副本，不隐藏原文或修改聊天锚点',{timeout:60000},async t=>{
 const server=await createPlaytestServer({consistencyEnabled:false});t.after(()=>server.close());const row=await campaign(server),browser=await chromium.launch({executablePath:browserExecutablePath(),headless:true});t.after(()=>browser.close());const page=await browser.newPage();
 await page.route(/\.(?:mjs|js|css)(?:\?.*)?$/,async route=>{
  const relative=decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
  let body=await fs.readFile(`extension/${relative}`,'utf8');
  if(relative==='runtime.js')body=body.replace("import { getContext } from '../../../extensions.js';",'const getContext=()=>window.fixtureContext;');
  await route.fulfill({contentType:relative.endsWith('.css')?'text/css':'text/javascript',body});
 });
 await page.route('**/assets/**',async route=>{
  const relative=new URL(route.request().url()).pathname.split('/assets/')[1];
  await route.fulfill({body:await fs.readFile(`assets/${relative}`)});
 });
 await page.route('**/api/plugins/infinite-fields/**',async route=>{
  const endpoint=new URL(route.request().url()).pathname.split('/infinite-fields/')[1];try{await route.fulfill({json:await server.api(endpoint,JSON.parse(route.request().postData()))});}catch(error){await route.fulfill({status:400,json:{ok:false,error:error.message}});}
 });
 await page.route('**/fixture.html',route=>route.fulfill({contentType:'text/html',body:'<div id="sheld"></div>'}));await page.goto('http://localhost/fixture.html');
 await page.evaluate(({chat,reference})=>{
  chat.push({is_user:true,mes:'（场外）接着核对',extra:{fields_anchor:'history-current'}});
  window.fixtureContext={characters:[{name:'无限原野·世界主持人'}],characterId:0,chatId:'history-fixture',chatMetadata:{infinite_fields:reference},chat,getRequestHeaders:()=>({'Content-Type':'application/json'}),saveChat:async()=>{},setExtensionPrompt:()=>{},registerFunctionTool:()=>{},stopGeneration:()=>{},getTokenCountAsync:async()=>100,eventTypes:new Proxy({},{get:(_,key)=>key}),eventSource:{on:()=>{}}};
 },{chat:row.chat,reference:row.view.reference});
 const result=await page.evaluate(async()=>{
  await import('/runtime.js');await window.infiniteFieldsV2.refresh();const original=JSON.stringify(window.fixtureContext.chat),core=structuredClone(window.fixtureContext.chat);let aborted=false;
  await window.infiniteFieldsHistoryInterceptor(core,6000,()=>{aborted=true;},'normal');
  return {aborted,originalUnchanged:original===JSON.stringify(window.fixtureContext.chat),length:core.length,oldLength:window.fixtureContext.chat.length,usage:window.fixtureContext.chatMetadata.fields_history_usage,cursor:window.fixtureContext.chatMetadata.fields_history_window};
 });
 assert.equal(result.aborted,false,JSON.stringify(result));assert.equal(result.originalUnchanged,true);assert.ok(result.length<result.oldLength);assert.equal(result.usage.reason,'batch-trimmed');assert.ok(result.cursor.removed.length);
 const manifest=JSON.parse(await fs.readFile('extension/manifest.json','utf8'));assert.equal(manifest.generate_interceptor,'infiniteFieldsHistoryInterceptor');
});
