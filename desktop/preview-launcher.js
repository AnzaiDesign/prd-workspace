const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
async function main(){
 const manifest=path.join(__dirname,'../preview-data/server.json');
 try{const info=JSON.parse(fs.readFileSync(manifest,'utf8'));const response=await fetch(info.url+'/health',{signal:AbortSignal.timeout(1000)});const health=await response.json();if(health.app==='prd-preview'){console.log('预览服务已运行：'+info.url);return;}}catch{}
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const child=spawn(require('electron'),['.','--web-preview'],{cwd:path.join(__dirname,'..'),env,windowsHide:true,stdio:'inherit'});
 child.on('error',e=>{console.error(e.message);process.exitCode=1;});child.on('exit',code=>{process.exitCode=code||0;});
 process.on('SIGINT',()=>child.kill());process.on('SIGTERM',()=>child.kill());
}
main();
