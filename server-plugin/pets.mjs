import { effectiveProficiency } from './professions.mjs';
import { xpRequired } from './progression.mjs';
import {resolveCreature}from'./wildlife.mjs';

const clamp = value => Math.max(0, Math.min(100, value));
const activeStatuses = new Set(['活跃', '留守']);
const categoryNames = { support: '辅助', combat: '战斗', mount: '坐骑' };
const categoryOf = row => Object.keys(categoryNames).find(key => key === row.category || categoryNames[key] === row.category);
const active = row => row?.petFormat === 1 ? activeStatuses.has(row.status) : !['死亡', '出走', '释放', '已解除'].includes(row?.status);

export function petCapacity(engine, combat, category) {
    return category === 'combat' && combat === 'profession_summoner' ? engine.rules.pets.summonerCombat
        : category === 'mount' && combat === 'profession_knight' ? engine.rules.pets.knightMount : engine.rules.pets[category];
}

export function checkPetCareer(d, engine, combat) {
    for (const category of Object.keys(categoryNames)) {
        const count = Object.values(d.get('state', 'pets') ?? {}).filter(row => active(row) && categoryOf(row) === category).length;
        if (count > petCapacity(engine, combat, category)) throw new Error(`现有${categoryNames[category]}宠物超过新职业名额，须先妥善安置或解除归属`);
    }
}

function animal(d, engine, name, { owned = false } = {}) {
    const id = resolveCreature(engine,d,name), actor = d.get('state', 'creatures', id), definition = engine.byId.get(id);
    const species = definition?.monster ? engine.byId.get(definition.monster) : definition;
    const rule = definition?.tamingRule ?? species?.tamingRule;
    if (!actor || !rule || !engine.rules.petCare) throw new Error('没有已登记的动物实例或驯养规则');
    if (!Number.isSafeInteger(actor.hp)||!Number.isSafeInteger(actor.maxHp)||actor.maxHp<1||actor.hp>actor.maxHp||!Number.isSafeInteger(actor.level)||actor.level<0||actor.level>200)throw new Error('动物健康或等级记录无效');
    if (actor.location !== d.get('state', 'location')) throw new Error('动物不在场');
    if (actor.status === '死亡' || actor.hp <= 0) throw new Error('动物已经死亡，照料不能复活');
    if (actor.owner && actor.owner !== 'player') throw new Error('动物已有其他所有者，不能擅自操作');
    const pet = d.get('state', 'pets', id);
    if (owned && (actor.owner !== 'player' || pet?.petFormat !== 1 || !active(pet))) throw new Error('这不是仍归你所有的宠物');
    return { id, actor, definition, rule, pet, ownedRequired:owned };
}

function careOf(actor, now) {
    if (actor.care?.version === 1) return structuredClone(actor.care);
    return { version: 1, hunger: 20, fatigue: 0, mood: 60, loyalty: 50, sickness: false,
        sickHours: 0, neglectHours: 0, nextTick: now + 60, bond: 0, contactDay: -1,
        feedDay: -1, groomDay: -1, trainDay: -1, skills: {}, experience: 0 };
}

function writeCare(d, id, care) { d.set(['state', 'creatures', id, 'care'], care); }
function detach(d, id, status, minute) {
    const pet = d.get('state', 'pets', id);
    if (pet?.petFormat === 1) d.set(['state', 'pets', id], { ...pet, status, following: false, ended: minute });
    d.set(['state', 'creatures', id, 'owner'], null);
    if (d.get('state', 'player', 'mount') === id) d.remove(['state', 'player', 'mount']);
}

// Absolute hourly ticks make one long wait and many short waits equivalent.
// Old unnamed pet rows are preserved; no speculative physiology is applied to them.
export function advancePets(d, engine, after) {
    const rules = engine.rules.petCare;
    if (!rules) return;
    for (const [id, actor] of Object.entries(d.get('state', 'creatures') ?? {})) {
        if (actor.care?.version !== 1) continue;
        if (actor.status === '死亡' || actor.hp <= 0) {
            if(d.get('state','pets',id)?.petFormat===1&&active(d.get('state','pets',id)))detach(d,id,'死亡',after);
            continue;
        }
        const care = structuredClone(actor.care);
        let hp = actor.hp;
        while (care.nextTick <= after) {
            const minute = care.nextTick;
            care.hunger = clamp(care.hunger + rules.hungerPerHour);
            if (!(care.busyUntil >= minute)) care.fatigue = clamp(care.fatigue - rules.restPerHour);
            if (care.hunger >= rules.hungryThreshold) {
                care.loyalty = clamp(care.loyalty - rules.loyaltyLoss); care.mood = clamp(care.mood - 1);
                care.neglectHours++;
            } else care.neglectHours = 0;
            care.sickHours = care.hunger >= rules.sickThreshold ? care.sickHours + 1 : 0;
            if (care.sickHours >= rules.sickHours) care.sickness = true;
            if (care.hunger >= 100 || care.sickness) hp = Math.max(0, hp - rules.starvationDamage);
            care.nextTick += 60;
            if (!hp) {
                d.set(['state', 'creatures', id, 'status'], '死亡'); detach(d, id, '死亡', minute);
                d.say(`${actor.name ?? id}因饥病死亡`); break;
            }
            if (d.get('state', 'creatures', id, 'owner') === 'player' && care.loyalty <= rules.escapeLoyalty && care.neglectHours >= rules.neglectHours) {
                detach(d, id, '出走', minute); d.say(`${actor.name ?? id}离开了你的照料，当前归属已解除`);
            }
        }
        d.set(['state', 'creatures', id, 'hp'], hp); writeCare(d, id, care);
    }
}

function stillPresent(d, row) {
    const actor = d.get('state', 'creatures', row.id);
    if (actor.status === '死亡' || actor.hp <= 0) return '照料结束前动物死亡，未生效';
    if (actor.location !== d.get('state', 'location')) return '动物已不在场，未生效';
    if (row.ownedRequired && (actor.owner !== 'player' || !active(d.get('state', 'pets', row.id)))) return '结束前宠物归属已解除，未生效';
    if (actor.owner && actor.owner !== 'player') return '结束前归属已改变，未生效';
    return null;
}

export function petAction(d, args, eventId) {
    const operation = args.operation ?? 'inspect';
    if (operation === 'inspect') {
        const view=petView(this,d.document);if(!args.target)return view;
        const id=resolveCreature(this,d,args.target),actor=d.get('state','creatures',id);
        if(!actor||actor.location!==d.get('state','location')||actor.status==='死亡')throw new Error('这不是当前在场的活体动物');
        return{target:id,animal:view.presentAnimals.find(row=>row.id===id),pet:view.pets.find(row=>row.id===id)??null};
    }
    const row = animal(d, this, args.target, { owned: !['feed', 'contact', 'tame'].includes(operation) });
    const { id, actor, rule } = row, rules = this.rules.petCare, now = d.get('state', 'minute'), day = Math.floor(now / 1440);
    const care = careOf(actor, now);
    if (actor.status === '濒死' && !['feed', 'treat'].includes(operation)) throw new Error('动物伤重，不能驯服、训练或骑乘');
    if (operation === 'feed') {
        const item = this.resolve(args.item, 'item'), food = rule.food.find(entry => entry.item === item);
        if (!food) throw new Error('这种食物不符合已登记食性');
        if (care.hunger === 0) throw new Error('动物已经吃饱');
        if (this.quantity(d, 'player', item) < 1) throw new Error('没有实际持有的食物');
        this.itemDelta(d, 'player', item, -1);
        care.hunger = clamp(care.hunger - food.hungerRelief); care.mood = clamp(care.mood + 2);
        if (care.feedDay !== day) { care.bond = clamp(care.bond + food.trustGain); care.feedDay = day; }
        writeCare(d, id, care); this.advance(d, rules.feedMinutes, eventId);
        return { target: id, fed: true, consumed: { item, quantity: 1 }, care: d.get('state', 'creatures', id, 'care') };
    }
    if (operation === 'contact' || operation === 'tame') {
        const proficiency = effectiveProficiency(d, this, rules.tamingSkill);
        if (!d.get('state', 'skills', rules.tamingSkill) || proficiency < rule.minimumSkill) throw new Error('驯兽技能不足');
        if (actor.owner === 'player') throw new Error('已经归你所有，无需重复驯服');
        if (care.hunger >= rules.hungryThreshold || care.sickness) throw new Error('动物饥病，先照料再建立信任');
        if (operation === 'contact' && care.contactDay === day) throw new Error('今天已接触过，信任不能重复刷取');
        if (operation === 'tame') {
            if (care.bond < rule.trustThreshold || d.get('state', 'player', 'level') < Math.max(rule.minimumPlayerLevel, actor.level ?? 0)) throw new Error('信任或等级不足以驯服这个动物');
            if (row.definition.tier) {
                const permission = d.get('state', 'records', args.authorization);
                if (!permission || permission.category !== 'boss_taming' || permission.subject !== id || permission.condition !== rule.bossCondition || permission.expires <= now) throw new Error('首领需要已验证且有效的特殊驯服条件');
            }
            const reserved = d.get('state', 'pets', id);
            if (reserved && (reserved.petFormat !== 1 || active(reserved))) throw new Error('已有宠物记录，不能覆盖或重复登记');
            const count = Object.values(d.get('state', 'pets') ?? {}).filter(pet => active(pet) && categoryOf(pet) === rule.category).length;
            if (count >= petCapacity(this, d.get('state', 'professions', 'combat'), rule.category)) throw new Error('宠物名额已满或当前职业不允许');
        }
        const result = this.check(d, { attribute: '魅力', skill: rules.tamingSkill, difficulty: rule.difficulty }, eventId);
        if (operation === 'contact') care.contactDay = day;
        writeCare(d, id, care);
        this.advance(d, operation === 'contact' ? rules.contactMinutes : rule.minutes, eventId);
        this.practice(d, { skill: rules.tamingSkill, target: id, gain: 3 }, eventId);
        const completedCare=d.get('state','creatures',id,'care');
        const failed = stillPresent(d, row)??(completedCare.hunger>=rules.hungryThreshold||completedCare.sickness?'接触结束前动物陷入饥病，未建立归属或新增信任':null);
        const permission=d.get('state','records',args.authorization);
        const expired=operation==='tame'&&row.definition.tier&&(!permission||permission.expires<=d.get('state','minute'));
        const latest = structuredClone(d.get('state', 'creatures', id, 'care'));
        if (result.success && !failed && !expired) {
            if (operation === 'contact') latest.bond = clamp(latest.bond + rules.contactTrust);
            else {
                d.set(['state', 'creatures', id, 'owner'], 'player');
                d.set(['state', 'pets', id], { petFormat: 1, creature: id, category: rule.category, status: '活跃', following: true, acquired: d.get('state', 'minute'), source: eventId });
            }
        } else latest.bond = clamp(latest.bond - (result.degree === '大失败' ? 5 : 1));
        writeCare(d, id, latest);
        return { target: id, ...result, checkSuccess: result.success, success: result.success && !failed && !expired, operation, ...(failed || expired ? { effectFailed: failed ?? '首领特殊条件在驯服完成前失效' } : {}), care: latest };
    }
    if (operation === 'release') {
        detach(d, id, '释放', now);
        return { target: id, released: true, location:actor.location,
            factSummary:`${actor.name??id}已解除归属，目前仍在${this.byId.get(actor.location)?.name??actor.location}。本次完成后地点与生命保持原值。`,
            actionScope:{kind:'ownership_release',instantaneous:true,locationChanged:false,
                note:'仅解除归属，动物仍在登记地点；没有牵绳物品操作、生命变化或迁徙。没有其他独立动作时本回合0分钟。'} };
    }
    if (operation === 'dismount') {
        if (d.get('state', 'player', 'mount') !== id) throw new Error('当前没有骑着这只坐骑');
        d.remove(['state', 'player', 'mount']); return { target: id, mounted: false };
    }
    if (operation === 'follow' || operation === 'stay') {
        if (operation === 'stay' && d.get('state', 'player', 'mount') === id) throw new Error('先下坐骑再留守');
        if (operation === 'follow' && (care.loyalty < 20 || care.sickness)) throw new Error('宠物暂不愿或无法跟随');
        d.set(['state', 'pets', id], { ...row.pet, following: operation === 'follow', status: operation === 'follow' ? '活跃' : '留守' });
        return { target: id, following: operation === 'follow' };
    }
    if (operation === 'mount') {
        if (rule.category !== 'mount' || !rule.rideable) throw new Error('动物不能作为坐骑');
        if (care.sickness || care.fatigue >= rules.maximumRideFatigue || care.hunger >= rules.hungryThreshold || care.loyalty < 20 || actor.hp < actor.maxHp / 2) throw new Error('坐骑状态不足以骑乘');
        const weight = Object.entries(d.get('state', 'inventory')).reduce((sum, [item, entry]) => sum + this.quantity(d, 'player', item) * (this.byId.get(item)?.weight ?? 0), 0);
        if (weight + rule.riderWeightKg > rule.carryKg) throw new Error('坐骑负重不足');
        if (d.get('state', 'player', 'mount') && d.get('state', 'player', 'mount') !== id) throw new Error('先从现有坐骑下来');
        writeCare(d, id, care); d.set(['state', 'player', 'mount'], id);
        d.set(['state', 'pets', id], { ...row.pet, following: true, status: '活跃' });
        return { target: id, mounted: true, loadKg: weight + rule.riderWeightKg };
    }
    if (operation === 'rest') {
        if (!Number.isSafeInteger(args.minutes) || args.minutes < 60 || args.minutes > 1440) throw new Error('休息时长须为60至1440分钟');
        if (d.get('state', 'player', 'mount') === id) throw new Error('先下坐骑再休息');
        writeCare(d, id, care); this.advance(d, args.minutes, eventId);
        return { target: id, elapsed: args.minutes, care: d.get('state', 'creatures', id, 'care') };
    }
    if (operation === 'groom') {
        if (care.groomDay === day) throw new Error('今天已经照料，忠诚不能反复刷取');
        care.groomDay = day; writeCare(d, id, care); this.advance(d, rules.groomMinutes, eventId);
        const failed = stillPresent(d, row), latest = structuredClone(d.get('state', 'creatures', id, 'care'));
        if (!failed) { latest.loyalty = clamp(latest.loyalty + rules.groomLoyalty); latest.mood = clamp(latest.mood + 5); writeCare(d, id, latest); }
        return { target: id, groomed: !failed, ...(failed ? { effectFailed: failed } : {}), care: latest };
    }
    if (operation === 'treat' || operation === 'train') {
        const skill = operation === 'treat' ? rules.medicineSkill : rules.tamingSkill;
        const minimum = operation === 'treat' ? rules.treatmentMinimumSkill : rules.trainMinimumSkill;
        if (effectiveProficiency(d, this, skill) < minimum) throw new Error('照料技能不足');
        if (operation === 'treat') {
            if (!care.sickness && actor.hp >= actor.maxHp) throw new Error('动物没有可治疗的病伤');
            if (this.quantity(d, 'player', rules.treatmentItem) < 1) throw new Error('缺少实际药材');
            this.itemDelta(d, 'player', rules.treatmentItem, -1);
        } else {
            if (!rule.skills.includes(args.skill)) throw new Error('训练目标不在这种动物的技能目录');
            if (care.trainDay === day) throw new Error('今天已训练，不能重复刷成长');
            if (care.hunger >= rules.hungryThreshold || care.sickness || care.fatigue >= 80) throw new Error('宠物状态不足以训练');
            care.trainDay = day;
        }
        const result = this.check(d, { attribute: operation === 'treat' ? '智力' : '魅力', skill, difficulty: 15 }, eventId);
        writeCare(d, id, care); this.advance(d, operation === 'treat' ? rules.treatmentMinutes : rules.trainMinutes, eventId);
        this.practice(d, { skill, target: id, gain: 3 }, eventId);
        const failed = stillPresent(d, row), latest = structuredClone(d.get('state', 'creatures', id, 'care'));
        if (!failed && result.success) {
            if (operation === 'treat') {
                latest.sickness = false; latest.sickHours = 0;
                d.set(['state', 'creatures', id, 'hp'], Math.min(actor.maxHp, d.get('state', 'creatures', id, 'hp') + rules.treatmentHeal));
                if(d.get('state','creatures',id,'hp')>0&&d.get('state','creatures',id,'status')==='濒死')d.set(['state','creatures',id,'status'],'正常');
            } else {
                latest.skills[args.skill] = Math.min(2699, (latest.skills[args.skill] ?? 0) + 3);
                latest.experience += rules.trainExperience; latest.fatigue = clamp(latest.fatigue + 10);
                let level = d.get('state', 'creatures', id, 'level');
                while (level < 200 && latest.experience >= xpRequired(level + 1)) { latest.experience -= xpRequired(level + 1); level++; }
                if (level === 200) latest.experience = 0;
                const gained = level - d.get('state', 'creatures', id, 'level');
                d.set(['state', 'creatures', id, 'level'], level);
                if (gained) d.set(['state', 'creatures', id, 'maxHp'], actor.maxHp + gained * 2);
            }
        }
        writeCare(d, id, latest);
        return { target: id, operation, ...result, checkSuccess: result.success, success: result.success && !failed, ...(failed ? { effectFailed: failed } : {}), care: latest, hp: d.get('state', 'creatures', id, 'hp'), level: d.get('state', 'creatures', id, 'level') };
    }
    throw new Error('未登记的宠物操作');
}

export function petView(engine, document) {
    const { state } = document;
    return { pets: Object.entries(state.pets ?? {}).map(([id, pet]) => {
        if (pet.petFormat !== 1) return { id, ...structuredClone(pet), note: '旧宠物记录保留；尚无可验证的动物实例，不自动补造' };
        const actor = state.creatures?.[id];
        return { id, name: actor?.name ?? engine.byId.get(id)?.name, ...structuredClone(pet), location: actor?.location, hp: actor?.hp, maxHp: actor?.maxHp, level: actor?.level, care: structuredClone(actor?.care) };
    }), presentAnimals: Object.entries(state.creatures ?? {}).filter(([, actor]) => actor.location === state.location && actor.status !== '死亡').map(([id, actor]) => {
        const definition=engine.byId.get(id),species=definition?.monster?engine.byId.get(definition.monster):definition;
        const rule=definition?.tamingRule??species?.tamingRule;
        return { id, name: actor.name ?? definition?.name, owner: actor.owner ?? null, hp: actor.hp, level: actor.level, care: structuredClone(actor.care),tamingRule:rule?structuredClone(rule):null };
    }) };
}

export function preparePetTravel(d, engine, mode, movingMinutes) {
    const mounted = d.get('state', 'player', 'mount');
    if (mode === 'horse') {
        if (!mounted) throw new Error('骑行需要实际骑乘已归属的坐骑');
        const { actor, rule } = animal(d, engine, mounted, { owned: true }), care = careOf(actor, d.get('state', 'minute'));
        const fatigue = Math.ceil(movingMinutes / 30) * engine.rules.petCare.travelFatiguePer30Minutes;
        const load=Object.entries(d.get('state','inventory')).reduce((sum,[item])=>sum+engine.quantity(d,'player',item)*(engine.byId.get(item)?.weight??0),rule.riderWeightKg);
        if(load>rule.carryKg)throw new Error('当前物品增加后坐骑负重不足，无法骑行');
        if (!rule.rideable || care.sickness || care.hunger >= engine.rules.petCare.hungryThreshold || care.fatigue + fatigue > engine.rules.petCare.maximumRideFatigue || actor.hp < actor.maxHp / 2) throw new Error('坐骑无法完成这段路，须休息、照料或分段走');
    } else if (mounted) throw new Error('先下坐骑，再选择其他出行方式');
}

export function movePets(d, engine, origin, destination, movingMinutes) {
    if (!engine.rules.petCare) return;
    for (const [id, pet] of Object.entries(d.get('state', 'pets') ?? {})) {
        const actor = d.get('state', 'creatures', id);
        if (pet.petFormat !== 1 || !active(pet) || !pet.following || actor?.owner !== 'player' || actor.location !== origin || actor.status === '死亡') continue;
        d.set(['state', 'creatures', id, 'location'], destination);
        const care = careOf(actor, d.get('state', 'minute'));
        care.busyUntil=d.get('state','minute')+movingMinutes;
        care.fatigue = clamp(care.fatigue + Math.ceil(movingMinutes / 30) * engine.rules.petCare.travelFatiguePer30Minutes);
        writeCare(d, id, care);
    }
}
