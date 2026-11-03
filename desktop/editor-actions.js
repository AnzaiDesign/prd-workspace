(function(){
 const clone=v=>JSON.parse(JSON.stringify(v));
 function captureCard(vm,k){const out={};for(const n of ['flows','attachments','contents','tables','reviews','hists','mtimes'])if(Object.prototype.hasOwnProperty.call(vm[n],k))out[n]=clone(vm[n][k]);return out;}
 function restoreCard(vm,k,data){for(const n of ['flows','attachments','contents','tables','reviews','hists','mtimes'])if(Object.prototype.hasOwnProperty.call(data,n))vm.$set(vm[n],k,clone(data[n]));}
 function restore(vm,raw){
  const r=vm.desktopTrash[raw];if(!r){vm.$message.warning('该旧版删除记录没有完整快照，可通过历史需求查看内容。');return false;}
  const removed=[raw];
  if(r.kind==='module'){
   let m=vm.modules.find(m=>m.key===r.module.key);if(!m){m=clone(r.module);vm.modules.splice(Math.min(r.index,vm.modules.length),0,m);}else for(const i of r.module.items)if(!m.items.some(x=>x.k===i.k))m.items.push(clone(i));
   for(const [k,d]of Object.entries(r.cards)){restoreCard(vm,k,d);removed.push(k);}vm.cur=m.key;
  }else{
   let m=vm.modules.find(m=>m.key===r.module.key);if(!m){m={...r.module,items:[]};vm.modules.push(m);removed.push('mod:'+m.key);}
   if(!m.items.some(i=>i.k===r.item.k))m.items.splice(Math.min(r.index,m.items.length),0,clone(r.item));restoreCard(vm,r.item.k,r.data);vm.cur=m.key;
  }
  vm.deleted=vm.deleted.filter(k=>!removed.includes(k));vm.$delete(vm.desktopTrash,raw);return true;
 }
 window.prdEditorActions={
  reviewParticipantNames(value){return [...new Set(String(value||'').split(/[，,、;；\n]+/).map(v=>v.trim()).filter(v=>v&&v!=='未填写'&&v!=='待补充'))];},
  peopleOptions(){return window.prdPeopleRegistry.choices(this);},
  rememberPeople(names){window.prdPeopleRegistry.remember(this,names);},
  managePeople(change){window.prdPeopleRegistry.manage(this,change);},
  toggleMic(){parent.toggleReviewMic();},
  micTip(){return this.micState==='recording'?'结束录音并保存':this.micText;},
  flowList(value){return Array.isArray(value)?value:value?.nodes?.length?[value]:[];},
  addFlow(){this.editFlow.push({id:'flow'+Date.now()+Math.random().toString(36).slice(2,6),name:'流程图 '+(this.editFlow.length+1),nodes:[],edges:[]});},
  async chooseAttachments(){try{const items=await parent.chooseCardAttachments();this.editAttachments.push(...items);}catch(e){this.$message.error(e.message);}},
  async dropAttachments(event){event.preventDefault();try{const raw=event.dataTransfer.getData('application/x-prd-project-file');if(!raw){this.$message.warning('请从右侧项目目录拖入文件，或点击选择附件。');return;}const item=await parent.addCardAttachment(JSON.parse(raw));this.editAttachments.push(item);}catch(e){this.$message.error(e.message);}},
  openAttachment(a){parent.openCardAttachment(a.id);},
  renameDocument(){parent.renameCurrentDocument();},
  linkPrototype(){parent.editPrototypeAssociation();},
  openPrototype(){parent.openPrototypeAssociation();},
  cardMoreCommand(command,item){if(command==='up')this.moveItem(item,-1);else if(command==='down')this.moveItem(item,1);else if(command==='history')this.openHist(item);else if(command==='delete')this.delItem(item);},
  delItem(it){const vm=this;this.$confirm('将“'+it.t+'”移入回收站？正文、表格、评审和历史均可恢复。','删除卡片',{type:'warning'}).then(()=>{
   const m=vm.modules.find(m=>m.items.some(i=>i.k===it.k));if(!m)return;
   vm.$set(vm.desktopTrash,it.k,{kind:'card',module:{key:m.key,name:m.name},index:m.items.findIndex(i=>i.k===it.k),item:clone(it),data:captureCard(vm,it.k)});
   vm.logOp('删除卡片','del',{cardKey:it.k,cardName:it.t,content:vm.contents[it.k]||'',tables:vm.tables[it.k]||[]});
   m.items=m.items.filter(i=>i.k!==it.k);if(!vm.deleted.includes(it.k))vm.deleted.push(it.k);
   for(const n of ['flows','attachments','contents','tables','reviews','hists','mtimes'])vm.$delete(vm[n],it.k);
  }).catch(()=>{});},
  delModule(m){const vm=this;this.$confirm('将模块“'+m.name+'”和其中 '+m.items.length+' 张卡片移入回收站？所有内容均可恢复。','删除模块',{type:'warning'}).then(()=>{
   const cards={};m.items.forEach(i=>{cards[i.k]=captureCard(vm,i.k);});vm.$set(vm.desktopTrash,'mod:'+m.key,{kind:'module',index:vm.modules.findIndex(x=>x.key===m.key),module:clone(m),cards});
   vm.logOp('删除模块','del',{modKey:m.key,modName:m.name,detail:'模块及卡片内容已存入回收站'});
   for(const k of ['mod:'+m.key,...m.items.map(i=>i.k)])if(!vm.deleted.includes(k))vm.deleted.push(k);
   m.items.forEach(i=>{for(const n of ['flows','attachments','contents','tables','reviews','hists','mtimes'])vm.$delete(vm[n],i.k);});vm.modules=vm.modules.filter(x=>x.key!==m.key);vm.cur=vm.modules[0]?.key||'';
  }).catch(()=>{});},
  restoreDel(row){restore(this,row.raw);this.delDlg=false;},
  restoreAllDel(){for(const k of Object.keys(this.desktopTrash).sort((a,b)=>Number(!a.startsWith('mod:'))-Number(!b.startsWith('mod:'))))restore(this,k);this.delDlg=false;}
 };
})();
