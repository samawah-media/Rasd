from __future__ import annotations

import argparse
import json
import re
from dataclasses import asdict, dataclass, field
from hashlib import sha256
from pathlib import Path
from typing import Any

from pypdf import PdfReader

try:
    import fitz  # PyMuPDF
except Exception:  # pragma: no cover - optional local rendering dependency
    fitz = None

try:
    from PIL import Image
except Exception:  # pragma: no cover - optional local visual classification dependency
    Image = None


REPORT_NAME_RE = re.compile(r"report\s+E(?P<issue>\d+)", re.IGNORECASE)
URL_RE = re.compile(r"https?://[^\s<>\"')\]]+", re.IGNORECASE)
VERSION_WORDS = {
    "الأول": 1,
    "الأولى": 1,
    "الثاني": 2,
    "الثانية": 2,
    "الثالث": 3,
    "الثالثة": 3,
    "الرابع": 4,
    "الرابعة": 4,
    "الخامس": 5,
    "الخامسة": 5,
}
PLATFORM_MARKERS = {
    "منصة إكس": "X",
    "منصة يوتيوب": "YouTube",
    "منصة تيكتوك": "TikTok",
    "منصة انستغرام": "Instagram",
    "منصة إنستغرام": "Instagram",
    "منصة فيسبوك": "Facebook",
    "موقع رسمي": "Official",
    "صحيفة": "News",
    "موقع": "Website",
}
MONTHS_AR = {
    "يناير": "01",
    "يـنـــايــــر": "01",
    "فبراير": "02",
    "فبــــــراير": "02",
    "فـــبرايـــر": "02",
    "مارس": "03",
    "مــــــارس": "03",
    "أبريل": "04",
    "ابريل": "04",
    "مايو": "05",
    "يونيو": "06",
    "يوليو": "07",
    "أغسطس": "08",
    "اغسطس": "08",
    "سبتمبر": "09",
    "أكتوبر": "10",
    "اكتوبر": "10",
    "نوفمبر": "11",
    "ديسمبر": "12",
    "ديســـمبر": "12",
}
SENTIMENT_CHECKBOX_REGIONS = {
    "negative": (0.405, 0.815, 0.435, 0.865),
    "neutral": (0.486, 0.815, 0.516, 0.865),
    "positive": (0.568, 0.815, 0.598, 0.865),
}


@dataclass
class ExtractedItem:
    source_pdf: str
    report_issue: int | None
    page: int
    platform: str
    source_name: str | None
    author_name: str | None
    title: str | None
    summary: str
    sentiment: str
    published_date_text: str | None
    captured_at_text: str | None
    original_url: str | None
    extracted_urls: list[str]
    link_annotation_urls: list[str]
    evidence_image_path: str | None
    raw_text: str
    image_count: int
    confidence: str
    warnings: list[str] = field(default_factory=list)


@dataclass
class ExtractedReport:
    source_pdf: str
    sha256: str
    duplicate_of: str | None
    issue: int | None
    version: int | None
    pages: int
    text_chars: int
    image_count: int
    title_text: str
    period_text: str
    stats_text: str
    publishers_text: str
    item_count_claim: int | None
    extracted_item_count: int
    items: list[ExtractedItem]
    warnings: list[str] = field(default_factory=list)


def normalize_text(text: str) -> str:
    text = text.replace("\x00", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def safe_slug(value: str) -> str:
    value = re.sub(r"[^A-Za-z0-9._-]+", "-", value)
    return re.sub(r"-{2,}", "-", value).strip("-") or "report"


def extract_urls(text: str) -> list[str]:
    urls = []
    for match in URL_RE.findall(text):
        cleaned = match.rstrip(".,،؛:)")
        if cleaned not in urls:
            urls.append(cleaned)
    return urls


def extract_page_link_urls(doc: Any | None, page_number: int) -> list[str]:
    if doc is None:
        return []

    urls: list[str] = []
    try:
        page = doc.load_page(page_number - 1)
        for link in page.get_links():
            uri = (link.get("uri") or "").strip()
            if uri and uri not in urls:
                urls.append(uri)
    except Exception:
        return urls
    return urls


def render_page_image(
    doc: Any,
    page_number: int,
    pdf_name: str,
    assets_root: Path | None,
    public_prefix: str,
) -> str | None:
    if not assets_root or fitz is None:
        return None

    report_dir = assets_root / safe_slug(Path(pdf_name).stem)
    report_dir.mkdir(parents=True, exist_ok=True)
    output = report_dir / f"page-{page_number:03d}.jpg"

    if not output.exists():
        page = doc.load_page(page_number - 1)
        pix = page.get_pixmap(matrix=fitz.Matrix(1.6, 1.6), alpha=False)
        pix.save(str(output), jpg_quality=82)

    relative = output.relative_to(assets_root).as_posix()
    return f"{public_prefix.rstrip('/')}/{relative}"


def rendered_page_image_path(pdf_name: str, assets_root: Path, page_number: int) -> Path:
    return assets_root / safe_slug(Path(pdf_name).stem) / f"page-{page_number:03d}.jpg"


def page_image_count(page: Any) -> int:
    resources = page.get("/Resources") or {}
    xobj = resources.get("/XObject") or {}
    count = 0
    try:
        for obj in xobj.values():
            resolved = obj.get_object()
            if resolved.get("/Subtype") == "/Image":
                count += 1
    except Exception:
        return count
    return count


def infer_issue(path: Path, title_text: str) -> int | None:
    if match := REPORT_NAME_RE.search(path.name):
        return int(match.group("issue"))
    for word, version in VERSION_WORDS.items():
        if word in title_text:
            return version
    return None


def infer_version(title_text: str, fallback_issue: int | None) -> int | None:
    for word, version in VERSION_WORDS.items():
        if word in title_text:
            return version
    return fallback_issue


def infer_platform(text: str) -> str:
    for marker, platform in PLATFORM_MARKERS.items():
        if marker in text:
            return platform
    return "Unknown"


def extract_after_label(lines: list[str], label: str) -> str | None:
    for idx, line in enumerate(lines):
        if label in line:
            for candidate in lines[idx + 1 : idx + 4]:
                candidate = candidate.strip()
                if candidate and not any(skip in candidate for skip in ["المحتوى", "تصنيف", "إيجــابي", "محــايد", "سلــبي"]):
                    return candidate
    return None


def extract_summary(text: str) -> tuple[str, list[str]]:
    warnings: list[str] = []
    if "المحتوى / الملخص" not in text:
        warnings.append("missing_summary_label")
        return text[:800].strip(), warnings

    summary = text.split("المحتوى / الملخص", 1)[1]
    split_markers = ["تصــنيف", "تصنيف", "إيجــابي", "محــايد", "سلــبي", "الكاتب"]
    cut_positions = [summary.find(marker) for marker in split_markers if summary.find(marker) > -1]
    if cut_positions:
        summary = summary[: min(cut_positions)]
    else:
        warnings.append("summary_end_not_detected")

    summary = normalize_text(summary)
    if len(summary) < 25:
        warnings.append("short_summary")
    return summary[:1800], warnings


def infer_sentiment(text: str) -> str:
    # The legacy PDF often prints all three labels, so keep neutral unless future OCR
    # or source data identifies the selected visual state.
    if "سلبي" in text and "إيجابي" not in text and "محايد" not in text:
        return "negative"
    if "إيجابي" in text and "سلبي" not in text and "محايد" not in text:
        return "positive"
    return "neutral"


def infer_visual_sentiment(image_path: Path) -> str | None:
    if Image is None or not image_path.exists():
        return None

    try:
        image = Image.open(image_path).convert("RGB")
    except Exception:
        return None

    width, height = image.size
    scores: dict[str, int] = {}
    for sentiment, (x1, y1, x2, y2) in SENTIMENT_CHECKBOX_REGIONS.items():
        crop = image.crop((int(width * x1), int(height * y1), int(width * x2), int(height * y2)))
        pixels = crop.get_flattened_data() if hasattr(crop, "get_flattened_data") else crop.getdata()
        scores[sentiment] = sum(1 for red, green, blue in pixels if red < 120 and green < 140 and blue < 140)

    ranked = sorted(scores.items(), key=lambda entry: entry[1], reverse=True)
    if len(ranked) < 2 or ranked[0][1] - ranked[1][1] < 100:
        return None
    return ranked[0][0]


def extract_capture_text(text: str) -> str | None:
    match = re.search(r"(\d{4}\s+[^\s\n]+(?:\s*)\d{1,2})\*?تم التقاط هذه الصورة بتاريخ", text)
    if match:
        return match.group(1).strip()
    match = re.search(r"تم التقاط هذه الصورة بتاريخ\s*([^\n]+)", text)
    if match:
        return match.group(1).strip()
    return None


def extract_published_date_text(text: str) -> str | None:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    for idx, line in enumerate(lines[:12]):
        if any(month in line for month in MONTHS_AR):
            start = max(0, idx - 2)
            end = min(len(lines), idx + 3)
            return " ".join(lines[start:end])
    return None


def maybe_title(summary: str) -> str | None:
    first_line = next((line.strip() for line in summary.splitlines() if line.strip()), "")
    if not first_line:
        return None
    return first_line[:120]


def extract_item(
    path: Path,
    issue: int | None,
    page_number: int,
    text: str,
    image_count: int,
    link_annotation_urls: list[str],
) -> ExtractedItem | None:
    if "المحتوى / الملخص" not in text:
        return None
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    summary, warnings = extract_summary(text)
    author = extract_after_label(lines, "الكاتب")
    platform = infer_platform(text)
    confidence = "medium"
    if warnings or platform == "Unknown":
        confidence = "low"
    if len(summary) > 60 and platform != "Unknown" and author:
        confidence = "high"
    text_urls = extract_urls(text)
    urls = [*link_annotation_urls]
    for url in text_urls:
        if url not in urls:
            urls.append(url)

    return ExtractedItem(
        source_pdf=path.name,
        report_issue=issue,
        page=page_number,
        platform=platform,
        source_name=None,
        author_name=author,
        title=maybe_title(summary),
        summary=summary,
        sentiment=infer_sentiment(text),
        published_date_text=extract_published_date_text(text),
        captured_at_text=extract_capture_text(text),
        original_url=link_annotation_urls[0] if link_annotation_urls else text_urls[0] if text_urls else None,
        extracted_urls=urls,
        link_annotation_urls=link_annotation_urls,
        evidence_image_path=None,
        raw_text=text[:5000],
        image_count=image_count,
        confidence=confidence,
        warnings=warnings,
    )


def parse_claimed_count(stats_text: str) -> int | None:
    # Reports usually show a count near "خبر/أخبار"; use the closest number before it.
    compact = stats_text.replace("\n", " ")
    match = re.search(r"(\d{1,3})\s+(?:خــــــــبر|خبر|أخبـــــــــار|أخبار)", compact)
    if match:
        return int(match.group(1))
    return None


def extract_report(
    path: Path,
    seen_hashes: dict[str, str],
    assets_root: Path | None = None,
    public_prefix: str = "/imports/legacy-pages",
) -> ExtractedReport:
    payload = path.read_bytes()
    digest = sha256(payload).hexdigest()
    duplicate_of = seen_hashes.get(digest)
    seen_hashes.setdefault(digest, path.name)
    render_assets_root = None if duplicate_of else assets_root
    reader = PdfReader(str(path))
    fitz_doc = fitz.open(str(path)) if fitz is not None else None
    page_texts: list[str] = []
    page_images: list[int] = []
    for page in reader.pages:
        page_texts.append(normalize_text(page.extract_text() or ""))
        page_images.append(page_image_count(page))

    title_text = page_texts[0] if page_texts else ""
    period_text = page_texts[1] if len(page_texts) > 1 else ""
    stats_text = page_texts[2] if len(page_texts) > 2 else ""
    publishers_text = page_texts[3] if len(page_texts) > 3 else ""
    issue = infer_issue(path, title_text)
    version = infer_version(title_text, issue)

    items: list[ExtractedItem] = []
    for idx, text in enumerate(page_texts, start=1):
        item = extract_item(
            path,
            issue,
            idx,
            text,
            page_images[idx - 1],
            extract_page_link_urls(fitz_doc, idx),
        )
        if item:
            item.evidence_image_path = render_page_image(
                fitz_doc,
                idx,
                path.name,
                render_assets_root,
                public_prefix,
            )
            if render_assets_root:
                visual_sentiment = infer_visual_sentiment(rendered_page_image_path(path.name, render_assets_root, idx))
                if visual_sentiment:
                    item.sentiment = visual_sentiment
            items.append(item)

    warnings: list[str] = []
    if duplicate_of:
        warnings.append(f"duplicate_of:{duplicate_of}")
    if "Dashboard" in path.name or "Dashboard" in title_text:
        warnings.append("dashboard_pdf_is_mostly_images")
    if not items and len(reader.pages) > 4:
        warnings.append("no_items_detected")

    return ExtractedReport(
        source_pdf=path.name,
        sha256=digest,
        duplicate_of=duplicate_of,
        issue=issue,
        version=version,
        pages=len(reader.pages),
        text_chars=sum(len(text) for text in page_texts),
        image_count=sum(page_images),
        title_text=title_text,
        period_text=period_text,
        stats_text=stats_text,
        publishers_text=publishers_text,
        item_count_claim=parse_claimed_count(stats_text),
        extracted_item_count=len(items),
        items=items,
        warnings=warnings,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract legacy Hidayathon report PDFs into reviewable JSON.")
    parser.add_argument("--input-dir", default="..", help="Directory containing PDF reports.")
    parser.add_argument("--output", default="data/imports/hidayathon_reports.json", help="JSON output path.")
    parser.add_argument(
        "--assets-output",
        default="public/imports/legacy-pages",
        help="Directory for rendered page evidence images. Use empty string to disable.",
    )
    parser.add_argument(
        "--public-prefix",
        default="/imports/legacy-pages",
        help="Public URL prefix that maps to --assets-output.",
    )
    args = parser.parse_args()

    input_dir = Path(args.input_dir).resolve()
    output = Path(args.output).resolve()
    assets_root = Path(args.assets_output).resolve() if args.assets_output else None
    pdfs = sorted(input_dir.glob("*.pdf"))
    seen_hashes: dict[str, str] = {}
    reports = [
        extract_report(path, seen_hashes, assets_root=assets_root, public_prefix=args.public_prefix)
        for path in pdfs
    ]
    non_duplicate_reports = [report for report in reports if not report.duplicate_of]
    items = [item for report in non_duplicate_reports for item in report.items]

    output.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "source_dir": str(input_dir),
        "report_count": len(reports),
        "unique_report_count": len(non_duplicate_reports),
        "total_extracted_items": len(items),
        "reports": [asdict(report) for report in reports],
    }
    output.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps({
        "output": str(output),
        "report_count": len(reports),
        "unique_report_count": len(non_duplicate_reports),
        "total_extracted_items": len(items),
        "reports": [
            {
                "source_pdf": report.source_pdf,
                "duplicate_of": report.duplicate_of,
                "pages": report.pages,
                "text_chars": report.text_chars,
                "images": report.image_count,
                "claimed": report.item_count_claim,
                "extracted": report.extracted_item_count,
                "warnings": report.warnings,
            }
            for report in reports
        ],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
