(function(){
const marker='<!--prd-rich-text-->';
window.prdRichHTML=function(value){
 const doc=new DOMParser().parseFromString(String(value).replace(marker,''),'text/html');
 const allowed=new Set('P DIV BR STRONG B EM I U S STRIKE H1 H2 H3 H4 UL OL LI BLOCKQUOTE A SPAN FONT'.split(' '));
 function clean(node){for(const el of [...node.children]){
  if(['SCRIPT','STYLE','IFRAME','OBJECT','SVG','MATH','IMG'].includes(el.tagName)){el.remove();continue;}
  clean(el);if(!allowed.has(el.tagName)){el.replaceWith(...el.childNodes);continue;}
  const color=el.style.color,href=el.getAttribute('href'),font=el.getAttribute('color');
  for(const a of [...el.attributes])el.removeAttribute(a.name);
  if(color)el.style.color=color;
  if(font&&/^#[a-f0-9]{3,8}$/i.test(font))el.style.color=font;
  if(el.tagName==='A'&&/^https?:\/\//i.test(href||'')){el.setAttribute('href',href);el.setAttribute('rel','noopener noreferrer');}
 }}clean(doc.body);return doc.body.innerHTML;
};
Vue.component('prd-rich-editor',{
 props:['value'],
 template:`<div class="rich-editor"><div class="rich-toolbar" @mousedown.prevent>
 <button type="button" title="加粗" @click="cmd('bold')"><b>B</b></button><button type="button" title="斜体" @click="cmd('italic')"><i>I</i></button><button type="button" title="下划线" @click="cmd('underline')"><u>U</u></button>
 <button v-for="level in [1,2,3,4]" :key="level" type="button" :title="'标题 H'+level" @click="cmd('formatBlock','h'+level)">H{{level}}</button><button type="button" @click="cmd('formatBlock','p')">正文</button>
 <button type="button" @click="cmd('insertUnorderedList')">• 列表</button><button type="button" @click="cmd('insertOrderedList')">1. 列表</button>
 <button type="button" @click="cmd('foreColor','#e53935')" style="color:#e53935">红色</button><button type="button" @click="cmd('foreColor','#303133')">黑色</button>
 <button type="button" @click="link">链接</button><button type="button" title="选中文字时清除选区格式；未选中时清除全文格式" @click="clearFormat">清除格式</button></div>
 <div ref="body" class="rich-body" contenteditable="true" role="textbox" aria-label="PRD正文" aria-multiline="true" @input="emit" @paste="paste"></div></div>`,
 mounted(){this.sync();},watch:{value(){if(document.activeElement!==this.$refs.body)this.sync();}},
 methods:{sync(){const v=String(this.value||'');if(v.startsWith(marker))this.$refs.body.innerHTML=window.prdRichHTML(v);else this.$refs.body.innerText=v;},
 emit(){this.$emit('input',marker+window.prdRichHTML(this.$refs.body.innerHTML));},
 cmd(command,value){this.$refs.body.focus();document.execCommand(command,false,value||null);this.emit();},
 clearFormat(){
  const body=this.$refs.body,selection=window.getSelection();
  if(!selection.rangeCount||selection.isCollapsed||!body.contains(selection.anchorNode)||!body.contains(selection.focusNode)){
   const range=document.createRange();range.selectNodeContents(body);selection.removeAllRanges();selection.addRange(range);
  }
  body.focus();
  // Replace the selected fragment with its visible text, preserving line breaks.
  // Native editing commands keep the change in the editor's undo stack.
  const text=selection.toString();
  if(document.queryCommandState('insertOrderedList'))document.execCommand('insertOrderedList');
  if(document.queryCommandState('insertUnorderedList'))document.execCommand('insertUnorderedList');
  document.execCommand('formatBlock',false,'p');
  document.execCommand('removeFormat');document.execCommand('unlink');
  if(text)document.execCommand('insertText',false,text);
  document.execCommand('removeFormat');document.execCommand('unlink');this.emit();
 },
 async link(){const selection=window.getSelection(),range=selection.rangeCount?selection.getRangeAt(0).cloneRange():null;try{const result=await this.$prompt('请输入 http 或 https 原型/参考网址','添加链接',{inputPattern:/^https?:\/\//i,inputErrorMessage:'请输入完整的 http/https 网址'});this.$refs.body.focus();if(range){selection.removeAllRanges();selection.addRange(range);}this.cmd('createLink',result.value);}catch(e){}},
 paste(event){event.preventDefault();const html=event.clipboardData.getData('text/html');if(html)document.execCommand('insertHTML',false,window.prdRichHTML(html));else document.execCommand('insertText',false,event.clipboardData.getData('text/plain'));this.emit();}
 }});
})();
