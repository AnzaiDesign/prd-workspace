'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const FORMAT = 'PRD-WORKSPACE';
const LIMIT = 80 * 1024 * 1024;
function blank(title = '新建 PRD') {
  return { format: FORMAT, schema: 1, id: crypto.randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), data: { version: 34, title, modules: [], contents: {}, tables: {}, reviews: {}, hists: {}, mtimes: {}, changelog: {}, deleted: [], desktopTrash: {} }, draft: {} };
}
function createDocumentInFolder(root,relative,title){
 if(typeof relative!=='string'||path.isAbsolute(relative))throw Error('无效项目目录。');
 const base=fs.realpathSync(root),dir=fs.realpathSync(path.resolve(base,relative));
 if(dir!==base&&!within(base,dir))throw Error('文档必须创建在当前项目目录内。');
 if(!fs.statSync(dir).isDirectory())throw Error('请选择文件夹创建文档。');
 const name=String(title||'').trim().replace(/\.prdproj$/i,'');
 if(!name||name.length>150||/[<>:"/\\|?*\x00-\x1f]/.test(name)||/[. ]$/.test(name)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))throw Error('文档名称无效，请使用150字以内的有效文件名。');
 const file=path.join(dir,name+'.prdproj'),doc=blank(name);let fd;
 try{fd=fs.openSync(file,'wx');fs.writeFileSync(fd,JSON.stringify(doc,null,2),'utf8');fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;return {path:file,doc};}
 catch(error){if(fd!==undefined){fs.closeSync(fd);fs.unlinkSync(file);}if(error.code==='EEXIST')throw Error('该文件夹已有同名PRD，请换一个名称。');throw error;}
}
function createProjectFolder(root,relative,title){
 if(typeof relative!=='string'||path.isAbsolute(relative))throw Error('无效项目目录。');
 const base=fs.realpathSync(root),dir=fs.realpathSync(path.resolve(base,relative));
 if(dir!==base&&!within(base,dir))throw Error('文件夹必须创建在当前项目内。');
 if(!fs.statSync(dir).isDirectory())throw Error('请选择文件夹。');
 const name=String(title||'').trim();
 if(!name||name.length>150||/[<>:"/\\|?*\x00-\x1f]/.test(name)||/[. ]$/.test(name)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))throw Error('文件夹名称无效，请使用150字以内的有效名称。');
 const target=path.join(dir,name);
 try{fs.mkdirSync(target);}catch(e){if(e.code==='EEXIST')throw Error('已有同名文件或文件夹，请换一个名称。');throw e;}
 return {relative:path.relative(base,target),path:target};
}
function prototypeReference(docPath,input){
 const target=String(input?.target||'').trim(),name=String(input?.name||'').trim();if(!target)throw Error('请填写原型网址或选择本地原型文件。');
 if(/^https?:\/\//i.test(target)){const url=new URL(target);return {type:'url',target:url.href,name:name||url.hostname};}
 if(/^[a-z][a-z0-9+.-]*:/i.test(target)&&!path.isAbsolute(target))throw Error('原型网址仅支持 http 或 https。');
 const file=path.resolve(path.dirname(docPath),target),allowed=['.html','.htm','.pdf','.png','.jpg','.jpeg','.webp','.gif','.rp','.fig','.xd'];
 if(!allowed.includes(path.extname(file).toLowerCase()))throw Error('请选择 HTML、PDF、图片或常见原型设计文件。');
 if(!fs.statSync(file).isFile())throw Error('原型文件不存在。');
 return {type:'file',target:path.relative(path.dirname(docPath),file),name:name||path.basename(file)};
}
function validate(doc) {
  if (!doc || doc.format !== FORMAT || doc.schema !== 1 || typeof doc.id !== 'string' || !doc.data || !Array.isArray(doc.data.modules)) throw new Error('不是受支持的 PRD 文档，或文档格式已损坏。');
  for (const m of doc.data.modules) if (!m || typeof m.key !== 'string' || !Array.isArray(m.items) || m.items.some(i => !i || typeof i.k !== 'string' || typeof i.t !== 'string')) throw new Error('PRD 模块或卡片结构不完整。');
  for (const k of ['contents','tables','reviews','hists','mtimes','changelog']) if (!doc.data[k] || typeof doc.data[k] !== 'object' || Array.isArray(doc.data[k])) throw new Error('PRD 数据字段无效：' + k);
  if (!Array.isArray(doc.data.deleted)) throw new Error('PRD 删除记录无效。');
  return doc;
}
function read(file) {
  return validate(JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')));
}
function atomicWrite(file, content) {
  const temp = file + '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
  let fd;
  try {
    fd = fs.openSync(temp, 'wx'); fs.writeFileSync(fd, content, 'utf8'); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    fs.renameSync(temp, file);
  } finally { if (fd !== undefined) fs.closeSync(fd); if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
function fingerprint(file) {
  return fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null;
}
function backupDir(file) { return path.join(path.dirname(file), '.prd-backups', path.basename(file)); }
function backup(file, force = false) {
  if (!fs.existsSync(file)) return null;
  const dir = backupDir(file); fs.mkdirSync(dir, {recursive:true});
  const files = fs.readdirSync(dir).filter(n=>n.endsWith('.prdproj')).sort().reverse();
  if (!force && files[0] && Date.now() - fs.statSync(path.join(dir, files[0])).mtimeMs < 5 * 60 * 1000) return null;
  const name = new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(2).toString('hex') + '.prdproj';
  fs.copyFileSync(file, path.join(dir, name));
  const all=fs.readdirSync(dir).filter(n=>n.endsWith('.prdproj')).sort().reverse();
  for (const n of all.slice(30)) fs.unlinkSync(path.join(dir,n));
  return name;
}
function write(file, doc, expected, forceBackup = false) {
  validate(doc);
  // The version check and replacement must form one cross-process transaction.
  const canonical=path.join(fs.realpathSync(path.dirname(file)),path.basename(file)).toLowerCase();
  const lock=canonical+'.write-lock',owner=JSON.stringify({pid:process.pid,id:crypto.randomUUID()});
  let acquired=false;
  try {
    try {const fd=fs.openSync(lock,'wx');try{fs.writeFileSync(fd,owner);}finally{fs.closeSync(fd);}acquired=true;}
    catch(e){if(e.code!=='EEXIST')throw e;
      // Serialize stale-lock cleanup so two recovery processes cannot delete a new lock.
      let reap;
      try{reap=fs.openSync(lock+'.reap','wx');const old=JSON.parse(fs.readFileSync(lock,'utf8'));let alive=true;try{process.kill(old.pid,0);}catch(err){if(err.code==='ESRCH')alive=false;}if(!alive)fs.unlinkSync(lock);}
      catch{/* A live writer or another recovery owns the transaction. */}
      finally{if(reap!==undefined){fs.closeSync(reap);fs.unlinkSync(lock+'.reap');}}
      try{const fd=fs.openSync(lock,'wx');try{fs.writeFileSync(fd,owner);}finally{fs.closeSync(fd);}acquired=true;}catch{throw Error('文档正在被其他程序保存，请稍后重试；当前修改已保留。');}
    }
  if (expected !== undefined && fingerprint(file) !== expected) throw new Error('文件已被其他程序修改。为避免覆盖，自动保存已停止；请另存为，或重新打开磁盘上的文档。');
  // Only remove orphaned atomic-write files belonging to this exact document.
  const prefix=path.basename(file)+'.';
  for(const name of fs.readdirSync(path.dirname(file))){if(!name.toLowerCase().startsWith(prefix.toLowerCase()))continue;const match=/^(\d+)\.[a-f0-9]{8}\.tmp$/i.exec(name.slice(prefix.length));if(!match)continue;let dead=false;try{process.kill(Number(match[1]),0);}catch(e){dead=e.code==='ESRCH';}if(dead)try{fs.unlinkSync(path.join(path.dirname(file),name));}catch{/* Preserve evidence if cleanup is not permitted. */}}
  const text = JSON.stringify({...doc,updatedAt:new Date().toISOString()}, null, 2);
  backup(file,forceBackup); atomicWrite(file,text); return fingerprint(file);
  } finally {if(acquired&&fs.existsSync(lock)&&fs.readFileSync(lock,'utf8')===owner)fs.unlinkSync(lock);}
}
function importHtml(file) {
  if(fs.statSync(file).size>LIMIT) throw new Error('HTML 文件过大。');
  const html = fs.readFileSync(file,'utf8');
  const match=html.match(/window\.PRD_DATA\s*=\s*([\s\S]*?);\s*window\.PRD_DATA_INLINE\s*=/);
  if(!match) throw new Error('未找到旧版 PRD 内嵌数据。请先在旧工具中点击“保存文件”。');
  let data; try {data=JSON.parse(match[1]);} catch {throw new Error('旧版 HTML 中的 PRD 数据不是有效 JSON。');}
  const doc=blank(data.title||path.basename(file,'.html')); Object.assign(doc.data,data); doc.data.desktopTrash={}; return validate(doc);
}
function within(root,file) { const r=path.relative(path.resolve(root),path.resolve(file)); return r!=='' && !r.startsWith('..'+path.sep) && r!=='..' && !path.isAbsolute(r); }
function scan(root) {
  const out=[]; let visited=0;
  function walk(dir) {
    if(++visited>5000) return;
    for(const ent of fs.readdirSync(dir,{withFileTypes:true})) {
      if(ent.isSymbolicLink()||ent.name.startsWith('.')||['node_modules','vendor'].includes(ent.name))continue;
      const full=path.join(dir,ent.name);
      if(ent.isDirectory()) {try{walk(full);}catch{}}
      else if(ent.name.toLowerCase().endsWith('.prdproj'))out.push({name:path.basename(ent.name,'.prdproj'),relative:path.relative(root,full),path:full,modified:fs.statSync(full).mtimeMs});
    }
  }
  walk(root); return out.sort((a,b)=>b.modified-a.modified);
}
function projectEntries(root,relative='') {
  if(typeof relative!=='string'||path.isAbsolute(relative))throw Error('无效项目目录。');
  const base=fs.realpathSync(root),dir=fs.realpathSync(path.resolve(base,relative));
  if(dir!==base&&!within(base,dir))throw Error('目录必须位于当前项目内。');
  return fs.readdirSync(dir,{withFileTypes:true}).filter(ent=>!ent.isSymbolicLink()&&(ent.isDirectory()||ent.isFile())).map(ent=>({name:ent.name,kind:ent.isDirectory()?'folder':ent.name.toLowerCase().endsWith('.prdproj')?'prd':'file',relative:path.relative(base,path.join(dir,ent.name)),path:path.join(dir,ent.name)})).sort((a,b)=>Number(b.kind==='folder')-Number(a.kind==='folder')||a.name.localeCompare(b.name,'zh-CN',{numeric:true}));
}
function searchEntries(root,query){
 const q=String(query||'').trim().toLowerCase();if(!q)return {entries:[],truncated:false};
 const entries=[],queue=[''];let count=0,visited=0;
 while(queue.length&&visited++<2000&&count<20000&&entries.length<300){const relative=queue.shift();let children;try{children=projectEntries(root,relative);}catch{continue;}for(const ent of children){count++;if(ent.relative.toLowerCase().includes(q))entries.push(ent);if(ent.kind==='folder')queue.push(ent.relative);if(count>=20000||entries.length>=300)break;}}
 return {entries,truncated:queue.length>0||count>=20000||entries.length>=300};
}
function previewFile(root,relative){
 if(typeof relative!=='string'||path.isAbsolute(relative))throw Error('无效文件路径。');
 const base=fs.realpathSync(root),file=fs.realpathSync(path.resolve(base,relative));if(!within(base,file))throw Error('文件必须位于当前项目内。');
 const stat=fs.statSync(file);if(!stat.isFile())throw Error('请选择文件。');
 const ext=path.extname(file).toLowerCase(),result={name:path.basename(file),path:file,size:stat.size,modified:stat.mtime.toISOString(),kind:'info',content:'此类型提供文件信息预览。'};
 const images={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif'};
 if(images[ext]&&stat.size<=5*1024*1024){result.kind='image';result.content='data:'+images[ext]+';base64,'+fs.readFileSync(file).toString('base64');}
 else if(['.txt','.md','.json','.js','.ts','.tsx','.jsx','.css','.html','.htm','.xml','.csv','.log','.yaml','.yml','.bat','.cmd','.ps1','.py','.ini','.toml','.sql','.svg'].includes(ext)||['LICENSE','README','.gitignore','.npmrc'].includes(path.basename(file))){if(stat.size>1024*1024)result.content='文件超过 1 MB，请使用外部编辑器查看。';else{result.kind='text';result.content=fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'');}}
 return result;
}
module.exports={blank,validate,read,write,atomicWrite,backup,backupDir,fingerprint,importHtml,within,scan,projectEntries,searchEntries,previewFile,prototypeReference,createDocumentInFolder,createProjectFolder};
