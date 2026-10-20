// Shared structural contracts. Semantic authority, bounds and current-state
// checks remain in the primitive protocols; schemas cannot confer capabilities.
import Ajv from 'ajv';
const string={type:'string',minLength:1},integer={type:'integer'},object={type:'object'},array={type:'array'};
const slot={type:'object',required:['slot'],properties:{slot:string},additionalProperties:false};
const ops=['transfer','holding.open','holding.close','holding.transfer','holding.rescale','obligation.create','obligation.settle','obligation.cancel','fact.set','vital','status','move','create','destroy','emit','schedule','transition','learn','time'];
const primitiveProperties={
 op:{enum:ops},actor:string,resource:string,from:string,to:string,qty:integer,lot:{},
 holdingKind:string,holder:string,newHolder:string,subject:string,terms:{type:['object','null']},variant:{type:['string','null']},holding:string,id:string,reason:string,shares:{type:'object',additionalProperties:{type:'number'}},
 obligationKind:string,debtor:string,creditor:string,amount:integer,deadline:integer,payer:string,with:{},
 entity:string,field:string,value:{},delta:{type:'number'},target:string,type:string,status:string,duration:integer,magnitude:integer,mode:string,mount:string,
 kind:string,template:string,facts:object,tags:{type:'array',items:string},materials:array,population:string,verb:string,payload:object,visibility:{enum:['public','private','witnessed']},
 at:integer,action:string,rule:string,args:object,cause:string,learningSource:string,minutes:integer
};
const required={
 transfer:['from','to','qty'],'holding.open':['holdingKind','holder','subject'],'holding.close':[],'holding.transfer':[],'holding.rescale':['holdingKind','subject','shares'],
 'obligation.create':['id','obligationKind','debtor','creditor'],'obligation.settle':['id'],'obligation.cancel':['id'],
 'fact.set':['entity','field'],vital:['target','delta'],status:['target','status','duration','magnitude'],move:['to'],create:['kind','facts'],destroy:['entity'],
 emit:['verb','visibility'],schedule:['at'],transition:['entity','kind','cause'],learn:['subject','learningSource'],time:['minutes']
};
function primitive(template=false){
 const properties=Object.fromEntries(Object.entries(primitiveProperties).map(([key,schema])=>[key,template&&key!=='op'?{anyOf:[schema,slot]}:schema]));
 return {type:'object',required:['op'],properties,additionalProperties:false,allOf:[
  ...Object.entries(required).map(([op,fields])=>({if:{properties:{op:{const:op}}},then:{required:fields}})),
  {if:{properties:{op:{enum:['holding.close','holding.transfer']}}},then:{anyOf:[{required:['holding']},{required:['id']}]}},
  {if:{properties:{op:{const:'holding.transfer'}}},then:{anyOf:[{required:['newHolder']},{required:['holder']}]}},
  {if:{properties:{op:{const:'fact.set'}}},then:{oneOf:[{required:['value']},{required:['delta']}]}}
  ,{if:{properties:{op:{const:'schedule'}}},then:{oneOf:[{required:['action']},{required:['rule']}]}}
  ,{if:{properties:{op:{const:'create'},kind:{not:{const:'mark'}}}},then:{required:['template']}}
 ]};
}
const primitiveList={type:'array',maxItems:64,items:{$ref:'#/$defs/primitiveTemplate'}};
const rxNumber={anyOf:[{type:'number'},string]};
export const actionSchema={
 $schema:'http://json-schema.org/draft-07/schema#',$id:'action.schema.json',$ref:'#/$defs/definition',
 $defs:{
  primitive:primitive(),primitiveTemplate:primitive(true),
  definition:{
   type:'object',required:['id','label','narration','slots','synonyms','visibility'],
   properties:{
    id:{type:'string',pattern:'^[a-z][a-z0-9_-]*:[a-z][a-z0-9_.-]*$'},label:string,narration:string,verb:string,group:string,pack:{type:['string','null']},source:string,namespace:string,
    canonical:string,readOnly:{type:'boolean'},hint:string,call:{type:['object','null'],required:['tool'],properties:{tool:string,operation:string,fixed:object},additionalProperties:false},projection:string,
    slots:{type:'array',items:{type:'object',required:['name','kind'],properties:{name:string,kind:string,schema:{},entity:string,required:{type:'boolean'},consent:{type:'boolean'},min:rxNumber,max:rxNumber,options:{},filter:string},additionalProperties:true}},
    synonyms:{type:'array',items:string},visibility:{type:'object',required:['catalog'],properties:{catalog:{enum:['quick','here','target:npc','target:place','target:item','search','llm']},witness:{enum:['public','private','witnessed','present']}}},
    preconditions:{type:'array',items:{anyOf:[string,{type:'object',required:['value'],properties:{value:string,source:string,reason:string},additionalProperties:false}]}},
    consent:{type:'object',properties:{from:string,slot:string,scope:{anyOf:[string,{type:'array',items:{anyOf:[string,{type:'object',required:['value','source','reason'],properties:{value:string,source:string,reason:string},additionalProperties:false}]}}]},onRefusal:{enum:['contest','abort']},derive:{type:'boolean'},decide:string,until:{}}},
    cost:{type:'object',properties:{owner:{enum:['primitives','handler']},time:rxNumber,body:{type:'object',properties:{stamina:rxNumber,satiety:rxNumber,hydration:rxNumber,fatigue:rxNumber},additionalProperties:false},resources:{type:'array',items:{type:'object',required:['resource'],properties:{resource:string,qty:rxNumber,amount:rxNumber},additionalProperties:false}}},additionalProperties:false},
    check:{anyOf:[{type:'null'},{const:'engine'},object]},theft:{type:'boolean'},rite:object,activity:{enum:['rest','light','heavy','travel']},rangeMeters:{type:'number',minimum:0},durationSlot:{anyOf:[string,{type:'object',properties:{slot:string,name:string,min:integer,max:integer}}]},
    signature:{anyOf:[{type:'array',items:string},object]},
    outcomes:{anyOf:[primitiveList,{type:'object',minProperties:1,properties:Object.fromEntries(['accepted','conditional','refused','fumble','failure','partial','success','critical'].map(k=>[k,primitiveList])),additionalProperties:false}]},
    patchable:{type:'object',properties:{preconditions:{enum:['append',false]},'consent.scope':{enum:['append',false]}},additionalProperties:false},reserved:{anyOf:[{type:'boolean'},{type:'array',items:string}]},
    ui:object,autonomy:object,satisfies:array,participants:object
   },
   anyOf:[{required:['call'],properties:{call:{type:'object'}}},{required:['projection']},{required:['outcomes']}],additionalProperties:false,
   allOf:[{if:{required:['outcomes']},then:{properties:{check:{anyOf:[{type:'null'},object]},cost:{required:['owner'],properties:{owner:{const:'primitives'}}}}}}]
  },
  proposal:{type:'object',required:['intent','effects'],properties:{intent:{type:'string',minLength:1,maxLength:4000},participants:object,effects:{type:'array',maxItems:64,items:{$ref:'#/$defs/primitive'}},means:object,context:object},additionalProperties:false},
  receipt:{type:'object',required:['eventId','routed','candidates','applied','trimmed','check','consequences','narrate','alternatives','fallback','status'],properties:{
   eventId:string,actor:string,source:{type:'object',required:['kind','id'],properties:{kind:{enum:['catalog','open','rule']},id:string}},routed:{type:['string','null']},candidates:array,
   applied:{type:'array',items:{type:'object',required:['index','op','result','tags'],properties:{index:{type:'integer',minimum:0},op:{enum:ops},tags:{type:'array',items:{type:'string'}}}}},trimmed:array,check:{type:['object','null']},consequences:array,
   narrate:{type:'object',required:['must','mustNot'],properties:{must:array,mustNot:array}},alternatives:array,fallback:{},status:{enum:['ready','preview','committed','pending','rejected']},signature:{type:'array',items:string},pending:{type:'string'},duplicate:{type:'boolean'},reason:{},code:string,cost:object,consent:object,decisions:array,outcome:string
  },additionalProperties:false}
 }
};
const compiled=new Map();
// Rule programs use the same interpreter and bounds, with no public UI/call
// obligation. They are archived world data, never client-supplied programs.
actionSchema.$defs.rule={...actionSchema.$defs.definition,required:['id','slots','cost','outcomes'],anyOf:[{required:['outcomes']}],properties:Object.fromEntries(Object.entries(actionSchema.$defs.definition.properties).filter(([key])=>!['call','projection','theft','rite'].includes(key)))};
export function schemaValidator(kind){
 if(!compiled.has(kind)){
  if(!Object.hasOwn(actionSchema.$defs,kind))throw Error(`Unknown action schema: ${kind}`);
  compiled.set(kind,new Ajv({allErrors:true,strict:false}).compile({...actionSchema,$ref:`#/$defs/${kind}`}));
 }
 return compiled.get(kind);
}
