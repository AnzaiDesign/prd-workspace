(function(){
class MicCapture{
 constructor(options){this.options=options;this.phase='idle';this.elapsed=0;this.chunks=[];this.bytes=0;}
 get active(){return this.phase!=='idle';}
 update(){this.options.status(this.phase,this.elapsed);}
 async toggle(){if(this.phase==='recording')return this.stop();if(this.phase!=='idle')return;return this.start();}
 async start(){this.phase='requesting';this.update();try{
  this.target=await this.options.target();
  if(!navigator.mediaDevices?.getUserMedia)throw Error('当前浏览器不支持麦克风录音，请使用桌面版或支持录音的浏览器。');
  this.stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true},video:false});
  this.context=new AudioContext({sampleRate:44100});await this.context.resume();
  this.encoder=new lamejs.Mp3Encoder(1,this.context.sampleRate,128);this.chunks=[];this.bytes=0;this.elapsed=0;this.samples=0;this.pending=[];this.sequence=0;
  if(this.options.begin)this.session=await this.options.begin(this.target);
  this.source=this.context.createMediaStreamSource(this.stream);
  const consume=input=>{if(this.phase!=='recording'&&this.phase!=='draining')return;const pcm=new Int16Array(input.length);this.samples+=input.length;for(let i=0;i<input.length;i++){const s=Math.max(-1,Math.min(1,input[i]));pcm[i]=s<0?s*32768:s*32767;}const chunk=this.encoder.encodeBuffer(pcm);if(chunk.length){this.chunks.push(new Uint8Array(chunk));this.bytes+=chunk.length;}};
  if(this.context.audioWorklet&&typeof AudioWorkletNode!=='undefined'){
   await this.context.audioWorklet.addModule('mic-worklet.js');this.processor=new AudioWorkletNode(this.context,'prd-capture');
   this.processor.port.onmessage=e=>{if(e.data==='flushed'){this.flushed?.();return;}consume(e.data);};
  }else{this.processor=this.context.createScriptProcessor(4096,1,1);this.processor.onaudioprocess=e=>consume(e.inputBuffer.getChannelData(0));}
  this.source.connect(this.processor);this.processor.connect(this.context.destination);
  this.phase='recording';this.started=Date.now();this.timer=setInterval(()=>{this.elapsed=Math.floor(this.samples/this.context.sampleRate);this.update();if(this.session){this.queue();this.drain().catch(e=>{this.options.error?.(e);this.stop().catch(err=>this.options.error?.(err));});}},1000);this.update();
 }catch(e){await this.release();this.phase='idle';this.update();if(e.name==='NotAllowedError')throw Error('麦克风访问未获允许，请在浏览器或系统设置中允许麦克风。');if(e.name==='NotFoundError')throw Error('没有检测到可用的麦克风设备。');throw e;}}
 async release(){clearInterval(this.timer);if(this.processor){this.processor.onaudioprocess=null;this.processor.disconnect();}this.source?.disconnect();this.stream?.getTracks().forEach(t=>t.stop());if(this.context&&this.context.state!=='closed')await this.context.close();this.processor=null;this.source=null;this.context=null;this.stream=null;}
 async stop(){if(this.phase!=='recording')return;this.phase='draining';clearInterval(this.timer);this.update();
  if(this.processor?.port){this.source.disconnect();await new Promise(resolve=>{const timeout=setTimeout(resolve,2000);this.flushed=()=>{clearTimeout(timeout);resolve();};this.processor.port.postMessage('flush');});}
  this.rate=this.context?.sampleRate||44100;this.phase='saving';this.update();await this.release();
  if(this.samples===0){const silent=this.encoder.encodeBuffer(new Int16Array(4410));if(silent.length)this.chunks.push(new Uint8Array(silent));}
  const tail=this.encoder.flush();if(tail.length)this.chunks.push(new Uint8Array(tail));this.encoder=null;
  if(this.session)this.queue();else{this.blob=new Blob(this.chunks,{type:'audio/mpeg'});this.chunks=[];}
  try{await this.persist();}catch(e){this.phase='retry';this.update();throw Error('录音已停止，但保存未完成：'+e.message+'。点击“重试保存”保留本次录音。');}}
 queue(){if(!this.chunks.length)return;this.pending.push({index:this.sequence++,blob:new Blob(this.chunks,{type:'audio/mpeg'}),samples:this.samples,rate:this.context?.sampleRate||this.rate||44100});this.chunks=[];}
 async base64(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(Error('无法读取录音数据'));reader.readAsDataURL(blob);});}
 drain(){if(this.writing)return this.writing;this.writing=(async()=>{while(this.pending.length){const part=this.pending[0];await this.options.append(this.session.id,part.index,await this.base64(part.blob),part.samples,part.rate,this.target);this.pending.shift();}})().finally(()=>{this.writing=null;});return this.writing;}
 async persist(){this.phase='saving';this.update();try{if(this.session){await this.drain();const result=await this.options.finish(this.session.id,this.target);await this.options.save(null,this.target,result);await this.options.ack(this.session.id,this.target);this.session=null;}else await this.options.save(await this.base64(this.blob),this.target);this.blob=null;this.phase='idle';this.elapsed=0;this.update();}catch(e){this.phase='retry';this.update();throw e;}}
}
window.MicCapture=MicCapture;
})();
