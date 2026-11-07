"""Inspección independiente de PDF de QA, sin corregir el producto revisado."""
import json
import sys
from pathlib import Path
import pdfplumber
from pypdf import PdfReader

directory = Path(sys.argv[1]).resolve()
results = []
for path in sorted(directory.glob('*.pdf')):
    reader = PdfReader(path, strict=True)
    text = '\n'.join(page.extract_text() or '' for page in reader.pages)
    outside = []
    with pdfplumber.open(path) as pdf:
        for index, page in enumerate(pdf.pages):
            for char in page.chars:
                if char['x0'] < 39 or char['x1'] > 557 or char['top'] < 20 or char['bottom'] > 830:
                    outside.append({'page': index+1, 'x0': round(char['x0'], 2), 'top': round(char['top'], 2)})
    required = ['Entregar útiles escolares', 'María Muñoz', '20/11/2026', 'Pendiente']
    missing = [value for value in required if value not in text] if 'normal' in path.name else []
    results.append({'file': path.name, 'pages': len(reader.pages), 'characters': len(text),
                    'outsidePageCharacters': len(outside), 'firstOutside': outside[:3],
                    'missingFields': missing, 'result': 'FAIL' if outside or missing else 'PASS'})
(directory/'inspeccion.json').write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding='utf8')
print(json.dumps(results, ensure_ascii=True))
