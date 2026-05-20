import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import importData from "../data/imports/hidayathon_reports.json";

type CropManifest = {
  schema_version: number;
  generated_by: string;
  mode: string;
  total_items: number;
  sample_requirements: Record<string, number>;
  group_counts: Record<string, number>;
  confidence_counts: Record<string, number>;
  items: CropManifestItem[];
};

type CropManifestItem = {
  item_id: string;
  sample_group: string;
  platform: string;
  original_url: string;
  source_pdf: string;
  report_issue: number | null;
  page: number;
  publisher_username: string;
  sentiment: string;
  source_evidence_image_path: string;
  crop_image_path: string;
  crop_method: string;
  crop_confidence: string;
  crop_box: { left: number; top: number; right: number; bottom: number };
  publisher_profile_image_path: string;
  publisher_profile_crop_method: string;
  publisher_profile_crop_confidence: string;
  publisher_profile_crop_box: { left: number; top: number; right: number; bottom: number };
  source_width: number;
  source_height: number;
  crop_width: number;
  crop_height: number;
  publisher_profile_crop_width: number;
  publisher_profile_crop_height: number;
  ink_coverage: number;
  publisher_profile_ink_coverage: number;
  crop_sha256: string;
  publisher_profile_sha256: string;
  fallback_image_path: string;
};

const projectRoot = resolve(process.cwd());
const publicSampleDir = join(projectRoot, "public", "imports", "legacy-content-crops", "sample");
const publicFullDir = join(projectRoot, "public", "imports", "legacy-content-crops", "full");

function flattenLegacyItems() {
  return importData.reports
    .filter((report) => !report.duplicate_of)
    .flatMap((report) =>
      (report.items ?? []).map((item, index) => ({
        id: [
          report.source_pdf,
          report.issue ?? "dashboard",
          item.page,
          item.platform,
          item.author_name ?? "unknown",
          index,
        ].join("::"),
        evidenceImagePath: item.evidence_image_path,
        originalUrl: item.original_url,
        publisherUsername: item.author_name ?? "unknown",
        sentiment: item.sentiment,
      })),
    );
}

function loadManifest(path: string): CropManifest {
  return JSON.parse(readFileSync(path, "utf8")) as CropManifest;
}

function publicPathToFile(path: string) {
  return join(projectRoot, "public", path.replace(/^\//, ""));
}

function sha256(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readJpegSize(path: string) {
  const buffer = readFileSync(path);
  assert.equal(buffer[0], 0xff);
  assert.equal(buffer[1], 0xd8);

  let offset = 2;
  while (offset < buffer.length) {
    assert.equal(buffer[offset], 0xff);
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7)) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }

  throw new Error(`Could not read JPEG dimensions for ${path}`);
}

function assertValidManifest(manifest: CropManifest, mode: "sample" | "full" = "sample") {
  assert.equal(manifest.schema_version, 1);
  assert.equal(manifest.generated_by, "scripts/extract_content_crops.py");
  assert.equal(manifest.mode, mode);
  if (mode === "sample") {
    assert.equal(manifest.total_items, 10);
    assert.deepEqual(manifest.sample_requirements, { x: 5, news_web_official: 3, other: 2 });
    assert.deepEqual(manifest.group_counts, { x: 5, news_web_official: 3, other: 2 });
    assert.equal(manifest.items.length, 10);
    assert.ok((manifest.confidence_counts.high ?? 0) + (manifest.confidence_counts.medium ?? 0) >= 8);
  } else {
    assert.equal(manifest.total_items, flattenLegacyItems().length);
    assert.deepEqual(manifest.sample_requirements, {});
    assert.deepEqual(manifest.group_counts, { all: flattenLegacyItems().length });
    assert.equal(manifest.items.length, flattenLegacyItems().length);
    assert.equal((manifest.confidence_counts.high ?? 0) + (manifest.confidence_counts.medium ?? 0), manifest.total_items);
  }
}

function assertValidCropOutputs(manifest: CropManifest) {
  const legacyItems = new Map(flattenLegacyItems().map((item) => [item.id, item]));
  const cropHashes = new Set<string>();
  const groups = new Set<string>();

  for (const item of manifest.items) {
    const legacyItem = legacyItems.get(item.item_id);
    assert.ok(legacyItem, `crop item ${item.item_id} must exist in legacy import data`);
    assert.equal(item.source_evidence_image_path, legacyItem.evidenceImagePath);
    assert.equal(item.fallback_image_path, legacyItem.evidenceImagePath);
    assert.equal(item.original_url, legacyItem.originalUrl);
    assert.equal(item.publisher_username, legacyItem.publisherUsername);
    assert.equal(item.sentiment, legacyItem.sentiment);
    assert.ok(["positive", "neutral", "negative"].includes(item.sentiment));
    assert.match(item.original_url, /^https?:\/\//);

    groups.add(item.sample_group);
    assert.ok(["auto", "template"].includes(item.crop_method));
    assert.ok(["high", "medium", "low"].includes(item.crop_confidence));
    assert.ok(["auto", "template"].includes(item.publisher_profile_crop_method));
    assert.ok(["high", "medium", "low"].includes(item.publisher_profile_crop_confidence));
    assert.equal(item.crop_image_path.startsWith(`/imports/legacy-content-crops/${manifest.mode}/`), true);
    assert.equal(item.publisher_profile_image_path.startsWith(`/imports/legacy-content-crops/${manifest.mode}/`), true);
    assert.equal(item.source_evidence_image_path.startsWith("/imports/legacy-pages/"), true);

    const sourceFile = publicPathToFile(item.source_evidence_image_path);
    const cropFile = publicPathToFile(item.crop_image_path);
    const publisherProfileFile = publicPathToFile(item.publisher_profile_image_path);
    assert.equal(existsSync(sourceFile), true, `missing fallback evidence ${sourceFile}`);
    assert.equal(existsSync(cropFile), true, `missing crop ${cropFile}`);
    assert.equal(existsSync(publisherProfileFile), true, `missing publisher profile crop ${publisherProfileFile}`);

    const sourceSize = readJpegSize(sourceFile);
    const cropSize = readJpegSize(cropFile);
    const publisherProfileSize = readJpegSize(publisherProfileFile);
    assert.equal(item.source_width, sourceSize.width);
    assert.equal(item.source_height, sourceSize.height);
    assert.equal(item.crop_width, cropSize.width);
    assert.equal(item.crop_height, cropSize.height);
    assert.equal(item.publisher_profile_crop_width, publisherProfileSize.width);
    assert.equal(item.publisher_profile_crop_height, publisherProfileSize.height);
    assert.equal(item.crop_sha256, sha256(cropFile));
    assert.equal(item.publisher_profile_sha256, sha256(publisherProfileFile));

    assert.ok(item.crop_width >= 300, `crop for ${item.item_id} is too narrow`);
    assert.ok(item.crop_height >= 350, `crop for ${item.item_id} is too short`);
    assert.ok(item.crop_width < item.source_width * 0.5, `crop for ${item.item_id} should not be a full page`);
    assert.ok(item.crop_height < item.source_height * 0.75, `crop for ${item.item_id} should not be a full page`);
    assert.ok(item.ink_coverage > 0.006, `crop for ${item.item_id} appears blank`);
    assert.ok(item.publisher_profile_crop_width >= 250, `publisher profile crop for ${item.item_id} is too narrow`);
    assert.ok(item.publisher_profile_crop_height >= 80, `publisher profile crop for ${item.item_id} is too short`);
    assert.ok(
      item.publisher_profile_crop_width < item.source_width * 0.5,
      `publisher profile crop for ${item.item_id} should not be a full page`,
    );
    assert.ok(
      item.publisher_profile_crop_height < item.source_height * 0.2,
      `publisher profile crop for ${item.item_id} should not be a full page`,
    );
    assert.ok(item.publisher_profile_ink_coverage > 0.004, `publisher profile crop for ${item.item_id} appears blank`);
    assert.ok(item.crop_box.left >= 0 && item.crop_box.top >= 0);
    assert.ok(item.crop_box.right <= item.source_width && item.crop_box.bottom <= item.source_height);
    assert.equal(item.crop_box.right - item.crop_box.left, item.crop_width);
    assert.equal(item.crop_box.bottom - item.crop_box.top, item.crop_height);
    assert.ok(item.publisher_profile_crop_box.left >= 0 && item.publisher_profile_crop_box.top >= 0);
    assert.ok(
      item.publisher_profile_crop_box.right <= item.source_width && item.publisher_profile_crop_box.bottom <= item.source_height,
    );
    assert.equal(item.publisher_profile_crop_box.right - item.publisher_profile_crop_box.left, item.publisher_profile_crop_width);
    assert.equal(item.publisher_profile_crop_box.bottom - item.publisher_profile_crop_box.top, item.publisher_profile_crop_height);

    cropHashes.add(item.crop_sha256);
  }

  assert.deepEqual([...groups].sort(), manifest.mode === "sample" ? ["news_web_official", "other", "x"] : ["all"]);
  assert.equal(cropHashes.size, manifest.items.length, "each crop should be visually distinct");
}

function assertArabicReviewHtml(path: string) {
  const html = readFileSync(path, "utf8");
  assert.match(html, /عينة صور المحتوى/);
  assert.match(html, /تصنيف المحتوى/);
  assert.match(html, /إيجابي/);
  assert.match(html, /فتح الرابط الأصلي/);
  assert.match(html, /الناشر/);
  assert.doesNotMatch(html, /Confidence|Publisher profile|Publisher crop|Original link|legacy content crop sample|content crop/i);
  assert.doesNotMatch(html, /جودة صورة المحتوى|جودة صورة الناشر/);
}

describe("legacy content crop proof of concept", () => {
  it("generates a deterministic 10-item crop sample in a temporary directory", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "rasd-content-crops-"));
    try {
      const outputDir = join(tempRoot, "sample");
      const stdout = execFileSync(
        "python",
        ["scripts/extract_content_crops.py", "--output-dir", outputDir, "--manifest-name", "manifest.json"],
        { cwd: projectRoot, encoding: "utf8" },
      );
      assert.match(stdout, /"ok": true/);

      const manifest = loadManifest(join(outputDir, "manifest.json"));
      assertValidManifest(manifest);
      assert.equal(existsSync(join(outputDir, "review.html")), true);
      assertArabicReviewHtml(join(outputDir, "review.html"));
      assert.equal(manifest.items.every((item) => existsSync(join(outputDir, item.crop_image_path.split("/").pop() ?? ""))), true);
      assert.equal(
        manifest.items.every((item) => existsSync(join(outputDir, item.publisher_profile_image_path.split("/").pop() ?? ""))),
        true,
      );
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("keeps the public crop sample valid and safely tied to legacy fallback evidence", () => {
    const manifest = loadManifest(join(publicSampleDir, "manifest.json"));
    assertValidManifest(manifest);
    assertValidCropOutputs(manifest);
    assert.equal(existsSync(join(publicSampleDir, "review.html")), true);
    assertArabicReviewHtml(join(publicSampleDir, "review.html"));
  });

  it("keeps the full production crop manifest ready for the client report and Supabase import", () => {
    const manifest = loadManifest(join(publicFullDir, "manifest.json"));
    assertValidManifest(manifest, "full");
    assertValidCropOutputs(manifest);
    assert.equal(existsSync(join(publicFullDir, "review.html")), true);
    assertArabicReviewHtml(join(publicFullDir, "review.html"));
  });
});
