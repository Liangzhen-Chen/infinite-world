import test from 'node:test';
import assert from 'node:assert/strict';
import { storedName } from '../../tools/backup.mjs';
import { safeSegment } from '../../tools/path-segment.mjs';

test('备份存储名：原先会撞名的 a__b/c 与 a/b__c 得到不同存储名，含 ... 的文件名不让 safeSegment 抛错', () => {
  assert.notEqual(storedName('a__b/c'), storedName('a/b__c'));
  assert.equal(storedName('a/b'), storedName('a\\b'));
  for (const rel of ['dir/file...txt', 'a/..b', '...', 'x/y/../z', 'SillyTavern/data/a..b.json']) {
    const s = storedName(rel);
    assert.match(s, /^[0-9a-f]{64}$/);
    assert.equal(safeSegment(s), s);
  }
});
