'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const store=require('../store'),mic=require('../mic-store');
function fixture(){const root=path.resolve('test-results/smoke-runs/recording-fix-'+crypto.randomUUID());fs.mkdirSync(root,{recursive:true});return {root,file:path.join(root,'需求.prdproj')};}
test('录音逐段持久化、重试不重复、中断恢复和另存为携带音频',()=>{
 const {root,file}=fixture(),doc=store.blank('恢复测试');store.write(file,doc);const target={root,docPath:file};const session=mic.begin(target),chunk=Buffer.from([255,251,1,2]);
 mic.append(file,session.id,0,chunk.toString('base64'),44100,44100);mic.append(file,session.id,0,chunk.toString('base64'),44100,44100);
 assert.equal(mic.finish(file,session.id).recording.size,4);
 // Recreate from disk only, just as a different process after a forced exit does.
 const journalFile=path.join(path.dirname(file),'.prd-recordings',session.id+'.json'),journalData=JSON.parse(fs.readFileSync(journalFile));journalData.ownerPID=2147483647;fs.writeFileSync(journalFile,JSON.stringify(journalData));const recovered=store.read(file);assert.equal(mic.recover(file,recovered),true);assert.equal(recovered.data.recordings[0].recovered,true);assert.equal(recovered.data.recordings[0].duration,1);assert.equal(recovered.data.recordings[0].base64,undefined);
 store.write(file,recovered,store.fingerprint(file));mic.ack(file,session.id);assert.equal(mic.recover(file,store.read(file)),false);
 const dest=path.join(root,'迁移','另存.prdproj');fs.mkdirSync(path.dirname(dest));mic.copyReferences(file,dest,recovered,[root]);store.write(dest,recovered);assert.deepEqual(fs.readFileSync(mic.resolve(dest,recovered.data.recordings[0],[root])),chunk);
 assert.throws(()=>mic.resolve(dest,{audioFile:'../../outside.mp3'},[root]));
});
test('长录分段超过旧大小限制，PRD和传递元数据保持小体积',()=>{
 const {root,file}=fixture(),doc=store.blank('分段大录音');store.write(file,doc);const session=mic.begin({root,docPath:file}),chunk=Buffer.alloc(1024*1024);chunk[0]=255;chunk[1]=251;
 // Storage stress, not a claim of a real 120-minute microphone recording.
 for(let i=0;i<112;i++)mic.append(file,session.id,i,chunk.toString('base64'),(i+1)*44100,44100);
 const result=mic.finish(file,session.id);doc.data.recordings=[result.recording];store.write(file,doc);assert.equal(fs.statSync(result.file).size,112*1024*1024);assert.ok(fs.statSync(file).size<5000);assert.equal(store.read(file).data.recordings[0].base64,undefined);
});
test('跨进程保存互斥：替换前暂停写入者，另一写入者不能覆盖；强杀后锁可恢复',async()=>{
 const {root,file}=fixture();store.write(file,store.blank('原始'));const hash=store.fingerprint(file),modulePath=path.resolve(__dirname,'../store.js');
 const child=cp.spawn(process.execPath,['-e',`const fs=require('fs'),s=require(${JSON.stringify(modulePath)});fs.renameSync=()=>{process.send('locked');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,20000);};s.write(${JSON.stringify(file)},s.blank('写入者A'),${JSON.stringify(hash)});`],{windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
 const exited=new Promise(resolve=>child.once('exit',resolve));
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('writer timeout')),5000);child.once('message',()=>{clearTimeout(timer);resolve();});child.once('error',reject);});assert.throws(()=>store.write(file,store.blank('写入者B'),hash),/其他程序保存/);assert.equal(store.read(file).data.title,'原始');}
 finally{child.kill();await exited;}
 store.write(file,store.blank('强杀后恢复'),hash);assert.equal(store.read(file).data.title,'强杀后恢复');assert.throws(()=>store.write(file,store.blank('旧版本'),hash),/其他程序修改/);
});
test('录音本地媒体服务按Range流式返回并拒绝未知令牌',async()=>{
 const {root}=fixture(),file=path.join(root,'audio.mp3'),bytes=Buffer.from([255,251,1,2,3,4]);fs.writeFileSync(file,bytes);const server=await require('../audio-server').start();
 try{const url=server.url(file,'audio/mpeg'),r=await fetch(url,{headers:{Range:'bytes=2-4'}});assert.equal(r.status,206);assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes.subarray(2,5));assert.equal((await fetch(url.replace(/\/[^/]+$/,'/unknown'))).status,404);assert.equal((await fetch(url,{headers:{Range:'bytes=999-'}})).status,416);}finally{server.close();}
});
test('录音进程被强杀后，仅用磁盘恢复；不接管仍在录制的会话',async()=>{
 const {root,file}=fixture(),doc=store.blank('强杀录音');store.write(file,doc);const modulePath=path.resolve(__dirname,'../mic-store.js');
 const child=cp.spawn(process.execPath,['-e',`const mic=require(${JSON.stringify(modulePath)}),s=mic.begin({root:${JSON.stringify(root)},docPath:${JSON.stringify(file)},docId:${JSON.stringify(doc.id)}});mic.append(${JSON.stringify(file)},s.id,0,'//sBAg==',44100,44100);process.send(s.id);setInterval(()=>{},1000);`],{windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
 const exited=new Promise(resolve=>child.once('exit',resolve));
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('recording child timeout')),5000);child.once('message',()=>{clearTimeout(timer);resolve();});child.once('error',reject);});assert.equal(mic.recover(file,store.read(file)),false);}
 finally{child.kill();await exited;}
 const recovered=store.read(file);assert.equal(mic.recover(file,recovered),true);assert.equal(recovered.data.recordings.length,1);assert.equal(recovered.data.recordings[0].recovered,true);
});
test('仅恢复音频文件，不改写PRD；手动添加项目内录音只引用原路径',()=>{
 const {root,file}=fixture(),doc=store.blank('手动添加');store.write(file,doc);const session=mic.begin({root,docPath:file,docId:doc.id});mic.append(file,session.id,0,'//sBAg==',44100,44100);
 const manifest=path.join(root,'.prd-recordings',session.id+'.json'),s=JSON.parse(fs.readFileSync(manifest));s.ownerPID=2147483647;fs.writeFileSync(manifest,JSON.stringify(s));
 const original=fs.readFileSync(file),dataBefore=JSON.stringify(doc);const recovered=mic.recoverFiles(file,doc,[root]);assert.equal(recovered.length,1);assert.equal(JSON.stringify(doc),dataBefore);assert.deepEqual(fs.readFileSync(file),original);assert.equal(mic.recoverFiles(file,doc,[root]).length,0);
 const before=fs.readdirSync(path.join(root,'评审录音')).length,a=mic.importFile({root,docPath:file},recovered[0].file,'audio/mpeg');assert.equal(a.base64,undefined);assert.equal(path.resolve(root,a.audioFile),recovered[0].file);assert.equal(fs.readdirSync(path.join(root,'评审录音')).length,before);
});
