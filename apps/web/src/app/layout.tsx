import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tempo Trivia",
  description: "Guess the artist and title before the clock runs out.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased text-white">
        {children}
      </body>
    </html>
  );
}
