'use strict';
const $=id=>document.getElementById(id),clone=v=>JSON.parse(JSON.stringify(v));
function setWorkspaceCollapsed(collapsed){
 const sidebar=document.querySelector('.sidebar'),button=$('toggleWorkspace');
 const path=collapsed?'M9 6l6 6-6 6':'M15 6l-6 6 6 6';
 sidebar.classList.toggle('is-collapsed',collapsed);
 button.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+path+'"/></svg>';
 button.dataset.tooltip=collapsed?'展开工作台':'收起工作台';button.removeAttribute('title');button.setAttribute('aria-label',button.dataset.tooltip);button.setAttribute('aria-expanded',String(!collapsed));
 try{localStorage.setItem('prd-workspace-collapsed',String(collapsed));}catch(e){}
}
let workspaceCollapsed=false;try{workspaceCollapsed=localStorage.getItem('prd-workspace-collapsed')==='true';}catch(e){}setWorkspaceCollapsed(workspaceCollapsed);
$('toggleWorkspace').onclick=()=>setWorkspaceCollapsed(!document.querySelector('.sidebar').classList.contains('is-collapsed'));
const sidebarTooltip=document.createElement('div');sidebarTooltip.className='sidebar-tooltip';sidebarTooltip.id='sidebarTooltip';sidebarTooltip.role='tooltip';sidebarTooltip.hidden=true;document.body.append(sidebarTooltip);let sidebarTipTimer,sidebarTipButton;
function hideSidebarTip(){clearTimeout(sidebarTipTimer);sidebarTooltip.hidden=true;if(sidebarTipButton)sidebarTipButton.removeAttribute('aria-describedby');sidebarTipButton=null;}
function showSidebarTip(button){hideSidebarTip();sidebarTipButton=button;sidebarTipTimer=setTimeout(()=>{if(!button.isConnected)return;const text=button.dataset.tooltip||button.getAttribute('aria-label')||button.textContent.trim();sidebarTooltip.textContent=text;sidebarTooltip.hidden=false;button.setAttribute('aria-describedby','sidebarTooltip');const rect=button.getBoundingClientRect(),sidebar=document.querySelector('.sidebar').getBoundingClientRect();sidebarTooltip.style.left=(sidebar.right+8)+'px';sidebarTooltip.style.top=Math.max(8,Math.min(window.innerHeight-sidebarTooltip.offsetHeight-8,rect.top+(rect.height-sidebarTooltip.offsetHeight)/2))+'px';},220);}
const sidebarNav=document.querySelector('.sidebar');sidebarNav.addEventListener('pointerover',e=>{const b=e.target.closest('button');if(b&&b!==sidebarTipButton)showSidebarTip(b);});sidebarNav.addEventListener('pointerout',e=>{if(sidebarTipButton&&!sidebarTipButton.contains(e.relatedTarget))hideSidebarTip();});sidebarNav.addEventListener('focusin',e=>{const b=e.target.closest('button');if(b)showSidebarTip(b);});sidebarNav.addEventListener('focusout',hideSidebarTip);sidebarNav.addEventListener('click',hideSidebarTip);sidebarNav.addEventListener('scroll',hideSidebarTip,true);window.addEventListener('resize',hideSidebarTip);
$('createProject').dataset.tooltip='创建项目';$('openDoc').dataset.tooltip='打开 PRD 文件';$('associate').dataset.tooltip='关联 .prdproj 文件';
sidebarNav.addEventListener('keydown',e=>{if(e.key==='Escape')hideSidebarTip();});
let state={settings:{projects:[],recent:[],selected:null},current:null},dirty=false,timer=null,historyTimer=null,saveChain=Promise.resolve(),history=[],historyIndex=-1,loading=false,toastTimer;
const documentTabs=new Map();let documentNavigationBusy=false;
window.editorDocument=null;
window.activeLoadToken='';
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3500);}
window.reportError=function(text){const info=window.describePrdError(text);$('errorText').textContent=info.message;$('errorTechnical').textContent=info.details;$('errorDetails').hidden=!info.details;$('errorDetails').open=false;if(!$('errorDialog').open)$('errorDialog').showModal();};
async function api(name,...args){if(reviewMic.active&&['openDoc','closeDoc','newDoc','createDocInFolder','importHtml','createProject','selectProject','removeProject','restore','locateProject'].includes(name))throw Error('请先结束录音并保存，再切换文档或项目。');const r=await window.desktop[name](...args);if(!r.ok)throw new Error(r.error);return r.value;}

const reviewMic=new MicCapture({
 target:async()=>{if(!state.current||loading)throw Error('请先打开PRD并等待加载完成。');await flush();return api('micRecordingTarget');},
 begin:target=>api('beginMicRecording',target.docPath),
 append:(id,index,data,samples,rate,target)=>api('appendMicRecording',id,index,data,samples,rate,target.docPath),
 finish:(id,target)=>api('finishMicRecording',id,target.docPath),
 ack:(id,target)=>api('ackMicRecording',id,target.docPath),
 status:()=>syncReviewMic(),error:e=>window.reportError(e.message),
 save:async(base64,target,result)=>{const saved=result||await api('saveMicRecording',base64,target.docPath);toast('录音已保存到文件，尚未加入PRD：'+saved.file);await refreshDirectory().catch(()=>{});}
});
function syncReviewMic(){const phase=reviewMic.phase,elapsed=reviewMic.elapsed,time=String(Math.floor(elapsed/60)).padStart(2,'0')+':'+String(elapsed%60).padStart(2,'0'),text=phase==='recording'?'结束录音':phase==='requesting'?'请求麦克风…':['draining','saving'].includes(phase)?'正在保存…':phase==='retry'?'重试保存':'开始录音';const vm=$('editor').contentWindow?.__prdVM;if(vm){vm.micState=phase;vm.micText=text;vm.micTime=time;}$('micBar').hidden=true;$('micBarText').textContent=phase==='recording'?'正在录音 '+time+' · 结束后自动保存MP3到项目/评审录音':text;$('micBarStop').textContent=phase==='recording'?'■':phase==='retry'?'↻':'…';$('micBarStop').title=text;$('micBarStop').setAttribute('aria-label',text);$('micBarStop').disabled=['requesting','draining','saving'].includes(phase);}
window.toggleReviewMic=action(async()=>reviewMic.phase==='retry'?reviewMic.persist():reviewMic.toggle());
$('micBarStop').onclick=window.toggleReviewMic;
function action(fn){return async()=>{try{await fn();}catch(e){window.reportError(e.message);}};}
function status(text,type=''){$('retrySave').hidden=type!=='error';$('saveStatus').title=type==='error'?'未写入磁盘。可重试保存；如文件在外部发生修改，请另存为以保留当前内容。':text.includes('草稿')?'草稿已写入文件，但尚未提交为正文。请在编辑弹框中点击保存。':'当前文档的磁盘保存状态';$('saveStatus').textContent=text;$('saveStatus').className='status '+type;updateDocumentTabIndicators();}
const documentKey=file=>String(file).toLowerCase();
function ensureDocumentTab(){if(!state.current)return;const key=documentKey(state.current.path),tab=documentTabs.get(key)||{path:state.current.path,history:[],index:-1,signature:null};tab.title=state.current.doc.data.title||'未命名 PRD';documentTabs.set(key,tab);}
function rememberDocumentTab(){if(!state.current)return;ensureDocumentTab();const tab=documentTabs.get(documentKey(state.current.path));tab.history=history.slice();tab.index=historyIndex;tab.signature=signature({data:state.current.doc.data,draft:state.current.doc.draft||{}});}
function updateDocumentTabIndicators(){
 if(!state.current)return;ensureDocumentTab();const key=documentKey(state.current.path),tab=documentTabs.get(key);
 for(const row of $('documentTabs').children)if(row.dataset.key===key){row.querySelector('.document-tab-label').textContent=tab.title;row.querySelector('[role="tab"]').setAttribute('aria-label',tab.title);row.querySelector('.document-tab-close').setAttribute('aria-label','关闭 '+tab.title);const dot=row.querySelector('.document-tab-state');dot.hidden=!dirty;dot.title=dirty?'尚未保存':'已保存';}
}
function drawDocumentTabs(){
 ensureDocumentTab();const list=$('documentTabs');list.replaceChildren();$('documentTabBar').hidden=!documentTabs.size;$('tabNewDoc').disabled=!activeProject();
 for(const [key,tab]of documentTabs){const row=document.createElement('div');row.className='document-tab'+(key===documentKey(state.current?.path)?' active':'');row.dataset.key=key;row.title=tab.path;
  const select=document.createElement('button');select.className='document-tab-select';select.setAttribute('role','tab');select.setAttribute('aria-selected',String(key===documentKey(state.current?.path)));select.setAttribute('aria-label',tab.title);
  const icon=document.createElement('span');icon.className='document-tab-icon';icon.textContent='PRD';icon.setAttribute('aria-hidden','true');const label=document.createElement('span');label.className='document-tab-label';label.textContent=tab.title;const dot=document.createElement('span');dot.className='document-tab-state';dot.textContent='●';dot.hidden=true;dot.setAttribute('aria-hidden','true');select.append(icon,label,dot);
  select.onclick=action(()=>switchDocumentTab(tab.path));select.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const tabs=[...documentTabs.values()],index=tabs.findIndex(t=>documentKey(t.path)===key),next=tabs[index+(e.key==='ArrowLeft'?-1:1)];if(next)action(()=>switchDocumentTab(next.path))();}};
  const close=document.createElement('button');close.className='document-tab-close';close.textContent='×';close.setAttribute('aria-label','关闭 '+tab.title);close.title='关闭标签';close.onclick=action(()=>closeDocumentTab(tab.path));row.append(select,close);list.append(row);
 }
 updateDocumentTabIndicators();
 list.querySelector('.document-tab.active')?.scrollIntoView({block:'nearest',inline:'nearest'});
}
async function switchDocumentTab(file){
 if(documentKey(file)===documentKey(state.current?.path)){closeFilePreview();$('dashboard').hidden=true;$('editor').hidden=false;return;}
 await open(file);
}
async function closeDocumentTab(file){
 if(documentNavigationBusy)return;
 const key=documentKey(file);if(key!==documentKey(state.current?.path)){documentTabs.delete(key);drawDocumentTabs();return;}
 await flush();const entries=[...documentTabs.values()],index=entries.findIndex(t=>documentKey(t.path)===key),neighbor=entries[index+1]||entries[index-1];
 if(neighbor){await open(neighbor.path);if(documentKey(state.current?.path)===documentKey(neighbor.path))documentTabs.delete(key);drawDocumentTabs();return;}
 state=await api('closeDoc');documentTabs.delete(key);dirty=false;loading=false;history=[];historyIndex=-1;window.activeLoadToken='';window.editorDocument=null;clearTimeout(timer);clearTimeout(historyTimer);$('editor').src='about:blank';status('本地工作空间');await showDashboard();
}
function activeProject(){return state.settings.projects.find(p=>p.id===state.settings.selected);}
const directoryStates=new Map();let directoryEpoch=0;
let previewPath=null,previewReturn='dashboard',filterTimer,filterEpoch=0;
function closeFilePreview(){previewPath=null;$('filePreview').hidden=true;$('previewImage').removeAttribute('src');if(previewReturn==='editor'&&state.current){$('editor').hidden=false;$('dashboard').hidden=true;}highlightDirectory();}
async function openDirectoryEntry(p,entry){
 if(entry.kind==='folder')return;
 if(entry.kind==='prd'){
  closeFilePreview();
  if(state.current?.path.toLowerCase()===entry.path.toLowerCase()){await flush();$('dashboard').hidden=true;$('editor').hidden=false;}else await open(entry.path);
 }else{
  await flush();const info=await api('previewProjectFile',p.id,entry.relative);
  if($('filePreview').hidden)previewReturn=$('editor').hidden?'dashboard':'editor';
  previewPath=entry.path;$('dashboard').hidden=true;$('editor').hidden=true;$('filePreview').hidden=false;
  $('previewName').textContent=info.name;$('previewMeta').textContent=info.path+' · '+(info.size/1024).toFixed(1)+' KB · '+new Date(info.modified).toLocaleString('zh-CN');
  $('previewText').hidden=info.kind==='image';$('previewText').textContent=info.kind==='image'?'':info.content;
  $('previewImage').hidden=info.kind!=='image';if(info.kind==='image')$('previewImage').src=info.content;else $('previewImage').removeAttribute('src');
 }
 highlightDirectory();
}
function directoryState(p){const key=p.id+'|'+p.root;let s=directoryStates.get(key);if(!s){s={children:new Map(),expanded:new Set(),errors:new Map()};directoryStates.set(key,s);}return s;}
function directoryMessage(text){const p=document.createElement('p');p.className='directory-message';p.textContent=text;return p;}
const directoryContextMenu=document.createElement('div');directoryContextMenu.className='directory-context-menu';directoryContextMenu.id='directoryContextMenu';directoryContextMenu.role='menu';directoryContextMenu.hidden=true;const contextHeading=document.createElement('div');contextHeading.className='directory-context-heading';const contextCreate=document.createElement('button');contextCreate.type='button';contextCreate.role='menuitem';contextCreate.textContent='＋ 新建 PRD 文档';const contextFolder=document.createElement('button');contextFolder.type='button';contextFolder.role='menuitem';contextFolder.textContent='＋ 新建文件夹';directoryContextMenu.append(contextHeading,contextCreate,contextFolder);document.body.append(directoryContextMenu);let directoryContext=null;
function hideDirectoryContext(){if(directoryContext?.element)directoryContext.element.classList.remove('context-selected');directoryContextMenu.hidden=true;directoryContext=null;}
function showDirectoryContext(event,p,entry=null){event.preventDefault();event.stopPropagation();hideDirectoryContext();const relative=entry?.kind==='folder'?entry.relative:entry?entry.relative.replace(/\\/g,'/').split('/').slice(0,-1).join('\\'):'';directoryContext={project:p,relative,element:event.currentTarget};directoryContext.element?.classList.add('context-selected');contextHeading.textContent='创建到：'+(relative||p.name);directoryContextMenu.hidden=false;const rect=event.currentTarget.getBoundingClientRect(),x=event.clientX||rect.right,y=event.clientY||rect.bottom;directoryContextMenu.style.left=Math.max(8,Math.min(x,window.innerWidth-directoryContextMenu.offsetWidth-8))+'px';directoryContextMenu.style.top=Math.max(8,Math.min(y,window.innerHeight-directoryContextMenu.offsetHeight-8))+'px';contextCreate.focus();}
function bindDirectoryContext(element,p,entry){element.addEventListener('contextmenu',e=>showDirectoryContext(e,p,entry));}
async function createDocAtDirectory(p,relative){if(documentNavigationBusy)return;documentNavigationBusy=true;try{if(reviewMic.active)throw Error('请先结束录音并保存，再创建文档。');await flush();const folder=p.root+(relative?'\\'+relative:'');const name=await ask('新建 PRD 文档','创建位置：'+folder,'新建 PRD');if(!name)return;const next=await api('createDocInFolder',p.id,relative,name);$('directoryFilter').value='';closeFilePreview();await accept(next);toast('已在所选目录创建文档');}finally{documentNavigationBusy=false;}}
contextCreate.onclick=action(async()=>{const selected=directoryContext;hideDirectoryContext();if(selected)await createDocAtDirectory(selected.project,selected.relative);});
contextFolder.onclick=action(async()=>{const selected=directoryContext;hideDirectoryContext();if(!selected)return;const {project:p,relative}=selected;const name=await ask('新建文件夹','创建位置：'+p.root+(relative?'\\'+relative:''),'新建文件夹');if(!name)return;await api('createProjectFolder',p.id,relative,name);const s=directoryState(p);if(relative)s.expanded.add(relative);$('directoryFilter').value='';await refreshDirectory();toast('文件夹已创建');});
document.addEventListener('pointerdown',e=>{if(!directoryContextMenu.contains(e.target))hideDirectoryContext();});document.addEventListener('keydown',e=>{if(!directoryContextMenu.hidden&&e.key==='Escape'){e.preventDefault();const previous=directoryContext?.element;hideDirectoryContext();previous?.focus();}});window.addEventListener('blur',hideDirectoryContext);window.addEventListener('resize',hideDirectoryContext);$('directoryTree').addEventListener('scroll',hideDirectoryContext,true);$('directoryRoot').addEventListener('contextmenu',e=>{const p=activeProject();if(p)showDirectoryContext(e,p);});$('directoryTree').addEventListener('contextmenu',e=>{if(e.target.closest('.directory-row'))return;const p=activeProject();if(p)showDirectoryContext(e,p);});
function enableAttachmentDrag(button,p,entry){button.draggable=true;button.addEventListener('dragstart',e=>{e.dataTransfer.effectAllowed='copy';e.dataTransfer.setData('application/x-prd-project-file',JSON.stringify({projectId:p.id,relative:entry.relative}));});}
window.chooseCardAttachments=()=>api('chooseAttachments');
window.reviewRecordingAPI=async(name,...args)=>{await flush();return api(name,...args);};
window.addCardAttachment=ref=>api('addProjectAttachment',ref.projectId,ref.relative);
window.openCardAttachment=action(async id=>{await flush();await api('openAttachment',id);});
function highlightDirectory(){for(const b of $('directoryTree').querySelectorAll('[data-document-path]')){const selected=b.dataset.documentPath.toLowerCase()===(previewPath||state.current?.path)?.toLowerCase();b.classList.toggle('active',selected);if(selected)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}}
function drawDirectory(p,s){
 const tree=$('directoryTree');tree.replaceChildren();
 function list(relative){
  const ul=document.createElement('ul');ul.className='directory-list'+(relative?' directory-children':'');
  if(s.errors.has(relative)){ul.append(directoryMessage(s.errors.get(relative)));return ul;}
  const entries=s.children.get(relative);if(!entries){ul.append(directoryMessage('正在读取…'));return ul;}
  if(!entries.length)ul.append(directoryMessage(relative?'空文件夹':'暂无文件夹或 PRD'));
  for(const entry of entries){
   const li=document.createElement('li'),button=document.createElement('button'),chevron=document.createElement('span'),icon=document.createElement('span'),label=document.createElement('span');
   button.className='directory-row';button.title=entry.path;chevron.className='directory-chevron';icon.className='directory-icon'+(entry.kind==='folder'?' folder':'');icon.textContent=entry.kind==='folder'?'▣':entry.kind==='prd'?'PRD':entry.name.split('.').pop().slice(0,4).toUpperCase();label.textContent=entry.name;button.append(chevron,icon,label);li.append(button);
   bindDirectoryContext(button,p,entry);
   if(entry.kind==='folder'){
    const expanded=s.expanded.has(entry.relative);button.setAttribute('aria-expanded',String(expanded));chevron.textContent=expanded?'▾':'▸';
    button.onclick=action(async()=>{
     if(s.expanded.has(entry.relative)){s.expanded.delete(entry.relative);drawDirectory(p,s);return;}
     s.expanded.add(entry.relative);drawDirectory(p,s);
     if(!s.children.has(entry.relative)){try{s.children.set(entry.relative,await api('projectDirectory',p.id,entry.relative));s.errors.delete(entry.relative);}catch(e){s.errors.set(entry.relative,'无法读取：'+e.message);}}
     if(activeProject()?.id===p.id&&activeProject()?.root===p.root)drawDirectory(p,s);
    });
    if(expanded)li.append(list(entry.relative));
   }else{
    button.dataset.documentPath=entry.path;enableAttachmentDrag(button,p,entry);
    button.onclick=action(()=>openDirectoryEntry(p,entry));
   }
   ul.append(li);
  }
  return ul;
 }
 tree.append(list(''));highlightDirectory();
}
async function filterDirectory(){
 const token=++filterEpoch,p=activeProject(),query=$('directoryFilter').value.trim();if(!p)return;
 if(!query){await refreshDirectory();return;}
 $('directoryTree').replaceChildren(directoryMessage('正在筛选…'));
 const result=await api('searchProject',p.id,query);
 if(token!==filterEpoch||p.id!==activeProject()?.id||query!==$('directoryFilter').value.trim())return;
 const tree=$('directoryTree');tree.replaceChildren();
 for(const entry of result.entries){const b=document.createElement('button');b.className='directory-row search-result';b.title=entry.path;const icon=document.createElement('span');icon.className='directory-icon'+(entry.kind==='folder'?' folder':'');icon.textContent=entry.kind==='folder'?'▣':entry.kind==='prd'?'PRD':'▤';const label=document.createElement('span');label.textContent=entry.relative;b.append(icon,label);
 bindDirectoryContext(b,p,entry);
 if(entry.kind!=='folder'){b.dataset.documentPath=entry.path;enableAttachmentDrag(b,p,entry);}
 b.onclick=action(async()=>{if(entry.kind==='folder'){const s=directoryState(p),parts=entry.relative.split('\\');for(let i=1;i<=parts.length;i++)s.expanded.add(parts.slice(0,i).join('\\'));$('directoryFilter').value='';await refreshDirectory();}else await openDirectoryEntry(p,entry);});tree.append(b);}
 if(!result.entries.length)tree.append(directoryMessage('没有匹配的文件或文件夹'));
 if(result.truncated)tree.append(directoryMessage('结果较多，请输入更具体的文件名'));
 highlightDirectory();
}
async function refreshDirectory(){
 const epoch=++directoryEpoch,p=activeProject();$('refreshDirectory').disabled=!p;
 $('directoryRoot').textContent=p?p.name:'尚未选择项目';$('directoryRoot').title=p?p.root:'';
 if(!p){$('directoryTree').replaceChildren(directoryMessage('选择项目后显示目录'));return;}
 if($('directoryFilter').value.trim()){await filterDirectory();return;}
 const s=directoryState(p);s.children.clear();s.errors.clear();
 if(state.current){const root=p.root.replace(/[\\/]+$/,'')+'\\',file=state.current.path;if(file.toLowerCase().startsWith(root.toLowerCase())){const parts=file.slice(root.length).split('\\');parts.pop();for(let i=1;i<=parts.length;i++)s.expanded.add(parts.slice(0,i).join('\\'));}}
 $('directoryTree').replaceChildren(directoryMessage('正在读取…'));
 await Promise.all(['',...s.expanded].map(async relative=>{try{const entries=await api('projectDirectory',p.id,relative);if(epoch===directoryEpoch)s.children.set(relative,entries);}catch(e){if(epoch===directoryEpoch)s.errors.set(relative,'无法读取：'+e.message);}}));
 if(epoch===directoryEpoch)drawDirectory(p,s);
}
function ask(title,help,value=''){
 return new Promise(resolve=>{const d=$('inputDialog');$('inputTitle').textContent=title;$('inputHelp').textContent=help;$('inputValue').value=value;d.onclose=()=>resolve(d.returnValue==='ok'?$('inputValue').value.trim():null);d.showModal();$('inputValue').focus();$('inputValue').select();});
}
function drawProjects(){
 $('projects').replaceChildren();
 for(const p of state.settings.projects){const b=document.createElement('button');b.className='project'+(p.id===state.settings.selected?' active':'');b.textContent='▣  '+p.name;const small=document.createElement('small');small.textContent=p.root;b.append(small);b.dataset.initial=Array.from(p.name.trim())[0]||'项';b.dataset.tooltip=p.name+'\n'+p.root;b.setAttribute('aria-label',p.name);b.onclick=action(async()=>{await flush();state=await api('selectProject',p.id);$('directoryFilter').value='';await showDashboard();});$('projects').append(b);}
 $('version').textContent='v'+(state.version||'1.0.0')+' · '+(window.desktop.mode==='web'?'Codex 本地预览':state.portable?'便携版':'桌面版');
 const p=activeProject();$('newDoc').disabled=!p;$('importHtml').disabled=!p;
 $('clearDocAction').disabled=!state.current;
 for(const id of ['renameProject','locateProject','removeProject'])$(id).disabled=!p;
 for(const el of document.querySelectorAll('.document-tools button'))el.disabled=!state.current;
 updateUndo();
 drawDocumentTabs();
}
async function dashboardData(){
 await refreshDirectory();
 const p=activeProject();$('intro').hidden=!!p;$('projectTitle').textContent=p?p.name:'让每一份需求都有迹可循';$('projectPath').textContent=p?p.root:'选择已有项目目录，PRD 可保存在其中任意子文件夹。';$('documents').replaceChildren();
 let docs=[];
 if(p){try{docs=await api('scanProject',p.id);}catch(e){$('projectPath').textContent=p.root+' · 目录无法访问，请点击“重新定位”';}}
 $('docCount').textContent=docs.length;
 if(!docs.length){const el=document.createElement('div');el.className='empty';el.textContent=p?'还没有 PRD，点击上方“新建 PRD”或“导入旧 HTML”。':'创建项目后，这里会显示项目中的全部 PRD。';$('documents').append(el);}
 for(const doc of docs){const b=document.createElement('button');b.className='doc-card';const icon=document.createElement('span');icon.className='file-icon';icon.textContent='PRD';const title=document.createElement('b');title.textContent=doc.name;const relative=document.createElement('small');relative.textContent=doc.relative;relative.title=doc.path;const date=document.createElement('small');date.textContent='更新于 '+new Date(doc.modified).toLocaleString('zh-CN');b.append(icon,title,relative,date);b.onclick=action(()=>open(doc.path));$('documents').append(b);}
 $('recent').replaceChildren();for(const file of state.settings.recent){const b=document.createElement('button');b.textContent=file;b.title=file;b.onclick=action(()=>open(file));$('recent').append(b);}
}
async function showDashboard(){
 closeFilePreview();
 await flush();$('editor').hidden=true;$('dashboard').hidden=false;drawProjects();await dashboardData();document.title=state.current?state.current.doc.data.title:'项目文档';$('docPath').textContent=state.current?state.current.path:'选择项目，开始整理需求';
}
function loadEditor(resetHistory=true){
 if(!state.current)return;
 closeFilePreview();
 loading=true;window.editorDocument=clone(state.current.doc);$('dashboard').hidden=true;$('editor').hidden=false;
 
 document.title=state.current.doc.data.title;$('docPath').textContent=state.current.path;
 if(resetHistory){history=[];historyIndex=-1;}
 window.activeLoadToken=Date.now()+'-'+Math.random().toString(36).slice(2);$('editor').src='editor.html?load='+window.activeLoadToken;drawProjects();refreshDirectory().catch(e=>window.reportError(e.message));
}
function snapshot(){const w=$('editor').contentWindow;return w?.captureDocument?w.captureDocument():{data:state.current.doc.data,draft:state.current.doc.draft||{}};}
function signature(s){const d={...s.draft};delete d.cur;return JSON.stringify({data:s.data,draft:d});}
function dataSignature(s){return JSON.stringify(s.data);}
function pushHistory(s){
 if(historyIndex>=0&&dataSignature(history[historyIndex])===dataSignature(s))return;
 history=history.slice(0,historyIndex+1);history.push({data:clone(s.data)});if(history.length>80)history.shift();historyIndex=history.length-1;updateUndo();
}
function updateUndo(){$('undo').disabled=historyIndex<=0;$('redo').disabled=historyIndex>=history.length-1;}
window.editorReady=function(s,token){if(token!==window.activeLoadToken)return;loading=false;if(historyIndex<0)pushHistory(s);if(JSON.stringify(state.current.doc.data)!==JSON.stringify(s.data)){Object.assign(state.current.doc,s);dirty=true;scheduleSave();}status(dirty?'等待保存…':'已保存',dirty?'dirty':'');updateUndo();syncReviewMic();};
window.editorChanged=function(s,token){
 if(token!==window.activeLoadToken||loading||!state.current)return;
 const dataChanged=JSON.stringify(state.current.doc.data)!==JSON.stringify(s.data);
 state.current.doc.data=s.data;state.current.doc.draft=s.draft;dirty=true;status('等待保存…','dirty');document.title=s.data.title;
 if(dataChanged){clearTimeout(historyTimer);historyTimer=setTimeout(()=>pushHistory(s),450);if(historyIndex<history.length-1)$('redo').disabled=true;}scheduleSave();
};
function scheduleSave(){clearTimeout(timer);timer=setTimeout(()=>saveNow(false).catch(()=>{}),900);}
async function saveNow(notify=false){
 clearTimeout(timer);if(!state.current)return;
 if(!loading&&$('editor').contentWindow?.captureDocument){Object.assign(state.current.doc,snapshot());}
 const doc=clone(state.current.doc),file=state.current.path;
 saveChain=saveChain.catch(()=>{}).then(async()=>{
   status('正在保存…','dirty');
   try{const r=await api('save',doc);if(state.current?.path===file){state.current.hash=r.hash;dirty=JSON.stringify(state.current.doc)!==JSON.stringify(doc);const hasDraft=['editDlg','dlg','newDlg','newModDlg','editModDlg','titleEditing','rsnDlg'].some(k=>doc.draft?.[k]);status(dirty?'等待保存…':hasDraft?'草稿已保存 · 尚未提交':'已保存',dirty?'dirty':'');$('footerInfo').textContent='上次写入 '+new Date(r.savedAt).toLocaleTimeString('zh-CN')+' · '+file;if(dirty)scheduleSave();}if(notify)toast('文档已写入磁盘');return true;}
   catch(e){dirty=true;status('未写入磁盘','error');window.reportError(e.message);throw e;}
 });return saveChain;
}
window.saveNow=saveNow;
async function flush(){
 clearTimeout(historyTimer);if(state.current&&!loading){const s=snapshot();if(JSON.stringify(state.current.doc.data)!==JSON.stringify(s.data)||JSON.stringify(state.current.doc.draft)!==JSON.stringify(s.draft)){Object.assign(state.current.doc,s);dirty=true;}pushHistory(s);}
 if(dirty)await saveNow();else await saveChain;
}
async function accept(next){if(!next)return;rememberDocumentTab();state=next;dirty=false;saveChain=Promise.resolve();clearTimeout(timer);clearTimeout(historyTimer);const cached=documentTabs.get(documentKey(state.current.path)),same=cached&&cached.signature===signature({data:state.current.doc.data,draft:state.current.doc.draft||{}});if(same){history=cached.history.slice();historyIndex=cached.index;}loadEditor(!same);if(state.current?.recoveredAudioFiles?.length)toast('已恢复中断录音文件，未自动加入PRD。请通过“上传录音”手动添加。');}
async function open(file){if(documentNavigationBusy)return;documentNavigationBusy=true;try{await flush();await accept(await api('openDoc',file));}finally{documentNavigationBusy=false;}}
async function createProject(){await flush();const next=await api('createProject');if(next){state=next;await showDashboard();}}
async function newDoc(){const p=activeProject();if(!p)return;await flush();const name=await ask('新建 PRD','填写文档名称，然后选择项目目录中的保存位置。','新建 PRD');if(!name)return;await accept(await api('newDoc',p.id,name));}
async function undo(delta){if(reviewMic.active)throw Error('请先结束录音并保存，再撤销或重做。');
 if(loading||!state.current)return;
 clearTimeout(historyTimer);clearTimeout(timer);const current=snapshot();pushHistory(current);
 const next=historyIndex+delta;if(next<0||next>=history.length){if(dirty)scheduleSave();return;}
 const data=clone(history[next].data),draft=clone(current.draft||{}),cardKeys=new Set(data.modules.flatMap(m=>m.items.map(it=>it.k)));
 if(draft.dlg&&(!cardKeys.has(draft.curKey)||(draft.editIdx>=0&&!data.reviews[draft.curKey]?.[draft.editIdx]))||draft.editModDlg&&!data.modules.some(m=>m.key===draft.editModKey)||draft.rsnDlg&&!data.reviews[draft.rsnKey]?.[draft.rsnIdx]){toast('请先保存或取消当前编辑，再撤销或重做对应数据。');scheduleSave();return;}
 if(!data.modules.some(m=>m.key===draft.cur))draft.cur=data.modules[0]?.key||'';
 if(draft.editDlg&&draft.editKey&&!cardKeys.has(draft.editKey))draft.editKey='';
 historyIndex=next;state.current.doc.data=data;state.current.doc.draft=draft;dirty=true;loadEditor(false);await saveNow();toast(delta<0?'已撤销数据修改':'已重做数据修改');
}
window.reloadEditor=function(){if(!state.current)return;Object.assign(state.current.doc,snapshot());loadEditor(false);};
window.clearCurrent=async function(){if(reviewMic.active)throw Error('请先结束录音。');
 try{const vm=$('editor').contentWindow.__prdVM;await vm.$confirm('清空本 PRD 的全部模块、正文、评审和历史？操作前会生成备份，也可以在本次打开期间撤销。','清空文档',{type:'warning'});await flush();await api('manualBackup');const data=state.current.doc.data;pushHistory(snapshot());state.current.doc.data={version:34,title:data.title,prototype:data.prototype||null,reviewPeople:data.reviewPeople||[],reviewPeopleColors:data.reviewPeopleColors||{},reviewPeopleHidden:data.reviewPeopleHidden||[],recordings:[],flows:{},attachments:{},modules:[],contents:{},tables:{},reviews:{},hists:{},mtimes:{},changelog:{},deleted:[],desktopTrash:{}};state.current.doc.draft={};pushHistory({data:state.current.doc.data,draft:{}});dirty=true;loadEditor(false);await saveNow();}catch(e){if(e instanceof Error)window.reportError(e.message);}
};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
window.exportCurrent=async function(){
 try{
 await flush();const w=$('editor').contentWindow,d=state.current.doc.data;
 function renderBody(text){return '<div class="archive-content">'+w.prdRender(text)+'</div>';}
 let body='<header><span>PRD 工作台 · 只读归档</span><h1>'+esc(d.title)+'</h1><p>归档时间：'+esc(new Date().toLocaleString('zh-CN'))+'</p></header><nav>';
 for(const [mi,m]of d.modules.entries())body+='<a href="#m'+mi+'">'+(mi+1)+'. '+esc(m.name)+'</a>';body+='</nav>';
 function table(t){return '<h4>'+esc(t.name||'数据表')+'</h4><div class="table-scroll"><table><thead><tr>'+t.cols.map(c=>'<th>'+esc(c)+'</th>').join('')+'</tr></thead><tbody>'+t.rows.map(r=>'<tr>'+t.cols.map((_,i)=>'<td>'+esc(r[i])+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';}
 for(const [mi,m]of d.modules.entries()){
   body+='<section id="m'+mi+'"><h2>'+(mi+1)+'. '+esc(m.name)+'</h2>';
   for(const [ii,it]of m.items.entries()){
     body+='<article><h3>'+(mi+1)+'.'+(ii+1)+' '+esc(it.t)+'</h3>'+renderBody(d.contents[it.k]??it.d??'');
     for(const t of d.tables[it.k]||[])body+=table(t);
     for(const [fi,flow]of w.__prdVM.flowList(d.flows?.[it.k]).entries())body+='<div style="overflow:auto"><h4>'+esc(flow.name||('流程图 '+(fi+1)))+'</h4>'+w.prdFlowSVG(flow)+'</div>';
     if(d.attachments?.[it.k]?.length){body+='<div><h4>附件</h4>';for(const a of d.attachments[it.k])body+='<p><a download="'+esc(a.name)+'" href="data:application/octet-stream;base64,'+esc(a.base64)+'">'+esc(a.name)+'</a></p>';body+='</div>';}
     body+='<div class="reviews"><h4>评审记录</h4>';
     for(const r of d.reviews[it.k]||[])body+='<div class="review"><b>'+esc(r.stage)+' · '+esc(r.st||'未标记')+'</b><p>'+esc(r.users)+' / '+esc(r.date)+'</p><p class="pre">'+esc(r.content)+'</p>'+(r.rsn?'<p class="pre">不修改理由：'+esc(r.rsn)+'</p>':'')+'</div>';
     if(!(d.reviews[it.k]||[]).length)body+='<p>暂无评审记录</p>';body+='</div>';
     if((d.hists[it.k]||[]).length){body+='<details><summary>历史需求（'+d.hists[it.k].length+'）</summary>';for(const h of d.hists[it.k]){body+='<h4>'+esc(h.date)+' '+esc(h.label)+'</h4>'+renderBody(h.content||'');for(const t of h.tables||[])body+=table(t);}body+='</details>';}
     body+='</article>';
   }body+='</section>';
 }
 const html='<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:;"><title>'+esc(d.title)+'</title><style>body{font:14px/1.8 "Segoe UI","Microsoft YaHei",sans-serif;background:#f5f7fb;color:#354364;max-width:1100px;margin:0 auto;padding:40px}header,article{background:white;padding:28px;border:1px solid #e1e6ef;border-radius:10px;margin-bottom:20px}header span{font-size:12px;color:#7182a6}h1{margin:10px 0}h2{margin-top:35px}h3{border-bottom:1px solid #eee;padding-bottom:12px}nav{display:flex;flex-wrap:wrap;gap:15px}a{color:#4566ce}table{width:100%;border-collapse:collapse}td,th{border:1px solid #dfe4ed;padding:8px;text-align:left;word-break:break-word}th{background:#f0f3fa}.table-scroll{overflow:auto}.reviews{background:#fffbef;padding:16px;margin-top:20px}.review{border-top:1px dashed #e9d9b2;padding:12px 0}.pre,.prd-p{white-space:pre-wrap}summary{cursor:pointer;color:#5d76b5}details{margin-top:16px}p{margin:6px 0}.prd-h{font-weight:bold;margin-top:15px}.archive-content{overflow-wrap:anywhere}.archive-content h1{font-size:28px;line-height:1.4;margin:16px 0 10px}.archive-content h2{font-size:20px;line-height:1.5;margin:14px 0 8px}.archive-content h3{font-size:17px;line-height:1.5;margin:12px 0 8px;border:0;padding:0}.archive-content h4{font-size:15px;line-height:1.5;margin:10px 0 6px}.archive-content p{margin:0 0 8px}.archive-content ul,.archive-content ol{padding-left:28px}@media print{body{padding:0;background:white}article{break-inside:avoid}details{display:block}}</style><body>'+body+'</body></html>';
 if(await api('exportHtml',html))toast('已导出完整离线只读归档');
 }catch(e){window.reportError(e.message);}
};
async function listBackups(){const items=await api('backups');$('backupList').replaceChildren();if(!items.length)$('backupList').textContent='尚无备份。可以点击“立即备份”。';for(const item of items){const row=document.createElement('div');row.className='backup-row';const info=document.createElement('span');info.textContent=item.name;const size=document.createElement('small');size.textContent=(item.size/1024).toFixed(1)+' KB';info.append(size);const b=document.createElement('button');b.textContent='恢复';b.onclick=action(async()=>{await flush();const next=await api('restore',item.name);if(next){$('backupDialog').close();await accept(next);toast('已恢复备份，原文档已另行备份');}});row.append(info,b);$('backupList').append(row);}}
window.handleShortcut=function(e){
 if(!(e.ctrlKey||e.metaKey)||e.altKey)return;
 const k=e.key.toLowerCase();
 if(k==='s'){e.preventDefault();action(()=>e.shiftKey?saveAs():saveNow(true))();}
 else if(k==='z'||k==='y'){if(e.target?.closest?.('input,textarea,[contenteditable="true"],[contenteditable=""]'))return;e.preventDefault();action(()=>undo(k==='y'||e.shiftKey?1:-1))();}
 else if(k==='o'){e.preventDefault();action(()=>open())();}
 else if(k==='n'){e.preventDefault();action(newDoc)();}
};
async function saveAs(){if(!state.current)return;if(reviewMic.active)throw Error('请先结束录音并完成音频文件保存，再另存为。');clearTimeout(timer);clearTimeout(historyTimer);if(!loading)Object.assign(state.current.doc,snapshot());await saveChain.catch(()=>{});const next=await api('saveAs',state.current.doc);if(next){if(reviewMic.active&&reviewMic.target)reviewMic.target.docPath=next.current.path;await accept(next);toast('已另存为');}}
document.addEventListener('keydown',window.handleShortcut,true);
$('createProject').onclick=action(createProject);$('introCreate').onclick=action(createProject);$('newDoc').onclick=action(newDoc);$('openDoc').onclick=action(()=>open());$('refresh').onclick=action(dashboardData);
$('tabNewDoc').onclick=action(newDoc);
$('importHtml').onclick=action(async()=>{$('moreMenu').open=false;await flush();await accept(await api('importHtml',activeProject().id));});
$('clearDocAction').onclick=()=>{$('moreMenu').open=false;window.clearCurrent();};
window.renameCurrentDocument=action(async()=>{if(!state.current||loading)return;const old=state.current.doc.data.title,name=await ask('修改文档标题','修改文档显示标题。',old);if(!name||name===old)return;const vm=$('editor').contentWindow.__prdVM;vm.docTitle=name;vm.logOp('修改标题','module',{modName:'文档标题',cardName:'标题',detail:'「'+old+'」→「'+name+'」'});await vm.$nextTick();await flush();document.title=name;});
window.editPrototypeAssociation=action(async()=>{if(!state.current||loading)return;const ref=state.current.doc.data.prototype;$('prototypeName').value=ref?.name||'';$('prototypeTarget').value=ref?.target||'';$('removePrototype').hidden=!ref;$('prototypeTarget').readOnly=true;syncPrototypeFile();$('prototypeDialog').show();});
window.openPrototypeAssociation=action(async()=>{await flush();await api('openPrototype');});
async function setPrototypeAssociation(ref){if(!state.current||loading)return;const vm=$('editor').contentWindow.__prdVM,old=vm.prototype;vm.prototype=ref;vm.logOp(ref?'关联对应原型':'解除原型关联','module',{modName:'文档信息',cardName:'对应原型',detail:ref?ref.name+'：'+ref.target:old?.target||''});await vm.$nextTick();await flush();$('prototypeDialog').close();toast(ref?'已保存原型关联':'已解除原型关联');}
function syncPrototypeFile(){const target=$('prototypeTarget').value;const filename=target.split(/[\\/]/).pop();$('prototypeFileLabel').textContent=filename||'拖入项目中的原型文件';$('choosePrototypeFile').textContent=target?'重新选择文件':'选择原型文件';$('editPrototypePath').textContent=$('prototypeTarget').readOnly?'手动输入路径':'收起手动输入';}
function choosePrototypeRef(ref){const old=$('prototypeTarget').value.split(/[\\/]/).pop()?.replace(/\.[^.]+$/,'');if(!$('prototypeName').value.trim()||$('prototypeName').value===old)$('prototypeName').value=ref.name;$('prototypeTarget').value=ref.target;syncPrototypeFile();}
$('choosePrototypeFile').onclick=action(async()=>{const ref=await api('choosePrototypeFile');if(ref)choosePrototypeRef(ref);});
$('editPrototypePath').onclick=()=>{$('prototypeTarget').readOnly=!$('prototypeTarget').readOnly;syncPrototypeFile();if(!$('prototypeTarget').readOnly)$('prototypeTarget').focus();};
$('prototypeTarget').addEventListener('input',syncPrototypeFile);
$('prototypeDrop').addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('application/x-prd-project-file')){e.preventDefault();e.dataTransfer.dropEffect='copy';$('prototypeDrop').classList.add('is-over');}});
$('prototypeDrop').addEventListener('dragleave',()=> $('prototypeDrop').classList.remove('is-over'));
$('prototypeDrop').addEventListener('drop',e=>{e.preventDefault();$('prototypeDrop').classList.remove('is-over');action(async()=>{const raw=e.dataTransfer.getData('application/x-prd-project-file');if(!raw)return;const entry=JSON.parse(raw),p=(state.projects||state.settings?.projects||[]).find(p=>p.id===entry.projectId);if(!p)throw Error('请选择当前项目中的原型文件。');const ref=await api('normalizePrototype',{target:p.root+'\\'+entry.relative});choosePrototypeRef(ref);})().catch(()=>{});});
$('savePrototype').onclick=action(async()=>{const ref=await api('normalizePrototype',{name:$('prototypeName').value,target:$('prototypeTarget').value});await setPrototypeAssociation(ref);});
$('removePrototype').onclick=action(()=>setPrototypeAssociation(null));$('cancelPrototype').onclick=()=>$('prototypeDialog').close();
document.addEventListener('click',e=>{if(!e.target.closest('#moreMenu'))$('moreMenu').open=false;});
$('retrySave').onclick=action(()=>saveNow(true));$('save').onclick=action(()=>saveNow(true));$('saveAs').onclick=action(saveAs);$('undo').onclick=action(()=>undo(-1));$('redo').onclick=action(()=>undo(1));$('reveal').onclick=action(()=>api('reveal'));
$('export').onclick=window.exportCurrent;$('backup').onclick=action(async()=>{await flush();await listBackups();$('backupDialog').showModal();});$('backupNow').onclick=action(async()=>{await flush();await api('manualBackup');await listBackups();toast('已生成备份');});$('backupClose').onclick=()=>$('backupDialog').close();
$('associate').hidden=window.desktop.mode==='web';$('associate').onclick=action(async()=>toast(await api('associate')));
$('renameProject').onclick=action(async()=>{const p=activeProject();const name=await ask('重命名项目','只修改软件中的显示名称，不改动磁盘文件夹。',p.name);if(name){state=await api('renameProject',p.id,name);drawProjects();await dashboardData();}});
$('locateProject').onclick=action(async()=>{const next=await api('locateProject',activeProject().id);if(next){state=next;drawProjects();await dashboardData();}});
$('removeProject').onclick=action(async()=>{const p=activeProject();const yes=await ask('移除项目','仅从列表移除，磁盘目录和 PRD 文件均保留。输入“移除”确认。');if(yes==='移除'){state=await api('removeProject',p.id);await showDashboard();}});
$('errorClose').onclick=()=>$('errorDialog').close();
$('refreshDirectory').onclick=action(refreshDirectory);
$('directoryFilter').oninput=()=>{clearTimeout(filterTimer);++filterEpoch;filterTimer=setTimeout(()=>action(filterDirectory)(),250);};
$('closePreview').onclick=()=>{const target=previewReturn;closeFilePreview();if(target==='dashboard'){$('dashboard').hidden=false;$('editor').hidden=true;}};
function toggleDirectory(){const panel=document.querySelector('.directory-panel');panel.hidden=!panel.hidden;$('directoryResize').hidden=panel.hidden;$('toggleDirectory').setAttribute('aria-expanded',String(!panel.hidden));}
$('toggleDirectory').onclick=toggleDirectory;$('collapseDirectory').onclick=toggleDirectory;
const resize=$('directoryResize');
resize.onpointerdown=e=>{resize.setPointerCapture(e.pointerId);resize.dataset.dragging='true';};
resize.onpointermove=e=>{if(resize.dataset.dragging!=='true')return;const width=Math.max(220,Math.min(440,window.innerWidth-e.clientX));document.querySelector('.directory-panel').style.width=width+'px';};
resize.onpointerup=()=>{delete resize.dataset.dragging;};resize.onpointercancel=resize.onpointerup;
resize.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const panel=document.querySelector('.directory-panel');panel.style.width=Math.max(220,Math.min(440,panel.getBoundingClientRect().width+(e.key==='ArrowLeft'?20:-20)))+'px';}};
window.desktop.onOpen(payload=>action(async()=>{await rendererStartup;if(!payload||typeof payload.requestedPath!=='string')throw Error('未收到有效的文档路径，请重新打开文件。');await open(payload.requestedPath);})());
window.desktop.onFlush(async()=>{try{if(reviewMic.phase==='recording')await reviewMic.stop();if(reviewMic.phase==='retry')await reviewMic.persist();if(reviewMic.active)throw Error('请先完成录音保存。');await flush();window.desktop.closeReady();}catch{/* Keep the window open until save succeeds or user saves elsewhere. */}});
const rendererStartup=action(async()=>{state=await api('bootstrap');drawProjects();if(state.current)loadEditor();else await showDashboard();})();
window.addEventListener('beforeunload',e=>{if(window.desktop.mode==='web'&&(dirty||reviewMic.active)){e.preventDefault();e.returnValue='';}});
setInterval(()=>{if(state.current&&!dirty&&!loading)api('manualBackup').catch(()=>{});},5*60*1000);







// Software-level MCP: one command is handled by one visible renderer at a time.
let mcpPolling=false,mcpConnectionInfo=null;
async function runMcpCommand(name,args){
 if(name==='prd_list_projects')return api('mcpBackend',name,args);
 if(loading||documentNavigationBusy||reviewMic.active||document.querySelector('dialog[open]'))throw Error('软件正在编辑、录音或显示弹框，请稍后重试');
 if(state.current){const draft=snapshot().draft||{};if(['editDlg','dlg','newDlg','newModDlg','editModDlg','rsnDlg'].some(k=>draft[k]))throw Error('请先保存或取消当前弹框中的编辑');}
 await flush();
 if(name==='prd_select_project'){state=await api('selectProject',args.projectId);await showDashboard();return {projectId:args.projectId};}
 if(name==='prd_create_document'){await accept(await api('createDocInFolder',args.projectId,args.directory||'',args.title));return {file:state.current.path,hash:state.current.hash};}
 if(name==='prd_create_folder'){const r=await api('mcpBackend',name,args);await refreshDirectory();return r;}
 if(name==='prd_list_files'||name==='prd_read_document')return api('mcpBackend',name,args);
 if(!['prd_open_document','prd_apply_changes'].includes(name))throw Error('未知软件指令');
 const file=await api('mcpBackend','resolve',args);
 if(state.current?.path!==file){await open(file);for(let i=0;loading&&i<100;i++)await new Promise(r=>setTimeout(r,50));if(loading)throw Error('文档仍在加载，请重试');}
 if(name==='prd_open_document')return {file,hash:state.current.hash};
 // Prepare against the saved hash, then commit through the same renderer history/save path.
 const prepared=await api('mcpBackend',name,args);
 await api('manualBackup');pushHistory(snapshot());
 state.current.doc=prepared.doc;pushHistory({data:prepared.doc.data});dirty=true;
 loadEditor(false);
 for(let i=0;loading&&i<100;i++)await new Promise(r=>setTimeout(r,50));
 if(loading)throw Error('界面仍在加载，修改已保留，请检查保存状态');
 await saveNow();toast('AI 已更新文档，可撤销');return {...prepared.result,hash:state.current.hash};
}
setInterval(async()=>{
 if(mcpPolling||!window.desktop.mcpPoll)return;mcpPolling=true;
 try{const command=await api('mcpPoll');if(command){let result;try{result={ok:true,value:await runMcpCommand(command.name,command.args||{})};}catch(e){result={ok:false,error:e.message};}await api('mcpComplete',command.id,result);}}catch{}finally{mcpPolling=false;}
},350);
function updateMcpConfig(){
 if(!mcpConnectionInfo)return;
 $('mcpConfig').value=JSON.stringify({mcpServers:{'prd-review-manager':{command:mcpConnectionInfo.command,args:[$('mcpScript').value.trim(),'--connect',mcpConnectionInfo.manifest],env:{ELECTRON_RUN_AS_NODE:'1'}}}},null,2);
 $('copyMcpConfig').disabled=!$('mcpScript').value.trim();
}
$('mcpSettings').onclick=action(async()=>{mcpConnectionInfo=await api('mcpInfo');$('mcpScript').value=mcpConnectionInfo.script;updateMcpConfig();$('mcpSettingsDialog').showModal();});
$('mcpScript').addEventListener('input',updateMcpConfig);
$('closeMcpSettings').onclick=()=>$('mcpSettingsDialog').close();
$('copyMcpConfig').onclick=action(async()=>{await navigator.clipboard.writeText($('mcpConfig').value);toast('软件级 MCP 配置已复制');});
