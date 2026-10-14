const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const routeCore = require('./shell-route-core.js');
for (const entry of ['index.html', 'mobile/index.html']) {
  const html = fs.readFileSync(path.join(__dirname,entry),'utf8');
  const asset = html.match(/(?:shell-assets|assets)\/(index-[^?"']+\.js)/)[0];
  const source = fs.readFileSync(path.join(__dirname,entry.startsWith('mobile')?'mobile':'',asset),'utf8');
  const expression = source.match(/`iframe`,\{ref:pe,src:([^\n]+?),title:`\$\{Ce.label\}/)?.[1];
  assert.ok(expression, 'iframe source expression exists');
  const context = { pe:{current:null},e:'dcarela',g:false,n:'finanzas',_e:route=>`/panel.html?b=${context.e}#${route||'dashboard'}`,window:{DcarelaShellRoute:routeCore} };
  const render = () => vm.runInNewContext(expression,context);
  test(`${entry}: iframe empieza en el módulo solicitado y conserva la fuente al navegar`,()=>{
    assert.equal(render(),'/panel.html?b=dcarela#finanzas');
    context.n='reportes';
    assert.equal(render(),'/panel.html?b=dcarela#finanzas','navegar reutiliza el iframe, no recarga formularios');
  });
  test(`${entry}: nueva sucursal o sesión abre su módulo sin heredar URL ajena`,()=>{
    context.e='plaza-artesanal';context.n='reportes';
    assert.equal(render(),'/panel.html?b=plaza-artesanal#reportes');
    context.g=true;context.n='clientes';
    assert.equal(render(),'/panel.html?b=plaza-artesanal#clientes');
    assert.ok(html.indexOf('shell-route-core.js') < html.indexOf('type="module"'), 'core se carga antes del shell');
  });
}
