import Link from 'next/link';
import { Card, Logo } from '@/components/ui';

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-12">
      <div className="w-full max-w-[400px]">
        <Link href="/" className="mb-8 flex justify-center">
          <Logo />
        </Link>
        <Card className="p-6 sm:p-8">
          <h1 className="text-[22px] font-semibold leading-8">{title}</h1>
          {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </Card>
        <p className="mt-6 text-center text-muted">{footer}</p>
      </div>
    </main>
  );
}
