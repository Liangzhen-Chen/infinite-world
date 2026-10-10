import {environmentCatalog} from './environment.mjs';
import {petView} from './pets.mjs';
import {summonView} from './summons.mjs';
import {localWeather} from './weather.mjs';
import {agricultureView} from './agriculture.mjs';

const text=(value,limit=200)=>typeof value==='string'?value.replace(/\s+/g,' ').slice(0,limit):'';
const list=value=>Array.isArray(value)?value.map(row=>typeof row==='string'?row:row.content??row.description??'').filter(Boolean).join('；'):text(value);

export function sceneCard(engine,document,query='',index=null){
    const s=document.state,place=engine.byId.get(s.location),mentioned=engine.resolver.mentions(query,s.location);
    const name=id=>engine.byId.get(id)?.name??s.created?.[id]?.name??id;
    const present=Object.entries(s.npcs).filter(([,npc])=>npc.location===s.location)
        .sort(([a],[b])=>Number(mentioned.has(b))-Number(mentioned.has(a))||a.localeCompare(b));
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
    for(const [id,npc] of present.slice(0,engine.rules.prompt.npcLimit)){
        const base=engine.byId.get(id)??npc;
        const shared=Object.values(document.memories??{}).filter(m=>m.subject===id).slice(-2).map(m=>`${m.minute??''}分 ${text(m.content,140)}`);
        parts.push(`${base.name}（${id}）｜${base.occupation??''}，${base.age??''}岁｜此刻：${text(npc.activity)}\n  对你：信任${npc.trust??0} 亲近${npc.affection??0}｜你们之间：${shared.join('；')}\n  说话：${text(base.speakingStyle??base.voice)}｜挂心：${text(list(npc.goals??base.goals),130)}\n  TA不知道：${text(list(npc.unknownFacts??base.unknownFacts),160)}${base.notes?`\n  人物资料：${text(base.notes,180)}`:''}`);
    }
    const learned=Object.keys(s.spells??{}).map(id=>engine.byId.get(id)).filter(Boolean);
    if(weather&&/天气|雨|雪|雾|日出|日落|天亮|天黑|湿度|启程|赶路/.test(query))parts.push(`【天气与昼长】${weather.name}，${weather.indoors?'室内':'户外'}；日出${weather.sunrise}，日落${weather.sunset}；湿度${weather.humidityPercent}%${weather.boatClosed?'；船路暂停通行':''}`);
    parts.push(`【已学法术】共${learned.length}：${learned.slice(0,8).map(row=>`${row.name}（${row.id}，魔力${row.mp}）`).join('；')||'无'}`);
    const obligations=Object.values(s.obligations??{}).filter(o=>!['已完成','取消'].includes(o.status));
    const quests=Object.values(s.quests??{}).filter(q=>!['已完成','取消'].includes(q.status));
    if(obligations.length||quests.length)parts.push('【进行中】',...[...obligations,...quests].slice(0,8).map(o=>`${text(o.content??o.name,180)}｜${o.status??''}${o.deadline?`｜期限${engine.calendar(o.deadline).text}`:''}`));
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
    if(pinned.length)parts.push('【固定事实】',...pinned.map(m=>`${name(m.subject)}：${text(m.content,180)}`));
    if(index){
        const old=index.search(query,{now:s.minute,scope:s.location,present:present.slice(0,8).map(([id])=>id),limit:4});
        if(old.length)parts.push('【相关旧事】',...old.map(m=>`${m.source??'记忆'}${m.minute!==undefined?`，${engine.calendar(m.minute).text}`:''}：${text(m.text,260)}`));
    }
    return parts.join('\n').slice(0,Math.min(6000,engine.rules.prompt.dynamicMaximumCharacters));
}
