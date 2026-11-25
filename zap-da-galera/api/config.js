// Entrega ao navegador só os dados PÚBLICOS do Supabase (URL e chave anon).
module.exports = (req, res) => {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const domain = process.env.AUTH_EMAIL_DOMAIN || "users.aifriends.local";
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ url, anonKey, domain });
};
