const test = require("node:test");
const assert = require("node:assert/strict");
const pending = require("./panel-sale-pending.js");

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
  };
}

function draft(name, amount, quantity = 1) {
  return {
    name,
    cart: [{
      nombre: name,
      cantidad: String(quantity),
      precioUnitarioCentavos: amount,
      descuentoPct: 0,
    }],
    totalCentavos: amount * quantity,
    savedAt: new Date().toISOString(),
  };
}

test("crea, lista, recupera y conserva dos cuentas en espera distintas", () => {
  const storage = memoryStorage();
  const business = "dcarela";

  pending.upsert(storage, business, draft("Mesa 1", 12000, 2));
  pending.upsert(storage, business, draft("Mesa 2", 8500, 1));

  const listed = pending.list(storage, business);
  assert.equal(listed.length, 2);
  assert.deepEqual(
    listed.map(item => item.name).sort(),
    ["Mesa 1", "Mesa 2"]
  );

  const mesa1 = listed.find(item => item.name === "Mesa 1");
  const recovered = pending.take(storage, business, mesa1.id);

  assert.equal(recovered.name, "Mesa 1");
  assert.equal(recovered.cart[0].nombre, "Mesa 1");
  assert.equal(recovered.totalCentavos, 24000);

  const remaining = pending.list(storage, business);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].name, "Mesa 2");
  assert.equal(remaining[0].cart[0].nombre, "Mesa 2");
  assert.equal(remaining[0].totalCentavos, 8500);
});

test("rechaza nombres vacios y repetidos para evitar confusion", () => {
  const storage = memoryStorage();
  const business = "dcarela";

  assert.throws(
    () => pending.upsert(storage, business, draft("   ", 5000)),
    /nombre/i
  );

  pending.upsert(storage, business, draft("Ana", 5000));

  assert.throws(
    () => pending.upsert(storage, business, draft(" ana  ", 7000)),
    /existe una cuenta en espera con ese nombre/i
  );
});
