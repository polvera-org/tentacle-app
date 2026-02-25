import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth/auth-context";
import { DeepLinkHandler } from "@/lib/auth/deep-link-handler";
import { AppToaster } from "@/components/ui/app-toaster";
import { EmbeddingModelStartupGate } from "@/components/providers/embedding-model-startup-gate";
import { AppNotificationsProvider } from "@/components/providers/app-notifications-provider";
import { ConsoleBridgeProvider } from "@/components/providers/console-bridge-provider";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#ffffff",
};

export const metadata: Metadata = {
  title: "Tentacle - Voice Notes",
  description: "Voice-first note-taking with automatic semantic organization",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Tentacle",
  },
  icons: {
    icon: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-white text-gray-900 h-full">
        <ConsoleBridgeProvider />
        <AuthProvider>
          <DeepLinkHandler />
          <AppNotificationsProvider>
            <EmbeddingModelStartupGate>
              {children}
              <AppToaster />
            </EmbeddingModelStartupGate>
          </AppNotificationsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
