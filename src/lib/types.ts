export type Role = "owner" | "editor" | "viewer";

export type SourceType =
  | "manual_url"
  | "rss"
  | "web_page"
  | "x_oembed"
  | "x_recent_search"
  | "x_filtered_stream"
  | "tiktok_research"
  | "instagram_public_profile";

export type SourceCredibility = "official" | "media" | "influencer" | "public";

export type ItemState =
  | "ingested"
  | "normalized"
  | "deduped"
  | "candidate"
  | "needs_review"
  | "rejected"
  | "approved_pending_capture"
  | "capture_pending"
  | "capture_failed"
  | "report_ready"
  | "added_to_report"
  | "published"
  | "archived";

export type Sentiment = "positive" | "neutral" | "negative";
export type CaptureKind = "evidence_lite" | "preview" | "report_grade";
export type CaptureStatus = "pending" | "success" | "failed" | "retrying";

export type ConnectorHealth = {
  connector: SourceType;
  status: "healthy" | "degraded" | "down" | "not_configured";
  lastSuccessAt?: string;
  message: string;
};

export type Source = {
  id: string;
  name: string;
  type: SourceType;
  url: string;
  feedUrl?: string;
  handle?: string;
  country: string;
  credibility: SourceCredibility;
  isVerifiedSource: boolean;
  isActive: boolean;
  lastCheckedAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
  pollIntervalMinutes: number;
  logoUrl?: string;
};

export type KeywordRule = {
  id: string;
  requiredTerms: string[];
  optionalTerms: string[];
  excludeTerms: string[];
  language: "ar" | "en" | "mixed";
  sourceType?: SourceType;
  priority: number;
  activeFrom: string;
  activeTo?: string;
  version: number;
};

export type UsageLimit = {
  maxXReadsPerDay: number;
  maxXReadsPerMonth: number;
  maxAiTokensPerMonth: number;
  maxScreenshotsPerMonth: number;
  maxStorageMb: number;
  hardStopEnabled: boolean;
  warningThresholdPercent: number;
};

export type MonitoringItem = {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceType: SourceType;
  state: ItemState;
  title: string;
  originalUrl: string;
  authorName?: string;
  authorHandle?: string;
  publishedAt: string;
  summary: string;
  summarySourceText: string;
  sentiment: Sentiment;
  sentimentConfidence: number;
  relevanceScore: number;
  relevanceReason: string;
  matchedTerms: string[];
  dedupeKey: string;
  hasReportGradeCapture: boolean;
  warning?: string;
  sourceItemId?: string;
  raw_response?: unknown;
  discoveryMethod?: "manual" | "rss" | "auto_search";
  organizationId?: string;
  topicId?: string;
};

export type Capture = {
  id: string;
  itemId: string;
  kind: CaptureKind;
  status: CaptureStatus;
  capturedAt?: string;
  assetUrl?: string;
  failureReason?: string;
};

export type ReportItemCard = {
  platform: "X" | "Website" | "News" | "Official" | "TikTok" | "Instagram";
  source_name: string;
  author_name?: string;
  author_handle?: string;
  title?: string;
  summary: string;
  sentiment: Sentiment;
  gregorian_date: string;
  hijri_date: string;
  captured_at?: string;
  screenshot_url?: string;
  content_image_url?: string;
  publisher_profile_image_url?: string;
  source_evidence_image_url?: string;
  original_url: string;
  source_icon: string;
  warning?: string;
};

export type ReportVersion = {
  id: string;
  version: number;
  status: "draft" | "published" | "archived";
  title: string;
  periodStart: string;
  periodEnd: string;
  publishedAt?: string;
  secureUrl?: string;
  pdfUrl?: string;
};

export type HealthMetric = {
  label: string;
  value: string;
  status: "good" | "warning" | "danger";
};

export type SourceRule = {
  id: string;
  organizationId: string;
  topicId: string;
  sourceId: string | null;
  type: SourceType;
  query: string | null;
  url: string | null;
  cursor: Record<string, unknown> | null;
  active: boolean;
  pollIntervalMinutes: number;
  createdAt: string;
  keywordRule?: KeywordRule;
};

export type Job = {
  id: string;
  organizationId: string;
  jobType: string;
  status: "queued" | "running" | "succeeded" | "failed" | "dead_letter";
  idempotencyKey: string;
  attempts: number;
  payload: Record<string, unknown>;
  failureReason: string | null;
  availableAt: string;
  createdAt: string;
};

export type ConnectorRun = {
  id: string;
  organizationId: string;
  sourceRuleId: string;
  status: string;
  cursorBefore: Record<string, unknown> | null;
  cursorAfter: Record<string, unknown> | null;
  fetchedCount: number;
  failureReason: string | null;
  startedAt: string;
  finishedAt: string | null;
};
