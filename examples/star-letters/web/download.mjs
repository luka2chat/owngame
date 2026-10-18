// Only complete, hash-verified chunks are reusable. A stalled stream never owns
// the UI indefinitely, and retrying one chunk does not restart the entire game.
export const sha256 = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
export async function fetchBytes(url, { fetchImpl = fetch, idleMs = 12000, attemptMs = 45000, onProgress = () => {}, signal, maxBytes = 2 * 1024 * 1024, reload = false } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  let idle, reader;
  const stalled = () => controller.abort(new Error('连接太慢，正在重新接收这封来信。'));
  const touch = () => { clearTimeout(idle); idle = setTimeout(stalled, idleMs); };
  const deadline = setTimeout(stalled, attemptMs);
  let rejectAborted;
  const aborted = new Promise((_, reject) => { rejectAborted = () => reject(controller.signal.reason || new Error('下载已取消')); });
  controller.signal.addEventListener('abort', rejectAborted, { once: true });
  try {
    touch();
    if (controller.signal.aborted) throw controller.signal.reason;
    const response = await Promise.race([fetchImpl(url, { signal: controller.signal, cache: reload ? 'reload' : 'default' }), aborted]);
    if (!response.ok) throw new Error(`下载暂时中断（${response.status}）。`);
    if (!response.body) throw new Error('没有收到游戏资源。');
    reader = response.body.getReader();
    const parts = []; let received = 0;
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      touch(); received += value.byteLength;
      if (received > maxBytes) throw new Error('资源大小不符合清单。');
      parts.push(value); onProgress(received);
    }
    const bytes = new Uint8Array(received); let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
    return bytes;
  } finally {
    clearTimeout(idle); clearTimeout(deadline);
    signal?.removeEventListener('abort', abort);
    controller.signal.removeEventListener('abort', rejectAborted);
    // Cancel without waiting for a broken connection to acknowledge cancellation.
    if (reader) reader.cancel().catch(() => {});
  }
}
export async function fetchChunk(chunk, { cache, baseUrl, attempts = 4, onProgress = () => {}, onRetry = () => {}, retryDelayMs = 500, ...options } = {}) {
  const cacheKey = new URL('/__star-letters-chunks/' + chunk.sha256, baseUrl).href;
  const valid = async bytes => bytes.byteLength === chunk.bytes && await sha256(bytes) === chunk.sha256;
  try {
    const hit = await cache?.match(cacheKey);
    if (hit) {
      const bytes = new Uint8Array(await hit.arrayBuffer());
      if (await valid(bytes)) { onProgress(bytes.length); return bytes; }
      await cache.delete(cacheKey);
    }
  } catch { /* Cache availability must not block play. */ }
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      options.signal?.throwIfAborted();
      onProgress(0);
      const bytes = await fetchBytes(new URL(chunk.path, baseUrl).href, { ...options, maxBytes: chunk.bytes, onProgress, reload: attempt > 1 });
      if (!await valid(bytes)) throw new Error('资源校验未通过。');
      try { await cache?.put(cacheKey, new Response(bytes)); } catch { /* Quota/private mode: continue without persistence. */ }
      return bytes;
    } catch (error) {
      if (options.signal?.aborted) throw error;
      if (attempt === attempts) throw new Error('这次没有接收完整。点击“继续接收”重试，已缓存的星光不用再下载。', { cause: error });
      onRetry(attempt, error);
      await new Promise(resolve => setTimeout(resolve, retryDelayMs * attempt));
    }
  }
}
export async function downloadChunks(chunks, { concurrency = 3, onProgress = () => {}, ...options } = {}) {
  const controller = new AbortController(), bytes = chunks.map(() => 0), results = new Array(chunks.length);
  let cursor = 0;
  const jobs = Array.from({ length: Math.min(concurrency, chunks.length) }, async () => {
    while (cursor < chunks.length && !controller.signal.aborted) {
      const index = cursor++;
      try {
        results[index] = await fetchChunk(chunks[index], { ...options, signal: controller.signal, onProgress: size => { bytes[index] = size; onProgress(bytes.reduce((a, b) => a + b, 0)); } });
      } catch (error) { controller.abort(error); throw error; }
    }
  });
  const settled = await Promise.allSettled(jobs);
  const failure = settled.find(job => job.status === 'rejected');
  if (failure) throw failure.reason;
  return results;
}
