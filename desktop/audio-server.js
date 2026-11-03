'use strict';
const http=require('node:http'),fs=require('node:fs'),crypto=require('node:crypto');
// Stream audio with range support; never send the complete file through renderer IPC.
exports.start=async function(){
 const files=new Map(),server=http.createServer((req,res)=>{
  const item=files.get(req.url);if(!item||!['GET','HEAD'].includes(req.method)){res.writeHead(404);res.end();return;}
  try{const size=fs.statSync(item.file).size;let start=0,end=size-1,status=200;const range=req.headers.range;
   if(range){const m=/^bytes=(\d+)-(\d*)$/.exec(range);if(!m||Number(m[1])>=size){res.writeHead(416,{'Content-Range':'bytes */'+size});res.end();return;}start=Number(m[1]);end=m[2]?Math.min(Number(m[2]),end):end;if(end<start){res.writeHead(416);res.end();return;}status=206;}
   const headers={'Content-Type':item.mime,'Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'no-store'};if(status===206)headers['Content-Range']=`bytes ${start}-${end}/${size}`;
   res.writeHead(status,headers);if(req.method==='HEAD'){res.end();return;}const stream=fs.createReadStream(item.file,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
  }catch{res.writeHead(404);res.end();}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});server.unref();
 return {url(file,mime){const key='/'+crypto.randomBytes(32).toString('hex');files.set(key,{file,mime});if(files.size>32)files.delete(files.keys().next().value);return 'http://127.0.0.1:'+server.address().port+key;},close(){server.close();server.closeAllConnections();}};
};
