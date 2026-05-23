import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export type MediaMetadata = {
  title?: string;
  description?: string;
  uploader?: string;
  uploaderId?: string;
  thumbnail?: string;
  webpageUrl?: string;
  timestamp?: number;
  uploadDate?: string;
};

export type MediaMetadataResult = {
  metadata: MediaMetadata | null;
  error?: string;
  stderr?: string;
};

export type MediaMetadataHealth = {
  enabled: boolean;
  mode: "auto" | "yt-dlp";
  ytDlpAvailable: boolean;
  cookiesConfigured: boolean;
  proxyConfigured: boolean;
  status: "healthy" | "degraded" | "disabled";
  message: string;
  lastError?: string;
};

export type YtDlpRunner = (args: string[], options: { timeoutMs: number }) => Promise<YtDlpRunResult>;

type YtDlpRunResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  errorCode?: string;
};

const ytdlpTimeoutMs = 8000;
const require = createRequire(import.meta.url);

export function mediaMetadataExtractorMode(): "auto" | "yt-dlp" {
  return process.env.MEDIA_METADATA_EXTRACTOR === "yt-dlp" ? "yt-dlp" : "auto";
}

export function isMediaMetadataExtractorEnabled() {
  return process.env.MEDIA_METADATA_EXTRACTOR !== "off";
}

let lastYtDlpError: string | undefined;

export function sanitizeErrorString(str: string): string {
  if (!str) return "";
  let clean = str;
  const proxyUrl = cleanEnv(process.env.YTDLP_PROXY_URL);
  if (proxyUrl) {
    clean = clean.replaceAll(proxyUrl, "[PROXY_URL_HIDDEN]");
  }
  const cookiesTxt = cleanEnv(process.env.YTDLP_COOKIES_TXT);
  if (cookiesTxt) {
    clean = clean.replaceAll(cookiesTxt, "[COOKIES_CONTENT_HIDDEN]");
  }
  const cookiesPath = cleanEnv(process.env.YTDLP_COOKIES_PATH);
  if (cookiesPath) {
    clean = clean.replaceAll(cookiesPath, "[COOKIES_PATH_HIDDEN]");
  }
  clean = clean.replace(/cookies\.txt/gi, "[COOKIES_FILE_HIDDEN]");
  if (clean.length > 200) {
    clean = clean.slice(0, 197) + "...";
  }
  return clean.trim();
}

export async function extractMediaMetadataWithYtDlp(url: string, runner: YtDlpRunner = runYtDlp): Promise<MediaMetadataResult> {
  if (!isMediaMetadataExtractorEnabled()) {
    return { metadata: null, error: "Media metadata extractor is disabled" };
  }

  const cookieFile = await createCookieFileFromEnv();
  try {
    const args = [
      "--dump-json",
      "--skip-download",
      "--no-playlist",
      "--no-warnings",
      "--socket-timeout",
      "6",
    ];

    const cookiesPath = cookieFile ?? cleanEnv(process.env.YTDLP_COOKIES_PATH);
    if (cookiesPath) args.push("--cookies", cookiesPath);

    const proxyUrl = cleanEnv(process.env.YTDLP_PROXY_URL);
    if (proxyUrl) args.push("--proxy", proxyUrl);

    args.push(url);

    const result = await runner(args, { timeoutMs: ytdlpTimeoutMs });
    if (result.exitCode !== 0 || !result.stdout.trim()) {
      const err = `yt-dlp exited with code ${result.exitCode}`;
      lastYtDlpError = sanitizeErrorString(result.stderr || err);
      return {
        metadata: null,
        error: err,
        stderr: result.stderr.trim() || undefined,
      };
    }

    const parsed = parseYtDlpMetadata(result.stdout);
    if (!parsed) {
      const err = "Failed to parse yt-dlp JSON output";
      lastYtDlpError = err;
      return {
        metadata: null,
        error: err,
        stderr: result.stdout.slice(0, 500),
      };
    }

    return { metadata: parsed };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    lastYtDlpError = sanitizeErrorString(msg);
    return {
      metadata: null,
      error: "yt-dlp execution error",
      stderr: msg,
    };
  } finally {
    if (cookieFile) await rm(dirname(cookieFile), { force: true, recursive: true }).catch(() => undefined);
  }
}

export async function getMediaMetadataHealth(runner: YtDlpRunner = runYtDlp): Promise<MediaMetadataHealth> {
  const enabled = isMediaMetadataExtractorEnabled();
  const mode = mediaMetadataExtractorMode();
  const cookiesConfigured = Boolean(cleanEnv(process.env.YTDLP_COOKIES_TXT) || cleanEnv(process.env.YTDLP_COOKIES_PATH));
  const proxyConfigured = Boolean(cleanEnv(process.env.YTDLP_PROXY_URL));

  if (!enabled) {
    return {
      enabled,
      mode,
      ytDlpAvailable: false,
      cookiesConfigured,
      proxyConfigured,
      status: "disabled",
      message: "Media metadata extractor is disabled.",
    };
  }

  const result = await runner(["--version"], { timeoutMs: 2500 }).catch((error: unknown) => ({
    exitCode: null,
    stdout: "",
    stderr: error instanceof Error ? error.message : String(error),
    errorCode: error && typeof error === "object" && "code" in error ? String(error.code) : undefined,
  }));
  const ytDlpAvailable = result.exitCode === 0;
  if (!ytDlpAvailable && result.stderr) {
    lastYtDlpError = sanitizeErrorString(result.stderr);
  }

  return {
    enabled,
    mode,
    ytDlpAvailable,
    cookiesConfigured,
    proxyConfigured,
    status: ytDlpAvailable ? "healthy" : "degraded",
    message: ytDlpAvailable ? "yt-dlp is available for TikTok/Instagram metadata." : "yt-dlp is unavailable; HTML metadata fallback remains active.",
    lastError: lastYtDlpError,
  };
}

function parseYtDlpMetadata(stdout: string) {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(stdout.trim().split(/\r?\n/u).at(-1) ?? "{}") as Record<string, unknown>;
  } catch {
    return null;
  }
  const metadata: MediaMetadata = {
    title: stringValue(payload.title),
    description: stringValue(payload.description),
    uploader: stringValue(payload.uploader) ?? stringValue(payload.channel) ?? stringValue(payload.creator),
    uploaderId: stringValue(payload.uploader_id) ?? stringValue(payload.channel_id),
    thumbnail: stringValue(payload.thumbnail),
    webpageUrl: stringValue(payload.webpage_url) ?? stringValue(payload.original_url),
    timestamp: numberValue(payload.timestamp),
    uploadDate: stringValue(payload.upload_date),
  };

  return Object.values(metadata).some(Boolean) ? metadata : null;
}

async function runYtDlp(args: string[], options: { timeoutMs: number }): Promise<YtDlpRunResult> {
  let lastResult: YtDlpRunResult | null = null;

  for (const command of ytDlpCandidates()) {
    const result = await runYtDlpCommand(command, args, options);
    lastResult = result;
    if (result.errorCode === "ENOENT") continue;
    return result;
  }

  return lastResult ?? { exitCode: null, stdout: "", stderr: "yt-dlp not found", errorCode: "ENOENT" };
}

function runYtDlpCommand(command: string, args: string[], options: { timeoutMs: number }): Promise<YtDlpRunResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      resolve({ exitCode: null, stdout, stderr, errorCode: "ETIMEDOUT" });
    }, options.timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ exitCode: null, stdout, stderr: error.message, errorCode: error.code });
    });
    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ exitCode, stdout, stderr });
    });
  });
}

function ytDlpCandidates() {
  return Array.from(new Set(["yt-dlp", bundledYtDlpPath()].filter(Boolean) as string[]));
}

function bundledYtDlpPath() {
  try {
    return (require("yt-dlp-exec/src/constants") as { YOUTUBE_DL_PATH?: string }).YOUTUBE_DL_PATH;
  } catch {
    return undefined;
  }
}

async function createCookieFileFromEnv() {
  const cookiesTxt = cleanEnv(process.env.YTDLP_COOKIES_TXT);
  if (!cookiesTxt) return undefined;

  const dir = await mkdtemp(join(tmpdir(), "rasd-ytdlp-"));
  const path = join(dir, "cookies.txt");
  await writeFile(path, cookiesTxt, "utf8");
  return path;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function cleanEnv(value: string | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
