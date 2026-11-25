// Chamado pelo banco a cada mensagem nova: manda a notificação para o celular de quem está na conversa.
// Não precisa de senha: só recebe o id, confere tudo no banco e cada mensagem só notifica uma vez.
const webpush = require("web-push");
const { rest, vapid, ok } = require("./_lib");
const enc = encodeURIComponent;

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST" || !ok()) return res.status(200).json({ skipped: true });
  let body = req.body; if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const id = String((body && body.id) || "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return res.status(400).json({ error: "id inválido" });
  try {
    // marca como avisada (se outra chamada já marcou, não faz nada)
    const marked = await rest("zap_messages?id=eq." + id + "&pushed=eq.false&select=*", {
      method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ pushed: true }),
    });
    const m = marked && marked[0];
    if (!m || Date.now() - Date.parse(m.created_at) > 120000) return res.status(200).json({ sent: 0 });
    const [chats, members, senders] = await Promise.all([
      rest("zap_chats?id=eq." + m.chat_id + "&select=id,is_group,name,emoji"),
      rest("zap_members?chat_id=eq." + m.chat_id + "&select=user_id,muted"),
      rest("zap_profiles?id=eq." + m.user_id + "&select=nick,username"),
    ]);
    const chat = chats[0]; if (!chat) return res.status(200).json({ sent: 0 });
    const s = senders[0] || {}; const who = s.nick || s.username || "Alguém";
    let targets = members.filter((x) => x.user_id !== m.user_id && !x.muted).map((x) => x.user_id);
    if (!targets.length) return res.status(200).json({ sent: 0 });
    const blocks = await rest("zap_blocks?blocked_id=eq." + m.user_id + "&user_id=in.(" + targets.join(",") + ")&select=user_id");
    const blocked = new Set(blocks.map((b) => b.user_id)); targets = targets.filter((t) => !blocked.has(t));
    if (!targets.length) return res.status(200).json({ sent: 0 });
    const subs = await rest("zap_push_subs?user_id=in.(" + targets.join(",") + ")&select=endpoint,p256dh,auth");
    if (!subs.length) return res.status(200).json({ sent: 0 });

    const what = m.event ? m.text : m.deleted ? "" :
      (m.text || (m.media && m.media.type === "image" ? "📷 Foto" : m.media && m.media.type === "audio" ? "🎤 Áudio" : ""));
    const payload = JSON.stringify({
      title: chat.is_group ? (chat.emoji || "👥") + " " + (chat.name || "Grupo") : who,
      body: (chat.is_group || m.event ? who + ": " : "") + String(what).slice(0, 140),
      chat: chat.id, tag: "zap-" + chat.id,
    });
    const k = await vapid();
    webpush.setVapidDetails("https://zap-da-galera.vercel.app", k.publicKey, k.privateKey);
    let sent = 0;
    await Promise.all(subs.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 3600, urgency: "high" });
        sent++;
      } catch (e) {
        if (e && (e.statusCode === 404 || e.statusCode === 410)) {
          await rest("zap_push_subs?endpoint=eq." + enc(sub.endpoint), { method: "DELETE" }).catch(() => {});
        }
      }
    }));
    return res.status(200).json({ sent });
  } catch (e) {
    return res.status(500).json({ error: "falhou" });
  }
};
