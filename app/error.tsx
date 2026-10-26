"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return <main id="main-content" className="site-main">
    <section className="home-hero" aria-labelledby="error-title">
      <p className="eyebrow">Connection interrupted</p>
      <h1 id="error-title">Let’s try that again.</h1>
      <p>This page could not load. Check your connection and retry. Your saved practice stays in your account.</p>
      <div className="home-actions"><Button onClick={retry}>Try again</Button><Link href="/">Go to Home</Link></div>
    </section>
  </main>;
}
