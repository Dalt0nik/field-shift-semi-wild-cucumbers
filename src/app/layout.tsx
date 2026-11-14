import type { Metadata } from 'next';
import { Bricolage_Grotesque, Public_Sans } from 'next/font/google';
import Shell from '@/components/Shell';
import { StoreProvider } from '@/components/store';
import './globals.css';

// the typefaces of the design system
const display = Bricolage_Grotesque({ subsets: ['latin', 'latin-ext'], variable: '--font-display' });
const body = Public_Sans({ subsets: ['latin', 'latin-ext'], variable: '--font-body' });

export const metadata: Metadata = {
  title: 'Field Shift',
  description: 'Crop-rotation decision support for a Lithuanian farm on NASA data: satellite layers, EU farm rules, plan variants and your custom plan, compared on the same characteristics.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <StoreProvider><Shell>{children}</Shell></StoreProvider>
      </body>
    </html>
  );
}
