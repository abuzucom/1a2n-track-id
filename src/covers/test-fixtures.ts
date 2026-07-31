// Test-only helpers: build minimal MP3 files with/without embedded cover art.

/** 1x1 transparent PNG. */
export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

function id3(frames: Buffer): Buffer {
  const tagHeader = Buffer.alloc(10);
  tagHeader.write('ID3', 0, 'latin1');
  tagHeader[3] = 3; // v2.3
  const size = frames.length;
  tagHeader[6] = (size >> 21) & 0x7f;
  tagHeader[7] = (size >> 14) & 0x7f;
  tagHeader[8] = (size >> 7) & 0x7f;
  tagHeader[9] = size & 0x7f;
  return Buffer.concat([tagHeader, frames]);
}

function frame(id: string, body: Buffer): Buffer {
  const header = Buffer.alloc(10);
  header.write(id, 0, 'latin1');
  header.writeUInt32BE(body.length, 4);
  return Buffer.concat([header, body]);
}

/**
 * Minimal MP3: ID3v2.3 tag with one APIC (cover) frame containing PNG_1X1.
 * The declared type is caller-settable so tests can build the crafted-track
 * case, where the frame names a type the server must refuse to echo back.
 */
export function mp3WithCover(mime = 'image/png'): Buffer {
  const body = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(`${mime}\0`, 'latin1'),
    Buffer.from([3]), // picture type: front cover
    Buffer.from([0]), // empty description
    PNG_1X1,
  ]);
  return id3(frame('APIC', body));
}

/** Minimal MP3: ID3v2.3 tag with a TIT2 title frame only (no art). */
export function mp3WithoutCover(): Buffer {
  const body = Buffer.concat([Buffer.from([0]), Buffer.from('Test\0', 'latin1')]);
  return id3(frame('TIT2', body));
}
