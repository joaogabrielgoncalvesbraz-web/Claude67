import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import ChatRoom from "@/components/ChatRoom";

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) redirect("/login");
  return <ChatRoom groupId={id} userId={data.user.id} />;
}
