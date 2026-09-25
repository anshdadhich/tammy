export function driveFileId(url: string): string | null {
  const m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([A-Za-z0-9_-]+)/);
  return m?.[1] ?? null;
}

export function isDriveLink(url: string): boolean {
  return /drive\.google\.com/i.test(url);
}

export function drivePreviewUrl(url: string): string | null {
  const id = driveFileId(url);
  return id ? `https://drive.google.com/file/d/${id}/preview` : null;
}

export function driveImageUrl(url: string, width = 800): string | null {
  const id = driveFileId(url);
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w${width}` : null;
}
