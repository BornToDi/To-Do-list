// Local task lookup: answers come from saved task records, not generated guesses.
function normalizePlannerQuestion(value){
 return value.toLowerCase().replace(/[০-৯]/g,c=>'০১২৩৪৫৬৭৮৯'.indexOf(c)).replace(/\s+/g,' ').trim();
}
function parsePlannerQuestion(value,current=new Date()){
 const q=normalizePlannerQuestion(value),start=new Date(current);start.setHours(12,0,0,0);
 let from='',to='',dateLabel='সব saved dates';
 const tomorrow=/tomorrow|আগামীকাল|কালকে|(?:^|\s)কাল(?=\s|\d|$)|\b(kal|kaal|agamikal)\b/.test(q),today=/today|আজ|\b(aj|aaj|ajke)\b/.test(q);
 const iso=q.match(/\b(\d{4}-\d{2}-\d{2})\b/);
 if(iso){const d=new Date(iso[1]+'T12:00');if(!Number.isFinite(d.getTime())||localDateKey(d)!==iso[1])return {error:'সঠিক date দিন, যেমন 2026-10-06।'};from=to=iso[1];dateLabel=from;}
 else if(/day after tomorrow|পরশু|\b(porshu|porshu)\b/.test(q)){start.setDate(start.getDate()+2);from=to=localDateKey(start);dateLabel='পরশু';}
 else if(tomorrow){start.setDate(start.getDate()+1);from=to=localDateKey(start);dateLabel='কাল';}
 else if(today){from=to=localDateKey(start);dateLabel='আজ';}
 else if(/this week|এই সপ্তাহ|\b(week|soptaho)\b/.test(q)){from=localDateKey(start);start.setDate(start.getDate()+6);to=localDateKey(start);dateLabel='আগামী 7 দিন';}
 else if(/this month|এই মাস|\b(month|mash)\b/.test(q)){from=localDateKey(new Date(start.getFullYear(),start.getMonth(),1));to=localDateKey(new Date(start.getFullYear(),start.getMonth()+1,0));dateLabel='এই মাস';}
 const clock=q.replace(/\d{4}-\d{2}-\d{2}/g,'');
 const time=clock.match(/(?:\bat\s*|সময়\s*|সময়\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|টায়|টায়|টা|টার|tay|ty|ta|টার সময়|o'clock)\b/i)||clock.match(/(\d{1,2})(?::(\d{2}))?\s*(টায়|টায়|টা|টার)/)||clock.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\b/);
 let hours=[],minute=null,timeLabel='';
 const evening=/\bpm\b|বিকাল|বিকেল|সন্ধ্যা|রাত|\b(bikal|bikel|evening|night|rat|afternoon)\b/.test(q),morning=/\bam\b|সকাল|\b(sokal|morning)\b/.test(q);
 if(time){let hour=Number(time[1]);minute=time[2]===undefined?null:Number(time[2]);if(hour>23||(minute!==null&&minute>59))return {error:'সঠিক সময় দিন, যেমন কাল সকাল 9:30 বা tomorrow 9 pm।'};
 const explicit=time[3]||'';if(/pm/i.test(explicit)||evening){if(hour>12)return {error:'PM-এর সময় 1–12 এর মধ্যে লিখুন।'};hours=[hour%12+12];}else if(/am/i.test(explicit)||morning){if(hour>12)return {error:'AM-এর সময় 1–12 এর মধ্যে লিখুন।'};hours=[hour%12];}else hours=hour>12||hour===0?[hour]:[hour%12,hour%12+12];
 timeLabel=hours.map(h=>formatTime(String(h).padStart(2,'0')+':'+String(minute??0).padStart(2,'0'))).join(' / ')+(minute===null?' ঘণ্টায়':'');
 }
 const area=/office|অফিস|\b(ofis|offic)\b/.test(q)?'Office':/family|পরিবার|ফ্যামিলি/.test(q)?'Family':/personal|ব্যক্তিগত|পার্সোনাল/.test(q)?'Personal':'';
 const completed=/completed|finished|done|সম্পন্ন|শেষ করেছি/.test(q),allStatuses=/all tasks|সব কাজ|সব task/.test(q);
 const high=/high priority|important|জরুরি|গুরুত্বপূর্ণ/.test(q);
 const next=/\bnext\b|পরের|পরবর্তী/.test(q);
 const waiting=/waiting|unscheduled|অপেক্ষা/.test(q);
 // Title/notes searches use quoted text or concrete subject words.
 const quoted=q.match(/["“](.+?)["”]/),keywords=quoted?[quoted[1]]:(q.match(/\b(meeting|report|proposal|invoice|budget|presentation|appointment|dentist|gym|project|finances)\b/g)||[]);
 return {q,from,to,dateLabel,hours,minute,timeLabel,area,completed,allStatuses,high,next,waiting,keywords,current:current.getTime()};
}
function lookupPlannerTasks(query,records=taskStore){
 if(query.error)return [];
 return records.filter(task=>{
 if(query.from&&(!task.date||task.date<query.from||task.date>query.to))return false;
 if(query.waiting&&task.day!=='waiting')return false;
 if(query.area&&task.area!==query.area)return false;
 if(!query.allStatuses&&Boolean(task.done)!==query.completed)return false;
 if(query.high&&task.priority!=='high')return false;
 const [hour,minute]=task.time.split(':').map(Number);
 if(query.hours.length&&(!query.hours.includes(hour)||(query.minute!==null&&minute!==query.minute)))return false;
 if(query.next&&(!task.date||new Date(task.date+'T'+task.time).getTime()<query.current))return false;
 const text=normalizePlannerQuestion(task.title+' '+getNoteHistory(task).map(n=>n.text).join(' '));
 return query.keywords.every(word=>text.includes(word));
 }).sort((a,b)=>((a.date||'9999')+a.time).localeCompare((b.date||'9999')+b.time));
}
async function answerPlannerQuestion(value){
 const query=parsePlannerQuestion(value),panel=document.querySelector('#plannerChat'),messages=document.querySelector('#plannerMessages');panel.hidden=false;messages.replaceChildren();
 const user=document.createElement('div');user.className='chat-question';user.textContent=value;messages.appendChild(user);
 const reply=document.createElement('div');reply.className='chat-answer';reply.textContent='Saved tasks খুঁজছি…';messages.appendChild(reply);messages.scrollTop=messages.scrollHeight;
 if(query.error){reply.textContent=query.error;return;}
 let tasks=lookupPlannerTasks(query);if(query.next)tasks=tasks.slice(0,1);
 const scope=[query.dateLabel,query.timeLabel,query.area].filter(Boolean).join(' · ');
 if(!tasks.length){reply.textContent=scope+' — কোনো matching saved task নেই। যেমন: “কাল সকাল 9টায় কী কাজ আছে”, “today office tasks”, বা “tomorrow 9:30 am” লিখতে পারেন।';return;}
 const shown=tasks.slice(0,20);reply.innerHTML='<p class="chat-summary">'+escapeHTML(scope)+' — '+tasks.length+'টি কাজ পাওয়া গেছে।'+(query.hours.length>1?' AM/PM বলেননি, তাই দুই সময়ই খোঁজা হয়েছে।':'')+'</p>';
 for(const task of shown){
 let files=[],fileError=false;try{files=await getAttachments(task.id);}catch{fileError=true;}
 const item=document.createElement('article');item.className='chat-task';
 const notes=getNoteHistory(task),latest=notes[notes.length-1];
 item.innerHTML='<button type="button" class="chat-task-open">'+escapeHTML(task.title)+'</button><p>'+escapeHTML(task.date||'Waiting list')+' · '+escapeHTML(formatTime(task.time))+' · '+escapeHTML(task.area)+' · '+(task.done?'Completed':task.priority==='high'?'High priority':'Open')+'</p>'+(latest?'<div class="chat-note">Latest note: '+escapeHTML(latest.text.slice(0,200)||'Files attached')+'</div>':'')+(files.length?'<div class="chat-files">Files: '+files.map(f=>escapeHTML(f.name)).join(', ')+'</div>':fileError?'<div class="chat-files">File storage unavailable; task details are shown above.</div>':'');
 item.querySelector('button').addEventListener('click',()=>{panel.hidden=true;messages.replaceChildren();openTaskDetails(task.id);});reply.appendChild(item);
 }
 if(tasks.length>shown.length){const more=document.createElement('p');more.textContent='প্রথম 20টি দেখানো হয়েছে। Date বা collection দিয়ে প্রশ্নটি আরও নির্দিষ্ট করুন।';reply.appendChild(more);}
 messages.scrollTop=messages.scrollHeight;
}
document.querySelector('#plannerAskForm').addEventListener('submit',async event=>{
 event.preventDefault();const input=document.querySelector('#plannerQuestion'),question=input.value.trim(),button=document.querySelector('#plannerAskButton');if(!question||button.disabled)return;
 button.disabled=true;input.value='';try{await answerPlannerQuestion(question);}catch{showToast('Could not search tasks. Please try again.');}finally{button.disabled=false;}
});
document.querySelector('#closePlannerChat').addEventListener('click',()=>{document.querySelector('#plannerChat').hidden=true;document.querySelector('#plannerMessages').replaceChildren();document.querySelector('#plannerQuestion').value='';});
