import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot,artifactPath}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches, CampaignStorage, digest} from '../server-plugin/storage.mjs';
import {scheduleAt} from '../server-plugin/npc-schedule.mjs';
import {modelToolCall} from '../extension/tools.mjs';

const world = await loadWorld();
const legacy = JSON.parse(await fs.readFile(new URL('fixtures/legacy/seed.json', import.meta.url), 'utf8'));
const configs = world.rules.agriculture.settlements.filter(row => row.opening);
const npcDefinitionsHash = digest(world.npcs);
const report = {
    kind: 'T23 formal-schedule village trade', worldHash: digest(world), seed: 't23-default',
    modelCalls: 0, modelCostYuan: 0, scope: 'Four independent default characters; no deployment or long-term survival claim',
    contracts: [],
};

function snapshot(engine, document, seller, buyer) {
    const {state} = document;
    const village = config => ({
        id: config.settlement, food: state.settlements[config.settlement].food,
        copper: state.settlements[config.settlement].treasury,
        agriculture: structuredClone(state.records[`agriculture:${config.settlement}`].ledger),
        fiscal: structuredClone(state.records[`village-fiscal:${config.settlement}`] ?? null),
        manager: {
            id: config.manager, tier: engine.byId.get(config.manager).tier,
            location: state.npcs[config.manager].location,
            status: state.npcs[config.manager].status ?? null,
            activity: state.npcs[config.manager].activity ?? null,
            copper: state.npcs[config.manager].coins,
            inventory: structuredClone(state.npcs[config.manager].inventory),
            scheduleTravel: structuredClone(state.npcs[config.manager].scheduleTravel ?? null),
            scheduled: scheduleAt(engine, config.manager, state.minute),
        },
    });
    return {
        minute: state.minute, calendar: engine.calendar(state.minute).text, location: state.location,
        player: {copper: state.player.coins, status: state.player.status, inventory: Object.fromEntries(Object.entries(state.inventory).map(([id, item]) => [id, item.quantity]))},
        seller: village(seller), buyer: village(buyer),
        trade: structuredClone(state.records[`village-trade:${seller.tradeContract.id}`] ?? null),
    };
}

function balances(document, seller, buyer) {
    return {
        playerCopper: document.state.player.coins,
        playerGrain: document.state.inventory[seller.tradeContract.item]?.quantity ?? 0,
        sellerCopper: document.state.settlements[seller.settlement].treasury,
        sellerGrain: document.state.settlements[seller.settlement].food,
        buyerCopper: document.state.settlements[buyer.settlement].treasury,
        buyerGrain: document.state.settlements[buyer.settlement].food,
    };
}

function delta(before, after) {
    return Object.fromEntries(Object.keys(before).map(key => [key, after[key] - before[key]]));
}

function totalCopper(document) {
    return document.state.player.coins
        + Object.values(document.state.settlements).reduce((sum, row) => sum + row.treasury, 0)
        + Object.values(document.state.npcs).reduce((sum, row) => sum + row.coins, 0);
}

function conservation(document, id) {
    const row = document.state.records[`agriculture:${id}`], ledger = row.ledger;
    const stock = document.state.settlements[id];
    assert.equal(row.batches.reduce((sum, batch) => sum + batch.amount, 0), stock.food);
    assert.equal(row.field.seedBatches.reduce((sum, batch) => sum + batch.amount, 0), row.field.seedBank);
    assert.equal(
        ledger.openingFood + ledger.openingSeed + ledger.freshProduced + ledger.harvested + ledger.donated + ledger.seedDonated,
        stock.food + row.field.seedBank + ledger.eaten + ledger.spoiled + ledger.overflow + ledger.seedSpent + ledger.sold,
    );
    assert.ok(stock.food + row.field.seedBank <= row.granary.capacity);
}

function tradeCall(seller, buyer, phase) {
    const call = modelToolCall('world_farm', {
        operation: 'settle_trade', contract: seller.tradeContract.id, phase,
        authority: phase === 'pickup' ? seller.manager : buyer.manager,
    });
    assert.equal(call.tool, 'world_field');
    assert.equal(call.args.operation, 'farm_settle_trade');
    return call;
}

test('四份粮约从默认出生点保留全部正式作息，实际提运交割及导出重载无二次收付', async t => {
    assert.equal(configs.length, 4);
    for (const seller of configs) {
        await t.test(seller.tradeContract.id, async () => {
            const buyer = configs.find(row => row.settlement === seller.tradeContract.buyer);
            const engine = new WorldEngine(world);
            let document = engine.createCharacter(legacy, {}, report.seed);
            const initial = structuredClone(document), initialBalances = balances(document, seller, buyer);
            const evidence = {contract: structuredClone(seller.tradeContract), initial: snapshot(engine, document, seller, buyer), actions: []};
            report.contracts.push(evidence);
            assert.equal(document.state.location, 'loc_hw');
            assert.equal(document.state.player.coins, legacy.state.player.coins);
            assert.equal(Object.keys(document.state.inventory).length, Object.keys(legacy.state.inventory).length);
            for (const [name, quantity] of Object.entries(legacy.state.inventory)) {
                assert.equal(document.state.inventory[engine.resolve(name, 'item')].quantity, quantity);
            }
            for (const config of configs) {
                assert.ok(engine.byId.get(config.manager).schedule);
                assert.equal(engine.byId.get(config.manager).tier, 'full');
                assert.equal(document.state.settlements[config.settlement].food, config.initialFood);
            }

            const history = [];
            async function run(tool, args, label) {
                const input = {tool, args, eventId: `${seller.tradeContract.id}-${label}`};
                const beforeDocument = structuredClone(document), before = snapshot(engine, document, seller, buyer);
                const output = await engine.reduce(document, input);
                assert.deepEqual(document, beforeDocument, 'reduce must leave its input immutable');
                document = applyPatches(document, output.patches);
                if (tool === 'world_field') {
                    assert.equal(document.state.minute, beforeDocument.state.minute);
                    assert.deepEqual(document.state.npcs, beforeDocument.state.npcs, 'instant settlement cannot take NPC property');
                    assert.equal(totalCopper(document), totalCopper(beforeDocument), 'instant trade conserves all actual copper');
                }
                const action = {
                    label, input, result: output.result, before, after: snapshot(engine, document, seller, buyer),
                    delta: delta(balances(beforeDocument, seller, buyer), balances(document, seller, buyer)),
                };
                evidence.actions.push(action);
                history.push({input, output});
                conservation(document, seller.settlement);
                conservation(document, buyer.settlement);
                return {input, output, action};
            }

            const walk = (destination, label) => run('world_move', {destination, mode: 'walk'}, label);
            async function nextCounterWindow(config, label) {
                const now = document.state.minute;
                let target = now;
                let found = false;
                for (let i = 0; i < 100; i++) {
                    const slot = scheduleAt(engine, config.manager, target);
                    if (slot.location === config.counter && target + 60 < slot.until) {
                        target = Math.max(target, slot.until - (slot.end - slot.start) + 60);
                        found = true;
                        break;
                    }
                    target = slot.until;
                }
                assert.ok(found && target < now + 31 * 1440, 'a real counter window must exist');
                if (target > now) await run('world_time', {minutes: target - now, activity: '休息'}, label);
            }

            await walk('loc_bs', 'birth-to-town');
            await walk(seller.settlement, 'town-to-seller');
            if (seller === configs[0]) {
                // First real arrival is during the administrator's evening rest.
                await walk(seller.counter, 'seller-counter-evening');
                const before = structuredClone(document), call = tradeCall(seller, buyer, 'pickup');
                assert.notEqual(document.state.npcs[seller.manager].location, seller.counter);
                assert.match(document.state.npcs[seller.manager].activity, /休息|睡眠|家务/);
                let refused;
                await assert.rejects(async () => {
                    try { await engine.reduce(document, {...call, eventId: 'absent-pickup'}); }
                    catch (error) { refused = error.message; throw error; }
                }, /在场清醒管理员/);
                assert.deepEqual(document, before, 'refusal must charge no copper or grain');
                evidence.refusal = {error: refused, before: snapshot(engine, before, seller, buyer), after: snapshot(engine, document, seller, buyer)};
            }
            await nextCounterWindow(seller, 'wait-seller-window');
            if (document.state.location !== seller.counter) await walk(seller.counter, 'seller-counter');
            assert.equal(document.state.npcs[seller.manager].location, seller.counter);
            assert.equal(scheduleAt(engine, seller.manager, document.state.minute).location, seller.counter);
            assert.equal(document.state.npcs[seller.manager].scheduleTravel, undefined);

            const pickupCall = tradeCall(seller, buyer, 'pickup');
            const pickup = await run(pickupCall.tool, pickupCall.args, 'pickup');
            assert.deepEqual(pickup.action.delta, {
                playerCopper: -60, playerGrain: 20, sellerCopper: 60, sellerGrain: -20, buyerCopper: 0, buyerGrain: 0,
            });
            const tradeKey = `village-trade:${seller.tradeContract.id}`;
            const sourceKey = `village-fiscal:${seller.settlement}`, buyerKey = `village-fiscal:${buyer.settlement}`;
            assert.deepEqual(tradeAmounts(document.state.records[tradeKey]), {
                status: 'in-transit', prepaidCopper: 60, paidCopper: 0, receivedCopper: 0, taxCopper: 0,
            });
            assert.equal(document.state.records[sourceKey].advanceCopper, 60);
            assert.equal(document.state.records[sourceKey].salesGrossCopper, 0);
            assert.equal(document.state.records[sourceKey].taxReceiptsCopper, 0);
            const batches = structuredClone(document.state.records[tradeKey].batches);
            const afterPickup = structuredClone(document);
            await run(pickupCall.tool, pickupCall.args, 'pickup-again');
            assert.deepEqual(document, afterPickup);
            assert.deepEqual(applyPatches(document, pickup.output.patches), document);

            await walk(seller.settlement, 'leave-seller-counter');
            await walk('loc_bs', 'seller-to-town');
            await walk(buyer.settlement, 'town-to-buyer');
            await nextCounterWindow(buyer, 'wait-buyer-window');
            await walk(buyer.counter, 'buyer-counter');
            assert.equal(document.state.npcs[buyer.manager].location, buyer.counter);
            assert.equal(scheduleAt(engine, buyer.manager, document.state.minute).location, buyer.counter);
            assert.equal(document.state.npcs[buyer.manager].scheduleTravel, undefined);
            assert.equal(document.state.player.status, '正常');
            assert.equal(document.state.inventory[seller.tradeContract.item].quantity, 20);

            const deliverCall = tradeCall(seller, buyer, 'deliver');
            const delivered = await run(deliverCall.tool, deliverCall.args, 'deliver');
            assert.deepEqual(delivered.action.delta, {
                playerCopper: 60, playerGrain: -20, sellerCopper: 0, sellerGrain: 0, buyerCopper: -60, buyerGrain: 20,
            });
            assert.deepEqual(tradeAmounts(document.state.records[tradeKey]), {
                status: 'delivered', prepaidCopper: 0, paidCopper: 60, receivedCopper: 60, taxCopper: 3,
            });
            const fiscal = document.state.records[sourceKey], purchases = document.state.records[buyerKey];
            assert.equal(fiscal.advanceCopper, 0);
            assert.equal(fiscal.salesGrossCopper, 60);
            assert.equal(fiscal.salesNetCopper, 57);
            assert.equal(fiscal.taxReceiptsCopper, 3);
            assert.equal(purchases.purchasesCopper, 60);
            assert.equal(fiscal.exportedFood, 20);
            assert.equal(purchases.importedFood, 20);
            assert.equal(fiscal.salesNetCopper + fiscal.taxReceiptsCopper, fiscal.salesGrossCopper);
            const receivedBatches = document.state.records[`agriculture:${buyer.settlement}`].batches.filter(batch => batch.id.startsWith(`trade:${delivered.input.eventId}:`));
            assert.equal(receivedBatches.reduce((sum, batch) => sum + batch.amount, 0), 20);
            assert.deepEqual(receivedBatches.map(batch => [batch.amount, batch.harvestDay, batch.expiresDay]), batches.map(batch => [batch.amount, batch.harvestDay, batch.expiresDay]));

            const afterDelivery = structuredClone(document);
            await run(deliverCall.tool, deliverCall.args, 'deliver-again');
            assert.deepEqual(document, afterDelivery);
            assert.deepEqual(applyPatches(document, delivered.output.patches), document);

            // Account for elapsed-time production and consumption separately from instant trade entries.
            const sum = actions => Object.fromEntries(Object.keys(initialBalances).map(key => [key, actions.reduce((n, action) => n + action.delta[key], 0)]));
            evidence.nonTradeDelta = sum(evidence.actions.filter(action => action.input.tool !== 'world_field'));
            evidence.tradeDelta = sum(evidence.actions.filter(action => action.input.tool === 'world_field'));
            const finalBalances = balances(document, seller, buyer);
            for (const key of Object.keys(initialBalances)) assert.equal(finalBalances[key], initialBalances[key] + evidence.nonTradeDelta[key] + evidence.tradeDelta[key]);
            assert.equal(evidence.tradeDelta.playerCopper, 0);
            assert.equal(evidence.tradeDelta.playerGrain, 0);
            assert.equal(evidence.nonTradeDelta.playerCopper, evidence.actions.reduce((n, action) => n - (action.input.tool === 'world_move' ? action.result.cost ?? 0 : 0), 0));
            evidence.final = snapshot(engine, document, seller, buyer);
            assert.notEqual(document.state.npcs[seller.manager].activity, initial.state.npcs[seller.manager].activity);
            assert.ok(document.state.minute - initial.state.minute < 7 * 1440);

            // Real storage export/import and a fresh cache reconstruct every actual action.
            const directory = await fs.mkdtemp(path.join(tmpRoot(), 'dnd-t23-trade-'));
            try {
                const reducer = (doc, input) => engine.reduce(doc, input);
                const storage = new CampaignStorage(directory, {reducer});
                const campaignId = seller.tradeContract.id;
                await storage.create({id: campaignId, worldVersion: initial.worldVersion, document: initial});
                for (const {input} of history) await storage.transact(campaignId, {id: input.eventId, input}, reducer);
                assert.deepEqual((await storage.read(campaignId)).document, document);
                const bundle = JSON.parse(JSON.stringify(await storage.export(campaignId)));
                const importedId = `${campaignId}-copy`;
                assert.deepEqual((await storage.import(bundle, importedId)).document, document);
                const reloaded = new CampaignStorage(directory, {reducer});
                assert.deepEqual((await reloaded.read(importedId)).document, document);
                for (const {input} of [pickup, delivered]) {
                    const receipt = await reloaded.transact(importedId, {id: input.eventId, input}, reducer);
                    assert.equal(receipt.duplicate, true);
                    assert.deepEqual((await reloaded.read(importedId)).document, document);
                }
                const newInput = {...delivered.input, eventId: `${campaignId}-after-reload`};
                const receipt = await reloaded.transact(importedId, {id: newInput.eventId, input: newInput}, reducer);
                assert.equal(receipt.result.alreadySettled, true);
                assert.deepEqual((await reloaded.read(importedId)).document, document);
                evidence.persistence = {exportedEvents: bundle.events.length, documentHash: bundle.documentHash, importedAndReloaded: true, duplicatePickup: true, duplicateDelivery: true, freshDeliveryAlreadySettled: true};
            } finally {
                const resolved = path.resolve(directory);
                assert.ok(resolved.startsWith(path.resolve(tmpRoot()) + path.sep));
                await fs.rm(resolved, {recursive: true, force: true});
            }
            assert.equal(digest(world.npcs), npcDefinitionsHash, 'all source schedules and tiers remain untouched');
            evidence.passed = true;
        });
    }
});

function tradeAmounts(row) {
    const {status, prepaidCopper, paidCopper, receivedCopper, taxCopper} = row;
    return {status, prepaidCopper, paidCopper, receivedCopper, taxCopper};
}

test.after(async () => {
    if (process.env.T23_REPORT) {
        report.generatedAt = new Date().toISOString();
        report.passed = report.contracts.length === 4 && report.contracts.every(row => row.passed);
        const output = {
            ...report,
            contracts: report.contracts.map(({actions, ...row}) => ({
                ...row,
                checkpoints: actions.filter(action => ['pickup', 'deliver'].includes(action.label)),
                timeline: actions.map(action => ({
                    label: action.label, input: action.input,
                    fromMinute: action.before.minute, toMinute: action.after.minute,
                    from: action.before.location, to: action.after.location,
                    result: action.result, delta: action.delta,
                    sellerManager: managerPosition(action.after.seller.manager), buyerManager: managerPosition(action.after.buyer.manager),
                })),
            })),
        };
        // P3 / design section 9 and P3: relocate T23 evidence only; retain report projections and all live trade assertions.
        await fs.mkdir(artifactPath('测试报告','最新'), {recursive: true});
        await fs.writeFile(artifactPath('测试报告','最新','T23-trade-live.json'), JSON.stringify(output, null, 2) + '\n');
    }
});

function managerPosition(manager) {
    const {id, location, status, activity, copper, scheduleTravel} = manager;
    return {id, location, status, activity, copper, scheduleTravel};
}
