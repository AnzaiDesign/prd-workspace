'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const store=require(fs.existsSync(path.join(__dirname,'../store.js'))?'../store.js':'./store.js');
const help='先使用prd_read_document读取hash，写入时传expectedHash。请先在软件中保存并关闭目标文档，避免界面旧数据冲突。仅操作--root指定的项目目录。正文为普通文本，保留表格、附件、流程图、评审与历史。';
const str={type:'string',minLength:1};
const specs=[
 ['prd_list_files','列出项目目录中的文件和文件夹',{directory:{type:'string'}},[]],
 ['prd_read_document','读取PRD内容、历史、评审及录音元数据，不返回录音或附件二进制',{file:str},['file']],
 ['prd_create_document','在已有项目子目录新建独立PRD，不覆盖已有文件',{directory:{type:'string'},title:str},['title']],
 ['prd_apply_changes','原子批量撰写PRD。操作：rename_document(title)、add_module(name)、rename_module(moduleKey,name)、add_card(moduleKey,title,content)、update_card(cardKey,title可选,content可选)、add_review(cardKey,stage,participants数组,content)、set_minutes(recordingId,minutes,transcript可选)。先读取获得真实ID及hash。保留原内容历史，强制备份。',{file:str,expectedHash:str,changes:{type:'array',minItems:1,maxItems:100,items:{type:'object',properties:{op:{enum:['rename_document','add_module','rename_module','add_card','update_card','add_review','set_minutes']},moduleKey:str,cardKey:str,recordingId:str,title:str,name:str,content:{type:'string'},stage:str,participants:{type:'array',items:str},minutes:{type:'string'},transcript:{type:'string'}},required:['op'],additionalProperties:false}}},['file','expectedHash','changes']]
];
function createService(root,options={}){
 const base=fs.realpathSync(root);if(!fs.statSync(base).isDirectory())throw Error('--root必须为项目目录');
 function locate(relative,directory=false){if(typeof relative!=='string'||path.isAbsolute(relative))throw Error('只允许项目相对路径');const real=fs.realpathSync(path.resolve(base,relative));if(real!==base&&!store.within(base,real))throw Error('禁止访问项目目录之外的文件');if(directory!==fs.statSync(real).isDirectory())throw Error('路径类型不符');if(!directory&&path.extname(real).toLowerCase()!=='.prdproj')throw Error('只允许PRD文档');return real;}
 function text(v,label){if(typeof v!=='string'||!v.trim()||v.length>200000)throw Error(label+'必须为非空文本且不超过20万字');return v;}
 function call(name,a={}){
 if(name==='prd_list_files'){const dir=locate(a.directory||'',true);return fs.readdirSync(dir,{withFileTypes:true}).filter(e=>!e.isSymbolicLink()&&!['node_modules','.git','.prd-backups'].includes(e.name)).map(e=>({name:e.name,kind:e.isDirectory()?'directory':'file',relative:path.relative(base,path.join(dir,e.name))}));}
 if(name==='prd_create_document'){const dir=locate(a.directory||'',true);const r=store.createDocumentInFolder(base,path.relative(base,dir),text(a.title,'标题'));return {file:path.relative(base,r.path),hash:store.fingerprint(r.path),documentId:r.doc.id};}
 const file=locate(a.file),hash=store.fingerprint(file),doc=store.read(file),d=doc.data;if(store.fingerprint(file)!==hash)throw Error('读取期间文档已改变，请重试');
 if(name==='prd_read_document'){return {file:a.file,hash,instructions:help,document:{id:doc.id,...d,attachments:Object.fromEntries(Object.entries(d.attachments||{}).map(([k,v])=>[k,v.map(({base64,...meta})=>meta)])),recordings:(d.recordings||[]).map(({base64,...meta})=>meta)},hasDraft:!!Object.values(doc.draft||{}).some(v=>v===true)};}
 if(name!=='prd_apply_changes')throw Error('未知工具');
 if(a.expectedHash!==hash)throw Error('文档已改变，请重新读取，禁止覆盖');
 if(['editDlg','dlg','newDlg','newModDlg','editModDlg','rsnDlg'].some(k=>doc.draft?.[k]))throw Error('文档含未提交编辑草稿，请先在软件中保存或取消并关闭文档');
 if(!Array.isArray(a.changes)||!a.changes.length||a.changes.length>100)throw Error('changes必须为1至100项');
 const timestamp=new Date().toISOString(),created=[];d.changelog=d.changelog||{};
 const moduleBy=k=>{const m=d.modules.find(m=>m.key===k);if(!m)throw Error('模块不存在');return m;};
 const cardBy=k=>{for(const m of d.modules){const card=m.items.find(c=>c.k===k);if(card)return {m,card};}throw Error('卡片不存在');};
 for(const c of a.changes){let ctx={};switch(c.op){
 case 'rename_document':d.title=text(c.title,'标题');break;
 case 'add_module':{const m={key:'mod'+crypto.randomUUID(),name:text(c.name,'模块名称'),items:[]};d.modules.push(m);created.push({moduleKey:m.key});ctx={modKey:m.key,modName:m.name};break;}
 case 'rename_module':{const m=moduleBy(c.moduleKey);m.name=text(c.name,'模块名称');ctx={modKey:m.key,modName:m.name};break;}
 case 'add_card':{const m=moduleBy(c.moduleKey),card={k:'it'+crypto.randomUUID(),t:text(c.title,'标题'),d:typeof c.content==='string'?c.content:''};m.items.push(card);d.contents[card.k]=card.d;d.mtimes[card.k]=timestamp;created.push({cardKey:card.k});ctx={modKey:m.key,cardKey:card.k,cardName:card.t};break;}
 case 'update_card':{const {m,card}=cardBy(c.cardKey);if(c.title===undefined&&c.content===undefined)throw Error('请提供title或content');d.hists[card.k]=d.hists[card.k]||[];d.hists[card.k].unshift({date:d.mtimes[card.k]||timestamp,content:d.contents[card.k]??card.d??'',tables:d.tables[card.k]||[],label:'AI修改前内容'});d.hists[card.k]=d.hists[card.k].slice(0,50);if(c.title!==undefined)card.t=text(c.title,'标题');if(c.content!==undefined){if(typeof c.content!=='string'||c.content.length>200000)throw Error('正文必须为文本且不超过20万字');card.d=c.content;d.contents[card.k]=c.content;}d.mtimes[card.k]=timestamp;ctx={modKey:m.key,cardKey:card.k,cardName:card.t};break;}
 case 'add_review':{const {m,card}=cardBy(c.cardKey);if(!Array.isArray(c.participants)||c.participants.some(p=>typeof p!=='string'))throw Error('participants必须为姓名数组');(d.reviews[card.k]||(d.reviews[card.k]=[])).push({stage:text(c.stage,'评审阶段'),users:c.participants.join('，')||'未填写',content:text(c.content,'评审意见'),date:timestamp});ctx={modKey:m.key,cardKey:card.k,cardName:card.t};break;}
 case 'set_minutes':{const r=(d.recordings||[]).find(r=>r.id===c.recordingId);if(!r)throw Error('录音不存在');r.minutes=text(c.minutes,'会议纪要');if(c.transcript!==undefined)r.transcript=text(c.transcript,'转写文本');break;}
 default:throw Error('不支持的操作');}
 d.changelog['mcp'+crypto.randomUUID()]={t:timestamp,ts:Date.now(),op:'AI '+c.op,type:c.op==='add_review'?'review':'edit',...ctx,detail:'通过本地MCP修改',content:c.content||c.minutes||''};
 }
 const next=options.write?options.write(file,doc,a.expectedHash):store.write(file,doc,a.expectedHash,true);return {file:a.file,hash:next,created,backupCreated:true};
 }
 return {call,root:base};
}
function serve(root){const service=createService(root);let initialized=false,buffer='';const send=x=>process.stdout.write(JSON.stringify(x)+'\n');
 process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>{buffer+=chunk;if(Buffer.byteLength(buffer)>4*1024*1024){process.stderr.write('请求过大\n');process.exit(1);}let n;while((n=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,n);buffer=buffer.slice(n+1);if(!line.trim())continue;let r;try{r=JSON.parse(line);}catch{send({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}});continue;}if(!Object.hasOwn(r,'id'))continue;try{let result;if(r.method==='initialize'){initialized=true;result={protocolVersion:['2024-11-05','2025-03-26','2025-06-18','2025-11-25'].includes(r.params?.protocolVersion)?r.params.protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'prd-review-manager',version:'0.1.0'},instructions:help};}else if(r.method==='ping')result={};else if(!initialized)throw Error('请先initialize');else if(r.method==='tools/list')result={tools:specs.map(([name,description,properties,required])=>({name,description,inputSchema:{type:'object',properties,required,additionalProperties:false},annotations:{readOnlyHint:['prd_list_files','prd_read_document'].includes(name),destructiveHint:name==='prd_apply_changes',openWorldHint:false}}))};else if(r.method==='tools/call'){try{result={content:[{type:'text',text:JSON.stringify(service.call(r.params.name,r.params.arguments))}]};}catch(e){result={isError:true,content:[{type:'text',text:e.message}]};}}else{send({jsonrpc:'2.0',id:r.id,error:{code:-32601,message:'Method not found'}});continue;}send({jsonrpc:'2.0',id:r.id,result});}catch(e){send({jsonrpc:'2.0',id:r.id,error:{code:-32602,message:e.message}});}}});}
if(require.main===module&&process.argv.includes('--connect')){require('./app-client.cjs').serve(process.argv[process.argv.indexOf('--connect')+1]);}
else if(require.main===module){const index=process.argv.indexOf('--root');if(index<0||!process.argv[index+1]){process.stderr.write('需要显式指定 --root 项目目录\n');process.exitCode=1;}else try{serve(process.argv[index+1]);}catch(e){process.stderr.write(e.message+'\n');process.exitCode=1;}}
module.exports={createService,serve,specs};
