import { JudgePicker } from "@/components/judge-picker";
import { personas } from "@/lib/personas";

const featured = ["gov-consumer-safety", "grandchild-emergency", "bank-fraud-department"] as const;

export default async function JudgePage({ searchParams }: { searchParams: Promise<{ text?: string }> }) {
  const query = await searchParams;
  const scenarios = featured.map((id) => {
    const persona = personas.find((item) => item.id === id);
    if (!persona) throw new Error(`Missing Judge scenario: ${id}`);
    return {
      id: persona.id,
      title: persona.title,
      callerName: persona.callerName,
      callerIdDisplay: persona.callerIdDisplay,
      difficulty: persona.id === "bank-fraud-department" ? "easy" as const : "realistic" as const,
    };
  });

  return (
    <main id="main-content" className="judge-main">
      <section className="judge-intro" aria-labelledby="judge-title">
        <p className="eyebrow">A quick practice round</p>
        <h1 id="judge-title">Practice a safe response before a real call.</h1>
        <p>Choose a caller. You can talk or type. No real call is placed, and you can stop whenever you want.</p>
      </section>
      <JudgePicker scenarios={scenarios} initialTextOnly={query.text === "1"} />
      <p className="judge-safety-note">Every caller is fictional. The replay explains the pressure tactics and gives you one habit to take with you.</p>
    </main>
  );
}
