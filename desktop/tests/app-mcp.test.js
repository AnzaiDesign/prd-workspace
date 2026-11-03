const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {start}=require('../mcp/app-host.cjs'),{request}=require('../mcp/app-client.cjs');
test('软件MCP指令交付、结果返回与鉴权',async()=>{
 const root=path.resolve('test-results/smoke-runs/app-mcp-'+crypto.randomUUID());fs.mkdirSync(root,{recursive:true});const manifest=path.join(root,'connection.json'),host=await start(manifest);
 try{const promise=request(manifest,'prd_list_projects',{});let task;for(let i=0;i<100&&!task;i++){await new Promise(r=>setTimeout(r,10));task=host.poll();}assert.equal(task.name,'prd_list_projects');assert.equal(host.poll(),null);host.complete(task.id,{ok:true,value:[{id:'one'},{id:'two'}]});assert.equal((await promise).length,2);const info=JSON.parse(fs.readFileSync(manifest));const denied=await fetch(info.url,{method:'POST',body:'{}'});assert.equal(denied.status,400);}finally{host.close();}assert.equal(fs.existsSync(manifest),false);
});
