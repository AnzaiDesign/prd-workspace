(function(root){
 function describeError(error){
  const detail=String(error?.message||error||'操作失败，请重试。');
  const rules=[
   [/\bENOENT\b/, '找不到文件或文件夹。文件可能已移动、重命名或删除。请检查路径；如果是关联原型，请点击“修改关联”重新选择文件。'],
   [/\b(EACCES|EPERM)\b/, '无法访问或写入文件。请检查文件是否只读、是否有访问权限，或改存到可写入的目录。'],
   [/\b(EBUSY|ETXTBSY)\b/, '文件正在被其他程序占用。请关闭占用文件的程序后重试。'],
   [/\bENOSPC\b/, '磁盘空间不足，无法保存文件。请释放空间或改存到其他磁盘后重试。']
  ];
  const rule=rules.find(([pattern])=>pattern.test(detail));
  return {message:rule?rule[1]:detail,details:rule?detail:''};
 }
 if(typeof module==='object'&&module.exports)module.exports=describeError;
 else root.describePrdError=describeError;
})(globalThis);
