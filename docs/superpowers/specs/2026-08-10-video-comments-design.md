# 视频评论功能设计

## 背景

为播放器增加视频评论浏览能力，交互参考
[`asdf17128/bili-webos`](https://github.com/asdf17128/bili-webos)。评论显示在播放器右侧独立栏中，不覆盖视频画面；播放器继续播放。

## 范围

### 包含

- 播放器控制条增加“评论”入口。
- 右侧评论栏：热门顶层评论、分页、加载中、空态、失败重试。
- 顶层评论的楼中楼预览、展开、加载更多与收起。
- 仅顶层评论点赞/取消点赞；回复只读。
- 遥控器和鼠标交互：评论正文焦点、点赞按钮焦点、上下翻页、返回关闭。
- 未登录时保留评论浏览，点赞操作提示“请先登录”。

### 不包含

- 发表评论、回复评论、回复点赞。
- 评论排序切换。
- 评论独立页面或遮挡视频的弹窗布局。

## 设计

### API

在 `src/api/client.ts` 增加三个命名 API 函数，继续使用现有 Luna/开发代理智能请求链路：

- `getReplies(aid, cursor)` 调用 `/x/v2/reply/main`，视频评论 `type=1`、`mode=3` 热门排序。首次请求传空 `pagination_str.offset`，后续请求原样传递响应 `cursor.pagination_reply.next_offset`，并用 `cursor.is_end` 判断结束。
- `getReplyReplies(aid, rpid, page)` 调用 `/x/v2/reply/reply`，每页 10 条。
- `likeComment(aid, rpid, action)` 调用 `/x/v2/reply/action`，提交 `type=1`、`oid=aid`、`rpid`、`action` 和 `csrf`。

评论读取使用 `apiFetch`，点赞使用现有 `smartFetch` 的表单 POST 能力，并从 `storage.getAuth()` 读取 `bili_jct`。所有三个封装都检查 B 站响应 `code`；只有 `code === 0` 才算成功，HTTP 200 携带非零业务码也进入错误路径。现有 `api.bilibili.com` 主机白名单、Referer、Cookie 和 X-Set-Cookie 桥接已经覆盖这些请求，不新增服务方法或依赖。

### 组件边界

新增 `src/player/CommentRail.tsx`。组件接收已解析的视频 aid、是否显示、父级焦点索引，以及关闭、焦点变更和活动通知回调；父级负责 aid 解析和是否挂载/显示右栏，组件内部负责：

- 顶层评论加载和分页状态。
- B 站 `member/content/count/action` 结构到稳定评论模型的归一化。
- 单条评论楼中楼的加载、分页、展开/收起。
- 顶层评论点赞的登录检查、成功更新和失败回滚。
- 评论栏内容的渲染，包括头像、用户名、时间、内容、点赞数和回复提示。

`PlayerPage.tsx` 保留播放器全局键盘处理，因为 `useFocus` 通过父级注册的 `setCustomKeyHandler` 拦截遥控器按键。播放器负责评论栏开关、评论焦点区域和返回键层级。播放器维护 `videoAid`：优先使用输入 `video.aid`，复用视频详情请求返回的 `info.data.aid`；若打开评论时仍只有 `bvid`，则懒调用 `getVideoInfo` 解析 aid，解析期间显示加载态。评论数据与 API 细节不再散落在播放器 JSX 中。

播放器根节点内新增统一的 `.player-stage` 内容容器。视频、弹幕、字幕、加载层、缓冲层、控制条、画质/倍速/字幕面板和结束页全部放在该容器中。评论栏关闭时舞台占满视口；打开时舞台右边界缩进评论栏宽度，所有叠层共同使用舞台坐标系，避免弹幕、字幕或控制条延伸到评论栏下方。

### 焦点与交互

- 控制条新增“评论”按钮，`Enter` 打开评论栏并将焦点放到第一条评论正文。
- 评论正文焦点：`ArrowUp/ArrowDown` 切换顶层评论，`ArrowRight` 进入该评论点赞按钮，`Enter` 展开/收起回复。
- 点赞按钮焦点：`ArrowLeft` 返回正文，`Enter` 点赞/取消点赞。
- 到达当前页底部时加载下一页；评论栏关闭时停止/忽略未完成请求。
- `Back` 关闭评论栏，恢复控制条评论按钮焦点；不退出播放器。
- 评论栏宽度使用稳定的电视布局（约 420px），通过 `.player-stage` 同步缩窄视频及全部播放器叠层，不使用覆盖层或昂贵动画。

### 数据模型

顶层评论归一化为：

```ts
{
  rpid: string | number;
  uname: string;
  avatar: string;
  message: string;
  likeCount: number;
  liked: boolean;
  replyCount: number;
  replies: Reply[];
  repliesPage: number;
  repliesHasMore: boolean;
  expanded: boolean;
}
```

回复使用相同的展示字段，但不显示可操作点赞按钮。顶层评论的 `liked` 由响应 `action === 1` 得到。评论请求返回后检查当前视频 key，避免旧视频的异步结果污染新视频。

### 异常处理

- 首次加载失败显示错误和重试入口，不阻塞播放器。
- 无评论显示空态。
- 楼中楼加载失败保留顶层评论，并允许再次展开重试。
- 点赞先乐观更新 `liked` 和 `likeCount`；请求抛错或响应 `code !== 0` 时恢复原状态并显示错误提示。
- 未登录点赞不请求网络，只显示登录提示。
- 只有 `bvid` 且 aid 解析失败时显示评论加载错误和重试入口，不影响视频播放。
- 组件卸载或视频切换时清理 AbortController/请求活动标记。

## 测试策略

- `src/api/client.test.ts`：评论列表游标、楼中楼查询参数；点赞表单、CSRF、成功响应和非零业务码。
- 新增 `src/player/CommentRail.test.tsx`：加载/空态/错误重试、分页、楼中楼展开与收起、点赞成功与回滚、未登录提示、评论正文与点赞焦点操作。
- `src/player/player.render.test.ts`：播放器评论按钮打开/关闭右栏；`bvid` 单独输入能解析 aid；视频、弹幕、字幕、加载/缓冲、控制条和面板共同位于缩窄的播放器舞台；原有播放、相关视频和返回行为保持不变。
- 所有网络请求使用 mock，不对真实账号执行点赞。

## 验收标准

1. 打开视频后可从控制条进入右侧评论栏，视频仍可播放且评论栏不覆盖视频。
2. 评论能加载、显示热门分页，并能用遥控器上下浏览。
3. 有回复的评论可用 `OK` 展开、加载更多和收起楼中楼。
4. 登录后顶层评论可点赞/取消点赞，计数与状态正确；失败时状态回滚。
5. 未登录仍可阅读评论，点赞时得到明确提示。
6. 相关测试、类型检查和 lint 通过。
