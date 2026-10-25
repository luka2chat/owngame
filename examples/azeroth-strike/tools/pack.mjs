// Gzip containers for binary game assets, read back by src/engine/loader.ts.
// gzipShuffled stores 'SHF4', the byte length, then byte 0 of every 4-byte word, byte 1, byte 2,
// byte 3 and the tail. Arrays of floats and ints compress about 3x better that way (terrain
// 15 MB -> 2 MB); interleaved vertex data does not, so models use plain gzip.
import zlib from 'node:zlib';

const MAGIC = 0x34464853; // 'SHF4'

export const gzip = (buf) => zlib.gzipSync(buf, { level: 9 });

export function gzipShuffled(buf) {
	const n = Math.floor(buf.length / 4);
	const out = Buffer.alloc(8 + buf.length);
	out.writeUInt32LE(MAGIC, 0);
	out.writeUInt32LE(buf.length, 4);
	for (let lane = 0; lane < 4; lane++) for (let i = 0; i < n; i++) out[8 + lane * n + i] = buf[i * 4 + lane];
	buf.copy(out, 8 + n * 4, n * 4);
	return gzip(out);
}

/** Inverse of both writers: returns the original bytes of a .gz asset. */
export function gunzipAsset(gz) {
	const buf = zlib.gunzipSync(gz);
	if (buf.length < 8 || buf.readUInt32LE(0) !== MAGIC) return buf;
	const len = buf.readUInt32LE(4);
	const n = Math.floor(len / 4);
	const out = Buffer.alloc(len);
	for (let lane = 0; lane < 4; lane++) for (let i = 0; i < n; i++) out[i * 4 + lane] = buf[8 + lane * n + i];
	buf.copy(out, n * 4, 8 + n * 4);
	return out;
}
