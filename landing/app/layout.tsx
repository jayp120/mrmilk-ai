import type { Metadata, Viewport } from 'next';
import './fonts.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mr Milk — From open thread to resolved system.',
  description:
    'Mr Milk AI reads pressure, ambiguity, and half-formed intent, then returns work in a state ready to execute. An operating system for work.',
  openGraph: {
    title: 'Mr Milk',
    description: 'From open thread to resolved system.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#05040A',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
