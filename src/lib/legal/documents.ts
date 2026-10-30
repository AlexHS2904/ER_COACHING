import type { Metadata } from "next";

// Public version identifiers validated on requests. Durable records remain
// subject to the proposed database integration; these constants do not persist them.
export const LEGAL_TERMS_VERSION = "2026-10-29.2";
export const PRIVACY_NOTICE_VERSION = "2026-10-29.2";
export const LEGAL_UPDATED_LABEL = "29 de octubre de 2026";

export const legalRobotsMetadata: Metadata["robots"] = {
  index: false,
  follow: false,
  nocache: true,
  noarchive: true,
  nosnippet: true,
  noimageindex: true,
  googleBot: {
    index: false, follow: false, noimageindex: true, nocache: true,
    noarchive: true, nosnippet: true,
    "max-snippet": 0, "max-image-preview": "none", "max-video-preview": 0,
  },
};
