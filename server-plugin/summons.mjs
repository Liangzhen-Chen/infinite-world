import { servantCarryWater } from './environment.mjs';

export function validateSummonCatalog(catalog) {
    const spec = catalog.effectSpec, errors = [];
    if (catalog.mechanism !== 'servant' || spec?.summonType !== 'water_cup') errors.push('召唤类型尚未接入，不能凭名称赋予能力');
    if (catalog.duration !== 30 || spec.power > 250 || spec.upkeepMp !== 1 || spec.upkeepMinutes !== 5) errors.push('水盏役灵超过载量、时限或维持契约边界');
    return errors;
}

export function prepareSummon(d, catalog, args) {
    if (!this.rules.petCare) throw new Error('世界尚未登记召唤契约规则');
    if (!['player', d.get('state', 'location')].includes(args.target ?? 'player')) throw new Error('只能在施术者当前位置召唤');
    const count = Object.values(d.get('state', 'effects')).filter(effect => effect.kind === 'summon' && effect.owner === 'player').length;
    if (count >= this.rules.petCare.maximumSummons) throw new Error('同时维持召唤的名额已满');
    return { catalog, spec: catalog.effectSpec, target: 'player' };
}

export function applySummon(d, prepared, eventId) {
    try { prepareSummon.call(this, d, prepared.catalog, { target: 'player' }); }
    catch (error) { return { effectFailed: error.message }; }
    const { catalog, spec } = prepared, now = d.get('state', 'minute'), key = `summon_contract:${eventId}`;
    if (d.get('state', 'records', key)) return { effectFailed: '召唤契约编号已占用，拒绝覆盖' };
    const terms = { tasks: ['carry_water'], maximumWaterMl: spec.power, actionMinutes: 5,
        upkeepMp: spec.upkeepMp, upkeepMinutes: spec.upkeepMinutes, durationMinutes: catalog.duration,
        boundary: '只搬运同一场景登记容器中的现有水；不净化，不战斗，不形成永久宠物，不自动续期' };
    d.set(['state', 'effects', eventId], { kind: 'summon', owner: 'player', spell: catalog.id,
        summonType: spec.summonType, location: d.get('state', 'location'), expires: now + catalog.duration,
        nextUpkeep: now + spec.upkeepMinutes, contract: key, terms });
    d.set(['state', 'records', key], { category: 'summon_contract', owner: 'player', effect: eventId,
        spell: catalog.id, started: now, expires: now + catalog.duration, status: '履行中', paidUpkeep: 0, terms });
    return { summon: eventId, contract: key, expires: now + catalog.duration, terms };
}

function end(d, id, effect, status, minute) {
    const record = d.get('state', 'records', effect.contract);
    if (record?.category !== 'summon_contract' || record.effect !== id || record.owner !== effect.owner) throw new Error('召唤契约记录不一致，停止结算');
    d.set(['state', 'records', effect.contract], { ...record, status, ended: minute });
    d.remove(['state', 'effects', id]);
    d.say(`召唤${id}结束：${status}`);
}

// Process shared mana in chronological order. Expiry wins ties with upkeep.
export function advanceSummons(d, after) {
    while (true) {
        const events = Object.entries(d.get('state', 'effects')).filter(([, effect]) => effect.kind === 'summon')
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
    if (operation === 'inspect') return { summons: summonView(this, d.document) };
    args = { ...args, summon: resolveSummon(this, d, args.summon) };
    const effect = d.get('state', 'effects', args.summon);
    if (effect?.kind !== 'summon' || effect.owner !== 'player' || effect.expires <= d.get('state', 'minute')) throw new Error('没有仍有效的自有召唤契约');
    if (operation === 'dismiss') { end(d, args.summon, effect, '和平解离', d.get('state', 'minute')); return { summon: args.summon, dismissed: true }; }
    if (operation !== 'carry_water' || effect.summonType !== 'water_cup') throw new Error('这只役灵没有所请求的契约能力');
    if (effect.location !== d.get('state', 'location')) throw new Error('役灵不在场');
    servantCarryWater.call(this, d, args, effect.terms.maximumWaterMl, true);
    this.advance(d, effect.terms.actionMinutes, eventId);
    const current = d.get('state', 'effects', args.summon);
    if (!current || current.location !== d.get('state', 'location')) return { summon: args.summon, success: false, effectFailed: '搬运完成前契约终止，水仍在原处' };
    try { return { summon: args.summon, success: true, ...servantCarryWater.call(this, d, args, effect.terms.maximumWaterMl, false) }; }
    catch (error) { return { summon: args.summon, success: false, effectFailed: error.message }; }
}
