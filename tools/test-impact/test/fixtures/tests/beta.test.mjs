import test from 'node:test';
import assert from 'node:assert/strict';
import { beta } from '../math.mjs';
test('fixture beta', () => assert.equal(beta(), 'beta'));
