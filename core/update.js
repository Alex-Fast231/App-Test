let waitingWorker = null;
let onUpdateAvailableCallback = null;

function notifyUpdateAvailable() {
  if (typeof onUpdateAvailableCallback === "function") {
    onUpdateAvailableCallback();
  }
}

export function onUpdateAvailable(callback) {
  onUpdateAvailableCallback = callback;
  if (waitingWorker) {
    notifyUpdateAvailable();
  }
}

export function isUpdateAvailable() {
  return !!waitingWorker;
}

export function applyUpdate() {
  if (!waitingWorker) return;
  waitingWorker.postMessage({ type: "SKIP_WAITING" });
}

export function initServiceWorkerUpdates() {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.register("./sw.js").then((registration) => {
    // Fall 1: Beim Laden der Seite liegt bereits ein wartender Worker vor
    // (z.B. weil die App seit dem letzten Update nicht neu geladen wurde).
    if (registration.waiting) {
      waitingWorker = registration.waiting;
      notifyUpdateAvailable();
    }

    // Fall 2: Während dieser Sitzung wird ein neuer Worker gefunden und
    // durchläuft die Installation.
    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "installed" && registration.waiting) {
          waitingWorker = registration.waiting;
          notifyUpdateAvailable();
        }
      });
    });

    // Aktiv beim Start nach einem Update suchen, statt nur passiv zu warten.
    registration.update().catch(() => {});

    // Zusätzlich periodisch prüfen, solange die App offen ist (z.B. relevant
    // wenn die PWA über Tage hinweg nicht geschlossen wird).
    setInterval(() => {
      registration.update().catch(() => {});
    }, 60 * 60 * 1000);
  }).catch((err) => {
    console.error("Service Worker Registrierung fehlgeschlagen:", err);
  });

  // Sobald der neue Worker aktiv geworden ist (nach SKIP_WAITING), die
  // Seite einmalig neu laden, damit alle Module/Dateien aus dem neuen
  // Cache geladen werden. IndexedDB/Patientendaten sind davon nicht
  // betroffen, da der Reload nur die Anwendungsdateien betrifft.
  let hasReloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hasReloaded) return;
    hasReloaded = true;
    window.location.reload();
  });
}
