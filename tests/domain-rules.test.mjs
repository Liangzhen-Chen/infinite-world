import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWorld} from '../tools/load-world.mjs';
import {validateDomainRules,practicalKnowledgeRegistry,liquidItem,liquidPortionMl,languageId,isLanguage,mechanismRule,handRepairRefused,vocabulary} from '../server-plugin/domain-rules.mjs';

const world=await loadWorld();
const items=new Map(world.items.map(i=>[i.id,i]));
const engine={world,byId:items};
const broken=change=>{const copy=structuredClone(world.domainRules);change(copy);return {...world,domainRules:copy};};

test('the domain table loads with the world and drives its accessors', () => {
 assert.equal(mechanismRule(engine,'mechanical_lock').operation,'unlock');
 assert.deepEqual(practicalKnowledgeRegistry(engine).simple_tripwire_disassembly.mechanisms,['tripwire_falling_log']);
 assert.equal(liquidItem(engine,'water'),'item_water');
 assert.equal(liquidPortionMl(engine,'water'),250);
 assert.equal(languageId(engine,'river'),'lang:river');
 assert.equal(isLanguage(engine,'coast'),true);
 assert.equal(isLanguage(engine,'unknown'),false);
 assert.equal(handRepairRefused(engine,{scale:'whole_city_gate'}),true);
 assert.equal(handRepairRefused(engine,{material:'wood'}),false);
 assert.equal(vocabulary(engine,'law','receiveOperations','report'),'receive_report');
});

test('a world without the table has none of these facts instead of defaults', () => {
 const bare={world:{...world,domainRules:undefined}};
 assert.equal(mechanismRule(bare,'mechanical_lock'),null);
 assert.equal(liquidItem(bare,'water'),null);
 assert.equal(isLanguage(bare,'river'),false);
 assert.equal(isLanguage(bare,'lang:common'),true);
});

test('the world check rejects invalid use requirements and vocabulary references', () => {
 assert.doesNotThrow(()=>validateDomainRules(world));
 // Design 2.1/2.2: validate use requirements, never a particular tool ID or transit list.
 assert.throws(()=>validateDomainRules(broken(t=>{t.physicalMechanisms.mechanical_lock.requiresUse='';})),/requiresUse/);
 assert.throws(()=>validateDomainRules(broken(t=>{t.privateField.sowRequiresUse=null;})),/sowRequiresUse/);
 assert.equal(Object.hasOwn(world.domainRules,'map'),false);
 assert.throws(()=>validateDomainRules(broken(t=>{t.liquids.water.itemTag='no_such_tag';})),/恰好对应一件物品/);
 assert.throws(()=>validateDomainRules(broken(t=>{t.physicalMechanisms.mechanical_lock.operation='smash';})),/operation/);
 assert.throws(()=>validateDomainRules(broken(t=>{t.languages['lang:coast'].aliases.push('river');})),/别名重复/);
 assert.throws(()=>validateDomainRules(broken(t=>{t.vocabulary.law.caseHandlerOperation='';})),/为空/);
 assert.throws(()=>validateDomainRules(broken(t=>{t.surprise={};})),/未知分区/);
});
