/** Shared per-SDK loader. All callers share one bounded attempt, including adopted tags. */
export function createPaymentScriptLoader(options: {
  id: string;
  src: string;
  ready: () => boolean;
  active: () => boolean;
  document: () => Document;
  timeoutMs?: number;
}) {
  let pending: Promise<boolean> | null = null;
  return function load(): Promise<boolean> {
    if (options.ready()) return Promise.resolve(true);
    if (pending) return pending;
    // Never replace resources while the provider's checkout is open.
    if (options.active()) return Promise.resolve(false);
    const doc = options.document();
    const script = (doc.getElementById(options.id) as HTMLScriptElement | null) ?? doc.createElement('script');
    const fresh = !script.id;
    pending = new Promise<boolean>(resolve => {
      let settled = false;
      const finish = (success: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        script.removeEventListener('load', loaded);
        script.removeEventListener('error', failed);
        if (!success && !options.active()) script.remove();
        resolve(success);
      };
      const loaded = () => finish(options.ready());
      const failed = () => finish(false);
      const timer = setTimeout(failed, options.timeoutMs ?? 15_000);
      script.addEventListener('load', loaded);
      script.addEventListener('error', failed);
      if (fresh) {
        script.id = options.id;
        script.src = options.src;
        script.async = true;
        doc.head.appendChild(script);
      }
    }).finally(() => { pending = null; });
    return pending;
  };
}
