"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, MessageSquareText, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";

type Scenario = {
  id: string;
  title: string;
  callerName: string;
  callerIdDisplay: string;
  difficulty: "easy" | "realistic" | "relentless";
};

export function JudgePicker({ scenarios, initialTextOnly = false }: { scenarios: Scenario[]; initialTextOnly?: boolean }) {
  const [textOnly, setTextOnly] = useState(initialTextOnly);

  return (
    <section className="judge-choices" aria-label="Choose a practice caller">
      <div className="judge-mode-control">
        <div>
          <h2>Choose how to practice</h2>
          <p>Text practice stays on this app and does not start an ElevenLabs voice session.</p>
        </div>
        <Button type="button" variant={textOnly ? "default" : "outline"} aria-pressed={textOnly} onClick={() => setTextOnly((value) => !value)}>
          {textOnly ? <MessageSquareText aria-hidden="true" /> : <Phone aria-hidden="true" />}
          {textOnly ? "Text practice selected" : "Text instead of voice"}
        </Button>
      </div>

      <div className="judge-scenario-grid">
        {scenarios.map((scenario, index) => {
          const href = `/call/${scenario.id}?mode=judge&difficulty=${scenario.difficulty}${textOnly ? "&offline=1" : ""}`;
          return (
            <article className="judge-scenario-card" key={scenario.id}>
              <span className="judge-card-number" aria-hidden="true">0{index + 1}</span>
              <p className="judge-caller-id">{scenario.callerIdDisplay}</p>
              <h3>{scenario.title}</h3>
              <p className="judge-caller-name">Caller: {scenario.callerName}</p>
              <p className="judge-difficulty">{scenario.difficulty === "easy" ? "A gentler first round" : "Realistic pressure"}</p>
              <Button asChild size="lg" className="judge-start-button">
                <Link href={href}>Start this practice <ArrowRight aria-hidden="true" /></Link>
              </Button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
