import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
describe('suite', () => {
  test('good', () => {});
  test('bad', () => assert.equal(1, 2));
});
