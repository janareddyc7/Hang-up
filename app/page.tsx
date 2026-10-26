import Link from "next/link";
import { ArrowRight, PhoneCall, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { personas } from "@/lib/personas";

const decorativeTimes = ["Missed · 2 min ago", "Missed · 14 min ago", "Missed · 28 min ago", "Missed · 41 min ago", "Missed · 53 min ago", "Missed · 1 hr ago"];

export default function HomePage() {
  return (
    <main id="main-content" className="site-main home-main">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero-icon" aria-hidden="true"><PhoneCall /></div>
        <p className="eyebrow">Practice before it matters</p>
        <h1 id="home-title" className="home-title">Practice saying no before a real scammer calls.</h1>
        <p className="home-copy">Take a safe practice call, then see the moment the pressure started working on you.</p>
        <div className="home-actions">
          <Button asChild size="lg"><Link href="/judge">Choose a practice call <ArrowRight aria-hidden="true" /></Link></Button>
          <Button asChild variant="outline" size="lg"><Link href="/judge?text=1">Practice with text</Link></Button>
        </div>
        <p className="home-disclosure"><ShieldCheck aria-hidden="true" /> Fictional callers only. No real calls are made.</p>
      </section>

      <section className="recent-calls" aria-labelledby="recent-calls-title">
        <div className="recent-calls-heading">
          <div>
            <p className="eyebrow">Pick up safely</p>
            <h2 id="recent-calls-title">Practice callers</h2>
          </div>
          <Link className="recent-calls-all" href="/judge">Choose from three practice calls <ArrowRight aria-hidden="true" /></Link>
        </div>
        <ul className="recent-calls-list">
          {personas.map((persona, index) => (
            <li className="recent-call-item" key={persona.id}>
              <div className="recent-call-icon" aria-hidden="true"><PhoneCall /></div>
              <div className="recent-call-copy">
                <p className="recent-call-meta">{persona.callerIdDisplay} <span>{decorativeTimes[index % decorativeTimes.length]}</span></p>
                <h3>{persona.title}</h3>
                <p className="recent-call-persona">Practice caller: {persona.callerName}</p>
              </div>
              <Button asChild variant="outline" className="recent-call-action">
                <Link href={`/call/${persona.id}?mode=judge&difficulty=easy`}>Practice <ArrowRight aria-hidden="true" /></Link>
              </Button>
            </li>
          ))}
        </ul>
        <p className="home-note">The “missed call” times are decorative. These are practice scenarios, not real callers or alerts.</p>
      </section>
    </main>
  );
}
