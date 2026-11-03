const {contextBridge,ipcRenderer}=require('electron');
const names=['setTheme','mcpInfo','mcpPoll','mcpComplete','mcpBackend','bootstrap','closeDoc','normalizePrototype','choosePrototypeFile','chooseRecordings','micRecordingTarget','beginMicRecording','appendMicRecording','finishMicRecording','ackMicRecording','recordingURL','saveMicRecording','downloadRecording','addProjectAttachment','chooseAttachments','openAttachment','openPrototype','createProject','locateProject','selectProject','removeProject','scanProject','projectDirectory','searchProject','previewProjectFile','createProjectFolder','newDoc','createDocInFolder','openDoc','importHtml','save','saveAs','backups','restore','manualBackup','reveal','associate','exportHtml','renameProject'];
const api={};
for(const name of names)api[name]=(...args)=>ipcRenderer.invoke('prd:'+name,...args);
api.onOpen=cb=>{ipcRenderer.on('prd:opened',(_e,payload)=>cb(payload));};
api.onFlush=cb=>{ipcRenderer.on('prd:flush',()=>cb());};
api.closeReady=()=>ipcRenderer.send('prd:close-ready');
contextBridge.exposeInMainWorld('desktop',api);

