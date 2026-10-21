type Props = {
  customerName: string;
  serviceName: string;
  formUrl: string;
};

export default function IntakeFormReadyEmail({
  customerName,
  serviceName,
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
            "#f3f1ee",
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
            background:
              "#ffffff",
            padding:
              "40px",
            borderRadius:
              "24px",
          }}
        >
          <p
            style={{
              margin: 0,
              color:
                "#742b35",
              fontSize:
                "12px",
              fontWeight:
                700,
              letterSpacing:
                "0.18em",
            }}
          >
            EDNA ROJO |
            COACHING
          </p>

          <h1
            style={{
              margin:
                "20px 0 0",
              color:
                "#3c2d28",
              fontFamily:
                "Georgia, serif",
              fontSize:
                "36px",
              lineHeight:
                1.1,
            }}
          >
            Tu formulario
            previo está listo.
          </h1>

          <p
            style={{
              margin:
                "24px 0 0",
              color:
                "#55443e",
              fontSize:
                "15px",
              lineHeight:
                1.7,
            }}
          >
            Hola{" "}
            {customerName}.
          </p>

          <p
            style={{
              color:
                "#55443e",
              fontSize:
                "15px",
              lineHeight:
                1.7,
            }}
          >
            Hemos confirmado
            tu pago para{" "}
            <strong>
              {serviceName}
            </strong>
            .
          </p>

          <p
            style={{
              color:
                "#55443e",
              fontSize:
                "15px",
              lineHeight:
                1.7,
            }}
          >
            Antes de tu sesión,
            te invitamos a
            completar este breve
            formulario. Nos
            ayudará a preparar
            mejor el espacio
            contigo.
          </p>

          <a
            href={formUrl}
            style={{
              display:
                "inline-block",
              marginTop:
                "22px",
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

          <p
            style={{
              marginTop:
                "28px",
              color:
                "#8b7d76",
              fontSize:
                "12px",
              lineHeight:
                1.6,
            }}
          >
            Este enlace es
            privado. No lo
            compartas con otras
            personas.
          </p>
        </div>
      </body>
    </html>
  );
}