// Google Drive link helpers: store the link, render client-side. No PDFs on our servers.
// Candidate shares with "Anyone with the link" — permission stays in their hands.

export function driveFileId(url: string): string | null {
  const m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([A-Za-z0-9_-]+)/);
  return m?.[1] ?? null;
}

export function isDriveLink(url: string): boolean {
  return /drive\.google\.com/i.test(url);
}

/** Embeddable preview (iframe) — works when link sharing is on. */
export function drivePreviewUrl(url: string): string | null {
  const id = driveFileId(url);
  return id ? `https://drive.google.com/file/d/${id}/preview` : null;
}

/** Direct image/thumbnail URL for Drive-hosted photos. */
export function driveImageUrl(url: string, width = 800): string | null {
  const id = driveFileId(url);
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w${width}` : null;
}
