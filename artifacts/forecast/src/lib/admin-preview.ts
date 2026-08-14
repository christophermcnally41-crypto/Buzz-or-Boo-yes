/**
 * Builds the pretty-printed JSON string that will be stored in the market's
 * `description` field for structured market formats.  This is also the text
 * that the "Copy JSON" button copies to the clipboard inside the admin
 * preview panel.
 *
 * Extracted as a pure function so it can be unit-tested independently of the
 * React component that hosts the <details> / Copy-button UX.
 */

export interface PreviewContender {
  key: string;
  name: string;
  venue?: string;
}

export function buildDescriptionPreview(
  format: string,
  contenders: PreviewContender[],
  metric: string,
  period: string,
  recurring: boolean,
): string | null {
  if (format === "MULTI_CHOICE") {
    const valid = contenders.filter(c => c.name.trim());
    if (valid.length === 0) return null;
    return JSON.stringify(
      {
        contenders: valid.map(c => ({
          key: c.key,
          name: c.name.trim(),
          ...(c.venue?.trim() ? { venue: c.venue.trim() } : {}),
        })),
        ...(metric ? { metric } : {}),
        ...(period ? { period } : {}),
        ...(recurring ? { recurring: true } : {}),
      },
      null,
      2,
    );
  }

  if (format === "THE_CALL") {
    const valid = contenders.filter(c => c.name.trim());
    if (valid.length === 0) return null;
    return JSON.stringify(
      {
        options: valid.map(c => ({ key: c.key, label: c.name.trim() })),
        ...(metric ? { context: metric } : {}),
      },
      null,
      2,
    );
  }

  return null;
}
