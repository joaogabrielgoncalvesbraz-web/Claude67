// Ajudantes do servidor: falar com o Supabase usando a chave secreta (só aqui no servidor).
const URL_ = () => (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";

async function rest(path, opts = {}) {
  const key = KEY();
  const headers = Object.assign({ apikey: key, "Content-Type": "application/json" },
    key.startsWith("eyJ") ? { Authorization: "Bearer " + key } : {}, opts.headers || {});
  const r = await fetch(URL_() + "/rest/v1/" + path, Object.assign({}, opts, { headers }));
  const txt = await r.text();
  let data = null; try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  if (!r.ok) throw new Error("supabase " + r.status + " " + String(txt).slice(0, 200));
  return data;
}

// Chaves VAPID das notificações: criadas uma vez e guardadas no banco (tabela zap_config).
async function vapid() {
  const webpush = require("web-push");
  let rows = await rest("zap_config?key=in.(vapid_public,vapid_private)&select=key,value");
  let pub = rows.find((r) => r.key === "vapid_public"), priv = rows.find((r) => r.key === "vapid_private");
  if (!pub || !priv) {
    const k = webpush.generateVAPIDKeys();
    await rest("zap_config?on_conflict=key", {
      method: "POST", headers: { Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify([{ key: "vapid_public", value: k.publicKey }, { key: "vapid_private", value: k.privateKey }]),
    });
    rows = await rest("zap_config?key=in.(vapid_public,vapid_private)&select=key,value");
    pub = rows.find((r) => r.key === "vapid_public"); priv = rows.find((r) => r.key === "vapid_private");
  }
  return { publicKey: pub.value, privateKey: priv.value };
}

const ok = () => !!(URL_() && KEY());
module.exports = { rest, vapid, ok };
