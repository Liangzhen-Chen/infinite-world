import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {once} from 'node:events';
import express from 'express';
import {chromium} from 'playwright-core';
import {init} from '../server-plugin/index.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {personal,registerUIRoutes} from '../server-plugin/ui-personal.mjs';
import {xpRequired} from '../server-plugin/progression.mjs';
import {registerPersonalPanels,renderPersonalPanel} from '../extension/personal-panels.mjs';

const engine=new WorldEngine(await loadWorld());
const legacy=JSON.parse(await fs.readFile('server-plugin/legacy/seed.json','utf8'));
const initial=()=>engine.initialFromLegacy(legacy,'m6-03');
async function fixture(t){
    const root=await fs.mkdtemp(path.join(tmpRoot(),'fields-m6-03-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const app=express();app.use(express.json());const router=express.Router();
    await init(router,{baseRoot:root,npcPlanningEnabled:false,consistencyEnabled:false});app.use('/api/plugins/infinite-fields',router);
    const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
    const origin=`http://127.0.0.1:${server.address().port}`;
    const request=async(endpoint,body={})=>{const response=await fetch(`${origin}/api/plugins/infinite-fields/${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
    return {origin,request};
}

test('M6-03 /ui/personal 只读且战役隔离，模块自动发现；交易回滚刷新负重',async t=>{
    const {request}=await fixture(t),created=await request('create',{name:'个人面板旅人'}),campaignId=created.body.reference.campaignId;
    const before=await request('export',{campaignId}),first=await request('ui/personal',{campaignId});
    assert.equal(first.status,200);assert.deepEqual(first.body.reference,created.body.reference);
    assert.deepEqual(await request('export',{campaignId}),before);
    assert.equal(first.body.player.nextLevelXp,xpRequired(first.body.player.level+1));
    assert.equal(first.body.spells[0].source.name,'旧档已学内容');
    assert.equal((await request('ui/personal',{campaignId:'../escape'})).status,400);
    assert.equal((await request('ui/personal',{campaignId:'missing'})).status,404);
    assert.ok((await request('ui/modules')).body.modules.includes('ui-personal.mjs'));
    const bought=await request('execute',{campaignId,tool:'world_trade',args:{seller:'林穗',item:'面包',quantity:1},eventId:'personal-bread',anchor:'bread'});
    assert.equal(bought.status,200,bought.body.error);
    const second=await request('ui/personal',{campaignId});assert.ok(second.body.load.knownKg>first.body.load.knownKg);
    assert.equal((await request('reconcile',{campaignId,validAnchors:[]})).status,200);
    const restored=(await request('ui/personal',{campaignId})).body;
    const {reference:firstReference,...firstData}=first.body,{reference:restoredReference,...restoredData}=restored;
    assert.deepEqual(restoredData,firstData);assert.ok(restoredReference.sequence>firstReference.sequence);
    assert.deepEqual(restoredReference,(await request('read',{campaignId})).body.reference);
});

test('M6-03 阈值、职业认证及有效熟练度复用当前成长规则，不泄漏未学内容',()=>{
    const document=initial(),s=document.state;
    s.player.level=9;s.player.xp=800;s.player.attributes.幸运=99;
    s.skills.skill_light.proficiency=299;s.skills.skill_light.source={type:'teacher',id:'npc_hw_xuling'};
    s.skills.skill_literacy={proficiency:599,breakthroughs:[2],source:{type:'book',id:'item_staff',author:'抄写者',edition:'一版'}};
    s.npcs.npc_hw_xuling.memoryStream=[{content:'不应泄露的私密经历'}];
    const before=structuredClone(document),view=personal(engine,document);
    assert.deepEqual(document,before);assert.equal(view.player.nextLevelXp,xpRequired(10));
    assert.equal(view.skills[0].needsBreakthrough,true);assert.match(view.skills[0].breakthroughHint,/未认证/);
    assert.equal(view.skills[0].stageEnd,299);assert.equal(view.skills[1].needsBreakthrough,false);
    assert.equal(view.skills[1].source.author,'抄写者');assert.equal(view.skills[0].source.name,'许苓');
    assert.equal(view.player.attributes.幸运,undefined);assert.equal(view.spells.length,1);
    assert.equal(view.npcs,undefined);assert.doesNotMatch(JSON.stringify(view),/不应泄露的私密经历|memoryStream|teachers/);
    s.professions.combat='profession_mage';s.careers={profession_mage:{certification:{teacher:'npc_hw_xuling',minute:600},promotions:[]}};
    s.skills.skill_light.proficiency=600;
    const certified=personal(engine,document);assert.equal(certified.skills[0].effectiveProficiency,600);
    assert.equal(certified.professions[0].certification.teacher,'许苓');assert.equal(certified.professions[0].nextPromotion,30);
    s.professions.combat='';assert.equal(personal(engine,document).skills[0].effectiveProficiency,299);
    s.player.level=engine.rules.levels.maximum;assert.equal(personal(engine,document).player.nextLevelXp,null);
    s.skills.skill_literacy.proficiency=2699;const maximum=personal(engine,document).skills[1];
    assert.equal(maximum.needsBreakthrough,false);assert.equal(maximum.stageEnd,2699);assert.match(maximum.breakthroughHint,/上限/);
});

test('M6-03 持有单件做工与制作者保留，重量按库存计算且不重复算实例',()=>{
    const document=initial(),s=document.state;
    s.inventory={item_staff:{quantity:3,instances:['mine','foreign','sold'],weight:999},item_ration:2};
    s.itemInstances={mine:{id:'mine',item:'item_staff',owner:'player',status:'持有',maker:'player',workmanship:'精良',quality:'铁',durability:75,maxDurability:120},
        foreign:{id:'foreign',item:'item_staff',owner:'npc_hw_xuling',status:'持有',makerName:'隐秘制作者'},
        sold:{id:'sold',item:'item_staff',owner:'player',status:'售出',makerName:'不再持有'}};
    const view=personal(engine,document),staff=view.inventory[0];
    assert.equal(staff.instances.length,1);assert.equal(staff.instances[0].workmanship,'精良');
    assert.equal(staff.instances[0].maker,s.player.name);assert.equal(staff.instances[0].quality,'铁');assert.ok(staff.instances[0].color);
    assert.equal(staff.untrackedQuantity,2);assert.equal(staff.maker,null);assert.equal(staff.workmanship,null);
    assert.equal(staff.totalWeight,3*engine.byId.get('item_staff').weight);
    assert.equal(view.load.knownKg,3.4);assert.doesNotMatch(JSON.stringify(view),/隐秘制作者|不再持有/);
    s.inventory.unknown_item={quantity:1};const unknown=personal(engine,document);assert.equal(unknown.load.unknownStacks,1);
    assert.equal(unknown.inventory.at(-1).weight,null);
});

test('M6-03 旧档空字段不造认证、来源、制作者；登记路由返回所选存档世界',async()=>{
    const document=initial(),s=document.state;s.professions=null;s.careers=null;s.itemInstances=null;s.skills={skill_light:null};s.spells={spell_light:null};
    s.player.attributes=null;s.player.freeAttributePoints=null;s.inventory={item_staff:1};
    const before=structuredClone(document),view=personal(engine,document);assert.deepEqual(document,before);
    assert.deepEqual(view.professions,[]);assert.equal(view.skills[0].source.name,'来源未记录');assert.equal(view.inventory[0].maker,null);
    assert.equal(view.player.freeAttributePoints,0);assert.ok(Object.values(view.player.attributes).every(value=>value===null));
    const routes=new Map(),scoped=Object.create(engine);scoped.byId=new Map(engine.byId);scoped.byId.set('item_staff',{...engine.byId.get('item_staff'),name:'存档世界木杖'});
    registerUIRoutes({post:(url,fn)=>routes.set(url,fn),readCampaign:async req=>{assert.equal(req.body.campaignId,'saved');return {engine:scoped,document,reference:{campaignId:'saved'}};}});
    const result=await routes.get('/ui/personal')({body:{campaignId:'saved'}});assert.equal(result.inventory[0].name,'存档世界木杖');
    s.inventory=null;s.skills=null;s.spells=null;const empty=personal(engine,document);
    assert.deepEqual([empty.inventory,empty.skills,empty.spells],[[],[],[]]);assert.equal(empty.load.knownKg,0);
});

// A small DOM surface exercises text-only rendering and refresh races without a browser.
class Element{
    constructor(tag,doc){this.tag=tag;this.ownerDocument=doc;this.children=[];this.dataset={};this.classList={add:()=>{}};this.isConnected=true;this.text='';}
    append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;this.text='';}
    set textContent(text){this.text=String(text);this.children=[];}get textContent(){return this.text+this.children.map(child=>child.textContent).join(' ');}
    setAttribute(key,value){this[key]=value;}
}
const dom=()=>{const doc={createElement:tag=>new Element(tag,doc),createDocumentFragment:()=>new Element('fragment',doc)};return new Element('div',doc);};
test('M6-03 四面板文字呈现与空态，回滚较新请求胜出且失败可读',async()=>{
    const document=initial(),data=personal(engine,document),container=dom();
    for(const kind of ['character','skills','spells','inventory']){renderPersonalPanel(container,data,kind);assert.doesNotMatch(container.textContent,/undefined|NaN/);}
    const empty=personal(engine,{state:{player:{},professions:null}});
    for(const [kind,text]of [['character','尚无已认证职业'],['skills','尚无已学技能'],['spells','尚无已学法术'],['inventory','行囊为空']]){renderPersonalPanel(container,empty,kind);assert.match(container.textContent,new RegExp(text));}
    const panels=new Map();registerPersonalPanels({registerPanel:panel=>panels.set(panel.id,panel)});assert.equal(panels.size,4);
    const requests=[];const context={api:endpoint=>{assert.equal(endpoint,'ui/personal');return new Promise(resolve=>requests.push(resolve));}};
    const old=panels.get('inventory').render(container,context),newer=panels.get('inventory').render(container,context);
    requests[1](empty);await newer;requests[0](data);await old;assert.match(container.textContent,/行囊为空/);
    await panels.get('inventory').render(container,{api:async()=>{throw Error('internal JSON');}});assert.match(container.textContent,/个人信息读取失败/);assert.doesNotMatch(container.textContent,/JSON/);
});

test('M6-03 浏览器：四面板双主题桌面与手机截图，空值及回滚自动刷新',{timeout:60000},async t=>{
    const {origin,request}=await fixture(t),created=await request('create',{name:'个人面板旅人'}),campaignId=created.body.reference.campaignId;
    const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});t.after(()=>browser.close());
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/fixture.html',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>个人面板测试</title></head><body><div id="sheld"><div id="chat"><div class="mes_text"><p>雨后，旅人清点随身物品。</p></div></div><div id="form_sheld"><form id="send_form"><textarea id="send_textarea"></textarea></form></div></div></body></html>'}));
    await page.route(/\.(?:mjs|js|css)(?:\?.*)?$/,async route=>{
        const relative=decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
        let body=await fs.readFile(path.join('extension',relative),'utf8');
        if(relative==='runtime.js')body=body.replace("import { getContext } from '../../../extensions.js';","const getContext=()=>window.fixtureContext;");
        await route.fulfill({contentType:`${relative.endsWith('.css')?'text/css':'text/javascript'}; charset=utf-8`,body});
    });
    await page.route('**/assets/fonts/**',async route=>route.fulfill({body:await fs.readFile(`assets/fonts/${new URL(route.request().url()).pathname.split('/').at(-1)}`)}));
    await page.goto(`${origin}/fixture.html`);await page.addStyleTag({content:await fs.readFile('extension/style.css','utf8')});
    await page.evaluate(reference=>{window.fixtureContext={characters:[{name:'无限原野·世界主持人'}],characterId:0,chatId:'m6-03',chatMetadata:{infinite_fields:reference},chat:[],getRequestHeaders:()=>({'Content-Type':'application/json'}),saveChat:async()=>{},setExtensionPrompt:()=>{},registerFunctionTool:()=>{},stopGeneration:()=>{},eventTypes:{},eventSource:{on:()=>{}}};},created.body.reference);
    await page.evaluate(async()=>{await import('/runtime.js');await window.infiniteFieldsV2.refresh();await document.fonts.ready;});
    assert.equal(await page.evaluate(()=>document.characterSet),'UTF-8');
    const report='docs/测试报告/最新/M6-03';await fs.mkdir(report,{recursive:true});
    for(const theme of ['dark','light']){
        await page.evaluate(async theme=>{const {updateSettings}=await import('/ui-settings.mjs');updateSettings({theme});},theme);
        for(const [size,viewport]of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]){
            await page.setViewportSize(viewport);
            for(const [id,title,expected]of [['character','角色','经验'],['skills','技能','阶段 0–299'],['spells','法术书','旧档已学内容'],['inventory','行囊','总负重']]){
                await page.evaluate(async id=>{const {openPanel}=await import('/ui-shell.mjs');openPanel(id);},id);
                await page.getByText(expected,{exact:false}).first().waitFor();
                assert.equal(await page.locator('#fields-panel-title').innerText(),title);
                assert.doesNotMatch(await page.locator('#fields-panel-content').innerText(),/undefined|NaN/);
                assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
                const layout=await page.locator('#fields-dialog').evaluate(element=>({width:element.clientWidth,overflow:element.scrollWidth>element.clientWidth}));assert.equal(layout.overflow,false);
                if(size==='mobile')assert.equal(layout.width,390);
                await page.screenshot({path:`${report}/${theme}-${size}-${id}.png`});await page.getByRole('button',{name:'关闭',exact:true}).click();
            }
        }
    }
    await page.evaluate(async()=>{const {openPanel}=await import('/ui-shell.mjs');openPanel('inventory');});
    await page.getByText('总负重',{exact:false}).waitFor();const before=await page.locator('#fields-panel-content').innerText();
    const bought=await request('execute',{campaignId,tool:'world_trade',args:{seller:'林穗',item:'面包',quantity:1},eventId:'browser-bread',anchor:'bread'});assert.equal(bought.status,200,bought.body.error);
    await page.evaluate(async()=>{window.fixtureContext.chat=[{is_user:true,mes:'买面包',extra:{fields_anchor:'bread'}}];await window.infiniteFieldsV2.refresh();});
    await page.waitForFunction(text=>document.querySelector('#fields-panel-content').textContent.includes('总负重')&&document.querySelector('#fields-panel-content').innerText!==text,before);
    assert.equal((await request('reconcile',{campaignId,validAnchors:[]})).status,200);
    await page.evaluate(async()=>{window.fixtureContext.chat=[];await window.infiniteFieldsV2.refresh();});
    await page.waitForFunction(text=>document.querySelector('#fields-panel-content').innerText===text,before);
    const empty=personal(engine,{state:{player:{},inventory:null,skills:null,spells:null,professions:null}});
    await page.route('**/api/plugins/infinite-fields/ui/personal',route=>route.fulfill({json:empty}));
    for(const [id,text]of [['character','尚无已认证职业'],['skills','尚无已学技能'],['spells','尚无已学法术'],['inventory','行囊为空']]){
        await page.evaluate(async id=>{const {openPanel}=await import('/ui-shell.mjs');openPanel(id);},id);await page.getByText(text,{exact:false}).waitFor();assert.doesNotMatch(await page.locator('#fields-panel-content').innerText(),/undefined|NaN/);
    }
    assert.deepEqual(errors,[]);
});
