// Shared by the browser tool and the real-model scenario runner.
const sections={
    player:['玩家','角色','属性'],inventory:['行囊','背包'],npcs:['人物','居民','NPC'],
    skills:['技能'],spells:['法术','法术书'],professions:['职业'],pets:['宠物'],
    obligations:['约定','承诺','义务'],quests:['任务','任务日志'],records:['记录','契约'],
    settlements:['聚落'],buildings:['建筑'],projects:['工程','研究'],effects:['效果','状态效果'],
    weather:['天气'],recipes:['配方'],learning:['学习记录'],careers:['升职记录'],discoveries:['发现'],
    revivalPoints:['复活点'],
    itemInstances:['单件物品'],crafted:['制造记录'],
};
const aliases=new Map(Object.entries(sections).flatMap(([key,names])=>[key,...names].map(name=>[name,key])));
export function readStateSection(state,section){
    if(section===undefined||section==='')return{player:{...state.player,id:'player'},location:state.location};
    const key=typeof section==='string'?aliases.get(section.trim()):undefined;
    if(!key)return{ok:false,error:'未知状态栏目。可读取：玩家、行囊、人物、技能、法术书、职业、约定、任务、聚落、工程、配方。'};
    // Optional partitions may not exist in older campaigns; an empty object is
    // a valid result, never an undefined tool message.
    let result=key==='player'?{...state.player,id:'player'}:state[key]??{};
    if(key==='records')result=Object.fromEntries(Object.entries(result).filter(([,row])=>!['ecology','lair','wildlifeMigration'].includes(row?.category)).map(([id,row])=>{
        if(row?.category==='legal_case'){
            const{evidence,...view}=row;return[id,{...view,note:'证据与见证者认知通过在场报案和审理查证，不由全局记录直接透露'}];
        }
        if(row?.category!=='physical_feature')return[id,row];
        const publicState=Object.fromEntries(Object.entries(row.state??{}).filter(([name])=>!['toxinUg','saltMg','pathogenRisk'].includes(name)));
        return[id,{...row,state:publicState,waterSafety:'毒素和病原尚未检验'}];
    }));
    if(key==='npcs')result=Object.fromEntries(Object.entries(result).map(([id,row])=>{
        const{legalKnowledge,memoryStream,cognition,autonomy,goals,relationships,developments,...view}=row;return[id,view];
    }));
    if(JSON.stringify(result).length>8000)return{ok:false,error:'该栏目超过单次读取上限，请通过检索查看具体人物或记录。'};
    return result;
}
