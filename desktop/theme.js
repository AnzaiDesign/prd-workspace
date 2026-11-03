(function(){
 'use strict';
 const key='prd-ui-theme';let mode='light';
 try{mode=parent!==window&&parent.PRDTheme?parent.PRDTheme.mode:localStorage.getItem(key)||'light';}catch(e){}
 const icons={dark:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.6 13.1A8.5 8.5 0 0 1 10.9 3.4 8.6 8.6 0 1 0 20.6 13.1Z"/></svg>',light:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/></svg>'};
 function syncButton(){const b=document.getElementById('toggleTheme');if(!b)return;const label=mode==='dark'?'切换至浅色模式':'切换至暗黑模式';b.innerHTML=icons[mode==='dark'?'light':'dark'];b.dataset.tooltip=label;b.setAttribute('aria-label',label);b.setAttribute('aria-pressed',String(mode==='dark'));}
 function apply(value,persist=true){mode=value==='dark'?'dark':'light';document.documentElement.dataset.theme=mode;if(parent===window&&window.desktop?.setTheme)window.desktop.setTheme(mode).catch(()=>{});document.documentElement.style.colorScheme=mode;if(persist)try{localStorage.setItem(key,mode);}catch(e){}syncButton();for(const frame of document.querySelectorAll('iframe'))try{frame.contentWindow.PRDTheme?.apply(mode,false);}catch(e){}document.dispatchEvent(new CustomEvent('prd-theme-change',{detail:mode}));}
 window.PRDTheme={get mode(){return mode;},apply,toggle(){apply(mode==='dark'?'light':'dark');}};
 apply(mode,false);
 document.addEventListener('DOMContentLoaded',()=>{syncButton();const b=document.getElementById('toggleTheme');if(b)b.onclick=()=>window.PRDTheme.toggle();});
 window.addEventListener('storage',event=>{if(event.key===key)apply(event.newValue,false);});
})();
