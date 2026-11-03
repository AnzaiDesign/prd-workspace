'use strict';
const fs=require('node:fs');
const legacy=require('./server.cjs').specs;
const str={type:'string',minLength:1};
const specs=[
 ['prd_list_projects','列出正在运行的软件中所有已添加的项目',{},[]],
 ['prd_select_project','切换软件当前项目',{projectId:str},['projectId']],
 ['prd_open_document','在软件中打开指定项目的PRD',{projectId:str,file:str},['projectId','file']],
 ['prd_create_folder','在指定项目内创建文件夹',{projectId:str,directory:{type:'string'},name:str},['projectId','name']],
 ...legacy.map(([name,description,properties,required])=>[name,description.replace('先读取获得真实ID及hash。','先读取获得真实ID及hash。修改会同步到软件界面，可撤销。'),{projectId:str,...properties},['projectId',...required]])
];
async function request(manifest,name,args){
 const info=JSON.parse(fs.readFileSync(manifest,'utf8')),url=new URL(info.url);
 if(url.hostname!=='127.0.0.1'||url.protocol!=='http:')throw Error('无效的软件连接地址');
 const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-PRD-MCP-Token':info.token},body:JSON.stringify({name,args}),signal:AbortSignal.timeout(45000)});
 const result=await response.json();if(!result.ok)throw Error(result.error);return result.value;
}
function serve(manifest){
 let buffer='',chain=Promise.resolve(),initialized=false;
 const send=r=>process.stdout.write(JSON.stringify(r)+'\n');
 process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>{
  buffer+=chunk;if(Buffer.byteLength(buffer)>4*1024*1024){process.stderr.write('请求过大');process.exit(1);}
  let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+1);if(!line.trim())continue;
   chain=chain.then(async()=>{let r;try{r=JSON.parse(line);}catch{send({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}});return;}if(!Object.hasOwn(r,'id'))return;
    try{let result;
     if(r.method==='initialize'){initialized=true;result={protocolVersion:r.params?.protocolVersion||'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'prd-review-manager',version:'0.2.0'},instructions:'连接正在运行的PRD软件。先列出项目，使用projectId指定任意已添加项目。写入前读取hash。软件忙于弹框编辑或录音时请等待，不要绕过冲突检查。'};}
     else if(r.method==='ping')result={};
     else if(!initialized)throw Error('请先initialize');
     else if(r.method==='tools/list')result={tools:specs.map(([name,description,properties,required])=>({name,description,inputSchema:{type:'object',properties,required,additionalProperties:false}}))};
     else if(r.method==='tools/call'){try{if(!specs.some(s=>s[0]===r.params?.name))throw Error('未知工具');result={content:[{type:'text',text:JSON.stringify(await request(manifest,r.params.name,r.params.arguments||{}))}]};}catch(e){result={isError:true,content:[{type:'text',text:e.message}]};}}
     else{send({jsonrpc:'2.0',id:r.id,error:{code:-32601,message:'Method not found'}});return;}
     send({jsonrpc:'2.0',id:r.id,result});
    }catch(e){send({jsonrpc:'2.0',id:r.id,error:{code:-32602,message:e.message}});}
   });
  }
 });
}
module.exports={serve,request,specs};
