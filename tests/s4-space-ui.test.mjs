import{browserExecutablePath}from'./helpers/browser-path.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createPlaytestServer} from '../tools/playtest-runner.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {worldActions} from '../server-plugin/action-affordances.mjs';
import {renderActionsPanel} from '../extension/actions-view.mjs';

test('S4 无模型空间菜单：真实等待裁剪人物，分区按钮移动并保留锁门边界', {timeout:120000},async t=>{
 const server=await createPlaytestServer({consistencyEnabled:false});t.after(()=>server.close());
 const browser=await chromium.launch({executablePath:browserExecutablePath(),headless:true});t.after(()=>browser.close());
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
  const minute=await page.evaluate(()=>window.infiniteFieldsV2.view.document.state.minute),wait=(1290-minute%1440+1440)%1440;
  // 林穗 21:00 前在前厅接待（营业中的屋子夜里有灯可见）；等到她锁门睡下后菜单才裁掉她。
  await dialog.locator('.fields-actions-quick').getByRole('button',{name:'等待',exact:true}).click();
  const form=dialog.locator('form.fields-actions-form');await form.waitFor();
  await form.locator('#fields-slot-minutes').fill(String(wait));await form.locator('button[type="submit"]').click();
  await page.waitForFunction(m=>window.infiniteFieldsV2.view.document.state.minute===m,minute+wait);
  await page.waitForFunction(()=>!document.querySelector('.fields-actions-scene')?.textContent.includes('林穗'));
  assert.equal(await dialog.getByRole('button',{name:/^林穗/}).count(),0);
  const travelled=await page.evaluate(()=>window.infiniteFieldsV2.act('core:move',{destination:'bld_bs_reed_dao',mode:'walk'}));
  assert.equal(travelled.ok,true,travelled.error);
  await page.waitForFunction(()=>window.infiniteFieldsV2.view.document.state.location==='bld_bs_reed_dao');
  await dialog.locator('.fields-actions-scene').filter({hasText:'芦衡观'}).waitFor();
  // actions-view retains the selected quick view across refreshes. The wait
  // view has no exit buttons; use the real movement navigation before choosing.
  await dialog.locator('.fields-actions-quick').getByRole('button',{name:'移动',exact:true}).click();
  await dialog.getByRole('button',{name:/观门侧廊/}).first().click();
  await form.waitFor();await form.locator('button[type="submit"]').click();
  await page.waitForFunction(()=>window.infiniteFieldsV2.view.document.state.records.local_player_position?.zone==='zone_reed_side');
  // runtime updates view before its asynchronous panel render has completed.
  await page.waitForFunction(()=>document.querySelector('.fields-actions-scene')?.textContent.includes('所在分区】观门侧廊'));
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

// Same small text DOM approach as m6-03: exercise the production renderer and
// its retained quick-view state without launching a browser or seeding outcomes.
class Element{
 constructor(tag,doc){this.tag=tag;this.ownerDocument=doc;this.children=[];this.isConnected=true;this.text='';this.classList={add:()=>{}};}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=nodes;this.text='';this.onRender?.();}
 set textContent(value){this.text=String(value);this.children=[];}
 get textContent(){return this.text+this.children.map(n=>n.textContent).join(' ');}
 setAttribute(key,value){this[key]=value;}
}
const nodes=root=>[root,...root.children.flatMap(nodes)];

test('offline S402B 等待视图经真实跨地移动刷新后，切换移动才展示并执行分区按钮',{timeout:15000},async t=>{
 const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
 const engine=new WorldEngine(world);let document=engine.initialFromLegacy(seed,'s402b-ui'),serial=0;
 const doc={createElement:tag=>new Element(tag,doc),createDocumentFragment:()=>new Element('fragment',doc)},root=new Element('div',doc);
 const previousOption=globalThis.Option;
 globalThis.Option=class extends Element{constructor(text,value){super('option',doc);this.textContent=text;this.value=value;}};
 t.after(()=>{if(previousOption===undefined)delete globalThis.Option;else globalThis.Option=previousOption;});
 const data={view:{document},api:async endpoint=>{assert.equal(endpoint,'actions');return worldActions(engine.scoped(document),document);},act:async(action,slots)=>{
  const out=await engine.reduce(document,{tool:'world_act',args:{action,slots},eventId:`s402b-${++serial}`});
  assert.notEqual(out.result.receipt?.status,'rejected',JSON.stringify(out.result));
  document=applyPatches(document,out.patches);data.view={document};return {ok:true,result:out.result,lines:[]};
 }};
 const button=name=>{const found=nodes(root).find(n=>n.tag==='button'&&(typeof name==='string'?n.textContent===name:name.test(n.textContent)));assert.ok(found,String(name));return found;};
 const rendered=operation=>new Promise((resolve,reject)=>{root.onRender=()=>{root.onRender=null;resolve();};try{operation();}catch(error){root.onRender=null;reject(error);}});
 await renderActionsPanel(root,data);
 await rendered(()=>button('等待').onclick());
 const wait=(1200-document.state.minute%1440+1440)%1440;
 const waitInput=nodes(root).find(n=>n.id==='fields-slot-minutes');assert.ok(waitInput);waitInput.value=String(wait);
 await rendered(()=>nodes(root).find(n=>n.tag==='form').onsubmit({preventDefault(){}}));
 await data.act('core:move',{destination:'bld_bs_reed_dao',mode:'walk'});
 await renderActionsPanel(root,data);
 const menu=await data.api('actions'),side=menu.objects.exits.find(e=>e.id==='zone_reed_side');
 assert.equal(menu.location.id,'bld_bs_reed_dao');assert.equal(side.name,'观门侧廊');
 // The menu may defer permission to settlement; the renderer disables only an
 // explicit denial. Executing the button below proves this path actually works.
 assert.notEqual(side.permission?.allowed,false);
 assert.ok(root.textContent.includes('芦衡观'),'移动后的场景确已刷新');
 assert.equal(button('等待')['aria-pressed'],'true');
 assert.ok(!nodes(root).some(n=>n.tag==='button'&&n.textContent.includes('观门侧廊')),'等待快捷视图不会显示出路按钮');
 await rendered(()=>button('移动').onclick());
 assert.equal(button('移动')['aria-pressed'],'true');
 assert.equal(button(/经阁（/).disabled,true,'真实锁门仍使经阁入口不可用');
 await rendered(()=>button(/观门侧廊/).onclick());
 const destination=nodes(root).find(n=>n.id==='fields-slot-destination');assert.equal(destination.value,'zone_reed_side');
 const before=structuredClone(document);
 await rendered(()=>nodes(root).find(n=>n.tag==='form').onsubmit({preventDefault(){}}));
 assert.equal(document.state.records.local_player_position.zone,'zone_reed_side');
 assert.ok(document.state.minute>before.state.minute);assert.equal(document.state.player.coins,before.state.player.coins);
 assert.ok(root.textContent.includes('所在分区】观门侧廊'));
 assert.equal((await data.api('actions')).objects.exits.find(e=>e.id==='zone_reed_library').permission.allowed,false);
});
