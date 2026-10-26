import { DEFAULT_RATING, type SkillRow } from "@/lib/engine/skills";
import { TACTICS, TACTIC_INFO, type Tactic } from "@/lib/engine/taxonomy";

export type DashboardSkill = Omit<SkillRow, "dueAtMs"> & { dueAt: Date };

function level(theta: number): string {
  if (theta < 950) return "Practicing";
  if (theta <= 1100) return "Getting there";
  return "Strong";
}

function formatDue(value: Date | undefined): string {
  if (!value) return "Not practiced yet";
  return `Next practice ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(value)}`;
}

export function SkillBars({ skills }: { skills: DashboardSkill[] }) {
  const byTactic = new Map<Tactic, DashboardSkill>(skills.map((skill) => [skill.tactic, skill]));
  const rows = TACTICS.map((tactic, index) => ({
    tactic,
    index,
    skill: byTactic.get(tactic),
    theta: byTactic.get(tactic)?.theta ?? DEFAULT_RATING,
  })).sort((a, b) => a.theta - b.theta || a.index - b.index);

  return (
    <ol className="skill-bars" aria-label="Practice skills, weakest first">
      {rows.map(({ tactic, skill, theta }) => {
        const percentage = Math.max(0, Math.min(100, ((theta - 700) / 600) * 100));
        const status = level(theta);
        return (
          <li className="skill-bar-row" key={tactic}>
            <div className="skill-bar-heading">
              <span>{TACTIC_INFO[tactic].label}</span>
              <strong>{status}</strong>
            </div>
            <progress
              className={`skill-progress skill-progress--${status.toLowerCase().replaceAll(" ", "-")}`}
              value={percentage}
              max={100}
              aria-label={`${TACTIC_INFO[tactic].label}: ${status}, rating ${Math.round(theta)}`}
            />
            <p>{formatDue(skill?.dueAt)}</p>
          </li>
        );
      })}
    </ol>
  );
}
