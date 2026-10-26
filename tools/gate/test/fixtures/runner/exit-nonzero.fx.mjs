import test, { after } from 'node:test';
test('passes', () => {});
after(() => { process.exitCode = 5; });
