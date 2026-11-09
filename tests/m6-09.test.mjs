import{browserExecutablePath}from'./helpers/browser-path.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot,artifactPath}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {once} from 'node:events';
import express from 'express';
import {chromium} from 'playwright-core';
import {init} from '../server-plugin/index.mjs';
import {AmbientAudio,AUDIO_TRACKS,MUSIC,selectSoundscape,synthesizeLoop} from '../extension/ambient-audio.mjs';
import {renderSettings,updateSettings,subscribeSettings,getSettings} from '../extension/ui-settings.mjs';

const overview=(daylight=true,indoors=false,name='晴')=>({date:{daylight},weather:{indoors,name},locationPath:['河湾村']});
const place=(name='林间小道',description='林地',id='loc_path')=>({name,description,id});
test('M6-09 当前公开地点覆盖生物群落、时段、天气、室内外与五类情境',()=>{
    const day=selectSoundscape(overview(),place()),night=selectSoundscape(overview(false),place());
    assert.equal(day.biome,'forest');assert.ok(day.tracks.some(t=>t.id==='birds'));assert.ok(night.tracks.some(t=>t.id==='insects'));
    for(const [name,biome]of [['溪边','river'],['芦苇湿地','marsh'],['石坡','mountain'],['平原','plain']])assert.equal(selectSoundscape(overview(),place(name,'')).biome,biome);
    for(const [weather,track]of [['小雨','rain'],['雷暴雨','storm'],['雪','snow'],['雾','fog']])assert.ok(selectSoundscape(overview(true,false,weather),place()).tracks.some(t=>t.id===track));
    const clear=selectSoundscape(overview(),place()),cloudy=selectSoundscape(overview(true,false,'阴'),place());assert.notDeepEqual(clear.tracks,cloudy.tracks);
    const indoor=selectSoundscape(overview(false,true,'雨'),place('青灯酒馆','','bld_tavern'));
    assert.ok(indoor.tracks.some(t=>t.id==='fire'));assert.ok(indoor.tracks.some(t=>t.id==='rain'&&t.level===0.12));assert.ok(!indoor.tracks.some(t=>t.id==='wind'||t.id==='birds'));
    const cave=selectSoundscape(overview(true,false,'暴雨'),place('废弃矿洞','地下石室','site_cave'));
    assert.ok(!cave.tracks.some(t=>t.id==='storm'));assert.ok(cave.tracks.some(t=>t.id==='cave'));
    assert.deepEqual([selectSoundscape(overview(),place('河湾村','')).music,indoor.music,day.music,cave.music,selectSoundscape(overview(),place(),true).music],Object.keys(MUSIC));
    assert.equal(selectSoundscape({locationPath:['青灯酒馆'],date:{daylight:false}},place('青灯酒馆','','bld_old')).indoors,true);
});

test('M6-09 所有原创循环可复现、非静音、有限且无削波，首尾无点击',()=>{
    const fingerprints=new Set();
    for(const id of AUDIO_TRACKS){
        const loop=synthesizeLoop(id,8000),again=synthesizeLoop(id,8000);assert.deepEqual(loop.samples,again.samples);
        assert.equal(loop.samples.length,loop.sampleRate*loop.seconds);assert.equal(Math.abs(loop.samples[0]),0);
        assert.ok(Math.abs(loop.samples.at(-1))<0.005);
        let energy=0,peak=0;for(const sample of loop.samples){assert.ok(Number.isFinite(sample));energy+=sample*sample;peak=Math.max(peak,Math.abs(sample));}
        assert.ok(energy/loop.samples.length>0.00001,id);assert.ok(peak<1,id);
        fingerprints.add(loop.samples.slice(1000,1016).join(','));
    }
    assert.equal(fingerprints.size,AUDIO_TRACKS.length);assert.throws(()=>synthesizeLoop('unknown'));
});

class Param{
    constructor(){this.value=1;this.events=[];}
    cancelScheduledValues(time){this.events.push(['cancel',time]);}
    setValueAtTime(value,time){this.value=value;this.events.push(['value',value,time]);}
    linearRampToValueAtTime(value,time){this.events.push(['ramp',value,time]);}
    setTargetAtTime(value,time,constant){this.value=value;this.events.push(['target',value,time,constant]);}
}
class Node{
    constructor(){this.gain=new Param();this.stops=[];this.disconnected=false;this.started=0;}
    connect(node){this.connected=node;}
    disconnect(){this.disconnected=true;}
    start(){this.started++;}
    stop(time){this.stops.push(time);}
}
class AudioContext{
    constructor(){this.currentTime=0;this.state='suspended';this.destination={};this.sources=[];this.gains=[];this.bufferCount=0;}
    createGain(){const node=new Node();this.gains.push(node);return node;}
    createBufferSource(){const node=new Node();this.sources.push(node);return node;}
    createBuffer(channels,length,sampleRate){this.bufferCount++;return {channels,length,sampleRate,copyToChannel:()=>{}};}
    async resume(){this.state='running';}
    async close(){this.state='closed';}
}
test('M6-09 首次点击前没有上下文或声源，拒绝后可重试，音量静音即时应用',async()=>{
    const context=new AudioContext();let creations=0,reject=true;
    const audio=new AmbientAudio({createContext:()=>{creations++;if(reject)throw Error('blocked');return context;}});
    audio.setScene('a',overview(),place());assert.equal(creations,0);assert.equal(context.sources.length,0);
    assert.equal(await audio.unlock(),false);assert.match(audio.message,/重试/);assert.equal(audio.voices.size,0);
    reject=false;audio.applySettings({volume:25,muted:true});assert.equal(await audio.unlock(),true);assert.equal(audio.master.gain.value,0);
    audio.applySettings({volume:25,muted:false});assert.equal(audio.master.gain.value,0.25);
    audio.applySettings({volume:0,muted:false});assert.equal(audio.master.gain.value,0);
    assert.ok(context.sources.every(source=>source.loop&&source.started===1));await audio.close();assert.equal(context.state,'closed');
});

test('M6-09 重复刷新复用声源，切景交叉淡入淡出，快速切换及聊天停止不积累声源',async()=>{
    const context=new AudioContext(),audio=new AmbientAudio({createContext:()=>context});
    audio.setScene('a',overview(),place());await audio.unlock();const first=[...audio.voices.values()],sources=context.sources.length,buffers=context.bufferCount;
    audio.setScene('a',overview(),place());assert.equal(context.sources.length,sources);assert.equal(context.bufferCount,buffers);
    context.currentTime=2;audio.setScene('a',overview(false,true,'雨'),place('酒馆','','bld_tavern'));
    const retiring=[...audio.retiring];assert.ok(retiring.length>0);
    for(const voice of retiring){assert.deepEqual(voice.gain.gain.events.at(-1),['ramp',0,3.2]);assert.equal(voice.source.stops.at(-1),3.2);}
    for(const voice of audio.voices.values())assert.deepEqual(voice.gain.gain.events.at(-1),['ramp',voice.level,3.2]);
    audio.setScene('a',overview(false,true,'雨'),place('酒馆','','bld_tavern'));assert.equal(audio.retiring.size,retiring.length);
    context.currentTime=2.2;audio.setScene('a',overview(),place('矿洞','地下','site_cave'));
    assert.ok(retiring.every(voice=>voice.source.disconnected&&voice.gain.disconnected));
    const old=[...audio.voices.values(),...audio.retiring];audio.setScene('b',overview(),place());
    assert.ok(old.every(voice=>voice.source.disconnected&&voice.source.stops.at(-1)===undefined));assert.equal(audio.retiring.size,0);
    audio.stop();assert.equal(audio.voices.size,0);assert.equal(audio.scene,null);assert.ok(first.every(voice=>voice.source.disconnected));
});

test('M6-09 战斗音乐只取成功交锋回执，行动结束、地点会话切换回到场景配乐',async()=>{
    const audio=new AmbientAudio({createContext:()=>new AudioContext()});audio.setScene('a',overview(),place());await audio.unlock();
    audio.noteAction({actionScope:{kind:'combat_exchange'},targetHp:20},{hp:30});assert.ok(audio.voices.has('music:battle'));
    audio.noteAction({}, {hp:30},'world_turn');assert.ok(audio.voices.has('music:battle'));
    audio.noteAction({actionScope:{kind:'combat_exchange'},targetHp:0},{hp:30});assert.ok(audio.voices.has('music:wild'));
    audio.noteAction({actionScope:{kind:'combat_exchange'},targetHp:20},{hp:0});assert.equal(audio.combat,false);
    audio.noteAction({actionScope:{kind:'combat_exchange'},targetHp:20},{hp:30});audio.noteAction({actionScope:{kind:'travel'}},{hp:30});assert.equal(audio.combat,false);
    audio.noteAction({actionScope:{kind:'combat_exchange'},targetHp:20},{hp:30});audio.setScene('a',overview(),place('村镇','','loc_town'));assert.equal(audio.combat,false);
    audio.noteAction({actionScope:{kind:'combat_exchange'},targetHp:20},{hp:30});audio.setScene('b',overview(),place('村镇',''));assert.equal(audio.combat,false);assert.ok(audio.voices.has('music:town'));
    await audio.close();
});

class Element{
    constructor(tag,doc){this.tag=tag;this.ownerDocument=doc;this.children=[];this.dataset={};this.isConnected=true;}
    append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}
    setAttribute(key,value){this[key]=value;}
    querySelectorAll(selector){return this.children.flatMap(child=>[...(child.tag==='input'&&(selector==='input'||child.type==='checkbox')?[child]:[]),...child.querySelectorAll(selector)]);}
}
test('M6-09 顶栏所用设置状态同步已打开的设置音量与静音，保持旧备份格式',()=>{
    const prior={document:globalThis.document,localStorage:globalThis.localStorage};
    const doc={createElement:tag=>new Element(tag,doc),createTextNode:text=>new Element('text',doc),body:{dataset:{},classList:{toggle:()=>{}},style:{setProperty:()=>{}}}},container=new Element('div',doc);
    globalThis.document={...doc,querySelectorAll:()=>[]};globalThis.localStorage={setItem:()=>{}};
    const audio=new AmbientAudio(),unsubscribe=subscribeSettings(settings=>audio.applySettings(settings));
    try{
        renderSettings(container);updateSettings({volume:17,muted:true});const inputs=container.querySelectorAll('input');
        assert.equal(inputs.find(input=>input.type==='range').value,17);assert.equal(inputs.filter(input=>input.type==='checkbox').at(-1).checked,true);
        const slider=inputs.find(input=>input.type==='range');slider.value='83';slider.oninput();assert.equal(getSettings().volume,83);assert.equal(audio.settings.volume,83);
        const muted=inputs.filter(input=>input.type==='checkbox').at(-1);muted.checked=false;muted.onchange();assert.equal(audio.settings.muted,false);
        assert.deepEqual(Object.keys(getSettings()).sort(),['theme','fontSize','highContrast','reducedMotion','volume','muted'].sort());
        container.isConnected=false;updateSettings({volume:60,muted:false});
    }finally{unsubscribe();Object.assign(globalThis,prior);}
});

async function fixture(t){
    const root=await fs.mkdtemp(path.join(tmpRoot(),'fields-m6-09-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const app=express();app.use(express.json());const router=express.Router();await init(router,{baseRoot:root,npcPlanningEnabled:false,consistencyEnabled:false});app.use('/api/plugins/infinite-fields',router);
    const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
    const origin=`http://127.0.0.1:${server.address().port}`;
    const response=await fetch(`${origin}/api/plugins/infinite-fields/create`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(response.status,200);
    return {origin,created:await response.json()};
}

test('M6-09 隔离浏览器：点击前无声，实际合成输出，手机共用音量与聊天停止',{timeout:60000},async t=>{
    const {origin,created}=await fixture(t);
    // Remove Playwright's default mute flag so the main session can listen.
    const browser=await chromium.launch({executablePath:browserExecutablePath(),headless:process.env.FIELDS_AUDIO_HEADFUL!=='1',ignoreDefaultArgs:['--mute-audio']});t.after(()=>browser.close());
    const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/favicon.ico',route=>route.fulfill({status:204}));
    await page.route('**/fixture.html',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"></head><body><div id="sheld"></div><textarea id="send_textarea"></textarea></body></html>'}));
    await page.route(/\.(?:mjs|js|css)(?:\?.*)?$/,async route=>{
        const relative=decodeURIComponent(new URL(route.request().url()).pathname).slice(1);let body=await fs.readFile(path.join('extension',relative),'utf8');
        if(relative==='runtime.js')body=body.replace("import { getContext } from '../../../extensions.js';","const getContext=()=>window.fixtureContext;");
        await route.fulfill({contentType:`${relative.endsWith('.css')?'text/css':'text/javascript'}; charset=utf-8`,body});
    });
    await page.route('**/assets/fonts/**',async route=>route.fulfill({body:await fs.readFile(`assets/fonts/${new URL(route.request().url()).pathname.split('/').at(-1)}`)}));
    await page.goto(`${origin}/fixture.html`);await page.addStyleTag({content:await fs.readFile('extension/style.css','utf8')});
    await page.evaluate(reference=>{
        const handlers=new Map();window.fixtureHandlers=handlers;
        window.fixtureContext={characters:[{name:'无限原野·世界主持人'}],characterId:0,chatId:'m6-09',chatMetadata:{infinite_fields:reference},chat:[],getRequestHeaders:()=>({'Content-Type':'application/json'}),saveChat:async()=>{},setExtensionPrompt:()=>{},registerFunctionTool:()=>{},stopGeneration:()=>{},eventTypes:new Proxy({},{get:(_,key)=>key}),eventSource:{on:(key,callback)=>handlers.set(key,callback)}};
    },created.reference);
    await page.evaluate(async()=>{await import('/runtime.js');await window.infiniteFieldsV2.refresh();window.audio=(await import('/ambient-audio.mjs')).ambientAudio;});
    assert.equal(await page.evaluate(()=>window.audio.context),null);
    await page.getByRole('button',{name:'面板',exact:true}).click();await page.getByRole('button',{name:'开启声音',exact:true}).click();
    await page.waitForFunction(()=>window.audio.unlocked);assert.ok(await page.evaluate(()=>window.audio.voices.size>0));
    await page.evaluate(()=>{const audio=window.audio;window.analyser=audio.context.createAnalyser();audio.master.connect(window.analyser);});
    await page.waitForTimeout(1600);
    const output=await page.evaluate(()=>{const values=new Float32Array(window.analyser.fftSize);window.analyser.getFloatTimeDomainData(values);return {energy:values.reduce((sum,value)=>sum+value*value,0)/values.length,sampleRate:window.audio.context.sampleRate,tracks:[...window.audio.voices.keys()]};});assert.ok(output.energy>0.000001);
    await page.getByLabel('音量',{exact:true}).evaluate(input=>{input.value='23';input.dispatchEvent(new Event('input',{bubbles:true}));});assert.equal(await page.evaluate(()=>window.audio.settings.volume),23);
    // P3 / design section 9 and P3: relocate screenshot output only; retain every screenshot call and UI/layout assertion.
    const report=artifactPath('测试报告','最新','M6-09');await fs.mkdir(report,{recursive:true});
    for(const theme of ['dark','light']){
        await page.evaluate(async theme=>(await import('/ui-settings.mjs')).updateSettings({theme}),theme);
        await page.screenshot({path:`${report}/${theme}-mobile-volume.png`});
        await page.getByRole('button',{name:'阅读设置',exact:true}).click();assert.equal(await page.locator('#fields-panel-content').getByLabel('音量',{exact:true}).inputValue(),'23');
        await page.locator('#fields-panel-content').getByLabel('静音',{exact:true}).check();assert.equal(await page.evaluate(()=>window.audio.settings.muted),true);
        await page.screenshot({path:`${report}/${theme}-mobile-settings-muted.png`});await page.getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('button',{name:'面板',exact:true}).click();
        await page.getByRole('button',{name:'取消静音',exact:true}).click();
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    const loops=[];
    for(const music of Object.keys(MUSIC)){
        await page.evaluate(music=>{
            const place={name:{town:'河湾村',tavern:'青灯酒馆',wild:'林中小道',dungeon:'地下洞窟',battle:'林中小道'}[music],description:'',id:music==='tavern'?'bld_tavern':'loc_test'};
            window.audio.setScene('listening',{date:{daylight:music!=='tavern'},weather:{name:'晴',indoors:music==='tavern'}},place);
            if(music==='battle')window.audio.noteAction({actionScope:{kind:'combat_exchange'},targetHp:20},{hp:30});
        },music);
        await page.waitForTimeout(process.env.FIELDS_AUDIO_HEADFUL==='1'?5000:1400);
        const loop=await page.evaluate(music=>{const values=new Float32Array(window.analyser.fftSize);window.analyser.getFloatTimeDomainData(values);return {music,tracks:[...window.audio.voices.keys()],energy:values.reduce((sum,value)=>sum+value*value,0)/values.length};},music);
        assert.ok(loop.tracks.includes(`music:${music}`));loops.push(loop);
    }
    assert.ok(loops.every(loop=>loop.energy>0));
    await page.evaluate(async()=>{await window.infiniteFieldsV2.refresh();window.oldSources=[...window.audio.voices.values()];window.fixtureContext.characters[0].name='另一张角色卡';void window.fixtureHandlers.get('CHAT_CHANGED')();});
    assert.deepEqual(await page.evaluate(()=>({voices:window.audio.voices.size,retiring:window.audio.retiring.size,scene:window.audio.scene})),{voices:0,retiring:0,scene:null});
    assert.deepEqual(errors,[]);await fs.writeFile(`${report}/playback.json`,JSON.stringify({output,loops,firstClickSilent:true,chatSwitchStopped:true,errors},null,2));
});
