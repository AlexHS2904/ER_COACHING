type Props = {
  customerName: string;
  serviceName: string;
  reviewUrl: string;
};

export default function ReviewInvitationEmail({
  customerName,
  serviceName,
  reviewUrl,
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
              "580px",

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
                "0",

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
            Nos encantaría
            conocer tu
            experiencia.
          </h1>

          <p
            style={{
              margin:
                "22px 0 0",

              color:
                "#3b2a24",

              fontSize:
                "15px",

              lineHeight:
                1.7,
            }}
          >
            Hola{" "}
            {customerName}.
            Gracias por haber
            formado parte de{" "}
            <strong>
              {serviceName}
            </strong>
            .
          </p>

          <p
            style={{
              color:
                "#3b2a24",

              fontSize:
                "15px",

              lineHeight:
                1.7,
            }}
          >
            Si deseas compartir
            tu experiencia, puedes
            hacerlo desde el
            siguiente enlace
            privado.
          </p>

          <a
            href={
              reviewUrl
            }
            style={{
              display:
                "block",

              marginTop:
                "26px",

              padding:
                "15px 22px",

              borderRadius:
                "12px",

              background:
                "#682830",

              color:
                "#ffffff",

              fontWeight:
                700,

              textAlign:
                "center",

              textDecoration:
                "none",
            }}
          >
            Compartir mi
            experiencia
          </a>

          <p
            style={{
              margin:
                "26px 0 0",

              color:
                "#3b2a24",

              opacity:
                0.55,

              fontSize:
                "12px",

              lineHeight:
                1.7,
            }}
          >
            Este enlace es
            personal y puede
            utilizarse una sola
            vez.
          </p>
        </div>
      </body>
    </html>
  );
}