import type { MonitoringItem } from "@/lib/types";

export function evidenceCardUrl(itemId: string) {
  return `/api/items/${encodeURIComponent(itemId)}/evidence-card.svg`;
}

export function renderEvidenceCardSvg(item: MonitoringItem) {
  const title = item.title || "مادة مرصودة";
  const author = [item.authorName, item.authorHandle].filter(Boolean).join(" ");
  const source = author || item.sourceName || "مصدر غير محدد";
  const date = formatDate(item.publishedAt);
  const summaryLines = wrapArabic(item.summary || item.summarySourceText || item.originalUrl, 48, 9);
  const titleLines = wrapArabic(title, 42, 2);
  const urlLines = wrapLatin(item.originalUrl, 76, 2);
  
  const isX = item.originalUrl.includes("x.com/") || item.originalUrl.includes("twitter.com/");
  const isTikTok = item.originalUrl.includes("tiktok.com/");
  const isInstagram = item.originalUrl.includes("instagram.com/") || item.originalUrl.includes("instagr.am/");
  const platformIcon = isX ? "X" : isTikTok ? "TikTok" : isInstagram ? "Instagram" : "🌐";

  const isMetadataUnavailable = item.warning === "media_metadata_unavailable";
  const headerGradient = isMetadataUnavailable
    ? `<linearGradient id="header" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#b91c1c"/>
      <stop offset="1" stop-color="#ea580c"/>
    </linearGradient>`
    : `<linearGradient id="header" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#0f8f5f"/>
      <stop offset="1" stop-color="#f5c542"/>
    </linearGradient>`;

  const subBarColor = isMetadataUnavailable ? "#b91c1c" : "#0f8f5f";
  const headerText = isMetadataUnavailable ? "تنبيه: تعذر جلب التفاصيل" : "صورة دليل محتوى";
  const footerText = isMetadataUnavailable ? "تنبيه: لم يتم التقاط لقطة حقيقية للمنشور" : "صورة دليل — ليست لقطة شاشة حقيقية";
  const footerColor = isMetadataUnavailable ? "#b91c1c" : "#a8a29e";
  const footerWeight = isMetadataUnavailable ? "bold" : "normal";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="720" viewBox="0 0 900 720" role="img" aria-label="${escapeXml(
    title,
  )}">
  <defs>
    ${headerGradient}
    <filter id="softShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#0f172a" flood-opacity="0.14"/>
    </filter>
  </defs>
  <rect width="900" height="720" fill="#f6f7f1"/>
  <rect x="54" y="46" width="792" height="628" rx="22" fill="#ffffff" filter="url(#softShadow)"/>
  <rect x="54" y="46" width="792" height="88" rx="22" fill="url(#header)"/>
  <rect x="54" y="100" width="792" height="34" fill="${subBarColor}"/>
  <text x="806" y="100" direction="rtl" unicode-bidi="plaintext" text-anchor="start" fill="#ffffff" font-size="28" font-weight="700" font-family="Arial, Tahoma, sans-serif">${escapeXml(headerText)}</text>
  <text x="806" y="174" direction="rtl" unicode-bidi="plaintext" text-anchor="start" fill="#166534" font-size="24" font-weight="700" font-family="Arial, Tahoma, sans-serif">${escapeXml(
    source,
  )}</text>
  <text x="806" y="210" direction="rtl" unicode-bidi="plaintext" text-anchor="start" fill="#78716c" font-size="18" font-family="Arial, Tahoma, sans-serif">${escapeXml(
    date,
  )}</text>
  <circle cx="108" cy="178" r="38" fill="#ecfdf5" stroke="#34d399" stroke-width="3"/>
  <text x="108" y="190" text-anchor="middle" fill="#047857" font-size="${platformIcon.length > 3 ? "18" : "30"}" font-weight="700" font-family="Arial, Tahoma, sans-serif">${escapeXml(platformIcon)}</text>
  <line x1="94" x2="806" y1="238" y2="238" stroke="#e7e5e4" stroke-width="2"/>
  ${titleLines
    .map(
      (line, index) =>
        `<text x="806" y="${286 + index * 38}" direction="rtl" unicode-bidi="plaintext" text-anchor="start" fill="#1c1917" font-size="30" font-weight="700" font-family="Arial, Tahoma, sans-serif">${escapeXml(
          line,
        )}</text>`,
    )
    .join("\n  ")}
  ${summaryLines
    .map(
      (line, index) =>
        `<text x="806" y="${380 + index * 31}" direction="rtl" unicode-bidi="plaintext" text-anchor="start" fill="#44403c" font-size="23" font-family="Arial, Tahoma, sans-serif">${escapeXml(
          line,
        )}</text>`,
    )
    .join("\n  ")}
  <rect x="84" y="590" width="732" height="54" rx="12" fill="#fafaf9" stroke="#e7e5e4"/>
  ${urlLines
    .map(
      (line, index) =>
        `<text x="112" y="${614 + index * 20}" text-anchor="start" fill="#57534e" font-size="15" font-family="Arial, Tahoma, sans-serif">${escapeXml(
          line,
        )}</text>`,
    )
    .join("\n  ")}
  <text x="450" y="694" text-anchor="middle" fill="${footerColor}" font-size="14" font-weight="${footerWeight}" font-family="Arial, Tahoma, sans-serif">${escapeXml(footerText)}</text>
</svg>`;
}

function wrapArabic(value: string, maxChars: number, maxLines: number) {
  const words = normalizeWhitespace(value).split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
    if (lines.length === maxLines) break;
  }

  if (current && lines.length < maxLines) lines.push(current);
  return clipLast(lines, maxLines);
}

function wrapLatin(value: string, maxChars: number, maxLines: number) {
  const chunks: string[] = [];
  for (let index = 0; index < value.length && chunks.length < maxLines; index += maxChars) {
    chunks.push(value.slice(index, index + maxChars));
  }
  return clipLast(chunks, maxLines);
}

function clipLast(lines: string[], maxLines: number) {
  if (lines.length <= maxLines) return lines;
  const next = lines.slice(0, maxLines);
  next[maxLines - 1] = `${next[maxLines - 1].slice(0, -1).trim()}…`;
  return next;
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/gu, " ").trim();
}

function formatDate(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value || "تاريخ غير محدد";
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(timestamp));
}

function escapeXml(value: string) {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}
