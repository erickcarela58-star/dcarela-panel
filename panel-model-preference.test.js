const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/panel.js', 'utf8');

function renderModel(preference, conversationModel, available = ['auto', 'local-pos', 'google-gemini']) {
  const picker = {value: 'auto', options: available.map(value => ({value}))};
  const messages = {innerHTML: '', scrollTop: 0, scrollHeight: 0};
  const title = {textContent: ''};
  const context = {
    $: id => ({iaModel: picker, iaMessages: messages, iaConversationTitle: title})[id],
    localStorage: {getItem(){if(preference instanceof Error)throw preference;return preference;}},
    IA_MODEL_KEY: 'isolated-test-model', IA_EMPTY_HTML: '', iaStatusCache: {},
    iaMessageHtml(){return '';}, iaActionHtml(){return '';}, renderIaDocuments(){},
    renderIaLearnings(){}, iaBindMessageActions(){}, requestAnimationFrame(fn){fn();}
  };
  vm.createContext(context);
  const start = source.indexOf('  function renderIaHistory(');
  const end = source.indexOf('  function renderIaDocuments(', start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(source.slice(start, end), context);
  context.renderIaHistory({conversation:{model: conversationModel}, messages:[], actions:[]});
  return picker.value;
}

test('Automático elegido persiste aunque el último mensaje se enviara con cerebro local', () => {
  assert.equal(renderModel('auto', 'local-pos'), 'auto');
});
test('la elección vigente de Gemini no es sustituida por la del historial', () => {
  assert.equal(renderModel('google-gemini', 'local-pos'), 'google-gemini');
});
test('sin preferencia nueva conserva el modelo explícito de la conversación', () => {
  assert.equal(renderModel(null, 'google-gemini'), 'google-gemini');
  assert.equal(renderModel('local-pos', 'auto'), 'local-pos');
});
test('un proveedor ausente vuelve a Automático sin dejar un selector vacío', () => {
  assert.equal(renderModel('google-gemini', 'google-gemini', ['auto','local-pos']), 'auto');
  assert.equal(renderModel(null, 'modelo-antiguo'), 'auto');
});
test('almacenamiento bloqueado no impide abrir el historial', () => {
  assert.equal(renderModel(new Error('Storage denied'), 'local-pos'), 'local-pos');
});
