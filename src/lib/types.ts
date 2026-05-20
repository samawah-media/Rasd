export type Role = "owner" | "editor" | "viewer";

export type SourceType =
  | "manual_url"
  | "rss"
  | "web_page"
  | "x_oembed"
  | "x_recent_search"
  | "x_filtered_stream";

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
  handle?: string;
  country: string;
  credibility: SourceCredibility;
  isVerifiedSource: boolean;
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
  platform: "X" | "Website" | "News" | "Official";
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
