const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('el diario historico reutiliza formateador sin perder fecha comercial',()=>{
  let created=0;
  const context={Intl:{DateTimeFormat:function(...args){created++;return new Intl.DateTimeFormat(...args);}}};
  vm.runInNewContext(fs.readFileSync(__dirname+'/finance-core.js','utf8'),context);
  const core=context.DcarelaFinanceCore;
  for(let i=0;i<10000;i++)assert.equal(core.businessDay('2026-09-02T03:59:59Z'),'2026-09-01');
  assert.equal(core.businessDay('2026-09-02T04:00:00Z'),'2026-09-02');
  assert.equal(created,1);
  assert.equal(core.businessDay('2026-09-02T03:59:59Z','UTC'),'2026-09-02');
  assert.equal(created,2);
});
