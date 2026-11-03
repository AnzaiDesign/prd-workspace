const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const store=require('./store');
function journalDir(docPath){return path.join(path.dirname(docPath),'.prd-recordings');}
function journal(docPath,id){if(!/^[a-f0-9-]{36}$/i.test(id))throw Error('无效录音会话');return path.join(journalDir(docPath),id+'.json');}
function load(docPath,id){const file=journal(docPath,id),s=JSON.parse(fs.readFileSync(file,'utf8'));if(path.resolve(s.docPath)!==path.resolve(docPath))throw Error('录音文档不匹配');return s;}
function resolve(docPath,recording,roots){
 const file=fs.realpathSync(path.resolve(path.dirname(docPath),recording.audioFile));
 if(!roots.some(root=>{try{return store.within(fs.realpathSync(root),file);}catch{return false;}}))throw Error('录音文件不属于当前项目');
 return file;
}
exports.resolve=resolve;
exports.begin=function(target){
 const root=fs.realpathSync(target.root),dir=path.join(root,'评审录音');fs.mkdirSync(dir,{recursive:true});if(!store.within(root,fs.realpathSync(dir)))throw Error('录音目录不合法');
 const id=crypto.randomUUID(),name='评审录音_'+new Date().toISOString().replace(/[:.]/g,'-')+'_'+id.slice(0,8)+'.mp3',file=path.join(dir,name);
 fs.closeSync(fs.openSync(file,'wx'));fs.mkdirSync(journalDir(target.docPath),{recursive:true});
 const s={id,ownerPID:process.pid,docId:target.docId,docPath:target.docPath,audioFile:path.relative(path.dirname(target.docPath),file),name,root,samples:0,sampleRate:44100,next:0};
 store.atomicWrite(journal(target.docPath,id),JSON.stringify(s));return {id};
};
exports.append=function(docPath,id,index,base64,samples,sampleRate){
 const s=load(docPath,id);if(index<s.next)return {next:s.next};if(index!==s.next)throw Error('录音分段顺序异常');
 if(typeof base64!=='string'||!/^[a-z0-9+/]*={0,2}$/i.test(base64)||!Number.isSafeInteger(samples)||samples<0||![8000,11025,12000,16000,22050,24000,32000,44100,48000].includes(sampleRate))throw Error('录音分段数据无效');
 const file=resolve(docPath,s,[s.root]),b=Buffer.from(base64,'base64'),fd=fs.openSync(file,'r+');try{fs.ftruncateSync(fd,s.bytes||0);let written=0;while(written<b.length){const n=fs.writeSync(fd,b,written,b.length-written,(s.bytes||0)+written);if(!n)throw Error('录音写入未完成');written+=n;}fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 s.bytes=(s.bytes||0)+b.length;s.samples=samples;s.sampleRate=sampleRate;s.next++;store.atomicWrite(journal(docPath,id),JSON.stringify(s));return {next:s.next};
};
function result(docPath,s,recovered=false,roots=[s.root]){const file=resolve(docPath,s,roots);return {file,recording:{id:s.id,name:s.name,title:s.name.slice(0,-4),audioFile:s.audioFile,size:fs.statSync(file).size,mime:'audio/mpeg',duration:s.samples/s.sampleRate,transcript:'',minutes:'',reviewStage:'',reviewParticipants:'',reviewTime:'',recovered}};}
exports.finish=(docPath,id)=>{const s=load(docPath,id);s.finished=true;store.atomicWrite(journal(docPath,id),JSON.stringify(s));return result(docPath,s);};
exports.ack=function(docPath,id){const file=journal(docPath,id);if(fs.existsSync(file))fs.unlinkSync(file);};
exports.recover=function(docPath,doc,roots){
 const dir=journalDir(docPath);if(!fs.existsSync(dir))return false;let changed=false;
 for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.json'))){try{const s=JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));if(s.detached||(s.docId?s.docId!==doc.id:path.resolve(s.docPath)!==path.resolve(docPath)))continue;
 if(s.ownerPID){let alive=true;try{process.kill(s.ownerPID,0);}catch(e){if(e.code==='ESRCH')alive=false;}if(alive)continue;}
 const audio=resolve(docPath,s,roots||[s.root]);if(Number.isSafeInteger(s.bytes)&&fs.statSync(audio).size>s.bytes)fs.truncateSync(audio,s.bytes);
 const r=result(docPath,s,true,roots||[s.root]);if(!r.recording.size)continue;doc.data.recordings||=[];if(!doc.data.recordings.some(a=>a.id===s.id)){doc.data.recordings.push(r.recording);changed=true;}
 }catch{/* Keep recovery evidence for a later retry. */}}
 return changed;
};
// Recover audio files without importing them into the user's PRD.
exports.recoverFiles=function(docPath,doc,roots){
 const shadow={id:doc.id,data:{recordings:[]}};exports.recover(docPath,shadow,roots);const results=[];
 for(const a of shadow.data.recordings){const file=journal(docPath,a.id),s=JSON.parse(fs.readFileSync(file,'utf8'));s.detached=true;store.atomicWrite(file,JSON.stringify(s));results.push({file:resolve(docPath,a,roots||[s.root]),name:a.name});}
 return results;
};
exports.completeFile=function(docPath,id){const s=load(docPath,id);if(!s.finished)throw Error('录音文件尚未完成保存');exports.ack(docPath,id);};
exports.cleanupRegistered=function(docPath,doc){
 const dir=journalDir(docPath),ids=new Set((doc.data.recordings||[]).map(a=>a.id));if(!fs.existsSync(dir))return;
 for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.json'))){try{const file=path.join(dir,name),s=JSON.parse(fs.readFileSync(file,'utf8'));if(!ids.has(s.id)||(s.docId?s.docId!==doc.id:path.resolve(s.docPath)!==path.resolve(docPath)))continue;
 let alive=false;if(s.ownerPID){try{process.kill(s.ownerPID,0);alive=true;}catch(e){if(e.code!=='ESRCH')alive=true;}}if(!alive)fs.unlinkSync(file);
 }catch{/* Keep journal when its status cannot be established safely. */}}
};
exports.copyReferences=function(from,to,doc,roots){for(const a of doc.data.recordings||[]){if(!a.audioFile)continue;const source=resolve(from,a,roots),dir=path.join(path.dirname(to),path.basename(to)+'.assets','录音');fs.mkdirSync(dir,{recursive:true});const dest=path.join(dir,crypto.randomUUID()+path.extname(source));fs.copyFileSync(source,dest);a.audioFile=path.relative(path.dirname(to),dest);}};
exports.transferJournals=function(from,to,doc){
 for(const a of doc.data.recordings||[]){if(!a.audioFile||!/^[a-f0-9-]{36}$/i.test(a.id))continue;const old=journal(from,a.id);if(!fs.existsSync(old))continue;const s=load(from,a.id);if(!s.finished)continue;
  s.docPath=to;s.docId=doc.id;s.root=path.dirname(to);s.audioFile=a.audioFile;s.bytes=a.size;fs.mkdirSync(journalDir(to),{recursive:true});store.atomicWrite(journal(to,a.id),JSON.stringify(s));fs.unlinkSync(old);
 }
};
exports.importFile=function(target,file,mime){
 const dir=path.join(fs.realpathSync(target.root),'评审录音');fs.mkdirSync(dir,{recursive:true});if(!store.within(fs.realpathSync(target.root),fs.realpathSync(dir)))throw Error('录音目录不合法');
 const id=crypto.randomUUID(),source=fs.realpathSync(file),dest=store.within(fs.realpathSync(target.root),source)?source:path.join(dir,id+path.extname(file)),name=path.basename(file);if(dest!==source)fs.copyFileSync(source,dest,fs.constants.COPYFILE_EXCL);
 return {id,name,title:path.basename(name,path.extname(name)),size:fs.statSync(dest).size,mime,audioFile:path.relative(path.dirname(target.docPath),dest),transcript:'',minutes:''};
};
exports.target=function(docPath,projects,within){const project=projects.filter(p=>within(p.root,docPath)).sort((a,b)=>b.root.length-a.root.length)[0];if(!project)throw Error('请先将当前 PRD 所在目录添加为项目。');return {docPath,projectId:project.id,root:project.root};};
exports.save=function(base64,target,within){
 if(typeof base64!=='string'||!/^[a-z0-9+/]*={0,2}$/i.test(base64))throw Error('录音数据无效。');
 const buffer=Buffer.from(base64,'base64');if(buffer.length<4||!(buffer[0]===0xff&&(buffer[1]&0xe0)===0xe0))throw Error('录音不是有效的 MP3 数据。');
 const root=fs.realpathSync(target.root),dir=path.join(root,'评审录音');fs.mkdirSync(dir,{recursive:true});if(!within(root,fs.realpathSync(dir)))throw Error('录音目录不能指向项目之外。');
 const d=new Date(),pad=n=>String(n).padStart(2,'0'),stamp=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'_'+pad(d.getHours())+'-'+pad(d.getMinutes())+'-'+pad(d.getSeconds()),name='评审录音_'+stamp+'_'+crypto.randomBytes(3).toString('hex')+'.mp3',file=path.join(dir,name);
 const fd=fs.openSync(file,'wx');try{fs.writeFileSync(fd,buffer);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 return {file,recording:{id:crypto.randomUUID(),name,title:name.slice(0,-4),size:buffer.length,mime:'audio/mpeg',audioFile:path.relative(path.dirname(target.docPath),file),transcript:'',minutes:'',reviewStage:'',reviewParticipants:'',reviewTime:''}};
};
