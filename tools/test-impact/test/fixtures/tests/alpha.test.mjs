import test from 'node:test';
import assert from 'node:assert/strict';
import { alpha } from '../math.mjs';
test('fixture alpha', () => assert.equal(alpha(), 'alpha'));
