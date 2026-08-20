const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const harness = fs.readFileSync("panel-shortcuts-harness.html", "utf8");

test("el arnés de teclado valida el mapa operativo vigente F5-F12", () => {
  for (const action of [
    "CHANGE_LINE", "PARK_OR_RESUME", "CASH_IN", "CASH_OUT",
    "VERIFY_PRICE", "SEARCH_PRODUCT", "WHOLESALE", "SUBMIT_SALE"
  ]) assert.match(harness, new RegExp(`api\\.actions\\.${action}`));

  for (const obsolete of ["NEW_SALE", "PARK_SALE", "RESUME_SALE", "STAGE_CATALOG", "STAGE_CART"]) {
    assert.doesNotMatch(harness, new RegExp(`api\\.actions\\.${obsolete}`));
  }
});
