// W5 / E.1-6: saved state keeps integers or rationals. This read-only scan walks a state after real advances and
// fails on any non-integer number whose path is not allowlisted. Every entry says why it may stay a double and
// must still match something (a stale entry is removed, so the list can only shrink).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';

const DAY=1440,root=path.resolve(import.meta.dirname,'..');
const DYADIC='uint32/2^32 or similar: an exactly representable binary fraction, bit-identical everywhere';
const BASIC='decimal produced only by IEEE +,-,*,/ on rule constants (no platform transcendental call): identical on every platform, but not yet an integer/rational field';
const DERIVED='double derived through det-math (exp/ln/sqrt/hypot are engine implementations): identical on every platform; integer/rational storage deferred';
// pattern over the path with ids/indices collapsed to "*"
export const ALLOWED=[
 [/^npcs\.\*\.aging\.(riskAge|annualRisk)$/,BASIC+' (ageing risk is a rule-table decimal)'],
 [/^npcs\.\*\.attributes\./,BASIC+' (attribute drift in tenths)'],
 [/^(inventory|npcs\.\*\.inventory)\.\*\.weight$/,'physical kg with decimals from item templates; a quantity of mass, not money'],
 [/^npcs\.\*\.medical\.symptoms\.\*\.temperatureC$/,'physical degrees Celsius from the illness table'],
 [/^records\.water-cycle\.(water\.(turbidity|saltMg|pathogenRisk)|farms\.\*\.(rainShare|factor))$/,DERIVED],
 [/^records\.settlement-trade\.transport\.segment\.distanceKm$/,DERIVED+' (route length = hypot of coordinates)'],
 [/^records\.physical_feature\.state\./,'physical quantities (mg, grams, metres, per-minute rates) from feature tables; '+BASIC],
 [/^records\.hazard-clock\.history\.\*\.roll$/,DYADIC+' (hazardRoll)'],
 [/^records\.faction-clock\.lastRoll$/,DYADIC+' (faction clock)'],
 [/^records\.forest\.(growthAnchors\.[a-z]+\.(reserve|rate)|ancient\.growthAnchor\.rate)$/,DERIVED+' (logistic growth anchor uses det exp)'],
 [/^records\.ecology\.growthAnchors\.[a-z]+\.rate$/,BASIC+' (annual growth rate / 360)'],
 [/^records\.agriculture\.(tools\.condition|field\.cohorts\.\*\.qualitySum)$/,BASIC+' (tool wear and crop quality accumulators)'],
 [/^records\.finance_profit\.lots\.\*\.\*\.price$/,'unit cost of a stock lot (price ratio); rational migration deferred, not transcendental'],
];
const collapse=p=>p.split('.').map(s=>/^\d+$/.test(s)||/^(npc_|item_|loc_)/.test(s)?'*':s.replace(/:.*$/,'')).join('.');
function scan(state){
 const found=new Map();
 const walk=(v,p)=>{
  if(typeof v==='number'){if(!Number.isFinite(v))throw Error(`non-finite number at ${p}`);if(!Number.isInteger(v)){const k=collapse(p);found.set(k,(found.get(k)??0)+1);}}
  else if(v&&typeof v==='object')for(const [k,c] of Object.entries(v))walk(c,p?`${p}.${k}`:k);
 };
 walk(state,'');return found;
}
test('after an advance, saved state holds no unlisted non-integer number',async()=>{
 const world=await loadWorld(),legacy=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/legacy/seed.json'),'utf8'));
 const engine=new WorldEngine(structuredClone(world));let doc=engine.createCharacter(legacy,{},'advance-registry');
 const steps=[DAY,DAY,DAY,17*60+13,5*DAY];
 for(const [i,minutes] of steps.entries()){const r=await engine.reduce(doc,{tool:'world_time',args:{minutes},eventId:`step_${i}`});doc=applyPatches(doc,r.patches);}
 const found=scan(doc.state),unlisted=[...found.keys()].filter(k=>!ALLOWED.some(([re])=>re.test(k)));
 assert.deepEqual(unlisted,[],'non-integer numbers outside the allowlist');
 const unused=ALLOWED.filter(([re])=>![...found.keys()].some(k=>re.test(k))).map(([re])=>String(re));
 assert.deepEqual(unused,[],'allowlist entries that match nothing must be removed');
 assert.ok(ALLOWED.every(([,why])=>why.length>20));
 // The world clock itself must hold only integers and integer-numerator rationals.
 const clocks=Object.values(doc.state.records).filter(r=>r.category==='world_clock');
 assert.ok(clocks.length>0&&clocks.some(c=>c.history.length>0));
 for(const c of clocks){
  assert.ok(Number.isInteger(c.lastDraw),'lastDraw is the integer uint32 draw');
  for(const h of c.history){assert.ok(Number.isInteger(h.draw));assert.ok(Number.isInteger(h.effect.price.numerator)&&h.effect.price.denominator===1000000);}
 }
});
