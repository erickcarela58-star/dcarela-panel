import test from 'node:test';
import assert from 'node:assert/strict';

const project = 'demo-dcarela-finanzas';
const firestore = process.env.FIRESTORE_EMULATOR_HOST;
const auth = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const base = firestore && `http://${firestore}/v1/projects/${project}/databases/(default)/documents`;

const value = x => typeof x === 'boolean' ? {booleanValue:x} :
  typeof x === 'number' ? {integerValue:String(x)} :
  Array.isArray(x) ? {arrayValue:{values:x.map(value)}} : {stringValue:String(x)};
const fields = object => Object.fromEntries(Object.entries(object).map(([k,v])=>[k,value(v)]));

async function createUser(label) {
  const response=await fetch(`http://${auth}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`,{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
      email:`${label}-${crypto.randomUUID()}@example.invalid`,password:'LocalOnly-Test-123!',returnSecureToken:true,
    }),
  });
  const body=await response.json();
  assert.equal(response.status,200,JSON.stringify(body));
  return body;
}
async function document(path,method,token,data) {
  const response=await fetch(`${base}/${path}`,{method,headers:{
    authorization:`Bearer ${token}`,'content-type':'application/json',
  },body:data?JSON.stringify({fields:fields(data)}):undefined});
  return response;
}

test('reglas reales: membresía, sucursal y escritura financiera aislada',{
  skip:!firestore||!auth?'Requiere ambos emuladores locales':false,
},async()=>{
  const owner=await createUser('owner');
  const viewer=await createUser('viewer');
  const outsider=await createUser('outsider');
  for(const [user,role] of [[owner,'owner'],[viewer,'viewer']]) {
    const seeded=await document(`business_members/${user.localId}`,'PATCH','owner',{
      business_ids:['central'],active:true,role,
    });
    assert.equal(seeded.status,200,await seeded.text());
  }
  for(const branch of ['central','plaza']) {
    const seeded=await document(`fin_accounts/${branch}-cash`,'PATCH','owner',{
      business_id:branch,nombre:'Efectivo',tipo:'efectivo',moneda:'DOP',
      incluir_en_total:true,saldo_inicial_centavos:10000,
    });
    assert.equal(seeded.status,200,await seeded.text());
  }
  assert.equal((await document('fin_accounts/central-cash','GET',owner.idToken)).status,200);
  assert.equal((await document('fin_accounts/central-cash','GET',viewer.idToken)).status,200);
  assert.equal((await document('fin_accounts/plaza-cash','GET',owner.idToken)).status,403);
  assert.equal((await document('fin_accounts/central-cash','GET',outsider.idToken)).status,403);

  const ecf={business_id:'central',encf:'E320000000001',fecha:'2026-11-13',
    total_centavos:11800,itbis_centavos:1800,subtotal_centavos:10000};
  assert.equal((await document('facturador_ventas/central_E320000000001','PATCH','owner',ecf)).status,200);
  assert.equal((await document('facturador_ventas/central_E320000000001','GET',owner.idToken)).status,200);
  assert.equal((await document('facturador_ventas/central_E320000000001','GET',viewer.idToken)).status,200);
  assert.equal((await document('facturador_ventas/central_E320000000001','GET',outsider.idToken)).status,403);
  assert.equal((await document('facturador_ventas/central_E320000000001','PATCH',owner.idToken,ecf)).status,403);

  const movement={business_id:'central',tipo:'gasto',monto_centavos:4500,
    fecha:'2026-11-10',created_by_uid:owner.localId};
  assert.equal((await document('fin_movements/expense-1','PATCH',owner.idToken,movement)).status,200);
  assert.equal((await document('fin_movements/expense-2','PATCH',viewer.idToken,
    {...movement,created_by_uid:viewer.localId})).status,403);
  assert.equal((await document('fin_movements/expense-3','PATCH',owner.idToken,
    {...movement,business_id:'plaza'})).status,403);
  assert.equal((await document('fin_movements/expense-1','GET',owner.idToken)).status,200);
  assert.equal((await document('fin_movements/expense-1','DELETE',owner.idToken)).status,403);
});
