// Unity hashes the document's directory for its PlayerPrefs location. MD5 here
// reproduces that namespace; it is not used for integrity or authentication.
export function unityDirectoryHash(value) {
  const bytes = new TextEncoder().encode(value);
  const data = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
  data.set(bytes); data[bytes.length] = 128;
  const view = new DataView(data.buffer);
  view.setUint32(data.length - 8, bytes.length * 8, true);
  view.setUint32(data.length - 4, Math.floor(bytes.length / 0x20000000), true);
  const shifts = [7,12,17,22,5,9,14,20,4,11,16,23,6,10,15,21];
  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;
  for (let offset = 0; offset < data.length; offset += 64) {
    let aa = a, bb = b, cc = c, dd = d;
    for (let i = 0; i < 64; i++) {
      const round = i >>> 4;
      const f = round === 0 ? (bb & cc) | (~bb & dd) : round === 1 ? (dd & bb) | (~dd & cc) : round === 2 ? bb ^ cc ^ dd : cc ^ (bb | ~dd);
      const g = round === 0 ? i : round === 1 ? (5*i+1)%16 : round === 2 ? (3*i+5)%16 : (7*i)%16;
      const sum = (aa + f + Math.floor(Math.abs(Math.sin(i+1))*0x100000000) + view.getUint32(offset+g*4,true)) | 0;
      const shift = shifts[round*4+i%4];
      aa = dd; dd = cc; cc = bb; bb = (bb + ((sum << shift) | (sum >>> (32-shift)))) | 0;
    }
    a = (a+aa)|0; b = (b+bb)|0; c = (c+cc)|0; d = (d+dd)|0;
  }
  return [a,b,c,d].flatMap(n => [0,8,16,24].map(shift => ((n >>> shift)&255).toString(16).padStart(2,'0'))).join('');
}

const legacyVersions = [
  '4868ae27e4f85cbae571943620644b804f2dbd5d33c527b081f274851d90aac1',
  '93d95cba9980301f370519dfb39615014342f2839595f4e946fe84caf7eec1fc',
  'aaff913a35745a6877d5cb66a64a3ae5993a088ef898c644d7191cd63b7f5b2f',
  '093d30f3e559b78051281c1b37139375b7247d190bebc09af81c5af088a7e041',
  '2f4a5b24fa2aaad8aa337b9613cd30164ba11a9f3821420688ede6a4f9d7031d',
];

export async function migrateCampaignSave({
  databaseName = '/idbfs',
  directory = new URL('.', location.href).href.replace(/\/$/, ''),
  legacyDirectories = legacyVersions.map(version => new URL('/games/star-letters/'+version, location.origin).href),
} = {}) {
  if (!globalThis.indexedDB) return 'unavailable';
  const folder = value => '/idbfs/'+unityDirectoryHash(value);
  return new Promise(resolve => {
    let db, settled = false;
    const finish = result => { if (settled) return; settled = true; clearTimeout(timeout); db?.close(); resolve(result); };
    // Storage denial or another tab's pending upgrade must not block playing.
    const timeout = setTimeout(() => finish('unavailable'), 2500);
    const request = indexedDB.open(databaseName);
    request.onerror = () => finish('unavailable');
    request.onblocked = () => finish('unavailable');
    request.onsuccess = () => {
      db = request.result;
      if (settled) { db.close(); return; }
      if (!db.objectStoreNames.contains('FILE_DATA')) { finish('empty'); return; }
      const transaction = db.transaction('FILE_DATA', 'readwrite'), store = transaction.objectStore('FILE_DATA');
      let result = 'empty';
      transaction.onerror = transaction.onabort = () => finish('unavailable');
      transaction.oncomplete = () => finish(result);
      const target = folder(directory), current = store.get(target+'/PlayerPrefs');
      current.onsuccess = () => {
        if (current.result) { result = 'existing'; return; }
        const previous = [...new Set(legacyDirectories)].map(folder).filter(path => path !== target);
        let remaining = previous.length, newest;
        for (const path of previous) {
          const read = store.get(path+'/PlayerPrefs');
          read.onsuccess = () => {
            const entry = read.result;
            // Scope to this game's known prior URLs and its campaign key.
            if (entry?.contents?.byteLength < 1024*1024 && new TextDecoder().decode(entry.contents).includes('StarLetters.Campaign.v1') &&
                (!newest || +entry.timestamp > +newest.timestamp)) newest = entry;
            if (--remaining || !newest) return;
            store.put({timestamp: new Date(), mode: 16895}, target);
            store.put(newest, target+'/PlayerPrefs');
            result = 'copied'; // Originals and existing new saves are never overwritten.
          };
        }
      };
    };
  });
}
