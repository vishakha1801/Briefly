import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { MeshBackground } from "@/components/ui/mesh-background";

export const metadata: Metadata = {
  title: "Briefly",
  description: "Voice briefs, notes, and follow-ups for sales calls.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="grain-bg min-h-full flex flex-col text-foreground">
        <MeshBackground />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
