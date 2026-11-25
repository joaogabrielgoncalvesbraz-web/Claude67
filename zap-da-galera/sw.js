// Service worker do Zap: recebe as notificações e abre a conversa ao tocar.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { title: "Zap da Galera", body: event.data && event.data.text() }; }
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (wins.some((w) => w.visibilityState === "visible" && w.focused)) return; // já está olhando o Zap
    await self.registration.showNotification(d.title || "Zap da Galera", {
      body: d.body || "Nova mensagem", tag: d.tag, renotify: true, icon: "/icon-192.png", badge: "/icon-192.png",
      data: { chat: d.chat },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const chat = event.notification.data && event.notification.data.chat;
  const url = "/" + (chat ? "#c-" + chat : "");
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) { w.postMessage({ type: "open-chat", chat }); return w.focus(); }
    return self.clients.openWindow(url);
  })());
});
