type Props = {
  name: string;
  formUrl: string;
};

export default function ManualIntakeInvitationEmail({
  name,
  formUrl,
}: Props) {
  return (
    <html>
      <body
        style={{
          margin: 0,
          padding:
            "32px 16px",
          background:
            "#f1efec",
          fontFamily:
            "Arial, Helvetica, sans-serif",
        }}
      >
        <div
          style={{
            maxWidth:
              "580px",
            margin:
              "0 auto",
          }}
        >
          <div
            style={{
              padding:
                "38px 40px",
              borderRadius:
                "24px 24px 0 0",
              background:
                "#742b35",
              color:
                "#ffffff",
            }}
          >
            <p
              style={{
                margin: 0,
                opacity:
                  0.75,
                fontSize:
                  "11px",
                fontWeight:
                  700,
                letterSpacing:
                  "0.22em",
              }}
            >
              EDNA ROJO | COACHING
            </p>

            <h1
              style={{
                margin:
                  "20px 0 0",
                fontFamily:
                  "Georgia, serif",
                fontSize:
                  "37px",
                fontWeight:
                  500,
                lineHeight:
                  1.15,
              }}
            >
              Un primer paso
              para conocerte.
            </h1>
          </div>

          <div
            style={{
              padding:
                "38px 40px",
              borderRadius:
                "0 0 24px 24px",
              background:
                "#ffffff",
            }}
          >
            <p
              style={{
                margin: 0,
                color:
                  "#463732",
                fontSize:
                  "16px",
                lineHeight:
                  1.7,
              }}
            >
              Hola {name},
            </p>

            <p
              style={{
                margin:
                  "18px 0 0",
                color:
                  "#665650",
                fontSize:
                  "15px",
                lineHeight:
                  1.75,
              }}
            >
              Edna te ha invitado
              a completar un breve
              formulario previo.
              Tus respuestas ayudarán
              a conocer mejor tu
              situación actual y a
              preparar un espacio
              pensado para ti.
            </p>

            <p
              style={{
                margin:
                  "16px 0 0",
                color:
                  "#665650",
                fontSize:
                  "15px",
                lineHeight:
                  1.75,
              }}
            >
              No hay respuestas
              correctas. Puedes
              responder con honestidad
              y a tu propio ritmo.
            </p>

            <a
              href={
                formUrl
              }
              style={{
                display:
                  "inline-block",
                marginTop:
                  "28px",
                padding:
                  "15px 24px",
                borderRadius:
                  "10px",
                background:
                  "#742b35",
                color:
                  "#ffffff",
                textDecoration:
                  "none",
                fontSize:
                  "14px",
                fontWeight:
                  700,
              }}
            >
              Completar formulario
            </a>

            <div
              style={{
                marginTop:
                  "30px",
                padding:
                  "18px 20px",
                borderRadius:
                  "14px",
                background:
                  "#f7f4f1",
              }}
            >
              <p
                style={{
                  margin: 0,
                  color:
                    "#7b6c65",
                  fontSize:
                    "12px",
                  lineHeight:
                    1.65,
                }}
              >
                Este enlace es
                personal y está
                asociado a tu
                formulario. Te
                recomendamos no
                compartirlo con otras
                personas.
              </p>
            </div>

            <p
              style={{
                margin:
                  "28px 0 0",
                color:
                  "#9a8b84",
                fontSize:
                  "12px",
                lineHeight:
                  1.6,
              }}
            >
              Edna Rojo Coaching
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}