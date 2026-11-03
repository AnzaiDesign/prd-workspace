// One-time migration from the preserved HTML reference into maintainable sources.
const fs=require('node:fs'),path=require('node:path'),parser=require('@babel/parser');
const original=fs.readFileSync(path.join(__dirname,'templates/PRD与评审记录工具.html'),'utf8');
let engine=original.match(/<script id="prd-app">([\s\S]*?)<\/script>/)[1];
const historyStart=engine.indexOf('/* 历史记录修复：');
const historyEnd=engine.indexOf('window.__prdVM=new Vue');
const historyRepair=engine.slice(historyStart,historyEnd);
const bootstrap=`
// The host owns persistence. Initialize directly from the opened PRD snapshot.
const prdClone=value=>JSON.parse(JSON.stringify(value));
const SEED=prdClone(parent.editorDocument.data);
const docTitle=SEED.title||'未命名 PRD';
function rvBaseDate(s){return String(s||'').replace(/（已修改[^）]*）/g,'').trim()}
function clTagType(t){return t==='add'?'success':t==='del'?'danger':t==='clear'?'warning':t==='edit'?'':'info'}
const deleted=prdClone(SEED.deleted||[]);
let MODULES=prdClone(SEED.modules||[]).filter(m=>!deleted.includes('mod:'+m.key));
MODULES.forEach(m=>{m.items=m.items.filter(it=>!deleted.includes(it.k));});
const reviews=prdClone(SEED.reviews||{}),mtimes=prdClone(SEED.mtimes||{}),hists=prdClone(SEED.hists||{}),tables=prdClone(SEED.tables||{}),changelog=prdClone(SEED.changelog||{}),contents=prdClone(SEED.contents||{});
MODULES.forEach(m=>m.items.forEach(it=>{if(!Object.prototype.hasOwnProperty.call(contents,it.k))contents[it.k]=it.d||'';it.d=contents[it.k];}));
Object.values(reviews).forEach(list=>list.forEach(r=>{const base=rvBaseDate(r.date);if(base!==r.date){r.date=base;if(!r.mod){r.mod='';r.edited=true;}}}));
const INIT_D={...contents},rOpenInit={};MODULES.forEach(m=>m.items.forEach(it=>{rOpenInit[it.k]=true;}));
`;
const start=engine.indexOf('/* 页面未渲染前的原始模板');
engine=engine.slice(0,start)+bootstrap+historyRepair+engine.slice(historyEnd);
engine=engine.replace('deleted:deleted,rOpen:', 'desktopTrash:SEED.desktopTrash||{},deleted:deleted,rOpen:');
engine=engine.replace('docTitle:docTitle,','docTitle:docTitle,prototype:SEED.prototype||null,');
const ast=parser.parse(engine),edits=[];
const removedMethods=new Set(['buildDataJS','buildSelfContained','saveFile','clearDoc','doArchive','startEditTitle','cancelEditTitle','saveTitle','delItem','delModule','restoreDel','restoreAllDel','rvSaveReviews','homeFile','homeFileLabel','mounted']);
const removedFields=new Set(['titleCustom','titleEditing','titleDraft','archDlg']);
function removeProperty(node){const comma=engine.slice(node.end).match(/^\s*,/);edits.push({start:node.start,end:node.end+(comma?comma[0].length:0),value:''});}
function obsoleteCall(node){if(node.type!=='CallExpression')return false;const c=node.callee;return c.type==='Identifier'&&['persistModules','markTs','touchKeys'].includes(c.name)||c.type==='MemberExpression'&&(c.object.name==='localStorage'||c.property.name==='rvSaveReviews');}
function walk(node,parent){
 if(!node||typeof node!=='object')return;
 if(node.type==='ObjectMethod'&&removedMethods.has(node.key.name)){removeProperty(node);return;}
 if(node.type==='ObjectProperty'&&removedFields.has(node.key.name)){removeProperty(node);return;}
 if(parent?.type==='ObjectMethod'&&parent.key.name==='logOp'&&node.type==='BlockStatement'){
  for(const child of node.body){if(child.type==='TryStatement'||child.type==='IfStatement'&&engine.slice(child.start,child.end).includes('keys.length>500'))edits.push({start:child.start,end:child.end,value:''});else walk(child,node);}return;
 }
 if(node.type==='ExpressionStatement'&&obsoleteCall(node.expression)){edits.push({start:node.start,end:node.end,value:';'});return;}
 for(const [key,value]of Object.entries(node)){if(['loc','start','end','comments','tokens'].includes(key))continue;if(Array.isArray(value))value.forEach(n=>walk(n,node));else if(value&&typeof value==='object')walk(value,node);}
}
walk(ast,null);for(const edit of edits.sort((a,b)=>b.start-a.start))engine=engine.slice(0,edit.start)+edit.value+engine.slice(edit.end);
engine=engine.replace(/\/\*[\s\S]*?\*\//g,comment=>/localStorage|浏览器暂存|按 id 合并文件/.test(comment)?'':comment);
engine=engine.replace('methods:{','methods:{...window.prdEditorActions,');
parser.parse(engine);fs.writeFileSync(path.join(__dirname,'editor-engine.js'),engine.trim()+'\n');
let view=original.slice(0,original.indexOf('<script>/* 本页内嵌数据'));
view=view.replace('https://unpkg.com/element-ui/lib/theme-chalk/index.css','vendor/theme/index.css');
view=view.replace(/<div class="left-head">[\s\S]*?<\/div>\s*<div class="menu">/,'<div class="left-head"><strong class="document-title" :title="docTitle">{{docTitle}}</strong><el-button type="text" size="mini" @click="renameDocument">修改标题</el-button><el-button v-if="!prototype" type="text" size="mini" class="prototype-link" @click="linkPrototype">关联对应原型</el-button><div v-else class="prototype-association"><el-button type="text" size="mini" class="prototype-link" :title="prototype.target" @click="openPrototype"><i class="el-icon-link"></i> {{prototype.name||\'打开对应原型\'}}</el-button><el-button type="text" size="mini" @click="linkPrototype">修改关联</el-button></div></div>\n<div class="menu">');
view=view.replace(/<div style="border-top:1px solid #ebeef5;padding:12px;flex:none">[\s\S]*?<\/div>\s*<\/div>\s*<div class="rightcol">/,'</div>\n<div class="rightcol">');
view=view.replace(/<el-dialog :close-on-click-modal="false" title="归档确认"[\s\S]*?<\/el-dialog>/,'');
view=view.replace(/<el-button size="mini" plain :disabled="isFirst\(it\)"[\s\S]*?<\/el-button><el-button size="mini" plain :disabled="isLast\(it\)"[\s\S]*?<\/el-button>/,'');
view=view.replace('<el-button size="mini" type="danger" plain @click="delItem(it)">删除</el-button>','<el-dropdown trigger="click" @command="command=>cardMoreCommand(command,it)"><el-button size="mini" plain>更多 <i class="el-icon-arrow-down"></i></el-button><el-dropdown-menu slot="dropdown"><el-dropdown-item command="up" :disabled="isFirst(it)">上移</el-dropdown-item><el-dropdown-item command="down" :disabled="isLast(it)">下移</el-dropdown-item><el-dropdown-item command="delete" divided style="color:#f56c6c">删除卡片</el-dropdown-item></el-dropdown-menu></el-dropdown>');
view=view.replace('已删除 {{deleted.length}}','回收站 {{deleted.length}}').replace('文档已清空，点左侧「新增模块」开始录入','从一个模块开始整理需求，点击左侧“新增模块”');
view=view.replace('</head>','<link rel="stylesheet" href="editor.css"></head>');
view+='<script src="vendor/vue.min.js"></script><script src="vendor/element.js"></script><script src="editor-actions.js"></script><script src="editor-engine.js"></script><script src="editor-adapter.js"></script></body></html>\n';
for(const name of ['历史需求总览','评审记录总览','历史需求','评审记录'])if(!view.includes('>'+name+'</el-button>'))throw Error('缺少必须保留的入口：'+name);
fs.writeFileSync(path.join(__dirname,'editor-view.html'),view);
console.log('已提取独立编辑器源码，移除旧缓存与 HTML 自导出机制。');


