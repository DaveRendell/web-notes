import { describe, expect, it } from 'vitest';
import { compareMarkdown, firstDifferentLine } from '../diagnostics';

describe('Android editor Markdown diagnostics', () => {
  it('distinguishes a byte-exact round trip from harmless formatting changes', () => {
    expect(compareMarkdown('# Note\n', '# Note\n')).toEqual({
      exactMatch: true, semanticMatch: true, firstDifferentLine: null,
    });
    expect(compareMarkdown('- One\n- Two', '* One\n* Two')).toEqual({
      exactMatch: false, semanticMatch: true, firstDifferentLine: 1,
    });
  });

  it('flags changed list meaning and reports the first source line', () => {
    expect(compareMarkdown('Intro\n\n- Parent\n  - Child', 'Intro\n\n- Parent\n- Child')).toEqual({
      exactMatch: false, semanticMatch: false, firstDifferentLine: 4,
    });
  });

  it('handles line-ending-only differences without a missing-line report', () => {
    expect(firstDifferentLine('One\r\nTwo', 'One\nTwo')).toBe(1);
  });
});
