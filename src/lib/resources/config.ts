import "server-only";

export const RESOURCE_BUCKET =
  "resources";

export const MAX_RESOURCE_SIZE =
  20 * 1024 * 1024;

export const MAX_COVER_SIZE =
  5 * 1024 * 1024;

export const ALLOWED_RESOURCE_MIME_TYPES =
  new Set([
    "application/pdf",
    "application/epub+zip",

    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",

    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

    "text/plain",

    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

export const ALLOWED_COVER_MIME_TYPES =
  new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

export function sanitizeFilename(
  filename: string,
) {
  const lastDot =
    filename.lastIndexOf(".");

  const extension =
    lastDot >= 0
      ? filename
          .slice(lastDot)
          .toLowerCase()
          .replace(
            /[^a-z0-9.]/g,
            "",
          )
      : "";

  const base =
    (
      lastDot >= 0
        ? filename.slice(0, lastDot)
        : filename
    )
      .normalize("NFD")
      .replace(
        /[\u0300-\u036f]/g,
        "",
      )
      .toLowerCase()
      .replace(
        /[^a-z0-9]+/g,
        "-",
      )
      .replace(
        /^-+|-+$/g,
        "",
      )
      .slice(0, 80);

  return `${
    base || "archivo"
  }${extension}`;
}

export function isValidHttpUrl(
  value: string,
) {
  try {
    const url =
      new URL(value);

    return (
      url.protocol === "http:" ||
      url.protocol === "https:"
    );
  } catch {
    return false;
  }
}

export function belongsToAdminUpload(
  path: string,
  userId: string,
) {
  return path.startsWith(
    `admin/${userId}/`,
  );
}