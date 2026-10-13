import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import express from 'express';
import {chromium} from 'playwright-core';
import {init} from '../server-plugin/index.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {history,registerUIRoutes} from '../server-plugin/ui-history.mjs';
import {buildChronicle} from '../server-plugin/chronicle.mjs';
import {registerHistoryPanels,renderHistoryPanel} from '../extension/people-history.mjs';

const engine=new WorldEngine(await loadWorld());
const legacy=JSON.parse(await fs.readFile('server-plugin/legacy/seed.json','utf8'));
const initial=()=>engine.createCharacter(legacy,{},'m6-04');
const fact=(id,overrides={})=>({id,sourceEvent:`event-${id}`,sequence:1,minute:500,location:'bld_hw_qingdeng',participants:['player','npc_hw_linsui'],entities:['player','npc_hw_linsui'],visibleTo:['player'],kind:'trade',salience:3,text:'旅人向林穗买了面包。',...overrides});
const chronicle=facts=>buildChronicle(facts,{now:900,viewer:'omniscient'});
async function fixture(t,{rumor=null}={}){
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'fields-m6-04-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const app=express();app.use(express.json());const router=express.Router();
    const world=structuredClone(engine.world);
    if(rumor)world.settlementProfiles.find(row=>row.details).details.rumors.push(rumor);
    await init(router,{world,baseRoot:root,npcPlanningEnabled:false,consistencyEnabled:false});app.use('/api/plugins/infinite-fields',router);
    const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
    const origin=`http://127.0.0.1:${server.address().port}`;
    const request=async(endpoint,body={})=>{const response=await fetch(`${origin}/api/plugins/infinite-fields/${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
    return {origin,request};
}

test('M6-04 先按知情过滤再分页，私密事件、未知人物与异地现状不可见',()=>{
    const document=initial(),s=document.state;s.minute=900;
    s.npcs.npc_hw_linsui.location='loc_bs';s.npcs.npc_hw_linsui.trust=12;
    s.npcs.npc_hw_ayan.memoryStream=[{sourceType:'目击',minute:800,location:'bld_hw_qingdeng',participants:['player','npc_hw_linsui'],content:'暗处未露面的旁观者'}];
    s.npcs.npc_hw_linsui.memoryStream=[{sourceType:'亲历',minute:700,location:'bld_hw_qingdeng',participants:['npc_hw_linsui'],content:'不应泄露的私密记忆'}];
    s.obligations={mine:{promisor:'npc_hw_linsui',promisee:'player',type:'等候',content:'今晚一同核账',status:'待履行',deadline:950},
        foreign:{promisor:'npc_hw_linsui',promisee:'npc_hw_ayan',content:'他人秘密承诺'}};
    const facts=[fact('hidden',{visibleTo:['npc_hw_ayan'],participants:['npc_hw_ayan'],text:'不应泄露的私密事件'}),fact('met'),fact('later',{minute:650,location:'loc_hw',text:'旅人与林穗在河湾说过话。'}),fact('future',{minute:1000,text:'未来不可见'})];
    const before=structuredClone(document),data=history(engine,document,chronicle(facts),{level:'facts',pageSize:1});
    assert.deepEqual(document,before);assert.equal(data.people.total,1);assert.equal(data.people.items[0].name,'林穗');
    assert.equal(data.people.items[0].location,'河湾村');assert.equal(data.people.items[0].relationship.trust,12);
    assert.match(data.people.items[0].description,/放心/);assert.match(data.people.items[0].promises[0].text,/今晚一同核账/);
    assert.equal(data.chronicle.total,2);assert.match(data.chronicle.items[0].text,/说过话/);
    const second=history(engine,document,chronicle(facts),{level:'facts',page:2,pageSize:1});assert.match(second.chronicle.items[0].text,/面包/);
    assert.doesNotMatch(JSON.stringify(data),/npc_hw_ayan|暗处未露面|私密|他人秘密|未来不可见|白石镇/);
    const scenes=history(engine,document,chronicle(facts));assert.equal(scenes.chronicle.total,2);assert.doesNotMatch(JSON.stringify(scenes),/私密事件/);
    assert.equal(history(engine,document,chronicle(facts),{query:'面包',level:'facts'}).chronicle.total,1);
    assert.equal(history(engine,document,chronicle(facts),{query:'不存在'}).people.total,0);
    document.memories={later:{subject:'npc_hw_linsui',source:'亲历',minute:850,content:'再次想起林穗。'}};
    assert.equal(history(engine,document,chronicle(facts)).people.items[0].locationTime,engine.calendar(650).text);
    const long=[fact('long',{text:'旅人记录了很长的一段路程。'.repeat(30),salience:5}),fact('detail',{text:'旅人曾买过松籽。',salience:1})];
    assert.doesNotMatch(chronicle(long).scenes[0].text,/松籽/);
    const found=history(engine,document,chronicle(long),{query:'松籽'});assert.equal(found.chronicle.total,1);assert.match(found.chronicle.items[0].text,/松籽/);
});

test('M6-04 传闻只取真实获知记录，保留讲述者与未核实状态，不读作者真相',()=>{
    const document=initial();document.state.minute=900;
    document.memories={heard:{subject:'player',rumor:'rumor-acquired',source:'npc_hw_linsui',sourceType:'听说',participants:['player','npc_hw_linsui'],minute:750,location:'bld_hw_qingdeng',content:'听林穗说山路有落石。',truth:'作者秘密真相'},
        foreign:{subject:'npc_hw_ayan',rumor:'rumor-foreign',source:'npc_hw_linsui',sourceType:'听说',participants:['npc_hw_ayan'],minute:700,content:'别人的传闻'},
        private:{subject:'player',private:true,content:'私密不属于展示资料'},future:{subject:'player',rumor:'future',sourceType:'听说',participants:['player'],minute:1000,content:'未来听说'}};
    const view=history(engine,document,chronicle([]));assert.equal(view.rumors.total,1);assert.equal(view.people.total,1);
    assert.equal(view.rumors.items[0].source,'林穗');assert.equal(view.rumors.items[0].reliability,'未核实');
    assert.equal(view.people.items[0].location,'青灯酒馆');assert.doesNotMatch(JSON.stringify(view),/作者秘密|别人的传闻|私密不属于|未来听说/);
    const empty=initial();assert.deepEqual(history(engine,empty,chronicle([])).people.items,[]);
});

test('M6-04 /ui/history 只读、自动发现、所选战役隔离与回滚恢复',async t=>{
    const {request}=await fixture(t),created=await request('create',{character:{name:'历史旅人'}}),campaignId=created.body.reference.campaignId;
    const baseline=await request('export',{campaignId}),empty=(await request('ui/history',{campaignId})).body;
    assert.equal(empty.people.total,0);assert.deepEqual(await request('export',{campaignId}),baseline);
    assert.ok((await request('ui/modules')).body.modules.includes('ui-history.mjs'));
    // Legacy starts in the tavern; its trade generates an actual encounter.
    const old=await request('create',{name:'旧档旅人'}),oldId=old.body.reference.campaignId;
    const bought=await request('execute',{campaignId:oldId,tool:'world_trade',args:{seller:'林穗',item:'面包',quantity:1},eventId:'history-bread',anchor:'bread'});assert.equal(bought.status,200,bought.body.error);
    const before=await request('export',{campaignId:oldId}),read=await request('ui/history',{campaignId:oldId,query:'面包',level:'facts'});
    assert.equal(read.status,200,read.body.error);assert.ok(read.body.chronicle.total>0);assert.ok(read.body.people.items.some(row=>row.name==='林穗'));
    assert.deepEqual(await request('export',{campaignId:oldId}),before);assert.equal((await request('ui/history',{campaignId})).body.chronicle.total,0);
    assert.equal((await request('ui/history',{campaignId:'../escape'})).status,400);assert.equal((await request('ui/history',{campaignId:'missing'})).status,404);
    const historyBefore=(await request('ui/history',{campaignId:oldId})).body;
    assert.equal((await request('reconcile',{campaignId:oldId,validAnchors:[]})).status,200);
    const restored=(await request('ui/history',{campaignId:oldId,level:'facts',query:'面包'})).body;
    assert.equal(restored.chronicle.total,0);assert.equal(restored.people.total,0);assert.ok(restored.reference.sequence>historyBefore.reference.sequence);
});

test('M6-04 路由使用存档世界，读取版本变化时不拼接两个版本',async()=>{
    const routes=new Map(),document=initial(),scoped=Object.create(engine);document.state.minute=900;
    scoped.byId=new Map(engine.byId);scoped.byId.set('npc_hw_linsui',{...engine.byId.get('npc_hw_linsui'),name:'存档林穗'});
    const reference={campaignId:'saved',sequence:2,head:'same'},past={...chronicle([fact('met')]),reference};
    registerUIRoutes({post:(url,fn)=>routes.set(url,fn),readCampaign:async()=>({engine:scoped,document,reference}),readChronicle:async()=>past});
    const route=routes.get('/ui/history');assert.equal((await route({body:{campaignId:'saved'}})).people.items[0].name,'存档林穗');
    past.reference={...reference,sequence:3};await assert.rejects(route({body:{}}),/存档已变化/);
});

class Element{
    constructor(tag,doc){this.tag=tag;this.ownerDocument=doc;this.children=[];this.classList={add:()=>{}};this.isConnected=true;this.text='';}
    append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;this.text='';}
    set textContent(text){this.text=String(text);this.children=[];}get textContent(){return this.text+this.children.map(child=>child.textContent).join(' ');}
    setAttribute(key,value){this[key]=value;}
}
const dom=()=>{const doc={createElement:tag=>new Element(tag,doc),createDocumentFragment:()=>new Element('fragment',doc)};return new Element('div',doc);};
const descendants=(root,tag)=>root.children.flatMap(child=>[...(child.tag===tag?[child]:[]),...descendants(child,tag)]);
const sample=()=>{const document=initial();document.state.minute=900;document.memories={heard:{subject:'player',rumor:'r',source:'npc_hw_linsui',sourceType:'听说',participants:['player','npc_hw_linsui'],minute:600,location:'loc_hw',content:'听说石桥旁有落石。'}};return {...history(engine,document,chronicle([fact('met')])),reference:{campaignId:'sample'}};};

test('M6-04 笔记与判断仅存聊天附加数据，失败保留草稿且聊天切换不可误存',async()=>{
    const container=dom(),data=sample(),ctx={chatId:'one',chatMetadata:{infinite_fields:{campaignId:'sample'}},saveChat:async()=>{}};
    renderHistoryPanel(container,data,'people',{chatContext:ctx});
    const field=descendants(container,'textarea')[0],save=descendants(container,'button').find(row=>row.text==='保存');field.value='<script>仅为人物笔记</script>';field.oninput();await save.onclick();
    assert.equal(ctx.chatMetadata.fields_people_history.notes.npc_hw_linsui,field.value);assert.match(container.textContent,/已保存/);
    renderHistoryPanel(container,data,'people',{chatContext:ctx});assert.equal(descendants(container,'textarea')[0].value,field.value);
    renderHistoryPanel(container,data,'rumors',{chatContext:ctx});const judgment=descendants(container,'select')[0];judgment.value='存疑';judgment.oninput();await descendants(container,'button').find(row=>row.text==='保存').onclick();
    assert.equal(ctx.chatMetadata.fields_people_history.judgments.heard,'存疑');
    renderHistoryPanel(container,data,'people',{chatContext:ctx});const draft=descendants(container,'textarea')[0];draft.value='失败仍在';draft.oninput();ctx.saveChat=async()=>{throw Error('disk');};await descendants(container,'button').find(row=>row.text==='保存').onclick();
    assert.match(container.textContent,/保存失败/);assert.equal(ctx.chatMetadata.fields_people_history.notes.npc_hw_linsui,field.value);
    renderHistoryPanel(container,data,'people',{chatContext:ctx});assert.equal(descendants(container,'textarea')[0].value,'失败仍在');
    renderHistoryPanel(container,data,'people',{chatContext:ctx,isCurrent:()=>false});await descendants(container,'button').find(row=>row.text==='保存').onclick();assert.match(container.textContent,/聊天已切换/);
    const other=dom();renderHistoryPanel(other,{...data,reference:{campaignId:'other'}},'people',{chatContext:ctx});assert.equal(descendants(other,'textarea')[0].value,'');
    assert.doesNotMatch(JSON.stringify(data),/仅为人物笔记|失败仍在|存疑/);
});

test('M6-04 三面板空态、文字安全、搜索翻页及请求先后顺序',async()=>{
    const container=dom(),data=sample(),reloads=[];
    data.chronicle.items[0].text='<script>玩家文字</script>';
    renderHistoryPanel(container,data,'chronicle',{reload:options=>reloads.push(options)});
    assert.equal(descendants(container,'script').length,0);assert.match(container.textContent,/<script>玩家文字/);
    descendants(container,'input')[0].value='面包';descendants(container,'form')[0].onsubmit({preventDefault(){}});assert.equal(reloads[0].query,'面包');
    renderHistoryPanel(container,{...data,people:{...data.people,total:21}},'people',{reload:options=>reloads.push(options)});
    descendants(container,'button').find(row=>row.text==='下一页').onclick();assert.equal(reloads.at(-1).page,2);
    const panels=new Map();registerHistoryPanels({registerPanel:panel=>panels.set(panel.id,panel)});assert.equal(panels.size,3);
    const requests=[],context={api:(endpoint,options)=>{assert.equal(endpoint,'ui/history');assert.equal(options.page,1);return new Promise(resolve=>requests.push(resolve));}};
    const first=panels.get('people').render(container,context),second=panels.get('people').render(container,context);
    const empty={...data,people:{items:[],total:0,page:1,pageSize:20}};requests[1](empty);await second;requests[0](data);await first;assert.match(container.textContent,/尚无已记录的相遇/);
    for(const kind of ['people','chronicle','rumors']){renderHistoryPanel(container,{...data,[kind]:{items:[],total:0,page:1,pageSize:20}},kind);assert.doesNotMatch(container.textContent,/undefined|NaN/);}
    await panels.get('people').render(container,{api:async()=>{throw Error('internal JSON');}});assert.match(container.textContent,/经历读取失败/);assert.doesNotMatch(container.textContent,/JSON/);
});

test('M6-04 浏览器：三面板、搜索、笔记与判断保存，双主题桌面和手机截图',{timeout:60000},async t=>{
    const rumor={id:'rumor_m6_04',claim:'石桥旁有人说见过落石，尚未核实。',source:'npc_hw_linsui',carriers:['npc_hw_linsui'],truth:'partial',fact:'测试作者真相，不向玩家显示'};
    const {origin,request}=await fixture(t,{rumor}),created=await request('create',{name:'历史旅人'}),campaignId=created.body.reference.campaignId;
    assert.equal((await request('execute',{campaignId,tool:'world_trade',args:{seller:'林穗',item:'面包',quantity:1},eventId:'browser-bread',anchor:'bread'})).status,200);
    const heard=await request('execute',{campaignId,tool:'remember',args:{subject:'player',key:rumor.id,rumor:rumor.id,source:'npc_hw_linsui',content:rumor.claim},eventId:'browser-rumor',anchor:'rumor'});assert.equal(heard.status,200,heard.body.error);
    const exported=await request('export',{campaignId});
    const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});t.after(()=>browser.close());
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/fixture.html',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>人物与历史</title></head><body><div id="sheld"><div id="chat"><div class="mes_text"><p>旅人记下与林穗的相遇。</p></div></div><div id="form_sheld"><form id="send_form"><textarea id="send_textarea"></textarea></form></div></div></body></html>'}));
    await page.route(/\.(?:mjs|js|css)(?:\?.*)?$/,async route=>{
        const relative=decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
        let body=await fs.readFile(path.join('extension',relative),'utf8');
        body=body.replace(/import\s*\{\s*getContext\s*\}\s*from\s*'\.\.\/\.\.\/\.\.\/extensions\.js';/g,'const getContext=()=>window.fixtureContext;');
        await route.fulfill({contentType:`${relative.endsWith('.css')?'text/css':'text/javascript'}; charset=utf-8`,body});
    });
    await page.route('**/assets/fonts/**',async route=>route.fulfill({body:await fs.readFile(`assets/fonts/${new URL(route.request().url()).pathname.split('/').at(-1)}`)}));
    await page.goto(`${origin}/fixture.html`);await page.addStyleTag({content:await fs.readFile('extension/style.css','utf8')});
    await page.evaluate(reference=>{window.fixtureContext={characters:[{name:'无限原野·世界主持人'}],characterId:0,chatId:'m6-04',chatMetadata:{infinite_fields:reference},chat:[{is_user:true,mes:'面包与传闻',extra:{fields_anchor:'bread'}},{is_user:true,mes:'听传闻',extra:{fields_anchor:'rumor'}}],getRequestHeaders:()=>({'Content-Type':'application/json'}),saveChat:async()=>{},setExtensionPrompt:()=>{},registerFunctionTool:()=>{},stopGeneration:()=>{},eventTypes:{},eventSource:{on:()=>{}}};},created.body.reference);
    await page.evaluate(async()=>{await import('/runtime.js');await window.infiniteFieldsV2.refresh();await document.fonts.ready;});
    const open=async id=>{await page.evaluate(async id=>{const {openPanel}=await import('/ui-shell.mjs');openPanel(id);},id);await page.getByRole('button',{name:'搜索',exact:true}).waitFor();};
    const report='docs/测试报告/最新/M6-04';await fs.mkdir(report,{recursive:true});
    for(const theme of ['dark','light']){
        await page.evaluate(async theme=>{const {updateSettings}=await import('/ui-settings.mjs');updateSettings({theme});},theme);
        for(const [size,viewport]of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]){
            await page.setViewportSize(viewport);
            for(const id of ['people','chronicle','rumors']){
                await open(id);const text=await page.locator('#fields-panel-content').innerText();assert.doesNotMatch(text,/undefined|NaN|memoryStream|npc_hw_ayan/);
                if(id==='people')await page.getByRole('heading',{name:'林穗',exact:true}).waitFor();
                if(id==='rumors')await page.getByText('听自：林穗',{exact:false}).waitFor();
                assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
                assert.equal(await page.locator('#fields-dialog').evaluate(element=>element.scrollWidth>element.clientWidth),false);
                await page.screenshot({path:`${report}/${theme}-${size}-${id}.png`});await page.getByRole('button',{name:'关闭',exact:true}).click();
            }
            await open('chronicle');await page.getByLabel('历史层级').selectOption('facts');await page.getByLabel('搜索历史').fill('面包');await page.getByRole('button',{name:'搜索',exact:true}).click();
            await page.getByText('旅人',{exact:false}).first().waitFor();await page.getByRole('button',{name:'搜索',exact:true}).waitFor();
            assert.match(await page.locator('#fields-panel-content').innerText(),/面包/);await page.screenshot({path:`${report}/${theme}-${size}-search.png`});
        }
    }
    await open('people');await page.getByLabel('人物笔记').fill('下次问林穗客房。');await page.getByRole('button',{name:'保存',exact:true}).click();await page.getByText('已保存',{exact:true}).waitFor();
    await open('people');assert.equal(await page.getByLabel('人物笔记').inputValue(),'下次问林穗客房。');
    await open('rumors');await page.getByLabel('我的判断').selectOption('存疑');await page.getByRole('button',{name:'保存',exact:true}).click();await page.getByText('已保存',{exact:true}).waitFor();
    await open('rumors');assert.equal(await page.getByLabel('我的判断').inputValue(),'存疑');
    assert.deepEqual(await request('export',{campaignId}),exported);
    const annotations=await page.evaluate(()=>window.fixtureContext.chatMetadata.fields_people_history);assert.equal(annotations.notes.npc_hw_linsui,'下次问林穗客房。');assert.ok(Object.values(annotations.judgments).includes('存疑'));
    assert.deepEqual(errors,[]);
});
