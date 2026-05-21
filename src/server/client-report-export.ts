import type { ClientReportData, ClientReportItem } from "@/lib/client-report-data";

export const clientReportExportLimit = 50;

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

  const latest = sortItemsByDate(selectedItems)[0];
  const positivePercent = Math.round(
    (selectedItems.filter((item) => item.sentiment === "positive").length / selectedItems.length) * 100,
  );
  const platforms = distribution(selectedItems, (item) => item.platformLabel)
    .slice(0, 4)
    .map((entry) => `${escapeHtml(entry.label)} (${entry.count.toLocaleString("ar-SA")})`)
    .join("، ");

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
    body {
      margin: 0;
      background: #f6f5ef;
      color: #111816;
      font-family: "Segoe UI", Tahoma, Arial, sans-serif;
      line-height: 1.75;
    }
    main { max-width: 1080px; margin: 0 auto; padding: 32px 24px; }
    header, section, article {
      background: #fff;
      border: 1px solid #dfe3d9;
      border-radius: 8px;
    }
    header { padding: 24px; margin-bottom: 16px; }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 30px; }
    h2 { font-size: 18px; margin-bottom: 12px; }
    .muted { color: #66736d; }
    .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 16px 0; }
    .stat { background: #fbfbf8; border: 1px solid #edf0eb; border-radius: 8px; padding: 14px; }
    .stat b { display: block; font-size: 24px; margin-top: 8px; }
    section { padding: 18px; margin-bottom: 16px; }
    article { display: grid; grid-template-columns: 170px 1fr; gap: 16px; padding: 14px; margin-bottom: 12px; break-inside: avoid; }
    img { max-width: 100%; height: auto; border-radius: 8px; border: 1px solid #edf0eb; background: #f2f4ef; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; }
    .chip { border-radius: 999px; background: #e8f5ef; color: #116a5c; padding: 4px 10px; font-size: 12px; font-weight: 700; }
    a { color: #116a5c; font-weight: 700; }
    .print { position: fixed; left: 20px; top: 20px; border: 0; border-radius: 8px; background: #116a5c; color: #fff; padding: 10px 16px; font-weight: 700; cursor: pointer; }
    @media (max-width: 720px) {
      .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      article { grid-template-columns: 1fr; }
    }
    @media print {
      body { background: #fff; }
      main { padding: 0; max-width: none; }
      .print { display: none; }
      header, section, article { border-color: #d9ded4; }
    }
  </style>
</head>
<body>
  <button class="print" onclick="window.print()">حفظ PDF</button>
  <main>
    <header>
      <p class="muted">تقرير خاص</p>
      <h1>رصد هداية هاكاثون</h1>
      <p class="muted">تم إنشاء النسخة: ${escapeHtml(new Date().toLocaleString("ar-SA"))}</p>
    </header>
    <section>
      <h2>ملخص</h2>
      <div class="stats">
        <div class="stat"><span>المواد</span><b>${selectedItems.length.toLocaleString("ar-SA")}</b></div>
        <div class="stat"><span>التوجه</span><b>😊 ${positivePercent.toLocaleString("ar-SA")}%</b></div>
        <div class="stat"><span>آخر تحديث</span><b>${escapeHtml(compactDate(latest?.publishDateLabel ?? "غير متاح"))}</b></div>
        <div class="stat"><span>المنصات</span><b>${escapeHtml(String(distribution(selectedItems, (item) => item.platform).length))}</b></div>
      </div>
      <p class="muted">${platforms || "لا توجد منصات"}</p>
    </section>
    <section>
      <h2>المواد الظاهرة</h2>
      ${selectedItems.map(renderItem).join("")}
    </section>
  </main>
</body>
</html>`,
  };
}

function renderItem(item: ClientReportItem) {
  const imagePath = item.contentImagePath ?? item.evidenceImagePath;
  return `<article>
    <div>${imagePath ? `<img src="${escapeAttribute(imagePath)}" alt="صورة المحتوى" />` : `<div class="muted">قيد التجهيز</div>`}</div>
    <div>
      <div class="chips">
        <span class="chip">${escapeHtml(item.platformLabel)}</span>
        <span class="chip">${escapeHtml(sentimentDisplay(item.sentimentLabel, item.sentiment))}</span>
      </div>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.summary)}</p>
      <p class="muted">${escapeHtml(item.authorName || item.sourceName)} · ${escapeHtml(compactDate(item.publishDateLabel))}</p>
      ${item.originalUrl ? `<p><a href="${escapeAttribute(item.originalUrl)}">فتح الرابط الأصلي</a></p>` : `<p class="muted">الرابط قيد التجهيز</p>`}
    </div>
  </article>`;
}

function distribution(items: ClientReportItem[], getKey: (item: ClientReportItem) => string) {
  const map = new Map<string, { label: string; count: number }>();
  for (const item of items) {
    const key = getKey(item) || "غير محدد";
    const current = map.get(key) ?? { label: key, count: 0 };
    current.count += 1;
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

function sortItemsByDate(items: ClientReportItem[]) {
  return [...items].sort((a, b) => {
    const aDate = a.publishDateIso ?? a.captureDateIso ?? "";
    const bDate = b.publishDateIso ?? b.captureDateIso ?? "";
    return bDate.localeCompare(aDate);
  });
}

function compactDate(label: string) {
  return label.split("·")[0]?.trim() ?? label;
}

function sentimentDisplay(label: string, sentiment: string) {
  const icon = sentiment === "positive" ? "😊" : sentiment === "negative" ? "☹️" : "😐";
  return `${icon} ${label}`;
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
