(function(){
document.addEventListener('click',e=>{const button=e.target.closest('[data-native-dialog-close]');if(button)button.closest('dialog')?.close('cancel');});
const hints={newDoc:'新建 PRD 文档',save:'保存 · Ctrl+S',saveAs:'另存为 · Ctrl+Shift+S',undo:'撤销上一步数据修改 · Ctrl+Z',redo:'重做数据修改 · Ctrl+Y',backup:'查看备份与恢复文档',export:'导出可离线查看的只读 HTML',reveal:'在文件资源管理器中显示当前文档',refreshDirectory:'刷新项目目录',collapseDirectory:'收起项目目录'};
for(const [id,title]of Object.entries(hints)){const button=document.getElementById(id);if(button)button.title=title;}
for(const id of ['docPath','footerInfo']){const element=document.getElementById(id);if(element){const update=()=>element.title=element.textContent;update();new MutationObserver(update).observe(element,{childList:true,characterData:true,subtree:true});}}
document.addEventListener('keydown',e=>{if(e.key==='Escape'){const menu=document.getElementById('moreMenu');if(menu)menu.open=false;}});
document.addEventListener('pointerdown',e=>{const menu=document.getElementById('moreMenu');if(menu?.open&&!menu.contains(e.target))menu.open=false;});
})();
