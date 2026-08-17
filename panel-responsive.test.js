const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const panelHtml = fs.readFileSync(path.join(root, "panel.html"), "utf8");
const panelCss = fs.readFileSync(path.join(root, "panel.css"), "utf8");

test("el panel incluye viewport responsive y reglas moviles adaptables", () => {
  assert.match(indexHtml, /name="viewport" content="width=device-width, initial-scale=1"/);
  assert.match(panelHtml, /name="viewport" content="width=device-width, initial-scale=1"/);
  assert.match(panelCss, /@media\s*\(max-width:\s*900px\)/);
  assert.match(panelCss, /@media\s*\(max-width:\s*640px\)/);
  assert.doesNotMatch(indexHtml, /iframe/i);
});
