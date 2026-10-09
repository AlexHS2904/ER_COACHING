import "server-only";

import {
  getSupabaseAdmin,
} from "@/lib/supabase/admin";

export async function getPublicTestimonials() {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "testimonials",
      )
      .select(
        `
          id,
          author_name,
          rating,
          content,
          service_name_snapshot,
          avatar_key,
          photo_path,
          created_at
        `,
      )
      .eq(
        "status",
        "approved",
      )
      .eq(
        "consent_to_publish",
        true,
      )
      .order(
        "created_at",
        {
          ascending:
            false,
        },
      );

  if (error) {
    console.error(
      "Public testimonials error:",
      error,
    );

    return [];
  }

  return Promise.all(
    (data ?? []).map(
      async (
        testimonial,
      ) => {
        let photoUrl:
          | string
          | null = null;

        if (
          testimonial.photo_path
        ) {
          const {
            data:
              signed,
          } =
            await supabase
              .storage
              .from(
                "testimonial-photos",
              )
              .createSignedUrl(
                testimonial
                  .photo_path,
                900,
              );

          photoUrl =
            signed
              ?.signedUrl ??
            null;
        }

        return {
          id:
            testimonial.id,

          authorName:
            testimonial
              .author_name,

          rating:
            testimonial.rating,

          content:
            testimonial.content,

          serviceName:
            testimonial
              .service_name_snapshot,

          avatarKey:
            testimonial
              .avatar_key,

          photoUrl,

          createdAt:
            testimonial
              .created_at,
        };
      },
    ),
  );
}