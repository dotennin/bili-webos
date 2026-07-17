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

test('TV card focus only animates compositor-friendly transforms', () => {
  const cardRule = getBlockBody('.video-card {');
  const subscriptionRule = getBlockBody('.subscription-card {');
  const focusRule = getBlockBody(
    '.video-card.focused,\n.subscription-card.focused {',
  );
  const desktopHoverMedia = getBlockBody(
    '@media (hover: hover) and (pointer: fine) {',
  );

  expect(getTransitionProperties(cardRule)).toEqual(['transform']);
  expect(getTransitionProperties(subscriptionRule)).toEqual([]);
  expect(getTransitionProperties(focusRule)).toEqual([]);
  expect(focusRule).toContain('outline-color: var(--focus-ring)');
  expect(desktopHoverMedia).toContain('.video-card:hover:not(.focused)');
  expect(desktopHoverMedia).toContain('.subscription-card:hover:not(.focused)');
});
