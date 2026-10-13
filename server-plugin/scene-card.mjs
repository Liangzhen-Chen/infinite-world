import {environmentCatalog} from './environment.mjs';
import {petView} from './pets.mjs';
import {summonView} from './summons.mjs';
import {localWeather} from './weather.mjs';
import {agricultureView} from './agriculture.mjs';
import {npcAvailability} from './npc-schedule.mjs';
import {npcContext}from'./npc-memory.mjs';
import {relationView}from'./npc-relations.mjs';
import {chronicleContext}from'./chronicle.mjs';
import {settlementScene}from'./settlement-profile.mjs';
import {festivalScene}from'./festival.mjs';
import {worldClockScene}from'./world-clock.mjs';
import {selectNpcRumors,assertRumorConversation}from'./npc-rumors.mjs';

const text=(value,limit=200)=>typeof value==='string'?value.replace(/\s+/g,' ').slice(0,limit):'';
const list=value=>Array.isArray(value)?value.map(row=>typeof row==='string'?row:row.content??row.description??'').filter(Boolean).join('；'):text(value);

export function sceneCard(engine,document,query='',index=null){
    const s=document.state,place=engine.byId.get(s.location),mentioned=engine.resolver.mentions(query,s.location);
    const name=id=>engine.byId.get(id)?.name??s.created?.[id]?.name??id;
    const present=Object.entries(s.npcs).filter(([,npc])=>npc.location===s.location)
        .sort(([a],[b])=>Number(mentioned.has(b))-Number(mentioned.has(a))||a.localeCompare(b));
    const compactPeople=Math.min(present.length,engine.rules.prompt.npcLimit)>4;
    const weather=localWeather(engine,document),path=[],seen=new Set();let location=place;
    while(location&&!seen.has(location.id)){seen.add(location.id);path.unshift(location.name);location=engine.byId.get(location.parent);}
    const p=s.player,parts=[`【时间】${engine.calendar(s.minute).text}${weather?`｜${weather.name}｜${weather.temperatureC}℃`:''}`,
        `【地点】${path.join(' › ')||s.location}（${s.location}）`,
        `【你】${p.name}｜${p.level}级｜生命${p.hp}/${p.maxHp} 魔力${p.mp}/${p.maxMp}｜铜${p.coins}｜同行：${(p.companions??[]).map(name).join('、')||'无'}`,
        `【在场】共${present.length}人`];
    const adjacent=new Set([place?.parent,...engine.world.locations.filter(row=>row.parent===s.location).map(row=>row.id),
        ...engine.world.routes.filter(route=>[route.from,route.to].includes(s.location)).map(route=>route.from===s.location?route.to:route.from)]);
    adjacent.delete(undefined);adjacent.delete(null);
    const requested=[...mentioned].filter(id=>/^(loc|bld|site)_/.test(id));
    const destinations=[...new Set([...requested,...adjacent])].slice(0,12);
    if(destinations.length)parts.splice(2,0,`【地点索引】${destinations.map(id=>`${name(id)}（${id}）`).join('；')}`);
    const localProfile=settlementScene(engine,document);if(localProfile)parts.push(localProfile);
    const festivals=festivalScene(engine,document);if(festivals)parts.push(`【本地节俗结果】${festivals}`);
    const clock=worldClockScene(engine,document);if(clock)parts.push(`【本地粮价】${clock}`);
    const rumorTopics=[];
    for(const [id]of present){
        const d={get:(...p)=>p.reduce((v,k)=>v?.[k],document),document};
        try{assertRumorConversation(d,engine,id);}catch{continue;}
        for(const row of selectNpcRumors(engine,id,query,document))rumorTopics.push(`  ${name(id)}（${id}）可讲述：${row.claim}｜未核实｜传闻 ${row.id}｜原来源 ${name(row.source)}（${row.source}）`);
        if(rumorTopics.length>=4)break;
    }
    if(rumorTopics.length)parts.push('【可问询的未核实传闻，尚未成为玩家经历】',...rumorTopics.slice(0,4));
    for(const [id,npc] of present.slice(0,engine.rules.prompt.npcLimit)){
        const base=engine.byId.get(id)??npc;
        const available=npcAvailability(engine,s,id);
        const context=npcContext(engine,document,id,query);
        const relationship=relationView(engine,s,id,'player');
        const shared=(context?.memories??Object.values(document.memories??{}).filter(m=>m.subject===id).slice(-2)).map(m=>`${engine.calendar(m.minute??0).text} ${m.sourceType??''}：${text(m.content,140)}`);
        parts.push(`${base.name}（${id}）｜${base.occupation??''}，${base.age??''}岁｜此刻：${text(available.activity)}\n  对你：信任${relationship.trust} 亲近${relationship.affection} 敬重${relationship.respect} 畏惧${relationship.fear}${relationship.favors.some(row=>row.status==='未还')?'，记得欠你的人情':''}｜涉及你的经历：${text(shared.join('；'),compactPeople?180:500)||'尚无已核实记录'}\n  说话：${text(base.speakingStyle??base.voice?.register??base.voice)}｜挂心：${text(context?.concern??list(npc.goals??base.goals),130)}\n  TA不知道：${text(list(context?.unknown??npc.unknownFacts??base.knowledge?.unknown??base.unknownFacts),160)}${!context&&base.notes?`\n  人物资料：${text(base.notes,180)}`:''}`);
        if(context?.recentActivities?.length)parts.push(`  本人近期经历，玩家未必知情：${text(context.recentActivities.map(row=>`${engine.calendar(row.minute).text} ${row.content}`).join('；'),compactPeople?100:220)}`);
        if(context?.reflections?.length)parts.push(`  个人判断，可被推翻：${text(context.reflections[0].content,100)}`);
        if(context&&compactPeople)parts.push(`  本人已知：${text(list(context.known),100)}`);
        else if(context)parts.push(`  可见外貌：${text(list(context.appearance),100)}｜说话习惯：${text(list(context.voice.habits),80)}\n  台词范例，非既往经历：${text(context.voice.samples?.[0],80)}\n  本人已知：${text(list(context.known),180)}\n  本人旧事，不代表玩家参与：${text(list(context.seeds),180)}\n  在意：${text(list(context.values),70)}｜弱点：${text(list(context.flaws),70)}\n  行事：${text(Object.values(context.behavior).join('；'),160)}`);
        if(available.services!==null)parts.push(`  当前交易/授课：${available.services.map(service=>service==='teach'?'授课':'交易').join('、')||'暂停'}${available.until?`，本时段至${engine.calendar(available.until).text}`:''}；司法受理按法典、在场清醒及办案回执判断。`);
        if(base.creditPolicy)parts.push(`  赊账条件：未还合计最多${base.creditPolicy.limitCopper}铜，最长${base.creditPolicy.maximumMinutes}分钟，信任至少${base.creditPolicy.minimumTrust}，逾期需先还清。`);
    }
    const learned=Object.keys(s.spells??{}).map(id=>engine.byId.get(id)).filter(Boolean);
    if(weather&&/天气|雨|雪|雾|日出|日落|天亮|天黑|湿度|启程|赶路/.test(query))parts.push(`【天气与昼长】${weather.name}，${weather.indoors?'室内':'户外'}；日出${weather.sunrise}，日落${weather.sunset}；湿度${weather.humidityPercent}%${weather.boatClosed?'；船路暂停通行':''}`);
    parts.push(`【已学法术】共${learned.length}：${learned.slice(0,8).map(row=>`${row.name}（${row.id}，魔力${row.mp}）`).join('；')||'无'}`);
    const obligations=Object.values(s.obligations??{}).filter(o=>[o.promisor,o.promisee].includes('player')&&!['已完成','取消'].includes(o.status));
    const quests=Object.values(s.quests??{}).filter(q=>[q.publisher,q.taker].includes('player')&&!['已完成','取消','失败','超期'].includes(q.status)||q.status==='公开'&&q.location===s.location);
    if(obligations.length||quests.length)parts.push('【进行中】',...[...obligations,...quests].slice(0,8).map(o=>`${text(o.content??o.name,180)}｜${o.status??''}${o.deadline?`｜期限${engine.calendar(o.deadline).text}`:''}`));
    const contracts=Object.entries(s.records??{}).filter(([,row])=>row.category==='debt'&&row.debtor==='player'&&row.status!=='已还清'||row.category==='contract'&&row.room&&row.parties?.includes('player'));
    if(contracts.length)parts.push('【住宿与欠款】',...contracts.slice(-6).map(([id,row])=>row.category==='debt'?`${id}｜欠${name(row.creditor)} ${row.amount-row.paid}铜｜${row.status}｜到期${engine.calendar(row.deadline).text}`:`${row.name}｜${row.status}｜期限${engine.calendar(row.expires).text}`));
    const features=environmentCatalog(engine,document).entries;
    if(features.length)parts.push(`【可见环境】${features.slice(0,3).map(row=>`${row.name??name(row.id)}（${row.id}）${row.waterMl!==undefined?`，现有水${row.waterMl}毫升`:''}`).join('；')}`);
    const animals=petView(engine,document).presentAnimals;
    if(animals.length)parts.push(`【在场动物】${animals.slice(0,3).map(row=>`${row.name??row.id}（${row.id}）`).join('；')}`);
    const summons=summonView(engine,document);
    if(summons.length)parts.push(`【有效召唤契约】${summons.slice(0,3).map(row=>`${row.name}（${row.id}），期限${engine.calendar(row.expires).text}，每${row.terms.upkeepMinutes}分维持消耗${row.terms.upkeepMp}魔力`).join('；')}`);
    if(/农|田|粮|仓|作物|收成|种子|害兽/.test(query)){
        const farm=agricultureView(engine,document);
        if(farm)parts.push(`【本地农事】${name(farm.settlement)}｜${farm.mode}${farm.food!==undefined?`｜存粮${farm.food}，种粮${farm.seed}，可收面积${farm.field.readyHa}公顷`:''}`);
    }
    const pinned=Object.values(document.memories??{}).filter(m=>m.pinned).slice(0,engine.rules.prompt.pinnedLimit);
    if(pinned.length)parts.push('【固定事实，供主持核对，不代表人物知情】',...pinned.map(m=>`${name(m.subject)}：${text(m.content,180)}`));
    if(index){
        if(index.chronicle){
            const budget=Math.max(0,Math.min(1200,Math.min(6000,engine.rules.prompt.dynamicMaximumCharacters)-parts.join('\n').length-100));
            const history=chronicleContext(index.chronicle,{query,entities:engine.entities,location:s.location,participants:present.slice(0,8).map(([id])=>id),budgetChars:budget,index});
            if(history.entries.length)parts.push('【历史摘要，低于当前状态与原始事件；不代表人物知情】',...history.entries.map(row=>`${engine.calendar(row.from).text}：${row.text}`));
        }
        const old=index.search(query,{now:s.minute,scope:s.location,present:present.slice(0,8).map(([id])=>id),limit:4});
        if(old.length)parts.push('【相关旧事，检索线索不代表在场人物知情】',...old.map(m=>`${m.source??'记忆'}${m.minute!==undefined?`，${engine.calendar(m.minute).text}`:''}：${text(m.text,260)}`));
    }
    return parts.join('\n').slice(0,Math.min(6000,engine.rules.prompt.dynamicMaximumCharacters));
}
