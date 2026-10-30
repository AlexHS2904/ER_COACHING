import type { NextConfig } from "next";

/*
  Cabeceras de seguridad para todo el sitio.

  La CSP solo incluye directivas que no bloquean scripts
  ni estilos (frame-ancestors, base-uri, form-action,
  object-src), así que no rompe Next.js ni Tailwind.
*/
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "Content-Security-Policy",
    value:
      "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,

  // Next's development request logger would otherwise print private bearer
  // links and OAuth codes. Hosting-provider access logs need separate controls.
  logging: {
    incomingRequests: {
      ignore: [
        /^\/(?:formulario|proceso|resena)\/[^/?#]+(?:[/?#]|$)/i,
        /^\/api\/(?:intake|processes|reviews)\/[^/?#]+(?:[/?#]|$)/i,
        /^\/(?:auth\/confirm|api\/google\/callback)(?:[/?#]|$)/i,
      ],
    },
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      ...["/aviso-de-privacidad", "/terminos-y-condiciones"].map((source) => ({
        source,
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet, noimageindex" },
          { key: "Cache-Control", value: "private, no-store, no-cache, max-age=0, must-revalidate" },
          { key: "CDN-Cache-Control", value: "no-store" },
          { key: "Vercel-CDN-Cache-Control", value: "no-store" },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" },
        ],
      })),
      ...[
        "/formulario/:path*",
        "/proceso/:path*",
        "/resena/:path*",
        "/api/intake/:path*",
        "/api/processes/:path*",
        "/api/reviews/:path*",
        "/auth/confirm",
        "/api/google/callback",
      ].map((source) => ({
        source,
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      })),
    ];
  },
};

export default nextConfig;
