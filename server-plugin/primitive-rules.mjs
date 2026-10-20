// Archived named rule programs. This is the executable catalog consumed by
// schedule(rule); a proposal can name a program but cannot provide its body.
import {schemaValidator} from './primitive-schema.mjs';
import {reject} from './primitive-policy.mjs';
export function primitiveRuleRegistry(world){
 const snapshot=world.primitiveRules??{format:1,rules:[]};
 if(snapshot.format!==1||!Array.isArray(snapshot.rules))reject('E-RULE-REGISTRY','Invalid archived rule programs');
 const valid=schemaValidator('rule'),byId=new Map();
 for(const rule of snapshot.rules){
  if(!valid(rule))reject('E-RULE-REGISTRY',`${rule?.id??'rule'}: ${valid.errors[0].instancePath} ${valid.errors[0].message}`);
  if(byId.has(rule.id))reject('E-RULE-REGISTRY',`Duplicate rule program: ${rule.id}`);
  byId.set(rule.id,rule);
 }
 return {actions:snapshot.rules,byId,errors:[]};
}
