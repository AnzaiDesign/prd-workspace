'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const store=require('./store');
async function start({handlers,getState,baseDir,defaultDirectory}){
 const token=crypto.randomBytes(32).toString('hex');let pending=null,port;
 const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.woff':'font/woff','.ttf':'font/ttf','.png':'image/png','.ico':'image/x-icon'};
 function json(res,value,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
 function choose(kind,options){
  if(pending)throw Error('请先完成当前文件选择操作。');
  return new Promise(resolve=>{const id=crypto.randomUUID(),timeout=setTimeout(()=>answer({id,cancel:true}),10*60*1000);timeout.unref();pending={id,kind,options,resolve,timeout};});
 }
 function answer(value){
  if(!pending||value.id!==pending.id)throw Error('文件选择已过期，请重试。');
  const request=pending;
  if(!value.cancel&&request.kind!=='confirm'){
   if(typeof value.path!=='string'||!path.isAbsolute(value.path))throw Error('请选择完整文件路径。');
   if(request.kind==='open'){const stat=fs.statSync(value.path);if(request.options.properties?.includes('openDirectory')?!stat.isDirectory():!stat.isFile())throw Error('所选路径类型不正确。');}
   if(request.kind==='save'&&!fs.statSync(path.dirname(value.path)).isDirectory())throw Error('保存目录不存在。');
  }
  pending=null;clearTimeout(request.timeout);
  if(request.kind==='confirm')request.resolve({response:value.cancel?0:1});
  else request.resolve(value.cancel?{canceled:true}:request.kind==='open'?{canceled:false,filePaths:[value.path]}:{canceled:false,filePath:value.path});
  return true;
 }
 function browse(directory){
  const target=path.resolve(directory||defaultDirectory),stat=fs.statSync(target);if(!stat.isDirectory())throw Error('请选择已有文件夹。');
  const entries=fs.readdirSync(target,{withFileTypes:true}).filter(e=>!e.isSymbolicLink()&&(e.isDirectory()||e.isFile())).map(e=>({name:e.name,path:path.join(target,e.name),directory:e.isDirectory()})).sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name,'zh-CN',{numeric:true}));
  return {directory:target,parent:path.dirname(target),entries:entries.slice(0,5000),truncated:entries.length>5000};
 }
 const documentActions=new Set(['createDocInFolder','save','saveAs','backups','restore','manualBackup','exportHtml','reveal','closeDoc','normalizePrototype','choosePrototypeFile','chooseRecordings','micRecordingTarget','beginMicRecording','appendMicRecording','finishMicRecording','ackMicRecording','recordingURL','saveMicRecording','downloadRecording','addProjectAttachment','chooseAttachments','openAttachment','openPrototype']);
 const server=http.createServer(async(req,res)=>{
  try{
   const host=req.headers.host;if(!['127.0.0.1:'+port,'localhost:'+port].includes(host)){res.writeHead(403);res.end('Invalid host');return;}
   const url=new URL(req.url,'http://'+host);
   if(url.pathname==='/health'){json(res,{ok:true,app:'prd-preview'});return;}
   if(url.pathname==='/api'){
    if(req.method!=='POST'||req.headers['x-prd-token']!==token||req.headers.origin&&req.headers.origin!=='http://'+host){json(res,{ok:false,error:'无效预览请求。'},403);return;}
    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;chunks.push(chunk);}
    const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));let value;
    if(input.name==='pickerPending')value=pending?{id:pending.id,kind:pending.kind,options:pending.options,defaultDirectory}:null;
    else if(input.name==='pickerBrowse')value=browse(input.args?.[0]);
    else if(input.name==='pickerAnswer')value=answer(input.args?.[0]||{});
    else{
     if(!Object.prototype.hasOwnProperty.call(handlers,input.name)||!Array.isArray(input.args))throw Error('未知操作。');
     const current=getState().current;
     if(documentActions.has(input.name)&&current&&input.documentPath!==current.path)throw Error('文档已在其他预览页切换，请刷新页面后重试。');
     if(input.name==='save'&&current&&input.hash!==current.hash)throw Error('其他预览页已更新此文档，请另存为保留当前内容。');
     value=await handlers[input.name](...input.args);
    }
    json(res,{ok:true,value});return;
   }
   if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
   const relative=decodeURIComponent(url.pathname).replace(/^\//,'')||'index.html';
   const publicFiles=['error-message.js','keyboard-confirm.js','index.html','editor.html','editor-engine.js','editor-actions.js','rich-text.js','review-recordings.js','participant-tags.js','mic-capture.js','mic-worklet.js','flow-editor.js','editor.css','renderer.js','editor-adapter.js','shell.css','theme.js','design-system.css','ux-shell.css','ux-editor.css','ux-shell.js','directory.css','preview.css','web-bridge.js','app.ico'];
   if(!publicFiles.includes(relative)&&!relative.startsWith('vendor/')){res.writeHead(404);res.end();return;}
   const file=path.resolve(baseDir,relative);if(!store.within(baseDir,file)){res.writeHead(403);res.end();return;}
   if(relative.startsWith('vendor/')&&!store.within(path.join(baseDir,'vendor'),file)){res.writeHead(403);res.end();return;}
   let content=fs.readFileSync(file);
   if(relative==='index.html')content=Buffer.from(content.toString('utf8').replace("connect-src 'none'","connect-src 'self'").replace('</head>','<meta name="prd-preview-token" content="'+token+'"></head>').replace('<script src="renderer.js">','<script src="web-bridge.js"></script><script src="renderer.js">'));
   res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:content);
  }catch(error){if(!res.headersSent)json(res,{ok:false,error:error.code==='ENOENT'?'文件或目录不存在。':error.message},400);else res.end();}
 });
 const first=Number(process.env.PRD_PREVIEW_PORT||4173);
 for(port=first;port<first+20;port++){
  const available=await new Promise((resolve,reject)=>{const fail=e=>{server.removeListener('listening',success);if(e.code==='EADDRINUSE')resolve(false);else reject(e);};const success=()=>{server.removeListener('error',fail);resolve(true);};server.once('error',fail);server.once('listening',success);server.listen(port,'127.0.0.1');});if(available)break;
 }
 if(!server.listening)throw Error('预览端口均被占用。');
 const url='http://127.0.0.1:'+port;
 const dataDir=path.join(process.cwd(),process.env.PRD_PREVIEW_TEST?'test-results/web-profile':'preview-data');fs.mkdirSync(dataDir,{recursive:true});
 store.atomicWrite(path.join(dataDir,'server.json'),JSON.stringify({url,pid:process.pid},null,2));
 console.log('PRD_CODEX_PREVIEW_READY '+url);
 return {choose,url,close:callback=>{server.close(callback);server.closeIdleConnections();}};
}
module.exports={start};

