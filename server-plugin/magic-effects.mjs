import {preconditionFailure} from './precondition.mjs';
// Spell effect registry. Each effect family registers the effectSpec.kind values
// it owns from its own module, so a new kind needs no branch in magic.mjs:
//   registerMagicEffect({kinds, fields?, validateSpec?, validate?, prepare?, apply?, expire?})
// fields: effectSpec parameters accepted besides kind and power (used by
//   validateEffectSpec when the kind is not one of the primitive kinds).
// validateSpec(catalog): replaces the primitive effectSpec check.
// validate(catalog): extra catalog checks after the shared targeting checks.
// prepare(d,catalog,args,context) / apply(d,prepared,eventId): called with the engine as `this`.
// expire(d,effectId,minute): return true after domain cleanup and removal;
// otherwise the scheduler removes the expired effect itself.
// This module has no imports, so families in import cycles can register at load.
const effects=new Map();
export function registerMagicEffect(handler){
    const kinds=handler?.kinds;
    if(!Array.isArray(kinds)||!kinds.length||kinds.some(k=>typeof k!=='string'||!k))throw preconditionFailure('法术效果登记须列出 kinds');
    for(const k of ['validateSpec','validate','prepare','apply','expire'])if(handler[k]!==undefined&&typeof handler[k]!=='function')throw preconditionFailure(`法术效果 ${kinds[0]} 的 ${k} 不是函数`);
    if(handler.fields!==undefined&&!Array.isArray(handler.fields))throw preconditionFailure(`法术效果 ${kinds[0]} 的 fields 须是数组`);
    for(const kind of kinds){if(effects.has(kind))throw preconditionFailure(`法术效果重复登记：${kind}`);effects.set(kind,handler);}
    return()=>{for(const kind of kinds)if(effects.get(kind)===handler)effects.delete(kind);};
}
export const magicEffect=kind=>effects.get(kind)??null;
export const magicEffectKinds=()=>[...effects.keys()].sort();
