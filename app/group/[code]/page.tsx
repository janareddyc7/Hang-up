import { notFound } from "next/navigation";
import { GroupParticipant } from "@/components/group/group-participant";

export default async function GroupPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^[A-Za-z]{4}$/.test(code)) notFound();
  return <GroupParticipant code={code.toUpperCase()} />;
}
