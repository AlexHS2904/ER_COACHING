import {
  createHash,
  randomBytes,
} from "crypto";

export function createIntakeAccess() {
  const token =
    randomBytes(
      32,
    ).toString(
      "hex",
    );

  const tokenHash =
    hashIntakeToken(
      token,
    );

  return {
    token,
    tokenHash,
  };
}

export function hashIntakeToken(
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

export function isValidIntakeToken(
  token: string,
) {
  return /^[a-f0-9]{64}$/.test(
    token,
  );
}