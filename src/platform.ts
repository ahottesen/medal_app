// Skiller mellom nettleser og skrivebordsappen (Tauri).
// I skrivebordsappen lagres filer via en vanlig «Lagre som»-dialog, og lenker åpnes i nettleseren.
import { download } from './geometry/export';

export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const FILTERS: Record<string, { name: string; extensions: string[] }> = {
  stl: { name: 'STL-modell', extensions: ['stl'] },
  '3mf': { name: '3MF-modell', extensions: ['3mf'] },
  zip: { name: 'ZIP-arkiv', extensions: ['zip'] },
  png: { name: 'PNG-bilde', extensions: ['png'] },
  json: { name: 'Medaljeprosjekt', extensions: ['json'] },
};

/**
 * Lagre en fil. Returnerer stien (skrivebord), 'download' (nettleser) eller null hvis brukeren avbrøt.
 */
export async function saveFile(data: Uint8Array | string, filename: string, mime: string): Promise<string | null> {
  if (!isDesktop) {
    download(data, filename, mime);
    return 'download';
  }
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const { save } = await import('@tauri-apps/plugin-dialog');
  const path = await save({ defaultPath: filename, filters: FILTERS[ext] ? [FILTERS[ext]] : [] });
  if (!path) return null;
  const { writeFile } = await import('@tauri-apps/plugin-fs');
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  await writeFile(path, bytes);
  return path;
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const bin = atob(dataUrl.split(',', 2)[1] ?? '');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** I skrivebordsappen: åpne eksterne lenker (target=_blank) i systemets nettleser. */
export function installLinkHandler() {
  if (!isDesktop) return;
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!a || a.hasAttribute('download')) return;
    const href = a.href;
    if (!/^https?:/i.test(href)) return;
    e.preventDefault();
    void import('@tauri-apps/plugin-opener').then(({ openUrl }) => openUrl(href));
  });
}
