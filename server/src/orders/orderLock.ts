/**
 * In-process keyed mutex. Serializes the mutating flows on one order
 * group (client verify, webhook delivery, refunds, cancellation) so the
 * capture gate can never run twice concurrently for the same order:
 * whichever channel arrives second waits instead of racing.
 *
 * In-process is the honest scope for this demo's deliberately
 * single-machine topology (see the Fly.io entry in DECISIONS.md);
 * production on N instances would use a database advisory lock or a
 * per-order queue instead. The race this closes was not hypothetical:
 * it fired on the first live webhook delivery and is written up in
 * EVIDENCE.md.
 */
const tails = new Map<string, Promise<void>>();

export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const tail = tails.get(key) ?? Promise.resolve();
  const result = tail.then(fn);
  // The chain must survive rejections (they propagate to the caller,
  // not to the next holder), and clean itself up when it drains.
  const nextTail = result.then(
    () => undefined,
    () => undefined,
  );
  tails.set(key, nextTail);
  void nextTail.then(() => {
    if (tails.get(key) === nextTail) tails.delete(key);
  });
  return result;
}

/** Visible for tests. */
export function activeLockCount(): number {
  return tails.size;
}
