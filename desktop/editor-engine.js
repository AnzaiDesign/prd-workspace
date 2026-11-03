/* ===== 正文渲染：把「搜索 / 列表 / 查看详情 / Tab」等内容渲染成表格 ===== */
function prdEsc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}
var PRD_SEC_KEY=/搜索|列表|查看|详情|明细|弹框|字段|子项|组成|岗位类型|图层层级|选项|类型|Tab/;
/* 这些短标题作为「项」并入同一张表，不单独起表 */
var PRD_ROW_CAP=/^(搜索|列表|分页|查看|操作|排序|说明|注|口径|备注|来源)$/;
function prdSplit(line){
  var t=String(line).replace(/^\s*[·\-*•]\s*/,"").trim();
  var cap="",rest=t,hasPipe=t.indexOf("｜")>=0;
  if(hasPipe){
    var i=t.indexOf("｜"),head=t.slice(0,i),hm=head.match(/^(.{1,40})[：:]\s*$/);
    if(hm)cap=hm[1].trim();
    rest=t.slice(i+1);
  }else{
    var m=t.match(/^(.{1,40})[：:]\s*([\s\S]*)$/);
    if(m){cap=m[1].trim();rest=m[2];}
  }
  var parts=(hasPipe?rest.split("｜"):rest.split(/[、,，]/)).map(function(x){return x.trim()}).filter(Boolean);
  return {cap:cap,parts:parts,hasPipe:hasPipe,raw:rest.trim()};
}
function prdField(p){
  var m=String(p).match(/^(.*?)[（(]([^）)]+)[）)]\s*([\s\S]*)$/);
  if(m)return {name:m[1].trim(),unit:m[2].trim(),note:m[3].replace(/^[；;，,、\s]+/,"").trim()};
  return {name:String(p).trim(),unit:"",note:""};
}
function prdTableHTML(title,rows,head){
  if(!rows.length)return "";
  var h='<div class="prd-tblwrap">'+(title?'<div class="prd-cap">'+prdEsc(title)+'</div>':"");
  h+='<table class="prd-tbl"><thead><tr><th style="width:46px">'+prdEsc(head[0])+'</th><th>'+prdEsc(head[1])+'</th><th>'+prdEsc(head[2])+'</th></tr></thead><tbody>';
  rows.forEach(function(r,i){
    h+='<tr><td class="prd-idx">'+(r[0]||(i+1))+'</td><td>'+prdEsc(r[1])+'</td><td>'+prdEsc(r[2])+'</td></tr>';
  });
  return h+"</tbody></table></div>";
}
function prdFieldsHTML(lines,mode){
  var groups=[],cur=null;
  function nt(t){cur={title:t||"",rows:[]};groups.push(cur);return cur}
  lines.forEach(function(raw){
    var t=String(raw).trim();
    if(!t)return;
    var nested=/^\s*[-*•]/.test(raw)||/^\s{2,}/.test(raw);
    var sp=prdSplit(t);
    if(mode==="tab"){
      if(!cur)nt("");
      if(sp.cap)cur.rows.push(["",sp.cap,sp.parts.join("、")]);
      else cur.rows.push(["",sp.parts[0]||t,""]);
      return;
    }
    if(!sp.cap&&sp.parts.length<=1){
      if(cur&&(nested||cur.rows.length)){ cur.rows.push(["",sp.parts[0]||t,""]); return; }
      if(cur&&!cur.rows.length&&!cur.title){ cur.title=sp.parts[0]||t; return; }
      nt(sp.parts[0]||t); return;
    }
    if(sp.cap&&sp.parts.length<=1){ if(!cur)nt(""); cur.rows.push(["",sp.cap,sp.raw]); return; }
    if(sp.cap&&!PRD_ROW_CAP.test(sp.cap))nt(sp.cap); else if(!cur)nt("");
    sp.parts.forEach(function(p){
      var f=prdField(p);
      cur.rows.push(["",f.name,[f.unit?"单位："+f.unit:"",f.note].filter(Boolean).join("　")]);
    });
  });
  var html="";
  groups.forEach(function(g,i){
    if(g.rows.length)html+=prdTableHTML(g.title,g.rows,["序号","字段","单位/说明"]);
    else if(g.title&&i<groups.length-1)html+='<div class="prd-cap">'+prdEsc(g.title)+"</div>";
  });
  return html;
}
function prdParaHTML(lines){
  var html="";
  lines.forEach(function(raw){
    var t=String(raw).replace(/\s+$/,"");
    if(!t.trim())return;
    if(/^\s*[·\-*•]\s*/.test(t)) html+='<div class="prd-li">· '+prdEsc(t.trim().replace(/^[·\-*•]\s*/,""))+"</div>";
    else html+='<div class="prd-p">'+prdEsc(t.trim())+"</div>";
  });
  return html;
}
function prdIsHeading(t){return /^【/.test(t)||/^[一二三四五六七八九十]+[、.]/.test(t)||/^[0-9]+[、.]/.test(t)}
/* 标题归属：列表与弹框 / 详情 / 数据项主体 */
function prdClassifyHead(head){
  var m=head.match(/^【([^】]*)】/);
  var t=(m?m[1]:head)+"";
  if(/Tab|搜索|列表|分页|弹框|图层层级|选项|筛选|明细|字段/.test(t))return "popup";
  if(/查看|详情/.test(t))return "detail";
  return "main";
}
/* 把正文按行分到三块：main（数据项口径）、popup（列表与弹框）、detail（详情） */
function prdBuckets(text){
  var lines=String(text==null?"":text).split("\n");
  var out={main:[],popup:[],detail:[]},cur="main",detailRun=false,headCtx="",lastCap="";
  lines.forEach(function(raw){
    var t=raw.replace(/\s+$/,"");
    if(!t.trim())return;
    var s=t.trim();
    if(prdIsHeading(s)){
      var hm=s.match(/^【([^】]*)】/);
      if(hm)headCtx=hm[1];
      lastCap="";
      cur=prdClassifyHead(s);detailRun=false;
      if(cur==="detail"&&/^【查看[^】]*】\s*$/.test(s))return;
      out[cur].push(s);return;
    }
    var nested=/^\s{2,}/.test(raw)||/^\s*[-*]\s/.test(raw);
    var isOp=/^\s*[·\-*]?\s*操作/.test(s);
    var target;
    if(isOp){
      target="detail";detailRun=true;
      /* 详情字段带上文（所在分组或所属明细小节），避免多张表标题重复 */
      var px=lastCap||((headCtx&&!/^查看(详情|明细)$/.test(headCtx))?headCtx:"");
      if(/^(搜索|列表|分页|查看|操作|排序|说明|注|口径|备注|来源|Tab项)$/.test(px))px=(headCtx&&!/^查看(详情|明细)$/.test(headCtx))?headCtx:"";
      if(px)t="· "+px+" / "+s.replace(/^\s*[·\-*]?\s*/,"");
    }
    else if(detailRun&&nested){target="detail"}
    else{target=cur;detailRun=false}
    if(target!=="detail")lastCap=prdSplit(t).cap||"";
    if(target==="detail"&&/^【查看[^】]*】\s*$/.test(s))return;
    out[target].push(t);
  });
  /* 去掉没有实质内容的标题（后面没有正文就跟下一个标题/结束）；带内联取值的元信息行保留 */
  ["main","popup","detail"].forEach(function(k){
    var a=out[k],r=[];
    for(var i=0;i<a.length;i++){
      var line=a[i],t=line.trim();
      if(prdIsHeading(t)&&!/^【[^】]+】\s*\S+/.test(t)){
        var j=i+1,has=false;
        while(j<a.length){if(!prdIsHeading(a[j].trim())){has=true;break}j++}
        if(!has)continue;
      }
      r.push(line);
    }
    out[k]=r;
  });
  return out;
}
function prdRender(text){
  if(String(text||'').startsWith('<!--prd-rich-text-->'))return window.prdRichHTML(text);
  return prdRenderLines(String(text==null?"":text).split("\n"));
}
function prdBlock(text,which){
  if(String(text||'').startsWith('<!--prd-rich-text-->'))return which==='main'?window.prdRichHTML(text):'';
  var b=prdBuckets(text);
  if(!b||!b[which]||!b[which].length)return "";
  return prdRenderLines(b[which],which==="main"?"auto":"fields");
}
function prdRenderLines(lines,defMode){
  var html="",sec=null,buf=[];
  function flush(){
    if(sec===null&&!buf.length)return;
    var title=sec===null?"":sec;
    var mode=sec===null?(defMode==="fields"?"fields":"auto"):(/Tab/i.test(title)?"tab":(PRD_SEC_KEY.test(title)?"fields":"para"));
    if(mode==="para")html+=prdParaHTML(buf);
    else if(mode==="auto")html+=prdParaHTML(buf);
    else html+=prdFieldsHTML(buf,mode);
    sec=null;buf=[];
  }
  lines.forEach(function(raw){
    var t=raw.replace(/\s+$/,"");
    if(!t.trim())return;
    var hm=t.trim().match(/^【([^】]+)】\s*([\s\S]*)$/);
    if(hm){
      if(PRD_SEC_KEY.test(hm[1])){flush();html+='<div class="prd-h">'+prdEsc(t.trim())+"</div>";sec=hm[1]+(hm[2]?" "+hm[2]:"");return}
      flush();html+='<div class="prd-meta"><span class="k">'+prdEsc(hm[1])+"</span>"+prdEsc(hm[2]||"")+"</div>";return;
    }
    if(/^[一二三四五六七八九十]+[、.]/.test(t.trim())||/^[0-9]+[、.]/.test(t.trim())){
      flush();html+='<div class="prd-h">'+prdEsc(t.trim())+"</div>";sec=t.trim();return;
    }
    buf.push(t);
  });
  flush();
  return html;
}

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
/* 历史记录修复：
   1) 老逻辑保存时只写「改后内容」，最初新建时的正文看不到；
   2) 从没改过的卡片历史是空的，同样回看不到最初内容。
   这里为每张有正文的卡片补齐一条「首次创建内容」（初始取数据文件里的原文），补过不再重复。 */
(function(){
var fixed=false,keys={};
Object.keys(INIT_D).forEach(function(k){keys[k]=1});
Object.keys(contents).forEach(function(k){keys[k]=1});
Object.keys(keys).forEach(function(k){
if(deleted.indexOf(k)>=0)return;
var init=INIT_D[k]||contents[k]||"";
if(!String(init).trim())return;
var list=hists[k];
if(list&&list.length&&list.some(function(x){return x&&x.label==="首次创建内容"}))return;
var neverEdited=!list||!list.length;
if(!list)hists[k]=list=[];
list.push({date:"初始版本",content:init,tables:neverEdited?JSON.parse(JSON.stringify(tables[k]||[])):[],label:"首次创建内容"});
fixed=true;
});
if(fixed);
})();
window.__prdVM=new Vue({el:"#app",data:{modules:MODULES,cur:MODULES.length?MODULES[0].key:"",reviews:reviews,contents:contents,mtimes:mtimes,hists:hists,tables:tables,changelog:changelog,docTitle:docTitle,prototype:SEED.prototype||null,attachments:SEED.attachments||{},editAttachments:[],reviewPeople:SEED.reviewPeople||[],reviewPeopleColors:SEED.reviewPeopleColors||{},reviewPeopleHidden:SEED.reviewPeopleHidden||[],recordings:SEED.recordings||[],recordingsDlg:false,moduleQuery:"",micState:"idle",micText:"开始录音",micTime:"00:00",flows:SEED.flows||{},editFlow:[],clDlg:false,delDlg:false,clMod:"",clType:"",clKw:"",dialogFull:{hist:false,cl:false,rv:false,recordings:false},navQuery:"",navExpanded:false,navHit:"",desktopTrash:SEED.desktopTrash||{},deleted:deleted,rOpen:rOpenInit,dlg:false,editDlg:false,editFull:false,histDlg:false,histTitle:"",histList:[],editKey:"",editName:"",editTitle:"",editContent:"",editTables:[],newDlg:false,newName:"",newModDlg:false,newModName:"",editModDlg:false,editModName:"",editModKey:"",editModOld:"",rvDlg:false,rvMod:"",rvStage:"",rvKw:"",rvTblH:420,rsnDlg:false,rsnKey:"",rsnIdx:-1,rsnText:"",rsnContent:"",curKey:"",editIdx:-1,form:{stage:"内部评审",users:"",content:""}},
computed:{floorPosition(){const n=this.curModule.items.findIndex(it=>it.k===this.navHit);return this.curModule.items.length?Math.max(1,n+1):0},floorItems(){const q=this.navQuery.trim().toLowerCase();return this.curModule.items.map((it,index)=>Object.assign({},it,{floorNo:index+1})).filter(it=>!q||it.t.toLowerCase().includes(q)||String(it.floorNo)===q||((this.curIndex+1)+'.'+it.floorNo)===q)},curModule(){return this.modules.filter(function(x){return x.key===this.cur},this)[0]||{key:"",name:"",items:[]}},
curIndex(){return this.modules.findIndex(function(x){return x.key===this.cur},this)},
/* 全量评审记录：把 reviews（按卡片 key 存）摊平，并反查所属模块/卡片名 */
/* 全量评审记录：把 reviews（按卡片 key 存）摊平，并反查所属模块/卡片名 */
rvAll(){
var self=this,out=[],known={};
this.modules.forEach(function(m,mi){
(m.items||[]).forEach(function(it,ii){
known[it.k]=1;
var rs=self.reviews[it.k]||[];
rs.forEach(function(r,i){out.push({modKey:m.key,modName:m.name,cardKey:it.k,cardName:it.t,no:(mi+1)+"."+(ii+1)+".",rec:r,idx:i})});
});
});
/* 卡片已被删除的评审记录仍要能看到 */
Object.keys(this.reviews||{}).forEach(function(k){
if(known[k])return;
(self.reviews[k]||[]).forEach(function(r,i){out.push({modKey:"",modName:"（模块已删除）",cardKey:"",cardName:"（卡片已删除）",no:"",rec:r,idx:i})});
});
out.sort(function(a,b){return rvBaseDate(b.rec.date).localeCompare(rvBaseDate(a.rec.date))});
return out;
},
rvList(){
var kw=(this.rvKw||"").trim().toLowerCase();
return this.rvAll.filter(function(x){
if(this.rvMod&&x.modKey!==this.rvMod)return false;
if(this.rvStage&&x.rec.stage!==this.rvStage)return false;
if(kw){
var hay=(x.modName+" "+x.cardName+" "+(x.rec.users||"")+" "+(x.rec.content||"")+" "+(x.rec.rsn||"")).toLowerCase();
if(hay.indexOf(kw)<0)return false;
}
return true;
},this);
},
/* 已删除清单（模块 + 数据项），供「已删除（可恢复）」窗口使用 */
delList(){
var self=this,nameOf={},modOf={},modName={};
(SEED.modules||[]).forEach(function(m){modName[m.key]=m.name;(m.items||[]).forEach(function(it){nameOf[it.k]=it.t;modOf[it.k]=m.key})});
this.modules.forEach(function(m){modName[m.key]=modName[m.key]||m.name;(m.items||[]).forEach(function(it){nameOf[it.k]=nameOf[it.k]||it.t;modOf[it.k]=modOf[it.k]||m.key})});
Object.keys(this.changelog||{}).forEach(function(id){
var r=self.changelog[id]||{};
if(r.cardKey&&r.cardName)nameOf[r.cardKey]=nameOf[r.cardKey]||r.cardName;
if(r.modKey&&r.modName)modName[r.modKey]=modName[r.modKey]||r.modName;
});
var out=[];
this.deleted.forEach(function(k){
if(/^mod:/.test(k)){
var mk=k.slice(4),cnt=0;
(SEED.modules||[]).forEach(function(m){if(m.key!==mk)return;(m.items||[]).forEach(function(it){if(self.deleted.indexOf(it.k)>=0)cnt++})});
out.push({raw:k,isMod:true,modKey:mk,modName:modName[mk]||mk,name:modName[mk]||mk,cardCount:cnt});
}else{
out.push({raw:k,isMod:false,modKey:modOf[k]||"",modName:modName[modOf[k]]||"（模块未知）",name:nameOf[k]||k});
}
});
out.sort(function(a,b){return a.isMod===b.isMod?0:(a.isMod?-1:1)});
return out;
},
delMods(){return this.delList.filter(function(x){return x.isMod})},
delItems(){return this.delList.filter(function(x){return !x.isMod})},
clTypes(){return [
{v:"edit",l:"编辑内容"},
{v:"clear",l:"清空正文"},
{v:"add",l:"新增"},
{v:"del",l:"删除"},
{v:"move",l:"调整顺序"},
{v:"module",l:"模块操作"},
{v:"review",l:"评审记录"}
]},
clAll(){
var self=this,known={};
this.modules.forEach(function(m,mi){m.items.forEach(function(it,ii){known[it.k]={no:(mi+1)+"."+(ii+1)+".",modKey:m.key}})});
var out=Object.keys(this.changelog||{}).map(function(id){
var r=self.changelog[id]||{};
var cnt=String(r.content||""),tbs=(r.tables||[]);
return {id:id,t:r.t||"",ts:r.ts||0,op:r.op||"-",type:r.type||"edit",modKey:r.modKey||"",modName:r.modName||"",cardKey:r.cardKey||"",cardName:r.cardName||"",no:known[r.cardKey]?known[r.cardKey].no:(r.no||""),detail:r.detail||"",content:cnt,tables:tbs,cardGone:!!(r.cardKey&&!known[r.cardKey]),tagType:clTagType(r.type)};
});
out.sort(function(a,b){return (b.ts||0)-(a.ts||0)});
return out;
},
clList(){
var kw=(this.clKw||"").trim().toLowerCase();
return this.clAll.filter(function(x){
if(this.clMod&&x.modKey!==this.clMod)return false;
if(this.clType&&x.type!==this.clType)return false;
if(kw){
var hay=(x.modName+" "+x.cardName+" "+x.op+" "+x.detail+" "+(x.content||"")).toLowerCase();
if(hay.indexOf(kw)<0)return false;
}
return true;
},this);
},
/* 每个数据项拆成三块：main（数据项）/ popup（列表与弹框）/ det（详情） */
/* 每个数据项只渲染一张主卡：正文全部直接展示，不再划分子卡 */
blocks(){var m={};this.modules.forEach(function(mo){(mo.items||[]).forEach(function(it){
if(String(it.d||'').startsWith('<!--prd-rich-text-->')){m[it.k]={main:window.prdRichHTML(it.d),pop:'',det:''};return;}
var b=prdBuckets(it.d||"");
var all=b.main.concat(b.popup).concat(b.detail);
m[it.k]={main:all.length?prdRenderLines(all):"",pop:"",det:""};
})});return m}},

watch:{
cur:{immediate:true,handler(){this.navQuery='';this.$nextTick(()=>{const list=document.querySelector('.navrail-list');if(list)list.scrollTop=0;this.trackFloor();})}},
'curModule.items.length':function(){this.$nextTick(this.trackFloor)},
rvDlg:function(v){if(v)this.$nextTick(this.rvCalcH)}
},
methods:{...window.prdEditorActions,
rvCalcH(){
var self=this;
function calc(){
var dlg=document.querySelector('[aria-label="评审记录总览"]');
if(!dlg||!dlg.getBoundingClientRect().height)return;
var tbl=dlg.querySelector(".el-table");
if(!tbl)return;
var top=tbl.getBoundingClientRect().top;
var avail=window.innerHeight-top-56;
self.rvTblH=Math.max(160,Math.floor(avail));
}
this.$nextTick(calc);setTimeout(calc,420);
},
renderDoc(t){return prdRender(typeof t==="string"?t:(t&&t.d)||"")},
mainDoc(t){return prdBlock(typeof t==="string"?t:(t&&t.d)||"","main")},
popDoc(t){return prdBlock(typeof t==="string"?t:(t&&t.d)||"","popup")},
detDoc(t){return prdBlock(typeof t==="string"?t:(t&&t.d)||"","detail")},
openReview(it){this.curKey=it.k;this.editIdx=-1;this.form={stage:"内部评审",users:"",content:""};this.dlg=true},
/* 评审记录时间：统一到秒，去掉历史遗留的重复「（已修改）」后缀 */
rvStamp(){var d=new Date(),p=function(n){return(n<10?"0":"")+n};return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+" "+p(d.getHours())+":"+p(d.getMinutes())+":"+p(d.getSeconds())},
rvBaseDate(s){return rvBaseDate(s)},
rvDateText(r){
var base=rvBaseDate(r.date);
if(r.mod)return base+"（已修改 "+r.mod+"）";
if(r.edited)return base+"（已修改）";
return base;
},
openRvAll(){this.rvMod="";this.rvStage="";this.rvKw="";this.rvDlg=true},
/* ===== 历史需求总览（记录结构与卡片「历史需求内容」一致） ===== */
openClAll(){this.clMod="";this.clType="";this.clKw="";this.clDlg=true},
/* 左侧切换模块：右侧正文回到顶部 */
selMod(k){
this.cur=k;this.navHit="";this.navQuery="";this.navExpanded=false;
this.$nextTick(function(){
var m=document.querySelector(".main");
if(m)m.scrollTop=0;
this.trackFloor();
});
},
/* 右侧悬浮定位栏：回到顶部 / 跳到某张卡片 */
toggleFloors(){this.navExpanded=!this.navExpanded;this.navQuery="";if(this.navExpanded)this.$nextTick(()=>{const hit=document.querySelector('.navrail-list .hit');if(hit)hit.scrollIntoView({block:'nearest'});})},
trackFloor(){if(this._floorFrame)return;this._floorFrame=requestAnimationFrame(()=>{this._floorFrame=null;const main=this.navMain();if(!main)return;const viewport=main.getBoundingClientRect(),cards=Array.from(main.querySelectorAll('[data-card-key]'));let card=cards[0],best=-1;for(const el of cards){const rect=el.getBoundingClientRect(),visible=Math.max(0,Math.min(rect.bottom,viewport.bottom)-Math.max(rect.top,viewport.top));if(visible>best){best=visible;card=el;}}if(main.scrollTop<=1)card=cards[0];else if(main.scrollTop+main.clientHeight>=main.scrollHeight-1)card=cards[cards.length-1];this.navHit=card?card.dataset.cardKey:'';this.$nextTick(()=>{const list=document.querySelector('.navrail-list'),hit=list&&list.querySelector('.hit');if(!hit||!list)return;const box=list.getBoundingClientRect(),item=hit.getBoundingClientRect();if(item.top<box.top+8)list.scrollTop-=box.top+8-item.top;else if(item.bottom>box.bottom-8)list.scrollTop+=item.bottom-box.bottom+8;});})},
navMain(){return document.querySelector(".main")},
navTop(){
var m=this.navMain();if(!m)return;
if(m.scrollTo)m.scrollTo({top:0,behavior:"smooth"});else m.scrollTop=0;
this.navHit=this.curModule.items[0]?.k||"";
this.trackFloor();
},
navTo(it){
this.navHit=it.k;
var el=document.querySelector('[data-card-key="'+it.k+'"]');
var m=this.navMain();
if(!el||!m)return;
if(m.scrollTo)m.scrollTo({top:m.scrollTop+el.getBoundingClientRect().top-m.getBoundingClientRect().top-16,behavior:"smooth"});
el.classList.add("rv-hit");
setTimeout(function(){el.classList.remove("rv-hit")},2400);
},
clLocate(row){
if(!row||!row.cardKey){this.$message.warning("该卡片已被删除，无法定位");return}
var ex=null;
this.modules.forEach(function(m,mi){m.items.forEach(function(it,ii){if(it.k===row.cardKey)ex={modKey:m.key,no:(mi+1)+"."+(ii+1)+"."}})});
if(!ex){this.$message.warning("该卡片已被删除，无法定位");return}
this.clDlg=false;
this.cur=ex.modKey;
this.$nextTick(function(){
var el=document.querySelector('[data-card-key="'+row.cardKey+'"]');
if(!el)return;
if(el.scrollIntoView)el.scrollIntoView({behavior:"smooth",block:"center"});
el.classList.add("rv-hit");
setTimeout(function(){el.classList.remove("rv-hit")},2400);
});
},
cardCtx(k){
var out={modKey:"",modName:"",cardName:"",no:""};
this.modules.forEach(function(m,mi){m.items.forEach(function(it,ii){if(it.k===k){out.modKey=m.key;out.modName=m.name;out.cardName=it.t;out.no=(mi+1)+"."+(ii+1)+"."}})});
return out;
},
/* 统一写一条历史需求记录：op=操作名，type=类型（edit/add/del/clear/move/module/review），info.detail=细节，
   info.content/info.tables=该操作对应的内容快照（结构与卡片「历史需求」一致） */
logOp(op,type,info){
info=info||{};
var ctx=info.cardKey?this.cardCtx(info.cardKey):{modKey:"",modName:"",cardName:""};
var t=Date.now();
function cut(x){var s=x==null?"":String(x);return s.length>20000?s.slice(0,20000)+"\n…（内容过长，已截断，完整内容见卡片历史需求）":s}
var cnt=cut(info.content);
var tbls=info.tables?JSON.parse(JSON.stringify(info.tables)):[];
var rec={t:this.rvStamp(),ts:t,op:op,type:type||"edit",modKey:info.modKey||ctx.modKey,modName:info.modName||ctx.modName,cardKey:info.cardKey||"",cardName:info.cardName||ctx.cardName,no:info.no||ctx.no||"",detail:info.detail||"",content:cnt,tables:tbls};
var id="lg"+t+"-"+Math.random().toString(36).slice(2,6);
this.$set(this.changelog,id,rec);
var keys=Object.keys(this.changelog);


;
},
rvStageType(st){return st==="技术评审"?"warning":(st==="开发评审"?"success":"info")},
rvRowClass(o){return o.row.cardName==="（卡片已删除）"?"rv-row-del":""},
rvLocate(row){
if(!row.cardKey){this.$message.warning("该卡片已被删除，无法定位");return}
this.rvDlg=false;
this.cur=row.modKey;
this.$set(this.rOpen,row.cardKey,true);
this.$nextTick(function(){
var el=document.querySelector('[data-card-key="'+row.cardKey+'"]');
if(!el)return;
if(el.scrollIntoView)el.scrollIntoView({behavior:"smooth",block:"center"});
el.classList.add("rv-hit");
setTimeout(function(){el.classList.remove("rv-hit")},2400);
});
},
openEdit(it){this.editFlow=JSON.parse(JSON.stringify(this.flowList(this.flows[it.k])));this.editAttachments=JSON.parse(JSON.stringify(this.attachments[it.k]||[]));this.editKey=it.k;this.editTitle=it.t;this.editName=it.t;this.editContent=it.d||"";this.editTables=JSON.parse(JSON.stringify((this.tables[it.k]||[])));this.editTables.forEach(function(t){if(!t.pos)t.pos="main"});this.editFull=false;this.editDlg=true},
openNewItem(){this.editFlow=[];this.editAttachments=[];this.editKey="";this.editTitle="PRD正文";this.editName="";this.editContent="";this.editTables=[];this.editFull=false;this.editDlg=true},
openNewMod(){this.newModName="";this.newModDlg=true},
openEditMod(m){this.editModKey=m.key;this.editModName=m.name;this.editModOld=m.name;this.editModDlg=true},
saveEditMod(){
var n=(this.editModName||"").trim(),self=this;
if(!n){this.$message.warning("请填写模块名称");return}
var hit=this.modules.filter(function(x){return x.key===self.editModKey})[0];
if(!hit){this.editModDlg=false;return}
var old=hit.name;hit.name=n;this.editModDlg=false;;
if(old===n){this.$message.success("模块名称未变化");return}
this.logOp("模块改名","module",{modKey:this.editModKey,modName:n,detail:"「"+old+"」→「"+n+"」"});
this.$message.success("已把「"+old+"」改名为「"+n+"」");
},
saveNewMod(){
var n=(this.newModName||"").trim();
if(!n){this.$message.warning("请填写模块名称");return}
var k="mod"+Date.now(),self=this;
this.modules.push({key:k,name:n,items:[]});
this.newModDlg=false;this.cur=k;;
this.logOp("新增模块","module",{modKey:k,modName:n,detail:"新模块，暂无数据项"});
this.$nextTick(function(){self.$message.success("已新增模块「"+n+"」，用右侧「新增数据项」加卡")});
},




saveNewItem(){
var n=(this.newName||"").trim();
if(!n){this.$message.warning("请填写数据项名称");return}
var k="it"+Date.now(),self=this;
this.curModule.items.push({k:k,t:n,d:""});
this.$set(this.mtimes,k,"");this.newDlg=false;;;
this.logOp("新增数据项","add",{cardKey:k,cardName:n,detail:"新建卡片（正文待填写）"});
this.$nextTick(function(){self.$message.success("已新增数据项「"+n+"」，点卡片上的「编辑」写内容")});
},
itemIdx(it){return this.curModule.items.findIndex(function(x){return x.k===it.k})},
isFirst(it){return this.itemIdx(it)<=0},
isLast(it){var l=this.curModule.items.length,i=this.itemIdx(it);return i<0||i>=l-1},
moveItem(it,dir){
var a=this.curModule.items,i=this.itemIdx(it),j=i+dir;
if(i<0||j<0||j>=a.length)return;
var t=a[i];this.$set(a,i,a[j]);this.$set(a,j,t);
var ctx=this.cardCtx(it.k);
this.logOp("调整顺序","move",{modKey:ctx.modKey,modName:ctx.modName,cardKey:it.k,cardName:it.t,detail:"「"+it.t+"」"+(dir<0?"上移":"下移")+"一位"});
;this.$message.success("已移动「"+it.t+"」");
},
addTable(){this.editTables.push({name:"",pos:"main",cols:["列1","列2","列3"],rows:[["","",""],["","",""]]})},
tbls(k,pos){var a=this.tables[k]||[];return a.filter(function(t){return (t.pos||"main")===pos})},
addRow(t){t.rows.push(t.cols.map(function(){return""}))},
addCol(t){t.cols.push("列"+(t.cols.length+1));t.rows.forEach(function(r){r.push("")})},
delCol(t,ci){t.cols.splice(ci,1);t.rows.forEach(function(r){r.splice(ci,1)})},
saveEdit(){
if(!this.editKey){
var name=(this.editName||"").trim();
if(!name){this.$message.warning("请填写数据项名称");return}
if(!this.curModule.key){this.$message.warning("请先选择模块");return}
var key="it"+Date.now()+Math.random().toString(36).slice(2,6);
this.curModule.items.push({k:key,t:name,d:""});this.editKey=key;this.editTitle=name;
this.$set(this.mtimes,key,"");
this.logOp("新增数据项","add",{cardKey:key,cardName:name,detail:"新建数据项"});
}
var self=this;
var d=new Date(),pad=function(n){return(n<10?"0":"")+n};
var now=d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())+" "+pad(d.getHours())+":"+pad(d.getMinutes());
/* 保存前先把「被覆盖的旧版本」写进历史：这样第一次修改后，最初新建时写的内容依然能回看 */
var oldC=this.contents[this.editKey]||"";
var oldT=JSON.parse(JSON.stringify(this.tables[this.editKey]||[]));
var oldFlow=JSON.stringify(this.flows[this.editKey]||{nodes:[],edges:[]});var oldAttachments=JSON.stringify(this.attachments[this.editKey]||[]);
var newC=this.editContent==null?"":this.editContent;
var newT=JSON.parse(JSON.stringify(this.editTables||[]));
var oldSig=JSON.stringify([oldC,oldT]);
if(oldSig!==JSON.stringify([newC,newT])&&(String(oldC).trim()||oldT.length)){
var oldList=this.hists[this.editKey]||[];
var newest=oldList[0];
var dup=newest&&JSON.stringify([newest.content||"",newest.tables||[]])===oldSig;
if(!dup){
if(!this.hists[this.editKey])this.$set(this.hists,this.editKey,[]);
this.hists[this.editKey].unshift({date:this.mtimes[this.editKey]||now,content:oldC,tables:oldT,label:oldList.length?"修改前内容":"首次创建内容"});
if(this.hists[this.editKey].length>50)this.hists[this.editKey].splice(50);
;;
}
}else if(!(this.hists[this.editKey]||[]).length&&String(newC).trim()){
/* 卡片原来没正文（新建后第一次填写）：把这版直接记为最初内容，历史立刻可回看 */
if(!this.hists[this.editKey])this.$set(this.hists,this.editKey,[]);
this.hists[this.editKey].push({date:now,content:newC,tables:newT,label:"首次创建内容"});
;;
}
this.modules.forEach(function(m){m.items.forEach(function(it){if(it.k===self.editKey){it.d=self.editContent;var nm=(self.editName||"").trim();if(nm)it.t=nm}})});
this.$set(this.flows,this.editKey,JSON.parse(JSON.stringify(this.editFlow)));this.$set(this.attachments,this.editKey,JSON.parse(JSON.stringify(this.editAttachments)));this.$set(this.contents,this.editKey,this.editContent);
;;;;
this.$set(this.tables,this.editKey,JSON.parse(JSON.stringify(this.editTables)));;;
this.$set(this.mtimes,this.editKey,now);;;
/* 写一条历史需求记录（正文/表格/名称的变化都记下来，正文被删空单独标为「清空正文」） */
var nmOld=this.editTitle||"",nmNew=(this.editName||"").trim()||nmOld,chg=[];
if(nmNew!==nmOld)chg.push("名称「"+nmOld+"」→「"+nmNew+"」");
if(oldC!==newC){
var ol=String(oldC).length,nl=String(newC).length;
if(!String(newC).trim())chg.push("正文已清空（原 "+ol+" 字）");
else if(!String(oldC).trim())chg.push("正文 "+nl+" 字（原来为空）");
else chg.push("正文 "+ol+"→"+nl+" 字");
}
if(JSON.stringify(oldT)!==JSON.stringify(newT))chg.push("表格 "+oldT.length+"→"+newT.length+" 个");
if(oldFlow!==JSON.stringify(this.editFlow))chg.push("流程图已更新");if(oldAttachments!==JSON.stringify(this.editAttachments||[]))chg.push("附件已更新（"+(this.editAttachments||[]).length+" 个）");
if(chg.length){
var isClear=!String(newC).trim()&&String(oldC).trim();
this.logOp(isClear?"清空正文":"编辑内容",isClear?"clear":"edit",{cardKey:this.editKey,cardName:nmNew,detail:chg.join("；"),content:isClear?oldC:newC,tables:isClear?oldT:newT});
}
this.editDlg=false;
},
openHist(it){this.histTitle=it.t;this.histList=(this.hists[it.k]||[]).slice();this.histDlg=true},

/* 从「已删除」清单里恢复：模块连同其下被删卡片一起恢复，正文按历史需求记录找回最近一版 */





/* 清空本文档：只清本路径的暂存（不碰别的目录/别的文件的），用于同路径想要空白重来 */

toggleR(k){this.$set(this.rOpen,k,!this.rOpen[k])},
/* 评审记录处理标记：两个勾选框互斥（已修改 / 不予修改），未勾选=未标记 */
rvStatusOf(r){return (r&&r.st)||"未标记"},
rvStType(r){var s=(r&&r.st)||"";return s==="已修改"?"success":(s==="不予修改"?"warning":"info")},

/* 勾选「已修改」：清掉不予修改与理由，理由数据项随之消失 */
onFixCheck(k,i){
var arr=this.reviews[k]||[],r=arr[i];if(!r)return;
var wasFix=this.rvStatusOf(r)==="已修改";
if(wasFix){
/* 再次点击=取消勾选 */
this.$set(r,"st","");this.$set(r,"rsn","");
}else{
this.$set(r,"st","已修改");this.$set(r,"rsn","");
}
;
this.logOp("修改处理标记","review",{cardKey:k,detail:String(r.content||"").replace(/\s+/g," ").slice(0,40)+"… → "+(wasFix?"未标记":"已修改")});
},
/* 勾选「不予修改」：先弹框填理由，保存后才勾上；取消则不改变原状态 */
onDenyCheck(k,i){
var arr=this.reviews[k]||[],r=arr[i];if(!r)return;
if(this.rvStatusOf(r)==="不予修改"){
/* 再次点击=取消勾选，同时清掉理由 */
this.$set(r,"st","");this.$set(r,"rsn","");
;
this.logOp("修改处理标记","review",{cardKey:k,detail:String(r.content||"").replace(/\s+/g," ").slice(0,40)+"… → 未标记"});
return;
}
this.openRsn(k,i);
},
openRsn(k,i){
var arr=this.reviews[k]||[],r=arr[i];if(!r)return;
this.rsnKey=k;this.rsnIdx=i;this.rsnText=r.rsn||"";this.rsnContent=r.content||"";this.rsnDlg=true;
},
saveRsn(){
var t=(this.rsnText||"").trim();
if(!t){this.$message.warning("请填写不修改理由");return}
var arr=this.reviews[this.rsnKey]||[],r=arr[this.rsnIdx];
if(!r){this.rsnDlg=false;return}
this.$set(r,"st","不予修改");this.$set(r,"rsn",t);
;
this.logOp("标记不予修改","review",{cardKey:this.rsnKey,detail:"理由："+t.slice(0,60)});
this.rsnDlg=false;this.$message.success("已保存不修改理由");
},
editReview(k,i){this.curKey=k;this.editIdx=i;var r=this.reviews[k][i];this.form={stage:r.stage,users:r.users==="未填写"?"":r.users,content:r.content};this.dlg=true},
saveReview(){
if(!this.form.content.trim()){this.$message.warning("请填写评审意见或结论");return}
if(!this.reviews[this.curKey])this.$set(this.reviews,this.curKey,[]);
var d=new Date(),pad=function(n){return(n<10?"0":"")+n};
var rec={stage:this.form.stage,users:this.form.users||"未填写",content:this.form.content,date:d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())+" "+pad(d.getHours())+":"+pad(d.getMinutes())};
if(this.editIdx>=0){
/* 保留原创建时间，修改时间单独记在 mod 字段，页面只显示一个「（已修改 …）」 */
var old=this.reviews[this.curKey][this.editIdx];
rec.date=this.rvBaseDate(old.date);rec.mod=this.rvStamp();
/* 处理结论（已修改/不予修改）与不修改理由随内容一起保留 */
if(old.st)rec.st=old.st;
if(old.rsn)rec.rsn=old.rsn;
this.reviews[this.curKey].splice(this.editIdx,1,rec)
}else{rec.date=this.rvStamp();this.reviews[this.curKey].push(rec)};

;;;
var isEdit=this.editIdx>=0;
this.logOp(isEdit?"修改评审记录":"新增评审记录","review",{cardKey:this.curKey,detail:rec.stage+"｜"+String(rec.content).replace(/\s+/g," ").slice(0,60)+(String(rec.content).length>60?"…":""),content:rec.content});
this.dlg=false;this.$message.success(isEdit?"评审记录已修改":"评审记录已添加");
},
delReview(k,i){var self=this;this.$confirm("删除这条评审记录？").then(function(){
var r=(self.reviews[k]||[])[i]||{};
self.reviews[k].splice(i,1);;;;
self.logOp("删除评审记录","review",{cardKey:k,detail:(r.stage||"评审")+"｜"+String(r.content||"").replace(/\s+/g," ").slice(0,60),content:r.content||""});
})},

},
});

