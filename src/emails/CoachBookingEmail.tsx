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
  customerEmail: string;
  customerPhone: string | null;

  serviceName: string;

  dateText: string;
  timeText: string;

  durationMinutes: number;
  sessionCount: number;

  priceText: string;

  bookingReference: string;

  notes: string | null;

  meetUrl: string | null;
};

export default function CoachBookingEmail({
  customerName,
  customerEmail,
  customerPhone,
  serviceName,
  dateText,
  timeText,
  durationMinutes,
  sessionCount,
  priceText,
  bookingReference,
  notes,
  meetUrl,
}: Props) {
  return (
    <Html lang="es">
      <Head />

      <Preview>
        Nueva reserva de coaching.
      </Preview>

      <Body style={body}>
        <Container style={container}>
          <Text style={brand}>
            ER COACHING
          </Text>

          <Heading style={title}>
            Nueva reserva.
          </Heading>

          <Section style={ticket}>
            <Text style={label}>
              CLIENTE
            </Text>

            <Heading
              as="h2"
              style={customer}
            >
              {customerName}
            </Heading>

            <Text style={detail}>
              {customerEmail}
              <br />
              {customerPhone ||
                "Sin teléfono"}
            </Text>

            <Hr style={divider} />

            <Text style={detail}>
              <strong>{serviceName}</strong>
              <br />
              {dateText}
              <br />
              {timeText}
              <br />
              {sessionCount}{" "}
              {sessionCount === 1
                ? "sesión"
                : "sesiones"}{" "}
              · {durationMinutes} min c/u
              <br />
              {priceText}
            </Text>

            {notes && (
              <>
                <Hr style={divider} />

                <Text style={label}>
                  NOTAS DEL CLIENTE
                </Text>

                <Text style={detail}>
                  {notes}
                </Text>
              </>
            )}

            {meetUrl && (
              <Button
                href={meetUrl}
                style={button}
              >
                Abrir Google Meet
              </Button>
            )}
          </Section>

          <Text style={reference}>
            Reserva {bookingReference}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const body = {
  backgroundColor: "#f1f1ed",
  fontFamily:
    "Arial, Helvetica, sans-serif",
  padding: "32px 12px",
};

const container = {
  backgroundColor: "#ffffff",
  borderRadius: "24px",
  margin: "0 auto",
  maxWidth: "580px",
  padding: "38px",
};

const brand = {
  color: "#0f3d34",
  fontSize: "12px",
  fontWeight: "700",
  letterSpacing: "4px",
};

const title = {
  color: "#3b2a24",
  fontFamily: "Georgia, serif",
  fontSize: "38px",
  fontWeight: "500",
};

const ticket = {
  backgroundColor: "#f1f1ed",
  border: "1px solid #ddd4cf",
  borderRadius: "20px",
  marginTop: "25px",
  padding: "26px",
};

const label = {
  color: "#682830",
  fontSize: "10px",
  fontWeight: "700",
  letterSpacing: "3px",
};

const customer = {
  color: "#3b2a24",
  fontFamily: "Georgia, serif",
  fontSize: "27px",
};

const detail = {
  color: "#3b2a24",
  fontSize: "14px",
  lineHeight: "1.7",
};

const divider = {
  borderColor: "#d9cfca",
};

const button = {
  backgroundColor: "#0f3d34",
  borderRadius: "10px",
  color: "#f1f1ed",
  display: "block",
  marginTop: "24px",
  padding: "14px 20px",
  textAlign: "center" as const,
  textDecoration: "none",
};

const reference = {
  color: "#682830",
  fontSize: "12px",
  fontWeight: "700",
  marginTop: "25px",
};