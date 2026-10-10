import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {xpRequired}from'../server-plugin/engine.mjs';
test('升级经验公式：全部0–200级遵守新手及四次方公式',()=>{
    fc.assert(fc.property(fc.integer({min:0,max:200}),level=>{
        assert.equal(xpRequired(level),level<10?level*100:Math.ceil(level**4/10));
    }),{numRuns:300,seed:20261010});
});
