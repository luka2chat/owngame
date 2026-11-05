/* Lossless Web delivery for the standard Godot 4.4.1 runtime. */
(() => {
  const originalFetch = globalThis.fetch.bind(globalThis);
  const base = new URL('.', document.currentScript.src);
  const engineUrl = new URL('index.wasm', base).href;
  let decoded;
  const hash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  async function unpack() {
    if (!globalThis.DecompressionStream) throw Error('请使用新版手机浏览器 / Please update your browser.');
    const metaResponse = await originalFetch(new URL('engine.json', base));
    if (!metaResponse.ok) throw Error('Cannot load engine manifest');
    const meta = await metaResponse.json();
    const response = await originalFetch(new URL('engine.bin', base));
    if (!response.ok) throw Error('Cannot download engine');
    const packed = await response.arrayBuffer();
    if (meta.encoding !== 'gzip' || packed.byteLength !== meta.packedBytes || await hash(packed) !== meta.packedSha256) throw Error('Engine download integrity check failed');
    const raw = await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    if (raw.byteLength !== meta.bytes || await hash(raw) !== meta.sha256) throw Error('Engine unpack integrity check failed');
    return raw;
  }
  globalThis.fetch = function(input, options) {
    const url = input instanceof Request ? input.url : String(input);
    if (new URL(url, location.href).href !== engineUrl) return originalFetch(input, options);
    if (!decoded) decoded = unpack().catch(error => { decoded = null; throw error; });
    return decoded.then(bytes => new Response(bytes, {headers: {'Content-Type':'application/wasm', 'Content-Length':String(bytes.byteLength)}}));
  };
})();
