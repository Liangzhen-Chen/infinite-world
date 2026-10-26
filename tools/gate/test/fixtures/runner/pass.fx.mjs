import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
describe('suite', () => { test('one', () => assert.equal(1, 1)); test('two', async () => {}); });
