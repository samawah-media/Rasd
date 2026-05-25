import type { Sentiment } from "@/lib/types";

const POSITIVE_TERMS = [
  "نجاح",
  "ناجح",
  "مميز",
  "إشادة",
  "اشادة",
  "أشاد",
  "يشيد",
  "إنجاز",
  "انجاز",
  "فاز",
  "تأهل",
  "ابتكار",
  "دعم",
  "فرصة",
  "رائع",
  "ممتاز",
  "تميز",
  "اختتام",
  "تعاون",
];

const NEGATIVE_TERMS = [
  "انتقاد",
  "ينتقد",
  "أزمة",
  "ازمة",
  "فشل",
  "تعثر",
  "تحذير",
  "شكوى",
  "مشكلة",
  "مشكلات",
  "اتهام",
  "رفض",
  "مخاوف",
  "تأخر",
  "تعطل",
  "غضب",
  "جدل",
  "مخالف",
];

export function estimateSentiment(text: string): Sentiment {
  const normalized = text.toLowerCase();
  const positiveHits = countSentimentTerms(normalized, POSITIVE_TERMS);
  const negativeHits = countSentimentTerms(normalized, NEGATIVE_TERMS);

  if (negativeHits > positiveHits) return "negative";
  if (positiveHits > negativeHits) return "positive";
  return "neutral";
}

export function estimateSentimentConfidence(sentiment: Sentiment) {
  return sentiment === "neutral" ? 0 : 70;
}

function countSentimentTerms(text: string, terms: string[]) {
  return terms.reduce((count, term) => count + (text.includes(term) ? 1 : 0), 0);
}
