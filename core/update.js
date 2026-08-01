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

// Fragt einen beliebigen Service-Worker-Eintrag (aktiv oder wartend) nach
// seiner SW_VERSION. So lässt sich zuverlässig anzeigen, welcher Code-Stand
// WIRKLICH aktiv ist - unabhängig von ZIP-Dateinamen oder Annahmen.
function askWorkerForVersion(worker) {
  return new Promise((resolve) => {
    if (!worker) {
      resolve(null);
      return;
    }
    const channel = new MessageChannel();
    const timeout = setTimeout(() => resolve(null), 2000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timeout);
      resolve(event.data?.version || null);
    };
    worker.postMessage({ type: "GET_VERSION" }, [channel.port2]);
  });
}

export async function getActiveVersion() {
  if (!("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration().catch(() => null);
  if (!registration?.active) return null;
  return askWorkerForVersion(registration.active);
}

export async function getWaitingVersion() {
  return askWorkerForVersion(waitingWorker);
}

export function initServiceWorkerUpdates() {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.register("./sw.js").then((registration) => {
    // Hilfsfunktion: waiting Worker setzen + Callback auslösen
    function handleWaiting() {
      if (registration.waiting && registration.waiting !== waitingWorker) {
        waitingWorker = registration.waiting;
        notifyUpdateAvailable();
      }
    }

    // Fall 1: Beim Laden der Seite liegt bereits ein wartender Worker vor
    handleWaiting();

    // Fall 2: Während dieser Sitzung wird ein neuer Worker gefunden und
    // durchläuft die Installation.
    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "installed") {
          handleWaiting();
        }
      });
    });

    // Aktiv beim Start nach einem Update suchen. Danach nochmal waiting prüfen,
    // da der Browser den SW eventuell schon heruntergeladen hat (HTTP 304 race).
    registration.update().then(() => {
      handleWaiting();
    }).catch(() => {});

    // Zusätzlich periodisch prüfen, solange die App offen ist.
    setInterval(() => {
      registration.update().then(() => {
        handleWaiting();
      }).catch(() => {});
    }, 60 * 60 * 1000);
  }).catch((err) => {
    console.error("Service Worker Registrierung fehlgeschlagen:", err);
  });

  // Sobald der neue Worker aktiv geworden ist (nach SKIP_WAITING), die
  // Seite einmalig neu laden.
  let hasReloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hasReloaded) return;
    hasReloaded = true;
    window.location.reload();
  });
}
