const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const store=require('../store'),micStore=require('../mic-store');
function mp3(){const context={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../vendor/lame.min.js'),'utf8'),context);const encoder=new context.lamejs.Mp3Encoder(1,44100,128),pcm=new Int16Array(44100);for(let i=0;i<pcm.length;i++)pcm[i]=Math.sin(2*Math.PI*440*i/44100)*8000;return Buffer.concat([Buffer.from(encoder.encodeBuffer(pcm)),Buffer.from(encoder.flush())]);}
test('真实MP3编码并自动保存到所属项目目录，不覆盖已有录音',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'prd-mic-'));fs.mkdirSync(path.join(root,'需求'));const target=micStore.target(path.join(root,'需求','PRD.prdproj'),[{id:'p',root}],store.within),audio=mp3();
 const a=micStore.save(audio.toString('base64'),target,store.within),b=micStore.save(audio.toString('base64'),target,store.within);
 assert.equal(path.dirname(a.file),path.join(root,'评审录音'));assert.ok(a.file.endsWith('.mp3'));assert.notEqual(a.file,b.file);assert.deepEqual(fs.readFileSync(a.file),audio);assert.equal(a.recording.mime,'audio/mpeg');
 assert.equal(a.recording.reviewStage,'');assert.equal(a.recording.reviewParticipants,'');assert.equal(a.recording.reviewTime,'');
 assert.throws(()=>micStore.save(Buffer.from('WEBM').toString('base64'),target,store.within));assert.throws(()=>micStore.target(path.join(root,'outside.prdproj'),[],store.within));
});
test('麦克风拒绝权限与结束录音释放设备（模拟设备）',async()=>{
 const context={window:{},navigator:{mediaDevices:{getUserMedia:async()=>{throw Object.assign(Error('denied'),{name:'NotAllowedError'});}}},Blob,FileReader:class{readAsDataURL(blob){blob.arrayBuffer().then(b=>{this.result='data:audio/mpeg;base64,'+Buffer.from(b).toString('base64');this.onload();});}},setInterval,clearInterval,Int16Array,Uint8Array};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../mic-capture.js'),'utf8'),context);let saved,stopped=false,closed=false;
 const recorder=new context.window.MicCapture({target:async()=>({}),status(){},save:async base64=>{saved=base64;},error(){}});
 await assert.rejects(()=>recorder.start(),/麦克风访问/);assert.equal(recorder.phase,'idle');
 recorder.phase='recording';recorder.encoder={flush:()=>new Uint8Array([255,251,1,2])};recorder.stream={getTracks:()=>[{stop(){stopped=true;}}]};recorder.context={state:'running',close:async()=>{closed=true;}};await recorder.stop();assert.ok(stopped&&closed);assert.equal(recorder.phase,'idle');assert.equal(saved,'//sBAg==');
});
