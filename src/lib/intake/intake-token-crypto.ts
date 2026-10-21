import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "crypto";

function getKey() {
  const raw =
    process.env
      .INTAKE_TOKEN_ENCRYPTION_KEY;

  if (!raw) {
    throw new Error(
      "Missing INTAKE_TOKEN_ENCRYPTION_KEY",
    );
  }

  const key =
    Buffer.from(
      raw,
      "base64",
    );

  if (key.length !== 32) {
    throw new Error(
      "INTAKE_TOKEN_ENCRYPTION_KEY must decode to 32 bytes",
    );
  }

  return key;
}

export function encryptIntakeToken(
  token: string,
) {
  const iv =
    randomBytes(12);

  const cipher =
    createCipheriv(
      "aes-256-gcm",
      getKey(),
      iv,
    );

  const encrypted =
    Buffer.concat([
      cipher.update(
        token,
        "utf8",
      ),
      cipher.final(),
    ]);

  const tag =
    cipher.getAuthTag();

  return [
    iv.toString(
      "base64url",
    ),
    tag.toString(
      "base64url",
    ),
    encrypted.toString(
      "base64url",
    ),
  ].join(".");
}

export function decryptIntakeToken(
  payload: string,
) {
  const [
    ivValue,
    tagValue,
    encryptedValue,
  ] =
    payload.split(".");

  if (
    !ivValue ||
    !tagValue ||
    !encryptedValue
  ) {
    throw new Error(
      "Invalid encrypted intake token",
    );
  }

  const decipher =
    createDecipheriv(
      "aes-256-gcm",
      getKey(),
      Buffer.from(
        ivValue,
        "base64url",
      ),
    );

  decipher.setAuthTag(
    Buffer.from(
      tagValue,
      "base64url",
    ),
  );

  const decrypted =
    Buffer.concat([
      decipher.update(
        Buffer.from(
          encryptedValue,
          "base64url",
        ),
      ),
      decipher.final(),
    ]);

  return decrypted.toString(
    "utf8",
  );
}