(function () {
 'use strict';
 const modalSelector='dialog[open],.el-dialog__wrapper,.el-message-box__wrapper';
 const visible=el=>!!el&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden';
 document.addEventListener('keydown',event=>{
  if(event.key!=='Enter'||event.defaultPrevented||event.isComposing||event.keyCode===229||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return;
  const target=event.target;
  if(!(target instanceof Element))return;
  // These controls own Enter (new lines, tag creation, selection, or native button activation).
  if(target.closest('textarea,[contenteditable]:not([contenteditable="false"]),button,a,select,[role="button"],.people-field,.el-select,.el-date-editor,.el-picker-panel,.el-popover,.el-autocomplete,.el-select-dropdown,audio,video,input[type="file"]'))return;
  let modal=target.closest(modalSelector);
  const modals=Array.from(document.querySelectorAll(modalSelector)).filter(visible);
  const top=modals.reduce((best,item)=>!best||Number(getComputedStyle(item).zIndex||0)>=Number(getComputedStyle(best).zIndex||0)?item:best,null);
  if(!modal&&(target===document.body||target===document.documentElement))modal=top;
  if(!modal||modal!==top)return;
  // Element UI already handles Enter on its prompt input.
  if(modal.matches('.el-message-box__wrapper')&&target.matches('input'))return;
  const button=modal.querySelector('[data-confirm-action]')||(modal.matches('.el-message-box__wrapper')?modal.querySelector('.el-message-box__btns .el-button--primary'):null);
  if(!visible(button)||button.disabled||button.classList.contains('is-loading'))return;
  event.preventDefault();
  if(!event.repeat)button.click();
 });
})();
