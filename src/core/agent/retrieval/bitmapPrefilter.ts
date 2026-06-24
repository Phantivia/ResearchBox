const A_CODE = "a".charCodeAt(0);
const Z_CODE = "z".charCodeAt(0);

export function letterBitmap(text: string): number {
  let bitmap = 0;
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code >= 65 && code <= 90) {
      code += 32;
    }
    if (code >= A_CODE && code <= Z_CODE) {
      bitmap |= 1 << (code - A_CODE);
    }
  }
  return bitmap;
}

export function queryBitmap(query: string): number {
  return letterBitmap(query);
}

export function passesPrefilter(blockBitmap: number, qBitmap: number): boolean {
  if (qBitmap === 0) {
    return true;
  }
  return (blockBitmap & qBitmap) === qBitmap;
}
