import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { getReplies, getReplyReplies, likeComment } from '../api/client';
import { storage } from '../utils/storage';
import { buildProxyUrl } from '../utils/proxy';

type CommentId = number | string;

export type CommentRailHandle = {
  handleKey: (key: string) => boolean;
};

type CommentRailProps = {
  aid?: CommentId | null;
  visible: boolean;
  aidLoading?: boolean;
  aidError?: string;
  onRetryAid?: () => void;
  onNotify?: (message: string) => void;
};

export type CommentView = {
  rpid: CommentId;
  uname: string;
  avatar: string;
  message: string;
  ctime: number;
  likeCount: number;
  liked: boolean;
  replyCount: number;
  previewReplies: CommentView[];
  replies: CommentView[];
  repliesPage: number;
  repliesHasMore: boolean;
  expanded: boolean;
  loadingReplies: boolean;
  replyError: string;
  liking: boolean;
};

export function normalizeComment(reply: any): CommentView {
  const previewReplies = Array.isArray(reply?.replies)
    ? reply.replies.map(normalizeComment)
    : [];
  const replyCount = Math.max(
    0,
    Number(reply?.rcount ?? reply?.count ?? previewReplies.length) || 0,
  );
  return {
    rpid: reply?.rpid ?? '',
    uname: String(reply?.member?.uname || '未知用户'),
    avatar: String(reply?.member?.avatar || reply?.member?.face || ''),
    message: String(reply?.content?.message || ''),
    ctime: Number(reply?.ctime || 0),
    likeCount: Math.max(0, Number(reply?.like || 0)),
    liked: Number(reply?.action || 0) === 1,
    replyCount,
    previewReplies,
    replies: previewReplies,
    repliesPage: 0,
    repliesHasMore: replyCount > previewReplies.length,
    expanded: false,
    loadingReplies: false,
    replyError: '',
    liking: false,
  };
}

function proxyAvatar(avatar: string) {
  if (!avatar) return '';
  try {
    return buildProxyUrl(avatar.startsWith('//') ? `https:${avatar}` : avatar);
  } catch {
    return avatar;
  }
}

function formatCount(value: number) {
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)}万`;
  return String(value || 0);
}

function formatCommentTime(timestamp: number) {
  if (!timestamp) return '';
  return new Date(timestamp * 1000).toLocaleDateString('zh-CN');
}

function mergeUniqueComments(current: CommentView[], incoming: CommentView[]) {
  const seen = new Set(current.map((comment) => String(comment.rpid)));
  return current.concat(
    incoming.filter((comment) => !seen.has(String(comment.rpid))),
  );
}

const CommentRail = forwardRef<CommentRailHandle, CommentRailProps>(
  function CommentRail(
    { aid, visible, aidLoading = false, aidError = '', onRetryAid, onNotify },
    ref,
  ) {
    const [comments, setComments] = useState<CommentView[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [commentCount, setCommentCount] = useState(0);
    const [nextCursor, setNextCursor] = useState('');
    const [hasMore, setHasMore] = useState(false);
    const [focusIndex, setFocusIndex] = useState(0);
    const [focusTarget, setFocusTarget] = useState<'body' | 'like'>('body');
    const commentsRef = useRef(comments);
    const focusIndexRef = useRef(focusIndex);
    const focusTargetRef = useRef(focusTarget);
    const hasMoreRef = useRef(hasMore);
    const nextCursorRef = useRef(nextCursor);
    const loadingMoreRef = useRef(false);
    const sessionRef = useRef(0);
    const topControllerRef = useRef<AbortController | null>(null);
    const nestedControllersRef = useRef(new Map<string, AbortController>());

    commentsRef.current = comments;
    focusIndexRef.current = focusIndex;
    focusTargetRef.current = focusTarget;
    hasMoreRef.current = hasMore;
    nextCursorRef.current = nextCursor;

    const updateComment = useCallback(
      (rpid: CommentId, updater: (comment: CommentView) => CommentView) => {
        setComments((current) =>
          current.map((comment) =>
            String(comment.rpid) === String(rpid) ? updater(comment) : comment,
          ),
        );
      },
      [],
    );

    const loadTopLevel = useCallback(
      async (cursor = '', append = false, session = sessionRef.current) => {
        if (!aid || loadingMoreRef.current) return;
        loadingMoreRef.current = true;
        if (append) setLoadingMore(true);
        else {
          setLoading(true);
          setLoadError('');
        }
        const controller = new AbortController();
        topControllerRef.current?.abort();
        topControllerRef.current = controller;
        try {
          const response = await getReplies(aid, cursor, controller.signal);
          const data = response?.data || response || {};
          if (sessionRef.current !== session || controller.signal.aborted)
            return;
          const incoming = Array.isArray(data?.replies)
            ? data.replies.map(normalizeComment)
            : [];
          setComments((current) =>
            append ? mergeUniqueComments(current, incoming) : incoming,
          );
          const cursorData = data?.cursor || {};
          const incomingNext = String(
            cursorData?.pagination_reply?.next_offset || '',
          );
          setCommentCount(
            Math.max(0, Number(cursorData?.all_count ?? incoming.length) || 0),
          );
          setNextCursor(incomingNext);
          setHasMore(!cursorData?.is_end && !!incomingNext);
          setLoadError('');
        } catch (error) {
          if (sessionRef.current !== session || controller.signal.aborted)
            return;
          if (!append) setLoadError('评论加载失败');
          onNotify?.(error instanceof Error ? error.message : '评论加载失败');
        } finally {
          if (sessionRef.current === session) {
            loadingMoreRef.current = false;
            setLoading(false);
            setLoadingMore(false);
          }
        }
      },
      [aid, onNotify],
    );

    useEffect(() => {
      const session = sessionRef.current + 1;
      sessionRef.current = session;
      topControllerRef.current?.abort();
      nestedControllersRef.current.forEach((controller) => controller.abort());
      nestedControllersRef.current.clear();
      loadingMoreRef.current = false;
      setComments([]);
      setLoading(false);
      setLoadingMore(false);
      setLoadError('');
      setCommentCount(0);
      setNextCursor('');
      setHasMore(false);
      setFocusIndex(0);
      setFocusTarget('body');
      if (visible && aid) loadTopLevel('', false, session);
      return () => {
        topControllerRef.current?.abort();
        nestedControllersRef.current.forEach((controller) =>
          controller.abort(),
        );
      };
    }, [aid, visible, loadTopLevel]);

    const loadNestedReplies = useCallback(
      async (comment: CommentView, page: number) => {
        if (!aid || comment.loadingReplies) return;
        const session = sessionRef.current;
        const key = String(comment.rpid);
        const controller = new AbortController();
        nestedControllersRef.current.get(key)?.abort();
        nestedControllersRef.current.set(key, controller);
        updateComment(comment.rpid, (current) => ({
          ...current,
          loadingReplies: true,
          replyError: '',
        }));
        try {
          const response = await getReplyReplies(
            aid,
            comment.rpid,
            page,
            controller.signal,
          );
          const data = response?.data || response || {};
          if (sessionRef.current !== session || controller.signal.aborted)
            return;
          const incoming = Array.isArray(data?.replies)
            ? data.replies.map(normalizeComment)
            : [];
          const pageData = data?.page || {};
          const pageNumber = Number(pageData?.num || page);
          const pageSize = Number(pageData?.size || incoming.length || 10);
          const total = Number(pageData?.count ?? comment.replyCount);
          updateComment(comment.rpid, (current) => ({
            ...current,
            replies:
              page === 1
                ? incoming
                : mergeUniqueComments(current.replies, incoming),
            repliesPage: page,
            repliesHasMore: pageNumber * pageSize < total,
            expanded: true,
            loadingReplies: false,
            replyError: '',
          }));
        } catch (error) {
          if (sessionRef.current !== session || controller.signal.aborted)
            return;
          updateComment(comment.rpid, (current) => ({
            ...current,
            loadingReplies: false,
            replyError: '回复加载失败',
          }));
          onNotify?.(error instanceof Error ? error.message : '回复加载失败');
        } finally {
          nestedControllersRef.current.delete(key);
        }
      },
      [aid, onNotify, updateComment],
    );

    const toggleReplies = useCallback(
      (index: number) => {
        const comment = commentsRef.current[index];
        if (!comment || comment.loadingReplies) return;
        if (!comment.expanded) {
          if (comment.replyCount > 0 || comment.previewReplies.length > 0) {
            loadNestedReplies(comment, 1);
          }
          return;
        }
        if (comment.repliesHasMore) {
          loadNestedReplies(comment, comment.repliesPage + 1);
          return;
        }
        updateComment(comment.rpid, (current) => ({
          ...current,
          expanded: false,
        }));
      },
      [loadNestedReplies, updateComment],
    );

    const toggleLike = useCallback(
      async (index: number) => {
        const comment = commentsRef.current[index];
        if (!aid || !comment || comment.liking) return;
        const auth = storage.getAuth();
        if (!auth?.SESSDATA || !auth?.bili_jct) {
          onNotify?.('请先登录');
          return;
        }
        const session = sessionRef.current;
        const previousLiked = comment.liked;
        const previousCount = comment.likeCount;
        updateComment(comment.rpid, (current) => ({
          ...current,
          liked: !previousLiked,
          likeCount: Math.max(0, previousCount + (previousLiked ? -1 : 1)),
          liking: true,
        }));
        try {
          await likeComment(aid, comment.rpid, previousLiked ? 0 : 1);
          if (sessionRef.current !== session) return;
          updateComment(comment.rpid, (current) => ({
            ...current,
            liking: false,
          }));
        } catch (error) {
          if (sessionRef.current !== session) return;
          updateComment(comment.rpid, (current) => ({
            ...current,
            liked: previousLiked,
            likeCount: previousCount,
            liking: false,
          }));
          onNotify?.(error instanceof Error ? error.message : '评论点赞失败');
        }
      },
      [aid, onNotify, updateComment],
    );

    useImperativeHandle(
      ref,
      () => ({
        handleKey(key: string) {
          if (!visible) return false;
          const list = commentsRef.current;
          const index = focusIndexRef.current;
          if (key === 'ArrowUp') {
            setFocusIndex(Math.max(0, index - 1));
            setFocusTarget('body');
            return true;
          }
          if (key === 'ArrowDown') {
            const nextIndex = Math.min(Math.max(0, list.length - 1), index + 1);
            setFocusIndex(nextIndex);
            setFocusTarget('body');
            if (
              hasMoreRef.current &&
              nextCursorRef.current &&
              nextIndex >= list.length - 1
            ) {
              loadTopLevel(nextCursorRef.current, true);
            }
            return true;
          }
          if (key === 'ArrowRight') {
            setFocusTarget('like');
            return true;
          }
          if (key === 'ArrowLeft') {
            setFocusTarget('body');
            return true;
          }
          if (key === 'Enter') {
            if (focusTargetRef.current === 'like') toggleLike(index);
            else toggleReplies(index);
            return true;
          }
          return false;
        },
      }),
      [loadTopLevel, toggleLike, toggleReplies, visible],
    );

    useEffect(() => {
      if (
        !visible ||
        typeof document === 'undefined' ||
        typeof document.querySelector !== 'function'
      )
        return;
      const card = document.querySelector(
        `.comment-card[data-comment-index="${focusIndex}"]`,
      );
      card?.scrollIntoView?.({ block: 'nearest' });
    }, [focusIndex, focusTarget, visible]);

    if (!visible) return null;

    let content;
    if (!aid) {
      content = aidError ? (
        <div className="comment-error">
          <div>{aidError}</div>
          <button className="comment-retry" onClick={onRetryAid}>
            重试
          </button>
        </div>
      ) : (
        <div className="comment-empty">
          {aidLoading ? '正在获取视频信息…' : '评论加载失败'}
        </div>
      );
    } else if (loading && comments.length === 0) {
      content = <div className="comment-empty">加载评论…</div>;
    } else if (loadError && comments.length === 0) {
      content = (
        <div className="comment-error">
          <div>{loadError}</div>
          <button
            className="comment-retry"
            onClick={() => loadTopLevel('', false)}
          >
            重试
          </button>
        </div>
      );
    } else if (comments.length === 0) {
      content = <div className="comment-empty">暂无评论</div>;
    } else {
      content = comments.map((comment, index) => {
        const shownReplies = comment.expanded
          ? comment.replies
          : comment.previewReplies.slice(0, 3);
        const bodyFocused = focusIndex === index && focusTarget === 'body';
        const likeFocused = focusIndex === index && focusTarget === 'like';
        return (
          <article
            key={comment.rpid}
            className={`comment-card ${bodyFocused ? 'focused' : ''}`}
            data-comment-index={index}
            onMouseEnter={() => {
              setFocusIndex(index);
              setFocusTarget('body');
            }}
          >
            <div className="comment-avatar">
              {comment.avatar && (
                <img src={proxyAvatar(comment.avatar)} alt="" />
              )}
            </div>
            <div className="comment-copy">
              <button
                className="comment-body"
                onClick={() => toggleReplies(index)}
              >
                <span className="comment-author">
                  {comment.uname}
                  {comment.ctime
                    ? ` · ${formatCommentTime(comment.ctime)}`
                    : ''}
                </span>
                <span className="comment-message">{comment.message}</span>
              </button>
              <div className="comment-meta">
                <button
                  className={`comment-like ${comment.liked ? 'liked' : ''} ${likeFocused ? 'focused' : ''}`}
                  onMouseEnter={() => {
                    setFocusIndex(index);
                    setFocusTarget('like');
                  }}
                  onClick={() => toggleLike(index)}
                >
                  👍 {formatCount(comment.likeCount)}
                </button>
                {comment.replyCount > 0 && (
                  <span>{comment.replyCount} 条回复</span>
                )}
              </div>
              {(shownReplies.length > 0 || comment.replyError) && (
                <div
                  className={`comment-replies ${comment.expanded ? 'expanded' : ''}`}
                >
                  {shownReplies.map((reply) => (
                    <div key={reply.rpid} className="comment-reply">
                      <span>{reply.uname}: </span>
                      {reply.message}
                    </div>
                  ))}
                  {comment.replyError && (
                    <div className="comment-inline-error">
                      {comment.replyError}，按 OK 重试
                    </div>
                  )}
                  {comment.loadingReplies && (
                    <div className="comment-inline-status">加载回复…</div>
                  )}
                  {comment.expanded && comment.repliesHasMore && (
                    <div className="comment-inline-status">
                      按 OK 加载更多回复
                    </div>
                  )}
                  {comment.expanded && !comment.repliesHasMore && (
                    <div className="comment-inline-status">按 OK 收起回复</div>
                  )}
                </div>
              )}
            </div>
          </article>
        );
      });
    }

    return (
      <aside className="comment-rail">
        <header className="comment-rail-header">
          {commentCount > 0 ? `评论 · ${formatCount(commentCount)}` : '评论'}
        </header>
        <div className="comment-rail-body">
          {content}
          {loadingMore && <div className="comment-empty">加载更多评论…</div>}
        </div>
      </aside>
    );
  },
);

export default CommentRail;
