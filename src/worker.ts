let activeSpk: Promise<Package>;

const getString = function(view: DataView, offset: number, length: number) {
    const end = typeof length == 'number' ? offset + length : view.byteLength;
    let text = '';
    let val = -1;

    while (offset < view.byteLength && offset < end){
        val = view.getUint8(offset++);
        if (val == 0) break;
        text += String.fromCharCode(val);
    }

    return text;
};

interface PackageEntry {
  fileName: string,
  dataOffset: number,
  dataLength: number,
  compressedLength: number
}

class Package {
  buffer: ArrayBuffer;
  entries: Record<string, PackageEntry> = {};

  constructor(buffer: ArrayBuffer) {
    this.buffer = buffer;

    this.loadIndex();
  }

  loadIndex() {
    const view = new DataView(this.buffer);

    if (view.getUint32(0) !== 0x2e73706b) {
      throw new Error('Invalid file signature');
    }

    const numFiles = view.getUint32(6, true);
    const indexOffset = view.getUint32(10, true);

    let entryOffset = indexOffset;

    for (let i = 0; i < numFiles; i++) {
      const fileNameLength = view.getUint16(entryOffset + 2, true);
      const dataOffset = view.getUint32(entryOffset + 4, true);
      const dataLength = view.getUint32(entryOffset + 8, true);
      const compressedLength = view.getUint32(entryOffset + 12, true);
      const fileName = getString(view, entryOffset + 16, fileNameLength);

      this.entries[fileName] = {fileName, dataOffset, dataLength, compressedLength};

      entryOffset += 16 + fileNameLength;
    }

  }

  getFileData(location: string): BufferSource | null {
    const entry: PackageEntry | undefined = this.entries[location];
    if (!entry) {
      return null;
    }

    return this.buffer.slice(entry.dataOffset, entry.dataOffset + entry.dataLength);
  }
}

async function fetchFileFromSpk(spkLocation: string, fileLocation: string) {
  if (!activeSpk) {
    activeSpk = fetchPackage(spkLocation);
  }

  const spkPackage = await activeSpk;

  try {
    const data = spkPackage.getFileData(fileLocation);
    if (!data) {
      return new Response('404 Not Found', { status: 404, statusText: '400 Not Found'});
    }

    return new Response(data, { status: 200, statusText: 'OK', headers: { 'Content-type': getContentType(fileLocation) } });
  }
  catch (e) {
    return new Response('400 Bad Request', { status: 400, statusText: '400 Bad Request'});
  }
}

function getContentType(location: string) {
  const ext = /\.(.+)$/.exec(location);
  switch (ext && ext[1]) {
    case 'json': return 'application/json';
    case 'js': return 'text/javascript';
    default: return 'application/octet-stream'
  }
}

async function fetchPackage(spkLocation: string) {
  const spkBuffer = await fetch(spkLocation, {}).then(res => res.arrayBuffer());

  return new Package(spkBuffer);
}

async function fetchFile(request: Request) {
  const location = request.url;
  const extIndex = location.indexOf('.spk/');
  const spkLocation = extIndex >= 0 ? location.substr(0, extIndex + 4) : null;

  if (spkLocation) {
    return await fetchFileFromSpk(location.substr(0, extIndex + 4), location.substr(extIndex + 5));
  }
  else {
    return await fetch(request);
  }
}

self.addEventListener('fetch', (event) => {
  const fetchEvent = event as FetchEvent;

  fetchEvent.respondWith(fetchFile(fetchEvent.request));
});
