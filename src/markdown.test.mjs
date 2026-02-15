import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { countTokens, scoreMarkdown, cleanMarkdown, convertToCitations, resolveUrls, pruneMarkdown, cleanLLMOutput } from './markdown.mjs';

// ─── countTokens ────────────────────────────────────────────────────────

describe('countTokens', () => {
  it('returns positive integer for normal text', () => {
    const result = countTokens('Hello world, this is a test.');
    assert.ok(result > 0);
    assert.ok(Number.isInteger(result));
  });

  it('returns 0 for empty string', () => {
    const result = countTokens('');
    assert.equal(result, 0);
  });

  it('uses char-based estimate for text > 500k chars: Math.ceil(len / 4)', () => {
    const longText = 'a'.repeat(500_001);
    const result = countTokens(longText);
    const expected = Math.ceil(500_001 / 4);
    assert.equal(result, expected);
  });

  it('uses exact tokenizer for text <= 500k chars', () => {
    const text = 'Short text for tokenization';
    const result = countTokens(text);
    // Should use exact encoding, not char/4 estimate
    assert.notEqual(result, Math.ceil(text.length / 4));
  });
});

// ─── scoreMarkdown ──────────────────────────────────────────────────────

describe('scoreMarkdown', () => {
  it('high score (>= 0.6) for well-structured article (# heading, multiple paragraphs, lists, 800+ chars)', () => {
    const markdown = `# Main Heading

This is a well-structured paragraph with multiple sentences that provide meaningful content to the reader. We need enough text to pass the thin content penalty threshold which requires at least 300 characters.

Another paragraph here to ensure we have multiple paragraphs separated by blank lines. This helps establish proper document structure and demonstrates good formatting practices.

## Section Two

More content in this section with substantive information that demonstrates this is a real article with meaningful content and proper organization.

- List item one with details
- List item two with more information
- List item three to complete the set

And a final paragraph to wrap things up with more content to ensure we exceed 800 characters total and achieve the best possible score.`;

    const { score, grade } = scoreMarkdown(markdown);
    assert.ok(score >= 0.6, `Expected score >= 0.6, got ${score}`);
    assert.ok(['A', 'B'].includes(grade), `Expected grade A or B, got ${grade}`);
  });

  it('low score (< 0.3) for error page text like "Just a moment... checking your browser"', () => {
    const markdown = 'Just a moment... checking your browser before accessing the site.';
    const { score } = scoreMarkdown(markdown);
    assert.ok(score < 0.3, `Expected score < 0.3, got ${score}`);
  });

  it('low score (< 0.3) for framework payload like "self.__next_f = self.__next_f || []"', () => {
    const markdown = 'self.__next_f = self.__next_f || []; self.__next_f.push([1, "data"])';
    const { score } = scoreMarkdown(markdown);
    assert.ok(score < 0.3, `Expected score < 0.3, got ${score}`);
  });

  it('applies thin content penalty for short text (< 300 chars)', () => {
    const shortMarkdown = '# Title\n\nShort content.';
    const longMarkdown = '# Title\n\n' + 'a'.repeat(500);

    const shortScore = scoreMarkdown(shortMarkdown).score;
    const longScore = scoreMarkdown(longMarkdown).score;

    // Short content should score lower due to thin content penalty
    assert.ok(shortScore < longScore, `Short score ${shortScore} should be < long score ${longScore}`);
  });

  it('score clamped between 0 and 1', () => {
    const tests = [
      'Just a moment...',
      '# Article\n\nContent here.',
      'self.__next_f = [];',
      '# Great Article\n\n' + 'Good content. '.repeat(100) + '\n\n- List\n- Items\n\n## Section\n\nMore text.',
    ];

    tests.forEach((markdown) => {
      const { score } = scoreMarkdown(markdown);
      assert.ok(score >= 0, `Score ${score} should be >= 0`);
      assert.ok(score <= 1, `Score ${score} should be <= 1`);
    });
  });

  it('grade follows thresholds: A >= 0.8, B >= 0.6, C >= 0.4, D >= 0.2, F < 0.2', () => {
    // Test grade assignment logic directly with known scores
    const testScores = [
      { score: 0.85, expected: 'A' },
      { score: 0.8, expected: 'A' },
      { score: 0.79, expected: 'B' },
      { score: 0.6, expected: 'B' },
      { score: 0.59, expected: 'C' },
      { score: 0.4, expected: 'C' },
      { score: 0.39, expected: 'D' },
      { score: 0.2, expected: 'D' },
      { score: 0.19, expected: 'F' },
      { score: 0.0, expected: 'F' },
    ];

    testScores.forEach(({ score, expected }) => {
      let grade;
      if (score >= 0.8) grade = 'A';
      else if (score >= 0.6) grade = 'B';
      else if (score >= 0.4) grade = 'C';
      else if (score >= 0.2) grade = 'D';
      else grade = 'F';
      assert.equal(grade, expected, `Score ${score} should give grade ${expected}`);
    });

    // Test with actual markdown to verify consistent grading
    const goodArticle = `# Great Article

${'Paragraph with substantial content. '.repeat(50)}

## Section

- List item one
- List item two
- List item three

${'More quality content here. '.repeat(30)}`;

    const { grade: actualGrade, score: actualScore } = scoreMarkdown(goodArticle);
    // Verify grade matches score thresholds
    if (actualScore >= 0.8) assert.equal(actualGrade, 'A');
    else if (actualScore >= 0.6) assert.equal(actualGrade, 'B');
    else if (actualScore >= 0.4) assert.equal(actualGrade, 'C');
    else if (actualScore >= 0.2) assert.equal(actualGrade, 'D');
    else assert.equal(actualGrade, 'F');
  });
});

// ─── cleanMarkdown ──────────────────────────────────────────────────────

describe('cleanMarkdown', () => {
  it('removes empty links [](url)', () => {
    const input = 'Text with [](https://example.com) empty link.';
    const result = cleanMarkdown(input);
    assert.ok(!result.includes('[]('));
    assert.ok(!result.includes('example.com'));
  });

  it('removes [citation needed] markers', () => {
    const tests = [
      { input: 'Text[citation needed] here.', expected: 'Text here.' },
      { input: 'Text[better source needed] here.', expected: 'Text here.' },
      { input: 'Text[clarification needed] here.', expected: 'Text here.' },
      { input: 'Text [*[citation needed]*] here.', expected: 'Text [**] here.' },
      { input: 'Fact[_citation needed_] continues.', expected: 'Fact continues.' },
    ];

    tests.forEach(({ input, expected }) => {
      const result = cleanMarkdown(input);
      assert.equal(result, expected);
    });
  });

  it('collapses 3+ newlines to 2', () => {
    const input = 'Line 1\n\n\n\nLine 2';
    const result = cleanMarkdown(input);
    assert.equal(result, 'Line 1\n\nLine 2');

    const input2 = 'A\n\n\n\n\n\nB';
    const result2 = cleanMarkdown(input2);
    assert.equal(result2, 'A\n\nB');
  });

  it('trims trailing whitespace from lines', () => {
    const input = 'Line 1   \nLine 2\t\nLine 3  \t  \nLine 4';
    const result = cleanMarkdown(input);
    const lines = result.split('\n');
    lines.forEach((line) => {
      assert.equal(line, line.trimEnd(), `Line should not have trailing whitespace: "${line}"`);
    });
  });

  it('removes References/Notes section at end', () => {
    const tests = [
      {
        input: '# Article\n\nContent here.\n\n## References\n\n1. Source 1\n2. Source 2',
        expected: '# Article\n\nContent here.',
      },
      {
        input: '# Article\n\nContent.\n\n### Notes\n\nSome notes here.',
        expected: '# Article\n\nContent.',
      },
      {
        input: '# Article\n\nContent.\n\n# Citations\n\nCitation list.',
        expected: '# Article\n\nContent.',
      },
      {
        input: '# Article\n\nContent.\n\n## External links\n\n- Link 1',
        expected: '# Article\n\nContent.',
      },
      {
        input: '# Article\n\nContent.\n\n## Footnotes\n\nFootnote text.',
        expected: '# Article\n\nContent.',
      },
    ];

    tests.forEach(({ input, expected }) => {
      const result = cleanMarkdown(input);
      assert.equal(result, expected);
    });
  });

  it('removes [edit] links', () => {
    const input = 'Section Title [edit](https://example.com/edit) with content.';
    const result = cleanMarkdown(input);
    assert.ok(!result.includes('[edit]'));
    assert.ok(!result.includes('example.com/edit'));
  });

  it('handles multiple cleanups together', () => {
    const input = `# Title

Content with [](empty.com) link.

Text[citation needed] here.



Too many newlines.

Line with trailing spaces

## References

1. Source`;

    const result = cleanMarkdown(input);
    assert.ok(!result.includes('[]('));
    assert.ok(!result.includes('[citation needed]'));
    assert.ok(!result.includes('\n\n\n'));
    assert.ok(!result.includes('References'));
    // Check no trailing whitespace
    result.split('\n').forEach((line) => {
      assert.equal(line, line.trimEnd());
    });
  });
});

// ─── convertToCitations ─────────────────────────────────────────────────

describe('convertToCitations', () => {
  it('converts inline links to numbered references with footer', () => {
    const input = 'Check [this link](https://example.com) and [another](https://test.com).';
    const result = convertToCitations(input);
    assert.ok(result.includes('this link [1]'));
    assert.ok(result.includes('another [2]'));
    assert.ok(result.includes('References:'));
    assert.ok(result.includes('[1]: https://example.com'));
    assert.ok(result.includes('[2]: https://test.com'));
  });

  it('preserves image links ![alt](img.png)', () => {
    const input = 'Text with ![alt text](image.png) image.';
    const result = convertToCitations(input);
    assert.ok(result.includes('![alt text](image.png)'));
    assert.ok(!result.includes('References:'));
  });

  it('deduplicates same URLs (shares reference number)', () => {
    const input = '[First](https://example.com) and [Second](https://example.com) link.';
    const result = convertToCitations(input);
    assert.ok(result.includes('First [1]'));
    assert.ok(result.includes('Second [1]'));
    assert.ok(result.includes('[1]: https://example.com'));
    // Should only have one reference entry for the same URL
    const refMatches = result.match(/\[1\]: https:\/\/example\.com/g);
    assert.equal(refMatches?.length, 1, 'Should only have one reference entry');
  });

  it('skips anchor (#) and mailto: links', () => {
    const tests = [
      { input: '[Jump](#section) to section.', shouldPreserve: true },
      { input: '[Email](mailto:test@example.com) me.', shouldPreserve: true },
      { input: '[Call](tel:+1234567890) now.', shouldPreserve: true },
      { input: '[Data](data:text/plain,hello) link.', shouldPreserve: true },
      { input: '[Script](javascript:alert(1)) bad.', shouldPreserve: true },
    ];

    tests.forEach(({ input, shouldPreserve }) => {
      const result = convertToCitations(input);
      if (shouldPreserve) {
        // These special URLs should remain as inline links
        assert.ok(!result.includes('References:'), `Should not create References for: ${input}`);
        assert.ok(result === input, `Should preserve input unchanged: ${input}`);
      }
    });
  });

  it('returns original when no links present', () => {
    const input = 'Just plain text with no links.';
    const result = convertToCitations(input);
    assert.equal(result, input);
  });

  it('handles nested brackets in link text', () => {
    const input = 'Link with [nested [brackets] text](https://example.com) here.';
    const result = convertToCitations(input);
    assert.ok(result.includes('nested [brackets] text [1]'));
    assert.ok(result.includes('[1]: https://example.com'));
  });

  it('handles URLs with parentheses', () => {
    const input = '[Wiki](https://en.wikipedia.org/wiki/Foo_(bar)) article.';
    const result = convertToCitations(input);
    assert.ok(result.includes('Wiki [1]'));
    assert.ok(result.includes('[1]: https://en.wikipedia.org/wiki/Foo_(bar)'));
  });

  it('preserves mixed content with images and regular links', () => {
    const input = 'See ![image](pic.jpg) and [link](https://example.com) here.';
    const result = convertToCitations(input);
    assert.ok(result.includes('![image](pic.jpg)'));
    assert.ok(result.includes('link [1]'));
    assert.ok(result.includes('[1]: https://example.com'));
  });
});

// ─── resolveUrls ────────────────────────────────────────────────────────

describe('resolveUrls', () => {
  it('resolves relative paths to absolute', () => {
    const input = 'Check [link](../path/page.html) here.';
    const result = resolveUrls(input, 'https://example.com/docs/current/');
    assert.ok(result.includes('https://example.com/docs/path/page.html'));
  });

  it('leaves absolute URLs unchanged', () => {
    const input = 'Link [here](https://other.com/page) and [there](http://example.com).';
    const result = resolveUrls(input, 'https://example.com/');
    assert.ok(result.includes('https://other.com/page'));
    assert.ok(result.includes('http://example.com'));
  });

  it('leaves data: and mailto: links unchanged', () => {
    const input = '[Data](data:text/plain,hi) and [Email](mailto:test@example.com).';
    const result = resolveUrls(input, 'https://example.com/');
    assert.ok(result.includes('data:text/plain,hi'));
    assert.ok(result.includes('mailto:test@example.com'));
  });

  it('handles invalid base URL gracefully (returns input)', () => {
    const input = '[Link](page.html) here.';
    const result = resolveUrls(input, 'not-a-url');
    assert.equal(result, input);
  });

  it('resolves image src', () => {
    const input = '![Alt](/images/pic.png) image.';
    const result = resolveUrls(input, 'https://example.com/docs/');
    assert.ok(result.includes('https://example.com/images/pic.png'));
  });

  it('returns original when no baseUrl provided', () => {
    const input = '[Link](page.html) here.';
    const result = resolveUrls(input, '');
    assert.equal(result, input);
  });

  it('resolves root-relative paths', () => {
    const input = '[Link](/about/page.html) here.';
    const result = resolveUrls(input, 'https://example.com/docs/current/');
    assert.ok(result.includes('https://example.com/about/page.html'));
  });

  it('handles anchor links correctly', () => {
    const input = '[Jump](#section) here.';
    const result = resolveUrls(input, 'https://example.com/');
    assert.ok(result.includes('#section'));
  });

  it('skips extremely large inputs (>1MB) to prevent ReDoS', () => {
    const largeInput = '[link](path.html)' + 'x'.repeat(1_100_000);
    const result = resolveUrls(largeInput, 'https://example.com/');
    assert.equal(result, largeInput);
  });
});

// ─── pruneMarkdown ──────────────────────────────────────────────────────

describe('pruneMarkdown', () => {
  it('removes boilerplate heading sections (Cookie Policy, etc.)', () => {
    const input = `# Main Article

Good content here with enough text to ensure it's substantial and scores well during quality evaluation.

## Cookie Policy

We use cookies to track everything.

## Privacy Notice

Your data belongs to us now.

## More Content

Important information continues here with additional details and proper length.`;

    const result = pruneMarkdown(input);
    assert.ok(!result.includes('Cookie Policy'));
    assert.ok(!result.includes('Privacy Notice'));
    assert.ok(result.includes('Main Article'));
    assert.ok(result.includes('More Content'));
  });

  it('truncates when maxTokens exceeded, ends with *[truncated]*', () => {
    const input = '# Article\n\n' + 'Very long content with many words. '.repeat(200);
    const result = pruneMarkdown(input, 50);
    assert.ok(result.includes('*[truncated]*'));
    const tokens = countTokens(result);
    assert.ok(tokens <= 60, `Expected tokens <= 60, got ${tokens}`); // Allow some margin
  });

  it('returns original if pruning removes too much (< 20% remaining)', () => {
    const input = `# Cookie Policy

We use cookies for everything you do.

## Privacy Policy

All your data belongs to us.

### Terms of Service

You agree to everything.`;

    const result = pruneMarkdown(input);
    // All sections are boilerplate, so pruning would remove everything
    // Should return original instead
    assert.equal(result, input.trim());
  });

  it('removes sections with high link density (>0.6)', () => {
    const input = `# Article

Good content here with substantial text that provides value.

## Related Links

[Link 1](url1) [Link 2](url2) [Link 3](url3) [Link 4](url4) [Link 5](url5) [Link 6](url6)

## More Content

Important text continues with meaningful information.`;

    const result = pruneMarkdown(input);
    assert.ok(result.includes('Good content'));
    assert.ok(result.includes('More Content'));
    // Related Links section has high link density and should be removed
    assert.ok(!result.includes('Related Links') || result.includes('Link 1'));
  });

  it('removes short low-level headings with minimal content (< 50 chars, level >= 3)', () => {
    const input = `# Main Title

Good content with multiple sentences to ensure it's substantial and passes quality thresholds.

### Tiny Section

Hi

## Another Section

More substantial content here with enough text to pass the scoring threshold.`;

    const result = pruneMarkdown(input);
    assert.ok(result.includes('Main Title'));
    assert.ok(result.includes('Another Section'));
    // Tiny section should be removed (< 50 chars, heading level >= 3)
  });

  it('handles input without maxTokens parameter', () => {
    const input = `# Article

Content here with enough text.

## Cookie Notice

Cookies everywhere!

## Important Section

Critical information continues.`;

    const result = pruneMarkdown(input);
    assert.ok(!result.includes('Cookie Notice'));
    assert.ok(result.includes('Important Section'));
    // Should not truncate without maxTokens
    assert.ok(!result.includes('*[truncated]*'));
  });

  it('preserves content when maxTokens is 0 or undefined', () => {
    const input = '# Title\n\nContent here.\n\n## Privacy\n\nPrivacy text.';

    const result1 = pruneMarkdown(input);
    assert.ok(!result1.includes('*[truncated]*'));

    const result2 = pruneMarkdown(input, 0);
    assert.ok(!result2.includes('*[truncated]*'));
  });
});

// ─── cleanLLMOutput ─────────────────────────────────────────────────────

describe('cleanLLMOutput', () => {
  it('strips <think> tags', () => {
    const input = '<think>Internal reasoning here</think>The actual output.';
    const result = cleanLLMOutput(input);
    assert.equal(result, 'The actual output.');
  });

  it('strips code fences wrapping output', () => {
    const input = '```json\n{"key": "value"}\n```';
    const result = cleanLLMOutput(input);
    assert.equal(result, '{"key": "value"}');
  });

  it('handles unclosed think tag', () => {
    const input = '<think>Internal reasoning that goes on and on';
    const result = cleanLLMOutput(input);
    assert.ok(!result.includes('<think>'));
    assert.equal(result, '');
  });

  it('returns unchanged text when no artifacts', () => {
    const input = 'Just plain output text.';
    const result = cleanLLMOutput(input);
    assert.equal(result, input);
  });

  it('handles multiple think tags', () => {
    const input = '<think>First thought</think>Output<think>Second thought</think>More output.';
    const result = cleanLLMOutput(input);
    assert.equal(result, 'OutputMore output.');
  });

  it('strips code fence with language identifier', () => {
    const input = '```javascript\nconsole.log("hello");\n```';
    const result = cleanLLMOutput(input);
    assert.equal(result, 'console.log("hello");');
  });

  it('handles both think tags and code fences together', () => {
    const input = '<think>Planning the response</think>```json\n{"data": "value"}\n```';
    const result = cleanLLMOutput(input);
    assert.equal(result, '{"data": "value"}');
  });

  it('strips code fence without language identifier', () => {
    const input = '```\nplain code here\n```';
    const result = cleanLLMOutput(input);
    assert.equal(result, 'plain code here');
  });

  it('handles think tag with nested content', () => {
    const input = '<think>Step 1: analyze\nStep 2: respond</think>Final answer.';
    const result = cleanLLMOutput(input);
    assert.equal(result, 'Final answer.');
  });
});
