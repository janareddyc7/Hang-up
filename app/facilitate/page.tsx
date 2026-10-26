import { personas } from "@/lib/personas";
import { GroupFacilitatorSetup } from "@/components/group/group-facilitator-setup";

export default function FacilitatePage() {
  const scenarioOptions = personas.map(({ id, title }) => ({ id, title }));
  return (
    <main id="main-content" className="site-main group-main">
      <p className="eyebrow">For a room, class, or family</p>
      <h1>Practice together.</h1>
      <p className="group-intro">Project one fictional caller. Everyone else joins on a phone and taps when they would hang up. No participant account is needed.</p>
      <GroupFacilitatorSetup scenarios={scenarioOptions} />
    </main>
  );
}
