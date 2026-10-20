/** Plain note names must remain literal text inside the initial heading. */
export function getNewNoteContent(name: string) {
  const title = name.trim().replace(/\.md$/i, '').replace(/[\\`*_[\]<>~]/g, '\\$&');
  return `# ${title}\n`;
}
