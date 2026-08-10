'use client';
/**
 * Legacy checkout location.
 *
 * Checkout now lives at `/pay`, which reads better in a shared link and has a
 * place in the navigation. Payment links are copied into messages, printed on
 * QR codes and stuck to counters, so any link already handed to a customer has
 * to keep working — this forwards it, query intact, rather than breaking it.
 */
import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PAY_PATH } from '@/lib/merchant';

function Redirect() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const query = params.toString();
    // `replace` keeps the dead URL out of history, so Back returns to wherever
    // the customer came from instead of bouncing through the redirect.
    router.replace(query ? `${PAY_PATH}?${query}` : PAY_PATH);
  }, [router, params]);

  return (
    <div className="max-w-lg mx-auto animate-in">
      <div className="glass p-10 text-center text-sm text-ink-muted">
        Opening payment request…
      </div>
    </div>
  );
}

export default function LegacyMerchantPayPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-lg mx-auto animate-in">
          <div className="glass p-10 text-center text-sm text-ink-muted">Loading…</div>
        </div>
      }
    >
      <Redirect />
    </Suspense>
  );
}
