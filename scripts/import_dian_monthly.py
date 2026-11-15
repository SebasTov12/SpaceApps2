from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import urllib.request
import zipfile
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any
from xml.etree import ElementTree


SOURCE_URL = (
    "https://www.dian.gov.co/dian/cifras/EstadisticasRecaudo/"
    "Recaudo-mensual-por-tipo-de-impuesto-2000-2026.zip"
)
NAMESPACE = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
MONTHS = {
    "enero": 1,
    "febrero": 2,
    "marzo": 3,
    "abril": 4,
    "mayo": 5,
    "junio": 6,
    "julio": 7,
    "agosto": 8,
    "septiembre": 9,
    "setiembre": 9,
    "octubre": 10,
    "noviembre": 11,
    "diciembre": 12,
}
CSV_FIELDS = (
    "period_start",
    "total_million_cop",
    "tax_columns_million_cop",
    "is_preliminary",
    "source_url",
    "source_sha256",
    "source_update_note",
)


def _shared_strings(workbook: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in workbook.namelist():
        return []
    root = ElementTree.fromstring(workbook.read("xl/sharedStrings.xml"))
    return [
        "".join(text.text or "" for text in item.findall(".//m:t", NAMESPACE))
        for item in root.findall("m:si", NAMESPACE)
    ]


def _column(reference: str) -> str:
    match = re.match(r"[A-Z]+", reference)
    if match is None:
        raise ValueError(f"Unexpected Excel cell reference: {reference}")
    return match.group(0)


def _cell_value(cell: ElementTree.Element, strings: list[str]) -> str:
    kind = cell.attrib.get("t")
    if kind == "inlineStr":
        return "".join(text.text or "" for text in cell.findall(".//m:t", NAMESPACE))
    value = cell.find("m:v", NAMESPACE)
    if value is None or value.text is None:
        return ""
    if kind == "s":
        return strings[int(value.text)]
    return value.text


def _parse_amount(value: str) -> float | None:
    cleaned = value.strip().replace(",", "")
    if cleaned in {"", "-", "–", "—"}:
        return None
    try:
        return float(Decimal(cleaned))
    except InvalidOperation as error:
        raise ValueError(f"DIAN amount is not numeric: {value!r}") from error


def _read_source(source_path: Path | None) -> tuple[bytes, str]:
    if source_path is not None:
        raw = source_path.read_bytes()
        return raw, source_path.name
    request = urllib.request.Request(
        SOURCE_URL,
        headers={"User-Agent": "SAROS public data ingestion/1.0"},
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read(), Path(response.url).name


def _workbook_bytes(raw: bytes, filename: str) -> bytes:
    if filename.lower().endswith(".xlsx"):
        return raw
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        candidates = [name for name in archive.namelist() if name.lower().endswith(".xlsx")]
        if len(candidates) != 1:
            raise ValueError(f"Expected one XLSX in DIAN archive, found {len(candidates)}")
        return archive.read(candidates[0])


def parse_observations(raw: bytes, filename: str) -> tuple[list[dict[str, Any]], str, str]:
    digest = hashlib.sha256(raw).hexdigest()
    workbook_bytes = _workbook_bytes(raw, filename)
    with zipfile.ZipFile(io.BytesIO(workbook_bytes)) as workbook:
        strings = _shared_strings(workbook)
        sheet_files = [
            name for name in workbook.namelist()
            if name.startswith("xl/worksheets/sheet") and name.endswith(".xml")
        ]
        if len(sheet_files) != 1:
            raise ValueError(f"Expected one worksheet, found {len(sheet_files)}")
        sheet = ElementTree.fromstring(workbook.read(sheet_files[0]))
        rows: list[dict[str, str]] = []
        for row in sheet.findall(".//m:sheetData/m:row", NAMESPACE):
            cells = {
                _column(cell.attrib["r"]): _cell_value(cell, strings)
                for cell in row.findall("m:c", NAMESPACE)
            }
            rows.append(cells)

    title_row = next((row for row in rows if "RECAUDO MENSUAL" in row.get("A", "").upper()), {})
    update_row = next((row for row in rows if "Actualizado a" in row.get("A", "")), {})
    source_title = title_row.get("A", "DIAN monthly gross collection")
    source_note = update_row.get("A", "Official DIAN release; current pesos")
    header_index = next(
        (index for index, row in enumerate(rows) if row.get("A", "").strip().lower() == "año"),
        None,
    )
    if header_index is None:
        raise ValueError("Could not locate DIAN Año/Mes header row")
    headers = rows[header_index]
    observations: list[dict[str, Any]] = []
    for row in rows[header_index + 1 :]:
        year_text = row.get("A", "").strip()
        month_text = row.get("B", "").strip().casefold()
        if not year_text.isdigit() or month_text not in MONTHS:
            continue
        year = int(year_text)
        month = MONTHS[month_text]
        total = _parse_amount(row.get("AF", ""))
        if total is None:
            raise ValueError(f"DIAN total is missing for {year}-{month:02d}")
        tax_columns: dict[str, float | None] = {}
        for column, title in headers.items():
            if column in {"A", "B", "AF"} or not title.strip():
                continue
            tax_columns[title.strip()] = _parse_amount(row.get(column, ""))
        observations.append(
            {
                "period_start": date(year, month, 1).isoformat(),
                "total_million_cop": total,
                "tax_columns_million_cop": tax_columns,
                "is_preliminary": year == 2026,
                "source_url": SOURCE_URL,
                "source_sha256": digest,
                "source_update_note": source_note,
            }
        )

    observations.sort(key=lambda item: item["period_start"])
    periods = [item["period_start"] for item in observations]
    if len(periods) != len(set(periods)):
        raise ValueError("DIAN workbook contains duplicate monthly records")
    if not observations:
        raise ValueError("No monthly DIAN observations found")
    return observations, source_title, source_note


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Download and export the official DIAN monthly gross collection series."
    )
    parser.add_argument("--output-csv", type=Path, required=True)
    parser.add_argument(
        "--source-file",
        type=Path,
        help="Use a previously downloaded DIAN ZIP or XLSX instead of downloading it.",
    )
    args = parser.parse_args()
    raw, filename = _read_source(args.source_file)
    observations, title, update_note = parse_observations(raw, filename)
    args.output_csv.parent.mkdir(parents=True, exist_ok=True)
    with args.output_csv.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=CSV_FIELDS)
        writer.writeheader()
        for item in observations:
            writer.writerow(
                {
                    **item,
                    "tax_columns_million_cop": json.dumps(
                        item["tax_columns_million_cop"], ensure_ascii=False, separators=(",", ":")
                    ),
                    "is_preliminary": str(item["is_preliminary"]).lower(),
                }
            )
    print(
        json.dumps(
            {
                "source_url": SOURCE_URL,
                "source_title": title,
                "source_update_note": update_note,
                "source_sha256": observations[0]["source_sha256"],
                "rows": len(observations),
                "first_period": observations[0]["period_start"],
                "last_period": observations[-1]["period_start"],
                "preliminary_rows": sum(item["is_preliminary"] for item in observations),
                "unit": "million COP, current pesos",
                "output_csv": str(args.output_csv),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
