import type { CSSProperties } from "react";
import { TACTIC_INFO, type Tactic } from "@/lib/engine/taxonomy";
import { TACTIC_COLOR_TOKEN } from "@/lib/tactic-color";
import { cn } from "@/lib/utils";

type TacticChipProps = {
  tactic: Tactic;
};

export function TacticChip({ tactic }: TacticChipProps) {
  const info = TACTIC_INFO[tactic];
  const style = {
    "--tactic-color": `var(${TACTIC_COLOR_TOKEN[tactic]})`,
  } as CSSProperties;

  return (
    <span
      className={cn("tactic-chip", info.brightLine && "tactic-chip--bright")}
      style={style}
      role="img"
      aria-label={`Tactic: ${info.label}${info.brightLine ? ", bright line" : ""}`}
      title={info.explain}
    >
      {info.label}
      {info.brightLine && <span className="visually-hidden">, bright line</span>}
    </span>
  );
}
