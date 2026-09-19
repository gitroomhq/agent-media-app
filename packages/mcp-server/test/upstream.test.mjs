import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUpstream, RETRYABLE_TOOLS } from '../dist/upstream.js';

test('a mutation with a lost response is called once; the next call reconnects', async () => {
  let connections=0, mutations=0;
  const run=createUpstream(async()=>({ id:++connections, close:async()=>{} }));
  await assert.rejects(run(async()=>{ mutations++; throw new Error('response lost'); },false), /response lost/);
  assert.equal(mutations,1);
  assert.equal(await run(async c=>c.id,false),2);
});
test('a stale read reconnects once and succeeds', async()=>{
  let n=0, calls=0;
  const run=createUpstream(async()=>({ id:++n, close:async()=>{} }));
  assert.equal(await run(async c=>{ calls++; if(c.id===1)throw new Error('stale');return c.id; }),2);
  assert.equal(calls,2);
});
test('parallel calls share initialization, and an outage is bounded', async()=>{
  let n=0;
  const run=createUpstream(async()=>({ id:++n, close:async()=>{} }));
  assert.deepEqual(await Promise.all([run(async c=>c.id),run(async c=>c.id)]),[1,1]);
  let calls=0;
  await assert.rejects(run(async()=>{calls++;throw new Error('offline');}),/offline/);
  assert.equal(calls,2);
});
test('all mutations and unknown future tools fail closed for retries',()=>{
  for(const name of ['generate_video','generate_image','generate_audio','upload_image','open_upload_panel','rate_run','make_ugc','future_tool'])assert.equal(RETRYABLE_TOOLS.has(name),false);
});
