"""Inspección independiente de QA; requiere pypdf y pdfplumber, no se usa en producción."""
import json
import re
import sys
from pathlib import Path
import pdfplumber
from pypdf import PdfReader

directory = Path(sys.argv[1]).resolve()
results = []
for name in ["reporte-interno-ejemplo.pdf", "reporte-externo-ejemplo.pdf", "reporte-referencia-2000-acciones.pdf"]:
    path = directory / name
    reader = PdfReader(path, strict=True)
    assert not reader.is_encrypted
    text = " ".join(" ".join(page.extract_text() for page in reader.pages).split())
    assert "2026-01-01" in text and "2026-12-31" in text
    for section in ["Organizaciones y beneficiarios", "Planes de Intervención", "Acciones ejecutadas", "Compromisos cumplidos", "Donaciones y recursos", "Indicadores", "Resultados obtenidos"]:
        assert section in text, (name, section)
    if "externo" in name:
        assert "Organización solidaria" not in text
        assert "Plan comunitario" not in text
        assert "Información agregada" in text
    if "interno" in name:
        assert text.count("coordinación") == 90, "No se conserva el texto largo completo"
        assert "Sin resultados para los filtros del reporte." in text
    if "referencia" in name:
        assert len(re.findall(r"Acción de acompañamiento \d+", text)) == 3000
        assert "Acción de acompañamiento 2000" in text
        assert "Plan comunitario 300" in text
    checked = 0
    with pdfplumber.open(path) as pdf:
        for index, page in enumerate(pdf.pages):
            for char in page.chars:
                assert char["x0"] >= 39 and char["x1"] <= 557, (name, index + 1, "texto fuera del ancho")
                assert char["top"] >= 20 and char["bottom"] <= 830, (name, index + 1, "texto fuera de la página")
            checked += len(page.chars)
    results.append({"file": name, "pages": len(reader.pages), "charactersChecked": checked, "result": "PASS"})
(directory / "inspeccion.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
print(json.dumps(results))
