import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { askOrbit } from './orbit-ai.mjs';
import { createChatGPTConnection } from './orbit-chatgpt.mjs';
import { transcribeLocal, warmVoice, stopVoice } from './orbit-voice.mjs';

try { process.loadEnvFile(fileURLToPath(new URL('.env', import.meta.url))); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const port = Number(process.env.PORT || 3000);
const chatGPT=createChatGPTConnection(port);
const assets = { '/': ['index.html','text/html'], '/index.html': ['index.html','text/html'], '/styles.css': ['styles.css','text/css'], '/app.js': ['app.js','text/javascript'], '/planner-ask.js': ['planner-ask.js','text/javascript'] };
const server = createServer(async (req, res) => {
  const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  // This server is private to this machine. Do not expose it as a public AI proxy.
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) return json(403,{ error: 'Invalid host.' });
  const path = new URL(req.url, `http://127.0.0.1:${port}`).pathname;
  if(await chatGPT.handle(req,res,path,json))return;
  if(path==='/api/voice'){
    if(req.method!=='POST'||req.headers.origin!==`http://${req.headers.host}`)return json(403,{error:'Invalid voice request.'});
    if(!/^audio\/(webm|ogg|mp4|wav)(;|$)/i.test(req.headers['content-type']||''))return json(415,{error:'Unsupported recording format.'});
    const cancellation=new AbortController();res.on('close',()=>cancellation.abort());
    try{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>5_000_000)return json(413,{error:'Recording too large. Keep it under 30 seconds.'});chunks.push(chunk);}if(size<100)return json(400,{error:'No recording received.'});const result=await transcribeLocal(Buffer.concat(chunks),req.headers['x-voice-language']||'bn',cancellation.signal);if(!res.destroyed)return json(result.status,result);return;}catch{if(!res.destroyed)return json(400,{error:'Could not receive voice recording.'});return;}
  }
  if (path === '/api/orbit') {
    if (req.method !== 'POST') return json(405,{ error: 'Use POST.' });
    if (req.headers.origin !== `http://${req.headers.host}`) return json(403,{ error: 'Invalid origin.' });
    if (!req.headers['content-type']?.startsWith('application/json')) return json(415,{ error: 'Use JSON.' });
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if(size > 512000) { json(413,{error:'Too much task data. Shorten notes or conversation.'}); return; } chunks.push(chunk); }
      let options;try{options=await chatGPT.options(req);}catch(e){return json(401,{error:e.message});}
      const result = await askOrbit(JSON.parse(Buffer.concat(chunks).toString('utf8')), options);
      return json(result.status,result);
    } catch { return json(400,{error:'Invalid request.'}); }
  }
  if (!['GET','HEAD'].includes(req.method) || !assets[path]) return json(404,{error:'Not found.'});
  try { const [name,type] = assets[path]; const data = await readFile(new URL(name,import.meta.url)); res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-cache'}); res.end(req.method==='HEAD'?undefined:data); } catch { json(500,{error:'Cannot load app.'}); }
});
server.requestTimeout = 300000;
server.listen(port,'127.0.0.1',()=>console.log(`Orbit: http://127.0.0.1:${port} | Continue with ChatGPT to connect your plan`));
void warmVoice().then(()=>console.log('Local voice ready.')).catch(()=>console.log('Local voice could not start.'));
process.on('exit',stopVoice);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopVoice();process.exit(0);});
