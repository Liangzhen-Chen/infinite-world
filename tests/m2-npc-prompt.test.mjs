import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {loadPromptBundle} from '../tools/build-card.mjs';
import {assembleMessages,parseExamples} from '../extension/prompt.mjs';
import {buildToolExamples} from '../tools/prompt-examples.mjs';
import {prepareVoiceBlind} from '../tools/playtest-voice-blind.mjs';

const world=await loadWorld(),bundle=await loadPromptBundle({world});
const pairs=parseExamples(bundle.card.data.mes_example);
const example=word=>{
    const index=pairs.findIndex(row=>row.role==='user'&&row.content.includes(word));
    assert.ok(index>=0,`缺少示例：${word}`);
    return {input:pairs[index].content,reply:pairs[index+1].content};
};
const quotes=reply=>[...reply.matchAll(/<q who="([^"]+)">([\s\S]*?)<\/q>/g)]
    .map(([,speaker,text])=>({speaker,text}));
const report=JSON.parse(await fs.readFile(new URL('../docs/测试报告/M2-recheck/真实试玩.json',import.meta.url),'utf8'));
const result=id=>report.results.find(row=>row.id===id);
const voices=JSON.parse(await fs.readFile(new URL('./playtests/npc_voices.json',import.meta.url),'utf8'));

test('事实与口吻约束进入真实组装提示，原工具调用示例完整保留',async()=>{
    const messages=assembleMessages(bundle,[{role:'user',content:'回来聊聊'}],'当前场景');
    assert.ok(messages.some(row=>row.content===bundle.style));
    for(const rule of ['期限逐分保留','制作失败也照记费用','最近两次失败不等于十天全失败',
        '树种、来源、残件未登记不补造','不轮流套同一句首','口吻不证明今日做过该事',
        '已登记在场见证者实际说出亲见反应','不补造围观者或无渠道知情'])assert.ok(bundle.style.includes(rule),rule);
    for(const row of pairs.filter(row=>row.role==='assistant'))
        assert.ok(messages.some(message=>message.name==='example_assistant'&&message.content===row.content));
    assert.deepEqual(bundle.card.data.extensions.fields_tool_examples,await buildToolExamples(world));
    assert.equal(messages.at(-1).content,'当前场景');
});

test('回忆示例沿真实期限与完整离屏记录，最近失败保留费用且不推断木材来源',()=>{
    const deadline=example('10:06');
    assert.ok(Object.values(result('npc_delivery').finalDocument.state.obligations).some(row=>row.deadline===606));
    assert.match(deadline.reply,/十点零六分/);assert.doesNotMatch(deadline.reply,/一刻|10:15/);
    const memory=example('各费2铜'),actions=Object.values(result('npc_offscreen').finalDocument.state.npcAutonomy.actions)
        .filter(row=>row.npc==='npc_hw_ayan'&&row.kind==='craft').sort((a,b)=>a.minute-b.minute);
    assert.ok(actions.some(row=>row.outcome.success&&row.action.recipe==='recipe_tool_handle'));
    const recent=actions.slice(-2);
    assert.ok(recent.every(row=>!row.outcome.success&&row.spent.fee===2));
    assert.ok(recent.some(row=>row.id==='npc_plan_95bd24e757e50aeb8561de08'&&row.minute===15390));
    assert.ok(recent.every(row=>row.spent.materials.some(material=>material.item==='item_wood')));
    assert.match(memory.reply,/前些天木柄做成过.*最近这两件没成，各花了两铜/);
    assert.match(memory.reply,/木料是哪种、从哪儿来的，我说不准/);
    assert.doesNotMatch(memory.reply,/榆木|椴木|免费|边条料|下脚料|十天.*全.*失败/);
});

test('同题示例沿正式公开风格，施锦谈农活与孩子且不变成雕刻师',()=>{
    const lines=quotes(example('旧椅子').reply),people=voices.rubric.blindVoice.speakers.map(id=>world.npcs.find(row=>row.id===id));
    assert.deepEqual(lines.map(row=>row.speaker),people.map(row=>row.id));
    assert.match(people[0].voice.register,/日常经营.*报价清楚/);assert.match(lines[0].text,/多少铜.*买米面/);
    assert.match(people[1].voice.register,/先问用途.*轮廓/);assert.match(lines[1].text,/给谁坐.*轮廓/);
    assert.match(people[2].voice.register,/农户晒种.*提孩子时放慢/);assert.match(lines[2].text,/出工.*收晒.*孩子.*留种/);
    assert.doesNotMatch(lines[2].text,/横撑|先问|给谁用|轮廓/);
    assert.equal(new Set(lines.map(row=>row.text.slice(0,3))).size,3);
    for(const line of lines)for(const person of people)assert.ok(!line.text.includes(person.name));
});

test('现有匿名规则取齐三回合九段；提示对白替入同题回合后仅送纯台词和公开风格',()=>{
    const config=voices.rubric.blindVoice,original=result('npc_voices');
    assert.deepEqual(config.turns,[2,6,7]);assert.equal(config.minimumPerSpeaker,2);
    assert.equal(original.review.voiceBlind.total,9);assert.equal(original.review.voiceBlind.correct,7);
    assert.equal(original.review.voiceBlind.pass,false);
    const fixture=structuredClone(original);fixture.turns.find(row=>row.index===6).reply=example('旧椅子').reply;
    const prepared=prepareVoiceBlind(fixture,world,config,{shuffleSeed:'t98-offline'});
    assert.equal(prepared.samples.length,9);
    for(const speaker of config.speakers)assert.equal(prepared.samples.filter(row=>row.speaker===speaker).length,3);
    for(const row of prepared.payload.samples){
        assert.deepEqual(Object.keys(row).sort(),['id','text']);
        assert.doesNotMatch(row.text,/[<>]|npc_|林穗|贺舟|施锦/);
    }
    for(const candidate of prepared.payload.candidates){
        const person=world.npcs.find(row=>row.name===candidate.name);
        assert.deepEqual(candidate.style,{register:person.voice.register,accent:person.voice.accent,habits:person.voice.habits});
    }
    assert.ok(prepared.samples.some((row,index)=>row.turn!==config.turns[Math.floor(index/3)]));
    fixture.turns.find(row=>row.index===6).reply=example('旧椅子').reply.replace(/<q who="npc_hw_shijin">[\s\S]*?<\/q>/,'');
    assert.throws(()=>prepareVoiceBlind(fixture,world,config),/缺少三人同场对白/);
});

test('冲突示例只让真实在场目击者表达观察，不用将来呼救代替现场发言',()=>{
    const witness=example('目击'),lines=quotes(witness.reply);
    const observed=result('npc_shove').turns[2].sceneBefore;
    assert.match(observed,/贺舟（npc_hw_hezhou）/);assert.match(observed,/目击：试玩者与林穗交锋/);
    assert.deepEqual(lines.map(row=>row.speaker),['npc_hw_hezhou']);
    assert.match(lines[0].text,/我看见你先推她，接着倒下了/);
    assert.doesNotMatch(witness.reply,/围观者|叫人|报案|乡巡已/);
});
