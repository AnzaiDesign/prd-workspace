const {test}=require('node:test'),assert=require('node:assert/strict');
const describe=require('../error-message');
test('文件系统错误给出中文处理建议并保留诊断详情',()=>{
 for(const code of ['ENOENT','EACCES','EPERM','EBUSY','ENOSPC']){
  const raw=`${code}: failed, stat 'E:\\example.html'`,result=describe(raw);
  assert.equal(result.details,raw);assert.ok(!result.message.includes(code));assert.ok(result.message.length>15);
 }
});
test('业务错误原样保留，支持 Error 对象',()=>{
 assert.deepEqual(describe('请先结束录音。'),{message:'请先结束录音。',details:''});
 assert.equal(describe(new Error('保存冲突，请重新打开。')).message,'保存冲突，请重新打开。');
});
