import { expect, test } from 'bun:test';

const css = await Bun.file(new URL('./styles.css', import.meta.url)).text();

function getBlockBody(selector: string) {
  const start = css.indexOf(selector);
  const openBrace = css.indexOf('{', start);
  let depth = 0;
  for (let index = openBrace; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    if (css[index] !== '}') continue;
    depth -= 1;
    if (depth === 0) return css.slice(openBrace + 1, index);
  }
  throw new Error(`Unclosed CSS block: ${selector}`);
}

function getTransitionProperties(ruleBody: string) {
  return [...ruleBody.matchAll(/(?:^|\n)\s*transition(?:-property)?:\s*([^;]+);/g)]
    .flatMap((match) => match[1].split(','))
    .map((entry) => entry.trim().split(/\s+/)[0])
    .filter((property) => property && property !== 'none');
}

test('video cards retain the TV-proven layout and transform-only focus style', () => {
  const cardRule = getBlockBody('.video-card {');
  const focusRule = getBlockBody('.video-card.focused {');
  const subscriptionFocusRule = getBlockBody('.subscription-card.focused {');
  const thumbnailRule = getBlockBody('.video-card-thumb {');
  const durationRule = getBlockBody('.video-card-duration {');
  const infoRule = getBlockBody('.video-card-info {');
  const titleRule = getBlockBody('.video-card-title {');
  const metaRule = getBlockBody('.video-card-meta {');
  const metaSpanRule = getBlockBody('.video-card-meta span {');
  const desktopHoverMedia = getBlockBody(
    '@media (hover: hover) and (pointer: fine) {',
  );

  expect(getTransitionProperties(cardRule)).toEqual(['transform']);
  expect(getTransitionProperties(focusRule)).toEqual([]);
  expect(cardRule).toContain('border-radius: 12px');
  expect(cardRule).toContain('outline: none');
  expect(cardRule).toContain('transform: scale(1)');
  expect(cardRule).toContain('transition: transform 0.15s ease');
  expect(cardRule).not.toContain('box-shadow');
  expect(focusRule).toContain('background: var(--card-focus-bg)');
  expect(focusRule).toContain('transform: scale(1.03)');
  expect(focusRule).not.toContain('outline');
  expect(focusRule).not.toContain('box-shadow');
  expect(subscriptionFocusRule).toContain('outline-color: var(--focus-ring)');
  expect(subscriptionFocusRule).toContain('transform: scale(1.03)');
  expect(getTransitionProperties(subscriptionFocusRule)).toEqual([]);
  expect(thumbnailRule).toContain('aspect-ratio: 16 / 9');
  expect(durationRule).toContain('bottom: 6px');
  expect(durationRule).toContain('right: 8px');
  expect(durationRule).toContain('font-size: 13px');
  expect(durationRule).toContain('padding: 2px 8px');
  expect(durationRule).toContain('border-radius: 4px');
  expect(infoRule).toContain('padding: 16px 10px 10px');
  expect(titleRule).toContain('font-size: 28px');
  expect(titleRule).toContain('line-height: 1.35');
  expect(titleRule).toContain('-webkit-line-clamp: 2');
  expect(titleRule).toContain('margin-bottom: 8px');
  expect(titleRule).not.toContain('min-height');
  expect(metaRule).toContain('font-size: 22px');
  expect(metaSpanRule).toContain('margin-right: 14px');
  expect(desktopHoverMedia).not.toContain('.video-card:hover:not(.focused)');
  expect(desktopHoverMedia).toContain(
    '.subscription-card:hover:not(.focused)',
  );
  expect(desktopHoverMedia).toContain(
    'border-color: rgba(85, 216, 255, 0.3)',
  );
  expect(desktopHoverMedia).toContain('transform: translateY(-3px)');
  expect(desktopHoverMedia).toContain(
    'box-shadow: 0 15px 30px rgba(0, 0, 0, 0.25)',
  );
});
