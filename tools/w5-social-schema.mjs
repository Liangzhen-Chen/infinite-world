// Candidate-only schema. The main loader/schema stays untouched until the
// hosting agent implements explicit roster and private-knowledge handling.
const text={type:'string',minLength:1};
const strings={type:'array',items:text,minItems:1,uniqueItems:true};
const integer=(minimum,maximum)=>({type:'integer',...(minimum===undefined?{}:{minimum}),...(maximum===undefined?{}:{maximum})});
const obj=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const common={id:text,name:text,aliases:{type:'array',items:text},category:text,scope:text,references:strings,description:text};
const prose=keys=>obj(Object.fromEntries(keys.map(key=>[key,text])));
export const factionSchema=obj({...common,kind:text,culture:text,region:text,contactAnchor:text,contactMode:text,foundedYear:integer(undefined,-1),leader:text,coreMembers:strings,
 resources:obj({treasuryCopper:integer(0),memberCount:integer(2),assets:text,resourceScope:text}),publicGoal:text,privateGoal:text,method:text,divisions:{...strings,minItems:2},offers:text,demands:text,
 reputation:obj({trusted:obj({minimum:integer(-100,100),response:text}),neutral:obj({minimum:integer(-100,100),response:text}),distrusted:obj({maximum:integer(-100,100),response:text})}),
 relations:{type:'array',minItems:1,items:obj({faction:text,score:integer(-100,100),reason:text})},
 clock:obj({id:text,name:text,intervalDays:integer(1),probability:{type:'number',exclusiveMinimum:0,maximum:1},initialStage:integer(0,0),trigger:text,stageEffects:{type:'array',minItems:3,items:obj({stage:integer(1),effect:text,requires:text})},counterplay:text,execution:text}),
 prose:prose(['conduct','internalLife','playerEncounter']),publicDescription:text,descriptionVisibility:{const:'gm_private'},
});
// Runtime parameters are optional until B4/B5 publish them. Their references,
// costs and effect consumers are checked by the faction-clock responsibility.
factionSchema.properties.resources.properties.items={type:'object',additionalProperties:integer(0)};
Object.assign(factionSchema.properties.clock.properties,{settlement:text,source:text,cycle:{enum:['once','year']},
 stages:{type:'array',minItems:1,items:{type:'object'}},contact:{type:'object'},interventions:{type:'array',items:{type:'object'}}});
export const historySchema=obj({...common,year:integer(undefined,-1),dateLabel:text,calendar:text,era:text,region:text,culture:text,contactAnchor:text,locationPrecision:text,
 participants:{type:'array',minItems:1,items:obj({kind:{const:'event_local_collective'},name:text,id:text,lifetime:text})},occurrence:text,
 presentTrace:obj({entity:text,fact:text,type:{const:'institutional_practice'},evidenceAccess:text}),
 accounts:obj({verified:obj({source:text,claim:text}),received:obj({truth:{const:'partial_or_false'},source:text,falseClaim:text,correction:text})}),prose:prose(['trueAccount','receivedAccount','presentTrace']),
});
export const rosterSchema=obj({id:text,name:text,aliases:{type:'array',items:text},category:{const:'npc_roster'},detailLevel:{const:'roster'},scope:text,age:integer(18,300),flags:obj({minor:{const:false},romanceable:{const:false}}),culture:text,household:text,occupation:text,traits:{...strings,minItems:2},concern:text,visibleFeature:text,region:text,location:{type:['string','null']},availability:text,faction:text});
export default {$schema:'http://json-schema.org/draft-07/schema#',...obj({factions:{type:'array',minItems:40,items:factionSchema},history:{type:'array',minItems:80,items:historySchema},factionPeople:{type:'array',minItems:80,items:rosterSchema},eras:{type:'array',minItems:1,items:obj({id:text,name:text,start:integer(),end:integer()})}})};
