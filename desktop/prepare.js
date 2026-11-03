const fs=require('node:fs');
const path=require('node:path');
const vendor=path.join(__dirname,'vendor');fs.mkdirSync(vendor,{recursive:true});
fs.copyFileSync(require.resolve('vue/dist/vue.min.js'),path.join(vendor,'vue.min.js'));
fs.copyFileSync(path.join(path.dirname(require.resolve('lamejs/package.json')),'lame.min.js'),path.join(vendor,'lame.min.js'));
fs.copyFileSync(path.join(path.dirname(require.resolve('lamejs/package.json')),'LICENSE'),path.join(vendor,'lame-LICENSE.txt'));
fs.copyFileSync(path.join(path.dirname(require.resolve('lamejs/package.json')),'lame.all.js'),path.join(vendor,'lame.all.js'));
fs.copyFileSync(require.resolve('element-ui/lib/index.js'),path.join(vendor,'element.js'));
const theme=path.dirname(require.resolve('element-ui/lib/theme-chalk/index.css'));
function copyDir(src,dst){fs.mkdirSync(dst,{recursive:true});for(const ent of fs.readdirSync(src,{withFileTypes:true})){if(ent.isDirectory())copyDir(path.join(src,ent.name),path.join(dst,ent.name));else fs.copyFileSync(path.join(src,ent.name),path.join(dst,ent.name));}}
copyDir(theme,path.join(vendor,'theme'));
fs.copyFileSync(path.join(__dirname,'editor-view.html'),path.join(__dirname,'editor.html'));
fs.copyFileSync(path.join(__dirname,'templates/PRD与评审记录工具-测试版.html'),path.join(__dirname,'sample.html'));
console.log('独立编辑器与离线依赖已准备完成');
