# Jellyfin Web 魔改版（前端）

> **这是 [jellyfin/jellyfin-web](https://github.com/jellyfin/jellyfin-web) 的个人 fork，不是官方版本。**
> 所有改动都在 `videotools` 分支上，配套服务端：[Dimerry/jellyfin](https://github.com/Dimerry/jellyfin)（也不过是给上游加了 `/VideoTools` 接口）。

一句话概括：让 Jellyfin 网页版能**直接转码压缩 / 掐头去尾（带预览）**，带**任务队列页面**、**触屏拖动多选、web shift多选**、**按文件大小、比特率排序**。

> 🤖 **本仓库全部代码由 AI 编写。**
> 作者是一位看不懂代码的天才程序员——需求、交互、审美和验收是他，敲键盘的是 AI。

---

## 一、功能改动（按模块）

### 1. 右键菜单 — `src/components/itemContextMenu.js`

- 视频条目新增两项（仅管理员可见）：**「转码」「剪辑视频」**。
- 多选菜单新增：**「转码所选 N 个视频」**（只在所选条目全是 Movie / Episode / Video / MusicVideo 时出现）。

### 2. 转码 / 剪辑对话框 — `src/components/videotools/videotools.js`

**转码**

- 默认 H.265 / 1080p / 3000 kbps，可选 AV1、4K。
- 单条走 `/VideoTools/{id}/Transcode`，多选走批量接口，提交后 toast 提示「已加入 N 个任务 / 跳过 M 个」。

**剪辑**

- 起止时间支持 0 和小数秒。
- **前后两帧实时预览**：调整时间或旋转角度后 400ms 防抖请求 `GET /VideoTools/{id}/Frame`，两个 16:9 预览框并排显示（前/后各一帧），带过期请求丢弃，避免乱序覆盖。
- 旋转下拉（逆时针 0° / 90° / 180° / 270°），选了就直接在预览里看到效果。

### 3. 转码队列页 — `src/apps/dashboard/routes/videotools/index.tsx`

控制台侧边栏新增「转码队列」，路由 `/dashboard/videotools`：

- 每 2 秒轮询 `/VideoTools/Jobs`，显示运行中 / 排队中任务的进度和队列位置，以及最近完成 / 失败的任务。
- 行内操作：「取消」（排队中或运行中）、「重试」（仅失败，参数沿用原任务）、「播放」（打开已完成任务的输出文件，关闭对话框即停止播放）。
- 顶部「清空已完成」清掉已完成 / 失败 / 已取消记录。

### 4. 列表排序 — `src/apps/modern/features/libraries/components/SortButton.tsx`、`src/apps/legacy/controllers/list.js`

排序菜单新增 **「比特率」「文件大小」**（服务端加了 `Size` 排序字段）。

### 5. 详情页显示比特率 — `src/apps/legacy/controllers/itemDetails/index.js`

音视频轨道下拉从「分辨率 + 编码」变成 `1080P H264 · 3.0 Mbps` / `AAC · 192 kbps`。

### 6. 搜索支持文件夹 — `src/apps/legacy/features/search/`

- 各类型搜索结果都加上 `Folder` 类型。
- 文件夹结果固定排在**第一行**，无图时用内置文件夹图标占位。

### 7. 多选增强 — `src/components/multiSelect/multiSelect.js`

网页版所有列表共用：

- **Shift 连选**：多选模式下 `Shift + 点击`，从上次点过的卡片到当前卡片之间的所有可见卡片一次性选中。
- **拖动涂抹选择**（鼠标 + 触摸）：多选模式下按住并在卡片上拖过，沿途卡片全部选上（起始卡已选中则反向：全部取消）。
  - 触摸时竖直拖动仍然是滚动列表，只有横向拖动才涂抹（多选期间 `touch-action: pan-y pinch-zoom`）。
  - 涂抹结束会吞掉浏览器补发的 click，避免刚选上又被反选。
- 顺带修了选中面板已脱离 DOM 时 `hideSelections()` 抛异常、以及「长按增加计数但不显示勾选标记」的状态不同步问题。

### 8. 国际化 — `src/strings/en-us.json`、`zh-cn.json`

上面所有新增文案都有中英文两套。

---

## 二、构建与运行

```bash
npm ci
npm run serve              # 开发服务器（热更新）
npm run build:production   # 生产构建，产物在 dist/
npm test                   # vitest
```

产物交给服务端加载：

```bash
dotnet run --project Jellyfin.Server -c Release -- \
  --datadir /path/to/data \
  --webdir /path/to/jellyfin-web/dist
```

> 这些按钮只是界面，接口在配套服务端 [Dimerry/jellyfin](https://github.com/Dimerry/jellyfin) 的 `videotools` 分支上；只跑官方服务端会得到 404。

---

## 三、免责声明

- 个人自用 fork，**没有针对这些新功能做端到端测试**（只有多选模块有 6 个单元测试），代码质量按"能跑就行"标准。
- 转码/剪辑会改动你媒体库里的文件，请先小范围试。
- 与 Jellyfin 官方无关，问题不要提到上游。

## 四、许可

沿用上游 [GPLv2](LICENSE)。
