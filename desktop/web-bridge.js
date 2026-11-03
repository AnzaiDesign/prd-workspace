(function(){
 'use strict';if(window.desktop)return;
 const token=document.querySelector('meta[name="prd-preview-token"]').content;
 let documentPath=null,hash=null,picker=null,pickerId=null,directory=null,pollBusy=false;
 async function call(name,...args){
  try{const response=await fetch('/api',{method:'POST',headers:{'Content-Type':'application/json','X-PRD-Token':token},body:JSON.stringify({name,args,documentPath,hash})});const result=await response.json();
   if(result.ok&&result.value?.current&&['bootstrap','createProjectFolder','newDoc','createDocInFolder','openDoc','importHtml','saveAs','restore'].includes(name)){documentPath=result.value.current.path;hash=result.value.current.hash;}
   if(result.ok&&name==='save')hash=result.value.hash;
   if(result.ok&&name==='closeDoc'){documentPath=null;hash=null;}
   return result;
  }catch(e){return {ok:false,error:'本地预览服务连接失败，请检查启动窗口。'+e.message};}
 }
 const api={mode:'web',onOpen:()=>{},onFlush:()=>{},closeReady:()=>{}};
 for(const name of ['mcpInfo','mcpPoll','mcpComplete','mcpBackend','bootstrap','closeDoc','normalizePrototype','choosePrototypeFile','chooseRecordings','micRecordingTarget','beginMicRecording','appendMicRecording','finishMicRecording','ackMicRecording','recordingURL','saveMicRecording','downloadRecording','addProjectAttachment','chooseAttachments','openAttachment','openPrototype','createProject','locateProject','selectProject','removeProject','scanProject','projectDirectory','searchProject','previewProjectFile','createProjectFolder','newDoc','createDocInFolder','openDoc','importHtml','save','saveAs','backups','restore','manualBackup','reveal','exportHtml','renameProject'])api[name]=(...args)=>call(name,...args);
 api.associate=async()=>({ok:true,value:'文件关联请在桌面版中设置。'});window.desktop=api;
 const dialog=document.createElement('dialog');dialog.id='webFilePicker';dialog.className='web-picker';
 dialog.innerHTML='<button id="webPickerClose" type="button" class="dialog-close" aria-label="关闭" title="关闭"></button><h2 id="webPickerTitle"></h2><p id="webPickerDetail"></p><div id="webPickerBrowser"><div class="web-picker-path"><button id="webPickerUp" title="上一级">↑</button><input id="webPickerPath" aria-label="目录路径"><button id="webPickerGo">转到</button></div><div class="web-picker-drives"><button data-drive="C:\\">C:</button><button data-drive="E:\\">E:</button><span>文件夹点击进入</span></div><div id="webPickerEntries"></div><label id="webPickerNameLabel">文件名<input id="webPickerName" autocomplete="off"></label></div><p id="webPickerError" role="status"></p><div class="dialog-actions"><button id="webPickerCancel">取消</button><button id="webPickerAccept" data-confirm-action class="primary">确定</button></div>';
 document.body.append(dialog);
 const $=id=>document.getElementById(id);
 async function browse(target){
  const r=await call('pickerBrowse',target);if(!r.ok){$('webPickerError').textContent=r.error;return;}
  directory=r.value;$('webPickerPath').value=directory.directory;$('webPickerError').textContent=directory.truncated?'目录较大，仅展示前 5000 项。':'';
  const list=$('webPickerEntries');list.replaceChildren();
  const folderOnly=picker.options.properties?.includes('openDirectory'),extensions=picker.options.filters?.flatMap(f=>f.extensions.map(e=>'.'+e.toLowerCase()))||[];
  for(const entry of directory.entries){if(!entry.directory&&(folderOnly||extensions.length&&!extensions.some(ext=>entry.name.toLowerCase().endsWith(ext))))continue;
   const b=document.createElement('button');b.className='web-picker-entry';b.textContent=(entry.directory?'▸  ':'▤  ')+entry.name;b.title=entry.path;
   b.onclick=()=>{if(entry.directory)browse(entry.path);else{$('webPickerName').value=entry.name;for(const row of list.children)row.classList.remove('selected');b.classList.add('selected');}};
   b.ondblclick=()=>{if(!entry.directory)finish(false);};list.append(b);
  }
  if(!list.children.length){const p=document.createElement('p');p.textContent='此目录暂无可选择项';list.append(p);}
 }
 async function finish(cancel){
  if(!picker)return;const value={id:picker.id,cancel};
  if(!cancel&&picker.kind!=='confirm'){
   if(!directory){$('webPickerError').textContent='请选择目录。';return;}
   if(picker.options.properties?.includes('openDirectory'))value.path=directory.directory;
   else{
    let name=$('webPickerName').value.trim();if(!name){$('webPickerError').textContent='请选择文件或填写文件名。';return;}
    if(picker.kind==='save'){const extension=picker.options.filters?.[0]?.extensions?.[0];if(extension&&!name.toLowerCase().endsWith('.'+extension))name+='.'+extension;}
    value.path=directory.directory.replace(/[\\/]+$/,'')+'\\'+name;
    if(picker.kind==='save'&&directory.entries.some(e=>!e.directory&&e.path.toLowerCase()===value.path.toLowerCase())&&!window.confirm('文件已存在，是否覆盖？\n'+value.path))return;
   }
  }
  const r=await call('pickerAnswer',value);if(!r.ok){$('webPickerError').textContent=r.error;return;}
  dialog.close();picker=null;pickerId=null;
 }
 async function show(request){
  picker=request;pickerId=request.id;directory=null;
  $('webPickerTitle').textContent=request.options.title||request.options.message||'选择文件';$('webPickerDetail').textContent=request.options.detail||'';$('webPickerError').textContent='';
  const confirm=request.kind==='confirm',folder=request.options.properties?.includes('openDirectory');
  $('webPickerBrowser').hidden=confirm;$('webPickerNameLabel').hidden=folder;$('webPickerAccept').textContent=confirm?'确认恢复':folder?'选择此文件夹':request.kind==='save'?'保存':'打开';
  $('webPickerName').value='';dialog.showModal();
  if(!confirm){let initial=request.options.defaultPath||request.defaultDirectory;if(request.kind==='save'){const split=initial.lastIndexOf('\\');$('webPickerName').value=initial.slice(split+1);initial=initial.slice(0,split);}await browse(initial);}
 }
 $('webPickerClose').onclick=()=>finish(true);$('webPickerAccept').onclick=()=>finish(false);$('webPickerCancel').onclick=()=>finish(true);dialog.oncancel=e=>{e.preventDefault();finish(true);};
 $('webPickerGo').onclick=()=>browse($('webPickerPath').value);$('webPickerPath').onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing&&e.keyCode!==229){e.preventDefault();browse(e.target.value);}};
 $('webPickerUp').onclick=()=>{if(directory)browse(directory.parent);};for(const b of dialog.querySelectorAll('[data-drive]'))b.onclick=()=>browse(b.dataset.drive);
 setInterval(async()=>{if(pollBusy)return;pollBusy=true;try{const r=await call('pickerPending');if(r.ok&&r.value&&r.value.id!==pickerId)await show(r.value);else if(r.ok&&!r.value&&picker){dialog.close();picker=null;pickerId=null;}}finally{pollBusy=false;}},350);
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&window.saveNow)window.saveNow().catch(()=>{});});
})();

