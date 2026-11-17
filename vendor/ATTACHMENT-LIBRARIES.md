Local, pinned browser distributions; loaded only when the corresponding file type is selected.

- SheetJS CE 0.20.3: https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js — Apache-2.0, see xlsx-LICENSE.txt.
- Mammoth 1.13.0: https://registry.npmjs.org/mammoth/-/mammoth-1.13.0.tgz — BSD-2-Clause, see mammoth/LICENSE.
- PDF.js 6.5.438: https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-6.5.438.tgz — Apache-2.0, see pdfjs/LICENSE; CMaps and standard fonts retain their bundled licenses.

PDF extraction uses the legacy module and matching worker, disables eval and WebAssembly, and reads local bytes only. DOCX extraction uses extractRawText, not HTML conversion. These assets are included in the offline bundle. Update each pinned distribution together with its licenses and worker.
