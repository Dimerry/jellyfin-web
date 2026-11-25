# Jellyfin-videotools Web（前端）

> **这是 [jellyfin/jellyfin-web](https://github.com/jellyfin/jellyfin-web) 的个人 fork，不是官方版本。**

> **不适用于官方服务端，无需单独安装**，配套服务端及详细说明：[Dimerry/jellyfin-videotools](https://github.com/Dimerry/jellyfin-videotools)。

> 🤖 **本仓库全部代码由 AI 编写。**

---

## 一、功能改动（按模块）

### 1. 右键菜单 — `src/components/itemContextMenu.js`

- 视频条目新增两项（仅管理员可见）：**「转码」「剪辑视频」**。
- 多选菜单新增：**「转码所选 N 个视频」**（只在所选条目全是 Movie / Episode / Video / MusicVideo 时出现）。

### 2. 转码 / 剪辑对话框 — `src/components/videotools/videotools.js`

**转码**

- 码控可选：默认「质量模式」按固定画质编码（最高/高/中/低/最低五档，码率随画面复杂度浮动），可选「码率模式」按固定码率编码；编码器可手动指定优先（自动 / 软件 / Intel QSV / NVIDIA NVENC / VA-API / AMD AMF），指定后仍走服务端回退链，坏的 GPU 不会让任务无输出。
- 默认 H.265 / 1080p，可选 AV1、4K。分辨率是「限制分辨率」：超过所选分辨率的视频会缩小，较小的视频不会放大（只缩不放）。
- 低帧率源（<23fps）额外显示「AI 插帧至 30 帧」勾选，运动补偿插帧观感更流畅但速度慢。
- 单条走 `/VideoTools/{id}/Transcode`，多选走批量接口，提交后 toast 提示「已加入 N 个任务 / 跳过 M 个」。
- 修复：从多选菜单对**单个**视频发起转码时之前会失败，现在正常入队。
**剪辑**

- 起止时间支持 0 和小数秒；掐头 / 去尾拆成「分 + 秒」两个输入框，视频时长按「x小时x分x秒」显示。
- **左右百分比裁切**（可选）：两侧填百分比从源宽度裁掉画面，实时裁切预览（蓝色框为保留区）+ 裁切后宽高提示；两侧都为 0 时预览隐藏。裁切需重编码，编码器/码控跟随对话框选择；纯剪断依然流复制无损秒完成。
- **前后两帧实时预览**：调整时间或旋转角度后 400ms 防抖请求 `GET /VideoTools/{id}/Frame`，两个 16:9 预览框并排显示（「保留的第一帧 / 保留的最后一帧」），带过期请求丢弃，避免乱序覆盖；只显示一个预览时两个框保持同样大小。
- **视频旋转**：旋转下拉（逆时针 0° / 90° / 180° / 270°），选了预览会立刻按旋转后的方向重新抽帧，所见即所得。
  后端用 `-display_rotation` + `-c copy` 实现，不重编码、无损、秒完成。
- 手机端适配：弹窗内容可滚动（修溢出）、左右裁切输入并排一行。

### 3. 视频工具页（转码队列） — `src/apps/dashboard/routes/videotools/index.tsx`

控制台侧边栏新增「视频工具」，路由 `/dashboard/videotools`：

- 每 2 秒轮询 `/VideoTools/Jobs`，显示运行中 / 排队中任务的进度和队列位置，以及最近完成 / 失败的任务；状态下方显示实际用到的编码器，回退到软件编码时有明确文案。
- 行内操作：「取消」（排队中或运行中）、「重试」（仅失败）、「播放」（打开已完成任务的输出文件，关闭对话框即停止播放）。
- 「当前队列」标题下方显示「文件转码一次只运行一个任务」提示和「清空已完成」按钮。
- **默认设置**：「视频工具」标题下两组「配置」按钮，分别打开转码 / 剪辑默认设置对话框（编码、编码器、限制分辨率、码控、质量档位 / 码率），存到服务端；从媒体库直接入队（不弹对话框）时生效。界面全部中文化。

### 4. 图片旋转 — `src/components/itemContextMenu.js`、`src/components/multiSelect/multiSelect.js`

- 单张：图片右键菜单里 **「逆旋 90°」**，点一下原地旋转并刷新缩略图。
- 批量：多选若干图片后，右上角菜单 **「逆旋 90°」**，一次旋转所有选中图片，完成后 toast 汇报「已旋转 N 张 / M 张失败」。
- 走后端 `POST /ImageTools/{id}/Rotate` 与 `POST /ImageTools/Rotate`（批量），用 ffmpeg 原地重写文件，不改变像素质量策略（JPEG 质量 2、PNG 无损）。

### 5. 列表排序 — `src/apps/modern/features/libraries/components/SortButton.tsx`、`src/apps/legacy/controllers/list.js`

排序菜单新增 **「比特率」「文件大小」**（服务端加了 `Size` 排序字段）。

### 6. 详情页显示比特率 — `src/apps/legacy/controllers/itemDetails/index.js`

音视频轨道下拉从「分辨率 + 编码」变成 `1080P H264 · 3.0 Mbps` / `AAC · 192 kbps`。

### 7. 搜索支持文件夹 — `src/apps/legacy/features/search/`

- 各类型搜索结果都加上 `Folder` 类型。
- 文件夹结果固定排在**第一行**，无图时用内置文件夹图标占位。
- 搜索结果行在重新渲染 / 重新挂载后**保持滚动位置**；多选模式下仍可横向拖动平移，不会被误判成涂抹选择。

### 8. 多选增强 — `src/components/multiSelect/multiSelect.js`

网页版所有列表共用：

- **键盘Shift 连选**：多选模式下 `Shift + 点击`，从上次点过的卡片到当前卡片之间的所有可见卡片一次性选中。
- **拖动涂抹选择**（鼠标 + 触摸）：多选模式下按住并在卡片上拖过，沿途卡片全部选上（起始卡已选中则反向：全部取消）。
  - 触摸时竖直拖动仍然是滚动列表，只有横向拖动才涂抹（多选期间 `touch-action: pan-y pinch-zoom`）。
  - 涂抹结束会吞掉浏览器补发的 click，避免刚选上又被反选。
- **离开当前界面（返回上一页）会自动取消多选**：多选状态绑定在发起多选的列表容器上，容器卸载即清空，不会出现"回到上一页后点文件夹只是被勾上、进不去"的怪状态。
- 顺带修了选中面板已脱离 DOM 时 `hideSelections()` 抛异常、以及「长按增加计数但不显示勾选标记」的状态不同步问题。

### 9.出站代理 - 

- KnownProxies「代理服务器地址」更名「可信代理服务器（入站）」
- 出站代理进 UI。设置 → 网络 → 新区块「出站代理（刮削 / 图片 / 插件）」：
  - 出站代理：如 http://192.168.1.1:1070，留空直连
  - 不走代理的地址：主机名 / IP / CIDR 子网（192.168.1.0/24）/ 通配符域名（*.example.com），逗号分隔

### 10.国际化 — `src/strings/en-us.json`、`zh-cn.json`

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

> 这些按钮只是界面，接口在配套服务端 [Dimerry/jellyfin-videotools](https://github.com/Dimerry/jellyfin-videotools) 的 `videotools-12.4` 分支上；只跑官方服务端会得到 404。

---

## 三、免责声明

- 个人自用 fork，**没有针对这些新功能做端到端测试**，代码质量按"能跑就行"标准。
- 支持官方客户端。
- 转码/剪辑会改动你媒体库里的文件，请先小范围试。
- 与 Jellyfin 官方无关，问题不要提到上游。

## 四、许可

沿用上游 [GPLv2](LICENSE)。
