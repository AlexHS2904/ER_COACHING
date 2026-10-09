export const REVIEW_AVATARS = [
  {
    key: "claridad",
    label: "Claridad",
  },
  {
    key: "objetivo",
    label: "Objetivo",
  },
  {
    key: "crecimiento",
    label: "Crecimiento",
  },
  {
    key: "equilibrio",
    label: "Equilibrio",
  },
  {
    key: "avance",
    label: "Avance",
  },
  {
    key: "brujula",
    label: "Brújula",
  },
] as const;

export type ReviewAvatarKey =
  (typeof REVIEW_AVATARS)[number]["key"];

export function isReviewAvatarKey(
  value: unknown,
): value is ReviewAvatarKey {
  return REVIEW_AVATARS.some(
    (avatar) =>
      avatar.key === value,
  );
}