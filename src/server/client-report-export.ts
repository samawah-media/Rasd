import type { ClientReportData, ClientReportItem } from "@/lib/client-report-data";

export const clientReportExportLimit = 160;

type ExportResult =
  | {
      ok: true;
      html: string;
      count: number;
      maxItems: number;
    }
  | {
      ok: false;
      error: "export_item_limit_exceeded" | "export_no_items";
      count: number;
      maxItems: number;
    };

export function buildClientReportExportHtml(data: ClientReportData, itemIds: string[]): ExportResult {
  const selectedIds = new Set(itemIds.filter(Boolean));
  const selectedItems = selectedIds.size ? data.items.filter((item) => selectedIds.has(item.id)) : data.items;

  if (!selectedItems.length) {
    return { ok: false, error: "export_no_items", count: 0, maxItems: clientReportExportLimit };
  }

  if (selectedItems.length > clientReportExportLimit) {
    return {
      ok: false,
      error: "export_item_limit_exceeded",
      count: selectedItems.length,
      maxItems: clientReportExportLimit,
    };
  }

  const orderedItems = sortItemsForLegacyExport(selectedItems);

  return {
    ok: true,
    count: selectedItems.length,
    maxItems: clientReportExportLimit,
    html: `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="robots" content="noindex" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>رصد هداية هاكاثون</title>
  <style>
    * { box-sizing: border-box; }
    @page { size: 16in 9in; margin: 0; }
    :root {
      --export-page-width: 16in;
      --export-page-height: 9in;
    }
    html { background: #141a16; }
    body {
      margin: 0;
      background: #141a16;
      color: #111816;
      font-family: "Segoe UI", Tahoma, Arial, sans-serif;
    }
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 5;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      padding: 12px 18px;
      border-bottom: 1px solid rgba(255,255,255,0.12);
      background: rgba(20, 26, 22, 0.94);
      color: #fff;
      backdrop-filter: blur(12px);
    }
    .toolbar-title { display: grid; gap: 2px; }
    .toolbar strong { font-size: 16px; }
    .toolbar span { color: #d9e2dc; font-size: 12px; }
    .toolbar-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .print-options {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      color: #d9e2dc;
      font-size: 12px;
    }
    .print-options b { color: #fff; font-size: 12px; }
    .print-options span {
      border: 1px solid rgba(255,255,255,0.16);
      border-radius: 999px;
      color: #e5ece7;
      line-height: 1;
      padding: 7px 9px;
    }
    .print {
      border: 0;
      border-radius: 8px;
      background: #c0912d;
      color: #111816;
      cursor: pointer;
      font-weight: 800;
      min-height: 38px;
      padding: 0 16px;
    }
    .document {
      display: grid;
      gap: 18px;
      justify-items: center;
      overflow-x: auto;
      padding: 24px;
    }
    .page {
      position: relative;
      width: 1280px;
      height: 720px;
      overflow: hidden;
      background: #fff;
      flex: none;
      box-shadow: 0 18px 54px rgba(0,0,0,0.28);
    }
    .page > img {
      display: block;
      width: 100%;
      height: 100%;
      image-orientation: none;
      object-fit: fill;
    }
    .generated-page {
      display: grid;
      grid-template-columns: 79% 21%;
      grid-template-areas: "main rail";
      direction: ltr;
    }
    .generated-main {
      grid-area: main;
      display: grid;
      grid-template-columns: 43% 57%;
      grid-template-rows: 18% 64% 18%;
      border-block: 2px solid #111;
      align-self: center;
      width: 86%;
      height: 73%;
      margin-left: 7%;
      direction: ltr;
    }
    .generated-rail {
      grid-area: rail;
      display: grid;
      align-content: start;
      gap: 22px;
      padding: 102px 13% 0;
      background: #183d2a;
      color: #f5f8f4;
      clip-path: polygon(18% 0, 100% 0, 100% 100%, 18% 100%, 0 50%);
      border-inline-start: 5px solid #c0912d;
      direction: rtl;
    }
    .generated-weekday { font-size: clamp(24px, 3.8vw, 48px); font-weight: 700; text-align: center; }
    .date-cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .date-card { border: 2px solid rgba(255,255,255,0.76); border-radius: 7px; padding: 7px 4px; text-align: center; }
    .date-card small { display: block; color: rgba(255,255,255,0.7); font-size: clamp(9px, 1vw, 14px); }
    .date-card b { display: block; font-size: clamp(20px, 3vw, 38px); }
    .platform-card { display: grid; place-items: center; gap: 10px; min-height: 110px; border-radius: 6px; background: #eff0f1; color: #222; text-align: center; }
    .platform-symbol { font-size: clamp(34px, 5vw, 70px); line-height: 1; }
    .source-pane {
      grid-column: 1;
      grid-row: 1 / 4;
      border-right: 2px solid #111;
      display: grid;
      grid-template-rows: 18% 64% 18%;
      min-width: 0;
      position: relative;
      direction: rtl;
    }
    .source-mark {
      position: relative;
      border-bottom: 2px solid #111;
    }
    .source-link-icon {
      position: absolute;
      left: 50px;
      top: 18px;
      width: 92px;
      height: 72px;
    }
    .source-link-ring {
      position: absolute;
      width: 31px;
      height: 17px;
      border: 6px solid #111;
      border-radius: 999px;
      transform: rotate(-35deg);
    }
    .source-link-ring-a { left: 15px; top: 5px; }
    .source-link-ring-b { left: 36px; top: 20px; }
    .source-link-spark {
      position: absolute;
      width: 6px;
      height: 18px;
      border-radius: 999px;
      background: #111;
      transform-origin: center bottom;
    }
    .source-link-spark-a { left: 26px; top: -11px; transform: rotate(-42deg); }
    .source-link-spark-b { left: 42px; top: -14px; transform: rotate(-9deg); height: 16px; }
    .source-link-spark-c { left: 57px; top: -7px; transform: rotate(34deg); height: 14px; }
    .source-link-cursor {
      position: absolute;
      left: 44px;
      top: 37px;
      width: 0;
      height: 0;
      border-top: 13px solid transparent;
      border-bottom: 13px solid transparent;
      border-left: 29px solid #111;
      transform: rotate(39deg);
      transform-origin: 9px 13px;
    }
    .source-link-cursor::after {
      content: "";
      position: absolute;
      left: -7px;
      top: 7px;
      width: 12px;
      height: 29px;
      background: #111;
      transform: rotate(-22deg);
    }
    .source-image { display: grid; place-items: center; padding: 18px; }
    .source-image img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .source-note {
      position: absolute;
      left: 10px;
      bottom: 28px;
      max-height: 230px;
      overflow: hidden;
      writing-mode: vertical-rl;
      color: #c8cbc8;
      font-size: clamp(9px, 0.82vw, 13px);
      line-height: 1.4;
    }
    .meta-head {
      grid-column: 2;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 22px;
      border-bottom: 2px solid #111;
      padding: 0 28px;
      text-align: center;
      direction: rtl;
    }
    .meta-head small { display: block; color: #2f7c60; font-size: clamp(9px, 1vw, 15px); margin-bottom: 4px; }
    .meta-head b { font-size: clamp(18px, 2.2vw, 34px); font-weight: 500; }
    .author-avatar {
      width: 74px;
      height: 74px;
      object-fit: cover;
    }
    .summary {
      grid-column: 2;
      display: grid;
      align-content: start;
      padding: 28px 42px;
      text-align: center;
      direction: rtl;
      overflow: hidden;
    }
    .summary h2 { color: #2f7c60; font-size: clamp(14px, 1.4vw, 23px); font-weight: 500; margin: 0 0 18px; }
    .summary p { font-size: clamp(15px, 1.52vw, 24px); line-height: 1.58; margin: 0; }
    .summary p.long { font-size: clamp(13px, 1.25vw, 20px); line-height: 1.5; }
    .summary p.xlong { font-size: clamp(12px, 1.1vw, 18px); line-height: 1.45; }
    .sentiment {
      grid-column: 2;
      display: flex;
      align-items: center;
      justify-content: end;
      gap: 20px;
      border-top: 2px solid #111;
      padding: 0 32px;
      color: #2f7c60;
      font-size: clamp(14px, 1.5vw, 24px);
      direction: rtl;
    }
    .faces { display: flex; gap: 14px; color: #111; }
    .face { display: inline-grid; place-items: center; min-width: 64px; border: 2px solid #111; border-radius: 999px; padding: 4px 12px; background: #f2f2f2; font-weight: 700; }
    .face.active { background: #8bc8b1; }
    @media print {
      html, body { background: #fff; }
      .print { display: none; }
      .toolbar { display: none; }
      .document { display: block; padding: 0; }
      .page {
        width: var(--export-page-width);
        height: var(--export-page-height);
        margin: 0;
        box-shadow: none;
        break-after: page;
        page-break-after: always;
      }
      .page:last-child { break-after: auto; page-break-after: auto; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="toolbar-title">
      <strong>رصد هداية هاكاثون</strong>
      <span>${selectedItems.length.toLocaleString("ar-SA")} صفحة بتصميم التقرير الأصلي</span>
    </div>
    <div class="toolbar-actions">
      <div class="print-options" aria-label="خيارات طباعة التقرير">
        <b>خيارات الطباعة</b>
        <span>Save as PDF</span>
        <span>Landscape</span>
        <span>Margins: None</span>
        <span>Scale: 100%</span>
        <span>Background graphics: On</span>
      </div>
      <button class="print" onclick="window.print()">حفظ PDF</button>
    </div>
  </div>
  <main class="document">
    ${orderedItems.map(renderExportPage).join("")}
  </main>
</body>
</html>`,
  };
}

function renderExportPage(item: ClientReportItem) {
  const sourcePageImagePath = item.sourceEvidenceImagePath;
  if (isLegacyReportPageImage(sourcePageImagePath)) {
    return `<section class="page" aria-label="${escapeAttribute(pageLabel(item))}">
      <img src="${escapeAttribute(sourcePageImagePath)}" alt="${escapeAttribute(pageLabel(item))}" />
    </section>`;
  }

  return renderGeneratedTemplatePage(item);
}

function isLegacyReportPageImage(path: string | null): path is string {
  return Boolean(path?.startsWith("/imports/legacy-pages/"));
}

function sortItemsForLegacyExport(items: ClientReportItem[]) {
  return [...items].sort((a, b) => {
    const aIssue = a.reportIssue ?? Number.MAX_SAFE_INTEGER;
    const bIssue = b.reportIssue ?? Number.MAX_SAFE_INTEGER;
    if (aIssue !== bIssue) return aIssue - bIssue;
    if (a.page !== b.page) return a.page - b.page;
    const aDate = a.publishDateIso ?? a.captureDateIso ?? "9999-99-99";
    const bDate = b.publishDateIso ?? b.captureDateIso ?? "9999-99-99";
    return aDate.localeCompare(bDate);
  });
}

function renderGeneratedTemplatePage(item: ClientReportItem) {
  const imagePath =
    item.contentImagePath ??
    item.evidenceImagePath ??
    (isLegacyReportPageImage(item.sourceEvidenceImagePath) ? null : item.sourceEvidenceImagePath);
  const dateParts = reportDateParts(item.publishDateIso);
  return `<section class="page generated-page" aria-label="${escapeAttribute(pageLabel(item))}">
    <aside class="generated-rail">
      <div class="generated-weekday">${escapeHtml(dateParts.weekday)}</div>
      <div class="date-cards">
        <div class="date-card"><small>${escapeHtml(dateParts.gregorianMonth)}</small><b>${escapeHtml(dateParts.gregorianDay)}</b></div>
        <div class="date-card"><small>${escapeHtml(dateParts.hijriMonth)}</small><b>${escapeHtml(dateParts.hijriDay)}</b></div>
      </div>
      <div class="platform-card">
        <div class="platform-symbol">${escapeHtml(platformSymbol(item.platform))}</div>
        <div>${escapeHtml(item.platformLabel)}</div>
      </div>
    </aside>
    <div class="generated-main">
      <div class="source-pane">
        <div class="source-mark" aria-hidden="true">
          <span class="source-link-icon">
            <span class="source-link-ring source-link-ring-a"></span>
            <span class="source-link-ring source-link-ring-b"></span>
            <span class="source-link-spark source-link-spark-a"></span>
            <span class="source-link-spark source-link-spark-b"></span>
            <span class="source-link-spark source-link-spark-c"></span>
            <span class="source-link-cursor"></span>
          </span>
        </div>
        <div class="source-image">${imagePath ? `<img src="${escapeAttribute(imagePath)}" alt="صورة المحتوى" />` : ""}</div>
        <div class="source-note">تم التقاط هذه الصورة بتاريخ ${escapeHtml(compactDate(item.captureDateLabel))}</div>
      </div>
      <header class="meta-head">
        <div><small>الكاتب</small><b>${escapeHtml(item.authorName || item.sourceName)}</b></div>
        ${renderAuthorAvatar(item)}
      </header>
      <div class="summary">
        <h2>المحتوى / الملخص</h2>
        <p class="${summaryTextClass(item.summary || item.title)}">${escapeHtml(item.summary || item.title)}</p>
      </div>
      <footer class="sentiment">
        <span>تصنيف المحتوى</span>
        <div class="faces">
          <span class="face${item.sentiment === "negative" ? " active" : ""}">☹</span>
          <span class="face${item.sentiment === "neutral" ? " active" : ""}">•</span>
          <span class="face${item.sentiment === "positive" ? " active" : ""}">✓</span>
        </div>
      </footer>
    </div>
  </section>`;
}

function renderAuthorAvatar(item: ClientReportItem) {
  if (!item.publisherProfileImagePath) return "";
  return `<img class="author-avatar" src="${escapeAttribute(item.publisherProfileImagePath)}" alt="${escapeAttribute(
    item.authorName || item.sourceName,
  )}" />`;
}

function summaryTextClass(value: string) {
  if (value.length > 190) return "xlong";
  if (value.length > 120) return "long";
  return "";
}

function pageLabel(item: ClientReportItem) {
  return `${item.reportLabel} - صفحة ${item.page.toLocaleString("ar-SA")} - ${item.authorName || item.sourceName}`;
}

function compactDate(label: string) {
  return label.split("·")[0]?.trim() ?? label;
}

function reportDateParts(iso: string | null) {
  if (!iso) {
    return {
      weekday: "غير محدد",
      gregorianDay: "--",
      gregorianMonth: "ميلادي",
      hijriDay: "--",
      hijriMonth: "هجري",
    };
  }

  const date = new Date(iso);
  const gregorian = new Intl.DateTimeFormat("ar-SA", {
    day: "2-digit",
    month: "long",
    calendar: "gregory",
  }).formatToParts(date);
  const hijri = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
    day: "2-digit",
    month: "long",
  }).formatToParts(date);

  return {
    weekday: new Intl.DateTimeFormat("ar-SA", { weekday: "long", calendar: "gregory" }).format(date),
    gregorianDay: partValue(gregorian, "day"),
    gregorianMonth: partValue(gregorian, "month"),
    hijriDay: partValue(hijri, "day"),
    hijriMonth: partValue(hijri, "month"),
  };
}

function partValue(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return parts.find((part) => part.type === type)?.value ?? "";
}

function platformSymbol(platform: string) {
  if (platform === "X") return "𝕏";
  if (platform === "YouTube") return "▶";
  if (platform === "TikTok") return "♪";
  if (platform === "Instagram") return "◎";
  return "⌁";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
