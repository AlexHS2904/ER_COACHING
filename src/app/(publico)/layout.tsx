import Footer from "@/components/publico/Footer";
import Header from "@/components/publico/Header";

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <Header />

      {children}

      <Footer />
    </>
  );
}