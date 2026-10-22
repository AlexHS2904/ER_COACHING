export type IntakeEmailSection = {
  title: string;

  items: {
    label: string;
    value: string;
  }[];
};

type Props = {
  name: string;
  email: string;
  sourceLabel: string;
  sections:
    IntakeEmailSection[];
};

export default function IntakeSubmissionEmail({
  name,
  email,
  sourceLabel,
  sections,
}: Props) {
  return (
    <html>
      <body
        style={{
          margin: 0,
          padding:
            "36px 16px",
          background:
            "#f1efec",
          fontFamily:
            "Arial, Helvetica, sans-serif",
        }}
      >
        <div
          style={{
            maxWidth:
              "680px",
            margin:
              "0 auto",
          }}
        >
          <div
            style={{
              padding:
                "38px",
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
                  0.7,
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
                  "18px 0 0",
                fontFamily:
                  "Georgia, serif",
                fontSize:
                  "38px",
                lineHeight:
                  1.1,
              }}
            >
              Nuevo formulario
              completado
            </h1>

            <p
              style={{
                margin:
                  "16px 0 0",
                opacity:
                  0.8,
                fontSize:
                  "14px",
              }}
            >
              {sourceLabel}
            </p>
          </div>

          <div
            style={{
              padding:
                "32px 38px",
              background:
                "#ffffff",
              borderBottom:
                "1px solid #ebe6e1",
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
                  "0.18em",
              }}
            >
              CLIENTE
            </p>

            <h2
              style={{
                margin:
                  "10px 0 0",
                color:
                  "#3b2a24",
                fontFamily:
                  "Georgia, serif",
                fontSize:
                  "28px",
              }}
            >
              {name}
            </h2>

            <p
              style={{
                margin:
                  "7px 0 0",
                color:
                  "#766963",
                fontSize:
                  "14px",
              }}
            >
              {email}
            </p>
          </div>

          {sections.map(
            (
              section,
              index,
            ) => (
              <div
                key={
                  section.title
                }
                style={{
                  padding:
                    "30px 38px",
                  background:
                    index %
                      2 ===
                    0
                      ? "#ffffff"
                      : "#faf8f5",
                  borderBottom:
                    "1px solid #ebe6e1",
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    color:
                      "#742b35",
                    fontFamily:
                      "Georgia, serif",
                    fontSize:
                      "23px",
                  }}
                >
                  {
                    section.title
                  }
                </h3>

                {section.items.map(
                  (
                    item,
                  ) => (
                    <div
                      key={
                        item.label
                      }
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
                            "#9a827a",
                          fontSize:
                            "10px",
                          fontWeight:
                            700,
                          letterSpacing:
                            "0.12em",
                          textTransform:
                            "uppercase",
                        }}
                      >
                        {
                          item.label
                        }
                      </p>

                      <p
                        style={{
                          margin:
                            "8px 0 0",
                          whiteSpace:
                            "pre-wrap",
                          color:
                            "#463732",
                          fontSize:
                            "15px",
                          lineHeight:
                            1.7,
                        }}
                      >
                        {
                          item.value ||
                          "Sin respuesta"
                        }
                      </p>
                    </div>
                  ),
                )}
              </div>
            ),
          )}

          <div
            style={{
              padding:
                "26px 38px",
              borderRadius:
                "0 0 24px 24px",
              background:
                "#123e35",
              color:
                "#ffffff",
            }}
          >
            <p
              style={{
                margin: 0,
                opacity:
                  0.8,
                fontSize:
                  "13px",
                lineHeight:
                  1.6,
              }}
            >
              Estas respuestas
              fueron enviadas
              desde el formulario
              privado de Edna Rojo
              Coaching.
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}