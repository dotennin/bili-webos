type PageStateKind = 'loading' | 'empty' | 'error' | 'unauthenticated';

type PageStateProps = {
  state: PageStateKind;
  message?: string;
  title?: string;
  className?: string;
};

const DEFAULT_MESSAGES: Record<PageStateKind, string> = {
  loading: '加载中...',
  empty: '暂无内容',
  error: '加载失败',
  unauthenticated: '请先登录',
};

export default function PageState({
  state,
  message = DEFAULT_MESSAGES[state],
  title,
  className = '',
}: PageStateProps) {
  return (
    <div className={`page-state page-state-${state} ${className}`.trim()}>
      {state === 'loading' && <div className="loading-spinner" />}
      <div className="page-state-copy">
        {title && <div className="page-state-title">{title}</div>}
        <div className="page-state-message">{message}</div>
      </div>
    </div>
  );
}
