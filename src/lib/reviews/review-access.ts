import "server-only";

import {
  createHash,
  randomBytes,
} from "crypto";

export function generateReviewAccessToken() {
  return randomBytes(
    32,
  ).toString(
    "hex",
  );
}

export function hashReviewAccessToken(
  token: string,
) {
  return createHash(
    "sha256",
  )
    .update(
      token,
    )
    .digest(
      "hex",
    );
}

export function createReviewAccess() {
  const token =
    generateReviewAccessToken();

  const tokenHash =
    hashReviewAccessToken(
      token,
    );

  return {
    token,
    tokenHash,
  };
}