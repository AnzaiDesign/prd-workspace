'use strict';
const http=require('node:http'),fs=require('node:fs'),crypto=require('node:crypto');
async function start(manifest){
 const token=crypto.randomBytes(32).toString('hex');let pending=null;
 const server=http.createServer(async(req,res)=>{
  const reply=(ok,value)=>{res.writeHead(ok?200:400,{'Content-Type':'application/json'});res.end(JSON.stringify(ok?{ok,value}:{ok,error:String(value)}));};
  try{
   if(req.method!=='POST'||req.headers.origin||req.headers['x-prd-mcp-token']!==token)throw Error('无效MCP请求');
   if(pending)throw Error('软件正在处理另一条AI指令，请稍后重试');
   let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>4*1024*1024)throw Error('请求过大');}
   const command=JSON.parse(body),id=crypto.randomUUID();
   const value=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending=null;reject(Error('软件界面未响应，请打开软件或快速预览后重试'));},30000);pending={id,command,resolve,reject,timer,claimed:false};});reply(true,value);
  }catch(e){reply(false,e.message);}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 fs.writeFileSync(manifest,JSON.stringify({url:'http://127.0.0.1:'+server.address().port,token}),{mode:0o600});
 return {manifest,poll(){if(!pending||pending.claimed)return null;pending.claimed=true;return {id:pending.id,...pending.command};},complete(id,result){if(!pending||id!==pending.id)throw Error('指令已过期');const p=pending;pending=null;clearTimeout(p.timer);result.ok?p.resolve(result.value):p.reject(Error(result.error));return true;},close(){if(pending){clearTimeout(pending.timer);pending.reject(Error('软件已关闭'));pending=null;}server.close();try{fs.unlinkSync(manifest);}catch{}}};
}
module.exports={start};
