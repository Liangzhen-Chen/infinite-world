import{browserExecutablePath}from'./helpers/browser-path.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createPlaytestServer} from '../tools/playtest-runner.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {affairs} from '../server-plugin/ui-affairs.mjs';
import {renderAffairsPanel} from '../extension/affairs-panels.mjs';

class Element{
 constructor(tag,doc){this.tag=tag;this.ownerDocument=doc;this.children=[];this.dataset={};this.isConnected=true;this.text='';this.classList={add:()=>{}};}
 append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;this.text='';}
 set textContent(value){this.text=String(value);this.children=[];}get textContent(){return this.text+this.children.map(n=>n.textContent).join(' ');}
 setAttribute(key,value){this[key]=value;}
}
const nodes=root=>[root,...root.children.flatMap(nodes)];

test('事务面板真实发单、拒绝越额、取消退款，显示同一引擎额度与回执',async()=>{
 const engine=new WorldEngine(await loadWorld()),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
 let document=engine.createCharacter(seed,{},'s408-ui'),serial=0;
 const doc={createElement:tag=>new Element(tag,doc),createDocumentFragment:()=>new Element('fragment',doc)},root=new Element('div',doc),calls=[];
 const context={api:async endpoint=>{assert.equal(endpoint,'ui/affairs');return affairs(engine,document);},act:async(action,slots)=>{
  calls.push({action,slots});const out=await engine.reduce(document,{tool:'world_act',args:{action,slots},eventId:`ui-${++serial}`});
  document=applyPatches(document,out.patches);return {ok:out.result.ok!==false,result:out.result};
 }};
 const field=label=>{const found=nodes(root).find(n=>n['aria-label']===label);assert.ok(found,label);return found;};
 const submit=async()=>nodes(root).find(n=>n.tag==='form').onsubmit({preventDefault(){}});
 renderAffairsPanel(root,affairs(engine,document),'tasks',context);
 assert.match(root.textContent,/0个D级单位/);assert.match(root.textContent,/元年/);
 const before=structuredClone(document),coins=document.state.player.coins;
 field('委托内容').value='从河谷走到村口';field('目的地').value=engine.byId.get('loc_hw_gate').name;
 field('发单身份').value='false';await submit();
 assert.match(root.textContent,/额度不足/);assert.deepEqual(document,before);
 field('发单身份').value='true';await submit();
 assert.equal(document.state.player.coins,coins-20);assert.equal(calls.at(-1).action,'core:quest.publish');
 assert.match(root.textContent,/从河谷走到村口/);assert.match(root.textContent,/托管 20铜/);
 assert.equal(affairs(engine,document).quota.usedD,0);
 await nodes(root).find(n=>n.tag==='button'&&n.textContent==='取消委托').onclick();
 assert.equal(document.state.player.coins,coins);assert.equal(calls.at(-1).action,'core:quest.cancel');
 field('履约状态').value='closed';field('履约状态').onchange();
 assert.match(root.textContent,/已退款 20铜/);assert.match(root.textContent,/当事人取消/);assert.match(root.textContent,/托管 0铜/);
 assert.equal(nodes(root).some(n=>n.tag==='button'&&n.textContent==='取消委托'),false);
});

test('S4 无模型任职委托界面：真实新战役经表单发单与退款，桌面与390宽度',{timeout:120000},async t=>{
 const server=await createPlaytestServer({consistencyEnabled:false});t.after(()=>server.close());
 const browser=await chromium.launch({executablePath:browserExecutablePath(),headless:true});t.after(()=>browser.close());
 for(const viewport of [{width:390,height:844},{width:1280,height:900}]){
  const created=await server.api('create',{}),campaignId=created.reference.campaignId,page=await browser.newPage({viewport}),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route(/\.(?:mjs|js|css)(?:\?.*)?$/,async route=>{
   const relative=decodeURIComponent(new URL(route.request().url()).pathname).slice(1);let body=await fs.readFile(`extension/${relative}`,'utf8');
   if(relative==='runtime.js')body=body.replace("import { getContext } from '../../../extensions.js';",'const getContext=()=>window.fixtureContext;');
   await route.fulfill({contentType:relative.endsWith('.css')?'text/css':'text/javascript',body});
  });
  await page.route('**/assets/**',async route=>{const relative=new URL(route.request().url()).pathname.split('/assets/')[1];await route.fulfill({body:await fs.readFile(`assets/${relative}`)});});
  await page.route('**/api/plugins/infinite-fields/**',async route=>{
   const endpoint=new URL(route.request().url()).pathname.split('/infinite-fields/')[1],body=JSON.parse(route.request().postData());requests.push(endpoint);
   try{await route.fulfill({json:await server.api(endpoint,body)});}catch(error){await route.fulfill({status:400,json:{ok:false,error:error.message}});}
  });
  await page.route('**/fixture.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/style.css"><div id="sheld"></div><div id="chat"></div>'}));
  await page.goto('http://localhost/fixture.html');
  await page.evaluate(reference=>{
   window.fixtureContext={characters:[{name:'无限原野·世界主持人'}],characterId:0,chatId:'s4-office',chatMetadata:{infinite_fields:reference},chat:[{mes:'旅人在村里核对委托。',name:'主持人'}],getRequestHeaders:()=>({'Content-Type':'application/json'}),saveChat:async()=>{},setExtensionPrompt:()=>{},registerFunctionTool:()=>{},stopGeneration:()=>{},eventTypes:new Proxy({},{get:(_,key)=>key}),eventSource:{on:()=>{}}};
  },created.reference);
  await page.evaluate(async()=>{await import('/runtime.js');await window.infiniteFieldsV2.refresh();});
  if(await page.locator('.fields-menu-toggle').isVisible())await page.locator('.fields-menu-toggle').click();
  await page.locator('#fields-toolbar [data-panel="tasks"]').click();
  const dialog=page.locator('#fields-dialog');await dialog.getByText('发布委托',{exact:true}).waitFor();
  assert.match(await dialog.innerText(),/0个D级单位/);
  const before=(await server.api('read',{campaignId})).document;
  await dialog.getByLabel('委托内容',{exact:true}).fill('到河湾村口看看');
  await dialog.getByLabel('目的地',{exact:true}).fill('loc_hw_gate');
  await dialog.getByRole('button',{name:'发布并托管报酬',exact:true}).click();
  await dialog.getByRole('heading',{name:'到河湾村口看看',exact:true}).waitFor();
  assert.match(await dialog.innerText(),/托管\s+20铜/);
  const posted=(await server.api('read',{campaignId})).document;assert.equal(posted.state.player.coins,before.state.player.coins-20);
  await dialog.getByRole('button',{name:'取消委托',exact:true}).click();
  await page.waitForFunction(()=>!Array.from(document.querySelectorAll('#fields-dialog button')).some(e=>e.textContent==='取消委托'));
  await dialog.getByLabel('履约状态',{exact:true}).selectOption('closed');
  await dialog.getByText('20铜',{exact:true}).first().waitFor();assert.match(await dialog.innerText(),/已退款\s+20铜/);
  const ended=(await server.api('read',{campaignId})).document;assert.equal(ended.state.player.coins,before.state.player.coins);
  assert.equal(Object.values(ended.state.quests).filter(q=>q.publisher==='player'&&q.status==='取消').length,1);
  const layout=await dialog.evaluate(e=>({scroll:e.scrollWidth,client:e.clientWidth}));assert.ok(layout.scroll<=layout.client+1);assert.deepEqual(errors,[]);
  assert.equal(requests.some(endpoint=>/generate|model/.test(endpoint)),false);await page.close();
 }
});
