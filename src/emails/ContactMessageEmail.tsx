type Props = {
  name: string;
  email: string;
  subject: string;
  message: string;
};

const SUBJECT_LABELS: Record<
  string,
  string
> = {
  individual:
    "Sesión individual",

  process:
    "Proceso de coaching",

  group:
    "Taller o sesión grupal",

  other:
    "Otra consulta",
};

export default function ContactMessageEmail({
  name,
  email,
  subject,
  message,
}: Props) {
  return (
    <html>
      <body
        style={{
          margin:
            0,

          padding:
            "32px 16px",

          background:
            "#f1f1ed",

          fontFamily:
            "Arial, Helvetica, sans-serif",
        }}
      >
        <div
          style={{
            maxWidth:
              "600px",

            margin:
              "0 auto",

            padding:
              "38px",

            borderRadius:
              "24px",

            background:
              "#ffffff",
          }}
        >
          <p
            style={{
              margin:
                0,

              color:
                "#682830",

              fontSize:
                "12px",

              fontWeight:
                700,

              letterSpacing:
                "0.2em",
            }}
          >
            ER COACHING
          </p>

          <h1
            style={{
              margin:
                "18px 0 0",

              color:
                "#3b2a24",

              fontFamily:
                "Georgia, serif",

              fontSize:
                "34px",

              lineHeight:
                1.1,
            }}
          >
            Nueva consulta desde
            el sitio web.
          </h1>

          <div
            style={{
              marginTop:
                "28px",

              padding:
                "24px",

              borderRadius:
                "16px",

              background:
                "#f7f5f1",
            }}
          >
            <p
              style={{
                margin:
                  "0 0 10px",
              }}
            >
              <strong>
                Nombre:
              </strong>{" "}
              {name}
            </p>

            <p
              style={{
                margin:
                  "0 0 10px",
              }}
            >
              <strong>
                Correo:
              </strong>{" "}
              {email}
            </p>

            <p
              style={{
                margin:
                  0,
              }}
            >
              <strong>
                Motivo:
              </strong>{" "}
              {
                SUBJECT_LABELS[
                  subject
                ] ??
                subject
              }
            </p>
          </div>

          <div
            style={{
              marginTop:
                "24px",
            }}
          >
            <p
              style={{
                margin:
                  0,

                color:
                  "#682830",

                fontSize:
                  "11px",

                fontWeight:
                  700,

                letterSpacing:
                  "0.16em",
              }}
            >
              MENSAJE
            </p>

            <p
              style={{
                margin:
                  "12px 0 0",

                whiteSpace:
                  "pre-wrap",

                color:
                  "#3b2a24",

                fontSize:
                  "15px",

                lineHeight:
                  1.7,
              }}
            >
              {message}
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}