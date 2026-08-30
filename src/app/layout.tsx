import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { themeInitScript } from "@/components/marketing/theme-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "PostloomAI — Marketing on Autopilot",
  description:
    "PostloomAI by SMB Robotics: the autonomous AI marketing platform that plans, creates and publishes scroll-stopping content across every platform, 24/7.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className="h-full antialiased"
        suppressHydrationWarning
      >
        <body
          className="min-h-full flex flex-col font-sans bg-background text-foreground antialiased"
          suppressHydrationWarning
        >
          <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
          {children}
          <SpeedInsights />
        </body>
      </html>
    </ClerkProvider>
  );
}
