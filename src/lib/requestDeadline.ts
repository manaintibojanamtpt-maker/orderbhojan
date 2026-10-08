/** One wall-clock budget, including authentication, parsing, retries and backoff. */
export async function withRequestDeadline<T>(
  timeoutMs: number,
  caller: AbortSignal | undefined,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid request deadline');
  const controller = new AbortController();
  const cancel = () => controller.abort(new DOMException('Request cancelled', 'AbortError'));
  if (caller?.aborted) cancel();
  else caller?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('Request deadline exceeded', 'TimeoutError')), timeoutMs);
  try {
    return await waitForSignal(() => operation(controller.signal), controller.signal);
  } finally {
    clearTimeout(timer);
    caller?.removeEventListener('abort', cancel);
  }
}

/** Also bounds operations (e.g. Firebase token retrieval) that cannot themselves abort. */
export function waitForSignal<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const abort = () => { cleanup(); reject(signal.reason); };
    const cleanup = () => signal.removeEventListener('abort', abort);
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(() => {
      signal.throwIfAborted();
      return operation();
    }).then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}

export function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
