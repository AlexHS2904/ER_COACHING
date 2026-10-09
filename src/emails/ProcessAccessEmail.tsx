import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "react-email";

type Props = {
  customerName: string;
  serviceName: string;
  processReference: string;
  processAccessUrl: string;
};

export default function ProcessAccessEmail({
  customerName,
  serviceName,
  processReference,
  processAccessUrl,
}: Props) {
  return (
    <Html lang="es">
      <Head />

      <Preview>
        Tu nuevo acceso al proceso de coaching.
      </Preview>

      <Body style={body}>
        <Container style={container}>
          <Text style={brand}>
            ER COACHING
          </Text>

          <Heading style={title}>
            Tu nuevo acceso está listo.
          </Heading>

          <Text style={paragraph}>
            Hola {customerName}, se generó un nuevo
            enlace privado para acceder a tu proceso
            de coaching.
          </Text>

          <Section style={card}>
            <Text style={label}>
              TU PROCESO
            </Text>

            <Heading
              as="h2"
              style={service}
            >
              {serviceName}
            </Heading>

            <Text style={reference}>
              Referencia: {processReference}
            </Text>

            <Button
              href={processAccessUrl}
              style={button}
            >
              Acceder a mi proceso
            </Button>
          </Section>

          <Text style={warning}>
            Por seguridad, el enlace anterior dejó de
            ser válido. Guarda este correo y no compartas
            el enlace con otras personas.
          </Text>

          <Text style={footer}>
            Desde tu espacio privado podrás consultar
            tus sesiones y agendar las siguientes cuando
            estén disponibles.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const body = {
  margin: "0",
  padding: "32px 16px",
  backgroundColor: "#f1f1ed",
  fontFamily:
    "Arial, Helvetica, sans-serif",
};

const container = {
  maxWidth: "580px",
  margin: "0 auto",
  padding: "38px",
  backgroundColor: "#ffffff",
  borderRadius: "24px",
};

const brand = {
  margin: "0 0 18px",
  color: "#682830",
  fontSize: "12px",
  fontWeight: "700",
  letterSpacing: "0.22em",
};

const title = {
  margin: "0",
  color: "#3b2a24",
  fontFamily:
    "Georgia, Times New Roman, serif",
  fontSize: "34px",
  lineHeight: "1.1",
};

const paragraph = {
  margin: "20px 0 0",
  color: "#3b2a24",
  fontSize: "15px",
  lineHeight: "1.7",
};

const card = {
  marginTop: "28px",
  padding: "26px",
  backgroundColor: "#f7f5f1",
  borderRadius: "18px",
};

const label = {
  margin: "0",
  color: "#682830",
  fontSize: "11px",
  fontWeight: "700",
  letterSpacing: "0.18em",
};

const service = {
  margin: "10px 0 0",
  color: "#3b2a24",
  fontFamily:
    "Georgia, Times New Roman, serif",
  fontSize: "25px",
};

const reference = {
  margin: "12px 0 0",
  color: "#3b2a24",
  opacity: "0.6",
  fontSize: "13px",
};

const button = {
  display: "block",
  marginTop: "24px",
  padding: "14px 22px",
  borderRadius: "12px",
  backgroundColor: "#682830",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: "700",
  textAlign: "center" as const,
  textDecoration: "none",
};

const warning = {
  margin: "26px 0 0",
  padding: "16px",
  borderRadius: "12px",
  backgroundColor: "#0f3d340d",
  color: "#0f3d34",
  fontSize: "13px",
  lineHeight: "1.6",
};

const footer = {
  margin: "24px 0 0",
  color: "#3b2a24",
  opacity: "0.5",
  fontSize: "12px",
  lineHeight: "1.7",
};