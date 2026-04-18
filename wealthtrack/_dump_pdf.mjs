import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';
import { pathToFileURL } from 'url';
GlobalWorkerOptions.workerSrc = pathToFileURL('./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs').href;

const data = new Uint8Array(fs.readFileSync('C:/Users/User/Desktop/XPerformance - 14613538 - Ref.31.03.pdf'));
const doc = await getDocument({ data, useSystemFonts: true }).promise;
let text = '';
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const tc = await page.getTextContent();
  // Agrupa por Y (mesma linha) como o código real em _fromPDF
  const lineMap = new Map();
  for (const item of tc.items) {
    if (!item.str || !item.transform) continue;
    const y = Math.round(item.transform[5]);
    if (!lineMap.has(y)) lineMap.set(y, []);
    lineMap.get(y).push({ x: item.transform[4], str: item.str });
  }
  const sortedYs = [...lineMap.keys()].sort((a, b) => b - a);
  const merged = [];
  for (const y of sortedYs) {
    const prev = merged[merged.length - 1];
    if (prev && Math.abs(y - prev.y) < 8) prev.items.push(...lineMap.get(y));
    else merged.push({ y, items: [...lineMap.get(y)] });
  }
  const pageText = merged
    .map(({ items: its }) => { its.sort((a, b) => a.x - b.x); return its.map(it => it.str).join(' ').trim(); })
    .filter(l => l.length > 0)
    .join('\n');
  text += pageText + '\n\n';
}
fs.writeFileSync('_xp_dump.txt', text);
console.log('bytes:', text.length);
