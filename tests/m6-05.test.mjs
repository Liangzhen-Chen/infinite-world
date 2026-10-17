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
import {affairs,registerUIRoutes} from '../server-plugin/ui-affairs.mjs';
import {renderAffairsPanel,registerAffairsPanels} from '../extension/affairs-panels.mjs';

const engine=new WorldEngine(await loadWorld());
const legacy=JSON.parse(await fs.readFile('server-plugin/legacy/seed.json','utf8'));
const initial=()=>engine.createCharacter(legacy,{},'m6-05');
async function fixture(t){
    const root=await fs.mkdtemp(path.join(tmpRoot(),'fields-m6-05-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const app=express();app.use(express.json());const router=express.Router();
    await init(router,{baseRoot:root,npcPlanningEnabled:false,consistencyEnabled:false});app.use('/api/plugins/infinite-fields',router);
    const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
    const origin=`http://127.0.0.1:${server.address().port}`;
    const request=async(endpoint,body={})=>{const response=await fetch(`${origin}/api/plugins/infinite-fields/${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
    return {origin,request};
}

test('M6-05 路由自动发现，所选战役只读、隔离；实际约定撤销后恢复面板',async t=>{
    const {request}=await fixture(t),created=await request('create',{name:'事务旅人'}),other=await request('create',{name:'另一位旅人'}),campaignId=created.body.reference.campaignId;
    const before=await request('export',{campaignId}),first=await request('ui/affairs',{campaignId});
    assert.equal(first.status,200);assert.deepEqual(first.body.reference,created.body.reference);
    assert.deepEqual(await request('export',{campaignId}),before);
    assert.ok((await request('ui/modules')).body.modules.includes('ui-affairs.mjs'));
    assert.equal((await request('ui/affairs',{campaignId:'../escape'})).status,400);
    assert.equal((await request('ui/affairs',{campaignId:'missing'})).status,404);
    const made=await request('execute',{campaignId,tool:'world_promise',args:{promisor:'player',promisee:'林穗',type:'付款',coins:5,content:'下午付款',deadline:first.body.minute+120},eventId:'affairs-promise',anchor:'promise'});
    assert.equal(made.status,200,made.body.error);
    const changed=(await request('ui/affairs',{campaignId})).body;
    assert.ok(changed.obligations.some(row=>row.content==='下午付款'));
    assert.equal((await request('ui/affairs',{campaignId:other.body.reference.campaignId})).body.obligations.length,0);
    assert.equal((await request('reconcile',{campaignId,validAnchors:[]})).status,200);
    const restored=(await request('ui/affairs',{campaignId})).body;
    const {reference:a,...original}=first.body,{reference:b,...replayed}=restored;
    assert.deepEqual(replayed,original);assert.ok(b.sequence>a.sequence);
});

function commitments(document){
    const s=document.state;s.minute=600;
    s.quests={late:{publisher:'npc_hw_linsui',taker:'player',content:'较晚交粮',grade:'D',reward:20,status:'进行中',deadline:900},
        zero:{publisher:'player',taker:'npc_hw_xuling',content:'起日任务',grade:'C',reward:50,status:'进行中',deadline:0},
        undated:{publisher:'player',taker:null,content:'无期限招募',grade:'D',reward:20,status:'公开'},
        done:{publisher:'npc_hw_linsui',taker:'player',content:'旧任务',status:'已完成',deadline:100},
        private:{publisher:'npc_hw_xuling',taker:'npc_hw_linsui',content:'NPC私下任务'}};
    s.obligations={incoming:{promisor:'npc_hw_linsui',promisee:'player',type:'送货',item:'item_oats',quantity:3,content:'送来粮食',status:'待履行',deadline:720},
        outgoing:{promisor:'player',promisee:'npc_hw_xuling',type:'付款',coins:5,content:'偿付约定',status:'待履行',deadline:610},
        broken:{promisor:'player',promisee:'npc_hw_xuling',content:'旧违约',status:'违约',reason:'未能按时到达',deadline:100},
        private:{promisor:'npc_hw_linsui',promisee:'npc_hw_xuling',content:'NPC私密约定',status:'待履行'}};
    s.records.debt={category:'debt',name:'赊购粮食',debtor:'player',creditor:'npc_hw_linsui',amount:20,paid:5,status:'逾期',deadline:500};
    s.records.room={category:'contract',name:'住宿契约',parties:['player','npc_hw_linsui'],room:'bld_hw_qingdeng',status:'有效',expires:800};
    s.records.purchase={category:'contract',kind:'procurement',parties:['player','npc_hw_linsui'],subject:'item_oats',cost:30,paid:0,quantity:3,fulfilled:0,status:'待履行',deadline:750};
    s.records.foreign={category:'debt',debtor:'npc_hw_xuling',creditor:'npc_hw_linsui',name:'NPC秘密债务'};
    return document;
}

test('M6-05 仅玩家收发任务及义务；期限含零、历史状态与合同债务，额度不补造',()=>{
    const document=commitments(initial()),before=structuredClone(document),view=affairs(engine,document);
    assert.deepEqual(document,before);
    assert.deepEqual(view.tasks.map(row=>row.id),['zero','done','late','undated']);
    assert.equal(view.tasks[0].overdue,true);assert.equal(view.tasks[1].overdue,false);
    assert.equal(view.tasks[0].direction,'outgoing');assert.equal(view.tasks[2].direction,'incoming');
    assert.equal(view.tasks.at(-1).deadline,null);assert.equal(view.tasks.at(-1).counterparty,'尚无人承接');
    assert.deepEqual(view.obligations.map(row=>row.id),['broken','debt','outgoing','incoming','purchase','room']);
    assert.equal(view.obligations[0].active,false);assert.equal(view.obligations[1].outstanding,15);
    assert.equal(view.obligations.find(row=>row.id==='purchase').content,engine.byId.get('item_oats').name);
    assert.equal(view.obligations.at(-1).deadline,800);
    assert.equal(view.quota.limitD,null);assert.equal(view.quota.usedD,null);assert.equal(view.quota.remainingD,null);
    assert.deepEqual(view.quota.units,engine.rules.quests.quotaUnits);
    assert.doesNotMatch(JSON.stringify(view),/NPC私下任务|NPC私密约定|NPC秘密债务/);
    const scoped=Object.create(engine);scoped.byId=new Map(engine.byId);scoped.byId.set('player',{name:'存档玩家',monthlyQuotaD:10});
    document.state.questQuota={'0_player':3};const recorded=affairs(scoped,document).quota;
    assert.equal(recorded.limitD,10);assert.equal(recorded.usedD,3);assert.equal(recorded.remainingD,7);
    document.state.minute=43200;assert.equal(affairs(scoped,document).quota.usedD,null);
});

function territory(document){
    // Explicit stored ownership is a projection fixture, not an appointment or
    // land-grant producer. That business flow remains R07.
    const s=document.state;s.location='bld_hw_qingdeng';s.minute=600;
    s.settlements.loc_hw.owner='player';
    s.buildings.bld_hw_qingdeng.owner='player';
    s.records['village-fiscal:loc_hw']={category:'village_fiscal',salesGrossCopper:40,salesNetCopper:38,taxReceiptsCopper:2,advanceCopper:10,purchasesCopper:20,exportedFood:4,importedFood:2,privateNote:'公库内部密语'};
    s.projects.bridge={type:'工程',name:'补桥',settlement:'loc_hw',remainingDays:2,wood:5,stone:1,status:'施工中'};
    s.projects.research={type:'研究',name:'隐秘研究',settlement:'loc_hw'};
    s.records.proposal={category:'governance_proposal',name:'修井议案',proposer:'player',settlement:'loc_hw',status:'议事中',opinions:[{private:'私密意见'}]};
    s.records.queued={category:'governance_request',kind:'account_report',settlement:'loc_hw',status:'待办理',due:700};
    s.records.report={category:'governance_execution',steward:'npc_hw_linsui',settlement:'loc_hw',status:'已完成',minute:550,report:{treasury:22,wood:9,stone:1,secret:'管事私密记忆'}};
    s.records.referral={category:'governance_referral',requestedOffice:'申请任命',settlement:'loc_hw',status:'待上级决定',reason:'任命尚未签发'};
    return document;
}

test('M6-05 领地与本地公账严格区分，建筑归属不打开异地账，宽泛/到期授权不扩大视图',()=>{
    const document=territory(initial()),s=document.state;
    const remote=Object.keys(s.settlements).find(id=>id!=='loc_hw');assert.ok(remote);
    s.records.broad={category:'authorization',settlement:remote,grantee:'player',action:'enter_home',expires:9999};
    s.records.expired={category:'authorization',settlement:remote,grantee:'player',action:'account_report',expires:600};
    s.records.residence={category:'civic_citizen',settlement:remote,subject:'player',status:'已登记'};
    s.projects.remote={type:'工程',settlement:remote,creator:'player',name:'异地未获知工程'};
    const before=structuredClone(document),view=affairs(engine,document);
    assert.deepEqual(document,before);assert.equal(view.settlements.length,1);assert.equal(view.settlements[0].scope,'owned');
    assert.equal(view.holdings.length,1);assert.equal(view.settlements[0].stock.treasury,s.settlements.loc_hw.treasury);
    assert.equal(view.settlements[0].fiscal.salesGrossCopper,40);
    assert.equal(view.settlements[0].projects.length,1);assert.equal(view.settlements[0].pending.length,3);
    assert.equal(view.settlements[0].reports[0].report.treasury,22);
    assert.doesNotMatch(JSON.stringify(view),/公库内部密语|隐秘研究|私密意见|管事私密记忆|异地未获知工程/);
    delete s.settlements.loc_hw.owner;s.location=remote;s.buildings.bld_hw_qingdeng.owner='player';
    const publicOnly=affairs(engine,document);assert.equal(publicOnly.holdings.length,1);
    assert.ok(publicOnly.settlements.every(row=>row.scope==='public'));assert.ok(publicOnly.settlements.every(row=>row.id!== 'loc_hw'));
    s.location='loc_hw';assert.equal(affairs(engine,document).settlements[0].scope,'public');
});

test('M6-05 空旧档保留未知，路由使用存档世界名称而不复制原始NPC',async()=>{
    const document={state:{player:{},minute:0}},view=affairs(engine,document);
    assert.deepEqual([view.tasks,view.obligations,view.settlements,view.holdings],[[],[],[],[]]);
    const data=territory(initial()),scoped=Object.create(engine);scoped.byId=new Map(engine.byId);scoped.byId.set('loc_hw',{name:'存档河湾'});
    const routes=new Map();registerUIRoutes({post:(url,fn)=>routes.set(url,fn),readCampaign:async req=>{assert.equal(req.body.campaignId,'saved');return {engine:scoped,document:data,reference:{campaignId:'saved'}};}});
    assert.equal((await routes.get('/ui/affairs')({body:{campaignId:'saved'}})).settlements[0].name,'存档河湾');
    data.state.npcs.npc_hw_linsui.memoryStream=[{content:'隐藏的经历'}];
    assert.doesNotMatch(JSON.stringify(affairs(scoped,data)),/隐藏的经历|memoryStream/);
    delete data.state.records['village-fiscal:loc_hw'];delete data.state.settlements.loc_hw.stone;
    const missing=affairs(scoped,data).settlements[0];assert.equal(missing.fiscal,null);assert.equal(missing.stock.stone,null);
});

class Element{
    constructor(tag,doc){this.tag=tag;this.ownerDocument=doc;this.children=[];this.dataset={};this.classList={add:()=>{}};this.isConnected=true;this.text='';}
    append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;this.text='';}
    set textContent(text){this.text=String(text);this.children=[];}get textContent(){return this.text+this.children.map(child=>child.textContent).join(' ');}
    setAttribute(key,value){this[key]=value;}
}
const dom=()=>{const doc={createElement:tag=>new Element(tag,doc),createDocumentFragment:()=>new Element('fragment',doc)};return new Element('div',doc);};
const descendants=e=>[e,...e.children.flatMap(descendants)];
test('M6-05 三面板空态、到期标识和收发筛选；旧请求不覆盖较新回滚，错误可读',async()=>{
    const data=affairs(engine,commitments(territory(initial()))),container=dom();
    renderAffairsPanel(container,data,'tasks');assert.match(container.textContent,/已到期/);
    assert.doesNotMatch(container.textContent,/旧任务/);
    assert.deepEqual(descendants(container).filter(e=>e.dataset.affairId).map(e=>e.dataset.affairId),['zero','late','undated']);
    let controls=descendants(container).filter(e=>e.tag==='select');controls[0].value='incoming';controls[0].onchange();
    assert.match(container.textContent,/较晚交粮/);assert.doesNotMatch(container.textContent,/起日任务|无期限招募/);
    controls=descendants(container).filter(e=>e.tag==='select');controls[1].value='closed';controls[1].onchange();assert.match(container.textContent,/旧任务/);
    const overview=dom();renderAffairsPanel(overview,data,'territory');
    assert.match(overview.textContent,/补桥/);assert.match(overview.textContent,/修井议案/);assert.match(overview.textContent,/报告时公库 22铜/);
    const empty=affairs(engine,{state:{player:{},minute:0}});
    for(const [kind,text]of [['tasks','暂无已登记事项'],['obligations','暂无已登记事项'],['territory','尚无已登记的玩家领地']]){const e=dom();renderAffairsPanel(e,empty,kind);assert.match(e.textContent,new RegExp(text));assert.doesNotMatch(e.textContent,/undefined|NaN/);}
    const panels=new Map();registerAffairsPanels({registerPanel:panel=>panels.set(panel.id,panel)});assert.equal(panels.size,3);
    const requests=[],context={api:endpoint=>{assert.equal(endpoint,'ui/affairs');return new Promise(resolve=>requests.push(resolve));}};
    const old=panels.get('territory').render(container,context),newer=panels.get('territory').render(container,context);
    requests[1](empty);await newer;requests[0](data);await old;assert.match(container.textContent,/尚无已登记的玩家领地/);
    await panels.get('tasks').render(container,{api:async()=>{throw Error('raw JSON failure');}});
    assert.match(container.textContent,/事务记录读取失败/);assert.doesNotMatch(container.textContent,/JSON/);
    data.tasks[0].content='<img src=x onerror=alert(1)>';const literal=dom();renderAffairsPanel(literal,data,'tasks');
    assert.match(literal.textContent,/<img src=x/);assert.ok(descendants(literal).every(e=>e.tag!=='img'));
});

test('M6-05 浏览器：无领地、有领地及到期排序，双主题桌面与390手机截图',{timeout:60000},async t=>{
    const {origin,request}=await fixture(t),created=await request('create',{name:'事务旅人'});
    const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});t.after(()=>browser.close());
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/favicon.ico',route=>route.fulfill({status:204}));
    await page.route('**/fixture.html',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>事务面板测试</title></head><body><div id="sheld"><div id="chat"><div class="mes_text">旅人核对已登记事务。</div></div><div id="form_sheld"><form id="send_form"><textarea id="send_textarea"></textarea></form></div></div></body></html>'}));
    await page.route(/\.(?:mjs|js|css)(?:\?.*)?$/,async route=>{
        const relative=decodeURIComponent(new URL(route.request().url()).pathname).slice(1);let body=await fs.readFile(path.join('extension',relative),'utf8');
        if(relative==='runtime.js')body=body.replace("import { getContext } from '../../../extensions.js';","const getContext=()=>window.fixtureContext;");
        await route.fulfill({contentType:`${relative.endsWith('.css')?'text/css':'text/javascript'}; charset=utf-8`,body});
    });
    await page.route('**/assets/fonts/**',async route=>route.fulfill({body:await fs.readFile(`assets/fonts/${new URL(route.request().url()).pathname.split('/').at(-1)}`)}));
    await page.goto(`${origin}/fixture.html`);await page.addStyleTag({content:await fs.readFile('extension/style.css','utf8')});
    await page.evaluate(reference=>{window.fixtureContext={characters:[{name:'无限原野·世界主持人'}],characterId:0,chatId:'m6-05',chatMetadata:{infinite_fields:reference},chat:[],getRequestHeaders:()=>({'Content-Type':'application/json'}),saveChat:async()=>{},setExtensionPrompt:()=>{},registerFunctionTool:()=>{},stopGeneration:()=>{},eventTypes:{},eventSource:{on:()=>{}}};},created.body.reference);
    await page.evaluate(async()=>{await import('/runtime.js');await window.infiniteFieldsV2.refresh();await document.fonts.ready;});
    let data=affairs(engine,commitments(territory(initial())));
    await page.route('**/api/plugins/infinite-fields/ui/affairs',route=>route.fulfill({json:data}));
    const report='docs/测试报告/最新/M6-05';await fs.mkdir(report,{recursive:true});
    for(const theme of ['dark','light']){
        await page.evaluate(async theme=>{const {updateSettings}=await import('/ui-settings.mjs');updateSettings({theme});},theme);
        for(const [size,viewport]of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]){
            await page.setViewportSize(viewport);
            for(const [id,expected]of [['tasks','起日任务'],['obligations','赊购粮食'],['territory','本人领地']]){
                await page.evaluate(async id=>{const {openPanel}=await import('/ui-shell.mjs');openPanel(id);},id);
                await page.locator('#fields-panel-content').getByText(expected,{exact:false}).first().waitFor();
                assert.doesNotMatch(await page.locator('#fields-panel-content').innerText(),/undefined|NaN/);
                assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
                const layout=await page.locator('#fields-dialog').evaluate(e=>({width:e.clientWidth,overflow:e.scrollWidth>e.clientWidth}));assert.equal(layout.overflow,false);if(size==='mobile')assert.equal(layout.width,390);
                if(id==='tasks')assert.deepEqual(await page.locator('[data-affair-id]').evaluateAll(rows=>rows.map(row=>row.dataset.affairId)),['zero','late','undated']);
                await page.screenshot({path:`${report}/${theme}-${size}-${id}.png`});await page.getByRole('button',{name:'关闭',exact:true}).click();
            }
            const owned=data;data=affairs(engine,{state:{player:{},minute:600}});
            await page.evaluate(async()=>{const {openPanel}=await import('/ui-shell.mjs');openPanel('territory');});
            await page.getByText('尚无已登记的玩家领地。',{exact:true}).waitFor();
            await page.screenshot({path:`${report}/${theme}-${size}-no-territory.png`});await page.getByRole('button',{name:'关闭',exact:true}).click();data=owned;
        }
    }
    await page.evaluate(async()=>{const {openPanel}=await import('/ui-shell.mjs');openPanel('tasks');});await page.getByText('起日任务',{exact:true}).waitFor();
    await page.getByLabel('收发方向').selectOption('incoming');assert.equal(await page.getByText('起日任务',{exact:true}).count(),0);
    await page.getByLabel('履约状态').selectOption('closed');await page.getByText('旧任务',{exact:true}).waitFor();
    assert.deepEqual(errors,[]);
});
