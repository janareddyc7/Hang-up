import { Suspense } from "react";
import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return (
    <main id="main-content" className="site-main">
      <section className="home-hero" aria-labelledby="sign-in-title">
        <h1 id="sign-in-title" className="home-title">Sign in to Hang Up</h1>
        <p className="home-copy">{"We'll email you a link to sign in. No password needed."}</p>
        <Suspense fallback={<p className="mt-8 text-base">Loading sign-in form…</p>}>
          <SignInForm />
        </Suspense>
      </section>
    </main>
  );
}
