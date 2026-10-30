import "server-only";

// Public legal identity only. Never populate from secret environment files.
// Identity and contact confirmed by the provider. The address is legal contact
// information, not a public walk-in office; do not duplicate it in client code.
export const legalProvider = {
  commercialName: "ER Coaching",
  legalName: "Edna Aracely Rojo Castillo",
  address: "Calle Getsemani 2405, Col. El Barreal, C.P. 72810, San Andrés Cholula, Puebla, México.",
  phone: "668 164 2208",
  publicContactEmail: "ednarojo_coaching@outlook.com",
  country: "México",
} as const;
