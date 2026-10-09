import AdminTestimonialsClient from "@/components/admin/AdminTestimonialsClient";

import {
  getSupabaseAdmin,
} from "@/lib/supabase/admin";

export const dynamic =
  "force-dynamic";

export default async function AdminTestimonialsPage() {
  const supabase =
    getSupabaseAdmin();

  const [
    testimonialsResult,
    bookingsResult,
    processesResult,
  ] =
    await Promise.all([
      supabase
        .from(
          "testimonials",
        )
        .select(
          `
            id,
            booking_id,
            process_id,
            author_name,
            rating,
            content,
            consent_to_publish,
            status,
            service_name_snapshot,
            avatar_key,
            photo_path,
            created_at
          `,
        )
        .order(
          "created_at",
          {
            ascending:
              false,
          },
        ),

      supabase
        .from(
          "bookings",
        )
        .select(
          `
            id,
            booking_reference,
            customer_name,
            customer_email,
            service_name_snapshot,
            completed_at,
            ends_at,
            process_id
          `,
        )
        .eq(
          "status",
          "completed",
        )
        .is(
          "process_id",
          null,
        )
        .order(
          "ends_at",
          {
            ascending:
              false,
          },
        )
        .limit(
          50,
        ),

      supabase
        .from(
          "coaching_processes",
        )
        .select(
          `
            id,
            process_reference,
            customer_name,
            customer_email,
            service_name_snapshot,
            completed_at
          `,
        )
        .eq(
          "status",
          "completed",
        )
        .order(
          "completed_at",
          {
            ascending:
              false,
          },
        )
        .limit(
          50,
        ),
    ]);

  const testimonials =
    await Promise.all(
      (
        testimonialsResult
          .data ??
        []
      ).map(
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

            bookingId:
              testimonial
                .booking_id,

            processId:
              testimonial
                .process_id,

            authorName:
              testimonial
                .author_name,

            rating:
              testimonial
                .rating,

            content:
              testimonial
                .content,

            consentToPublish:
              testimonial
                .consent_to_publish,

            status:
              testimonial
                .status,

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

  const reviewedBookingIds =
    new Set(
      testimonials
        .map(
          (
            item,
          ) =>
            item.bookingId,
        )
        .filter(
          Boolean,
        ),
    );

  const reviewedProcessIds =
    new Set(
      testimonials
        .map(
          (
            item,
          ) =>
            item.processId,
        )
        .filter(
          Boolean,
        ),
    );

  const sources = [
    ...(
      bookingsResult
        .data ??
      []
    )
      .filter(
        (
          booking,
        ) =>
          !reviewedBookingIds.has(
            booking.id,
          ),
      )
      .map(
        (
          booking,
        ) => ({
          type:
            "booking" as const,

          id:
            booking.id,

          reference:
            booking
              .booking_reference ??
            "Reserva",

          customerName:
            booking
              .customer_name,

          customerEmail:
            booking
              .customer_email,

          serviceName:
            booking
              .service_name_snapshot ??
            "Sesión",

          completedAt:
            booking
              .completed_at ??
            booking
              .ends_at,
        }),
      ),

    ...(
      processesResult
        .data ??
      []
    )
      .filter(
        (
          process,
        ) =>
          !reviewedProcessIds.has(
            process.id,
          ),
      )
      .map(
        (
          process,
        ) => ({
          type:
            "process" as const,

          id:
            process.id,

          reference:
            process
              .process_reference,

          customerName:
            process
              .customer_name,

          customerEmail:
            process
              .customer_email,

          serviceName:
            process
              .service_name_snapshot,

          completedAt:
            process
              .completed_at,
        }),
      ),
  ].sort(
    (
      a,
      b,
    ) =>
      new Date(
        b.completedAt ??
          0,
      ).getTime() -
      new Date(
        a.completedAt ??
          0,
      ).getTime(),
  );

  return (
    <AdminTestimonialsClient
      testimonials={
        testimonials
      }
      sources={
        sources
      }
    />
  );
}