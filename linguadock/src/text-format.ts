const bulletMarkerPattern = /[•●▪◦‣⁃]/;
const checkboxMarkerPattern = /[☐☑☒]/;

function restoreMarkerLineBreaks(text: string, markerPattern: RegExp): string {
  const marker = markerPattern.source;
  return text.replace(
    new RegExp(`[ \\t\\u00a0]*(${marker})[ \\t\\u00a0]+`, "g"),
    "\n$1 ",
  );
}

function restoreNumberedListLineBreaks(text: string): string {
  const numberedItemPattern = /(?:^|\s)(\d{1,3}[.)])[ \t\u00a0]+/g;
  const matches = Array.from(text.matchAll(numberedItemPattern));
  if (matches.length < 2) return text;

  return text.replace(numberedItemPattern, "\n$1 ");
}

export function normalizeSelectedText(text: string): string {
  const normalizedNewlines = text.replace(/\r\n?/g, "\n");
  const withBulletLines = restoreMarkerLineBreaks(
    normalizedNewlines,
    bulletMarkerPattern,
  );
  const withCheckboxLines = restoreMarkerLineBreaks(
    withBulletLines,
    checkboxMarkerPattern,
  );
  const withNumberedLines = restoreNumberedListLineBreaks(withCheckboxLines);

  return withNumberedLines.replace(/^\n+/, "").trimEnd();
}
