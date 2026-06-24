export const RECOMMENDATION_TITLE_MAX_CARD = 120;
export const RECOMMENDATION_TITLE_MAX_NOTICE = 48;
export const RECOMMENDATION_TITLE_MAX_MARKER = 60;
export const RECOMMENDATION_TITLE_MAX_PREFIX = 40;

export function truncateRecommendationTitle(text: string, maxLength: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

export function recommendationNoticeLabel(title: string, arxivId: string): string {
  const shortTitle = truncateRecommendationTitle(title, RECOMMENDATION_TITLE_MAX_NOTICE);
  return `${shortTitle} (${arxivId})`;
}

export function recommendationPrefixEntry(title: string, arxivId: string): string {
  const shortTitle = truncateRecommendationTitle(title, RECOMMENDATION_TITLE_MAX_PREFIX);
  return `${shortTitle} (${arxivId})`;
}
