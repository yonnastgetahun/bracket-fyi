import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";

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
  description: "Run your bracket. Share one link. Nobody makes an account.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Brackets",
  },
  icons: {
    apple: "/icon-192.png",
  },
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
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
