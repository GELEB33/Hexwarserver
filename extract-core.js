// Достаёт ядро игры из ../hexwar/index.html в hexcore.js — запускайте после каждого обновления игры:  node extract-core.js [путь/к/index.html]
const fs = require('fs'), path = require('path');
const src = process.argv[2] || path.join(__dirname, '..', 'hexwar', 'index.html');
const h = fs.readFileSync(src, 'utf8');
const a = h.indexOf('const HexCore = (function () {'), b = h.indexOf('})();', a) + 4;
if (a < 0 || b < 4) throw new Error('ядро не найдено');
fs.writeFileSync(path.join(__dirname, 'hexcore.js'), '// Сгенерировано extract-core.js из index.html — не редактируйте вручную\n' + h.slice(a, b) + '\nmodule.exports = HexCore;\n');
console.log('hexcore.js обновлён');
