// Safe synthetic notes for web regressions and the Android editor feasibility gate.
// Keep real vault content and credentials out of reusable fixtures.
export const richMarkdownCorpus = [
  {
    name: 'frontmatter, CRLF, and emoji',
    markdown: '---\r\ntitle: Sample\r\ntags: [mobile]\r\n---\r\n# 🎮 Sample\r\n\r\nA **bold** line with 🎮.\r\n',
  },
  {
    name: 'wikilinks, aliases, and external links',
    markdown: 'See [[Projects/Plan|the plan]] and [[Media/2026/Week 2 2026]].\n\n[Reference](https://example.com/path?q=1).',
  },
  {
    name: 'broken and linked vault images',
    markdown: 'Before\n\n[![](Attachments/missing%20image.png)](Attachments/missing%20image.png)\n\nAfter',
  },
  {
    name: 'nested mixed lists, tasks, and empty markers',
    markdown: '- [x] Parent\n  - [ ] Child\n    1. Numbered\n  \n  Continuation\n- Sibling\n\n-\n\n*',
    // Current MDXEditor import changes this structure; the shell must use source mode.
    requiresSourceFallback: true,
  },
  {
    name: 'table, quote, code, and rule',
    markdown: '| Name | Value |\n| --- | --- |\n| A | B |\n\n> Quoted **text**\n\n```ts\nconst value = 1;\n```\n\n---',
  },
  {
    name: 'block backgrounds',
    markdown: '<!-- web-notes:background=green -->\n\nA coloured block\n\n- [ ] Task <!-- web-notes:background=blue -->',
  },
  {
    name: 'calendar widget comment',
    markdown: '<!-- web-notes:calendar {"start":"2026-09-14","end":"2026-09-20","timezone":"Europe/London","calendars":["primary","team@example.com"]} -->',
  },
  {
    name: 'touch block movement',
    markdown: '# Move these blocks\n\nFirst paragraph.\n\nSecond paragraph.\n\n- First bullet\n- Second bullet\n- Third bullet',
  },
] as const;
