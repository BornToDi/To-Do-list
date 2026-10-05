const taskStore = [
  { id: 1, title: 'Finalize Q4 creative direction', area: 'Studio work', time: '09:30', priority: 'high', meta: 'Studio work', reminder: true, done: false, day: 'today' },
  { id: 2, title: 'Morning pages + 20 min meditation', area: 'Personal', time: '11:00', priority: 'normal', meta: 'Personal', reminder: false, done: true, day: 'today' },
  { id: 3, title: 'Send project brief to Maya', area: 'Studio work', time: '13:30', priority: 'high', meta: 'Studio work', reminder: true, done: false, day: 'today' },
  { id: 4, title: 'Take a proper lunch break', area: 'Health & mind', time: '14:00', priority: 'normal', meta: 'Health & mind', reminder: true, done: false, day: 'today' },
  { id: 5, title: 'Read 30 pages of The Creative Act', area: 'Personal', time: '21:00', priority: 'normal', meta: 'Personal', reminder: true, done: false, day: 'today' },
  { id: 6, title: 'Team sync and weekly alignment', area: 'Studio work', time: '09:30', priority: 'high', meta: 'Studio work', reminder: true, done: false, day: 'tomorrow' },
  { id: 7, title: 'Book dentist appointment', area: 'Health & mind', time: '11:30', priority: 'normal', meta: 'Health & mind', reminder: false, done: false, day: 'tomorrow' },
  { id: 8, title: 'Plan next week priorities', area: 'Personal', time: '16:00', priority: 'normal', meta: 'Personal', reminder: true, done: false, day: 'week' },
  { id: 9, title: 'Review monthly finances', area: 'Personal', time: '10:00', priority: 'high', meta: 'Personal', reminder: true, done: false, day: 'month' }
];
try { const saved = JSON.parse(localStorage.getItem('orbit-local-tasks')); if (Array.isArray(saved) && saved.every(t => t && typeof t.title === 'string' && typeof t.id === 'number' && typeof t.day === 'string')) taskStore.splice(0, taskStore.length, ...saved); } catch {}
for(const task of taskStore){if(task.area==='Studio work')task.area='Office';if(task.area==='Health & mind')task.area='Personal';task.meta=task.area;}
let activeView = 'today';
let activeCollection='';
const selectedTasks=new Set();
let editTaskId=null,pendingUploads=[],attachmentCache=[],attachmentURLs=[];
let fileDatabasePromise=null;
let noteAttachmentURLs=[];
function persistTasks() { try { localStorage.setItem('orbit-local-tasks', JSON.stringify(taskStore)); return true; } catch { showToast('Browser storage unavailable. Keep this tab open to retain changes.'); return false; } }
function escapeHTML(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
const lanes = [['today','Today'],['tomorrow','Tomorrow'],['week','This week'],['month','This month'],['waiting','Waiting list']];
function moveTask(id, day, beforeId) {
 const from = taskStore.findIndex(t => t.id === id); if (from < 0 || !lanes.some(l => l[0] === day) || id === beforeId) return;
 const [task] = taskStore.splice(from,1); task.day = day; task.date = scheduledDate(day); delete task.remindedAt;
 const before = taskStore.findIndex(t => t.id === beforeId); if(before >= 0) taskStore.splice(before,0,task); else taskStore.push(task);
 persistTasks(); renderTasks(); showToast('Moved to ' + lanes.find(l => l[0] === day)[1]);
}
const taskList = document.querySelector('#taskList');
const modal = document.querySelector('#modalBackdrop');
document.querySelector('.main-content').appendChild(modal);
const toast = document.querySelector('#toast');

function formatTime(time) { const [hour, minute] = time.split(':').map(Number); const suffix = hour >= 12 ? 'PM' : 'AM'; return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${suffix}`; }
function renderTasks() {
 const chosen = activeView === 'today' || activeView === 'inbox' ? lanes : activeView === 'upcoming' ? lanes.filter(l => l[0] !== 'today') : lanes.filter(l => l[0] === activeView);
 taskList.className = 'task-list planning-board';
 taskList.innerHTML = chosen.map(([day,label]) => {
  const items = taskStore.filter(t => t.day === day && (!activeCollection || t.area===activeCollection));
  return '<section class="board-lane" data-day="'+day+'"><div class="lane-heading"><div><span class="lane-kicker">'+(day==='waiting'?'UNSCHEDULED':'YOUR PLANS')+'</span><h3>'+label+' <small>'+items.length+'</small></h3></div><button class="lane-add" data-day="'+day+'" aria-label="Add task to '+label+'">+</button></div><div class="lane-cards">'+items.map(task => '<article class="task-row board-card '+(task.done?'done ':'')+(task.area==='Office'?'card-lilac':task.area==='Family'?'card-mint':'card-blue')+'" data-id="'+task.id+'" draggable="true"><div class="card-top"><time>'+(task.done?'Completed · ':'')+formatTime(task.time)+'</time><span class="drag-grip" aria-hidden="true">⠿</span></div><strong class="task-title">'+escapeHTML(task.title)+'</strong><span class="card-area">'+escapeHTML(task.area)+(task.date?' · '+escapeHTML(task.date):'')+'</span><div class="card-footer"><button class="task-check" aria-pressed="'+task.done+'" aria-label="'+(task.done?'Reopen':'Complete')+' task">'+(task.done?'&#10003;':'')+'</button><span class="priority '+task.priority+'">'+(task.priority==='high'?'High priority':'Normal')+'</span>'+(task.reminder?'<span title="Sound reminder 5 minutes before">♧</span>':'')+'</div><label class="move-label">Move to<select class="move-task" aria-label="Move '+escapeHTML(task.title)+'">'+lanes.map(([key,name])=>'<option value="'+key+'" '+(task.day===key?'selected':'')+'>'+name+'</option>').join('')+'</select></label></article>').join('')+'<div class="lane-empty">'+(items.length?'Drop a task here':'Nothing planned yet<br>Drop a task or click +')+'</div></div></section>';
 }).join('');
 taskList.querySelectorAll('.task-check').forEach(button=>{
 const id=Number(button.closest('.task-row').dataset.id);button.setAttribute('aria-label','Select task');button.setAttribute('aria-pressed',String(selectedTasks.has(id)));button.textContent=selectedTasks.has(id)?'✓':'';
 button.closest('.board-card').classList.toggle('selected-card',selectedTasks.has(id));
 button.addEventListener('click',()=>{if(selectedTasks.has(id))selectedTasks.delete(id);else selectedTasks.add(id);renderTasks();});
 });
 taskList.querySelectorAll('.board-card').forEach(card=>{
 card.tabIndex=0;card.setAttribute('aria-label','Open task details');
 card.addEventListener('click',e=>{if(!e.target.closest('button,select,label,.drag-grip'))openTaskDetails(Number(card.dataset.id));});
 card.addEventListener('keydown',e=>{if(e.target===card&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openTaskDetails(Number(card.dataset.id));}});
 });
 updateSelectionToolbar();
 taskList.querySelectorAll('.move-task').forEach(select=>select.addEventListener('change',()=>moveTask(Number(select.closest('.task-row').dataset.id),select.value)));
 taskList.querySelectorAll('.lane-add').forEach(button=>button.addEventListener('click',()=>{openModal();document.querySelector('#taskDate').value=button.dataset.day; document.querySelector('#taskExactDate').value=scheduledDate(button.dataset.day); document.querySelector('#taskExactDate').required=button.dataset.day!=='waiting';}));
 taskList.querySelectorAll('.board-card').forEach(card=>{
  card.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',card.dataset.id);e.dataTransfer.effectAllowed='move';card.classList.add('dragging');});
  card.addEventListener('dragend',()=>{card.classList.remove('dragging');taskList.querySelectorAll('.drop-active').forEach(l=>l.classList.remove('drop-active'));});
 });
 taskList.querySelectorAll('.board-lane').forEach(lane=>{
  lane.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';taskList.querySelectorAll('.drop-active').forEach(l=>l.classList.remove('drop-active'));lane.classList.add('drop-active');});
  lane.addEventListener('drop',e=>{e.preventDefault();const card=e.target.closest('.board-card');moveTask(Number(e.dataTransfer.getData('text/plain')),lane.dataset.day,card?Number(card.dataset.id):undefined);});
 });
 taskList.querySelectorAll('.drag-grip').forEach(grip=>grip.addEventListener('pointerdown',e=>{
  if(e.pointerType==='mouse')return;
  e.preventDefault(); const card=grip.closest('.board-card'),id=Number(card.dataset.id),ghost=card.cloneNode(true);
  ghost.classList.add('drag-ghost');ghost.style.width=card.offsetWidth+'px';document.body.appendChild(ghost);
  const move=ev=>{ghost.style.left=ev.clientX+12+'px';ghost.style.top=ev.clientY+12+'px';};move(e);
  const stop=ev=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',stop);document.removeEventListener('pointercancel',cancel);ghost.remove();const target=document.elementFromPoint(ev.clientX,ev.clientY),lane=target?.closest('.board-lane'),before=target?.closest('.board-card');if(lane)moveTask(id,lane.dataset.day,before?Number(before.dataset.id):undefined);};
  const cancel=()=>{ghost.remove();document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',stop);document.removeEventListener('pointercancel',cancel);};
  document.addEventListener('pointermove',move);document.addEventListener('pointerup',stop);document.addEventListener('pointercancel',cancel);
 }));
 updateStats();
}
function updateStats() {
  const today = taskStore.filter(task => task.day === 'today');
  const done = today.filter(task => task.done).length;
  const percent = today.length ? Math.round((done / today.length) * 100) : 0;
  document.querySelector('#progressPercent').textContent = `${percent}%`;
  document.querySelector('#progressBar').style.width = `${percent}%`;
  document.querySelector('#openCount').textContent = String(taskStore.filter(task => !task.done).length).padStart(2, '0');
  document.querySelector('#todayNavCount').textContent = String(today.filter(task => !task.done).length);
  document.querySelector('[data-view="inbox"] b').textContent = String(taskStore.filter(task => !task.done).length);
  document.querySelector('[data-view="upcoming"] b').textContent = String(taskStore.filter(task => !task.done && task.day !== 'today').length);
}
function toggleTask(id) { const task = taskStore.find(item => item.id === id); if (task) { task.done = !task.done; persistTasks(); renderTasks(); showToast(task.done ? 'Task complete. Nice work.' : 'Task moved back to your orbit.'); } }
function switchView(view) { if(modal.classList.contains('open'))closeModal(); activeView = view; activeCollection='';document.querySelectorAll('[data-collection]').forEach(button=>button.classList.remove('active'));const labels = { today: ['My planning board', 'Monday · 5 focused tasks'], upcoming: ['Upcoming', 'Your next steps, in order'], inbox: ['Inbox', 'Select tasks to complete or reopen; click a card for details'], tomorrow: ['Tomorrow', 'Your plans for tomorrow'], week: ['This week', 'Your plans for the week'], month: ['This month', 'Your plans for the month'], waiting: ['Waiting list', 'Tasks to schedule later'] }; document.querySelector('#viewTitle').textContent = labels[view][0]; document.querySelector('#viewSubtitle').textContent = labels[view][1]; document.querySelectorAll('.nav-item[data-view]').forEach(item => item.classList.toggle('active', item.dataset.view === view)); renderTasks(); }
function showToast(message) { toast.querySelector('span').textContent = message; toast.classList.add('show'); clearTimeout(window.toastTimer); window.toastTimer = setTimeout(() => toast.classList.remove('show'), 2800); }
function openModal(route = true) { editTaskId=null;pendingUploads=[];clearAttachmentURLs();document.querySelector('#taskForm').reset();if(activeCollection)document.querySelector('#taskArea').value=activeCollection;renderPendingUploads();renderNoteHistory(null);document.querySelector('#modalTitle').textContent='New task';document.querySelector('#saveTaskButton').textContent='Create task';document.querySelector('#attachmentList').innerHTML='<p class="files-hint">Choose files to attach to this task.</p>';document.querySelector('#taskDetailsStatus').textContent='New task';document.querySelector('#taskExactDate').value = scheduledDate('today'); document.querySelector('#taskExactDate').required=true; showTaskPage(); if(route !== false && location.hash !== '#new')location.hash='new'; document.querySelector('#taskName').focus(); }
function closeModal() { modal.classList.remove('open'); modal.hidden=true;document.querySelector('.content-wrap').hidden=false;if(location.hash)location.hash='';document.title='Orbit // Personal Command Center'; clearAttachmentURLs();pendingUploads=[];editTaskId=null;document.querySelector('#taskForm').reset(); }

document.querySelectorAll('.nav-item[data-view]').forEach(item => item.addEventListener('click', () => switchView(item.dataset.view)));
document.querySelector('#newTaskButton').addEventListener('click', openModal);
document.querySelector('.close-modal').addEventListener('click', closeModal);

document.addEventListener('keydown', event => { if (event.key.toLowerCase() === 'n' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) openModal(); if (event.key === 'Escape') closeModal(); });
document.querySelector('#taskForm').addEventListener('submit',async event=>{
 event.preventDefault();const button=document.querySelector('#saveTaskButton');if(button.disabled)return;button.disabled=true;document.querySelector('#saveNoteButton').disabled=true;
 const previous=taskStore.find(t=>t.id===editTaskId),task={...previous,id:editTaskId||Date.now(),title:document.querySelector('#taskName').value.trim(),area:document.querySelector('#taskArea').value,time:document.querySelector('#taskTime').value,priority:document.querySelector('#taskPriority').value,meta:document.querySelector('#taskArea').value,reminder:document.querySelector('#taskReminder').checked,done:previous?.done||false,day:document.querySelector('#taskDate').value,date:document.querySelector('#taskExactDate').value,notes:previous?.notes||'',noteHistory:buildNoteHistory(previous,document.querySelector('#taskNotes').value,pendingUploads.map(upload=>upload.id))};
 try{
 if(!task.title)throw Error('Enter a task name.');
 if(previous&&(previous.date!==task.date||previous.time!==task.time))delete task.remindedAt;
 if(pendingUploads.length)await storeAttachments(task.id,pendingUploads,task.noteHistory[task.noteHistory.length-1].id);
 const snapshot=taskStore.map(t=>({...t}));
 if(previous)Object.assign(previous,task);else taskStore.unshift(task);
 if(!persistTasks()){taskStore.splice(0,taskStore.length,...snapshot);throw Error('Could not save. Your note is still here; please retry.');}
 pendingUploads=[];renderTasks();openTaskDetails(task.id);showToast('Task and notes saved.');
 }catch(error){document.querySelector('#fileError').textContent=error.message;}finally{button.disabled=false;document.querySelector('#saveNoteButton').disabled=false;}
});

document.querySelector('#notificationButton').addEventListener('click', () => { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); showToast('You are all caught up.'); });
document.querySelector('.toggle').addEventListener('click', event => { event.currentTarget.classList.toggle('on'); showToast(event.currentTarget.classList.contains('on') ? 'Focus mode is on.' : 'Focus mode is off.'); });
document.querySelector('#searchButton').addEventListener('click',()=>document.querySelector('#plannerQuestion').focus());
document.querySelector('#seeAllButton').addEventListener('click', () => switchView('upcoming'));

const now = new Date();
document.querySelector('#dateLabel').textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: '2-digit', year: 'numeric' }).toUpperCase();
renderTasks();

// Five-minute reminders use an anchored date in the device's local timezone.
function localDateKey(date) { return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0'); }
function scheduledDate(day, current = new Date()) {
 const date = new Date(current); date.setHours(12,0,0,0);
 if(day==='waiting')return '';
 if(day==='tomorrow')date.setDate(date.getDate()+1);
 if(day==='week')date.setDate(date.getDate()+7);
 if(day==='month')date.setMonth(date.getMonth()+1,0);
 return localDateKey(date);
}
let reminderAudio = null, soundReady = false;
async function prepareSound() {
 const Audio = window.AudioContext || window.webkitAudioContext;
 if(!Audio)throw new Error('This browser does not support reminder sound.');
 if(!reminderAudio)reminderAudio = new Audio();
 await reminderAudio.resume();
 if(reminderAudio.state !== 'running')throw new Error('Allow sound in your browser site settings.');
 soundReady = true;
 document.querySelector('#enableSound').textContent = 'Sound enabled';
 document.querySelector('#soundStatus').textContent = '5 min before · Keep this tab open';
}
let activeSound = null;
function stopReminderSound() {
 const source=activeSound;activeSound=null;
 if(source){try{source.stop();}catch{}source.disconnect();}
 document.querySelector('#stopSound').hidden=true;
}
function playReminderSound(repeat = false) {
 if(!soundReady || !reminderAudio)return;
 if(reminderAudio.state !== 'running'){
  soundReady=false;document.querySelector('#enableSound').textContent='Enable sound';
  document.querySelector('#soundStatus').textContent='Sound paused - click Enable sound';return;
 }
 // A looping audio buffer continues without a JavaScript timer driving each ring.
 if(activeSound && activeSound.loop)return;
 stopReminderSound();
 const context=reminderAudio,rate=context.sampleRate,length=Math.ceil(rate*3.6);
 const buffer=context.createBuffer(1,length,rate),samples=buffer.getChannelData(0);
 for(let i=0;i<9;i++){
  const offset=Math.floor(i*.32*rate),freq=[660,880,1100][i%3];
  for(let n=0;n<Math.floor(.28*rate);n++){
   const t=n/rate,envelope=Math.min(t/.02,1)*Math.exp(-18*t);
   samples[offset+n]=.18*envelope*Math.sin(2*Math.PI*freq*t);
  }
 }
 const source=context.createBufferSource();source.buffer=buffer;source.loop=repeat;
 source.connect(context.destination);activeSound=source;
 source.onended=()=>{source.disconnect();if(activeSound===source){activeSound=null;document.querySelector('#stopSound').hidden=true;}};
 document.querySelector('#stopSound').hidden=false;
 source.start();
}
function isReminderDue(task, time) {
 if(task.done || !task.reminder || task.day==='waiting' || !task.date)return false;
 const due=new Date(task.date+'T'+task.time).getTime();
 return Number.isFinite(due) && time >= due-5*60000 && time < due && task.remindedAt!==due;
}
function checkReminders(time = Date.now()) {
 for(const task of taskStore){
  if(!isReminderDue(task,time))continue;
  const due=new Date(task.date+'T'+task.time).getTime();
  task.remindedAt=due;persistTasks();
  playReminderSound(true);
  document.querySelector('#reminderMessage').textContent=task.title+' · '+formatTime(task.time)+' — starts within 5 minutes';
  document.querySelector('#reminderAlert').hidden=false;
  if('Notification' in window && Notification.permission==='granted')try{new Notification('Orbit: task starts soon',{body:task.title+' · '+formatTime(task.time),tag:'orbit-'+task.id+'-'+due});}catch{}
 }
}
for(const task of taskStore)if(task.date===undefined)task.date=scheduledDate(task.day);
persistTasks();renderTasks();
document.querySelector('#taskDate').addEventListener('change',event=>{document.querySelector('#taskExactDate').value=scheduledDate(event.target.value); document.querySelector('#taskExactDate').required=event.target.value!=='waiting';});
document.querySelector('#enableSound').addEventListener('click',async()=>{
 try{await prepareSound();playReminderSound();if('Notification' in window && Notification.permission==='default')try{await Notification.requestPermission();}catch{} }catch(error){showToast(error.message);}
});
document.querySelector('#testSound').addEventListener('click',async()=>{try{await prepareSound();playReminderSound(true);}catch(error){showToast(error.message);}});
document.querySelector('#stopSound').addEventListener('click',stopReminderSound);
document.querySelector('#dismissReminder').addEventListener('click',()=>{stopReminderSound();document.querySelector('#reminderAlert').hidden=true;});
setInterval(checkReminders,1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkReminders();});
checkReminders();

const themeToggle = document.querySelector('#themeToggle');
function updateThemeButton() {
 const dark = document.documentElement.dataset.theme === 'dark';
 themeToggle.textContent = dark ? 'Light' : 'Dark';
 themeToggle.setAttribute('aria-pressed',String(dark));
 themeToggle.setAttribute('aria-label',dark ? 'Switch to light background' : 'Switch to dark background');
}
themeToggle.addEventListener('click',()=>{
 const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
 document.documentElement.dataset.theme = theme;
 try { localStorage.setItem('orbit-theme',theme); } catch {}
 updateThemeButton();
});
updateThemeButton();

function updateSelectionToolbar(){
 const count=selectedTasks.size;document.querySelector('#selectedCount').textContent=count+' selected';
 for(const id of ['completeSelected','reopenSelected','clearSelection'])document.querySelector('#'+id).disabled=!count;
}
function setSelectedCompletion(done){
 for(const task of taskStore)if(selectedTasks.has(task.id))task.done=done;
 selectedTasks.clear();persistTasks();renderTasks();showToast(done?'Selected tasks completed.':'Selected tasks reopened.');
}
function clearAttachmentURLs(){for(const url of noteAttachmentURLs)URL.revokeObjectURL(url);noteAttachmentURLs=[];for(const url of attachmentURLs)URL.revokeObjectURL(url);attachmentURLs=[];attachmentCache=[];document.querySelector('#fileError').textContent='';}
function fileDatabase(){
 if(!window.indexedDB)return Promise.reject(Error('File storage unavailable. Open this app in a regular browser window.'));
 if(!fileDatabasePromise)fileDatabasePromise=new Promise((resolve,reject)=>{
 const request=indexedDB.open('orbit-office-files',1);
 request.onupgradeneeded=()=>{const store=request.result.createObjectStore('files',{keyPath:'id'});store.createIndex('taskId','taskId');};
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>{fileDatabasePromise=null;reject(Error('Could not open file storage.'));};
 });return fileDatabasePromise;
}
async function storeAttachments(taskId,files,noteId=null){
 const db=await fileDatabase();return new Promise((resolve,reject)=>{
 const transaction=db.transaction('files','readwrite'),store=transaction.objectStore('files');
 for(const entry of files){const file=entry.file||entry;store.put({id:entry.file?entry.id:crypto.randomUUID(),taskId,noteId,name:file.name,type:file.type,size:file.size,blob:file});}
 transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(Error('Could not save files. Check browser storage space.'));transaction.onabort=()=>reject(Error('File save failed. Your selected files are still available to retry.'));
 });
}
async function getAttachments(taskId){const db=await fileDatabase();return new Promise((resolve,reject)=>{const r=db.transaction('files').objectStore('files').index('taskId').getAll(taskId);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('Could not load attachments. Reopen this task to retry.'));});}
async function deleteAttachment(id){const db=await fileDatabase();return new Promise((resolve,reject)=>{const t=db.transaction('files','readwrite');t.objectStore('files').delete(id);t.oncomplete=resolve;t.onerror=()=>reject(Error('Could not remove attachment.'));});}
function downloadAttachment(file){const url=URL.createObjectURL(file.blob),a=document.createElement('a');a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
async function shareAttachment(file){
 const sharedFile=new File([file.blob],file.name,{type:file.type});
 if(navigator.share&&navigator.canShare?.({files:[sharedFile]})){
 try{await navigator.share({files:[sharedFile],title:file.name});}catch(error){if(error.name!=='AbortError')showToast('Sharing failed. Use Download and attach the file in your email or chat.');}
 }else{downloadAttachment(file);showToast('File downloaded. Attach it in your email or chat to share.');}
}
async function renderAttachments(taskId){
 try{const files=await getAttachments(taskId);if(editTaskId!==taskId)return;clearAttachmentURLs();attachmentCache=files;
 const history=getNoteHistory(taskStore.find(t=>t.id===taskId));const taskFiles=files.filter(file=>!file.noteId&&!history.some(note=>(note.fileIds||[]).includes(file.id)));
 const list=document.querySelector('#attachmentList');list.innerHTML=taskFiles.length?taskFiles.map(file=>{
 const url=URL.createObjectURL(file.blob);attachmentURLs.push(url);
 const image=/^image\/(png|jpeg|gif|webp|avif|bmp)$/.test(file.type);
 return '<article class="attachment">'+(image?'<a href="'+url+'" target="_blank" rel="noopener"><img class="file-thumb" src="'+url+'" alt="'+escapeHTML(file.name)+'"></a>':'<span class="file-icon">'+(file.type==='application/pdf'?'PDF':'FILE')+'</span>')+'<div class="file-info"><strong>'+escapeHTML(file.name)+'</strong><small>'+Math.max(1,Math.round(file.size/1024))+' KB</small></div><div class="file-actions">'+(file.type==='application/pdf'?'<a href="'+url+'" target="_blank" rel="noopener">Open PDF</a>':'')+'<button type="button" data-file="'+file.id+'" data-action="download">Download</button><button type="button" data-file="'+file.id+'" data-action="share">Share</button><button type="button" data-file="'+file.id+'" data-action="remove">Remove</button></div></article>';
 }).join(''):'<p class="files-hint">New files appear next to their saved note in history.</p>';
 list.querySelectorAll('[data-file]').forEach(button=>button.addEventListener('click',async()=>{const file=attachmentCache.find(f=>f.id===button.dataset.file);if(!file)return;if(button.dataset.action==='download')downloadAttachment(file);else if(button.dataset.action==='share')await shareAttachment(file);else{button.disabled=true;try{await deleteAttachment(file.id);await renderAttachments(taskId);}catch(error){document.querySelector('#fileError').textContent=error.message;button.disabled=false;}}}));
 renderNoteHistory(taskStore.find(t=>t.id===taskId));
 }catch(error){if(editTaskId===taskId)document.querySelector('#fileError').textContent=error.message;}
}
function openTaskDetails(id){
 const task=taskStore.find(t=>t.id===id);if(!task)return;openModal(false);editTaskId=id;if(location.hash!=='#task/'+id)location.hash='task/'+id;document.title=task.title+' | Orbit';
 document.querySelector('#modalTitle').textContent='Task details';document.querySelector('#saveTaskButton').textContent='Save changes';document.querySelector('#taskDetailsStatus').textContent=task.done?'Completed':'In progress';
 for(const [field,value] of Object.entries({taskName:task.title,taskDate:task.day,taskTime:task.time,taskExactDate:task.date||'',taskArea:task.area,taskPriority:task.priority,taskNotes:''}))document.querySelector('#'+field).value=value;
 renderNoteHistory(task);document.querySelector('#taskReminder').checked=task.reminder;document.querySelector('#taskExactDate').required=task.day!=='waiting';document.querySelector('#attachmentList').innerHTML='<p class="files-hint">Loading attachments...</p>';void renderAttachments(id);
}
document.querySelector('#completeSelected').addEventListener('click',()=>setSelectedCompletion(true));
document.querySelector('#reopenSelected').addEventListener('click',()=>setSelectedCompletion(false));
document.querySelector('#clearSelection').addEventListener('click',()=>{selectedTasks.clear();renderTasks();});
document.querySelector('#attachmentInput').addEventListener('change',event=>{
 const input=event.target,files=Array.from(input.files||[]);if(!files.length)return;
 if(files.some(f=>f.size>25*1024*1024)){document.querySelector('#fileError').textContent='Each file must be 25 MB or smaller.';input.value='';return;}
 document.querySelector('#fileError').textContent='';
 pendingUploads.push(...files.map(file=>({id:crypto.randomUUID(),file})));renderPendingUploads();input.value='';
});
function renderPendingUploads(){
 const list=document.querySelector('#pendingAttachmentList');
 list.innerHTML=pendingUploads.map(upload=>'<div class="pending-file"><span>'+escapeHTML(upload.file.name)+'</span><button type="button" data-pending="'+upload.id+'" aria-label="Remove selected file">Remove</button></div>').join('');
 list.querySelectorAll('[data-pending]').forEach(button=>button.addEventListener('click',()=>{pendingUploads=pendingUploads.filter(u=>u.id!==button.dataset.pending);renderPendingUploads();}));
}
updateSelectionToolbar();

function showTaskPage(){
 modal.hidden=false;modal.classList.add('open');document.querySelector('.content-wrap').hidden=true;
 document.querySelector('.breadcrumbs strong').textContent='Task workspace';window.scrollTo(0,0);
}
function syncTaskRoute(){
 const route=location.hash;
 if(route==='#new'){if(!modal.classList.contains('open'))openModal(false);return;}
 const match=route.match(/^#task\/(\d+)$/);
 if(match){const id=Number(match[1]);if(taskStore.some(t=>t.id===id)){if(editTaskId!==id||!modal.classList.contains('open'))openTaskDetails(id);return;}showToast('Task not found.');}
 if(modal.classList.contains('open'))closeModal();
 document.querySelector('.breadcrumbs strong').textContent='Planning board';
}
window.addEventListener('hashchange',syncTaskRoute);
syncTaskRoute();

function getNoteHistory(task){
 if(Array.isArray(task?.noteHistory))return task.noteHistory;
 if(task?.notes?.trim())return [{id:'legacy-'+task.id,text:task.notes,createdAt:null}];
 return [];
}
function buildNoteHistory(task,text,fileIds=[]){
 const history=getNoteHistory(task).slice();
 if(text.trim()||fileIds.length)history.push({id:crypto.randomUUID(),text:text.trim(),createdAt:new Date().toISOString(),fileIds:fileIds.slice()});
 return history;
}
function renderNoteHistory(task){
 for(const url of noteAttachmentURLs)URL.revokeObjectURL(url);noteAttachmentURLs=[];
 const history=getNoteHistory(task),list=document.querySelector('#noteHistory');
 document.querySelector('#noteCount').textContent=history.length+' saved';
 list.innerHTML=history.length?history.map((note,index)=>{
 const files=attachmentCache.filter(file=>(note.fileIds||[]).includes(file.id)||file.noteId===note.id);
 const attached=files.map(file=>{
 const url=URL.createObjectURL(file.blob);noteAttachmentURLs.push(url);const image=/^image\/(png|jpeg|gif|webp|avif|bmp)$/.test(file.type),pdf=file.type==='application/pdf';
 return '<div class="note-file">'+(image?'<a href="'+url+'" target="_blank" rel="noopener"><img src="'+url+'" alt="'+escapeHTML(file.name)+'"></a>':'')+'<span>'+escapeHTML(file.name)+'</span><div class="note-file-actions">'+(pdf?'<a href="'+url+'" target="_blank" rel="noopener">Open PDF</a>':'')+'<button type="button" data-note-file="'+file.id+'" data-action="download">Download</button><button type="button" data-note-file="'+file.id+'" data-action="share">Share</button></div></div>';
 }).join('');
 return '<li class="saved-note"><strong class="note-number">#'+(index+1)+'</strong><div class="note-content"><div class="note-body"><p>'+escapeHTML(note.text||'Files attached')+'</p><time>'+escapeHTML(note.createdAt?new Date(note.createdAt).toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'Earlier note')+'</time></div>'+(attached?'<div class="note-files">'+attached+'</div>':'')+'</div></li>';
 }).join(''):'<li class="notes-empty">Saved notes will appear here in order.</li>';
 list.querySelectorAll('[data-note-file]').forEach(button=>button.addEventListener('click',()=>{const file=attachmentCache.find(f=>f.id===button.dataset.noteFile);if(!file)return;if(button.dataset.action==='share')void shareAttachment(file);else downloadAttachment(file);}));
}

document.querySelector('#saveNoteButton').addEventListener('click',()=>{
 if(!document.querySelector('#taskNotes').value.trim()&&!pendingUploads.length){showToast('Write a note or choose files first.');document.querySelector('#taskNotes').focus();return;}
 document.querySelector('#taskForm').requestSubmit();
});

document.querySelectorAll('[data-collection]').forEach(button=>button.addEventListener('click',()=>{
 if(modal.classList.contains('open'))closeModal();
 activeCollection=activeCollection===button.dataset.collection?'':button.dataset.collection;
 selectedTasks.clear();activeView='today';
 document.querySelectorAll('[data-collection]').forEach(item=>{const active=item.dataset.collection===activeCollection;item.classList.toggle('active',active);item.setAttribute('aria-pressed',String(active));});
 document.querySelector('#viewTitle').textContent=activeCollection?activeCollection+' collection':'My planning board';
 document.querySelector('#viewSubtitle').textContent=activeCollection?'Click the collection again to show all tasks':'Select tasks to complete; click a card for details';
 document.querySelectorAll('.nav-item[data-view]').forEach(item=>item.classList.toggle('active',!activeCollection&&item.dataset.view==='today'));
 renderTasks();
}));
