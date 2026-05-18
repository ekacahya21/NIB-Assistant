import type { Metadata } from "next";
import { Hanken_Grotesk } from "next/font/google";
import "./globals.css";

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken-grotesk",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "NIB Assistant - Buat NIB Mudah & Cepat untuk UMKM",
  description: "Asisten cerdas membantu pelaku usaha mikro dan kecil (UMKM) membuat Nomor Induk Berusaha (NIB) dengan mudah.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${hankenGrotesk.variable} h-full antialiased`}
    >
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0..1,0&display=block"
        />
      </head>
      <body className="min-h-full flex flex-col font-sans bg-background text-on-background">
        {children}
      </body>
    </html>
  );
}
