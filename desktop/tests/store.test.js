const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const store=require('../store');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'prd-test-'));
test('在项目根目录和所选子目录新建PRD，不覆盖或越界',()=>{
 const project=fs.mkdtempSync(path.join(os.tmpdir(),'prd-create-'));fs.mkdirSync(path.join(project,'需求'));
 const first=store.createDocumentInFolder(project,'需求','业务说明');assert.equal(first.path,path.join(project,'需求','业务说明.prdproj'));assert.equal(store.read(first.path).data.title,'业务说明');
 const hash=store.fingerprint(first.path);assert.throws(()=>store.createDocumentInFolder(project,'需求','业务说明'),/同名/);assert.equal(store.fingerprint(first.path),hash);
 assert.equal(store.createDocumentInFolder(project,'','根目录文档.prdproj').path,path.join(project,'根目录文档.prdproj'));
 const outside=fs.mkdtempSync(path.join(os.tmpdir(),'prd-outside-'));assert.throws(()=>store.createDocumentInFolder(project,path.relative(project,outside),'越界'),/项目目录/);
 for(const name of ['../bad','a:b','CON','a.',''])assert.throws(()=>store.createDocumentInFolder(project,'',name),/名称无效/);
});
test('原型关联支持网址、本地相对路径并随 PRD 保存',()=>{
 const file=path.join(root,'关联.prdproj'),prototype=path.join(root,'原型.html');
 fs.writeFileSync(prototype,'<h1>原型</h1>');
 assert.equal(store.prototypeReference(file,{target:'https://example.com/prototype'}).type,'url');
 assert.throws(()=>store.prototypeReference(file,{target:'javascript:alert(1)'}));
 assert.throws(()=>store.prototypeReference(file,{target:'program.exe'}));
 const ref=store.prototypeReference(file,{target:prototype,name:'登录原型'});
 assert.equal(ref.target,'原型.html');
 const doc=store.blank();doc.data.prototype=ref;store.write(file,doc,null);
 assert.deepEqual(store.read(file).data.prototype,ref);
});
test('原子保存、重开、备份和外部冲突保护',()=>{
 const file=path.join(root,'文档.prdproj'),doc=store.blank('订单需求');
 let hash=store.write(file,doc,null);assert.equal(store.read(file).data.title,'订单需求');
 doc.data.modules.push({key:'m1',name:'订单',items:[{k:'c1',t:'列表',d:'原文'}]});doc.data.contents.c1='原文';
 hash=store.write(file,doc,hash,true);assert.equal(store.read(file).data.modules.length,1);
 assert.ok(fs.readdirSync(store.backupDir(file)).length>0);
 fs.appendFileSync(file,' ');assert.throws(()=>store.write(file,doc,hash),/其他程序修改/);
 assert.ok(!fs.readdirSync(root).some(n=>n.endsWith('.tmp')));
});
test('旧版 HTML 安全导入，不执行脚本且保留样例结构',()=>{
 const doc=store.importHtml(path.join(__dirname,'../templates/PRD与评审记录工具-测试版.html'));
 assert.equal(doc.data.modules.length,8);assert.equal(doc.data.modules.reduce((n,m)=>n+m.items.length,0),160);
 assert.throws(()=>store.validate({format:'PRD-WORKSPACE',schema:2}),/格式/);
});
test('项目扫描识别嵌套 PRD，忽略备份和依赖目录',()=>{
 const dir=path.join(root,'项目');fs.mkdirSync(path.join(dir,'需求'),{recursive:true});
 const file=path.join(dir,'需求','嵌套.prdproj');store.write(file,store.blank(),null);store.backup(file,true);
 const files=store.scan(dir);assert.equal(files.length,1);assert.equal(files[0].relative,path.join('需求','嵌套.prdproj'));
 assert.equal(store.within(dir,file),true);assert.equal(store.within(dir,path.join(root,'outside.prdproj')),false);
});
test('可移植文档内容和草稿一起保存，清空不靠缓存',()=>{
 const doc=store.blank('完整文档');doc.data.modules=[{key:'m',name:'模块',items:[{k:'c',t:'卡片',d:'正文 </script> 特殊文本'}]}];doc.data.contents.c='正文 </script> 特殊文本';doc.data.reviews.c=[{stage:'内部评审',content:'评审意见'}];doc.draft={editDlg:true,editKey:'c',editContent:'尚未提交的草稿'};
 const file=path.join(root,'独立.prdproj');store.write(file,doc,null);const reopened=store.read(file);assert.equal(reopened.draft.editContent,'尚未提交的草稿');assert.deepEqual(reopened.data,doc.data);
 const copy=path.join(root,'搬家.prdproj');fs.copyFileSync(file,copy);assert.deepEqual(store.read(copy).data,doc.data);
});
test('项目目录按层读取全部类型文件、隐藏文件夹并阻止越界',()=>{
 const dir=path.join(root,'目录树');fs.mkdirSync(path.join(dir,'空文件夹'),{recursive:true});fs.mkdirSync(path.join(dir,'需求'),{recursive:true});fs.mkdirSync(path.join(dir,'.prd-backups'),{recursive:true});
 fs.writeFileSync(path.join(dir,'说明.txt'),'非 PRD');store.write(path.join(dir,'需求','登录.prdproj'),store.blank('登录'),null);
 const entries=store.projectEntries(dir);assert.deepEqual(entries.map(e=>e.name).sort(),['.prd-backups','说明.txt','空文件夹','需求'].sort());
 assert.equal(store.projectEntries(dir,'空文件夹').length,0);assert.equal(store.projectEntries(dir,'需求')[0].name,'登录.prdproj');
 assert.throws(()=>store.projectEntries(dir,'..'),/当前项目内/);assert.throws(()=>store.projectEntries(dir,root),/无效项目目录/);
});
test('项目文件筛选和只读预览，HTML 作为文本而不是执行',()=>{
 const dir=path.join(root,'预览');fs.mkdirSync(path.join(dir,'资料'),{recursive:true});const html='<script>alert(1)</script>';
 fs.writeFileSync(path.join(dir,'资料','说明.html'),html);fs.writeFileSync(path.join(dir,'应用.exe'),'binary');
 const found=store.searchEntries(dir,'说明');assert.equal(found.entries.length,1);assert.equal(found.entries[0].name,'说明.html');
 const preview=store.previewFile(dir,path.join('资料','说明.html'));assert.equal(preview.kind,'text');assert.equal(preview.content,html);
 assert.equal(store.previewFile(dir,'应用.exe').kind,'info');assert.equal(fs.readFileSync(path.join(dir,'资料','说明.html'),'utf8'),html);
 assert.throws(()=>store.previewFile(dir,path.join('..','文档.prdproj')),/当前项目内/);
});
test('项目目录和 PRD 总览均能识别 pack 子目录',()=>{
 const dir=path.join(root,'pack可见性');fs.mkdirSync(path.join(dir,'pack'),{recursive:true});
 const file=path.join(dir,'pack','需求.prdproj');store.write(file,store.blank('需求'),null);
 assert.ok(store.projectEntries(dir).some(e=>e.name==='pack'&&e.kind==='folder'));
 assert.equal(store.projectEntries(dir,'pack')[0].path,file);
 assert.ok(store.scan(dir).some(e=>e.path===file));
});
