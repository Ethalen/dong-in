// 產生可在瀏覽器頁面內執行的單檔測試腳本（用同一份解析邏輯在各站實測）
// 用法：node test/make-browser-bundle.mjs ridi > test/browser/ridi.js
import fs from 'node:fs';
const name = process.argv[2];
const strip = (s) => s.replace(/^import .*$/gm, '').replace(/^export default \{/m, 'const adapter = {').replace(/^export /gm, '');
const util = strip(fs.readFileSync('src/util.js', 'utf8'));
const merge = strip(fs.readFileSync('src/merge.js', 'utf8'));
const adapter = strip(fs.readFileSync('src/adapters/' + name + '.js', 'utf8'));
const harness = fs.readFileSync('test/browser-harness.txt', 'utf8');
process.stdout.write('(async () => {\n' + util + '\n' + merge + '\n' + adapter + '\n' + harness + '\n})()\n');
