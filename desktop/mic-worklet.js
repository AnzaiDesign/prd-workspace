// Capture on the audio rendering thread so UI layout and saves cannot skip samples.
class PRDCapture extends AudioWorkletProcessor {
 constructor(){super();this.buffer=new Float32Array(4096);this.offset=0;this.port.onmessage=e=>{if(e.data==='flush'){if(this.offset)this.port.postMessage(this.buffer.slice(0,this.offset));this.offset=0;this.port.postMessage('flushed');}};}
 process(inputs){const input=inputs[0]?.[0];if(input)for(let i=0;i<input.length;i++){this.buffer[this.offset++]=input[i];if(this.offset===4096){this.port.postMessage(this.buffer);this.buffer=new Float32Array(4096);this.offset=0;}}return true;}
}
registerProcessor('prd-capture',PRDCapture);
