const X_DOMAINS = [
  "x.com",
  "twitter.com",
  "vxtwitter.com",
  "fxtwitter.com",
  "fixupx.com",
  "fixvx.com",
];

/**
 * Checks if a given URL is a valid X/Twitter tweet URL.
 * Supports various domains (x.com, twitter.com, mobile.x.com, vxtwitter, etc.)
 */
export function isValidXUrl(value: string): boolean {
  try {
    const url = new URL(value);
    // Strip leading "www." or "mobile." from hostname
    const hostname = url.hostname.replace(/^(www\.|mobile\.)/i, "").toLowerCase();

    if (!X_DOMAINS.includes(hostname)) {
      return false;
    }

    // Path must follow standard structure: /<username>/status/<tweetId>
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 3) return false;

    const [username, statusWord, tweetId] = parts;
    if (statusWord.toLowerCase() !== "status") return false;
    if (!/^\d+$/u.test(tweetId)) return false;

    // Standard Twitter handles can only have letters, numbers, and underscores
    if (!/^\w+$/u.test(username)) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Parses an X/Twitter URL and returns the tweetId and the handle (with @ prefix).
 * Returns null if the URL is invalid.
 */
export function parseXUrl(value: string): { tweetId: string; handle: string } | null {
  if (!isValidXUrl(value)) return null;
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    const [username, , tweetId] = parts;
    return {
      tweetId,
      handle: username.startsWith("@") ? username : `@${username}`,
    };
  } catch {
    return null;
  }
}

/**
 * Normalizes any valid X/Twitter URL into a clean canonical format:
 * https://x.com/username/status/tweetId
 */
export function canonicalizeXUrl(value: string): string {
  const parsed = parseXUrl(value);
  if (!parsed) return value;
  const rawHandle = parsed.handle.replace(/^@/u, "");
  return `https://x.com/${rawHandle}/status/${parsed.tweetId}`;
}
