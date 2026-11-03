const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('独立编辑器保留历史与评审入口，并移除旧缓存和自导出代码',()=>{
 const engine=fs.readFileSync(path.join(__dirname,'../editor-engine.js'),'utf8'),view=fs.readFileSync(path.join(__dirname,'../editor-view.html'),'utf8');
 new vm.Script(engine);
 for(const name of ['历史需求总览','评审记录总览','评审记录'])assert.ok(view.includes('>'+name+'</el-button>'));
 assert.ok(view.includes('<el-dropdown-item command="history">历史需求</el-dropdown-item>'));
 for(const name of ['localStorage','prdStorage','buildSelfContained','buildDataJS','OLD_NS','PRD_APP_SRC'])assert.ok(!engine.includes(name),name);
 assert.ok(!view.includes('对应页面'));assert.ok(!view.includes('归档确认'));assert.ok(!view.includes('保存文件'));
});
