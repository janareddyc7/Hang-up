"use client";

import { useCallback, useEffect, useState } from "react";
import { getGroupSnapshot, joinGroup, voteHangUp } from "../../../app/actions/groups";
import { Button } from "@/components/ui/button";

type Snapshot = { currentK: number; status: "open" | "live" | "closed"; votes: Array<{ k: number; count: number }>; voteRecorded: boolean };

export function GroupParticipant({ code }: { code: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [message, setMessage] = useState("Joining the practice room…");
  const [joining, setJoining] = useState(true);
  const [voting, setVoting] = useState(false);
  const roomStatus = snapshot?.status;

  const refresh = useCallback(async () => {
    try {
      const result = await getGroupSnapshot({ code });
      if (result.ok) {
        setSnapshot({ currentK: result.currentK, status: result.status, votes: result.votes, voteRecorded: result.voteRecorded });
        setMessage("");
      } else setMessage(result.error);
    } catch { setMessage("Reconnecting to the room… Your recorded vote will be kept."); }
  }, [code]);

  useEffect(() => {
    let active = true;
    void joinGroup({ code }).then((result) => {
      if (!active) return;
      if (!result.ok) setMessage(result.error);
      else {
        setSnapshot({ currentK: result.currentK, status: result.status, votes: [], voteRecorded: result.voteRecorded });
        setMessage("");
      }
    }).catch(() => { if (active) setMessage("Could not join the room. Check the code and try again."); })
      .finally(() => { if (active) setJoining(false); });
    return () => { active = false; };
  }, [code]);

  useEffect(() => {
    if (!roomStatus || roomStatus === "closed") return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await refresh();
      if (active) timer = setTimeout(() => void poll(), 2000);
    };
    timer = setTimeout(() => void poll(), 2000);
    return () => { active = false; clearTimeout(timer); };
  }, [refresh, roomStatus]);

  async function vote() {
    if (!snapshot || snapshot.status !== "live" || snapshot.currentK < 1 || snapshot.voteRecorded) return;
    setVoting(true);
    try {
      const result = await voteHangUp({ code, k: snapshot.currentK });
      if (!result.ok) setMessage(result.error);
      else {
        setSnapshot((current) => current ? { ...current, voteRecorded: true } : current);
        setMessage("Your vote is in.");
      }
    } catch { setMessage("Your vote could not be sent. Please try again."); }
    finally { setVoting(false); }
  }

  return (
    <main id="main-content" className="group-participant-main" aria-labelledby="group-participant-title">
      <p className="eyebrow">Hang Up · group practice</p>
      <h1 id="group-participant-title">Room {code}</h1>
      {joining && <p role="status">{message}</p>}
      {!joining && message && <p className="group-status" role="status">{message}</p>}
      {snapshot?.status === "open" && <p className="group-status">You’re in. The facilitator will start the fictional caller shortly.</p>}
      {snapshot?.status === "live" && (
        <section className="group-vote-panel" aria-label="Practice call vote">
          <p className="group-turn">Caller line {snapshot.currentK || "is starting"}</p>
          <Button className="group-vote-button" size="lg" disabled={voting || snapshot.currentK < 1 || snapshot.voteRecorded} onClick={() => void vote()}>
            {snapshot.voteRecorded ? "Vote recorded" : "Hang up now"}
          </Button>
          <p>Tap once when you think the caller has crossed a line.</p>
        </section>
      )}
      {snapshot?.status === "closed" && <p className="group-status">This practice room has ended. Look at the projected replay with the group.</p>}
    </main>
  );
}
