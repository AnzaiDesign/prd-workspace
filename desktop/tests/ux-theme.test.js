const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const css=fs.readFileSync(path.join(__dirname,'../design-system.css'),'utf8');
function tokens(block){return Object.fromEntries([...block.matchAll(/--([a-z-]+):(#(?:[a-f0-9]{6}|[a-f0-9]{3}))(?=[;\s}])/gi)].map(m=>[m[1],m[2]]));}
function luminance(hex){if(hex.length===4)hex='#'+[...hex.slice(1)].map(c=>c+c).join('');const rgb=hex.slice(1).match(/../g).map(c=>parseInt(c,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
test('浅色与暗黑主题主要文字和状态文本满足4.5:1对比度',()=>{
 const light=tokens(css.match(/:root\{([\s\S]*?)\}/)[1]),dark={...light,...tokens(css.match(/:root\[data-theme=dark\]\{([\s\S]*?)\}/)[1])};
 for(const [name,t]of [['light',light],['dark',dark]])for(const [fg,bg]of [['ink','surface'],['ink-secondary','surface'],['ink-muted','surface'],['accent','accent-soft'],['success','success-soft'],['warning','warning-soft'],['danger','danger-soft'],['ink','surface-hover'],['ink-secondary','surface-hover'],['ink','accent-soft'],['ink-muted','surface-soft'],['accent','surface-hover']])assert.ok(contrast(t[fg],t[bg])>=4.5,`${name} ${fg} contrast ${contrast(t[fg],t[bg]).toFixed(2)}`);
});
