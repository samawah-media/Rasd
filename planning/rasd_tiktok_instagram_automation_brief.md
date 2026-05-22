# RASD Platform — خطة تفصيلية للرصد المؤتمت من TikTok وInstagram

**تاريخ الإعداد:** 2026-05-22
**اللغة:** العربية
**الغرض:** تسليم هذا الملف إلى الوكيل/المهندس ليبدأ التدقيق، بناء الخطة، ثم التنفيذ.
**الهدف الأساسي:** تحويل RASD إلى منصة رصد مؤتمتة تغطي TikTok وInstagram عبر 3 مستويات: إدخال/إثراء روابط، رصد watchlists، ثم رصد شبه لحظي/تشغيلي قابل للتوسع.

---

## 1. ملخص تنفيذي

منصة RASD قطعت شوطًا كبيرًا بالفعل. الموجود الآن ليس مجرد واجهة، بل نواة منصة رصد: Dashboard عربي، صفحة رصد حي، تقرير عميل تفاعلي، صفحة تشغيل API، Hono API، Supabase schema، دورة review/capture/report، وبيانات legacy مستوردة وقابلة للمراجعة. لذلك التحدي الحالي ليس إعادة بناء المنصة، بل إضافة طبقة **Connectors** مؤتمتة تغذي `monitoring_items` بدل الاعتماد على الإدخال اليدوي فقط.

الاقتراح الأساسي:

```txt
source_rules
→ scheduled connector jobs
→ platform connector: TikTok / Instagram / RSS / Web / X
→ normalize
→ dedupe
→ relevance scoring
→ needs_review
→ capture
→ report_ready
→ client_report
```

الأولوية هي TikTok وInstagram، لكن يجب ألا يتم التعامل معهما بنفس الطريقة:

- **TikTok**: أفضل مسار رسمي هو TikTok Research API عند توفر الوصول. يمكن إضافة TikTok-Api كـ lab/fallback فقط، لا كعمود إنتاجي يعتمد عليه العملاء.
- **Instagram**: أفضل بداية عملية هي watchlists لحسابات محددة + URL hydration. الرصد المفتوح لكل Instagram أو لكل hashtags غير مستقر قانونيًا/تقنيًا. يمكن استخدام Instaloader للـ POC، وMeta/Instagram APIs للحالات الرسمية أو الحسابات المملوكة/المصرّح بها حيث تغطي الحالة.
- **yt-dlp + Playwright**: طبقة أساسية لإثراء الروابط والتقاط الأدلة بعد اكتشاف الرابط، وليس بديلًا لمحرك discovery.

النظام المقترح سيكون مؤتمتًا، لكن مع **مراجعة بشرية اختيارية** قبل النشر في البداية، ثم يمكن لاحقًا جعل مصادر معينة publish تلقائيًا إذا أصبحت موثوقة.

---

## 2. السياق الحالي في RASD

### 2.1 ما هو موجود بالفعل

حسب README الحالي، RASD تحتوي على:

- Dashboard عربي RTL.
- صفحة رصد حي `/feed`.
- صفحة تقرير عميل تفاعلية `/client-report`.
- صفحة مراجعة واستيراد `/imports`.
- صفحة backfill للروابط `/imports/backfill`.
- صفحة تشغيل API `/ops`.
- Hono API لمسار الإدخال، المراجعة، الالتقاط، وروابط المشاركة.
- Supabase schema مع multi-tenancy وRLS-first.
- اختبارات workflow وAPI وschema وguardrails.
- مسار يدوي: `manual URL -> review -> capture -> report-ready -> client report`.

هذا يعني أن المنصة جاهزة لاستقبال مواد جديدة إذا وفرنا لها Connectors موحدة.

### 2.2 الحزمة التقنية الحالية

`package.json` يحتوي على stack مناسب جدًا:

- Next.js + React.
- TypeScript.
- Hono.
- Supabase.
- `rss-parser` للرصد من RSS.
- `jsdom` و`@mozilla/readability` لاستخراج محتوى صفحات الويب.
- اختبارات عبر `tsx --test`.

هذه المكتبات تساعد مباشرة في رصد المواقع وRSS، وفي بناء طبقة ingestion/normalization.

### 2.3 قاعدة البيانات الحالية

`supabase/schema.sql` يحتوي على عناصر مهمة جدًا:

- `sources` لتسجيل المصادر.
- `source_rules` لقواعد الرصد.
- `keyword_rules` لقواعد الكلمات.
- `api_credentials` لتخزين بيانات الاعتماد.
- `usage_limits` و`usage_events`.
- `connector_runs` لتسجيل تشغيل connector.
- `jobs` كجدول queue عام.
- `monitoring_items` كمكان موحد لكل المواد.
- uniqueness مهم على:
  - `(organization_id, source_type, source_item_id)`
  - `(organization_id, canonical_url_hash)`
  - `(organization_id, external_id)`

لكن `source_type` الحالي لا يحتوي TikTok أو Instagram. الموجود حاليًا:

```sql
'manual_url',
'rss',
'web_page',
'x_oembed',
'x_recent_search',
'x_filtered_stream'
```

هذا ممتاز كبداية، لكنه يحتاج توسيعًا.

---

## 3. الهدف المطلوب من الوكيل

بناء طبقة رصد مؤتمتة لـ RASD تغطي 3 مستويات، مع التركيز الأساسي على TikTok وInstagram:

1. **المستوى الأول — URL Hydration + Capture**
   أي رابط TikTok/Instagram يدخل يدويًا أو يأتي من مصدر خارجي يتم إثراؤه تلقائيًا، حفظه، التقاط evidence، ثم عرضه للمراجعة.

2. **المستوى الثاني — Automated Watchlist Monitoring**
   النظام يرصد تلقائيًا حسابات محددة، hashtags أو keywords حيث يتوفر الوصول، وقواعد منظمة في `source_rules`.

3. **المستوى الثالث — Near Real-time / Production Monitoring**
   تشغيل دوري كثيف، queue، retries، rate limits، observability، مؤشرات صحة، وسيناريوهات fallback.

الوكيل حر في التدقيق والمراجعة وتعديل الخطة حسب ما يجده في الكود الحالي، لكن يجب الحفاظ على المبادئ التالية:

- لا تعيد بناء منصة جديدة.
- لا تخلط منطق TikTok/Instagram داخل `manual_url` فقط.
- ابنِ Connectors موحدة خلف interface واحد.
- حافظ على review workflow الحالي.
- اجعل scraping غير الرسمي محدودًا وموسومًا كـ `lab` أو `fallback`.
- لا تبنِ أي شيء يعتمد على تجاوز Captcha، سرقة sessions، حسابات وهمية، أو أساليب مخالفة للأمان.

---

## 4. تعريفات مهمة قبل التنفيذ

### 4.1 Discovery

اكتشاف مواد جديدة لم تكن معروفة من قبل.

أمثلة:

- Query في TikTok Research API عن keyword أو hashtag.
- رصد حساب TikTok محدد لاستخراج الفيديوهات الجديدة.
- رصد حساب Instagram محدد لاستخراج posts/reels جديدة.
- قراءة RSS feed.
- البحث في صفحات ويب أو أخبار.

### 4.2 Hydration

إثراء رابط معروف مسبقًا.

أمثلة:

- لدينا رابط TikTok ونريد metadata: العنوان، الوصف، الناشر، التاريخ، thumbnail، stats إن توفرت.
- لدينا رابط Instagram post/reel ونريد caption، author، date، media thumbnail.

### 4.3 Capture

تسجيل دليل بصري أو أرشيفي صالح للتقرير.

أمثلة:

- screenshot عبر Playwright.
- صورة preview.
- HTML archive.
- video thumbnail أو media asset إن كان قانونيًا ومسموحًا.

### 4.4 Review

مراجعة بشرية أو آلية قبل الاعتماد.

الاقتراح في البداية:

- الرصد والاستخراج: مؤتمت.
- تقييم الصلة: مؤتمت.
- النشر النهائي: مراجعة بشرية.

### 4.5 Publication

إضافة المادة إلى تقرير العميل أو جعلها visible في `/client-report`.

---

## 5. الأدوات والمكتبات المقترحة

### 5.1 TikTok Research API — المسار الرسمي المفضل

الاستخدام المقترح:

- Discovery رسمي من TikTok.
- Queries حسب:
  - `keyword`
  - `username`
  - `hashtag_name`
  - `region_code`
  - `video_id`
  - `music_id`
  - `effect_id`
  - `video_length`
- Pagination عبر `cursor` و`search_id`.
- `max_count` حتى 100 حسب وثائق TikTok.

ملاحظات:

- يتطلب approval/client credentials.
- قد تكون هناك حدود وصول، قيود بحث، أو نقص بيانات في بعض الحالات.
- يجب التعامل معه كأفضل مصدر رسمي، لكن ليس كمصدر كامل 100%.

استخدامه في RASD:

```txt
source_type = 'tiktok_research'
source_rules.query = JSON query أو string query
source_rules.cursor = { cursor, search_id, last_start_date, last_end_date }
```

### 5.2 TikTok-Api — POC/Lab/Fallback فقط

Repo: `davidteather/TikTok-Api`
النوع: Python, unofficial.

مناسب لـ:

- تجارب أولية.
- Trending أو user videos عند الإمكان.
- مقارنة نتائج مع Research API.
- lab connector داخلي غير موعود به تجاريًا.

غير مناسب كاعتماد إنتاجي وحيد، لأنه:

- غير رسمي.
- TikTok قد يغير الموقع أو يمنع الطلبات.
- قد يحتاج cookies/ms_token أو Playwright.
- يمكن أن يفشل بسبب anti-bot.

### 5.3 Instaloader — Instagram Watchlist POC

Repo: `instaloader/instaloader`
النوع: Python CLI/Library.

مناسب لـ:

- رصد حسابات Instagram محددة.
- تحميل/قراءة posts/reels من public profiles قدر الإمكان.
- استخدام `--fast-update` أو `--latest-stamps` لتحديث watchlist بدون إعادة سحب كل شيء.
- POC سريع لاستخراج metadata/captions.

قيوده:

- غير رسمي وغير تابع لـ Instagram.
- استخدامه على مسؤوليتنا.
- قد يتأثر بقيود Instagram أو login/session.
- لا تبنِ عليه وعد “رصد Instagram بالكامل”.

### 5.4 instagrapi — Testing/Internal فقط

Repo: `subzeroid/instagrapi`
النوع: Instagram private/public API wrapper.

مناسب فقط لـ:

- اختبار داخلي منضبط.
- حسابات مملوكة/مصرح بها.
- حالات تحتاج login session تحت سيطرة الفريق.

لا يُنصح به كأساس production عام، لأن private API automation fragile، ويتأثر بـ rate limits، device trust، challenges، proxies، وتغييرات المنصة.

### 5.5 yt-dlp — Hydration للروابط

Repo: `yt-dlp/yt-dlp`
النوع: CLI/Python.

مناسب جدًا لـ:

- استخراج metadata من URL موجود.
- `--dump-json` بدون تنزيل media.
- TikTok/Instagram/YouTube وغيرها حسب دعم extractors.
- ربطه بمسار manual URL الحالي.

استخدام مقترح:

```bash
yt-dlp --dump-json --no-playlist --skip-download "<url>"
```

في RASD يجب أن يكون `yt-dlp` ضمن `hydration` وليس ضمن discovery.

### 5.6 Playwright — Capture وسلامة الواجهة

Repo: `microsoft/playwright`
النوع: Node/Python/.NET/Java.

مناسب لـ:

- screenshots.
- preview capture.
- اختبار صفحات `/feed`, `/ops`, `/client-report`.
- fallback للـ metadata البسيطة عند فشل أدوات أخرى، دون تجاوز حواجز المنصات.

### 5.7 RSS + Web extraction

موجود في RASD بالفعل:

- `rss-parser`
- `jsdom`
- `@mozilla/readability`

مهم لأن TikTok/Instagram يمكن أن يكونا هدفين رئيسيين، لكن الرصد الإعلامي لا يكتمل بدونهما:

- الأخبار التي تذكر فيديو TikTok.
- المقالات التي تضمن روابط Instagram.
- RSS من مواقع عربية.
- صفحات ويب عامة.

---

## 6. التقييم الواقعي للكفاءة والأتمتة

### 6.1 هل ستكون المنصة مؤتمتة؟

نعم، إذا تم تنفيذ طبقة connectors والجدولة والـ queue.

المؤتمت سيكون:

- قراءة `source_rules`.
- تشغيل connectors دوريًا.
- إدخال المواد الجديدة.
- منع التكرار.
- حساب relevance.
- إدراجها في review queue.
- التقاط evidence بعد الاعتماد.
- إضافة المواد للتقرير.

### 6.2 هل ستكون بكفاءة عالية؟

الكفاءة ستكون عالية في:

- RSS.
- Web pages.
- URL hydration.
- TikTok official API إذا تم الحصول على access.
- Watchlists لحسابات TikTok/Instagram محددة.

الكفاءة ستكون محدودة في:

- رصد Instagram المفتوح بالهاشتاجات على نطاق واسع.
- أي scraping غير رسمي يتم تقديمه كـ SLA تجاري.
- أي محاولة near-real-time بدون rate limiting وobservability.

### 6.3 حدود الوعد للعميل

صياغة تجارية صادقة:

> RASD ترصد تلقائيًا المصادر المفتوحة، RSS، المواقع، روابط TikTok/Instagram، حسابات watchlist، وTikTok عبر API رسمي حيث يتوفر الوصول. Instagram يتم رصده عبر حسابات محددة وروابط مكتشفة، وليس كبحث مفتوح شامل مضمون لكل المنصة.

---

## 7. التصميم المعماري المقترح

### 7.1 Connector Interface موحد

ينبغي أن كل connector يرجع نفس الشكل، بغض النظر عن المصدر:

```ts
export type ConnectorPlatform =
  | 'tiktok'
  | 'instagram'
  | 'rss'
  | 'web'
  | 'x'
  | 'manual'
  | 'unknown';

export type ConnectorItem = {
  platform: ConnectorPlatform;
  sourceType: string;
  sourceItemId: string;
  originalUrl: string;
  canonicalUrl?: string;
  title?: string;
  authorName?: string;
  authorHandle?: string;
  publishedAt?: string;
  summarySourceText?: string;
  thumbnailUrl?: string;
  mediaUrl?: string;
  engagement?: {
    likeCount?: number;
    commentCount?: number;
    shareCount?: number;
    viewCount?: number;
  };
  matchedTerms?: string[];
  rawResponse: unknown;
  warnings?: string[];
};

export type ConnectorRunInput = {
  organizationId: string;
  topicId: string;
  sourceRuleId: string;
  sourceId?: string | null;
  sourceType: string;
  query?: string | null;
  url?: string | null;
  cursor?: Record<string, unknown> | null;
  limit: number;
  now: string;
};

export type ConnectorRunResult = {
  items: ConnectorItem[];
  cursorAfter?: Record<string, unknown> | null;
  stats?: {
    fetched?: number;
    inserted?: number;
    duplicates?: number;
    failed?: number;
  };
  warnings?: string[];
};

export interface Connector {
  type: string;
  run(input: ConnectorRunInput): Promise<ConnectorRunResult>;
}
```

### 7.2 Registry

```ts
const registry: Record<string, Connector> = {
  tiktok_research: tiktokResearchConnector,
  tiktok_unofficial: tiktokUnofficialConnector,
  tiktok_url: tiktokUrlHydrationConnector,
  instagram_public_profile: instagramPublicProfileConnector,
  instagram_url: instagramUrlHydrationConnector,
  rss: rssConnector,
  web_page: webPageConnector,
};
```

### 7.3 Pipeline عام

```txt
runDueConnectors()
  → find active source_rules
  → create connector_runs row
  → call registry[source_rule.type].run()
  → normalize items
  → compute hashes
  → upsert into monitoring_items
  → update source_rules.cursor
  → update connector_runs status/counts
  → enqueue next jobs: score/capture/review
```

### 7.4 أين يتم الحفظ؟

كل مادة جديدة تدخل في `monitoring_items`:

```ts
{
  organization_id,
  topic_id,
  source_id,
  source_type,
  state: 'ingested' أو 'needs_review',
  title,
  original_url,
  source_item_id,
  canonical_url_hash,
  author_name,
  author_handle,
  published_at,
  summary_source_text,
  raw_response,
  matched_terms,
  warning
}
```

بعد ذلك pipeline الحالي يتولى review/capture/report.

---

## 8. تعديلات قاعدة البيانات المقترحة

### 8.1 توسيع `source_type`

```sql
alter type public.source_type add value if not exists 'tiktok_url';
alter type public.source_type add value if not exists 'tiktok_research';
alter type public.source_type add value if not exists 'tiktok_unofficial';
alter type public.source_type add value if not exists 'instagram_url';
alter type public.source_type add value if not exists 'instagram_public_profile';
alter type public.source_type add value if not exists 'instagram_graph';
alter type public.source_type add value if not exists 'media_hydration';
alter type public.source_type add value if not exists 'external_search';
```

ملاحظة للوكيل: في PostgreSQL، إضافة enum values داخل migrations يجب التعامل معها بعناية إذا كان هناك transactions. افحص طريقة Supabase migrations الحالية قبل التطبيق.

### 8.2 توسيع `usage_event_type`

```sql
alter type public.usage_event_type add value if not exists 'tiktok_read';
alter type public.usage_event_type add value if not exists 'instagram_read';
alter type public.usage_event_type add value if not exists 'web_fetch';
alter type public.usage_event_type add value if not exists 'connector_run';
alter type public.usage_event_type add value if not exists 'media_hydration';
```

### 8.3 فهارس مقترحة

```sql
create index if not exists idx_source_rules_active_type
  on public.source_rules (active, type, organization_id, topic_id);

create index if not exists idx_sources_active_poll
  on public.sources (is_active, type, last_checked_at, poll_interval_minutes);

create index if not exists idx_jobs_available_status
  on public.jobs (status, available_at, organization_id);

create index if not exists idx_connector_runs_rule_started
  on public.connector_runs (source_rule_id, started_at desc);

create index if not exists idx_monitoring_items_topic_time
  on public.monitoring_items (organization_id, topic_id, published_at desc);

create index if not exists idx_monitoring_items_source_type_time
  on public.monitoring_items (organization_id, source_type, published_at desc);
```

### 8.4 هل نضيف JSON config؟

`source_rules` فيها `query`, `url`, و`cursor`. يمكن البدء بهذه الحقول بدون تعديل. لكن على المدى الأفضل إضافة:

```sql
alter table public.source_rules
  add column if not exists config jsonb not null default '{}'::jsonb;
```

استخدام `config`:

```json
{
  "platform": "tiktok",
  "mode": "keyword",
  "keywords": ["هداية", "hidayathon"],
  "hashtags": ["hidayathon"],
  "usernames": ["example_user"],
  "region_codes": ["SA", "EG"],
  "max_count": 50,
  "review_required": true
}
```

---

## 9. المستوى الأول — URL Hydration + Capture

### 9.1 الهدف

أي رابط TikTok أو Instagram يدخل المنصة يتم تحويله تلقائيًا إلى `monitoring_item` غني بالبيانات، ثم يعرض للمراجعة أو يدخل capture.

هذا هو أسرع مستوى للتنفيذ لأنه قريب من المسار اليدوي الحالي.

### 9.2 مصادر الروابط

- المستخدم يضيف URL يدويًا.
- تقرير legacy أو backfill.
- RSS/news article يحتوي رابط TikTok/Instagram.
- Web search connector لاحقًا.
- Slack/WhatsApp/Telegram ingestion لاحقًا إن أضيف.

### 9.3 استراتيجية التعرف على المنصة

```ts
function detectPlatformFromUrl(url: string): 'tiktok' | 'instagram' | 'x' | 'web' {
  const host = new URL(url).hostname.replace(/^www\./, '');
  if (host.includes('tiktok.com') || host === 'vm.tiktok.com' || host === 'vt.tiktok.com') return 'tiktok';
  if (host.includes('instagram.com')) return 'instagram';
  if (host.includes('x.com') || host.includes('twitter.com')) return 'x';
  return 'web';
}
```

### 9.4 Hydration strategy chain

```txt
1. URL canonicalization
2. yt-dlp --dump-json --skip-download
3. OpenGraph/Twitter Card extraction
4. Platform-specific oEmbed إن كان متاحًا
5. Playwright fallback screenshot/metadata
6. Store raw_response + warning if partial
```

### 9.5 استخدام yt-dlp

Node wrapper مقترح:

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function runYtDlpDumpJson(url: string) {
  const { stdout } = await execFileAsync('yt-dlp', [
    '--dump-json',
    '--no-playlist',
    '--skip-download',
    '--no-warnings',
    url,
  ], {
    timeout: 30_000,
    maxBuffer: 10 * 1024 * 1024,
  });

  return JSON.parse(stdout);
}
```

### 9.6 تحويل نتيجة yt-dlp إلى ConnectorItem

```ts
export function normalizeYtDlpResult(url: string, data: any): ConnectorItem {
  const platform = detectPlatformFromUrl(url);

  return {
    platform,
    sourceType: platform === 'tiktok' ? 'tiktok_url' : platform === 'instagram' ? 'instagram_url' : 'media_hydration',
    sourceItemId: data.id || data.display_id || url,
    originalUrl: data.webpage_url || url,
    canonicalUrl: data.original_url || data.webpage_url || url,
    title: data.title || data.description?.slice(0, 120),
    authorName: data.uploader || data.channel || data.creator,
    authorHandle: data.uploader_id || data.channel_id,
    publishedAt: data.timestamp ? new Date(data.timestamp * 1000).toISOString() : undefined,
    summarySourceText: data.description || data.title,
    thumbnailUrl: data.thumbnail,
    engagement: {
      likeCount: data.like_count,
      commentCount: data.comment_count,
      viewCount: data.view_count,
    },
    rawResponse: data,
  };
}
```

### 9.7 API endpoint مقترح

```txt
POST /api/connectors/hydrate-url
```

Body:

```json
{
  "organization_id": "...",
  "topic_id": "...",
  "url": "https://www.tiktok.com/@user/video/123",
  "review_required": true
}
```

Response:

```json
{
  "item_id": "...",
  "state": "needs_review",
  "source_type": "tiktok_url",
  "warnings": []
}
```

### 9.8 Acceptance Criteria للمستوى الأول

- إدخال رابط TikTok حقيقي يؤدي إلى مادة جديدة في `monitoring_items`.
- إدخال رابط Instagram حقيقي يؤدي إلى مادة جديدة في `monitoring_items`.
- إذا فشل yt-dlp، لا يفشل الطلب بالكامل؛ يتم حفظ المادة مع `warning`.
- لا تتكرر المادة عند إدخال نفس الرابط مرتين.
- المادة تظهر في `/feed` أو review queue.
- بعد الاعتماد، capture يعمل ويظهر في تقرير العميل.
- كل عملية hydration تسجل usage event.

---

## 10. المستوى الثاني — Automated Watchlist Monitoring

### 10.1 الهدف

النظام يرصد تلقائيًا حسابات، كلمات، وهاشتاجات محددة وفق `source_rules`، ثم يدخل المواد الجديدة في pipeline.

هذا هو المستوى الأنسب للـ MVP الحقيقي.

### 10.2 أنواع قواعد الرصد المقترحة

#### TikTok keyword/hashtag عبر Research API

```json
{
  "source_type": "tiktok_research",
  "config": {
    "mode": "query",
    "keywords": ["هداية", "hidayathon"],
    "hashtags": ["hidayathon"],
    "region_codes": ["SA", "EG"],
    "max_count": 100,
    "date_window_days": 1
  }
}
```

#### TikTok username watchlist

```json
{
  "source_type": "tiktok_research",
  "config": {
    "mode": "username",
    "usernames": ["example_user"],
    "max_count": 50
  }
}
```

#### TikTok unofficial lab watchlist

```json
{
  "source_type": "tiktok_unofficial",
  "config": {
    "mode": "user_videos",
    "usernames": ["example_user"],
    "max_count": 20,
    "lab_only": true
  }
}
```

#### Instagram public profile watchlist

```json
{
  "source_type": "instagram_public_profile",
  "config": {
    "profiles": ["example_profile"],
    "max_count": 20,
    "fast_update": true,
    "review_required": true
  }
}
```

#### Instagram URL hydration

```json
{
  "source_type": "instagram_url",
  "config": {
    "mode": "hydrate_known_urls"
  }
}
```

### 10.3 Scheduler

خيارات:

- Vercel Cron يضرب endpoint محمي.
- GitHub Actions cron للـ preview/dev فقط.
- Supabase Edge Function scheduled.
- Worker منفصل لاحقًا.

Endpoint مقترح:

```txt
POST /api/connectors/run-due
Header: x-rasd-cron-token: <CONNECTOR_CRON_SECRET>
```

Pseudo-code:

```ts
export async function runDueConnectors(now = new Date()) {
  const dueRules = await db.getDueSourceRules(now);

  for (const rule of dueRules) {
    await db.enqueueJob({
      organization_id: rule.organization_id,
      job_type: 'connector.run',
      idempotency_key: `connector:${rule.id}:${floorToInterval(now, rule.poll_interval_minutes)}`,
      payload: { source_rule_id: rule.id },
      available_at: now.toISOString(),
    });
  }
}
```

### 10.4 Worker

```ts
export async function runConnectorJob(jobId: string) {
  const job = await db.claimJob(jobId);
  const rule = await db.getSourceRule(job.payload.source_rule_id);
  const connector = registry[rule.type];

  const run = await db.createConnectorRun({
    organization_id: rule.organization_id,
    source_rule_id: rule.id,
    status: 'running',
    cursor_before: rule.cursor,
  });

  try {
    const result = await connector.run({
      organizationId: rule.organization_id,
      topicId: rule.topic_id,
      sourceRuleId: rule.id,
      sourceId: rule.source_id,
      sourceType: rule.type,
      query: rule.query,
      url: rule.url,
      cursor: rule.cursor,
      limit: rule.config?.max_count ?? 50,
      now: new Date().toISOString(),
    });

    const inserted = await ingestConnectorItems(rule, result.items);

    await db.updateSourceRuleCursor(rule.id, result.cursorAfter ?? rule.cursor);
    await db.finishConnectorRun(run.id, {
      status: 'succeeded',
      cursor_after: result.cursorAfter,
      fetched_count: result.items.length,
    });

    await db.succeedJob(job.id);
    return { inserted };
  } catch (error) {
    await db.failConnectorRun(run.id, error);
    await db.retryOrDeadLetterJob(job.id, error);
    throw error;
  }
}
```

### 10.5 TikTok Research connector

#### Request shape

```ts
function buildTikTokResearchQuery(config: any) {
  const and: any[] = [];

  if (config.region_codes?.length) {
    and.push({ operation: 'IN', field_name: 'region_code', field_values: config.region_codes });
  }

  if (config.keywords?.length) {
    and.push({ operation: 'IN', field_name: 'keyword', field_values: config.keywords });
  }

  if (config.hashtags?.length) {
    and.push({ operation: 'IN', field_name: 'hashtag_name', field_values: config.hashtags });
  }

  if (config.usernames?.length) {
    and.push({ operation: 'IN', field_name: 'username', field_values: config.usernames });
  }

  return { and };
}
```

#### Cursor handling

```ts
const body = {
  query: buildTikTokResearchQuery(config),
  max_count: Math.min(config.max_count ?? 100, 100),
  start_date: config.start_date ?? computeStartDate(config.date_window_days ?? 1),
  end_date: config.end_date ?? todayYYYYMMDD(),
  is_random: false,
  ...(cursor?.cursor ? { cursor: cursor.cursor } : {}),
  ...(cursor?.search_id ? { search_id: cursor.search_id } : {}),
};
```

#### Output mapping

```ts
function tiktokVideoToConnectorItem(video: any): ConnectorItem {
  return {
    platform: 'tiktok',
    sourceType: 'tiktok_research',
    sourceItemId: video.id,
    originalUrl: video.share_url || `https://www.tiktok.com/@${video.username}/video/${video.id}`,
    title: video.video_description?.slice(0, 120),
    authorHandle: video.username,
    publishedAt: video.create_time ? new Date(video.create_time * 1000).toISOString() : undefined,
    summarySourceText: video.video_description,
    engagement: {
      likeCount: video.like_count,
      commentCount: video.comment_count,
      shareCount: video.share_count,
      viewCount: video.view_count,
    },
    rawResponse: video,
  };
}
```

### 10.6 Instagram public profile connector via Instaloader

أفضل تنفيذ بسيط:

- Python CLI wrapper في `scripts/connectors/instagram_instaloader.py`.
- Node connector ينادي Python script ويقرأ JSON Lines.
- كل profile له state أو latest timestamp في `source_rules.cursor`.

#### Python script output

```jsonl
{"source_item_id":"ABC123","original_url":"https://www.instagram.com/p/ABC123/","author_handle":"profile","caption":"...","published_at":"2026-05-22T10:00:00Z","raw":{}}
{"source_item_id":"DEF456","original_url":"https://www.instagram.com/reel/DEF456/","author_handle":"profile","caption":"...","published_at":"2026-05-22T11:00:00Z","raw":{}}
```

#### Node wrapper

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function runInstaloaderProfile(profile: string, limit = 20) {
  const { stdout } = await execFileAsync(process.env.PYTHON_BIN ?? 'python', [
    'scripts/connectors/instagram_instaloader.py',
    '--profile', profile,
    '--limit', String(limit),
    '--jsonl',
  ], {
    timeout: 120_000,
    maxBuffer: 20 * 1024 * 1024,
  });

  return stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
```

### 10.7 Acceptance Criteria للمستوى الثاني

- يمكن إنشاء source rule لحساب Instagram محدد.
- يمكن إنشاء source rule لكلمة/هاشتاج TikTok عبر Research API إذا كانت credentials متاحة.
- scheduler يجد القواعد due ويضيف jobs.
- worker يشغل connector ويسجل `connector_runs`.
- cursor يتحدث بعد كل تشغيل ناجح.
- لا تتكرر المواد في `monitoring_items`.
- failures لا توقف باقي القواعد.
- تظهر المواد الجديدة في `/feed` بحالة `needs_review`.
- يوجد log واضح لكل connector run.

---

## 11. المستوى الثالث — Near Real-time / Production Monitoring

### 11.1 الهدف

الانتقال من MVP إلى تشغيل إنتاجي قابل للثقة:

- تكرار أعلى.
- Queue مضبوط.
- Retries وdead letters.
- Health dashboard.
- Rate limits.
- Usage accounting.
- فصل رسمي/غير رسمي.

### 11.2 خصائص التشغيل

```txt
Cron every 5–15 minutes
→ enqueue due connector jobs
→ claim jobs with concurrency limit
→ run connectors
→ ingest/dedupe
→ enqueue scoring/capture jobs
→ review/publish
```

### 11.3 Job claiming

لا تشغل نفس job مرتين. استخدم lock/update مشروط:

```sql
update public.jobs
set status = 'running', attempts = attempts + 1
where id = $1
  and status = 'queued'
  and available_at <= now()
returning *;
```

أو اعمل function في Postgres بـ `for update skip locked` إن كان worker خارج Next.

### 11.4 Retry policy

```txt
attempt 1: immediate
attempt 2: +5 minutes
attempt 3: +30 minutes
attempt 4: +2 hours
then: dead_letter
```

Errors يجب تصنيفها:

- `rate_limited`
- `auth_failed`
- `platform_blocked`
- `network_error`
- `parse_error`
- `unsupported_url`
- `partial_data`

### 11.5 Connector health dashboard

أضف صفحة أو قسم في `/ops`:

- آخر تشغيل لكل source rule.
- عدد المواد fetched/inserted/duplicates.
- نسبة الفشل.
- آخر error.
- cursor الحالي.
- next run.
- زر dry-run.
- زر disable source rule.

### 11.6 Usage limits

استخدم `usage_events` مع events جديدة:

- `tiktok_read`
- `instagram_read`
- `web_fetch`
- `media_hydration`
- `screenshot`
- `connector_run`

الهدف:

- منع source rule من استهلاك مبالغ فيه.
- إعداد limits لكل عميل أو موضوع.
- إصدار تحذير عند 70%.

### 11.7 Production rule

أي connector غير رسمي يجب أن يكون:

```json
{
  "lab_only": true,
  "review_required": true,
  "publish_automatically": false
}
```

ولا يتم عرضه للعميل كـ SLA مضمون.

### 11.8 Acceptance Criteria للمستوى الثالث

- worker يستطيع تشغيل 100 source rules بدون توقف شامل عند فشل بعضها.
- يمكن رؤية health لكل connector.
- كل connector له retry/dead-letter.
- كل تشغيل له usage events.
- يمكن تعطيل مصدر من الواجهة أو DB.
- لا يوجد publish تلقائي من مصادر غير رسمية بدون review.
- يوجد tests تغطي cursor/retry/dedupe.

---

## 12. ملفات مقترحة للوكيل

> ملاحظة: أسماء الملفات تقريبية. على الوكيل مراجعة هيكل المشروع الحالي قبل إنشاء الملفات.

```txt
src/lib/connectors/types.ts
src/lib/connectors/registry.ts
src/lib/connectors/normalize.ts
src/lib/connectors/hash.ts
src/lib/connectors/ingest.ts
src/lib/connectors/run-due.ts
src/lib/connectors/run-job.ts

src/lib/connectors/hydration/url-hydrator.ts
src/lib/connectors/hydration/yt-dlp.ts
src/lib/connectors/hydration/open-graph.ts
src/lib/connectors/hydration/playwright-capture.ts

src/lib/connectors/tiktok/research.ts
src/lib/connectors/tiktok/unofficial.ts
src/lib/connectors/tiktok/normalize.ts

src/lib/connectors/instagram/public-profile.ts
src/lib/connectors/instagram/url.ts
src/lib/connectors/instagram/normalize.ts

scripts/connectors/instagram_instaloader.py
scripts/connectors/tiktok_api_lab.py

src/app/api/connectors/run-due/route.ts
src/app/api/connectors/run-job/route.ts
src/app/api/connectors/hydrate-url/route.ts

supabase/migrations/<timestamp>_add_social_connectors.sql

tests/connectors.normalize.test.ts
tests/connectors.ingest.test.ts
tests/connectors.cursor.test.ts
tests/connectors.retry.test.ts
```

---

## 13. Environment Variables مقترحة

```env
# Security
CONNECTOR_CRON_SECRET=
RASD_ADMIN_CONNECTOR_TOKEN=

# General connector limits
CONNECTOR_MAX_ITEMS_PER_RUN=100
CONNECTOR_CONCURRENCY=3
CONNECTOR_DEFAULT_REVIEW_REQUIRED=true
CONNECTOR_LAB_MODE_ENABLED=false

# Python tooling
PYTHON_BIN=python
YTDLP_BIN=yt-dlp

# Hydration
HYDRATION_ENABLE_YTDLP=true
HYDRATION_ENABLE_PLAYWRIGHT_CAPTURE=true
HYDRATION_TIMEOUT_MS=30000

# TikTok official
TIKTOK_RESEARCH_ENABLED=false
TIKTOK_RESEARCH_CLIENT_KEY=
TIKTOK_RESEARCH_CLIENT_SECRET=
TIKTOK_RESEARCH_ACCESS_TOKEN=

# TikTok unofficial lab
TIKTOK_UNOFFICIAL_ENABLED=false
TIKTOK_MS_TOKEN=
TIKTOK_BROWSER=chromium

# Instagram
INSTAGRAM_WATCHLIST_ENABLED=false
INSTAGRAM_LOADER_SESSION_FILE=
INSTAGRAM_USERNAME=
INSTAGRAM_PASSWORD=
INSTAGRAM_GRAPH_ENABLED=false
INSTAGRAM_GRAPH_ACCESS_TOKEN=
```

ملاحظة:

- لا تضع secrets في client-side env.
- استخدم Supabase service role server-only.
- لا تطبع tokens في logs.

---

## 14. خطة تنفيذ مقترحة للوكيل

### المرحلة 0 — تدقيق سريع

الهدف: فهم الكود الحالي قبل اللمس.

المهام:

- راجع structure للمجلدات.
- حدد مكان Hono API routes.
- حدد store abstraction الحالي: in-memory vs Supabase.
- راجع كيف يتم إنشاء `monitoring_items` يدويًا.
- راجع كيف تعمل `/api/items/manual-url`.
- راجع كيف يعمل review/capture.
- راجع tests الموجودة.

المخرجات:

- note قصير: أين سيتم وضع connectors؟
- هل التطبيق يستخدم App Router فقط أم Hono داخل route؟
- هل هناك helper جاهز لـ Supabase؟

### المرحلة 1 — Schema migration

المهام:

- أضف source types الجديدة.
- أضف usage event types.
- أضف indexes.
- اختياريًا أضف `config jsonb` إلى `source_rules`.
- شغل typecheck/tests.

Acceptance:

- migration تعمل محليًا.
- schema tests إن وجدت تمر.
- لا كسر لمسارات legacy.

### المرحلة 2 — Connector core

المهام:

- `types.ts`
- `registry.ts`
- `normalize.ts`
- `hash.ts`
- `ingest.ts`
- tests لـ hashing/dedupe.

Acceptance:

- يمكن تمرير ConnectorItem fake ويحفظ في `monitoring_items`.
- نفس URL لا يتكرر.
- نفس source item ID لا يتكرر.

### المرحلة 3 — URL Hydration MVP

المهام:

- detect platform.
- yt-dlp wrapper.
- OpenGraph fallback.
- API endpoint `hydrate-url`.
- integrate with current manual URL flow أو إضافة endpoint منفصل.

Acceptance:

- رابط TikTok يحفظ مادة.
- رابط Instagram يحفظ مادة.
- فشل yt-dlp ينتج warning لا crash.
- يظهر item في feed/review.

### المرحلة 4 — Scheduler + Jobs

المهام:

- `run-due` endpoint protected.
- job enqueue.
- job runner.
- connector_runs logging.
- retry/dead-letter.

Acceptance:

- source_rule fake يؤدي إلى job.
- job fake connector يضيف material.
- connector_runs يظهر succeeded/failed.

### المرحلة 5 — TikTok Research connector

المهام:

- credentials handling.
- access token handling إذا لم يكن token ثابتًا.
- query builder.
- cursor/search_id.
- normalization.
- tests بالـ fixtures.

Acceptance:

- إذا credentials غير مفعلة، connector يعطي disabled error واضح.
- إذا mock API يرجع videos، يتم إدخالها.
- cursor يتم حفظه.

### المرحلة 6 — Instagram Watchlist connector

المهام:

- Python script أو CLI wrapper.
- Node wrapper.
- normalize posts/reels.
- cursor/latest timestamp.
- warnings عند login/session issues.

Acceptance:

- profile public في fixture/mock ينتج items.
- connector لا يكرر القديم.
- errors تصنف بوضوح.

### المرحلة 7 — Ops UI

المهام:

- أضف section في `/ops` أو صفحة connectors.
- عرض source rules.
- عرض connector_runs.
- run dry-run.
- enable/disable rule.

Acceptance:

- يمكن للفريق رؤية آخر تشغيل ومشكلاته.

### المرحلة 8 — Production hardening

المهام:

- rate limits.
- usage events.
- max items per run.
- concurrency.
- log redaction.
- docs.

Acceptance:

- لا توجد secrets في logs.
- مصدر يفشل لا يوقف النظام.
- يوجد README محدث لكيفية تشغيل connectors.

---

## 15. سياسة المراجعة والنشر

### 15.1 حالات المواد المقترحة

- `ingested`: دخلت من connector.
- `normalized`: تم تنظيفها.
- `candidate`: مناسبة مبدئيًا.
- `needs_review`: تحتاج مراجعة بشرية.
- `approved_pending_capture`: اعتمدت وتحتاج capture.
- `capture_pending`: capture قيد التنفيذ.
- `report_ready`: جاهزة للتقرير.
- `added_to_report`: أضيفت للتقرير.

هذه الحالات موجودة تقريبًا بالفعل في enum الحالي، لذلك لا يلزم تغيير كبير.

### 15.2 قواعد النشر

```txt
official source + high relevance + verified source
  → يمكن auto-approve لاحقًا

unofficial connector
  → review_required always

manual URL
  → review_required by default

RSS trusted source
  → configurable auto-approve
```

### 15.3 Relevance scoring بسيط كبداية

```ts
function scoreRelevance(text: string, rule: KeywordRule) {
  let score = 0;
  const matched: string[] = [];

  for (const term of rule.required_terms) {
    if (text.includes(term)) {
      score += 40;
      matched.push(term);
    } else {
      score -= 50;
    }
  }

  for (const term of rule.optional_terms) {
    if (text.includes(term)) {
      score += 10;
      matched.push(term);
    }
  }

  for (const term of rule.exclude_terms) {
    if (text.includes(term)) {
      score -= 100;
    }
  }

  return { score: Math.max(0, Math.min(score, 100)), matched };
}
```

---

## 16. مخاطر وحدود يجب أن يعرفها الفريق

| الخطر | المنصة | التأثير | التعامل |
|---|---|---|---|
| عدم الحصول على TikTok Research API access | TikTok | يقل discovery الرسمي | ابدأ URL hydration + watchlist lab + RSS/web mentions |
| API data غير كاملة | TikTok | بعض الفيديوهات لا تظهر | سجل gaps، استخدم مصادر مساعدة، لا تعد بالكمال |
| scraping blocking | TikTok/Instagram | فشل connector | lab mode فقط، backoff، لا SLA |
| Instagram hashtag/search محدود | Instagram | discovery واسع غير مضمون | watchlists + links + official APIs عند السماح |
| login/session challenges | Instagram | فشل Instaloader/instagrapi | لا تعتمد عليه تجاريًا، راقب، fallback |
| تكرار المواد | كل المنصات | فوضى في feed | canonical hash + source item ID |
| انكشاف secrets | كل المنصات | خطر أمني | server-only env + log redaction |
| تكلفة captures | كل المنصات | استهلاك موارد | usage limits + capture after review |

---

## 17. توصية المنتج النهائية

لا تبيعوا RASD في البداية على أنها “ترصد كل شيء في TikTok وInstagram”. الصياغة الأدق:

> RASD توفر رصدًا مؤتمتًا للمصادر المفتوحة وRSS والمواقع، وإثراء روابط TikTok/Instagram، ورصد watchlists لحسابات مختارة، وتكامل TikTok رسمي حيث يتوفر الوصول. Instagram يتم التعامل معه عبر watchlists وروابط مكتشفة وواجهات رسمية عند توفرها، مع مراجعة بشرية اختيارية قبل النشر.

هذه صياغة قوية وصادقة وقابلة للتنفيذ.

---

## 18. ما يجب ألا يفعله الوكيل

- لا يستخدم credentials في المتصفح.
- لا يضع service role أو tokens في client bundle.
- لا يبني bypass لـ CAPTCHA.
- لا يستخدم حسابات مسروقة أو sessions غير مصرح بها.
- لا يعتمد على private API كـ production SLA.
- لا يخلط كل المنصات داخل `manual_url` فقط.
- لا يحذف workflow الحالي.
- لا يغير schema بطريقة تكسر legacy import.
- لا يجعل النشر النهائي auto من مصادر غير رسمية.

---

## 19. مراجع وروابط للتدقيق

على الوكيل مراجعة هذه الروابط قبل التنفيذ لأن واجهات المنصات والمكتبات قد تتغير:

### RASD

- Repository: https://github.com/samawah-media/Rasd
- README: https://github.com/samawah-media/Rasd/blob/main/README.md
- package.json: https://github.com/samawah-media/Rasd/blob/main/package.json
- schema.sql: https://github.com/samawah-media/Rasd/blob/main/supabase/schema.sql

### TikTok

- TikTok Research API Get Started: https://developers.tiktok.com/doc/research-api-get-started/
- TikTok for Developers: https://developers.tiktok.com/
- TikTok-Api unofficial Python wrapper: https://github.com/davidteather/TikTok-Api

### Instagram

- Instagram Platform / Meta for Developers: https://developers.facebook.com/docs/instagram-platform/
- Instaloader: https://github.com/instaloader/instaloader
- instagrapi: https://github.com/subzeroid/instagrapi

### Hydration / Capture

- yt-dlp: https://github.com/yt-dlp/yt-dlp
- Playwright: https://github.com/microsoft/playwright
- gallery-dl: https://github.com/mikf/gallery-dl

---

## 20. رسالة للوكيل

ابدأ بالتدقيق ولا تعتبر هذه الخطة أوامر مغلقة. المطلوب منك:

1. راجع الريبو الحالي.
2. حدد أين توجد API/store/tests.
3. اقترح patch تدريجي لا يكسر الموجود.
4. ابدأ بالمستوى الأول لأنه الأسرع والأضمن.
5. بعدها نفذ Scheduler/Jobs.
6. بعدها TikTok Research connector.
7. بعدها Instagram watchlist connector.
8. حافظ على review workflow.
9. اكتب tests لكل خطوة.
10. وثق حدود TikTok وInstagram بوضوح.

الهدف النهائي ليس “سكرابر” فقط؛ الهدف هو **منصة رصد إعلامي مؤتمتة** بواجهة تشغيل، تقارير، مراجعة، evidence، وحدود موثوقة.
