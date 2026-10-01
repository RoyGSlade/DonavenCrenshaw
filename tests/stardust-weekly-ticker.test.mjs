import test from 'node:test';
import assert from 'node:assert/strict';
import { tickerRows, loadWeeklyBoard } from '../projects/Space-Shooter/ui/weeklyTicker.js';
import { currentWeekly } from '../projects/Space-Shooter/systems/weekly.js';
const config = { backendBaseUrl: 'http://127.0.0.1:3100/api/games/stardust', requestTimeoutMs: 100 };
const event = currentWeekly(Date.parse('2026-10-01'));

test('ticker reads the current public weekly board, without account credentials or local times', async () => {
  let request;
  const rows = await loadWeeklyBoard(event, { config, fetchImpl: async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ entries: [{ rank: 1, displayName: 'Public pilot', username: 'handle', timeMs: 61543 }] }) };
  } });
  assert.equal(request.url, `${config.backendBaseUrl}/boards/weekly-01?limit=10`);
  assert.equal(request.options.method, 'GET');
  assert.equal(request.options.credentials, 'omit');
  assert.equal(request.options.cache, 'no-store');
  assert.deepEqual(rows, [{ rank: 1, name: 'Public pilot', time: '1:01.54' }]);
});
test('ticker preserves public ranks and name fallback; rejects invalid entries without inventing places', () => {
  const rows = tickerRows([
    { rank: 2, username: 'fallback', timeMs: 90000 },
    { rank: 3, displayName: '<script>literal</script>', username: 'unused', timeMs: 91000 },
    { rank: 4, username: 'null-time', timeMs: null },
    { rank: 5, username: 'bad-time', timeMs: NaN },
    { rank: 6, username: '', timeMs: 1000 },
    { rank: 11, username: 'outside-ten', timeMs: 1000 },
  ]);
  assert.deepEqual(rows.map(row=>[row.rank,row.name]), [[2,'fallback'],[3,'<script>literal</script>']]);
  assert.equal(tickerRows(Array.from({length:20},()=>({rank:1,username:'pilot',timeMs:1}))).length,10);
});
test('empty standings differ from failed, malformed or offline responses', async () => {
  assert.deepEqual(await loadWeeklyBoard(event,{config,fetchImpl:async()=>({ok:true,json:async()=>({entries:[]})})}),[]);
  for (const fetchImpl of [async()=>({ok:false}), async()=>({ok:true,json:async()=>({})}), async()=>{throw new Error('offline');}]) {
    assert.equal(await loadWeeklyBoard(event,{config,fetchImpl}),null);
  }
});
test('timeouts and interrupted navigation abort the public read', async () => {
  const fetchImpl = async (url,{signal}) => new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));
  assert.equal(await loadWeeklyBoard(event,{config,fetchImpl}),null);
  const controller = new AbortController();
  const task = loadWeeklyBoard(event,{config,fetchImpl,signal:controller.signal});
  controller.abort();
  assert.equal(await task,null);
});
test('unsafe or missing backend configuration performs no request', async () => {
  let calls=0;
  for (const backendBaseUrl of ['', 'http://remote.example/api', 'https://user:pass@example.com/api']) {
    assert.equal(await loadWeeklyBoard(event,{config:{backendBaseUrl},fetchImpl:async()=>{calls++;}}),null);
  }
  assert.equal(calls,0);
});
