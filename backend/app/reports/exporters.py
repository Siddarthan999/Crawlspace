import csv
import io
import json

from openpyxl import Workbook

PAGE_EXPORT_COLS = [
    "url", "resource_type", "status_code", "indexable", "indexability_reason", "depth", "title", "title_len",
    "meta_desc", "meta_desc_len", "h1_1", "h1_count", "word_count", "canonical", "meta_robots",
    "inlinks", "outlinks", "external_outlinks", "response_ms", "size", "content_type", "redirect_url",
    "in_sitemap", "rendered",
]

ISSUE_EXPORT_COLS = ["url", "check_id", "category", "severity", "message"]


def _rows(objs, cols):
    for o in objs:
        yield [o.get(c) if isinstance(o, dict) else getattr(o, c, None) for c in cols]


def to_csv(objs, cols) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(cols)
    for r in _rows(objs, cols):
        w.writerow(r)
    return buf.getvalue().encode("utf-8")


def to_json(objs, cols) -> bytes:
    out = [{c: (o.get(c) if isinstance(o, dict) else getattr(o, c, None)) for c in cols} for o in objs]
    return json.dumps(out, default=str, indent=2).encode("utf-8")


def to_xlsx(objs, cols, sheet_name="Data") -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = sheet_name[:31]
    ws.append(cols)
    for r in _rows(objs, cols):
        ws.append([str(x) if isinstance(x, (list, dict)) else x for x in r])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
