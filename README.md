# GeoPhotoGraph Local

在 Mac 本地运行的照片「地理 + 日期」海报工具。读取照片 EXIF 中的 GPS 与拍摄时间，反查地名、拼接地图，生成带地点/日期的海报图片，支持大批量并行处理。

功能参考微信小程序 [earthonliner/GeoPhotoGraph](https://github.com/earthonliner/GeoPhotoGraph)，去除了会员、付费与水印，仅供本地个人使用。

## 快速开始

需要 Node.js >= 18.17（macOS 推荐 20+）。

```bash
npm install     # 仅开发/e2e 测试需要 puppeteer-core，运行本身零依赖
npm start       # 启动本地服务并打开浏览器 http://127.0.0.1:5178
```

也可 `npx geophotograph --port 8080 --no-open`。推荐使用 Chrome / Edge（可直接导出到磁盘文件夹）；Safari 亦可使用（导出为 ZIP）。

## 功能

- 导入：拖入照片或文件夹（JPEG / HEIC / PNG / WebP / TIFF 等），自动读取 EXIF 的 GPS、拍摄时间、方向。
- 15 个模板，分类：热门、简约、经典、杂志、复古
  拍立得、上下分割、地图徽章、极简白卡、底栏、细框、侧栏、影幕、坐标、杂志封面、玻璃卡片、巨字、胶片、明信片、画廊展签。
- 统一模板 / 随机模板（可重新洗牌、对所选应用）。
- 地点与日期可逐张或批量编辑；语言（中文 / 英文 / 拼音）、地名层级（城市 / 详细）。
- 手动定位：搜索地名或输入坐标（可选 GCJ-02 转换），可批量应用。
- 地图缩放、裁剪位置/缩放（拖拽、滚轮、触控板手势）、主题色与自定义色、照片/地图不透明度、底部品牌栏与 Logo。
- 大批量：Web Worker 池并行渲染、缩略图懒加载、EXIF 只读文件头部、地名按网格合并请求并缓存；导出带进度、ETA、取消、失败重试。
- 导出：命名模式（`{name}_geo`，变量 `{name} {place} {date} {template} {index}`，自动去重不覆盖）；清晰度 2x / 3x / 4x；
  输出到本地文件夹（默认 `~/Pictures/GeoPhotoGraph`）、浏览器直接写入所选目录，或 ZIP（约 400 MB / 500 张自动分卷）。
- HEIC：浏览器无法解码时，由本地服务调用 macOS 自带 `sips` 转换（仅 macOS）。

## 地图与地名服务

在「设置」中选择：

| 地图 | 说明 |
| --- | --- |
| Esri（默认） | 无需密钥的灰色底图，缩放上限 16，请遵守 Esri 使用条款 |
| OpenStreetMap | 无需密钥，客户端转灰度；请遵守 OSM 瓦片使用政策，不要短时间内大批量抓取 |
| Mapbox | 需 token，支持亮/暗样式，质量最好 |
| 自定义 | 自填 `{z}/{x}/{y}`（可含 `{s}`）瓦片地址 |

瓦片经本地服务代理并缓存到 `~/.geophotograph/cache/`，重复导出不会重复请求。

地名反查默认使用 Nominatim（限速 1 次/秒，同一网格合并请求并缓存）。已知限制：对中国大陆、日本等地区，Nominatim 返回的「城市」常为区县级；如需更准确的城市名，请在设置中填 Mapbox token，或在预览中手动编辑地点。

配置保存在 `~/.geophotograph/config.json`（权限 0600，Mapbox token 不会返回给前端）。可用环境变量 `GEOPHOTOGRAPH_HOME` 修改目录。

## 安全

服务只监听 `127.0.0.1`，校验 Host / Origin（防 DNS rebinding 与跨站请求），静态资源路径与保存文件名均做校验，不会覆盖已有文件，「在 Finder 中显示」仅限输出目录。照片始终在本机处理，仅地图瓦片与地名查询会访问外部服务。

## 开发与测试

```bash
npm test               # 单元 / 服务端测试（node:test）
npm run test:e2e       # 无头 Chrome 端到端测试（需要 Chrome，可用 CHROME_PATH 指定）
python3 scripts/make-sample-photos.py 300   # 生成带 GPS/日期的示例照片到 sample-photos/
```

目录结构：`server/`（配置、瓦片代理、地名、保存/转换）、`public/js/lib/`（EXIF、地理、绘制、ZIP 等共享模块，主线程与 Worker 共用）、`public/js/workers/`（渲染 Worker）。

## 致谢

模板设计与功能来自原项目 GeoPhotoGraph（该仓库未声明许可证，本项目仅作个人本地使用）。地图数据 © Esri / OpenStreetMap contributors / Mapbox。
