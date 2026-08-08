const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "e2e-responsive.html"),
  "utf8",
);

test("el arnes responsive usa viewport movil real y conserva el mismo origen", () => {
  assert.match(source, /width:\s*430px/);
  assert.match(source, /height:\s*844px/);
  assert.match(source, /src="\.\/\?e2e=responsive-430x844#resumen"/);
  assert.match(source, /URLSearchParams\(location\.search\).*get\("route"\)/);
  assert.match(source, /#\$\{route\}/);
  assert.doesNotMatch(source, /(?:password|api[_-]?key|service[_-]?role)/i);
  assert.match(source, /noindex,nofollow/);
});
