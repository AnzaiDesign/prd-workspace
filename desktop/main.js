'use strict';
const {app,BrowserWindow,ipcMain,dialog,shell,Menu,nativeTheme}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {execFile}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const store=require('./store');
let win,settings,settingsPath,current=null,ready=false,quitting=false,pendingFile=null;
const smoke=process.argv.includes('--smoke-test');
const webMode=process.argv.includes('--web-preview');
// Isolate packaged acceptance runs without enabling simulated microphone devices.
if(process.env.PRD_ACCEPTANCE_PROFILE&&!smoke&&!webMode){const profile=path.resolve(process.env.PRD_ACCEPTANCE_PROFILE);fs.mkdirSync(profile,{recursive:true});app.setPath('userData',profile);}
if(smoke){app.commandLine.appendSwitch('use-fake-device-for-media-stream');app.commandLine.appendSwitch('use-fake-ui-for-media-stream');}
const webHandlers={};let webServer;
if(webMode){const profile=path.join(process.cwd(),process.env.PRD_PREVIEW_TEST?'test-results/web-profile':'preview-data');fs.mkdirSync(profile,{recursive:true});app.setPath('userData',profile);}
if(smoke){const profile=path.join(process.cwd(),'test-results','profile');fs.mkdirSync(profile,{recursive:true});app.setPath('userData',profile);}
if(!app.requestSingleInstanceLock()&&!smoke){app.quit();}else{
app.on('second-instance',(_e,args)=>{const file=args.find(a=>a.toLowerCase().endsWith('.prdproj')); if(file){if(ready)requestOpen(file);else pendingFile=file;}if(win){if(win.isMinimized())win.restore();win.focus();}});
app.whenReady().then(start);
}
function saveSettings(){store.atomicWrite(settingsPath,JSON.stringify(settings,null,2));}
function payload(){return {current,settings,portable:!!process.env.PORTABLE_EXECUTABLE_FILE,version:app.getVersion()};}
function noteRecent(file){settings.recent=[file,...settings.recent.filter(p=>p.toLowerCase()!==file.toLowerCase())].slice(0,20);saveSettings();}
function setCurrent(file,doc){
 const recoveredAudioFiles=require('./mic-store').recoverFiles(file,doc,[path.dirname(file),...settings.projects.map(p=>p.root)]);
 current={path:path.resolve(file),doc,hash:store.fingerprint(file),recoveredAudioFiles};noteRecent(current.path);return payload();
}
async function requestOpen(file){
  if(current&&path.resolve(file).toLowerCase()===current.path.toLowerCase()){win.focus();return;}
  // The renderer flushes the current draft before processing this request.
  win.webContents.send('prd:opened',{requestedPath:file});
}
const openDialog=(parent,options)=>webMode?webServer.choose('open',options):dialog.showOpenDialog(parent,options);
const saveDialog=(parent,options)=>webMode?webServer.choose('save',options):dialog.showSaveDialog(parent,options);
const messageDialog=(parent,options)=>webMode?webServer.choose('confirm',options):dialog.showMessageBox(parent,options);
async function chooseSave(defaultPath){const r=await saveDialog(win,{title:'保存 PRD 文档',defaultPath,filters:[{name:'PRD与评审管理工具文档',extensions:['prdproj']}]});return r.canceled?null:withExt(r.filePath);}
function withExt(p){return p.toLowerCase().endsWith('.prdproj')?p:p+'.prdproj';}
function project(id){const p=settings.projects.find(p=>p.id===id);if(!p)throw new Error('项目不存在，请重新选择。');return p;}
function checkCurrent(){if(!current)throw new Error('请先打开或新建 PRD。');}
function register(name,fn){webHandlers[name]=fn;ipcMain.handle('prd:'+name,async(e,...args)=>{
  if(e.sender!==win.webContents||e.senderFrame!==win.webContents.mainFrame)throw new Error('无效的调用来源。');
  try{return {ok:true,value:await fn(...args)};}catch(error){return {ok:false,error:error.message};}
});}
async function start(){
  const audioServer=await require('./audio-server').start();app.on('before-quit',()=>audioServer.close());
  settingsPath=path.join(app.getPath('userData'),'projects.json');
  try{settings=JSON.parse(fs.readFileSync(settingsPath,'utf8'));if(!Array.isArray(settings.projects)||!Array.isArray(settings.recent))throw Error();}catch{settings={projects:[],recent:[],selected:null};}
  if(webMode&&!settings.projects.length){const root=process.env.PRD_PREVIEW_ROOT||path.resolve(__dirname,'../..');const p={id:require('node:crypto').randomUUID(),name:path.basename(root),root};settings.projects.push(p);settings.selected=p.id;saveSettings();}
  nativeTheme.themeSource=settings.uiTheme==='dark'?'dark':'light';
  win=new BrowserWindow({width:1500,height:960,minWidth:1080,minHeight:720,title:'PRD与评审管理工具',icon:path.join(__dirname,'app.ico'),backgroundColor:'#f4f6fa',show:!smoke&&!webMode,webPreferences:{preload:path.join(__dirname,'preload.js'),backgroundThrottling:!smoke,contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  Menu.setApplicationMenu(null);
  if(smoke){win.webContents.on('console-message',(_event,...args)=>console.log('RENDERER',...args));win.webContents.on('did-fail-load',(_e,code,desc,url)=>console.error('LOAD',code,desc,url));}
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,url)=>{if(url!==pathToFileURL(path.join(__dirname,'index.html')).href)event.preventDefault();});
  win.webContents.session.setPermissionRequestHandler((wc,permission,cb,details)=>cb(wc===win.webContents&&permission==='media'&&details.mediaTypes?.length>0&&details.mediaTypes.every(t=>t==='audio')));
  win.webContents.session.setPermissionCheckHandler((wc,permission,_origin,details)=>wc===win.webContents&&permission==='media'&&details.mediaType==='audio');
  win.on('close',e=>{if(!quitting){e.preventDefault();win.webContents.send('prd:flush');}});
  ipcMain.on('prd:close-ready',e=>{if(e.sender===win.webContents){quitting=true;win.close();}});
  register('setTheme',mode=>{if(!['light','dark'].includes(mode))throw Error('无效主题');nativeTheme.themeSource=mode;settings.uiTheme=mode;saveSettings();return mode;});
  register('bootstrap',()=>payload());
  const mcpHost=await require('./mcp/app-host.cjs').start(path.join(app.getPath('userData'),'mcp-connection.json'));
  app.on('before-quit',()=>mcpHost.close());
  register('mcpInfo',()=>({manifest:mcpHost.manifest,command:process.execPath,script:app.isPackaged?path.join(process.resourcesPath,'mcp/server.cjs'):path.join(__dirname,'mcp/server.cjs')}));
  register('mcpPoll',()=>mcpHost.poll());
  register('mcpComplete',(id,result)=>mcpHost.complete(id,result));
  register('mcpBackend',(name,args={})=>{
    if(name==='prd_list_projects')return settings.projects.map(p=>({...p,selected:p.id===settings.selected}));
    const p=project(args.projectId),service=require('./mcp/server.cjs').createService(p.root,{write:(file,doc)=>doc});
    if(name==='resolve'){const file=fs.realpathSync(path.resolve(p.root,args.file));if(!store.within(fs.realpathSync(p.root),file)||path.extname(file).toLowerCase()!=='.prdproj')throw Error('文档必须属于所选项目');return file;}
    if(name==='prd_create_folder')return store.createProjectFolder(p.root,args.directory||'',args.name);
    if(name==='prd_apply_changes'){let prepared;const svc=require('./mcp/server.cjs').createService(p.root,{write:(_file,doc,hash)=>{prepared=doc;return hash;}});const result=svc.call(name,args);return {result,doc:prepared};}
    if(!['prd_list_files','prd_read_document'].includes(name))throw Error('未知软件指令');
    return service.call(name,args);
  });

  register('closeDoc',()=>{current=null;return payload();});
  register('micRecordingTarget',()=>{checkCurrent();return require('./mic-store').target(current.path,settings.projects,store.within);});
  const mic=require('./mic-store');
  const micDocument=file=>{checkCurrent();if(file!==current.path)throw Error('录音对应文档已切换');};
  register('beginMicRecording',file=>{micDocument(file);win.webContents.setBackgroundThrottling(false);return mic.begin({...mic.target(file,settings.projects,store.within),docId:current.doc.id});});
  register('appendMicRecording',(id,index,data,samples,rate,file)=>{micDocument(file);return mic.append(file,id,index,data,samples,rate);});
  register('finishMicRecording',(id,file)=>{micDocument(file);return mic.finish(file,id);});
  register('ackMicRecording',(id,file)=>{micDocument(file);const result=mic.completeFile(file,id);if(!smoke)win.webContents.setBackgroundThrottling(true);return result;});
  register('saveMicRecording',(base64,docPath)=>{checkCurrent();if(current.path!==docPath)throw Error('录音对应的PRD已切换，请先返回原文档。');const target=require('./mic-store').target(current.path,settings.projects,store.within);return require('./mic-store').save(base64,target,store.within);});
  const recording=id=>{checkCurrent();const a=(current.doc.data.recordings||[]).find(x=>x.id===id);if(!a)throw Error('录音不存在，请先保存。');return a;};
  register('recordingURL',id=>{const a=recording(id);return a.audioFile?audioServer.url(mic.resolve(current.path,a,[path.dirname(current.path),...settings.projects.map(p=>p.root)]),a.mime):'data:'+a.mime+';base64,'+a.base64;});
  register('chooseRecordings',async()=>{checkCurrent();const r=await openDialog(win,{title:'上传评审录音',defaultPath:path.dirname(current.path),filters:[{name:'录音文件',extensions:['mp3','wav','m4a','webm','mp4','ogg']}],properties:['openFile','multiSelections']});if(r.canceled)return [];const items=r.filePaths.map(file=>{const ext=path.extname(file).toLowerCase(),types={'.mp3':'audio/mpeg','.wav':'audio/wav','.m4a':'audio/mp4','.webm':'audio/webm','.mp4':'audio/mp4','.ogg':'audio/ogg'},stat=fs.statSync(file);if(!types[ext]||!stat.isFile())throw Error('请选择支持的录音文件。');return mic.importFile(mic.target(current.path,settings.projects,store.within),file,types[ext]);});return items;});
  register('downloadRecording',async id=>{const a=recording(id),r=await saveDialog(win,{title:'下载评审录音',defaultPath:path.join(path.dirname(current.path),path.basename(a.name))});if(r.canceled)return null;if(a.audioFile){const source=mic.resolve(current.path,a,[path.dirname(current.path),...settings.projects.map(p=>p.root)]);if(path.resolve(source)!==path.resolve(r.filePath))fs.copyFileSync(source,r.filePath);}else store.atomicWrite(r.filePath,Buffer.from(a.base64,'base64'));return r.filePath;});
  function attachment(file){const stat=fs.statSync(file);if(!stat.isFile())throw Error('请选择文件。');if(stat.size>10*1024*1024)throw Error('单个附件不能超过 10 MB。');return {id:require('node:crypto').randomUUID(),name:path.basename(file),size:stat.size,base64:fs.readFileSync(file).toString('base64')};}
  register('addProjectAttachment',(id,relative)=>{checkCurrent();const root=project(id).root,file=path.resolve(root,relative);if(!store.within(fs.realpathSync(root),fs.realpathSync(file)))throw Error('附件必须位于项目目录中。');return attachment(file);});
  register('chooseAttachments',async()=>{checkCurrent();const r=await openDialog(win,{title:'选择附件',defaultPath:path.dirname(current.path),properties:['openFile','multiSelections']});return r.canceled?[]:r.filePaths.map(attachment);});
  register('openAttachment',async(id)=>{checkCurrent();const groups=[...Object.values(current.doc.data.attachments||{}),current.doc.draft?.editAttachments||[]];const a=groups.flat().find(a=>a.id===id);if(!a)throw Error('附件不存在。');const safe=path.basename(a.name).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_');const r=await saveDialog(win,{title:'下载附件',defaultPath:path.join(path.dirname(current.path),safe)});if(r.canceled)return null;store.atomicWrite(r.filePath,Buffer.from(a.base64,'base64'));return r.filePath;});
  register('normalizePrototype',input=>{checkCurrent();return store.prototypeReference(current.path,input);});
  register('choosePrototypeFile',async()=>{checkCurrent();const r=await openDialog(win,{title:'选择对应原型文件',defaultPath:path.dirname(current.path),filters:[{name:'原型文件',extensions:['html','htm','pdf','png','jpg','jpeg','webp','gif','rp','fig','xd']}],properties:['openFile']});if(r.canceled)return null;return store.prototypeReference(current.path,{target:r.filePaths[0]});});
  register('openPrototype',async()=>{checkCurrent();const ref=store.prototypeReference(current.path,current.doc.data.prototype);if(ref.type==='url')await shell.openExternal(ref.target);else{const error=await shell.openPath(path.resolve(path.dirname(current.path),ref.target));if(error)throw Error(error);}return true;});
  register('createProject',async()=>{
    const r=await openDialog(win,{title:'选择已有项目目录',properties:['openDirectory']});if(r.canceled)return null;
    const root=r.filePaths[0],existing=settings.projects.find(p=>p.root.toLowerCase()===root.toLowerCase());
    if(existing){existing.name=path.basename(root)||root;settings.selected=existing.id;saveSettings();return payload();}
    const p={id:require('node:crypto').randomUUID(),name:path.basename(root)||root,root};
    settings.projects.push(p);settings.selected=p.id;saveSettings();return payload();
  });
  register('renameProject',(id,name)=>{const p=project(id);if(!String(name).trim())throw Error('项目名称不能为空。');p.name=String(name).trim();saveSettings();return payload();});
  register('locateProject',async(id)=>{const r=await openDialog(win,{title:'重新定位项目目录',properties:['openDirectory']});if(r.canceled)return null;project(id).root=r.filePaths[0];saveSettings();return payload();});
  register('selectProject',id=>{project(id);settings.selected=id;saveSettings();return payload();});
  register('removeProject',id=>{settings.projects=settings.projects.filter(p=>p.id!==id);if(settings.selected===id)settings.selected=settings.projects[0]?.id||null;saveSettings();return payload();});
  register('scanProject',id=>store.scan(project(id).root));
  register('projectDirectory',(id,relative='')=>store.projectEntries(project(id).root,relative));
  register('createProjectFolder',(id,relative,name)=>store.createProjectFolder(project(id).root,relative,name));
  register('createDocInFolder',(id,relative,name)=>{const p=project(id),result=store.createDocumentInFolder(p.root,relative,name);settings.selected=id;return setCurrent(result.path,result.doc);});
  register('searchProject',(id,query)=>store.searchEntries(project(id).root,query));
  register('previewProjectFile',(id,relative)=>store.previewFile(project(id).root,relative));
  register('newDoc',async(id,name)=>{
    const p=project(id),title=String(name||'新建 PRD').trim(),safe=title.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_');
    const file=await chooseSave(path.join(p.root,safe+'.prdproj'));if(!file)return null;
    if(!store.within(p.root,file))throw Error('新建 PRD 请选择项目目录内的任意子文件夹。');
    const doc=store.blank(title);store.write(file,doc,undefined,true);return setCurrent(file,doc);
  });
  register('openDoc',async(file)=>{if(!file){const r=await openDialog(win,{title:'打开 PRD 文档',filters:[{name:'PRD与评审管理工具文档',extensions:['prdproj']}],properties:['openFile']});if(r.canceled)return null;file=r.filePaths[0];}if(!String(file).toLowerCase().endsWith('.prdproj'))throw Error('请选择 .prdproj 文件。');return setCurrent(file,store.read(file));});
  register('importHtml',async(id)=>{
    const p=project(id);const r=await openDialog(win,{title:'导入旧版 PRD HTML',filters:[{name:'旧版 PRD',extensions:['html','htm']}],properties:['openFile']});if(r.canceled)return null;
    const doc=store.importHtml(r.filePaths[0]);const file=await chooseSave(path.join(p.root,path.basename(r.filePaths[0],path.extname(r.filePaths[0]))+'.prdproj'));if(!file)return null;
    if(!store.within(p.root,file))throw Error('请选择当前项目目录内的位置。');store.write(file,doc,undefined,true);return setCurrent(file,doc);
  });
  register('save',doc=>{checkCurrent();if(doc.id!==current.doc.id)throw Error('文档身份不匹配，已阻止保存。');current.hash=store.write(current.path,doc,current.hash);current.doc=doc;current.recoveryWarning='';mic.cleanupRegistered(current.path,doc);return {savedAt:new Date().toISOString(),hash:current.hash};});
  register('saveAs',async(doc)=>{checkCurrent();store.validate(doc);const file=await chooseSave(current.path);if(!file)return null;if(file.toLowerCase()===current.path.toLowerCase()){current.hash=store.write(file,doc,current.hash,true);current.doc=doc;return payload();}const clone=JSON.parse(JSON.stringify(doc));clone.id=require('node:crypto').randomUUID();if(clone.data.prototype?.type==='file')clone.data.prototype=store.prototypeReference(file,{name:clone.data.prototype.name,target:path.resolve(path.dirname(current.path),clone.data.prototype.target)});mic.copyReferences(current.path,file,clone,[path.dirname(current.path),...settings.projects.map(p=>p.root)]);store.write(file,clone,undefined,true);mic.transferJournals(current.path,file,clone);return setCurrent(file,clone);});
  register('manualBackup',()=>{checkCurrent();return store.backup(current.path,true);});
  register('backups',()=>{checkCurrent();const dir=store.backupDir(current.path);if(!fs.existsSync(dir))return [];return fs.readdirSync(dir).filter(n=>n.endsWith('.prdproj')).sort().reverse().map(name=>({name,size:fs.statSync(path.join(dir,name)).size}));});
  register('restore',async(name)=>{checkCurrent();if(typeof name!=='string'||path.basename(name)!==name)throw Error('无效备份名称。');const doc=store.read(path.join(store.backupDir(current.path),name));const r=await messageDialog(win,{type:'question',buttons:['取消','恢复此备份'],defaultId:0,cancelId:0,message:'恢复备份？',detail:'恢复前将自动备份当前文档。恢复后撤销记录将重置。'});if(r.response!==1)return null;current.hash=store.write(current.path,doc,current.hash,true);current.doc=doc;return payload();});
  register('reveal',()=>{if(current)shell.showItemInFolder(current.path);else if(settings.selected)shell.openPath(project(settings.selected).root);});
  register('associate',async()=>{
    const exe=process.env.PORTABLE_EXECUTABLE_FILE||process.execPath;
    if(!app.isPackaged)throw Error('请在打包后的程序中设置文件关联。');
    const entries=[['HKCU\\Software\\Classes\\.prdproj','', 'PRDWorkspace.Document'],['HKCU\\Software\\Classes\\PRDWorkspace.Document','', 'PRD与评审管理工具文档'],['HKCU\\Software\\Classes\\PRDWorkspace.Document\\DefaultIcon','', '"'+(app.isPackaged?path.join(process.resourcesPath,'document.ico'):path.join(__dirname,'document.ico'))+'",0'],['HKCU\\Software\\Classes\\PRDWorkspace.Document\\shell\\open\\command','', '"'+exe+'" "%1"']];
    entries.push(['HKCU\\Software\\Classes\\.prdproj\\DefaultIcon','','\"'+path.join(process.resourcesPath,'document.ico')+'\",0']);
    entries.push(['HKCU\\Software\\Classes\\PRDWorkspace.Document\\Application','','PRD与评审管理工具']);
    await new Promise((resolve,reject)=>execFile('reg.exe',['add','HKCU\\Software\\Classes\\PRDWorkspace.Document\\Application','/v','ApplicationName','/t','REG_SZ','/d','PRD与评审管理工具','/f'],{windowsHide:true},err=>err?reject(err):resolve()));
    for(const [key,,value]of entries)await new Promise((resolve,reject)=>execFile('reg.exe',['add',key,'/ve','/t','REG_SZ','/d',value,'/f'],{windowsHide:true},err=>err?reject(err):resolve()));
    return '已注册文件类型。如 Windows 仍使用其他程序，请在“打开方式”中选择 PRD 工作台。移动便携程序后需重新关联。';
  });
  register('exportHtml',async(html)=>{checkCurrent();if(typeof html!=='string'||html.length>160*1024*1024)throw Error('归档内容无效。');const r=await saveDialog(win,{title:'导出离线只读归档',defaultPath:current.path.replace(/\.prdproj$/i,'-归档.html'),filters:[{name:'HTML 只读归档',extensions:['html']}]});if(r.canceled)return null;store.atomicWrite(r.filePath,html);return r.filePath;});
  if(webMode){webServer=await require('./web-server').start({handlers:webHandlers,getState:payload,baseDir:__dirname,defaultDirectory:process.env.PRD_PREVIEW_ROOT||path.resolve(__dirname,'../..')});return;}
  await win.loadFile(path.join(__dirname,'index.html'));ready=true;
  const arg=pendingFile||process.argv.find(a=>a.toLowerCase().endsWith('.prdproj'));if(arg)requestOpen(arg);
  if(smoke)require(process.argv.includes('--repair-test')?'./repair-test':process.argv.includes('--perf-test')?'./perf-test':'./smoke').run(win,app,store).catch(async error=>{console.error(error);try{fs.writeFileSync(path.join(process.cwd(),'test-results','failure.txt'),error.stack);const screenshot=await win.webContents.capturePage();fs.writeFileSync(path.join(process.cwd(),'test-results','failure.png'),screenshot.toPNG());}catch{}app.exit(1);});
}
app.on('window-all-closed',()=>app.quit());

