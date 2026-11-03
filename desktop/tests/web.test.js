const {test}=require('node:test');const assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {start}=require('../web-server');
test('本地预览 HTTP：页面桥接、请求校验、中文数据、文件选择与冲突保护',async()=>{
 const previousTest=process.env.PRD_PREVIEW_TEST,previousPort=process.env.PRD_PREVIEW_PORT;
 process.env.PRD_PREVIEW_TEST='1';process.env.PRD_PREVIEW_PORT='4193';
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'prd-web-'));let service;
 const current={path:path.join(dir,'需求.prdproj'),hash:'v1'};
 try{
  service=await start({baseDir:path.join(__dirname,'..'),defaultDirectory:dir,getState:()=>({current}),handlers:{bootstrap:()=>({current}),save:doc=>({content:doc.content,hash:'v2'}),choose:()=>service.choose('open',{properties:['openDirectory']})}});
  const html=await (await fetch(service.url)).text();assert.match(html,/web-bridge.js/);assert.match(html,/connect-src 'self'/);
  const token=html.match(/name="prd-preview-token" content="([^"]+)"/)[1];
  const rpc=async(name,args=[],context={})=>{const response=await fetch(service.url+'/api',{method:'POST',headers:{'Content-Type':'application/json','X-PRD-Token':token},body:JSON.stringify({name,args,...context})});return response.json();};
  assert.equal((await fetch(service.url+'/main.js')).status,404);
  assert.equal((await fetch(service.url+'/vendor/%2e%2e%2fmain.js')).status,403);
  assert.equal((await fetch(service.url+'/api',{method:'POST',body:'{}'})).status,403);
  assert.equal((await fetch(service.url+'/api',{method:'POST',headers:{'X-PRD-Token':token,Origin:'http://external.example'},body:'{}'})).status,403);
  assert.equal((await rpc('save',[{content:'中文'}],{documentPath:current.path,hash:'old'})).ok,false);
  const text='中文正文与评审记录'.repeat(20000);const saved=await rpc('save',[{content:text}],{documentPath:current.path,hash:'v1'});assert.equal(saved.value.content,text);
  const choice=rpc('choose');let pending;for(let i=0;i<30;i++){pending=(await rpc('pickerPending')).value;if(pending)break;await new Promise(r=>setTimeout(r,10));}
  assert.equal(pending.kind,'open');assert.equal((await rpc('pickerBrowse',[dir])).value.directory,dir);
  assert.equal((await rpc('pickerAnswer',[{id:pending.id,path:dir}])).ok,true);assert.deepEqual((await choice).value.filePaths,[dir]);
 }finally{if(service)await new Promise(resolve=>service.close(resolve));if(previousTest===undefined)delete process.env.PRD_PREVIEW_TEST;else process.env.PRD_PREVIEW_TEST=previousTest;if(previousPort===undefined)delete process.env.PRD_PREVIEW_PORT;else process.env.PRD_PREVIEW_PORT=previousPort;}
});
