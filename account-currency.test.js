const test=require('node:test'),assert=require('node:assert/strict');
const core=require('./finance-core'),money=require('./money-manager-core');
const accounts=[{id:'dop',moneda:'DOP',tipo:'banco',incluir_en_total:true,saldo_actual_centavos:100000},
  {id:'usd',moneda:'USD',tipo:'efectivo',incluir_en_total:true,saldo_actual_centavos:6400}];
test('saldos nativos conservan su moneda y no se convierten sin tasa',()=>{
  assert.match(core.formatAccountMoney(accounts[1],6400),/US\$64\.00/);
  assert.deepEqual(core.accountTotalsByCurrency(accounts,[]),[{currency:'DOP',centavos:100000},{currency:'USD',centavos:6400}]);
  const text=core.formatCurrencyTotals(core.accountTotalsByCurrency(accounts,[]));
  assert.match(text,/RD\$1,000\.00/);assert.match(text,/US\$64\.00/);assert.doesNotMatch(text,/1,064/);
});
test('Money Manager distingue disponible DOP del saldo USD sin alterar cuentas',()=>{
  const before=JSON.stringify(accounts),s=money.accountSummary(accounts,[]);
  assert.equal(s.available,100000);assert.deepEqual(s.availableByCurrency,[{currency:'DOP',centavos:100000},{currency:'USD',centavos:6400}]);
  assert.equal(JSON.stringify(accounts),before);
});
test('moneda ausente es DOP legado; una moneda inválida nunca inyecta contenido ni se asume DOP',()=>{
  assert.equal(core.formatAccountMoney({},123,String),'123');
  const invalid=core.formatAccountMoney({moneda:'<script>'},123);
  assert.doesNotMatch(invalid,/<|RD\$/);assert.match(invalid,/verificar/i);
});
