import test from 'node:test';
test('never finishes', async () => { setInterval(() => {}, 1000); await new Promise(() => {}); });
