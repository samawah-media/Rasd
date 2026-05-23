# دمج Apify كمزود اختياري لاستخراج بيانات TikTok و Instagram

## الهدف
دمج Apify كطبقة استخراج بيانات إضافية في سلسلة الـ metadata pipeline لحل مشاكل TikTok و Instagram الحالية (فشل yt-dlp على Vercel، عناوين عامة، صور placeholder).

## السياق والمشكلة الحالية

### لماذا لا يعمل النظام الحالي؟
1. **yt-dlp على Vercel**: بيئة Vercel serverless لا تدعم `yt-dlp` بشكل موثوق — IP blocking، عدم وجود cookies، timeout قصير
2. **HTML metadata fallback**: TikTok و Instagram يعيدان عناوين عامة ("TikTok - Make Your Day") لأن المحتوى يُحمّل بـ JavaScript
3. **Screenshots عبر Microlink**: صفحات TikTok/Instagram embed تعطي نتائج غير مفيدة (login walls، placeholders)

### لماذا Apify هو الحل المناسب؟
- يشغّل الاستخراج على servers خاصة بهم (لا IP blocking)
- Actors جاهزة ومُحدّثة باستمرار لـ TikTok و Instagram
- يعيد JSON مهيكل: caption, author, thumbnail, stats, publish date
- أخطاء واضحة: `login_required`, `rate_limit`, `private_video`

---

## User Review Required

> [!IMPORTANT]
> **التكلفة**: Apify خدمة مدفوعة. كل استدعاء يستهلك credits. الخطة الحالية تجعله **اختياري** — يعمل فقط إذا وُجد `APIFY_API_TOKEN` في environment variables.

> [!IMPORTANT]
> **اختيار Actors**: سنستخدم actors شائعة ومستقرة. إذا كان لديك actors محددة تفضلها، أخبرني.

---

## سلسلة الاستخراج المحدّثة (Fallback Chain)

```
TikTok/Instagram URL
   │
   ├─ [1] yt-dlp (if available — usually fails on Vercel)
   │
   ├─ [2] Apify (if APIFY_API_TOKEN exists) ← جديد
   │
   ├─ [3] HTML metadata fallback (og:tags)
   │
   └─ [4] url_only warning fallback (Arabic warning)
```

---

## Proposed Changes

### Component 1: Apify Extractor Module (تم توسيعه ودعم الـ Fallback)

#### [MODIFY] [apify-extractor.ts](file:///d:/code%20-%20projects/RASD%20HAKSON/rasd-platform/src/server/apify-extractor.ts)

ملف مسؤول عن التواصل مع Apify REST API يدعم سلسلتي استخراج أساسية وبديلة لتفادي مشاكل الحظر وجلب الكابشن بشكل كامل.

**المحتوى:**
- `isApifyConfigured()` — يتحقق من وجود `APIFY_API_TOKEN`
- `extractWithApify(url, platform)` — يستدعي الـ Actors المناسبة ويدير الـ Fallback تلقائيًا للـ TikTok.
- `getApifyHealth()` — يعيد حالة التهيئة للـ health check.
- تحويل نتيجة Apify إلى `ExtractionResult` الموحد.

**الـ Actors المستخدمة والتهيئة (TikTok):**
- **الأساسي (Primary)**: `clockworks/free-tiktok-scraper` (سريع ومجاني).
- **البديل (Fallback)**: `OtzYfK1ndEGdwWFKQ/tiktok-scraper` (أكثر موثوقية للكابشنز عند فشل الأساسي).
- **التحكم عبر المتغيرات:**
  * `APIFY_TIKTOK_PRIMARY_ACTOR`
  * `APIFY_TIKTOK_FALLBACK_ACTOR`
  * `APIFY_TIKTOK_USE_FALLBACK` (افتراضيًا `true`. لو ضُبط على `false` يتم إيقاف تشغيل الـ actor البديل لحفظ الـ credits).

**تحويل البيانات المطور (TikTok Mapper):**
```
Apify response → ExtractionResult
─────────────────────────────────
text/desc/description/content_desc/caption/shareMeta.desc/shareMeta.title → text + title
authorMeta.nickName/author.nickname/author.unique_id/authorName → authorName
authorMeta.uniqueId/author.unique_id/authorMeta.name            → authorHandle
videoMeta.coverUrl/cover/originCover/dynamicCover/thumbnail    → imageUrl
createTimeISO/createTime (Unix numeric supported)               → publishedAt
source                                                           → "apify_metadata"
```

**تحويل البيانات (Instagram):**
```
Apify response → ExtractionResult
─────────────────────────────────
caption/alt/description → text + title
ownerUsername            → authorHandle
ownerFullName           → authorName
displayUrl/imageUrl      → imageUrl
timestamp               → publishedAt
url                     → canonicalUrl
source                  → "apify_metadata"
```

---

### Component 2: تحديث pipeline الاستخراج

#### [MODIFY] [url-metadata.ts](file:///d:/code%20-%20projects/RASD%20HAKSON/rasd-platform/src/server/url-metadata.ts)

**التغييرات:**

1. **إضافة `"apify_metadata"` لـ `source` type** (سطر 17):
```diff
-  source: "x_oembed" | "yt_dlp_metadata" | "html_metadata" | "url_only";
+  source: "x_oembed" | "yt_dlp_metadata" | "apify_metadata" | "html_metadata" | "url_only";
```

2. **إدراج Apify في سلسلة الاستخراج** (بعد yt-dlp، قبل HTML fallback):
```typescript
// Inside fetchUrlMetadata, after yt-dlp attempt:
if (!ytdlpResult.metadata && isApifyConfigured()) {
  const apifyResult = await extractWithApify(url, platform);
  if (apifyResult.metadata) {
    return apifyResult.metadata;
  }
  // Store apify error for warningDetail
}
```

3. **تحديث `warningDetail`** ليشمل أخطاء Apify عند الفشل

---

### Component 3: تحسين Screenshot Resolution

#### [MODIFY] [url-metadata.ts](file:///d:/code%20-%20projects/RASD%20HAKSON/rasd-platform/src/server/url-metadata.ts)

**تحديث `resolveScreenshotUrl`:**

حالياً الـ function تستخدم Microlink لأخذ screenshots من embed URLs. مع Apify، نحصل على `imageUrl` (thumbnail/cover) مباشرة من الـ metadata — وهذا أفضل بكثير.

التدفق المحدّث:
```
1. إذا وُجد metadataImageUrl (من Apify/yt-dlp) → استخدمه كـ preview
2. إذا TikTok وفيه videoId → Microlink embed screenshot (fallback)
3. إذا Instagram وفيه postId → Microlink embed screenshot (fallback)
4. إذا URL عادي → Microlink screenshot
```

> [!TIP]
> عندما يعمل Apify بنجاح، الـ `imageUrl` المُعاد (thumbnail/cover) سيكون أفضل بكثير من أي screenshot. لذلك ترتيب الأولوية سيكون: **metadataImageUrl أولاً**.

**التغيير في `resolveScreenshotUrl`:**
```diff
 export function resolveScreenshotUrl(...) {
+  // Priority 1: Direct image from metadata (Apify/yt-dlp thumbnail)
+  if (metadataImageUrl && isSafePublicHttpUrl(metadataImageUrl)) {
+    return { url: metadataImageUrl, kind: "preview" };
+  }
+
-  if (platform === "TikTok" && url) {
+  // Priority 2: Platform-specific embed screenshots
+  if (platform === "TikTok" && url) {
     ...
```

---

### Component 4: تحديث Health Check

#### [MODIFY] [persistent-store.ts](file:///d:/code%20-%20projects/RASD%20HAKSON/rasd-platform/src/server/persistent-store.ts)

**إضافة حالة Apify في `buildAutomationHealth`:**
```typescript
// In the health response:
apify: {
  configured: isApifyConfigured(),
  status: isApifyConfigured() ? "healthy" : "not_configured",
  message: isApifyConfigured()
    ? "Apify is configured for TikTok/Instagram metadata extraction."
    : "APIFY_API_TOKEN not set. Apify extraction disabled.",
},
```

**إضافة في connectors:**
```diff
 connectors: {
   ...
+  apify_social_media: isApifyConfigured() ? "healthy" : "not_configured",
 },
```

---

### Component 5: Environment Variables

#### [MODIFY] [.env.example](file:///d:/code%20-%20projects/RASD%20HAKSON/rasd-platform/.env.example)

```diff
+# Apify (optional) — enables better TikTok/Instagram metadata extraction
+APIFY_API_TOKEN=
```

#### إضافة في Vercel:
```
APIFY_API_TOKEN=your_apify_api_token_here
```

> [!CAUTION]
> **لا ترفع الـ token في الكود**. أضفه فقط في Vercel Environment Variables.

---

## ملخص الملفات

| الملف | الإجراء | الوصف |
|-------|---------|-------|
| `src/server/apify-extractor.ts` | **جديد** | وحدة Apify: استدعاء actors وتحويل البيانات |
| `src/server/url-metadata.ts` | تعديل | إضافة Apify في pipeline + تحديث source type + تحسين resolveScreenshotUrl |
| `src/server/persistent-store.ts` | تعديل | إضافة Apify health في التشخيص |
| `.env.example` | تعديل | إضافة `APIFY_API_TOKEN` |

---

## Verification Plan

### Automated Tests
```bash
# 1. TypeScript compilation
npx tsc --noEmit

# 2. Build check
npm run build
```

### Manual Verification
1. **إضافة `APIFY_API_TOKEN` في Vercel** → deploy
2. **اختبار TikTok URL**: إدخال رابط فيديو TikTok ← يجب أن يظهر:
   - الكابشن الحقيقي (ليس "TikTok - Make Your Day")
   - اسم المنشئ
   - صورة thumbnail حقيقية
3. **اختبار Instagram URL**: إدخال رابط منشور Instagram ← يجب أن يظهر:
   - النص/الكابشن
   - اسم الحساب
   - صورة المنشور
4. **اختبار بدون Token**: إزالة `APIFY_API_TOKEN` ← يجب أن يرجع للـ fallback chain بدون أخطاء
5. **Health endpoint**: `/api/admin/health` يجب أن يظهر حالة Apify (configured/not_configured)
