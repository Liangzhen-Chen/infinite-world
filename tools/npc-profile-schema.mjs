const text={type:'string',minLength:1},integer=(min,max)=>({type:'integer',minimum:min,...(max===undefined?{}:{maximum:max})});
const list=(items,minItems=0)=>({type:'array',items,minItems});
const texts=(n=1)=>list(text,n),object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:true});
const sentiment={type:'number',minimum:-100,maximum:100};
const goal=object({id:text,content:text,progress:{type:'number',minimum:0,maximum:100},deadlineDay:integer(0),resources:list(object({kind:text,description:text})),steps:list(object({content:text,status:text}),1)});
export const npcProfileSchema=object({
 tier:{const:'full'},aliases:texts(0),occupation:text,intelligence:object({level:integer(1,5),growth:integer(0)}),sex:text,birth:object({year:{type:'integer'},month:integer(1,12),day:integer(1,30)}),culture:text,household:{...texts(0),uniqueItems:true},familyNotes:text,
 appearance:{...texts(3),maxItems:5},voice:object({register:text,accent:text,habits:texts(),samples:texts(3)}),
 personality:object({traits:texts(2),values:texts(),flaws:texts()}),
 proficiencies:{type:'object',additionalProperties:integer(0,2699)},professions:{...texts(0),uniqueItems:true},level:integer(0),combat:{type:['object','null']},
 wealth:object({cashRange:{...list(integer(0),2),maxItems:2},property:texts(0),valuables:list({}),debts:list({})}),
 home:object({location:text,access:text,ownership:text}),workplace:object({location:text,access:text}),
 schedule:{$ref:'#/$defs/npcScheduleFull'},
 relationships:list(object({with:text,type:text,trust:sentiment,affection:sentiment,note:text}),3),
 memorySeeds:list(object({id:text,event:text,salience:integer(1,5),knownBy:texts(1),reliability:text}),2),
 goals:object({short:list(goal,1),mid:list(goal,1),long:list(goal,1)}),fears:texts(),redLines:texts(),
 secrets:list(object({content:text,knownBy:texts(1)}),1),knowledge:object({known:list(object({fact:text,reliability:text,source:text}),1),unknown:texts()}),
 opinions:object({factions:text,magic:text,adventurers:text,neighbors:list(object({with:text,view:text}))}),
 towardPlayer:object({baseline:object({trust:sentiment,affection:sentiment}),raises:texts(),lowers:texts(),attitude:text}),
 behaviorRules:object({bargaining:text,honesty:text,risk:text,threatResponse:text,bribeResponse:text}),
 serviceCatalog:list(object({kind:{enum:['trade','teach']},what:text,price:{type:'object'},unlocksService:{const:false}})),
 hooks:texts(0),ttsVoice:text,portraitPrompt:text,description:text
});
export function installNpcProfileSchema(schema){
 const npc=schema.$defs.npc;
 schema.$defs.npcScheduleFull={...structuredClone(npc.properties.schedule),required:['default','market','rest','restDays','seasonal']};
 schema.$defs.npcProfile=structuredClone(npcProfileSchema);
 npc.properties.tier={enum:['full','roster']};
 npc.allOf=[...(npc.allOf??[]).filter(x=>x.then?.$ref!=='#/$defs/npcProfile'),{if:{properties:{tier:{const:'full'}},required:['tier']},then:{$ref:'#/$defs/npcProfile'}}];
 return schema;
}
