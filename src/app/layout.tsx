import "./globals.css";
import "./banking.css";

export const metadata = {
  title: "BM Crédito | Relacionamento e operação comercial",
  description: "Área de trabalho da BM Crédito para gestores e consultores.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
