export const AUTO_LOCK_MS = 5 * 60 * 1000;
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MS = 5 * 60 * 1000;

export function createDefaultSecurityState() {
  return {
    failedAttempts: 0,
    lockUntil: 0,
    pendingFailedLoginCount: 0,
    lastFailedLoginAt: "",
    lastUnlockAt: "",
    lastUnlockMethod: "",
    updatedAt: new Date().toISOString()
  };
}

export function normalizeSecurityState(state) {
  const base = createDefaultSecurityState();
  const source = state && typeof state === "object" ? state : {};

  return {
    ...base,
    ...source,
    failedAttempts: Number.isFinite(source.failedAttempts) ? source.failedAttempts : 0,
    lockUntil: Number.isFinite(source.lockUntil) ? source.lockUntil : 0,
    pendingFailedLoginCount: Number.isFinite(source.pendingFailedLoginCount) ? source.pendingFailedLoginCount : 0,
    lastFailedLoginAt: typeof source.lastFailedLoginAt === "string" ? source.lastFailedLoginAt : "",
    lastUnlockAt: typeof source.lastUnlockAt === "string" ? source.lastUnlockAt : "",
    lastUnlockMethod: typeof source.lastUnlockMethod === "string" ? source.lastUnlockMethod : "",
    updatedAt: new Date().toISOString()
  };
}

export function isLockedOut(securityState, now = Date.now()) {
  return normalizeSecurityState(securityState).lockUntil > now;
}

export function getRemainingLockoutMs(securityState, now = Date.now()) {
  const state = normalizeSecurityState(securityState);
  return Math.max(0, state.lockUntil - now);
}

export function registerFailedLogin(securityState, now = Date.now()) {
  const state = normalizeSecurityState(securityState);

  state.failedAttempts += 1;
  state.pendingFailedLoginCount += 1;
  state.lastFailedLoginAt = new Date(now).toISOString();

  if (state.failedAttempts >= MAX_FAILED_ATTEMPTS) {
    state.lockUntil = now + LOCKOUT_MS;
    state.failedAttempts = 0;
  }

  state.updatedAt = new Date().toISOString();
  return state;
}

export function registerSuccessfulUnlock(securityState, method = "pin", now = Date.now()) {
  const state = normalizeSecurityState(securityState);

  state.failedAttempts = 0;
  state.pendingFailedLoginCount = 0;
  state.lockUntil = 0;
  state.lastUnlockAt = new Date(now).toISOString();
  state.lastUnlockMethod = method;
  state.updatedAt = new Date().toISOString();

  return state;
}

export function createAutoLockController(onLock) {
  let timer = null;
  let boundHandler = null;
  let suspendCount = 0;

  function reset() {
    if (suspendCount > 0) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      onLock();
    }, AUTO_LOCK_MS);
  }

  function start() {
    reset();
  }

  function stop() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  // Wird verwendet, wenn die App selbst ein Fenster öffnet (z.B. Drucken),
  // das den Browser-Fokus übernimmt. Ohne das würde visibilitychange
  // fälschlich einen Lock auslösen, sobald sich das Druckfenster öffnet.
  function suspend() {
    suspendCount += 1;
    stop();
  }

  function resume() {
    suspendCount = Math.max(0, suspendCount - 1);
    if (suspendCount === 0) {
      reset();
    }
  }

  function bindActivityEvents() {
    if (boundHandler) return;
    boundHandler = () => reset();

    ["pointerdown", "keydown", "touchstart"].forEach((eventName) => {
      window.addEventListener(eventName, boundHandler, { passive: true });
    });

    document.addEventListener("visibilitychange", () => {
      if (suspendCount > 0) return;
      if (document.hidden) {
        onLock();
      } else {
        reset();
      }
    });
  }

  function unbindActivityEvents() {
    if (!boundHandler) return;

    ["pointerdown", "keydown", "touchstart"].forEach((eventName) => {
      window.removeEventListener(eventName, boundHandler);
    });

    boundHandler = null;
  }

  return {
    start,
    reset,
    stop,
    suspend,
    resume,
    bindActivityEvents,
    unbindActivityEvents
  };
}