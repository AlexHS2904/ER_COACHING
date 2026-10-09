type Props = {
  name: string;
};

export default function ContactConfirmationEmail({
  name,
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
            Gracias por escribir.
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
            Hola {name}. Tu
            mensaje fue recibido
            correctamente.
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
            Revisaré tu consulta
            y me pondré en contacto
            contigo tan pronto como
            sea posible.
          </p>

          <div
            style={{
              marginTop:
                "26px",

              padding:
                "18px",

              borderRadius:
                "14px",

              background:
                "#0f3d340d",

              color:
                "#0f3d34",

              fontSize:
                "13px",

              lineHeight:
                1.6,
            }}
          >
            No necesitas responder
            a este correo para que
            tu consulta quede
            registrada.
          </div>
        </div>
      </body>
    </html>
  );
}