# 视频评论功能实现计划

**目标：** 在播放器中增加右侧评论栏，支持热门评论游标分页、楼中楼和顶层评论点赞/取消点赞。

**架构：** API 请求封装保留在 `src/api/client.ts`；评论数据、分页和点赞状态放入独立 `CommentRail` 组件；`PlayerPage` 只负责 aid 解析、评论栏开关、播放器舞台布局和全局遥控器焦点。

## 任务 1：评论 API

**文件：**

- 修改 `src/api/client.ts`
- 修改 `src/api/client.test.ts`

1. 先增加失败测试，覆盖 `/x/v2/reply/main` 的 `type=1`、`mode=3` 和 `pagination_str` 游标。
2. 增加楼中楼 `/x/v2/reply/reply` 的 `root/pn/ps` 参数测试。
3. 增加 `/x/v2/reply/action` 表单 POST、CSRF、点赞/取消和非零业务码测试。
4. 实现 `getReplies`、`getReplyReplies`、`likeComment`，统一把 `code !== 0` 转为异常。
5. 运行 `bun test src/api/client.test.ts` 和 `bun run typecheck`。

## 任务 2：独立 CommentRail

**文件：**

- 新增 `src/player/CommentRail.tsx`
- 新增 `src/player/CommentRail.test.tsx`

1. 先测试评论归一化、加载、空态和失败重试。
2. 测试顶层评论游标分页和最后一页停止加载。
3. 测试楼中楼预览、展开、加载更多、收起和失败重试。
4. 测试登录点赞、取消点赞、乐观更新、失败回滚和未登录提示。
5. 测试方向键在评论正文和点赞按钮之间导航，以及切视频/关闭后的过期请求隔离。
6. 实现归一化纯函数、组件状态和对父级暴露的按键处理接口。
7. 运行 `bun test src/player/CommentRail.test.tsx`。

## 任务 3：播放器集成和舞台布局

**文件：**

- 修改 `src/player/PlayerPage.tsx`
- 修改 `src/player/player.render.test.ts`
- 修改 `src/styles.css`
- 修改 `src/styles.performance.test.ts`

1. 先测试控制条评论按钮打开/关闭右栏，并恢复评论按钮焦点。
2. 测试 `bvid` 单独输入在打开评论时解析 aid；已有 aid 时不重复请求详情。
3. 测试视频、弹幕、字幕、加载/缓冲层、控制条和选择面板都位于 `.player-stage`，评论打开时舞台统一缩窄。
4. 将 `comments` 追加到控制数组末尾，避免破坏现有硬编码控制索引。
5. 增加 `videoAid` 状态和懒解析逻辑，将按键转发给 `CommentRail`，处理返回键和自动隐藏计时。
6. 新增 `.player-stage` 与评论栏样式；视频和弹幕改用容器百分比尺寸，不给舞台宽度变化添加动画。
7. 增加评论焦点样式性能测试：只允许 `transform 0.15s ease`，禁止阴影和昂贵效果。
8. 运行 `bun test src/player/player.render.test.ts` 和 `bun test src/styles.performance.test.ts`。

## 任务 4：完整验证

1. 运行 `bun run test`。
2. 运行 `bun run typecheck`。
3. 运行 `bun format` 和 `bun run lint`。
4. 运行 `bun run test:coverage`，总覆盖率保持在 90% 以上。
5. 检查 `git diff` 与 `git status`，确认没有无关改动。

## 风险控制

- `pagination_str` 必须先 JSON 序列化，再交给 `URLSearchParams`；测试锁定首次空游标和后续游标。
- 任何 HTTP 200 下的非零 B 站业务码都走失败路径。
- 点赞响应应用前检查当前视频/评论会话，避免快速切换后污染状态。
- `.player-stage` 包含所有播放器叠层，避免评论栏遮挡弹幕、字幕和控制条。
- 评论卡片保持 TV 轻量焦点路径，不添加 stage 宽度动画、模糊阴影或 backdrop filter。
