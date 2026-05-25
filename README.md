# RASD Platform

منصة SaaS عربية للرصد الإعلامي وبناء تقارير تفاعلية آمنة. الهدف الحالي هو تحويل تقارير هاكاثون هداية القديمة إلى بيانات قابلة للمراجعة، ثم عرضها في تجربة عميل حديثة فيها تقويم وفلاتر وPDF.

## الموجود حاليًا

- Dashboard عربي RTL.
- صفحة رصد حي `/feed`.
- صفحة تقرير عميل تفاعلية `/client-report` على الداتا القديمة المعتمدة مع تقويم وفلاتر ومدى تاريخ.
- صفحة مراجعة واستيراد التقارير القديمة `/imports`.
- صفحة استكمال روابط المصادر القديمة `/imports/backfill`.
- صفحة تشغيل API تفاعلية `/ops`.
- نموذج تقرير HTML `/reports/report-5`.
- Hono API لدورة الإدخال والمراجعة والالتقاط وروابط المشاركة.
- Supabase schema مع RLS-first multi-tenancy.
- مستخرج تقارير PDF قديمة إلى JSON.
- اختبارات workflow وAPI وschema وguardrails.

## التشغيل المحلي

```bash
npm install
npm run dev
```

افتح:

[http://localhost:3000](http://localhost:3000)

## المسارات المهمة

- `/` لوحة رصد تشغيلية.
- `/feed` صفحة الرصد الحي والفلاتر وحالات المواد.
- `/client-report` تجربة العميل الحديثة للتقرير القديم المعتمد، وفيها تقويم نشر، مدى تاريخ، فلاتر منصة/تقرير/ثقة/تصنيف محتوى، بطاقات مواد، وتفاصيل المادة عند الطلب. بعد إدخال رابط يدوي واعتماده وإضافته للتقرير يظهر أيضًا داخل نفس تجربة العميل.
- `/imports` مراجعة بيانات التقارير المستخرجة واستيرادها كداتا قديمة معتمدة داخل الـ store المحلي.
- `/imports/backfill` مراجعة المواد التي لا تملك رابطًا أصليًا صالحًا، مع روابط بحث X/Web وقالب override محلي.
- `/api/client-report/hidayathon` بيانات تقرير هداية التفاعلي مشتقة من Supabase عند توفره، وتشمل أرشيف هداية القديم وأي مواد يدوية أضيفت إلى تقرير هداية الحي.
- `/api/imports/legacy/status` حالة استيراد الداتا القديمة.
- `/api/imports/legacy/backfill` إحصائيات وقائمة Backfill للروابط الأصلية الناقصة أو المعطوبة.
- `/api/imports/legacy` استيراد الداتا القديمة المعتمدة بشكل idempotent.
- `/api/imports/legacy/supabase-plan` خطة upsert كاملة لما سيكتب في Supabase بدون تنفيذ.
- `/api/imports/legacy/upsert-supabase` تنفيذ upsert إلى Supabase عند تمرير `{"dry_run": false}` ووجود `SUPABASE_SERVICE_ROLE_KEY` و`RASD_ADMIN_IMPORT_TOKEN` مطابق داخل header `x-rasd-admin-token` فقط؛ الوضع الافتراضي dry-run آمن.
- `/ops` تشغيل دورة العمل: manual URL -> review -> capture -> report-ready -> client report.
- `/reports/report-5` نموذج تقرير HTML.
- `/api/admin/health` حالة النظام.
- `/api/admin/persistence` هل التشغيل على الذاكرة المحلية أم Supabase.
- `/api/items/manual-url` إدخال رابط يدوي.
- `/api/items/:id/review` اعتماد أو رفض مادة.
- `/api/items/:id/capture-report-grade` لقطة نهائية.
- `/api/reports/hidayathon-live` التقرير النشط الذي تستقبل فيه مواد هداية اليدوية في بيئة الإنتاج.
- `/api/reports/:id/items` إضافة مادة جاهزة للتقرير.
- `/api/reports/:id/share-link` إنشاء رابط مشاركة آمن.
- `/api/share-links/:token` فتح رابط مشاركة وتسجيل مشاهدة.
- `/api/share-links/:token/revoke` إلغاء رابط مشاركة.

## استيراد التقارير القديمة

التقارير الأصلية موجودة في:

```txt
D:\code - projects\RASD HAKSON
```

تشغيل المستخرج:

```bash
python scripts/extract_reports.py --input-dir "D:\code - projects\RASD HAKSON" --output data/imports/hidayathon_reports.json
```

الناتج الحالي:

- 124 مادة فريدة من E01/E02/E03/E04.
- اكتشاف نسخة E01 المكررة بالبصمة.
- Dashboard PDF أغلبه صور ويستخدم كمرجع بصري.
- استخراج 124 صورة صفحة كدليل بصري للمواد القديمة داخل `public/imports/legacy-pages`.
- استخراج 124 صورة محتوى مقصوصة و124 صورة ناشر من صفحات التقارير داخل `public/imports/legacy-content-crops/full`.
- ربط صور المحتوى المقصوصة في Supabase داخل `monitoring_items.evidence_image_path` و`captures.asset_url` مع حفظ صورة صفحة التقرير الكاملة كمرجع احتياطي في metadata.
- استخراج 124 رابطًا أصليًا من الروابط التفاعلية خلف أيقونة الرابط داخل صفحات PDF الأصلية، وليس من النص المطبوع فقط.
- صفحة `/imports/backfill` لم تعد تعرض نقصًا جماعيًا في روابط التقارير القديمة بعد استخراج روابط الأيقونات؛ تبقى مفيدة لأي تصحيحات يدوية لاحقة.
- روابط X الأصلية أصبحت مستخرجة من الروابط التفاعلية خلف أيقونة الرابط داخل ملفات PDF؛ يوجد الآن 70 رابط X بصيغة `x.com/.../status/...` ضمن 124 رابطًا أصليًا قابلًا للفتح.
- صفحة `/imports` تعرض هذه البيانات وتستوردها إلى الـ store المحلي كـ 4 تقارير منشورة و124 مادة مرتبطة بها، مع منع التكرار عند إعادة التشغيل.
- صفحة `/client-report` تعرض نفس الـ 124 مادة كتقرير عميل تفاعلي حديث: يمكن اختيار يوم محدد أو range، فلترة المنصة/الإصدار/الثقة/تصنيف المحتوى، رؤية صورة المحتوى وصورة الناشر، وفتح الرابط الأصلي المستخرج من أيقونة PDF. وتستطيع الآن عرض المواد اليدوية الجديدة بعد اعتمادها والتقاطها وإضافتها إلى تقرير هداية الحي.

## التحقق

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## Supabase

طبّق `supabase/schema.sql` على مشروع Supabase بعد إنشائه. احفظ service role server-only ولا تعرضه في المتصفح.

المتغيرات المطلوبة موجودة في `.env.example`.

بدون إعداد Supabase يعمل النموذج على in-memory state لتسهيل التطوير المحلي.

## تفعيل الرصد الآلي في الإنتاج

- أضف `CRON_SECRET` كمتغير Server-only في Vercel حتى تعمل `/api/cron/poll-sources` و`/api/cron/run-connectors`.
- أضف `APIFY_API_TOKEN` إذا أردت تشغيل رصد TikTok/Instagram الفعلي بدل الاكتفاء بـ RSS والإدخال اليدوي.
- جدول Vercel الحالي يشغل RSS يوميًا 05:00 UTC، ويشغل موصلات TikTok/Instagram يوميًا 05:15 UTC.
- صفحة `/health` تعرض آخر تشغيل ناجح، عدد المواد المكتشفة، الأخطاء، وأي مصدر RSS فاشل لأكثر من 24 ساعة.

## تصنيف المحتوى

- يبقى التصنيف ظاهرًا للمراجع والعميل كـ `إيجابي / محايد / سلبي`.
- التصنيف الحالي أولي ومساعد للمراجعة، وليس تحليل مشاعر آليًا نهائيًا.
- درجة الملاءمة مستقلة عن التصنيف: الملاءمة تحدد صلة المادة بموضوع الرصد، والتصنيف يساعد على فرز نبرة المحتوى.

## ترتيب التنفيذ الحالي

1. تم: بناء صفحة `/imports` لمراجعة بيانات التقارير المستخرجة.
2. تم: استيراد الداتا القديمة المعتمدة إلى الـ store المحلي بدون تكرار.
3. تم: بناء صفحة تقرير العميل التفاعلية `/client-report` مع تقويم وفلاتر على الداتا القديمة المعتمدة.
4. تم: بناء صفحة `/imports/backfill` لاستكمال روابط التغريدات والمصادر القديمة بدون اختلاق روابط غير موجودة.
5. تم: بناء خطة Supabase upsert للبيانات القديمة مع IDs ثابتة وحقول جودة الروابط القديمة.
6. تم: تنفيذ upsert فعلي إلى Supabase بعد تطبيق `supabase/schema.sql` وضبط مفاتيح السيرفر.
7. تم: استخراج صور المحتوى والناشرين لكل مواد هداية القديمة وربطها بتقرير العميل وSupabase.
8. تم: دعم إدخال رابط يدوي حقيقي لمسار X/news ثم مراجعته والتقاطه وإظهاره في تقرير العميل بعد إضافته للتقرير الحي.
9. نشر Vercel Preview للاختبار.
10. ربط المصادر الخارجية لاحقًا: RSS, Web, X API.

## ملاحظة أمنية

`npm audit --audit-level=moderate` يظهر حاليًا تحذيرًا متوسطًا داخل dependency فرعية مرتبطة بـ Next/PostCSS. لا يتم تطبيق `npm audit fix --force` لأنه يقترح تغييرًا غير آمن. تتم مراجعته عند تحديث Next.

## Supabase Activation Notes

Supabase has been initialized locally with `supabase/config.toml`, and the first reviewed migration is:

```txt
supabase/migrations/20260520134546_initial_rasd_schema.sql
```

`.env.local` now contains the Supabase public URL, publishable key, and project ref for `ewunxfttbpqisspqthiz`. Real database writes still need these server-only values from the Supabase dashboard:

```bash
SUPABASE_SERVICE_ROLE_KEY=
RASD_ADMIN_IMPORT_TOKEN=
SUPABASE_DB_PASSWORD=
```

After adding the database password:

```powershell
npm run supabase:db:dry-run
npm run supabase:db:push
```

After adding `SUPABASE_SERVICE_ROLE_KEY` and `RASD_ADMIN_IMPORT_TOKEN`, restart `npm run dev`, check `/api/admin/persistence`, then run:

```powershell
npm run supabase:legacy:dry-run
npm run supabase:legacy:upsert
```

The CLI is invoked through `npx supabase`, so no global Supabase install is required.
