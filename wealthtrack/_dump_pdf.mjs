import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';
import { pathToFileURL } from 'url';

GlobalWorkerOptions.workerSrc = pathToFileURL('./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs').href;

const data = new Uint8Array(fs.readFileSync('C:/Users/User/Desktop/XPerformance - 14613538 - Ref.31.03.pdf'));
const doc = await getDocument({ data, useSystemFonts: true }).promise;
console.log('PAGES:', doc.numPages);
let full = '';
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const tc = await page.getTextContent();
  const text = tc.items.map(it => it.str).join(' ');
  full += '\n===PAGE ' + i + '===\n' + text + '\n';
}
fs.writeFileSync('_xp_dump.txt', full);
console.log('bytes:', full.length);
