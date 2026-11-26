// Servidor de retransmissão (TURN) da Cloudflare pras chamadas passarem em qualquer rede (4G, Wi-Fi com bloqueio).
// Só quem está logado no Zap recebe; as credenciais duram poucas horas. Configure na Vercel:
//   CF_TURN_KEY_ID  e  CF_TURN_API_TOKEN   (Cloudflare → Realtime → TURN Server → Create)
const STUN = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }];

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const keyId = process.env.CF_TURN_KEY_ID, token = process.env.CF_TURN_API_TOKEN;
  if (!keyId || !token) return res.status(200).json({ iceServers: STUN, turn: false });
  // confere que é alguém logado no Zap
  const auth = String(req.headers.authorization || "");
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const apikey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
  try {
    const u = await fetch(url + "/auth/v1/user", { headers: { apikey, Authorization: auth } });
    if (!/^Bearer .+/.test(auth) || !u.ok) return res.status(401).json({ error: "faça login" });
    const r = await fetch("https://rtc.live.cloudflare.com/v1/turn/keys/" + encodeURIComponent(keyId) + "/credentials/generate-ice-servers", {
      method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: 14400 }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.iceServers) return res.status(200).json({ iceServers: STUN, turn: false, error: "cloudflare " + r.status });
    const list = Array.isArray(j.iceServers) ? j.iceServers : [j.iceServers];
    return res.status(200).json({ iceServers: list, turn: true });
  } catch (e) {
    return res.status(200).json({ iceServers: STUN, turn: false });
  }
};
