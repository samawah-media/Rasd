import type { SupabaseClient } from "@supabase/supabase-js";
import type { CaptureKind, MonitoringItem } from "@/lib/types";
import { renderEvidenceCardSvg } from "@/server/evidence-card";

const defaultEvidenceBucket = "rasd-evidence";
const maxEvidenceBytes = 6 * 1024 * 1024;
const fetchTimeoutMs = 12_000;

export type EvidenceStorageResult = {
  assetUrl: string;
  persisted: boolean;
  bucket?: string;
  storagePath?: string;
  contentType?: string;
  sizeBytes?: number;
  failureReason?: string;
};

type PersistEvidenceInput = {
  supabase: SupabaseClient;
  item: MonitoringItem;
  captureId: string;
  kind: CaptureKind;
  sourceUrl: string;
  nowIso?: string;
  fetcher?: typeof fetch;
};

export function evidenceStorageBucket() {
  return process.env.RASD_EVIDENCE_STORAGE_BUCKET || process.env.RASD_EVIDENCE_BUCKET || defaultEvidenceBucket;
}

export function evidenceStorageReference(bucket: string, path: string) {
  return `supabase://${bucket}/${path}`;
}

export function parseEvidenceStorageReference(value: string | null | undefined) {
  if (!value?.startsWith("supabase://")) return null;
  const withoutScheme = value.slice("supabase://".length);
  const separatorIndex = withoutScheme.indexOf("/");
  if (separatorIndex <= 0 || separatorIndex === withoutScheme.length - 1) return null;
  return {
    bucket: withoutScheme.slice(0, separatorIndex),
    path: withoutScheme.slice(separatorIndex + 1),
  };
}

export function evidenceAssetProxyUrl(captureId: string) {
  return `/api/captures/${encodeURIComponent(captureId)}/asset`;
}

export function evidenceStoragePath(input: {
  organizationId: string;
  topicId: string;
  itemId: string;
  captureId: string;
  kind: CaptureKind;
  extension: string;
  nowIso?: string;
}) {
  const timestamp = (input.nowIso ?? new Date().toISOString()).replace(/[^0-9A-Za-z]+/gu, "-").replace(/^-|-$/gu, "");
  const extension = sanitizeExtension(input.extension);
  return [
    "organizations",
    input.organizationId,
    "topics",
    input.topicId,
    "items",
    input.itemId,
    "captures",
    `${timestamp}-${input.kind}-${input.captureId}.${extension}`,
  ].join("/");
}

export async function persistEvidenceAsset(input: PersistEvidenceInput): Promise<EvidenceStorageResult> {
  const fallback: EvidenceStorageResult = {
    assetUrl: input.sourceUrl,
    persisted: false,
  };

  try {
    const evidence = await readEvidenceBytes(input.item, input.sourceUrl, input.fetcher ?? fetch);
    if (evidence.bytes.byteLength > maxEvidenceBytes) {
      return {
        ...fallback,
        failureReason: "evidence_asset_too_large",
        sizeBytes: evidence.bytes.byteLength,
      };
    }

    const bucket = evidenceStorageBucket();
    const storagePath = evidenceStoragePath({
      organizationId: "default",
      topicId: "hidayathon",
      itemId: input.item.id,
      captureId: input.captureId,
      kind: input.kind,
      extension: extensionForContentType(evidence.contentType),
      nowIso: input.nowIso,
    });

    await ensureEvidenceBucket(input.supabase, bucket);
    const { error } = await input.supabase.storage.from(bucket).upload(storagePath, evidence.bytes, {
      cacheControl: "31536000",
      contentType: evidence.contentType,
      upsert: false,
    });

    if (error) {
      return {
        ...fallback,
        failureReason: error.message,
        sizeBytes: evidence.bytes.byteLength,
        contentType: evidence.contentType,
      };
    }

    return {
      assetUrl: evidenceAssetProxyUrl(input.captureId),
      persisted: true,
      bucket,
      storagePath,
      contentType: evidence.contentType,
      sizeBytes: evidence.bytes.byteLength,
    };
  } catch (error) {
    return {
      ...fallback,
      failureReason: error instanceof Error ? error.message : "evidence_storage_failed",
    };
  }
}

async function ensureEvidenceBucket(supabase: SupabaseClient, bucket: string) {
  const { data, error } = await supabase.storage.getBucket(bucket);
  if (data && !error) return;

  const { error: createError } = await supabase.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: maxEvidenceBytes,
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "image/svg+xml"],
  });

  if (createError && !/already exists/iu.test(createError.message)) {
    throw createError;
  }
}

async function readEvidenceBytes(item: MonitoringItem, sourceUrl: string, fetcher: typeof fetch) {
  if (sourceUrl === evidenceCardPath(item.id)) {
    const svg = renderEvidenceCardSvg(item);
    return {
      bytes: new TextEncoder().encode(svg),
      contentType: "image/svg+xml",
    };
  }

  if (!/^https?:\/\//iu.test(sourceUrl)) {
    throw new Error("unsupported_evidence_asset_source");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
  try {
    const response = await fetcher(sourceUrl, {
      signal: controller.signal,
      headers: {
        accept: "image/avif,image/webp,image/png,image/jpeg,image/svg+xml,image/*;q=0.8,*/*;q=0.2",
      },
    });
    if (!response.ok) throw new Error(`evidence_fetch_failed:${response.status}`);

    const contentType = cleanContentType(response.headers.get("content-type"));
    if (!contentType.startsWith("image/")) throw new Error(`evidence_not_image:${contentType}`);

    const arrayBuffer = await response.arrayBuffer();
    return {
      bytes: new Uint8Array(arrayBuffer),
      contentType,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("evidence_fetch_timeout");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function evidenceCardPath(itemId: string) {
  return `/api/items/${encodeURIComponent(itemId)}/evidence-card.svg`;
}

function cleanContentType(value: string | null) {
  return (value ?? "application/octet-stream").split(";")[0].trim().toLowerCase();
}

function extensionForContentType(contentType: string) {
  if (contentType === "image/svg+xml") return "svg";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  return "bin";
}

function sanitizeExtension(value: string) {
  const cleaned = value.replace(/[^a-z0-9]/giu, "").toLowerCase();
  return cleaned || "bin";
}
