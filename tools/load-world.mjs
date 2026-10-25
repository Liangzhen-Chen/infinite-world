import fs from 'node:fs/promises';
import {worldActions} from '../server-plugin/action-affordances.mjs';
import {registerIntentMenu} from '../server-plugin/action-constructor.mjs';
registerIntentMenu(worldActions);
import {primitiveRuleRegistry} from '../server-plugin/primitive-rules.mjs';
import path from 'node:path';
import {materializeWildlifeHabitats} from '../server-plugin/wildlife-habitats.mjs';
import {materializeFaithClocks} from '../server-plugin/faction-clock.mjs';
import {requireBalanceTables} from './balance-tables.mjs';
import {loadActionRegistry} from '../server-plugin/action-registry.mjs';
import {validateDomainRules} from '../server-plugin/domain-rules.mjs';
import {validateNormBindings} from '../server-plugin/norm-stack.mjs';
import {loadDerivedRegistry} from '../server-plugin/derived.mjs';
// Everything this loader derives (reverse relations, biome tags, habitats, faith
// competition clocks) is idempotent: files written back from a loaded world
// (publication previews, upgrade fixtures) reload to the same world.
export async function loadWorld(root = path.resolve(import.meta.dirname, '..', 'world')) {
    const read = async file => JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));
    const optional=async file=>{try{return await read(file);}catch(error){if(error.code==='ENOENT')return [];throw error;}};
    const [rules,npcs,locations,routes,items,professions,skills,spells] = await Promise.all([
        read('meta/rules.json'),read('people/baseline.json'),read('geo/locations.json'),read('geo/routes.json'),read('meta/items.json'),read('meta/professions.json'),read('meta/skills.json'),read('meta/spells.json')]);
    const [recipes,monsters,bosses]=await Promise.all(['recipes','monsters','bosses'].map(name=>optional(`meta/${name}.json`)));
    const [autonomyCandidates,bargaining]=await Promise.all([optional('autonomy/candidates.json'),optional('rules/tables/bargaining.json')]);
    if(bargaining.length)rules.bargaining=bargaining;
    const [cultures,deities,factions,history,factionPeople,eras,festivals,rumors]=await Promise.all(['cultures','deities','factions','history','factionPeople','eras','festivals','rumors'].map(name=>optional(`lore/${name}.json`)));
    // W5: reviewed faction rows stay untouched on disk. Explicit reverse
    // bindings reuse the source relation's score and reason at load time.
    const reverseRelations=await optional('lore/faction-relations.json');
    for(const {target,source} of reverseRelations){
        const f=factions.find(f=>f.id===target),s=factions.find(f=>f.id===source),r=s?.relations?.find(r=>r.faction===target);
        // A binding whose faction is not in this world edition (a fixture rebuilt
        // without a later batch) is not part of it; two present factions without
        // the source relation are a real data fault.
        if(!f||!s)continue;
        if(!r)throw new Error(`反向关系缺原条目：${source}->${target}`);
        if((f.relations??[]).some(r=>r.faction===source))continue;
        rules.factionRelations??={};
        // A rules file written from a loaded world already carries the binding;
        // the current source relation still wins over that saved copy.
        const rows=rules.factionRelations[target]??=[],at=rows.findIndex(x=>x.faction===source),row={...r,faction:source};
        if(at<0)rows.push(row);else rows[at]=row;
    }
    const [residents,households,settlementProfiles,regions]=await Promise.all([optional('people/residents.json'),optional('people/households.json'),optional('geo/settlements.json'),optional('geo/regions.json')]);
    const careers=await optional('meta/careers.json');
    const faith=await optional('lore/faith.json');if(!Array.isArray(faith))rules.faith=faith;
    const sovereignty=await optional('lore/sovereignty.json');if(!Array.isArray(sovereignty))rules.governance.sovereignty=sovereignty;
    const familyLaw=await optional('lore/family-law.json');if(!Array.isArray(familyLaw))rules.law.family=familyLaw;
    // Bindings are archived with the campaign's rules. Historical editions with
    // no binding file keep their original shape.
    const lawBindings=await optional('law/bindings.json');
    if(!Array.isArray(lawBindings))throw Error('E-NORM-BINDING: law/bindings.json must be an array');
    if(lawBindings.length){
        if(rules.law.bindings&&JSON.stringify(rules.law.bindings)!==JSON.stringify(lawBindings))throw Error('E-NORM-BINDING: rules and law/bindings.json disagree');
        rules.law.bindings=lawBindings;
        // The archived edition, rather than a current loader default, owns the
        // semantics. Old campaign worlds have no bindings/version marker.
        rules.law.normStackVersion=1;
    }
    // D1: biome tags and areas live in geo/biomes.json (kept apart from the
    // locations file); they are merged into their locations here for K8.
    const biomes=await optional('geo/biomes.json');
    for(const [id,row] of Object.entries(biomes.locations??{})){
        // A row for a location this world edition does not carry (a fixture rebuilt
        // without a later batch) is not part of it; the formal catalogue's tags
        // are checked against its locations by the publication tools' release run.
        const place=locations.find(l=>l.id===id);if(!place)continue;
        // A locations file written from a loaded world carries exactly these
        // merged values; only a differing authored copy is a second source.
        for(const key of Object.keys(row))if(place[key]!==undefined&&JSON.stringify(place[key])!==JSON.stringify(row[key]))throw new Error(`群落数据与地点自带字段重复：${id}`);
        Object.assign(place,row);
    }
    // K8 habitats derived from those tags are part of the loaded world, so an
    // engine built on it re-derives the same rows and leaves the world unchanged.
    const world=materializeWildlifeHabitats({version:rules.version,rules,npcs,locations,routes,items,professions,skills,spells,recipes,monsters,bosses,cultures,deities,factions,history,factionPeople,eras,...(festivals.length?{festivals}:{}),...(rumors.length===0?{}:{rumors}),residents,households,settlementProfiles,...(regions.length?{regions}:{}),...(Array.isArray(careers)?{}:{careers})});
    const normErrors=validateNormBindings(world);if(normErrors.length)throw Error(normErrors.join('; '));
    if(autonomyCandidates.length)world.autonomy={candidates:autonomyCandidates};
    // Dialogue templates are pinned with the campaign world, including wording
    // persisted in a conversation. A later content update cannot alter replay.
    const templates={};
    async function dialogueFiles(dir,prefix=''){
        let entries;try{entries=await fs.readdir(dir,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return;throw error;}
        for(const entry of entries){const key=prefix+entry.name;if(entry.isDirectory())await dialogueFiles(path.join(dir,entry.name),key+'/');else if(entry.name.endsWith('.json'))templates[key]=JSON.parse(await fs.readFile(path.join(dir,entry.name),'utf8'));}
    }
    await dialogueFiles(path.join(root,'templates/dialogue'));if(Object.keys(templates).length)world.dialogueTemplates=templates;
    // RW-07 faith competition clocks likewise: derived from the church seats, replacing any saved faith:* rows.
    materializeFaithClocks({world,rules,byId:new Map([...locations,...deities].map(e=>[e.id,e]))});
    // S1 numeric parameter tables (rules/tables/balance): validated on every load (bounds, required fields,
    // basis); a bad table stops the load and names file and field. Attached as a non-enumerable property so the
    // world's serialized form, hash and clones are unchanged; consumers read world.balance (tables by name).
    Object.defineProperty(world,'balance',{value:requireBalanceTables(root),enumerable:false,writable:true,configurable:true});
    // These tables/templates become serialized only for editions with primitive
    // programs. Legacy hashes and archived reducers retain their original shape.
    let narrativeTemplates=[];
    try{narrativeTemplates=JSON.parse(await fs.readFile(path.join(root,'ontology/entity-templates.json'),'utf8')).entries.flatMap(e=>e.narrative??[]);}catch(error){if(error.code!=='ENOENT')throw error;}
    let primitiveFacts={};
    try{primitiveFacts=JSON.parse(await fs.readFile(path.join(root,'ontology/primitives.json'),'utf8')).entries.find(e=>e.id==='fact.set')?.writable??{};}catch(error){if(error.code!=='ENOENT')throw error;}
    const primitiveAssets={primitiveTemplates:narrativeTemplates,primitiveFacts,primitiveTables:Object.fromEntries(['body','learning','action-costs','yields'].map(name=>[name,world.balance[name]]))};
    for(const [key,file] of Object.entries({openActionRules:'rules/tables/open-actions.json',openTagging:'rules/open-tagging.json',openReactions:'rules/open-reactions.json',domainRules:'rules/tables/domain-rules.json'})){
        try{world[key]=await read(file);}catch(error){if(error.code!=='ENOENT')throw error;}
    }
    validateDomainRules(world);
    const slots=await optional('ontology/slots/core.json'),derivations=await optional('rules/derivations.json');
    world.derived={slots:[...slots.slots??[],...derivations.slots??[]],modifiers:derivations.modifiers??[],conduction:slots.conduction??{}};
    loadDerivedRegistry(world);
    try{
        await fs.access(path.join(root,'actions'));
        const registry=loadActionRegistry(path.join(root,'actions'));
        if(registry.errors.length)throw Error(registry.errors.join('; '));
        // Historical legacy editions do not acquire a new serialized field.
        // Once programs/patches exist their exact definitions belong to the
        // archived world, just like recipes and dialogue templates.
        if(registry.actions.some(a=>a.outcomes||a.preconditions?.some(p=>p?.source)||a.consent?.scope?.some?.(p=>p?.source)))world.actionDefinitions={format:1,actions:registry.actions};
    }catch(error){if(error.code!=='ENOENT')throw error;}
    try{
        world.primitiveRules=JSON.parse(await fs.readFile(path.join(root,'rules/programs.json'),'utf8'));
        primitiveRuleRegistry(world);
    }catch(error){if(error.code!=='ENOENT')throw error;}
    for(const [name,value] of Object.entries(primitiveAssets))Object.defineProperty(world,name,{value,enumerable:Boolean(world.actionDefinitions)||Boolean(world.primitiveRules),writable:true,configurable:true});
    return world;
}

// The on-disk shape of meta/rules.json: without what loadWorld attaches from the
// lore files (faith, sovereignty, family law, reverse faction relations) or
// derives (K8 habitats, faith competition clocks). A publication tool that
// rewrites the whole rules file compares and writes this projection, never the
// attachments.
export function authoredRules(rules){
    const out={...rules};
    delete out.faith;delete out.factionRelations;delete out.bargaining;
    if(out.wildlife?.habitats?.some(h=>h.derived))out.wildlife={...out.wildlife,habitats:out.wildlife.habitats.filter(h=>!h.derived)};
    if(out.governance?.sovereignty!==undefined){out.governance={...out.governance};delete out.governance.sovereignty;}
    if(out.law?.family!==undefined){out.law={...out.law};delete out.law.family;}
    if(out.law?.bindings!==undefined){out.law={...out.law};delete out.law.bindings;delete out.law.normStackVersion;}
    if(out.factionClock){
        const clocks=out.factionClock.clocks.filter(c=>!String(c.id).startsWith('faith:'));
        if(clocks.length===out.factionClock.clocks.length){/* no derived rows */}
        else if(clocks.length)out.factionClock={...out.factionClock,clocks};
        else delete out.factionClock;
    }
    return out;
}
