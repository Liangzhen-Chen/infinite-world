import fs from 'node:fs/promises';
import {localWeather} from './weather.mjs';

export function overview(engine,document){
    const s=document.state,p=s.player,path=[],seen=new Set();let place=engine.byId.get(s.location);
    while(place&&!seen.has(place.id)){seen.add(place.id);path.unshift(place.name);place=engine.byId.get(place.parent);}
    const weather=localWeather(engine,document),date=engine.calendar(s.minute);
    // Being in the catalogue or an NPC's private memories does not reveal a name.
    const encountered=new Set(Object.values(s.turns??{}).flatMap(turn=>turn.present??[]));
    for(const row of Object.values(s.records??{})){
        if(row.parties?.includes('player'))for(const id of row.parties)encountered.add(id);
        if(row.debtor==='player')encountered.add(row.creditor);
    }
    for(const row of Object.values(s.obligations??{})){
        if(row.promisor==='player')encountered.add(row.promisee);
        if(row.promisee==='player')encountered.add(row.promisor);
    }
    const companions=(p.companions??[]).map(id=>({name:encountered.has(id)?engine.byId.get(id)?.name??'未识别同行者':'未识别同行者'}));
    const effects=Object.values(s.effects??{}).filter(row=>row.expires>s.minute&&
        (row.target==='player'||row.owner==='player'||s.inventory?.[row.target]))
        .map(row=>({name:engine.byId.get(row.spell)?.name??'持续效果',remainingMinutes:row.expires-s.minute}));
    return {date:{...date,period:['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'][Math.floor((date.hour+1)%24/2)]+'时',daylight:weather?.daylight??(date.hour>=6&&date.hour<18)},
        weather:weather?{name:weather.name,temperatureC:weather.temperatureC,indoors:weather.indoors}:null,
        locationPath:path,player:{name:p.name,level:p.level,coins:p.coins,hp:p.hp,maxHp:p.maxHp,mp:p.mp,maxMp:p.maxMp,status:p.status},effects,companions,
        qualities:engine.rules.equipment.qualities.map((name,index)=>({name,color:engine.rules.equipment.colors[index]}))};
}

export function registerUIRoutes({post,readCampaign}){
    post('/ui/overview',async req=>{const {engine,document,reference}=await readCampaign(req);return {reference,...overview(engine,document)};});
    // Browser modules are shipped beside runtime.js; no runtime edit is needed.
    post('/ui/modules',async()=>({modules:(await fs.readdir(new URL('../extension/',import.meta.url)))
        .filter(name=>/^ui-.*\.mjs$/.test(name)&&!['ui-shell.mjs','ui-settings.mjs'].includes(name)).sort()}));
}
