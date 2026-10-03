self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "A saved title has a new release update." };
  }

  event.waitUntil(self.registration.showNotification(payload.title || "Stream Find release alert", {
    body: payload.body || "A saved title has a new release update.",
    icon: "/favicon.svg",
    badge: "/favicon.svg",
    tag: payload.tag || "stream-find-release-alert",
    data: { url: payload.url || "/?view=watchlist" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = new URL(event.notification.data?.url || "/?view=watchlist", self.location.origin).href;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = clients.find((client) => client.url.startsWith(self.location.origin));
    if (existing) {
      await existing.focus();
      if ("navigate" in existing) await existing.navigate(destination);
      return;
    }
    await self.clients.openWindow(destination);
  })());
});
