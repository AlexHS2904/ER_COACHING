import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createProcessAccess,
} from "@/lib/coaching/process-access";

import {
  sendProcessAccessEmail,
} from "@/lib/email/send-process-access-email";

import {
  getSupabaseAdmin,
} from "@/lib/supabase/admin";

import {
  createClient,
} from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function isUuid(
  value: string,
) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function POST(
  request: NextRequest,
  {
    params,
  }: RouteContext,
) {
  try {
    /* =====================================================
       1. VALIDAR ADMIN
    ===================================================== */

    const authSupabase =
      await createClient();

    const {
      data:
        claimsData,
    } =
      await authSupabase.auth.getClaims();

    const userId =
      claimsData?.claims?.sub;

    if (!userId) {
      return NextResponse.json(
        {
          error:
            "No autorizado.",
        },
        {
          status:
            401,
        },
      );
    }

    const {
      data:
        admin,

      error:
        adminError,
    } =
      await authSupabase
        .from(
          "admin_users",
        )
        .select(
          `
            user_id,
            active
          `,
        )
        .eq(
          "user_id",
          userId,
        )
        .maybeSingle();

    if (
      adminError ||
      !admin ||
      !admin.active
    ) {
      return NextResponse.json(
        {
          error:
            "No autorizado.",
        },
        {
          status:
            403,
        },
      );
    }

    /* =====================================================
       2. VALIDAR PROCESO
    ===================================================== */

    const {
      id,
    } =
      await params;

    if (!isUuid(id)) {
      return NextResponse.json(
        {
          error:
            "El proceso no es válido.",
        },
        {
          status:
            400,
        },
      );
    }

    const supabase =
      getSupabaseAdmin();

    const {
      data:
        process,

      error:
        processError,
    } =
      await supabase
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
            access_token_hash,
            status
          `,
        )
        .eq(
          "id",
          id,
        )
        .maybeSingle();

    if (
      processError ||
      !process
    ) {
      if (processError) {
        console.error(
          "Error reading coaching process:",
          processError,
        );
      }

      return NextResponse.json(
        {
          error:
            "No se encontró el proceso.",
        },
        {
          status:
            404,
        },
      );
    }

    /*
      Un proceso cerrado internamente no debe
      recibir un nuevo acceso desde esta acción.

      Los procesos completed sí pueden recibirlo,
      porque el cliente puede querer consultar
      su historial después de terminar.
    */
    if (
      process.status ===
      "cancelled"
    ) {
      return NextResponse.json(
        {
          error:
            "Este proceso está cerrado.",
        },
        {
          status:
            409,
        },
      );
    }

    if (
      !process.access_token_hash
    ) {
      return NextResponse.json(
        {
          error:
            "El proceso no tiene un acceso válido para regenerar.",
        },
        {
          status:
            409,
        },
      );
    }

    /* =====================================================
       3. GENERAR TOKEN NUEVO
    ===================================================== */

    const oldTokenHash =
      process.access_token_hash;

    const {
      token,
      tokenHash,
    } =
      createProcessAccess();

    /*
      Primero cambiamos el hash.

      A partir de aquí el enlace anterior deja
      de funcionar.
    */

    const {
      data:
        updatedProcess,

      error:
        updateError,
    } =
      await supabase
        .from(
          "coaching_processes",
        )
        .update({
          access_token_hash:
            tokenHash,
        })
        .eq(
          "id",
          process.id,
        )
        /*
          Compare-and-swap:

          solo actualizamos si nadie regeneró
          este mismo acceso mientras procesábamos
          la petición.
        */
        .eq(
          "access_token_hash",
          oldTokenHash,
        )
        .select(
          "id",
        )
        .maybeSingle();

    if (
      updateError ||
      !updatedProcess
    ) {
      console.error(
        "Error rotating process access:",
        updateError,
      );

      return NextResponse.json(
        {
          error:
            "El acceso cambió mientras se procesaba la solicitud. Intenta nuevamente.",
        },
        {
          status:
            409,
        },
      );
    }

    /* =====================================================
       4. CREAR URL PRIVADA

       El token solo existe en memoria durante
       esta petición.
    ===================================================== */

    const processAccessUrl =
      new URL(
        `/proceso/${token}`,
        request.nextUrl.origin,
      ).toString();

    /* =====================================================
       5. ENVIAR CORREO

       Si falla, restauramos el hash anterior.
    ===================================================== */

    try {
      const emailResult =
        await sendProcessAccessEmail({
          processId:
            process.id,

          customerName:
            process.customer_name,

          customerEmail:
            process.customer_email,

          serviceName:
            process.service_name_snapshot,

          processReference:
            process.process_reference,

          processAccessUrl,

          /*
            No usamos el token real en esta key.
          */
          idempotencyKey:
            `process-access/${process.id}/${tokenHash.slice(
              0,
              16,
            )}`,
        });

      if (
        !emailResult.id ||
        emailResult.error
      ) {
        throw new Error(
          emailResult.error ??
            "Resend no confirmó el envío.",
        );
      }

      /* ===================================================
         6. ÉXITO

         Importante:
         NO regresamos token ni URL privada al navegador.
      =================================================== */

      return NextResponse.json(
        {
          success:
            true,

          message:
            "El nuevo acceso fue enviado al cliente.",
        },
        {
          status:
            200,
        },
      );
    } catch (emailError) {
      console.error(
        "Process access email error:",
        emailError,
      );

      /*
        El correo no salió.

        Intentamos restaurar el hash anterior,
        siempre que esta petición siga siendo la
        propietaria del hash nuevo.
      */

      const {
        data:
          restoredProcess,

        error:
          restoreError,
      } =
        await supabase
          .from(
            "coaching_processes",
          )
          .update({
            access_token_hash:
              oldTokenHash,
          })
          .eq(
            "id",
            process.id,
          )
          .eq(
            "access_token_hash",
            tokenHash,
          )
          .select(
            "id",
          )
          .maybeSingle();

      if (
        restoreError ||
        !restoredProcess
      ) {
        console.error(
          "CRITICAL: process access rollback failed:",
          restoreError,
        );

        return NextResponse.json(
          {
            error:
              "No se pudo enviar el nuevo acceso y ocurrió un problema restaurando el enlace anterior. Intenta regenerarlo nuevamente.",
          },
          {
            status:
              500,
          },
        );
      }

      return NextResponse.json(
        {
          error:
            "No se pudo enviar el correo. El acceso anterior sigue siendo válido.",
        },
        {
          status:
            502,
        },
      );
    }
  } catch (error) {
    console.error(
      "Unexpected process access regeneration error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "No fue posible regenerar el acceso.",
      },
      {
        status:
          500,
      },
    );
  }
}