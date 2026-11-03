const fs=require('fs'),path=require('path'),crypto=require('crypto');
exports.run=async(win,app,store)=>{
 const output=path.resolve('test-results/smoke-runs/ui-pressure-'+crypto.randomUUID());fs.mkdirSync(output,{recursive:true});let results={output,measurements:[],status:'running'};const report=()=>fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(results,null,2));report();win.webContents.on('render-process-gone',(_e,details)=>{results.rendererExit=details;report();});win.webContents.on('unresponsive',()=>{results.unresponsive=true;report();});
 const timeout=setTimeout(()=>{results.status='timeout';report();app.exit(2);},180000);
 const frame=code=>win.webContents.executeJavaScript(code,true);
 const wait=async()=>{for(let i=0;i<1200;i++){if(await frame('!!state.current&&!loading'))return;await new Promise(r=>setTimeout(r,50));}throw Error('加载超时');};
 try{
 for(let i=0;i<100;i++){try{if(await frame('typeof state!=="undefined"&&!!state.version'))break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const fixture=store.read(path.resolve('test-results/smoke-runs/专项验收-ef9a1215-76a2-4de4-97bc-de5f9a44df8c/压力.prdproj'));
 fixture.data.tables.c0[0].cols=['字段','说明'];delete fixture.data.tables.c0[0].headers;
 // Separate small module permits measuring a switch away from the large module.
 fixture.data.modules.push({key:'small',name:'小模块',items:[{k:'small-card',t:'对照卡片',d:'对照'}]});fixture.data.contents['small-card']='对照';
 const file=path.join(output,'压力副本.prdproj');store.write(file,fixture);
 let start=Date.now();await frame(`open(${JSON.stringify(file)})`);await wait();results.measurements.push({name:'打开并初始化',ms:Date.now()-start});report();
 results.dom=await frame(`(()=>{const d=$('editor').contentDocument;return {nodes:d.querySelectorAll('*').length,cards:d.querySelectorAll('.field').length,tableRows:d.querySelectorAll('.el-table__row').length};})()`);report();
 results.scroll=await frame(`(async()=>{const w=$('editor').contentWindow,el=w.document.querySelector('.main'),times=[];for(let i=0;i<10;i++){const t=performance.now();el.scrollTop=el.scrollHeight*i/9;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));times.push(Math.round(performance.now()-t));}return times;})()`);report();
 for(const key of ['small','m']){start=Date.now();await frame(`(async()=>{const v=$('editor').contentWindow.__prdVM;v.cur=${JSON.stringify(key)};await v.$nextTick();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));})()`);results.measurements.push({name:'切换模块 '+key,ms:Date.now()-start});report();}
 start=Date.now();await frame(`(async()=>{const v=$('editor').contentWindow.__prdVM;v.openEdit(v.modules[0].items[0]);await v.$nextTick();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));})()`);results.measurements.push({name:'打开含1万行表格编辑框',ms:Date.now()-start});report();
 await frame(`$('editor').contentWindow.__prdVM.editDlg=false`);start=Date.now();await frame('saveNow()');results.measurements.push({name:'保存',ms:Date.now()-start});results.status='completed';report();clearTimeout(timeout);app.exit(0);
 }catch(e){results.status='failed';results.error=e.stack;report();clearTimeout(timeout);app.exit(1);}
};
