type Props = {
  name: string;
  code: string;
};

export default function IntakeVerificationEmail({
  name,
  code,
}: Props) {
  return (
    <html>
      <body
        style={{
          margin: 0,
          padding:
            "32px 16px",
          background:
            "#f2efeb",
          fontFamily:
            "Arial, Helvetica, sans-serif",
        }}
      >
        <div
          style={{
            maxWidth:
              "560px",
            margin:
              "0 auto",
            padding:
              "40px",
            background:
              "#ffffff",
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
              color:
                "#3b2a24",
              fontFamily:
                "Georgia, serif",
              fontSize:
                "34px",
            }}
          >
            Confirma que eres tú
          </h1>

          <p
            style={{
              marginTop:
                "22px",
              color:
                "#665650",
              fontSize:
                "15px",
              lineHeight:
                1.7,
            }}
          >
            Hola {name}.
            Utiliza el siguiente
            código para acceder a
            tu formulario.
          </p>

          <div
            style={{
              margin:
                "30px 0",
              padding:
                "22px",
              borderRadius:
                "16px",
              background:
                "#742b35",
              textAlign:
                "center",
            }}
          >
            <span
              style={{
                color:
                  "#ffffff",
                fontSize:
                  "34px",
                fontWeight:
                  700,
                letterSpacing:
                  "0.25em",
              }}
            >
              {code}
            </span>
          </div>

          <p
            style={{
              color:
                "#8b7d76",
              fontSize:
                "13px",
              lineHeight:
                1.6,
            }}
          >
            El código vence en
            10 minutos. Si tú no
            solicitaste el acceso,
            puedes ignorar este
            mensaje.
          </p>
        </div>
      </body>
    </html>
  );
}