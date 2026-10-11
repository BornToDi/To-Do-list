// One chat panel for questions, answers and voice input.
const orbitConversation=[];
const chat=document.querySelector('#plannerChat'),messages=document.querySelector('#plannerMessages'),form=document.querySelector('#plannerAskForm'),input=document.querySelector('#plannerQuestion'),send=document.querySelector('#plannerAskButton');
const launcher=document.createElement('button');launcher.type='button';launcher.className='orbit-chat-launcher';launcher.textContent='✦ Ask Orbit';launcher.setAttribute('aria-controls','plannerChat');launcher.setAttribute('aria-expanded','false');form.replaceWith(launcher);
chat.setAttribute('aria-label','Ask Orbit chat');
chat.querySelector('.chat-heading span').textContent='Your planning assistant';
const empty=document.createElement('div');empty.className='orbit-chat-empty';empty.innerHTML='<div class="orbit-chat-symbol">✦</div><h3>How can I help?</h3><p>Ask about your tasks, plan your day, or speak your question.</p><div class="orbit-chat-suggestions"><button type="button">আজ কী কাজ বাকি?</button><button type="button">Plan my day</button></div>';messages.appendChild(empty);
const connection=document.createElement('div');connection.className='orbit-chat-connection';
const connectionStatus=document.createElement('span'),connect=document.createElement('button');connect.type='button';connect.textContent='Continue with ChatGPT';connection.append(connectionStatus,connect);chat.appendChild(connection);
const composer=document.createElement('div');composer.className='orbit-chat-composer';chat.appendChild(composer);composer.appendChild(form);
input.placeholder='Message Orbit…';input.maxLength=4000;input.setAttribute('aria-label','Message Orbit');send.textContent='↑';send.setAttribute('aria-label','Send message');send.title='Send message';
const mic=document.createElement('button');mic.type='button';mic.className='orbit-chat-mic';mic.setAttribute('aria-label','Speak your message');mic.title='Speak your message';
const micIcon='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg>';mic.innerHTML=micIcon;mic.setAttribute('aria-pressed','false');send.before(mic);
const status=document.createElement('div');status.className='orbit-chat-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');composer.appendChild(status);
const language=document.createElement('select');language.className='orbit-chat-language';language.setAttribute('aria-label','Voice language');for(const[value,label]of [['bn-BD','বাংলা'],['en-US','English']]){const option=document.createElement('option');option.value=value;option.textContent=label;language.appendChild(option);}
language.value='bn-BD';try{const saved=localStorage.getItem('orbit-voice-language');if(['bn-BD','en-US'].includes(saved))language.value=saved;}catch{}
language.addEventListener('change',()=>{try{localStorage.setItem('orbit-voice-language',language.value);}catch{}});
const foot=document.createElement('div');foot.className='orbit-chat-foot';foot.appendChild(language);const tip=document.createElement('span');tip.textContent='Enter to send · Mic to speak';foot.appendChild(tip);composer.appendChild(foot);
let connected=false,busy=false,voice=null;
function openChat(){chat.hidden=false;launcher.setAttribute('aria-expanded','true');input.focus();messages.scrollTop=messages.scrollHeight;}
function closeChat(){cancelVoice();chat.hidden=true;launcher.setAttribute('aria-expanded','false');launcher.focus();}
launcher.addEventListener('click',()=>chat.hidden?openChat():closeChat());document.querySelector('#closePlannerChat').addEventListener('click',closeChat);
document.querySelector('#searchButton').addEventListener('click',openChat);
empty.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>{input.value=button.textContent;input.focus();}));
function syncControls(){send.disabled=busy||Boolean(voice);mic.disabled=busy;language.disabled=Boolean(voice);input.readOnly=busy||Boolean(voice);mic.innerHTML=voice?'■':micIcon;mic.classList.toggle('listening',Boolean(voice));mic.setAttribute('aria-pressed',String(Boolean(voice)));mic.setAttribute('aria-label',voice?'Stop listening':'Speak your message');}
async function refreshConnection(){try{const r=await fetch('/api/chatgpt/status');if(!r.ok)throw Error();const data=await r.json();connected=data.connected;connectionStatus.textContent=connected?'● ChatGPT connected':'Connect ChatGPT to start';connect.textContent=connected?'Disconnect':'Continue with ChatGPT';connection.classList.toggle('connected',connected);}catch{connectionStatus.textContent='Open Orbit at 127.0.0.1:3000';}}
connect.addEventListener('click',async()=>{connect.disabled=true;try{const r=await fetch(connected?'/auth/logout':'/auth/start',{method:'POST'});const data=await r.json();if(!r.ok)throw Error(data.error);if(connected){orbitConversation.length=0;messages.replaceChildren(empty);await refreshConnection();}else location.assign(data.url);}catch(e){status.textContent=e.message||'Could not connect. Try again.';}finally{connect.disabled=false;}});
if(location.protocol!=='file:')void refreshConnection();
const signIn=new URLSearchParams(location.search).get('chatgpt');if(signIn){openChat();if(signIn==='failed')status.textContent='Sign-in was not completed. Try Continue with ChatGPT again.';history.replaceState(null,'',location.pathname+location.hash);}
function bubble(text,className){const el=document.createElement('div');el.className=className;el.textContent=text;messages.appendChild(el);messages.scrollTop=messages.scrollHeight;return el;}
async function answerPlannerQuestion(question){
 empty.remove();bubble(question,'chat-question');const reply=bubble('Thinking…','chat-answer pending');
 try{if(location.protocol==='file:')throw Error('Open http://127.0.0.1:3000 to use chat.');const r=await fetch('/api/orbit',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(65000),body:JSON.stringify({question,history:orbitConversation.slice(-16),localDate:localDateKey(new Date()),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,tasks:taskStore.map(t=>({...t,notes:getNoteHistory(t).map(n=>n.text).join('\n')}))})});const data=await r.json();if(!r.ok)throw Error(data.error||'Could not answer. Try again.');if(!data.answer?.trim())throw Error('No answer received. Try again.');reply.textContent=data.answer;orbitConversation.push({role:'user',content:question},{role:'assistant',content:data.answer});if(orbitConversation.length>16)orbitConversation.splice(0,orbitConversation.length-16);
 }catch(e){reply.textContent=e.name==='TimeoutError'?'The answer took too long. Please try again.':e.message;reply.classList.add('error');input.value=question;}finally{reply.classList.remove('pending');messages.scrollTop=messages.scrollHeight;}
}
form.addEventListener('submit',async event=>{event.preventDefault();const question=input.value.trim();if(!question||busy||voice)return;if(!connected){status.textContent='Continue with ChatGPT once, then send your message.';connect.focus();return;}busy=true;input.value='';status.textContent='';syncControls();try{await answerPlannerQuestion(question);}finally{busy=false;syncControls();input.focus();}});
function finishVoice(session){if(voice!==session)return;clearTimeout(session.timer);session.stream?.getTracks().forEach(track=>track.stop());voice=null;syncControls();}
function cancelVoice(){if(!voice)return;const session=voice;session.cancelled=true;session.controller.abort();input.value=session.original;finishVoice(session);if(session.recorder?.state==='recording')try{session.recorder.stop();}catch{}status.textContent='';}
mic.addEventListener('click',async()=>{
 if(busy)return;
 if(voice){if(voice.transcribing){cancelVoice();status.textContent='Voice cancelled. You can type or record again.';}else if(voice.recorder?.state==='recording'){status.textContent='Converting speech to text…';voice.recorder.stop();}return;}
 if(!window.MediaRecorder||!navigator.mediaDevices?.getUserMedia){status.textContent='Open Orbit in a browser at http://127.0.0.1:3000 to record audio.';return;}
 const session={original:input.value,cancelled:false,chunks:[],controller:new AbortController(),language:language.value.startsWith('bn')?'bn':'en'};voice=session;syncControls();status.textContent='Allow microphone access if your browser asks…';
 try{
  session.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
  if(session.cancelled){session.stream.getTracks().forEach(track=>track.stop());return;}
  const mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find(type=>MediaRecorder.isTypeSupported(type));
  session.recorder=mime?new MediaRecorder(session.stream,{mimeType:mime}):new MediaRecorder(session.stream);
  const recorder=session.recorder;
  recorder.ondataavailable=event=>{if(event.data.size)session.chunks.push(event.data);};
  recorder.onerror=()=>{if(voice!==session)return;cancelVoice();status.textContent='Could not record audio. Tap the mic to try again.';};
  recorder.onstop=async()=>{
   clearTimeout(session.timer);session.stream.getTracks().forEach(track=>track.stop());
   if(session.cancelled||voice!==session)return;
   session.transcribing=true;status.textContent='Converting… Tap the mic to cancel.';
   const elapsedStart=Date.now();const elapsedTimer=setInterval(()=>{if(voice===session)status.textContent='Converting… '+Math.floor((Date.now()-elapsedStart)/1000)+'s · Tap the mic to cancel.';},1000);
   const timeout=setTimeout(()=>session.controller.abort(),70000);
   try{
    const audio=new Blob(session.chunks,{type:recorder.mimeType||'audio/webm'});
    if(audio.size>5_000_000)throw Error('Recording too large. Try a shorter message.');
    const r=await fetch('/api/voice',{method:'POST',headers:{'Content-Type':audio.type,'X-Voice-Language':session.language},body:audio,signal:session.controller.signal});
    const result=await r.json().catch(()=>({error:'Voice server unavailable. Open Orbit at http://127.0.0.1:3000.'}));
    if(!r.ok)throw Error(result.error||'Could not transcribe audio.');
    if(session.cancelled||voice!==session)return;
    input.value=[session.original.trim(),result.text?.trim()].filter(Boolean).join(' ').slice(0,4000);
    status.textContent=result.text?.trim()?'Ready to send.':'No speech detected. Tap the mic and speak again.';
   }catch(e){if(!session.cancelled)status.textContent=e.name==='AbortError'?'Transcription took too long. Try a shorter message.':e.message;}
   finally{clearTimeout(timeout);clearInterval(elapsedTimer);finishVoice(session);if(!session.cancelled)input.focus();}
  };
  recorder.start();status.textContent='Recording… Tap the mic to finish. Maximum 30 seconds.';
  session.timer=setTimeout(()=>{if(recorder.state==='recording')recorder.stop();},30000);
 }catch(e){finishVoice(session);if(!session.cancelled)status.textContent=e.name==='NotAllowedError'?'Allow microphone access in browser site settings.':e.name==='NotFoundError'?'No microphone found. Check your device.':'Could not start recording. Check microphone access.';}
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!chat.hidden){if(voice)cancelVoice();else closeChat();}});window.addEventListener('pagehide',cancelVoice);
