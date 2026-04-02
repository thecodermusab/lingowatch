import { ReviewRating, ReviewData } from "@/types";

type ReviewTimingPreview = {
  minutes: number;
  label: string;
};

function formatPreviewLabel(totalMinutes: number) {
  if (totalMinutes < 60) return `${totalMinutes}m`;
  if (totalMinutes < 1440) return `${Math.round(totalMinutes / 60)}h`;
  return `${Math.round(totalMinutes / 1440)}d`;
}

export function getReviewTimingPreview(review?: ReviewData): Record<ReviewRating, ReviewTimingPreview> {
  const confidence = review?.confidenceScore ?? 0;
  const reviewCount = review?.reviewCount ?? 0;

  const hardMinutes = confidence >= 70 ? 2 * 1440 : 1440;
  const goodMinutes = reviewCount >= 8 ? 7 * 1440 : confidence >= 70 ? 4 * 1440 : 3 * 1440;
  const easyMinutes = reviewCount >= 8 ? 14 * 1440 : confidence >= 70 ? 10 * 1440 : 7 * 1440;

  return {
    again: { minutes: 10, label: formatPreviewLabel(10) },
    hard: { minutes: hardMinutes, label: formatPreviewLabel(hardMinutes) },
    good: { minutes: goodMinutes, label: formatPreviewLabel(goodMinutes) },
    easy: { minutes: easyMinutes, label: formatPreviewLabel(easyMinutes) },
  };
}

export function buildNextReviewDate(review: ReviewData | undefined, rating: ReviewRating, from = new Date()) {
  const preview = getReviewTimingPreview(review)[rating];
  return new Date(from.getTime() + preview.minutes * 60 * 1000);
}
