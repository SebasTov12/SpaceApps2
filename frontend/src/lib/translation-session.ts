/** Google may keep separate cookies on the host, parent domains and route paths. */
export function clearTranslationCookies(target: { cookie: string }, hostname: string, pathname: string) {
  const domains = new Set(["", hostname]);
  const parts = hostname.split(".");
  if (!/^[\d.]+$/.test(hostname)) {
    for (let i = 0; i < parts.length - 1; i++) {
      const domain = parts.slice(i).join(".");
      domains.add(domain);
      domains.add(`.${domain}`);
    }
  }
  const paths = new Set(["/"]);
  const segments = pathname.split("/").filter(Boolean);
  for (let i = 1; i <= segments.length; i++) {
    const path = `/${segments.slice(0, i).join("/")}`;
    paths.add(path);
    paths.add(`${path}/`);
  }
  for (const domain of domains) {
    for (const path of paths) {
      target.cookie = `googtrans=; Max-Age=0; path=${path}${domain ? `; domain=${domain}` : ""}`;
    }
  }
}

/** A previous language must never reapply itself through a pending retry. */
export function translationSession(locale: string, currentLocale: () => string) {
  let disposed = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const active = () => !disposed && currentLocale() === locale;
  return {
    active,
    schedule(callback: () => void, delay: number) {
      if (!active()) return;
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (active()) callback();
      }, delay);
      timers.add(timer);
    },
    dispose() {
      disposed = true;
      timers.forEach(clearTimeout);
      timers.clear();
    },
  };
}
