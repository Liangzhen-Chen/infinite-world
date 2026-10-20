import {registerMagicEffect}from'./magic-effects.mjs';
import {declareLedgerWriter} from './ledger.mjs';
declareLedgerWriter('summons',{sinks:['sink:consume']});
import {prepareSummonWork,applySummonWork}from'./magic-ritual.mjs';
import { servantCarryWater,environmentFeatures } from './environment.mjs';
import {applyProtectionPrimitive}from'./magic-primitives.mjs';
import{effectiveProficiency}from'./professions.mjs';
import {obligationRow,obligationView} from './obligation-state.mjs';
import {closeObligation,endSummonUpkeep} from './obligation-runtime.mjs';

export const summonTemplates=Object.freeze({
 dust_servant:{tasks:['clean'],maximumPower:100,maximumDuration:30,upkeepMp:1,upkeepMinutes:5,work:true},
 rubble_servant:{tasks:['carry_rubble'],maximumPower:2000,maximumDuration:60,upkeepMp:1,upkeepMinutes:5,work:true},
 paper_bird:{tasks:['carry_paper'],maximumPower:60,maximumDuration:60,upkeepMp:1,upkeepMinutes:5,work:true},
 water_cup:{tasks:['carry_water'],maximumPower:250,maximumDuration:30,upkeepMp:1,upkeepMinutes:5},
 fire_projection:{tasks:['illuminate'],maximumPower:1,maximumDuration:60,upkeepMp:1,upkeepMinutes:5},
 water_guard:{tasks:['guard'],maximumPower:20,maximumDuration:60,upkeepMp:2,upkeepMinutes:5,waterOnly:true},
 elemental_guard:{tasks:['guard'],maximumPower:40,maximumDuration:120,upkeepMp:3,upkeepMinutes:5},
});

export function validateSummonCatalog(catalog) {
    const spec = catalog.effectSpec, errors = [];
    if(spec?.kind==='summon_contract'){
      if(!['inspect','dismiss','extend'].includes(spec.operation))errors.push('召唤契约操作未接入');
      if(catalog.duration!==0)errors.push('契约操作本身不创建持续实体');
      if(spec.operation==='extend'&&(!Number.isSafeInteger(spec.power)||spec.power<1||spec.power>60||!spec.offering||Object.keys(spec.offering).some(k=>!['item','amount'].includes(k))||!/^item_[a-z0-9_]+$/.test(spec.offering.item)||!Number.isSafeInteger(spec.offering.amount)||spec.offering.amount<1||spec.offering.amount>10))errors.push('续约须有1到60分钟上限与真实供品');
      if(spec.operation!=='extend'&&spec.offering!==undefined)errors.push('此契约操作不接受供品参数');
      return errors;
    }
    const template=summonTemplates[spec?.summonType];
    if(!template)return['召唤类型尚未接入，不能凭名称赋予能力'];
    if(template.work&&(!Number.isFinite(catalog.rangeMeters)||catalog.rangeMeters<0||catalog.rangeMeters>10))errors.push('役灵工序需要有限真实射程');
    if(!Number.isSafeInteger(catalog.duration)||catalog.duration<1||catalog.duration>template.maximumDuration||spec.power>template.maximumPower||spec.upkeepMp!==template.upkeepMp||spec.upkeepMinutes!==template.upkeepMinutes)errors.push('召唤超过载量、时限或维持契约边界');
    return errors;
}

function waterSite(d,engine,target,authorization){
 const row=environmentFeatures(engine).find(x=>x.id===target&&x.location===d.get('state','location'));
 if(!row||!['water','container'].includes(row.kind))throw Error('水中守卫需要所在地真实水体');
 const state=d.get('state','records',`physical_feature:${row.id}`)?.state??row.state;
 const position=d.get('state','records','local_player_position');const point=position?.location===row.location?position.point:[0,0];
 if(!Number.isFinite(state.waterMl)||state.waterMl<2000||!Array.isArray(row.position)||row.position.length!==2||row.position.some(x=>!Number.isFinite(x))||!Array.isArray(point)||point.some(x=>!Number.isFinite(x))||Math.hypot(point[0]-row.position[0],point[1]-row.position[1])>1)throw Error('水中守卫须接触至少两升现有水体');
 if(row.owner!=='player'&&row.access!=='public'){
  const a=d.get('state','records',authorization);if(a?.category!=='authorization'||a.subject!==row.id||a.action!=='environment_use'||a.grantor!==row.owner||a.revoked||a.expires!==undefined&&a.expires<=d.get('state','minute'))throw Error('水体所有者未授权');
 }
 return{waterFeature:row.id,initialWaterMl:state.waterMl,waterPoint:[...row.position]};
}

export function prepareSummon(d, catalog, args, {completion=false}={}) {
    if (!this.rules.petCare) throw new Error('世界尚未登记召唤契约规则');
    if(catalog.effectSpec.kind==='summon_contract'){
      const summon=resolveSummon(this,d,args.target??args.summon),effect=d.get('state','effects',summon);
      if(effect.location!==d.get('state','location'))throw Error('召唤契约主体不在场');
      if(catalog.effectSpec.operation==='extend'){
        const offer=catalog.effectSpec.offering;
        if(!this.byId.has(offer.item)||this.quantity(d,'player',offer.item)<offer.amount)throw Error('续约缺少真实供品');
        if(effect.expires+catalog.effectSpec.power-d.get('state','minute')>summonTemplates[effect.summonType].maximumDuration)throw Error('续约超过模板剩余时限');
      }
      return{catalog,spec:catalog.effectSpec,target:summon,args:{...args,target:summon}};
    }
    const template=summonTemplates[catalog.effectSpec.summonType];
    const proficiency=d.get('state','skills',catalog.skill,'proficiency')??0;
    if(!Number.isSafeInteger(proficiency)||proficiency<0||proficiency>2699)throw Error('召唤熟练度记录无效');
    const medium=template.waterOnly?waterSite(d,this,args.target,args.authorization):template.work?prepareSummonWork.call(this,d,catalog,args,{completion}):{};
    if (!template.work&&!template.waterOnly&&!['player', d.get('state', 'location')].includes(args.target ?? 'player')) throw new Error('只能在施术者当前位置召唤');
    const count = Object.values(d.get('state', 'effects')).filter(effect => effect.kind === 'summon' && effect.owner === 'player').length;
    if (count >= this.rules.petCare.maximumSummons) throw new Error('同时维持召唤的名额已满');
    return { catalog, spec: catalog.effectSpec, target: 'player',args:{...args},medium };
}

export function applySummon(d, prepared, eventId) {
    try { prepared=prepareSummon.call(this, d, prepared.catalog, prepared.args??{ target: 'player' },{completion:true}); }
    catch (error) { return { effectFailed: error.message }; }
    const { catalog, spec } = prepared, now = d.get('state', 'minute'), key = `summon_contract:${eventId}`;
    if(spec.kind==='summon_contract'){
      if(spec.operation!=='extend')return summonAction.call(this,d,{operation:spec.operation,summon:prepared.target},eventId);
      const effect=d.get('state','effects',prepared.target),record=d.get('state','records',effect.contract);
      if(record?.category!=='summon_contract'||record.effect!==prepared.target)throw Error('续约记录不一致');
      this.itemDelta(d,'player',spec.offering.item,-spec.offering.amount,{flow:'sink:consume',purpose:'offering',writer:'summons',eventId});
      const expires=effect.expires+spec.power;
      d.set(['state','effects',prepared.target,'expires'],expires);
      d.set(['state','records',effect.contract],{...record,expires,extensions:[...record.extensions??[],{source:eventId,minutes:spec.power,offering:{...spec.offering}}]});
      return{summon:prepared.target,expires,extended:spec.power,offering:{...spec.offering}};
    }
    if (d.get('state', 'records', key)) return { effectFailed: '召唤契约编号已占用，拒绝覆盖' };
    const template=summonTemplates[spec.summonType];
    const reserve=Math.min(spec.power,5+Math.floor(effectiveProficiency(d,this,catalog.skill)/100));
    const terms = { tasks: [...template.tasks], ...(spec.summonType==='water_cup'?{maximumWaterMl:spec.power}:{}), actionMinutes: 5,
        upkeepMp: spec.upkeepMp, upkeepMinutes: spec.upkeepMinutes, durationMinutes: catalog.duration,
        boundary: spec.summonType==='water_cup'?'只搬运同一场景登记容器中的现有水；不净化，不战斗，不形成永久宠物，不自动续期':'仅执行模板能力；防护额度一次有限，续约不回补；不形成永久宠物或物品' };
    d.set(['state', 'effects', eventId], { kind: 'summon', owner: 'player', spell: catalog.id,
        summonType: spec.summonType, power:spec.power, rangeMeters:catalog.rangeMeters, location: d.get('state', 'location'), expires: now + catalog.duration,
        nextUpkeep: now + spec.upkeepMinutes, contract: key, terms,...prepared.medium,
        ...(template.tasks.includes('guard')?{guardReserve:reserve}:{}) });
    d.set(['state', 'records', key], { category: 'summon_contract', owner: 'player', effect: eventId,
        spell: catalog.id, started: now, expires: now + catalog.duration, status: '履行中', paidUpkeep: 0, terms });
    const work=template.work?applySummonWork.call(this,d,d.get('state','effects',eventId),eventId):{};
    return { summon: eventId, contract: key, expires: now + catalog.duration, terms,...work };
}

function end(d, id, effect, status, minute) {
    const record = d.get('state', 'records', effect.contract);
    if (record?.category !== 'summon_contract' || record.effect !== id || record.owner !== effect.owner) throw new Error('召唤契约记录不一致，停止结算');
    if(record.upkeepObligation)endSummonUpkeep(d,d.engine,{id:record.upkeepObligation,summon:id,minute,reason:status});
    d.set(['state', 'records', effect.contract], { ...record, status, ended: minute });
    for(const[key,e]of Object.entries(d.get('state','effects')))if(e.summonSource===id)d.remove(['state','effects',key]);
    d.remove(['state', 'effects', id]);
    d.say(`召唤${id}结束：${status}`);
}

// Process shared mana in chronological order. Expiry wins ties with upkeep.
export function advanceSummons(d, after, effectIds) {
    while (true) {
        const events = (effectIds?effectIds.map(id=>[id,d.get('state','effects',id)]).filter(([,effect])=>effect):Object.entries(d.get('state', 'effects'))).filter(([, effect]) => effect.kind === 'summon')
            .map(([id, effect]) => ({ id, effect, due: Math.min(effect.nextUpkeep, effect.expires) }))
            .filter(row => row.due <= after || d.get('state', 'player', 'status') !== '正常')
            .sort((a, b) => a.due - b.due || a.id.localeCompare(b.id));
        if (!events.length) break;
        const { id, effect, due } = events[0], player = d.get('state', 'player');
        if (player.status !== '正常') { end(d, id, effect, '失去维持能力', Math.min(after, due)); continue; }
        if (effect.expires <= due) { end(d, id, effect, '期满', effect.expires); continue; }
        if (player.mp < effect.terms.upkeepMp) { end(d, id, effect, '维持魔力不足', due); continue; }
        const record = d.get('state', 'records', effect.contract);
        if (record?.category !== 'summon_contract' || record.effect !== id) throw new Error('召唤维持契约丢失，停止结算');
        d.set(['state', 'player', 'mp'], player.mp - effect.terms.upkeepMp);
        d.set(['state', 'records', effect.contract], { ...record, paidUpkeep: record.paidUpkeep + effect.terms.upkeepMp });
        d.set(['state', 'effects', id, 'nextUpkeep'], effect.nextUpkeep + effect.terms.upkeepMinutes);
    }
}

export function summonView(engine, document) {
    return Object.entries(document.state.effects ?? {}).filter(([, effect]) => effect.kind === 'summon' && effect.owner === 'player' && effect.expires > document.state.minute)
        .map(([id, effect]) => ({ id, name: engine.byId.get(effect.spell)?.name ?? effect.spell, contract: effect.contract,
            location: effect.location, expires: effect.expires, terms: structuredClone(effect.terms) }));
}

function resolveSummon(engine, d, requested) {
    const active = summonView(engine, d.document);
    const direct = active.find(row => row.id === requested || row.contract === requested);
    if (direct) return direct.id;
    const matches = active.filter(row => row.name === requested || engine.byId.get(d.get('state', 'effects', row.id, 'spell'))?.aliases?.includes(requested));
    if (matches.length === 1) return matches[0].id;
    if (matches.length > 1) throw new Error(`同名役灵不止一只，请选择真实实例编号：${matches.map(row => row.id).join('、')}`);
    if (active.length) throw new Error('召唤编号未匹配；你仍有有效契约，请用world_summon inspect查编号，不应宣称没有役灵');
    throw new Error('没有仍有效的自有召唤契约');
}

export function summonAction(d, args, eventId) {
    const operation = args.operation ?? 'inspect';
    if (operation === 'inspect') return { summons: summonView(this, d.document).filter(row=>!args.summon||row.id===resolveSummon(this,d,args.summon)) };
    args = { ...args, summon: resolveSummon(this, d, args.summon) };
    const effect = d.get('state', 'effects', args.summon);
    if (effect?.kind !== 'summon' || effect.owner !== 'player' || effect.expires <= d.get('state', 'minute')) throw new Error('没有仍有效的自有召唤契约');
    if (operation === 'dismiss') {
      const contract=d.get('state','records',effect.contract),id=contract?.upkeepObligation;
      if(id){
        const row=obligationRow(d.get('state'),id),view=obligationView(d.get('state'),id);
        if(row?.kind!=='upkeep'||row.debtor!==effect.owner||row.creditor!==args.summon||view.closed||view.owed||
            row.terms.peacefulDismissal!==true||row.terms.active!==true||row.terms.overdue!==false||row.terms.thirdPartyRights!==false)throw Error('Upkeep terms do not allow peaceful dismissal');
        closeObligation(d,this,{id,actor:effect.owner,party:effect.owner,reason:'peaceful_dismissal'},eventId);
      }
      end(d, args.summon, effect, '和平解离', d.get('state', 'minute'));return {summon:args.summon,dismissed:true,...(id?{obligation:id}:{})};
    }
    if(operation==='guard'){
      if(!effect.terms.tasks.includes('guard')||effect.location!==d.get('state','location')||!Number.isSafeInteger(effect.guardReserve)||effect.guardReserve<1)throw Error('没有可用的在场守卫额度');
      if(effect.waterFeature)waterSite(d,this,effect.waterFeature,args.authorization);
      const result=applyProtectionPrimitive(d,{spec:{kind:'protection',power:effect.guardReserve,damageTypes:['physical'],stacking:'strongest'},target:'player',spell:effect.spell,duration:effect.expires-d.get('state','minute')},eventId);
      d.set(['state','effects',eventId,'summonSource'],args.summon);d.set(['state','effects',args.summon,'guardReserve'],0);
      return{summon:args.summon,...result};
    }
    if (operation !== 'carry_water' || effect.summonType !== 'water_cup') throw new Error('这只役灵没有所请求的契约能力');
    if (effect.location !== d.get('state', 'location')) throw new Error('役灵不在场');
    servantCarryWater.call(this, d, args, effect.terms.maximumWaterMl, true);
    this.advance(d, effect.terms.actionMinutes, eventId);
    const current = d.get('state', 'effects', args.summon);
    if (!current || current.location !== d.get('state', 'location')) return { summon: args.summon, success: false, effectFailed: '搬运完成前契约终止，水仍在原处' };
    try { return { summon: args.summon, success: true, ...servantCarryWater.call(this, d, args, effect.terms.maximumWaterMl, false) }; }
    catch (error) { return { summon: args.summon, success: false, effectFailed: error.message }; }
}
// Spell effect family (dispatched by magic.mjs through magic-effects.mjs).
registerMagicEffect({kinds:['summon','summon_contract'],validate:validateSummonCatalog,prepare(d,c,args){return prepareSummon.call(this,d,c,args);},apply(d,p,id){return applySummon.call(this,d,p,id);}});
