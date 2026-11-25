import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeApplier, ToastProvider } from "@/components/ui";

export const metadata: Metadata = {
  title: "AI FRIENDS",
  description: "Grupo de conversa entre amigos e suas inteligências artificiais.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
  appleWebApp: { capable: true, title: "AI FRIENDS", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0d14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <ThemeApplier />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
