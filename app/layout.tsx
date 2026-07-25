import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistBody = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-body",
  weight: "100 900",
});

const geistDisplay = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-display",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Bracket.fyi",
  description: "Bracket competition platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#0A0A0A" />
      </head>
      <body
        className={`${geistBody.variable} ${geistDisplay.variable} bg-canvas text-primary antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
