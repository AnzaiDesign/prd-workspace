'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
exports.run=async function(win,app,store){
 const root=path.resolve('test-results/smoke-runs/manual-recording-'+crypto.randomUUID());fs.mkdirSync(root,{recursive:true});
 const results=[],dialog=require('electron').dialog;let selected=root,destination=path.join(root,'手动录音.prdproj');dialog.showOpenDialog=async()=>({canceled:false,filePaths:[selected]});dialog.showSaveDialog=async()=>({canceled:false,filePath:destination});
 const run=code=>win.webContents.executeJavaScript(code,true);
 async function check(name,code){const passed=!!await run(code);results.push({name,passed});fs.writeFileSync(path.join(root,'result.json'),JSON.stringify(results,null,2));if(!passed)throw Error(name);}
 await new Promise(r=>setTimeout(r,700));
 await check('创建独立手动录音验收文档',`(async()=>{state=await api('createProject');drawProjects();await accept(await api('newDoc',state.settings.selected,'手动录音'));while(loading)await new Promise(r=>setTimeout(r,50));return !!$('editor').contentWindow.__prdVM;})()`);
 await check('AudioWorklet采集并逐段写入MP3',`(async()=>{await reviewMic.start();await new Promise(r=>setTimeout(r,2400));return !!reviewMic.processor.port&&reviewMic.samples>44100;})()`);
 const before=store.fingerprint(destination);
 await check('停止只保存MP3，不加入PRD或撤销历史',`(async()=>{const n=history.length;await reviewMic.stop();return reviewMic.phase==='idle'&&$('editor').contentWindow.__prdVM.recordings.length===0&&history.length===n;})()`);
 if(store.fingerprint(destination)!==before)throw Error('停止录音改写了PRD');
 selected=path.join(root,'评审录音',fs.readdirSync(path.join(root,'评审录音')).find(n=>n.endsWith('.mp3')));if(!fs.statSync(selected).size)throw Error('MP3为空');
 const upload=`const v=$('editor').contentWindow.__prdVM;v.recordingsDlg=true;await v.$nextTick();const c=v.$children.flatMap(function walk(x){return [x,...x.$children.flatMap(walk)]}).find(x=>x.$options._componentTag==='review-recordings');c.upload();await c.chooseUploadFiles();`;
 await check('用户手动添加时只保存路径与评审信息',`(async()=>{${upload}if(v.recordings.length||!c.pendingFiles[0]?.audioFile||c.pendingFiles[0].base64)return false;c.uploadForm={reviewStage:'内部评审',reviewParticipants:'测试人员',reviewTime:'2026-10-30 09:00:00'};c.confirmUpload();await v.$nextTick();await flush();v.recordingsDlg=false;return v.recordings.length===1&&!v.recordings[0].base64;})()`);
 if(fs.readdirSync(path.join(root,'评审录音')).length!==1)throw Error('项目内选择录音发生重复复制');
 await check('路径录音通过流式播放器播放',`(async()=>{const a=new Audio(await api('recordingURL',state.current.doc.data.recordings[0].id));try{await new Promise((resolve,reject)=>{a.onloadedmetadata=resolve;a.onerror=()=>reject(Error('媒体加载失败'));setTimeout(()=>reject(Error('媒体加载超时')),7000);});await a.play();await new Promise(r=>setTimeout(r,600));return a.duration>1&&a.currentTime>0;}finally{a.pause();a.src='';}})()`);
 destination=path.join(root,'另存目录','副本.prdproj');fs.mkdirSync(path.dirname(destination));
 await check('另存为携带已手动添加的音频',`(async()=>{await saveAs();while(loading)await new Promise(r=>setTimeout(r,50));return state.current.doc.data.recordings[0].audioFile.includes('.assets');})()`);
 await run(`(async()=>{await reviewMic.start();await new Promise(r=>setTimeout(r,1400));})()`);
 const external=store.read(destination);external.data.title='外部版本保留';store.write(destination,external,store.fingerprint(destination));const externalHash=store.fingerprint(destination);
 await check('PRD被外部修改也不影响结束保存录音文件',`(async()=>{await reviewMic.stop();return reviewMic.phase==='idle'&&$('editor').contentWindow.__prdVM.recordings.length===1;})()`);
 if(store.fingerprint(destination)!==externalHash)throw Error('结束录音覆盖了外部版本');
 await run(`open(state.current.path)`);
 const childCode=`const mic=require(${JSON.stringify(path.join(__dirname,'mic-store.js'))}),s=mic.begin({root:${JSON.stringify(root)},docPath:${JSON.stringify(destination)},docId:${JSON.stringify(store.read(destination).id)}});mic.append(${JSON.stringify(destination)},s.id,0,'//sBAg==',44100,44100);`;
 require('node:child_process').execFileSync(process.execPath,['-e',childCode],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true});const recoveryHash=store.fingerprint(destination);
 await check('重开只恢复中断音频文件，不自动导入PRD',`(async()=>{await open(state.current.path);while(loading)await new Promise(r=>setTimeout(r,50));return state.current.recoveredAudioFiles.length===1&&state.current.doc.data.recordings.length===1;})()`);
 if(store.fingerprint(destination)!==recoveryHash)throw Error('恢复音频改写了PRD');
 const pointer=path.resolve('test-results/active-acceptance.json');if(fs.existsSync(pointer)){const a=JSON.parse(fs.readFileSync(pointer)),long=path.join(a.root,'评审录音/评审录音_2026-10-29_22-14-14_d1aa96.mp3');if(fs.existsSync(long)){selected=long;await check('真实旧长录MP3手动添加，PRD无Base64且界面可继续响应',`(async()=>{${upload}c.uploadForm={reviewStage:'长录手动添加验收',reviewParticipants:'测试人员',reviewTime:'2026-10-30 09:00:00'};c.confirmUpload();await v.$nextTick();await flush();v.recordingsDlg=false;return v.recordings.length===2&&v.recordings.every(a=>a.audioFile&&!a.base64)&&JSON.stringify(snapshot()).length<10000;})()`);if(fs.statSync(destination).size>10000)throw Error('长录被嵌入PRD');}}
 win.setSize(1080,720);win.showInactive();
 for(const theme of ['light','dark'])await check('小窗口上传表单滚动及固定标题：'+theme,`(async()=>{PRDTheme.apply('${theme}');const v=$('editor').contentWindow.__prdVM,w=$('editor').contentWindow;v.recordingsDlg=true;await v.$nextTick();const c=v.$children.flatMap(function walk(x){return [x,...x.$children.flatMap(walk)]}).find(x=>x.$options._componentTag==='review-recordings');c.upload();await new Promise(r=>setTimeout(r,700));const d=w.document.querySelector('.record-upload-dialog'),h=d.querySelector('.el-dialog__header'),b=d.querySelector('.el-dialog__body'),f=d.querySelector('.el-dialog__footer'),top=h.getBoundingClientRect().top;b.scrollTop=b.scrollHeight;const ok=top>=0&&Math.abs(h.getBoundingClientRect().top-top)<1&&f.getBoundingClientRect().bottom<=w.innerHeight+1;c.showUpload=false;v.recordingsDlg=false;await new Promise(r=>setTimeout(r,400));return ok;})()`);
 console.log('MANUAL_RECORDING_RESULT '+root);console.log(JSON.stringify(results));app.exit(0);
};
