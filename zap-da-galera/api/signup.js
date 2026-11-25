// Cria a conta com usuário + senha (sem precisar de e-mail de confirmação).
// Usa a chave SECRETA service_role, que só existe aqui no servidor.
const hits = new Map();

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "local";
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (recent.length >= 5) return res.status(429).json({ error: "Muitas contas criadas. Espere uns minutos." });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const username = String((body && body.username) || "").trim().toLowerCase();
  const password = String((body && body.password) || "");
  if (!/^[a-z0-9_]{2,20}$/.test(username))
    return res.status(400).json({ error: "Usuário: use de 2 a 20 letras minúsculas, números ou _" });
  if (password.length < 8 || password.length > 72)
    return res.status(400).json({ error: "A senha precisa ter pelo menos 8 caracteres." });

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  const domain = process.env.AUTH_EMAIL_DOMAIN || "users.aifriends.local";
  if (!url || !key) return res.status(500).json({ error: "O site ainda não foi ligado ao Supabase (faltam variáveis na Vercel)." });

  recent.push(now); hits.set(ip, recent);
  try {
    const r = await fetch(url.replace(/\/$/, "") + "/auth/v1/admin/users", {
      method: "POST",
      // Chaves novas (sb_secret_...) vão só no apikey; as antigas (JWT) também no Authorization.
      headers: Object.assign({ apikey: key, "Content-Type": "application/json" }, key.startsWith("eyJ") ? { Authorization: "Bearer " + key } : {}),
      body: JSON.stringify({ email: `${username}@${domain}`, password, email_confirm: true, user_metadata: { username } }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const m = String(j.msg || j.message || j.error_description || j.error || "");
      if (/already|exists|registered/i.test(m)) return res.status(409).json({ error: "Esse nome de usuário já existe." });
      if (/password/i.test(m)) return res.status(400).json({ error: "Senha fraca: " + m });
      return res.status(500).json({ error: "Não deu pra criar a conta agora." });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ error: "Não consegui falar com o Supabase." });
  }
};
