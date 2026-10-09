import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "react-email";

type Props = {
  customerName: string;
  serviceName: string;

  dateText: string;
  timeText: string;

  durationMinutes: number;
  sessionCount: number;

  priceText: string;

  bookingReference: string;

  meetUrl: string | null;
  calendarUrl: string | null;

  processAccessUrl?:
    | string
    | null;
};

export default function CustomerBookingEmail({
  customerName,
  serviceName,
  dateText,
  timeText,
  durationMinutes,
  sessionCount,
  priceText,
  bookingReference,
  meetUrl,
  calendarUrl,
  processAccessUrl = null,
}: Props) {
  return (
    <Html lang="es">
      <Head />

      <Preview>
        Tu sesión de coaching está confirmada.
      </Preview>

      <Body style={body}>
        <Container style={container}>
          <Text style={brand}>
            ER COACHING
          </Text>

          <Heading style={title}>
            Tu sesión está confirmada.
          </Heading>

          <Text style={intro}>
            Hola {customerName}, tu espacio
            quedó reservado correctamente.
          </Text>

          {/* =============================================
              DATOS DE LA SESIÓN
          ============================================== */}

          <Section style={ticket}>
            <Text style={label}>
              TU SESIÓN
            </Text>

            <Heading
              as="h2"
              style={service}
            >
              {serviceName}
            </Heading>

            <Hr style={divider} />

            <Text style={detail}>
              <strong>Fecha</strong>
              <br />
              {dateText}
            </Text>

            <Text style={detail}>
              <strong>Hora</strong>
              <br />
              {timeText}
            </Text>

            <Text style={detail}>
              <strong>Duración</strong>
              <br />
              {durationMinutes} min
            </Text>

            <Text style={detail}>
              <strong>Sesiones</strong>
              <br />
              {sessionCount}
            </Text>

            <Text style={detail}>
              <strong>Precio</strong>
              <br />
              {priceText}
            </Text>

            {meetUrl && (
              <Button
                href={meetUrl}
                style={primaryButton}
              >
                Entrar a Google Meet
              </Button>
            )}

            {calendarUrl && (
              <Button
                href={calendarUrl}
                style={secondaryButton}
              >
                Ver en Google Calendar
              </Button>
            )}
          </Section>

          {/* =============================================
              PORTAL DEL PROCESO

              Solo aparece cuando recibimos
              processAccessUrl.
          ============================================== */}

          {processAccessUrl && (
            <Section
              style={processSection}
            >
              <Text
                style={processLabel}
              >
                TU PROCESO DE COACHING
              </Text>

              <Heading
                as="h2"
                style={processTitle}
              >
                Tus sesiones,
                en un solo lugar.
              </Heading>

              <Text
                style={processText}
              >
                Desde tu espacio
                privado puedes
                consultar tus
                sesiones, agendar las
                siguientes y acceder
                a tus videollamadas.
              </Text>

              <Button
                href={
                  processAccessUrl
                }
                style={processButton}
              >
                Gestionar mis sesiones
              </Button>

              <Text
                style={privateText}
              >
                Este enlace es privado.
                No lo compartas con
                otras personas.
              </Text>
            </Section>
          )}

          <Text style={reference}>
            Reserva {bookingReference}
          </Text>

          <Text style={footer}>
            Guarda este correo para tener a la mano
            los datos de tu sesión.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

/* =========================================================
   STYLES
========================================================= */

const body = {
  backgroundColor:
    "#f1f1ed",

  fontFamily:
    "Arial, Helvetica, sans-serif",

  margin:
    "0",

  padding:
    "32px 12px",
};

const container = {
  backgroundColor:
    "#ffffff",

  borderRadius:
    "24px",

  margin:
    "0 auto",

  maxWidth:
    "580px",

  padding:
    "38px",
};

const brand = {
  color:
    "#682830",

  fontSize:
    "12px",

  fontWeight:
    "700",

  letterSpacing:
    "4px",
};

const title = {
  color:
    "#3b2a24",

  fontFamily:
    "Georgia, serif",

  fontSize:
    "38px",

  fontWeight:
    "500",

  lineHeight:
    "1.1",
};

const intro = {
  color:
    "#3b2a24",

  fontSize:
    "15px",

  lineHeight:
    "1.7",

  opacity:
    "0.7",
};

const ticket = {
  backgroundColor:
    "#f1f1ed",

  border:
    "1px solid #ddd4cf",

  borderRadius:
    "20px",

  marginTop:
    "28px",

  padding:
    "26px",
};

const label = {
  color:
    "#682830",

  fontSize:
    "10px",

  fontWeight:
    "700",

  letterSpacing:
    "3px",
};

const service = {
  color:
    "#3b2a24",

  fontFamily:
    "Georgia, serif",

  fontSize:
    "28px",

  fontWeight:
    "500",
};

const divider = {
  borderColor:
    "#d9cfca",
};

const detail = {
  color:
    "#3b2a24",

  fontSize:
    "14px",

  lineHeight:
    "1.55",
};

const primaryButton = {
  backgroundColor:
    "#682830",

  borderRadius:
    "10px",

  color:
    "#f1f1ed",

  display:
    "block",

  marginTop:
    "24px",

  padding:
    "14px 20px",

  textAlign:
    "center" as const,

  textDecoration:
    "none",
};

const secondaryButton = {
  border:
    "1px solid #a48c82",

  borderRadius:
    "10px",

  color:
    "#3b2a24",

  display:
    "block",

  marginTop:
    "10px",

  padding:
    "13px 20px",

  textAlign:
    "center" as const,

  textDecoration:
    "none",
};

/* =========================================================
   PROCESS PORTAL
========================================================= */

const processSection = {
  backgroundColor:
    "#ffffff",

  border:
    "1px solid #d9cfca",

  borderRadius:
    "20px",

  marginTop:
    "20px",

  padding:
    "26px",
};

const processLabel = {
  color:
    "#0f3d34",

  fontSize:
    "10px",

  fontWeight:
    "700",

  letterSpacing:
    "3px",

  margin:
    "0",
};

const processTitle = {
  color:
    "#3b2a24",

  fontFamily:
    "Georgia, serif",

  fontSize:
    "25px",

  fontWeight:
    "500",

  lineHeight:
    "1.2",

  marginBottom:
    "12px",
};

const processText = {
  color:
    "#3b2a24",

  fontSize:
    "14px",

  lineHeight:
    "1.7",

  opacity:
    "0.7",
};

const processButton = {
  backgroundColor:
    "#0f3d34",

  borderRadius:
    "10px",

  color:
    "#f1f1ed",

  display:
    "block",

  marginTop:
    "20px",

  padding:
    "14px 20px",

  textAlign:
    "center" as const,

  textDecoration:
    "none",
};

const privateText = {
  color:
    "#3b2a24",

  fontSize:
    "11px",

  lineHeight:
    "1.6",

  marginBottom:
    "0",

  marginTop:
    "16px",

  opacity:
    "0.45",
};

const reference = {
  color:
    "#682830",

  fontSize:
    "12px",

  fontWeight:
    "700",

  letterSpacing:
    "1px",

  marginTop:
    "28px",
};

const footer = {
  color:
    "#3b2a24",

  fontSize:
    "12px",

  lineHeight:
    "1.6",

  opacity:
    "0.5",
};