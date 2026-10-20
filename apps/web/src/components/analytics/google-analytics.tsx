"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { getGaMeasurementId, shouldTrackPath } from "@/lib/analytics/ga";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * App Router client navigations: skip the first effect (initial page view
 * already sent by the inline gtag `config`), then `config` with `page_path`
 * so SPA transitions count.
 */
function GaPageViews({ measurementId }: { measurementId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isFirstPath = useRef(true);

  useEffect(() => {
    if (!shouldTrackPath(pathname)) return;

    if (isFirstPath.current) {
      isFirstPath.current = false;
      return;
    }

    if (typeof window.gtag !== "function") return;

    const qs = searchParams.toString();
    const pagePath = qs ? `${pathname}?${qs}` : pathname;
    window.gtag("config", measurementId, { page_path: pagePath });
  }, [measurementId, pathname, searchParams]);

  return null;
}

export function GoogleAnalytics() {
  const measurementId = getGaMeasurementId();
  const pathname = usePathname();

  if (!measurementId || !shouldTrackPath(pathname)) {
    return null;
  }

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script id="ga-gtag-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${measurementId}');
        `}
      </Script>
      <Suspense fallback={null}>
        <GaPageViews measurementId={measurementId} />
      </Suspense>
    </>
  );
}
