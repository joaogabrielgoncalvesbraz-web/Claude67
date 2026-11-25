// Entrega a chave PÚBLICA das notificações para o navegador se inscrever.
const { vapid, ok } = require("./_lib");
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!ok()) return res.status(500).json({ error: "Site sem configuração do Supabase." });
  try { const k = await vapid(); res.status(200).json({ publicKey: k.publicKey }); }
  catch (e) { res.status(500).json({ error: "Não consegui preparar as notificações." }); }
};
