import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'ArcFlow — Stablecoin SuperApp',
  description: 'Send, Swap, Bridge, Pay & Manage your stablecoins on ARC.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-arc-dark min-h-screen">
        <div className="fixed inset-0 pointer-events-none -z-10">
          <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-arc-500/5 rounded-full blur-[128px]" />
          <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-mint-500/5 rounded-full blur-[128px]" />
        </div>
        <Navbar />
        <main>{children}</main>
      </body>
    </html>
  );
}