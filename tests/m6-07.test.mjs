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
import {mapView,routeView,registerUIRoutes} from '../server-plugin/ui-map.mjs';
import {renderMapPanel,registerMapPanel,zoomBounds,bindMapGestures,layoutMapLabels} from '../extension/map-view.mjs';

const world=await loadWorld(),engine=new WorldEngine(world);
const legacy=JSON.parse(await fs.readFile('server-plugin/legacy/seed.json','utf8'));
const initial=()=>engine.createCharacter(legacy,{},'m6-07');
const reference={campaignId:'map-fixture',sequence:1};
function knowledge(){
    const d=initial();d.state.discoveries.bld_hw_qingdeng={minute:0,source:'亲历'};
    d.memories={mill:{subject:'bld_hw_mill',content:'旧磨坊位置已有可靠转述。',minute:0,source:'可靠转述'},
        tower:{subject:'player',sourceType:'听说',source:'npc_hw_ayan',rumor:'heard-tower',reliability:'未核实',minute:0,
            participants:['player','npc_hw_ayan'],location:'loc_hw',content:'北林废观测塔的传闻。'},
        private:{subject:'player',private:true,minute:0,content:'药草院',permittedRecipients:['npc_hw_ayan']},
        foreign:{subject:'npc_hw_ayan',minute:0,content:'旧渡口'},future:{subject:'player',minute:9999,content:'南田'},
        far:{subject:'player',minute:0,content:'王都和雁渡'},
        notReceived:{subject:'player',sourceType:'听说',participants:['npc_hw_ayan'],content:'北林边'}};
    d.state.npcs.npc_hw_ayan.memoryStream=[{minute:0,location:'loc_hw_apiary',sourceType:'亲历',participants:['npc_hw_ayan'],content:'南坡蜂场'}];
    return d;
}
async function fixture(t){
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'fields-m6-07-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const app=express();app.use(express.json());const router=express.Router();
    await init(router,{baseRoot:root,npcPlanningEnabled:false,consistencyEnabled:false});app.use('/api/plugins/infinite-fields',router);
    const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
    const origin=`http://127.0.0.1:${server.address().port}`;
    const request=async(endpoint,body={})=>{const response=await fetch(`${origin}/api/plugins/infinite-fields/${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
    return {origin,request};
}

test('M6-07 已发布层级覆盖河湾四村与野外；不新增白石镇和远方映射',()=>{
    const villages=['loc_hw','loc_bs_yupo','loc_bs_weiting','loc_bs_liquan','loc_bs_sangban'];
    for(const id of villages){const row=engine.byId.get(id);assert.equal(row.mapHierarchy.length,4);assert.equal(row.mapHierarchy[3].id,id);assert.equal(row.mapHierarchy[0].name,'已知大陆片区');}
    // R06 now includes the town skeleton without granting its map hierarchy.
    const unpublished=row=>row.scope==='loc_bs'||['loc_yandu','loc_capital'].includes(row.id);
    for(const row of world.locations.filter(row=>!unpublished(row))){
        assert.equal(row.mapHierarchy.length,4,row.id);assert.ok(world.locations.some(place=>place.id===row.mapHierarchy[3].id));
    }
    for(const row of world.locations.filter(unpublished))assert.equal(row.mapHierarchy,undefined,row.id);
});

test('M6-07 亲历、可靠转述、传闻迷雾只读投影；不泄漏其他人物、私密和未来地点',()=>{
    const d=knowledge(),before=structuredClone(d),view=mapView(engine,d),byId=new Map(view.locations.map(row=>[row.id,row]));
    assert.equal(byId.get('bld_hw_qingdeng').knowledge,'experienced');assert.equal(byId.get('bld_hw_mill').knowledge,'reliable');assert.equal(byId.get('site_beilin_tower').knowledge,'rumor');
    assert.deepEqual([...byId.keys()].sort(),['loc_hw','bld_hw_qingdeng','bld_hw_mill','site_beilin_tower'].sort());
    assert.deepEqual(d,before);assert.deepEqual(view.levels,['大陆','地区','郡','镇']);
    assert.doesNotMatch(JSON.stringify(view),/药草院|旧渡口|南田|王都|雁渡|南坡蜂场|北林边|private|memoryStream/);
    d.memories.stronger={subject:'site_beilin_tower',source:'可靠转述',content:'位置可靠',minute:0};
    assert.equal(mapView(engine,d).locations.find(row=>row.id==='site_beilin_tower').knowledge,'reliable');
    d.state.discoveries.site_beilin_tower={minute:0,source:'亲历'};assert.equal(mapView(engine,d).locations.find(row=>row.id==='site_beilin_tower').knowledge,'experienced');
    d.memories.allowed={subject:'player',private:true,permittedRecipients:['player'],content:'旧渡口',minute:0,source:'可靠转述'};
    assert.equal(mapView(engine,d).locations.find(row=>row.id==='loc_hw_dock').knowledge,'reliable');
});

test('M6-07 路线比较复用实际季节天气计算，未知风险保留，预览不改时间钱袋位置',()=>{
    const d=knowledge(),before=structuredClone(d),routes=routeView(engine,d,'bld_hw_mill');
    assert.ok(routes.options.some(row=>row.mode==='walk'));assert.ok(routes.options.some(row=>row.mode==='horse'));
    for(const option of routes.options){const actual=engine.route(d.state.location,'bld_hw_mill',option.mode,d.state.minute,d.randomSeed);assert.equal(option.minutes,actual.minutes);assert.equal(option.cost,actual.cost);assert.equal(option.risk,null);assert.match(option.intent,/^我打算.*经由.*前往旧磨坊。$/);}
    assert.deepEqual(d,before);assert.throws(()=>routeView(engine,d,'loc_hw_fields'),/尚未获知/);
    d.state.discoveries.route_bld_hw_mill={minute:0,source:'亲历'};assert.equal(routeView(engine,d,'bld_hw_mill').options[0].risk,0);
});

test('M6-07 不同走法、收费、季节封路、未知中转点不会从预览泄漏',()=>{
    const w=structuredClone(world),e=new WorldEngine(w),d=initial(),ids=['loc_hw','loc_hw_dock','bld_hw_mill'];
    w.routes=[
        {id:'direct',from:ids[0],to:ids[2],lengthKm:1,terrainMultiplier:1,modes:['walk'],closedSeasons:[],toll:9,risk:3},
        {id:'detour-a',from:ids[0],to:ids[1],lengthKm:1,terrainMultiplier:1,modes:['walk'],closedSeasons:[],toll:0,risk:1},
        {id:'detour-b',from:ids[1],to:ids[2],lengthKm:1,terrainMultiplier:1,modes:['walk'],closedSeasons:[3],toll:0,risk:1}];
    for(const id of ids)d.state.discoveries[id]={minute:0,source:'亲历'};
    const summer=routeView(e,d,ids[2]).options;assert.equal(summer.length,2);assert.deepEqual(summer.map(row=>row.cost),[9,0]);
    delete d.state.discoveries[ids[1]];assert.equal(routeView(e,d,ids[2]).options.length,1);
    d.state.discoveries[ids[1]]={minute:0,source:'亲历'};d.state.minute=270*1440;
    assert.equal(mapView(e,d).routes.find(row=>row.id==='detour-b').closed,true);assert.equal(routeView(e,d,ids[2]).options.length,1);
    w.routes=w.routes.filter(row=>row.id!=='direct');assert.equal(routeView(e,d,ids[2]).options.length,0);
});

test('M6-07 天气使步行估时变化，暴雨封闭船路，与原路线计算一致',()=>{
    const w=structuredClone(world),e=new WorldEngine(w),d=knowledge();
    w.routes=[{id:'weather-road',from:'loc_hw',to:'site_beilin_tower',lengthKm:6,terrainMultiplier:1,modes:['walk','boat'],closedSeasons:[],toll:0,risk:0}];
    w.rules.weather.seasonalWeights=w.rules.weather.seasonalWeights.map(()=>[1,0,0,0,0,0]);
    const clear=routeView(e,d,'site_beilin_tower');assert.ok(clear.options.some(row=>row.mode==='boat'));
    w.rules.weather.seasonalWeights=w.rules.weather.seasonalWeights.map(()=>[0,0,0,1,0,0]);
    const storm=routeView(e,d,'site_beilin_tower'),walk=storm.options.find(row=>row.mode==='walk');
    assert.equal(mapView(e,d).weather,'暴雨');assert.ok(walk.minutes>clear.options.find(row=>row.mode==='walk').minutes);
    assert.equal(walk.minutes,e.route('loc_hw','site_beilin_tower','walk',d.state.minute,d.randomSeed).minutes);
    assert.ok(!storm.options.some(row=>row.mode==='boat'));assert.equal(mapView(e,d).routes[0].conditions.find(row=>row.mode==='boat').condition,'天气封路');
});

test('M6-07 正式冬季野外封路与四村既有中转，白石镇不获得地图层级',()=>{
    const d=initial();for(const place of world.locations)d.state.discoveries[place.id]={minute:0,source:'亲历'};
    const all=mapView(engine,d);assert.ok(all.transit.some(row=>row.id==='loc_bs'));assert.ok(!all.locations.some(row=>row.id==='loc_bs'));
    assert.ok(routeView(engine,d,'loc_bs_yupo').options.some(row=>row.via.includes('白石镇')));
    d.state.location='site_white_canopy';d.state.minute=270*1440;assert.equal(mapView(engine,d).routes.find(row=>row.id==='route_ice_echo').closed,true);
    assert.equal(routeView(engine,d,'site_ice_echo').options.length,0);
    d.state.minute=0;assert.ok(routeView(engine,d,'site_ice_echo').options.length>0);
});

test('M6-07 HTTP自动注册与战役隔离，实际获知后出行预览和地图不写账本',async t=>{
    const {request}=await fixture(t),created=await request('create',{character:{name:'地图旅人'}}),other=await request('create',{character:{name:'他人'}}),campaignId=created.body.reference.campaignId;
    const modules=await request('ui/modules');assert.ok(modules.body.modules.includes('ui-map.mjs'));
    assert.equal((await request('ui/map',{campaignId:'../escape'})).status,400);assert.equal((await request('ui/map',{campaignId:'missing'})).status,404);
    assert.equal((await request('ui/routes',{campaignId,destination:'bld_hw_mill'})).status,400);
    const remembered=await request('execute',{campaignId,tool:'world_remember',args:{subject:'旧磨坊',key:'位置',content:'旧磨坊在河湾村。',source:'可靠转述'},eventId:'map-memory',anchor:'heard'});assert.equal(remembered.status,200,remembered.body.error);
    const before=await request('export',{campaignId}),map=await request('ui/map',{campaignId}),routes=await request('ui/routes',{campaignId,destination:'bld_hw_mill'});
    assert.equal(map.status,200);assert.equal(routes.status,200);assert.ok(routes.body.options.length>0);assert.deepEqual(await request('export',{campaignId}),before);
    assert.ok(!(await request('ui/map',{campaignId:other.body.reference.campaignId})).body.locations.some(row=>row.id==='bld_hw_mill'));
    const registered=new Map();registerUIRoutes({post:(url,fn)=>registered.set(url,fn),readCampaign:async()=>({engine,document:knowledge(),reference})});
    assert.equal((await registered.get('/ui/map')({body:{}})).reference.campaignId,reference.campaignId);
});

class Element{
    constructor(tag,doc){this.tag=tag;this.ownerDocument=doc;this.children=[];this.dataset={};this.attrs={};this.classes=new Set();this.style={};this.classList={add:(...names)=>names.forEach(x=>this.classes.add(x)),contains:name=>this.classes.has(name),toggle:(name,enabled)=>enabled?this.classes.add(name):this.classes.delete(name)};this.isConnected=true;this.listeners=new Map();this.text='';this._value=undefined;}
    append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;this.text='';}
    set textContent(text){this.text=String(text);this.children=[];}get textContent(){return this.text+this.children.map(child=>child.textContent).join(' ');}
    set className(value){this.classes=new Set(value.split(' '));}get className(){return [...this.classes].join(' ');}
    set value(value){this._value=String(value);}get value(){return this._value??(this.tag==='select'?this.children[0]?.value??'':this.attrs.value??'');}
    setAttribute(key,value){this.attrs[key]=String(value);if(key==='class')this.className=String(value);if(key==='value')this.value=value;}
    getAttribute(key){return this.attrs[key];}
    querySelectorAll(tag){return descendants(this).slice(1).filter(row=>row.tag===tag);}
    addEventListener(name,fn){this.listeners.set(name,fn);}dispatchEvent(event){this.listeners.get(event.type)?.(event);this.lastEvent=event;}
    getBoundingClientRect(){return {left:0,top:0,width:800,height:450};}setPointerCapture(){}focus(){this.focused=true;}
}
const descendants=e=>[e,...e.children.flatMap(descendants)];
function dom(){const doc={createElement:tag=>new Element(tag,doc),createElementNS:(_ns,tag)=>new Element(tag,doc),createDocumentFragment:()=>new Element('fragment',doc),defaultView:{Event:class{constructor(type){this.type=type;}}}};doc.field=new Element('textarea',doc);doc.querySelector=selector=>selector==='#send_textarea'?doc.field:null;return new Element('div',doc);}
const find=(container,label)=>descendants(container).find(row=>row.attrs['aria-label']===label);
const click=async(container,text)=>descendants(container).find(row=>row.tag==='button'&&row.textContent===text).onclick();
const choose=async(container,id)=>{const select=find(container,'地图目的地');select.value=id;return select.onchange();};
const chat=()=>({chatId:'fixture',chatMetadata:{infinite_fields:reference},saveChat:async()=>{}});
const data=()=>({reference,...mapView(engine,knowledge())});
const api=async(_url,body)=>({reference,...routeView(engine,knowledge(),body.destination)});

test('M6-07 屏幕标签避让同坐标、共线及边缘地点，稀疏视图按可见地点适配',()=>{
    const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
    for(const width of [348,474]){
        const rows=[{id:'river',x:56,y:110,width:100,height:18},{id:'inn',x:56,y:110,width:56,height:18},
            {id:'mill',x:70,y:110,width:42,height:18},{id:'tower',x:width-56,y:110,width:98,height:18}];
        const result=layoutMapLabels(rows,{width,height:220});assert.ok(result.every(row=>row.label));
        for(const [i,row]of result.entries()){
            assert.ok(row.label.x>=12&&row.label.y>=12&&row.label.x+row.label.width<=width-12&&row.label.y+row.label.height<=208);
            for(const next of result.slice(i+1)){assert.equal(overlap(row.label,next.label),false);assert.ok(Math.hypot(row.marker.x-next.marker.x,row.marker.y-next.marker.y)>=18);}
        }
    }
    const container=dom(),view=data();view.locations=view.locations.filter(row=>row.id!=='site_beilin_tower');view.routes=view.routes.filter(row=>row.to!=='site_beilin_tower');
    renderMapPanel(container,view,{api,chatContext:chat()});const svg=find(container,'已知地点地图');assert.ok(svg.classList.contains('map-sparse'));
    assert.ok(Number(svg.attrs.viewBox.split(' ')[2])<.5);
    const labels=descendants(container).filter(row=>row.tag==='text');assert.ok(labels.every(row=>row.style.display!=='none'));
    const before=labels[0].attrs.transform;click(container,'缩小');assert.notEqual(labels[0].attrs.transform,before);
});

test('M6-07 地图四级切换、SVG迷雾、风险未知、只填输入框及标记保存恢复清除',async()=>{
    const container=dom(),context=chat();let saved;context.saveChat=async()=>{saved=structuredClone(context.chatMetadata);};
    renderMapPanel(container,data(),{api,chatContext:context});
    assert.equal(find(container,'地图层级').children.length,4);assert.equal(descendants(container).filter(row=>row.classes.has('map-rumor')).length,2);
    for(const value of ['0','1','2','3']){const level=find(container,'地图层级');level.value=value;level.onchange();assert.ok(find(container,'已知地点地图').attrs.viewBox);}
    // Select local known point even when its coordinates coincide with a sibling.
    await choose(container,'bld_hw_mill');await Promise.resolve();
    assert.match(container.textContent,/风险：未知/);find(container,'地点标记').value='下次修磨坊';await click(container,'保存标记');assert.equal(saved.fields_map.marks.bld_hw_mill,'下次修磨坊');
    assert.deepEqual(Object.keys(context.chatMetadata.infinite_fields),['campaignId','sequence']);
    await click(container,'填入出行意图');assert.match(container.ownerDocument.field.value,/前往旧磨坊。$/);assert.equal(container.ownerDocument.field.lastEvent.type,'input');
    const restored=dom();renderMapPanel(restored,data(),{api,chatContext:context});await choose(restored,'bld_hw_mill');await Promise.resolve();assert.equal(find(restored,'地点标记').value,'下次修磨坊');
    find(restored,'地点标记').value='';await click(restored,'保存标记');assert.equal(context.chatMetadata.fields_map.marks.bld_hw_mill,undefined);
});

test('M6-07 已获知中转点连接河湾四村既有道路，不生成白石镇地图节点',()=>{
    const d=initial();for(const id of ['loc_hw','loc_bs','loc_bs_yupo','loc_bs_weiting','loc_bs_liquan','loc_bs_sangban'])d.state.discoveries[id]={minute:0,source:'亲历'};
    const view={reference,...mapView(engine,d)},container=dom();renderMapPanel(container,view,{api,chatContext:chat()});
    assert.equal(descendants(container).filter(row=>row.tag==='line').length,view.routes.length);
    assert.ok(!descendants(container).some(row=>row.attrs['data-place']==='loc_bs'));
    assert.ok(!find(container,'地图目的地').children.some(row=>row.value==='loc_bs'));
});

test('M6-07 标记保存失败保留草稿、聊天切换阻止写入和意图；旧路线响应不覆盖新选择',async()=>{
    const container=dom(),context=chat();context.saveChat=async()=>{throw Error('disk');};
    renderMapPanel(container,data(),{api,chatContext:context});await choose(container,'bld_hw_mill');await Promise.resolve();
    find(container,'地点标记').value='<img src=x onerror=alert(1)>';await click(container,'保存标记');assert.match(container.textContent,/保存失败/);assert.equal(context.chatMetadata.fields_map,undefined);assert.match(find(container,'地点标记').value,/<img/);
    context.chatMetadata.infinite_fields={campaignId:'another'};await click(container,'保存标记');await click(container,'填入出行意图');assert.equal(container.ownerDocument.field.value,'');assert.equal(context.chatMetadata.fields_map,undefined);
    const queued=[],second=dom();renderMapPanel(second,data(),{api:()=>new Promise(resolve=>queued.push(resolve)),chatContext:chat()});
    const old=choose(second,'bld_hw_mill'),recent=choose(second,'site_beilin_tower');
    queued[1]({reference,...routeView(engine,knowledge(),'site_beilin_tower')});await recent;
    queued[0]({reference,...routeView(engine,knowledge(),'bld_hw_mill')});await old;assert.doesNotMatch(second.textContent,/前往旧磨坊/);assert.match(second.textContent,/北林废观测塔/);
    assert.ok(descendants(second).every(row=>row.tag!=='img'));
});

test('M6-07 滚轮缩放、拖动和两指捏合改变视口；复位及放大按钮可用',()=>{
    const svg=new Element('svg',{});let box={x:0,y:0,width:80,height:45};bindMapGestures(svg,()=>box,next=>box=next);
    const emit=(type,values)=>svg.listeners.get(type)({button:0,target:{},preventDefault(){},...values});
    emit('wheel',{deltaY:-100,clientX:400,clientY:225});assert.ok(box.width<80);const wheelWidth=box.width;
    const beforeDrag=box.x;emit('pointerdown',{pointerId:1,clientX:200,clientY:200});emit('pointermove',{pointerId:1,clientX:230,clientY:200});assert.ok(box.x<beforeDrag);
    emit('pointerdown',{pointerId:2,clientX:400,clientY:200});emit('pointermove',{pointerId:2,clientX:500,clientY:200});assert.ok(box.width<wheelWidth);
    emit('pointerup',{pointerId:1});emit('pointercancel',{pointerId:2});assert.ok(Number.isFinite(box.x));
    let blocked=false;emit('click',{preventDefault:()=>blocked=true,stopPropagation(){}});assert.equal(blocked,true);
    const anchored=zoomBounds({x:0,y:0,width:80,height:40},2,{x:20,y:10});assert.deepEqual(anchored,{x:10,y:5,width:40,height:20});
    const container=dom();renderMapPanel(container,data(),{api,chatContext:chat()});const map=find(container,'已知地点地图'),before=map.attrs.viewBox;click(container,'放大');assert.notEqual(map.attrs.viewBox,before);click(container,'复位');assert.equal(map.attrs.viewBox,before);
});

test('M6-07 挂载点隔离旧请求，错误可读，切换聊天不会加载旧地图',async()=>{
    const panels=new Map();registerMapPanel({registerPanel:row=>panels.set(row.id,row)});assert.equal(panels.get('map').title,'地图');
    const container=dom(),requests=[],context=chat(),options={getChatContext:()=>context,api:()=>new Promise(resolve=>requests.push(resolve))};
    const old=panels.get('map').render(container,options),recent=panels.get('map').render(container,options);
    requests[1](data());await recent;requests[0]({reference,...mapView(engine,initial())});await old;assert.match(container.textContent,/旧磨坊/);
    await panels.get('map').render(container,{...options,api:async()=>{throw Error('read');}});assert.match(container.textContent,/地图读取失败/);
    const stale=panels.get('map').render(container,options);context.chatId='switched';requests[2](data());await stale;assert.doesNotMatch(container.textContent,/旧磨坊/);
});

test('M6-07 浏览器：四级地图三类迷雾、鼠标双指缩放、保存和只填意图，双主题桌面390截图',{timeout:60000},async t=>{
    const {origin,request}=await fixture(t),created=await request('create',{character:{name:'地图旅人'}});
    const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});t.after(()=>browser.close());
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/favicon.ico',route=>route.fulfill({status:204}));
    await page.route('**/fixture.html',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>地图测试</title></head><body><div id="sheld"><div id="chat"><div class="mes_text">旅人查看地图。</div></div><div id="form_sheld"><form id="send_form"><textarea id="send_textarea"></textarea></form></div></div></body></html>'}));
    await page.route(/\.(?:mjs|js|css)(?:\?.*)?$/,async route=>{
        const relative=decodeURIComponent(new URL(route.request().url()).pathname).slice(1);let body=await fs.readFile(path.join('extension',relative),'utf8');
        if(relative==='runtime.js')body=body.replace("import { getContext } from '../../../extensions.js';","const getContext=()=>window.fixtureContext;");
        await route.fulfill({contentType:`${relative.endsWith('.css')?'text/css':'text/javascript'}; charset=utf-8`,body});
    });
    await page.route('**/assets/fonts/**',async route=>route.fulfill({body:await fs.readFile(`assets/fonts/${new URL(route.request().url()).pathname.split('/').at(-1)}`)}));
    await page.goto(`${origin}/fixture.html`);await page.addStyleTag({content:await fs.readFile('extension/style.css','utf8')});
    await page.evaluate(reference=>{window.fixtureContext={characters:[{name:'无限原野·世界主持人'}],characterId:0,chatId:'m6-07',chatMetadata:{infinite_fields:reference},chat:[],getRequestHeaders:()=>({'Content-Type':'application/json'}),saveChat:async()=>{window.savedMetadata=JSON.parse(JSON.stringify(window.fixtureContext.chatMetadata));},setExtensionPrompt:()=>{},registerFunctionTool:()=>{},stopGeneration:()=>{},eventTypes:{},eventSource:{on:()=>{}}};document.querySelector('#send_form').addEventListener('submit',event=>{event.preventDefault();window.sent=(window.sent??0)+1;});},created.body.reference);
    await page.evaluate(async()=>{await import('/runtime.js');await window.infiniteFieldsV2.refresh();await document.fonts.ready;});
    const d=knowledge(),ref=created.body.reference,view={reference:ref,...mapView(engine,d)};
    await page.route('**/api/plugins/infinite-fields/ui/map',route=>route.fulfill({json:view}));
    await page.route('**/api/plugins/infinite-fields/ui/routes',route=>route.fulfill({json:{reference:ref,...routeView(engine,d,route.request().postDataJSON().destination)}}));
    const report='docs/测试报告/最新/M6-07';await fs.mkdir(report,{recursive:true});
    const assertLabels=async expected=>{
        const result=await page.locator('.fields-map-viewport').evaluate(svg=>{
            const rect=svg.getBoundingClientRect();
            const labels=[...svg.querySelectorAll('text')].filter(label=>getComputedStyle(label).display!=='none').map(label=>{
                const box=label.getBoundingClientRect(),matrix=label.getScreenCTM();
                return {text:label.textContent,left:box.left,top:box.top,right:box.right,bottom:box.bottom,
                    fontSize:parseFloat(getComputedStyle(label).fontSize)*Math.hypot(matrix.c,matrix.d)};
            });
            return {canvas:{left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom},labels};
        });
        if(expected!==undefined)assert.equal(result.labels.length,expected,'所有已知地点的标签应可读');
        for(const [i,label]of result.labels.entries()){
            assert.ok(label.fontSize>=12,`${label.text} 屏幕字号 ${label.fontSize}px`);
            assert.ok(label.left>=result.canvas.left&&label.right<=result.canvas.right&&label.top>=result.canvas.top&&label.bottom<=result.canvas.bottom,`${label.text} 不应超出画布`);
            for(const other of result.labels.slice(i+1))assert.equal(label.left<other.right&&label.right>other.left&&label.top<other.bottom&&label.bottom>other.top,false,`${label.text} 与 ${other.text} 标签重叠`);
        }
    };
    for(const theme of ['dark','light'])for(const [size,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
        await page.setViewportSize(viewport);await page.evaluate(async theme=>{const {updateSettings}=await import('/ui-settings.mjs');updateSettings({theme});const {openPanel}=await import('/ui-shell.mjs');openPanel('map');},theme);
        await page.getByLabel('地图层级',{exact:true}).waitFor();
        for(const value of ['0','1','2','3']){
            await page.getByLabel('地图层级',{exact:true}).selectOption(value);assert.equal(await page.locator('svg .map-experienced').count(),2);
            assert.equal(await page.locator('svg .map-reliable').count(),1);assert.equal(await page.locator('svg .map-rumor').count(),1);
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
            assert.equal(await page.locator('#fields-dialog').evaluate(e=>e.scrollWidth>e.clientWidth),false);
            await assertLabels(4);
            await page.screenshot({path:`${report}/${theme}-${size}-level-${value}.png`});
        }
        await page.getByRole('button',{name:'关闭',exact:true}).click();
    }
    await page.evaluate(async()=>{const {openPanel}=await import('/ui-shell.mjs');openPanel('map');});
    await page.getByLabel('地图层级',{exact:true}).waitFor();const svg=page.locator('.fields-map-viewport'),before=await svg.getAttribute('viewBox'),rect=await svg.boundingBox();
    await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.wheel(0,-200);await page.waitForFunction(previous=>document.querySelector('.fields-map-viewport').getAttribute('viewBox')!==previous,before);
    await assertLabels();
    const beforePinch=await svg.getAttribute('viewBox');
    // Native Chrome touch events are translated to the pointer handler used by mobile.
    const session=await page.context().newCDPSession(page);const x=rect.x+rect.width/2,y=rect.y+rect.height/2;
    await session.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-30,y,id:1},{x:x+30,y,id:2}]});
    await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-70,y,id:1},{x:x+70,y,id:2}]});
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.notEqual(await svg.getAttribute('viewBox'),beforePinch);
    await assertLabels();
    await page.getByRole('button',{name:'复位',exact:true}).click();await assertLabels(4);
    await page.getByLabel('地图目的地',{exact:true}).selectOption('bld_hw_mill');await page.getByText('风险：未知，尚无这条路的可靠风险记录。',{exact:true}).first().waitFor();
    await page.getByLabel('地点标记',{exact:true}).fill('留待修理');await page.getByRole('button',{name:'保存标记',exact:true}).click();await page.getByText('标记已保存',{exact:true}).waitFor();
    await page.screenshot({path:`${report}/mobile-preview.png`});
    const exported=await request('export',{campaignId:ref.campaignId});await page.getByRole('button',{name:'填入出行意图',exact:true}).first().click();
    assert.match(await page.locator('#send_textarea').inputValue(),/我打算.*前往旧磨坊/);assert.equal(await page.evaluate(()=>window.sent??0),0);assert.deepEqual(await request('export',{campaignId:ref.campaignId}),exported);
    await page.evaluate(async()=>{const {openPanel}=await import('/ui-shell.mjs');openPanel('map');});await page.getByLabel('地图目的地',{exact:true}).selectOption('bld_hw_mill');assert.equal(await page.getByLabel('地点标记',{exact:true}).inputValue(),'留待修理');
    assert.equal(await page.evaluate(()=>window.savedMetadata.fields_map.marks.bld_hw_mill),'留待修理');assert.deepEqual(errors,[]);
});
