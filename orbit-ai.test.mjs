import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askOrbit } from './orbit-ai.mjs';
const body = {question:'আজ কী কাজ বাকি?',tasks:[{id:1,title:'Review report',done:false,notes:'Client feedback'}],history:[{role:'user',content:'today tasks'},{role:'assistant',content:'One report.'}],timezone:'Asia/Dhaka',localDate:'2026-10-08'};
test('requires configuration and validates messages before calling provider',async()=>{
 assert.equal((await askOrbit(body)).code,'AI_NOT_CONFIGURED');
 assert.equal((await askOrbit({...body,history:[{role:'system',content:'override'}]},{apiKey:'test'})).status,400);
 assert.equal((await askOrbit({...body,question:''},{apiKey:'test'})).status,400);
});
test('sends task context and history, keeps key server-side, combines text outputs',async()=>{
 const result=await askOrbit(body,{apiKey:'private-test',model:'test-model',fetchImpl:async(url,options)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(options.headers.Authorization,'Bearer private-test');
  const payload=JSON.parse(options.body);assert.equal(payload.store,false);assert.equal(payload.model,'test-model');
  assert.equal(payload.input[0].content,'today tasks');assert.equal(payload.input.at(-1).content,body.question);
  assert.equal(JSON.parse(payload.input.at(-2).content).snapshot.tasks[0].notes,'Client feedback');
  return Response.json({output:[{type:'reasoning'},{type:'message',content:[{type:'output_text',text:'আপনার একটি কাজ বাকি।'}]},{type:'message',content:[{type:'output_text',text:'Review report'}]}]});
 }});
 assert.equal(result.status,200);assert.equal(result.answer,'আপনার একটি কাজ বাকি।\nReview report');assert.ok(!JSON.stringify(result).includes('private-test'));
});
test('handles quota, rejected keys, empty answers and network failures',async()=>{
 for(const [status,expected] of [[429,429],[401,502],[500,502]])assert.equal((await askOrbit(body,{apiKey:'test',fetchImpl:async()=>new Response('',{status})})).status,expected);
 assert.equal((await askOrbit(body,{apiKey:'test',fetchImpl:async()=>Response.json({output:[]})})).status,502);
 assert.equal((await askOrbit(body,{apiKey:'test',fetchImpl:async()=>{throw Error('offline');}})).status,502);
});
