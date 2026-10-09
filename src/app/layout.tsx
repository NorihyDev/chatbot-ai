import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nova — A little clarity, a lot of possibility",
  description: "Your thoughtful AI companion for writing, coding, learning, and everyday ideas.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
