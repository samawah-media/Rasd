export type DetectedPlatform = "X" | "TikTok" | "Instagram" | "Website" | "Unknown";

export function platformFromUrl(value: string): DetectedPlatform {
  try {
    const host = new URL(value).hostname.replace(/^www\./, "").toLowerCase();
    if (host === "x.com" || host === "twitter.com" || host.endsWith(".x.com") || host.endsWith(".twitter.com")) {
      return "X";
    }
    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
      return "TikTok";
    }
    if (host === "instagram.com" || host === "instagr.am" || host.endsWith(".instagram.com")) {
      return "Instagram";
    }
    return "Website";
  } catch {
    return "Unknown";
  }
}
