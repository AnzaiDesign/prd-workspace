(function(){
 'use strict';
 const vm=window.__prdVM,clone=v=>JSON.parse(JSON.stringify(v));
 const token=new URLSearchParams(location.search).get('load');
 if(!vm){parent.reportError('编辑器初始化失败。');return;}
 const business=['reviewPeople','reviewPeopleColors','reviewPeopleHidden','recordings','flows','attachments','modules','contents','tables','reviews','hists','mtimes','changelog','deleted','desktopTrash'];
 const draftKeys=['cur','editDlg','editFull','editKey','editName','editTitle','editContent','editTables','editAttachments','editFlow','dlg','curKey','editIdx','form','newDlg','newName','newModDlg','newModName','editModDlg','editModName','editModKey','editModOld','rsnDlg','rsnKey','rsnIdx','rsnText','rsnContent'];
 vm.docTitle=parent.editorDocument.data.title||'未命名 PRD';
 const draft=parent.editorDocument.draft||{};
 for(const k of draftKeys)if(Object.prototype.hasOwnProperty.call(draft,k))vm[k]=clone(draft[k]);
 vm.editFlow=vm.flowList(vm.editFlow);
 // Size the overview after mounting and when the host panel changes width.
 vm.rvCalcH();window.addEventListener('resize',vm.rvCalcH);
 window.captureDocument=function(){
   const data={version:34,title:vm.docTitle,prototype:clone(vm.prototype||null)};for(const k of business)data[k]=clone(vm[k]||((k==='modules'||k==='deleted')?[]:{}));
   const d={cur:vm.cur};
   const groups={editDlg:['editFull','editKey','editName','editTitle','editContent','editTables','editAttachments','editFlow'],dlg:['curKey','editIdx','form'],newDlg:['newName'],newModDlg:['newModName'],editModDlg:['editModName','editModKey','editModOld'],rsnDlg:['rsnKey','rsnIdx','rsnText','rsnContent']};
   for(const [flag,keys]of Object.entries(groups))if(vm[flag]){d[flag]=true;for(const k of keys)d[k]=clone(vm[k]);}
   return {data,draft:d};
 };
 document.title=vm.docTitle;
 vm.$watch(()=>{const s=window.captureDocument();return JSON.stringify(s);},()=>parent.editorChanged(window.captureDocument(),token));
 document.addEventListener('keydown',e=>parent.handleShortcut(e),true);
 document.addEventListener('click',e=>{const a=e.target.closest('a');if(a){e.preventDefault();}},true);
 window.desktopAdapterReady=true;parent.editorReady(window.captureDocument(),token);
})();

