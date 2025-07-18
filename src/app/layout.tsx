import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ThemeToggle from "@/components/ThemeToggle";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "My Health Companion",
  description: "Your AI-powered medical assistant for health insights and report analysis.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Script to set dark mode class on html based on device preference */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var d = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  if (d) document.documentElement.classList.add('dark');
                  else document.documentElement.classList.remove('dark');
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body className={inter.className + " bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100 transition-colors duration-300 min-h-screen"}>
        <ThemeToggle />
        {children}
      </body>
    </html>
  );
}
