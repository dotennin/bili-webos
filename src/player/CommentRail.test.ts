import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import {
  React,
  flush,
  interact,
  render,
  textOf,
  update,
} from '../test/reactTestUtils.ts';
import type { CommentRailHandle } from './CommentRail';

const apiPath = new URL('../api/client.ts', import.meta.url).pathname;
const storagePath = new URL('../utils/storage.ts', import.meta.url).pathname;
const componentPath = new URL('./CommentRail.tsx', import.meta.url).pathname;
const realApi = await import(apiPath);
const realStorage = await import(storagePath);

let api;
let auth;

function rawReply(overrides = {}) {
  return {
    rpid: 1,
    member: { uname: 'Alice', avatar: 'https://i0.hdslb.com/avatar.jpg' },
    content: { message: '顶层评论' },
    ctime: 1_700_000_000,
    like: 2,
    action: 0,
    rcount: 2,
    replies: [
      {
        rpid: 11,
        member: { uname: 'Bob', avatar: '' },
        content: { message: '预览回复' },
        like: 0,
        action: 0,
        rcount: 0,
      },
    ],
    ...overrides,
  };
}

function topPage(overrides = {}) {
  return {
    replies: [rawReply()],
    cursor: {
      all_count: 1,
      is_end: true,
      pagination_reply: { next_offset: '' },
    },
    ...overrides,
  };
}

async function renderRail(overrides = {}) {
  const { default: CommentRail } = await import(componentPath);
  const ref = React.createRef<CommentRailHandle>();
  const notify = mock(() => {});
  const props = {
    ref,
    aid: 123,
    visible: true,
    aidLoading: false,
    aidError: '',
    onRetryAid: mock(() => {}),
    onNotify: notify,
    ...overrides,
  };
  const renderer = await render(React.createElement(CommentRail, props));
  await interact(() => flush());
  return { CommentRail, notify, props, ref, renderer };
}

beforeEach(() => {
  auth = { SESSDATA: 'sess', bili_jct: 'csrf-token' };
  api = {
    getReplies: mock(async () => topPage()),
    getReplyReplies: mock(async () => ({
      replies: [
        rawReply({
          rpid: 11,
          member: { uname: 'Bob', avatar: '' },
          content: { message: '完整回复一' },
          rcount: 0,
          replies: [],
        }),
        rawReply({
          rpid: 12,
          member: { uname: 'Carol', avatar: '' },
          content: { message: '完整回复二' },
          rcount: 0,
          replies: [],
        }),
      ],
      page: { count: 2, num: 1, size: 10 },
    })),
    likeComment: mock(async () => ({ code: 0 })),
  };

  mock.module(apiPath, () => ({
    ...realApi,
    getReplies: (...args) => api.getReplies(...args),
    getReplyReplies: (...args) => api.getReplyReplies(...args),
    likeComment: (...args) => api.likeComment(...args),
  }));
  mock.module(storagePath, () => ({
    ...realStorage,
    storage: {
      ...realStorage.storage,
      getAuth: () => auth,
    },
  }));
});

afterEach(() => {
  mock.restore();
});

test('loads normalized comments, previews, and empty state', async () => {
  const loaded = await renderRail();
  const tree = textOf(loaded.renderer.toJSON());
  expect(tree).toContain('评论 · 1');
  expect(tree).toContain('Alice');
  expect(tree).toContain('顶层评论');
  expect(tree).toContain('预览回复');
  expect(loaded.renderer.container.querySelector('img')?.src).toContain(
    '/proxy/i0.hdslb.com/avatar.jpg',
  );
  loaded.renderer.unmount();

  api.getReplies = mock(async () => topPage({ replies: [] }));
  const empty = await renderRail();
  expect(textOf(empty.renderer.toJSON())).toContain('暂无评论');
  empty.renderer.unmount();
});

test('falls back to the original avatar when the image URL is malformed', async () => {
  api.getReplies = mock(async () =>
    topPage({
      replies: [
        rawReply({
          member: { uname: '坏头像', avatar: 'not-a-url' },
        }),
      ],
    }),
  );
  const { renderer } = await renderRail();
  expect(renderer.container.querySelector('img')?.src).toContain('not-a-url');
  renderer.unmount();
});

test('shows a retry action after a top-level load failure', async () => {
  let attempts = 0;
  api.getReplies = mock(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('network down');
    return topPage();
  });
  const { renderer } = await renderRail();
  expect(textOf(renderer.toJSON())).toContain('评论加载失败');

  await interact(() => renderer.container.querySelector('.comment-retry')?.click());
  expect(textOf(renderer.toJSON())).toContain('顶层评论');
  expect(api.getReplies).toHaveBeenCalledTimes(2);
  renderer.unmount();
});

test('uses the next cursor when focus approaches the page end', async () => {
  api.getReplies = mock(async (_aid, cursor) =>
    cursor
      ? topPage({ replies: [rawReply({ rpid: 3, content: { message: '第三条' } })] })
      : topPage({
          replies: [
            rawReply({ rpid: 1, content: { message: '第一条' } }),
            rawReply({ rpid: 2, content: { message: '第二条' } }),
          ],
          cursor: {
            all_count: 3,
            is_end: false,
            pagination_reply: { next_offset: 'next-offset' },
          },
        }),
  );
  const { ref, renderer } = await renderRail();

  expect(ref.current?.handleKey('PageUp')).toBe(false);
  await interact(() => ref.current?.handleKey('ArrowDown'));
  await interact(() => ref.current?.handleKey('ArrowUp'));
  await interact(() => ref.current?.handleKey('ArrowRight'));
  await interact(() => ref.current?.handleKey('ArrowLeft'));
  expect(api.getReplies).toHaveBeenLastCalledWith(
    123,
    'next-offset',
    expect.anything(),
  );
  expect(textOf(renderer.toJSON())).toContain('第三条');
  renderer.unmount();
});

test('clears liking state after a successful like and supports mouse focus', async () => {
  const { ref, renderer } = await renderRail();
  const card = renderer.container.querySelector('.comment-card');
  const like = renderer.container.querySelector('.comment-like');
  await interact(() =>
    card?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })),
  );
  expect(card?.classList.contains('focused')).toBe(true);
  await interact(() =>
    like?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })),
  );
  expect(like?.classList.contains('focused')).toBe(true);
  await interact(() => ref.current?.handleKey('ArrowRight'));
  await interact(() => ref.current?.handleKey('Enter'));
  expect(api.likeComment).toHaveBeenCalledWith(
    123,
    1,
    1,
  );
  expect(renderer.container.querySelector('.comment-like.liked')).not.toBeNull();
  renderer.unmount();
});

test('expands nested replies, loads another page, then collapses', async () => {
  api.getReplyReplies = mock(async (_aid, _root, page) => ({
    replies: [
      rawReply({
        rpid: page === 1 ? 11 : 12,
        member: { uname: page === 1 ? 'Bob' : 'Carol', avatar: '' },
        content: { message: page === 1 ? '完整回复一' : '完整回复二' },
        rcount: 0,
        replies: [],
      }),
    ],
    page: { count: 2, num: page, size: 1 },
  }));
  const { ref, renderer } = await renderRail();

  await interact(() => ref.current?.handleKey('Enter'));
  expect(textOf(renderer.toJSON())).toContain('完整回复一');
  await interact(() => ref.current?.handleKey('Enter'));
  expect(textOf(renderer.toJSON())).toContain('完整回复二');
  expect(api.getReplyReplies).toHaveBeenLastCalledWith(
    123,
    1,
    2,
    expect.anything(),
  );
  await interact(() => ref.current?.handleKey('Enter'));
  expect(textOf(renderer.toJSON())).not.toContain('完整回复二');
  expect(textOf(renderer.toJSON())).toContain('预览回复');
  renderer.unmount();
});

test('retries a failed nested reply request without losing the root comment', async () => {
  let attempts = 0;
  api.getReplyReplies = mock(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('reply down');
    return { replies: [], page: { count: 0, num: 1, size: 10 } };
  });
  const { ref, renderer } = await renderRail();

  await interact(() => ref.current?.handleKey('Enter'));
  expect(textOf(renderer.toJSON())).toContain('回复加载失败');
  expect(textOf(renderer.toJSON())).toContain('顶层评论');
  await interact(() => ref.current?.handleKey('Enter'));
  expect(api.getReplyReplies).toHaveBeenCalledTimes(2);
  renderer.unmount();
});

test('navigates to like, applies optimistic state, and rolls back failures', async () => {
  let rejectLike;
  api.likeComment = mock(
    () =>
      new Promise((_resolve, reject) => {
        rejectLike = reject;
      }),
  );
  const { notify, ref, renderer } = await renderRail();

  await interact(() => ref.current?.handleKey('ArrowRight'));
  expect(renderer.container.querySelector('.comment-like.focused')).not.toBeNull();
  await interact(() => ref.current?.handleKey('Enter'));
  expect(textOf(renderer.container.querySelector('.comment-like'))).toContain('3');
  expect(renderer.container.querySelector('.comment-like.liked')).not.toBeNull();

  await interact(() => rejectLike(new Error('like down')));
  expect(textOf(renderer.container.querySelector('.comment-like'))).toContain('2');
  expect(renderer.container.querySelector('.comment-like.liked')).toBeNull();
  expect(notify).toHaveBeenCalledWith('like down');
  renderer.unmount();
});

test('does not request a like while logged out', async () => {
  auth = null;
  const { notify, ref, renderer } = await renderRail();

  await interact(() => ref.current?.handleKey('ArrowRight'));
  await interact(() => ref.current?.handleKey('Enter'));
  expect(api.likeComment).not.toHaveBeenCalled();
  expect(notify).toHaveBeenCalledWith('请先登录');
  renderer.unmount();
});

test('aborts in-flight nested reply requests on unmount', async () => {
  let resolveReplies;
  api.getReplyReplies = mock(
    () =>
      new Promise((resolve) => {
        resolveReplies = resolve;
      }),
  );
  const { ref, renderer } = await renderRail();

  await interact(() => ref.current?.handleKey('Enter'));
  await interact(() => resolveReplies({ replies: [], page: { count: 0, num: 1, size: 10 } }));
  renderer.unmount();
});

test('ignores top-level results after the rail closes', async () => {
  let resolveReplies;
  api.getReplies = mock(
    () =>
      new Promise((resolve) => {
        resolveReplies = resolve;
      }),
  );
  const view = await renderRail();

  await update(
    view.renderer,
    React.createElement(view.CommentRail, { ...view.props, visible: false }),
  );
  await interact(() => resolveReplies(topPage()));
  expect(textOf(view.renderer.toJSON())).not.toContain('顶层评论');
  view.renderer.unmount();
});

test('shows aid resolution status and retries through the parent', async () => {
  const loading = await renderRail({ aid: null, aidLoading: true });
  expect(textOf(loading.renderer.toJSON())).toContain('正在获取视频信息');
  expect(api.getReplies).not.toHaveBeenCalled();
  loading.renderer.unmount();

  const onRetryAid = mock(() => {});
  const error = await renderRail({
    aid: null,
    aidError: '视频信息获取失败',
    onRetryAid,
  });
  await interact(() => error.renderer.container.querySelector('.comment-retry')?.click());
  expect(onRetryAid).toHaveBeenCalledTimes(1);
  error.renderer.unmount();
});
