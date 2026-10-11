import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
let worker=null,ready=null,pending=null,running=false;
export function warmVoice(){
 if(ready)return ready;
 let resolveReady,rejectReady;
 ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
 const startup=ready;
 const python=process.env.VOICE_PYTHON||fileURLToPath(new URL('.voice-venv/Scripts/python.exe',import.meta.url));
 const child=spawn(python,['-u',fileURLToPath(new URL('voice-transcribe.py',import.meta.url))],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONIOENCODING:'utf-8'}});worker=child;
 let buffer='',started=false;
 const timer=setTimeout(()=>{rejectReady(Error('Voice model startup timed out.'));child.kill();},20000);
 child.stdout.on('data',chunk=>{buffer+=chunk.toString();let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);try{const result=JSON.parse(line);if(result.ready){started=true;clearTimeout(timer);resolveReady();}else if(!started){clearTimeout(timer);rejectReady(Error(result.error||'Voice startup failed.'));child.kill();}else if(pending){const finish=pending;pending=null;finish(result.error?{status:422,error:result.error}:{status:200,text:result.text});}}catch{child.kill();}}});
 child.stderr.resume();child.stdin.on('error',()=>{});
 const failed=()=>{clearTimeout(timer);rejectReady(Error('Local voice runtime unavailable.'));if(worker===child){worker=null;ready=null;const finish=pending;pending=null;finish?.({status:503,error:'Voice worker stopped. Tap the mic and try again.'});}};
 child.on('error',failed);child.on('close',failed);
 return startup;
}
export async function transcribeLocal(audio,language,signal){
 if(!['bn','en'].includes(language))return{status:400,error:'Choose Bangla or English.'};
 if(running)return{status:429,error:'Another voice message is processing. Please wait.'};
 running=true;
 try{
  await warmVoice();if(signal?.aborted)return{status:499,error:'Voice cancelled.'};
  return await new Promise(resolve=>{
   const child=worker;let finished=false;
   const finish=result=>{if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(pending===finish)pending=null;resolve(result);};
   const abort=()=>{finish({status:499,error:'Voice cancelled.'});if(worker===child){worker=null;ready=null;}child.kill();};
   const timer=setTimeout(()=>{finish({status:504,error:'Voice processing exceeded 45 seconds. Please record a shorter message.'});if(worker===child){worker=null;ready=null;}child.kill();},45000);
   pending=finish;signal?.addEventListener('abort',abort,{once:true});
   if(signal?.aborted){abort();return;}
   child.stdin.write(JSON.stringify({audio:audio.toString('base64'),language})+'\n');
  });
 }catch(e){return{status:503,error:e.message};}finally{running=false;}
}
export function stopVoice(){worker?.kill();worker=null;ready=null;}
