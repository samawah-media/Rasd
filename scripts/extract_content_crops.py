#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from PIL import Image, ImageOps


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = PROJECT_ROOT / "data" / "imports" / "hidayathon_reports.json"
DEFAULT_SAMPLE_OUTPUT_DIR = PROJECT_ROOT / "public" / "imports" / "legacy-content-crops" / "sample"
DEFAULT_FULL_OUTPUT_DIR = PROJECT_ROOT / "public" / "imports" / "legacy-content-crops" / "full"


@dataclass(frozen=True)
class SampleGroup:
    key: str
    label: str
    count: int
    matches: Callable[["LegacyItem"], bool]


@dataclass(frozen=True)
class LegacyItem:
    id: str
    source_pdf: str
    report_issue: int | None
    page: int
    platform: str
    original_url: str
    source_evidence_image_path: str
    title: str
    publisher_username: str
    sentiment: str
    item_index: int


def public_path_to_file(path: str) -> Path:
    return PROJECT_ROOT / "public" / path.lstrip("/")


def file_to_public_path(path: Path) -> str:
    public_root = PROJECT_ROOT / "public"
    try:
        return "/" + path.resolve().relative_to(public_root.resolve()).as_posix()
    except ValueError:
        return path.resolve().as_posix()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def slugify(value: str) -> str:
    value = value.lower().strip()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return re.sub(r"-{2,}", "-", value).strip("-") or "item"


def load_legacy_items(input_path: Path) -> list[LegacyItem]:
    data = json.loads(input_path.read_text(encoding="utf-8"))
    items: list[LegacyItem] = []

    for report in data.get("reports", []):
        if report.get("duplicate_of"):
            continue

        for index, item in enumerate(report.get("items") or []):
            original_url = (item.get("original_url") or "").strip()
            evidence_path = (item.get("evidence_image_path") or "").strip()
            if not original_url.startswith(("http://", "https://")) or not evidence_path:
                continue

            item_id = "::".join(
                [
                    report.get("source_pdf") or "",
                    str(report.get("issue") if report.get("issue") is not None else "dashboard"),
                    str(item.get("page") or ""),
                    item.get("platform") or "",
                    item.get("author_name") or "unknown",
                    str(index),
                ],
            )

            items.append(
                LegacyItem(
                    id=item_id,
                    source_pdf=report.get("source_pdf") or "",
                    report_issue=report.get("issue"),
                    page=int(item.get("page") or 0),
                    platform=item.get("platform") or "Unknown",
                    original_url=original_url,
                    source_evidence_image_path=evidence_path,
                    title=(item.get("title") or "").strip(),
                    publisher_username=(item.get("author_name") or "unknown").strip(),
                    sentiment=(item.get("sentiment") or "neutral").strip(),
                    item_index=index,
                ),
            )

    return items


def pick_diverse(candidates: list[LegacyItem], count: int) -> list[LegacyItem]:
    buckets: dict[int, list[LegacyItem]] = {}
    for item in sorted(candidates, key=lambda entry: (entry.report_issue or 999, entry.page, entry.item_index)):
        buckets.setdefault(item.report_issue or 999, []).append(item)

    picked: list[LegacyItem] = []
    while len(picked) < count:
        changed = False
        for issue in sorted(buckets):
            bucket = buckets[issue]
            if bucket:
                picked.append(bucket.pop(0))
                changed = True
                if len(picked) == count:
                    break
        if not changed:
            break

    return picked


def select_sample(items: list[LegacyItem]) -> list[tuple[str, LegacyItem]]:
    groups = [
        SampleGroup("x", "X posts", 5, lambda item: item.platform == "X"),
        SampleGroup("news_web_official", "News/web/official pages", 3, lambda item: item.platform == "Official"),
        SampleGroup("other", "Other platforms", 2, lambda item: item.platform not in {"X", "Official"}),
    ]

    selected: list[tuple[str, LegacyItem]] = []
    used_ids: set[str] = set()

    for group in groups:
        candidates = [item for item in items if item.id not in used_ids and group.matches(item)]
        picked = pick_diverse(candidates, group.count)
        if len(picked) != group.count:
            raise ValueError(f"Could not select {group.count} items for sample group {group.key}. Found {len(picked)}.")
        for item in picked:
            selected.append((group.key, item))
            used_ids.add(item.id)

    return selected


def content_search_box(width: int, height: int) -> tuple[int, int, int, int]:
    return (
        int(width * 0.08),
        int(height * 0.285),
        int(width * 0.385),
        int(height * 0.865),
    )


def publisher_profile_search_box(width: int, height: int) -> tuple[int, int, int, int]:
    return (
        int(width * 0.36),
        int(height * 0.135),
        int(width * 0.72),
        int(height * 0.29),
    )


def detect_nonwhite_crop_box(
    image: Image.Image,
    search_box: tuple[int, int, int, int],
    *,
    threshold: int,
    min_width_ratio: float,
    min_height_ratio: float,
    min_ink_coverage: float,
) -> tuple[tuple[int, int, int, int], str, str, float]:
    width, height = image.size
    search_left, search_top, search_right, search_bottom = search_box
    region = image.crop((search_left, search_top, search_right, search_bottom)).convert("RGB")
    grayscale = ImageOps.grayscale(region)
    mask = grayscale.point(lambda pixel: 255 if pixel < threshold else 0, mode="1")
    bbox = mask.getbbox()

    if not bbox:
        return (search_left, search_top, search_right, search_bottom), "template", "low", 0

    pixel_count = mask.histogram()[255]
    search_area = max(1, region.width * region.height)
    ink_coverage = pixel_count / search_area
    pad = max(18, int(width * 0.012))
    left = max(search_left, search_left + bbox[0] - pad)
    top = max(search_top, search_top + bbox[1] - pad)
    right = min(search_right, search_left + bbox[2] + pad)
    bottom = min(search_bottom, search_top + bbox[3] + pad)

    crop_width = right - left
    crop_height = bottom - top
    width_ratio = crop_width / width
    height_ratio = crop_height / height

    if width_ratio >= min_width_ratio and height_ratio >= min_height_ratio and ink_coverage >= min_ink_coverage:
        confidence = "high"
    elif width_ratio >= min_width_ratio * 0.7 and height_ratio >= min_height_ratio * 0.7 and ink_coverage >= min_ink_coverage * 0.5:
        confidence = "medium"
    else:
        confidence = "low"

    return (left, top, right, bottom), "auto", confidence, ink_coverage


def detect_content_crop_box(image: Image.Image) -> tuple[tuple[int, int, int, int], str, str, float]:
    return detect_nonwhite_crop_box(
        image,
        content_search_box(*image.size),
        threshold=246,
        min_width_ratio=0.17,
        min_height_ratio=0.26,
        min_ink_coverage=0.012,
    )


def detect_publisher_profile_crop_box(image: Image.Image) -> tuple[tuple[int, int, int, int], str, str, float]:
    return detect_nonwhite_crop_box(
        image,
        publisher_profile_search_box(*image.size),
        threshold=248,
        min_width_ratio=0.16,
        min_height_ratio=0.07,
        min_ink_coverage=0.006,
    )


def crop_item(item: LegacyItem, group_key: str, output_dir: Path, index: int, mode: str) -> dict[str, Any]:
    source_path = public_path_to_file(item.source_evidence_image_path)
    if not source_path.exists():
        raise FileNotFoundError(f"Missing source evidence image: {source_path}")

    with Image.open(source_path) as image:
        image = image.convert("RGB")
        width, height = image.size
        content_crop_box, method, confidence, ink_coverage = detect_content_crop_box(image)
        publisher_crop_box, publisher_method, publisher_confidence, publisher_ink_coverage = detect_publisher_profile_crop_box(image)
        content_crop = image.crop(content_crop_box)
        publisher_crop = image.crop(publisher_crop_box)

        item_hash = hashlib.sha1(item.id.encode("utf-8")).hexdigest()[:8]
        prefix = "sample" if mode == "sample" else "content"
        index_width = 2 if mode == "sample" else 3
        filename = (
            f"{prefix}-{index:0{index_width}d}-{slugify(group_key)}-"
            f"e{item.report_issue or 0:02d}-p{item.page:03d}-{slugify(item.platform)}-{item_hash}.jpg"
        )
        output_path = output_dir / filename
        content_crop.save(output_path, format="JPEG", quality=88, optimize=True, progressive=True)

        publisher_filename = (
            f"publisher-{index:0{index_width}d}-{slugify(group_key)}-"
            f"e{item.report_issue or 0:02d}-p{item.page:03d}-{slugify(item.platform)}-{item_hash}.jpg"
        )
        publisher_output_path = output_dir / publisher_filename
        publisher_crop.save(publisher_output_path, format="JPEG", quality=88, optimize=True, progressive=True)

    crop_width = content_crop_box[2] - content_crop_box[0]
    crop_height = content_crop_box[3] - content_crop_box[1]
    publisher_crop_width = publisher_crop_box[2] - publisher_crop_box[0]
    publisher_crop_height = publisher_crop_box[3] - publisher_crop_box[1]
    notes = "تم قص صورة المحتوى تلقائيًا من لوحة الدليل اليسرى في صفحة التقرير القديمة."
    if confidence == "low":
        notes += " جودة القص منخفضة؛ أبقِ صورة صفحة التقرير الكاملة كمرجع داخلي موثوق."
    if publisher_confidence == "low":
        notes += " جودة قص بروفايل الناشر منخفضة وتحتاج مراجعة قبل استخدامها في الواجهة."

    return {
        "item_id": item.id,
        "sample_group": group_key,
        "platform": item.platform,
        "original_url": item.original_url,
        "source_pdf": item.source_pdf,
        "report_issue": item.report_issue,
        "page": item.page,
        "title": item.title,
        "publisher_username": item.publisher_username,
        "sentiment": item.sentiment,
        "source_evidence_image_path": item.source_evidence_image_path,
        "crop_image_path": file_to_public_path(output_path),
        "crop_method": method,
        "crop_confidence": confidence,
        "crop_box": {
            "left": content_crop_box[0],
            "top": content_crop_box[1],
            "right": content_crop_box[2],
            "bottom": content_crop_box[3],
        },
        "publisher_profile_image_path": file_to_public_path(publisher_output_path),
        "publisher_profile_crop_method": publisher_method,
        "publisher_profile_crop_confidence": publisher_confidence,
        "publisher_profile_crop_box": {
            "left": publisher_crop_box[0],
            "top": publisher_crop_box[1],
            "right": publisher_crop_box[2],
            "bottom": publisher_crop_box[3],
        },
        "source_width": width,
        "source_height": height,
        "crop_width": crop_width,
        "crop_height": crop_height,
        "publisher_profile_crop_width": publisher_crop_width,
        "publisher_profile_crop_height": publisher_crop_height,
        "ink_coverage": round(ink_coverage, 6),
        "publisher_profile_ink_coverage": round(publisher_ink_coverage, 6),
        "source_image_sha256": sha256_file(source_path),
        "crop_sha256": sha256_file(output_path),
        "publisher_profile_sha256": sha256_file(publisher_output_path),
        "fallback_image_path": item.source_evidence_image_path,
        "notes": notes,
    }


def confidence_label(value: str) -> str:
    if value == "high":
        return "عالية"
    if value == "medium":
        return "متوسطة"
    return "منخفضة"


def sentiment_label(value: str) -> str:
    if value == "positive":
        return "إيجابي"
    if value == "negative":
        return "سلبي"
    return "محايد"


def sentiment_class(value: str) -> str:
    if value == "positive":
        return "positive"
    if value == "negative":
        return "negative"
    return "neutral"


def platform_label(value: str) -> str:
    labels = {
        "X": "منصة إكس",
        "Official": "موقع رسمي / خبر",
        "YouTube": "يوتيوب",
        "TikTok": "تيك توك",
        "Unknown": "مصدر غير مصنف",
    }
    return labels.get(value, value)


def write_review_html(manifest: dict[str, Any], output_dir: Path) -> None:
    cards = []
    for entry in manifest["items"]:
        sentiment_value = entry.get("sentiment") or "neutral"
        sentiment_badge_class = html.escape(sentiment_class(sentiment_value))
        cards.append(
            f"""
            <article>
              <header>
                <span>{html.escape(platform_label(entry["platform"]))}</span>
                <span>التقرير {html.escape(str(entry["report_issue"]))} / الصفحة {html.escape(str(entry["page"]))}</span>
              </header>
              <img class="publisher" src="./{Path(entry["publisher_profile_image_path"]).name}" alt="صورة بروفايل الناشر" />
              <img src="./{Path(entry["crop_image_path"]).name}" alt="صورة المحتوى" />
              <div class="badges">
                <span class="badge {sentiment_badge_class}">تصنيف المحتوى: {html.escape(sentiment_label(sentiment_value))}</span>
              </div>
              <p><strong>الناشر:</strong> {html.escape(entry["publisher_username"])}</p>
              <p><strong>المحتوى / الملخص:</strong> {html.escape(entry["title"])}</p>
              <p><a href="{html.escape(entry["original_url"])}">فتح الرابط الأصلي</a></p>
            </article>
            """,
        )

    html_text = f"""<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>عينة صور المحتوى من التقارير القديمة</title>
  <style>
    body {{ margin: 24px; font-family: Arial, sans-serif; background: #f6f7f4; color: #17231c; }}
    main {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }}
    article {{ background: white; border: 1px solid #d8ddd5; border-radius: 8px; padding: 14px; }}
    header {{ display: flex; justify-content: space-between; gap: 10px; margin-bottom: 10px; color: #496154; font-size: 14px; }}
    img {{ width: 100%; height: auto; border: 1px solid #e1e4df; background: white; }}
    img.publisher {{ width: 100%; max-height: 150px; object-fit: contain; margin-bottom: 10px; }}
    .badges {{ display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }}
    .badge {{ border-radius: 999px; padding: 5px 10px; font-size: 13px; font-weight: 700; }}
    .badge.positive {{ background: #e4f7e7; color: #1f6b35; }}
    .badge.neutral {{ background: #fff4cc; color: #886400; }}
    .badge.negative {{ background: #ffe1dc; color: #9a2f20; }}
    h1, h2 {{ margin: 0 0 12px; }}
    p {{ margin: 8px 0; line-height: 1.5; }}
    a {{ color: #0b6b45; font-weight: 700; }}
  </style>
</head>
<body>
  <h1>عينة صور المحتوى</h1>
  <p>هذه عينة محلية للمراجعة قبل تشغيل القص على كل مواد التقارير القديمة. المعروض هنا هو صورة المحتوى وصورة بروفايل الناشر فقط، وليس صفحة التقرير كاملة.</p>
  <main>
    {''.join(cards)}
  </main>
</body>
</html>
"""
    (output_dir / "review.html").write_text(html_text, encoding="utf-8")


def build_manifest(
    items: list[dict[str, Any]],
    input_path: Path,
    output_dir: Path,
    mode: str,
    sample_requirements: dict[str, int] | None = None,
) -> dict[str, Any]:
    group_counts: dict[str, int] = {}
    confidence_counts: dict[str, int] = {}
    for item in items:
        group_counts[item["sample_group"]] = group_counts.get(item["sample_group"], 0) + 1
        confidence_counts[item["crop_confidence"]] = confidence_counts.get(item["crop_confidence"], 0) + 1

    return {
        "schema_version": 1,
        "generated_by": "scripts/extract_content_crops.py",
        "generated_at": f"deterministic-{mode}",
        "mode": mode,
        "input_path": str(input_path.relative_to(PROJECT_ROOT)).replace("\\", "/"),
        "output_dir": file_to_public_path(output_dir),
        "total_items": len(items),
        "sample_requirements": sample_requirements or {},
        "group_counts": group_counts,
        "confidence_counts": confidence_counts,
        "items": items,
    }


def sort_legacy_items(items: list[LegacyItem]) -> list[LegacyItem]:
    return sorted(items, key=lambda item: (item.report_issue or 999, item.page, item.platform, item.publisher_username, item.item_index))


def select_full(items: list[LegacyItem]) -> list[tuple[str, LegacyItem]]:
    return [("all", item) for item in sort_legacy_items(items)]


def run(input_path: Path, output_dir: Path, manifest_name: str, mode: str) -> dict[str, Any]:
    legacy_items = load_legacy_items(input_path)
    sample_requirements: dict[str, int] | None = None
    if mode == "sample":
        selected = select_sample(legacy_items)
        sample_requirements = {
            "x": 5,
            "news_web_official": 3,
            "other": 2,
        }
    else:
        selected = select_full(legacy_items)

    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    crop_entries = [
        crop_item(item, group_key, output_dir, index + 1, mode) for index, (group_key, item) in enumerate(selected)
    ]
    manifest = build_manifest(crop_entries, input_path, output_dir, mode, sample_requirements)
    (output_dir / manifest_name).write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_review_html(manifest, output_dir)
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract deterministic legacy content crops from rendered PDF page images.")
    parser.add_argument("--mode", choices=["sample", "full"], default="sample", help="Generate the review sample or all legacy items.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="Path to hidayathon_reports.json.")
    parser.add_argument("--output-dir", type=Path, default=None, help="Directory for crop images and manifest.")
    parser.add_argument("--manifest-name", default="manifest.json", help="Manifest filename inside the output directory.")
    args = parser.parse_args()

    output_dir = args.output_dir or (DEFAULT_SAMPLE_OUTPUT_DIR if args.mode == "sample" else DEFAULT_FULL_OUTPUT_DIR)
    manifest = run(args.input.resolve(), output_dir.resolve(), args.manifest_name, args.mode)
    print(
        json.dumps(
            {
                "ok": True,
                "output_dir": manifest["output_dir"],
                "total_items": manifest["total_items"],
                "group_counts": manifest["group_counts"],
                "confidence_counts": manifest["confidence_counts"],
            },
            ensure_ascii=False,
        ),
    )


if __name__ == "__main__":
    main()
