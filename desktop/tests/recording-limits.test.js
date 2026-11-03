const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const store=require('../store'),micStore=require('../mic-store');
test('大录音超过旧25MB限制仍能保存，超过旧80MB的含录音文档可重开',()=>{
 const root=path.resolve('test-results/smoke-runs/unlimited-recording-'+crypto.randomUUID());fs.mkdirSync(root,{recursive:true});
 const audio=Buffer.alloc(26*1024*1024);audio[0]=255;audio[1]=251;const result=micStore.save(audio.toString('base64'),{root,docPath:path.join(root,'需求.prdproj')},store.within);assert.equal(fs.statSync(result.file).size,audio.length);
 assert.equal(result.recording.base64,undefined);const legacy={...result.recording,base64:audio.toString('base64')};delete legacy.audioFile;const d=store.blank('大录音');d.data.recordings=[legacy,{...legacy,id:crypto.randomUUID()},{...legacy,id:crypto.randomUUID()}];const file=path.join(root,'需求.prdproj');store.write(file,d);assert.ok(fs.statSync(file).size>80*1024*1024);const restored=store.read(file);assert.equal(restored.data.recordings.length,3);assert.equal(Buffer.from(restored.data.recordings[2].base64,'base64').length,audio.length);
});
