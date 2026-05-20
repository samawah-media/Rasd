import cropManifest from "../../public/imports/legacy-content-crops/full/manifest.json";

type RawCropManifestItem = (typeof cropManifest.items)[number];

export type LegacyContentCrop = {
  itemId: string;
  contentImagePath: string;
  publisherProfileImagePath: string;
  sourceEvidenceImagePath: string;
  cropConfidence: string;
  publisherProfileCropConfidence: string;
  cropWidth: number;
  cropHeight: number;
  publisherProfileCropWidth: number;
  publisherProfileCropHeight: number;
  cropSha256: string;
  publisherProfileSha256: string;
};

export type LegacyContentCropSummary = {
  mode: string;
  totalItems: number;
  outputDir: string;
  confidenceCounts: Record<string, number>;
};

const cropsByItemId = new Map<string, LegacyContentCrop>(
  cropManifest.items.map((item: RawCropManifestItem) => [
    item.item_id,
    {
      itemId: item.item_id,
      contentImagePath: item.crop_image_path,
      publisherProfileImagePath: item.publisher_profile_image_path,
      sourceEvidenceImagePath: item.source_evidence_image_path,
      cropConfidence: item.crop_confidence,
      publisherProfileCropConfidence: item.publisher_profile_crop_confidence,
      cropWidth: item.crop_width,
      cropHeight: item.crop_height,
      publisherProfileCropWidth: item.publisher_profile_crop_width,
      publisherProfileCropHeight: item.publisher_profile_crop_height,
      cropSha256: item.crop_sha256,
      publisherProfileSha256: item.publisher_profile_sha256,
    },
  ]),
);

export function getLegacyContentCropForItemId(itemId: string) {
  return cropsByItemId.get(itemId) ?? null;
}

export function getLegacyContentCropSummary(): LegacyContentCropSummary {
  return {
    mode: cropManifest.mode,
    totalItems: cropManifest.total_items,
    outputDir: cropManifest.output_dir,
    confidenceCounts: cropManifest.confidence_counts,
  };
}

