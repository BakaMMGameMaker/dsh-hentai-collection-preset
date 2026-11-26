# plugins/ 的约定

一个工具一个目录，工具代码和它自己的提示词放一起；公用函数和公用话术放 `lib/`。

```
plugins/
  lib/                     公用函数与公用词典
    prompt.mjs             createPrompt(字典, 文件名) + format(模板, 值) + requiredText(必填字段)
    values.mjs             asRecord / optionalText / describe（参数兼容层）
    archive.mjs            收藏库的磁盘布局、读档案、写档案、workspaceOf
    archive.prompts.mjs    收藏库公用话术：读档案失败、必填字段、挑一件藏品的报错、空库/未命名
    items.mjs              按 id / 名字找一件藏品，以及「名字相同」的比较口径
    lookup.mjs             按 id / name 挑中一件，挑不中按字典报错（add_photo 与 read_collection 共用）
    photos.mjs             照片公用流程：路径候选、找文件、序号、避让命名、复制落盘（含 Windows 只读坑）
    photos.prompts.mjs     照片公用话术：部位/描述/路径的字段说明、报错里的字段名、落盘失败
  save-collection/
    index.mjs              save_collection：工具定义 + 行为
    prompts.mjs            它自己的词典（用 `...` 并上 lib/ 那两本公用词典）
  add-photo/
    index.mjs              add_photo：往已有藏品追加一张照片，其余字段不碰
    prompts.mjs            它自己的词典
  list-collection/
    index.mjs              list_collection：每件一行「名字 / id / 状态」
    prompts.mjs            它自己的词典
  read-collection/
    index.mjs              read_collection：按 name 或 id 读一件，字段名换回中文
    prompts.mjs            它自己的词典（含 result.line.*：每个字段一行）
  read-image/
    index.mjs              read_image：path 相对收藏库根目录解析，图片经
                           ctx.attachments 登记成附件引用，再以 image 内容块返回
    prompts.mjs            它自己的词典：什么时候看、路径怎么填
```

`agent.cordis.yml` 里一个工具一条 row，直接指到 `./plugins/<目录>/index.mjs`。

## 只改措辞

先看这句话归谁：

- **只跟一个工具有关**（工具总述、它独有的字段、它的成功摘要）：改
  `plugins/<工具>/prompts.mjs`。
- **几个工具说同一句话**：改 `lib/` 下的公用词典，改一次几个工具同时生效。

现在有两本公用词典：

- `lib/archive.prompts.mjs`：读档案失败的三种说法、必填字段、按 id / name 挑不中时的
  报错（列现有藏品、同名歧义）、空库与「未命名」。`save_collection`、`add_photo`、
  `list_collection`、`read_collection` 都并了它。
- `lib/photos.prompts.mjs`：照片字段（部位、描述、路径）在 JSON Schema 里的说明、
  报错里指代这些字段的名字、照片找不到 / 不是普通文件 / 复制失败 / 同名占满。
  `save_collection` 的 `photos[]` 与 `add_photo` 的 `part` / `description` / `path`
  用的是同一段文本——模型在两个工具里看到的话一样，所以调一次就够，不用两边对稿。

改完要重新加载 preset（prompt 在工具注册那一刻就进了请求）。代码文件里不内联中文，
所以不用碰它。

## 改功能

只改 `plugins/<工具>/index.mjs`，以及它用到的 `lib/` 里的公用流程：

- 读档案、写档案、磁盘布局在 `lib/archive.mjs`。它要用的三条文案由调用方的字典提供
  （`errors.readArchive`、`errors.archiveNotJson`、`errors.archiveShape`），现在这四个
  读档案的工具都从 `lib/archive.prompts.mjs` 取同一份。
- 按 id / 名字挑一件在 `lib/lookup.mjs`：`add_photo` 与 `read_collection` 共用，
  所以挑不中时的说法、同名多件的处理只有一份。
- 照片落盘在 `lib/photos.mjs`，由 `save_collection`、`add_photo` 共用（`read_image`
  复用其中的路径候选与「第一个存在的普通文件」）。改这里等于同时改两个存档工具：

  | 函数 | 干什么 |
  | --- | --- |
  | `photoCandidates()` | 一种写法展开成候选路径：绝对路径 →（工作区 / 收藏库根，顺序可选）→ `<收藏库根>/photos/…` |
  | `firstFile()` | 依次 stat，返回第一个普通文件（目录不算命中） |
  | `requirePhotoSource()` | 同上，但找不到时按字典报错并列出试过的位置 |
  | `nextOrder()` | 追加照片时的序号：接在现有最大序号（或数组长度）之后 |
  | `photoFilename()` / `freePhotoFilename()` | `NN-<部位>.<ext>`；同名时加 `-2`、`-3` |
  | `copyPhotoInto()` / `copyIntoTarget()` | 建目录、跳过「源就是目标」、按文件头定后缀、绕开 Windows 只读坑 |

## 名字不能重复

`read_collection` 按名字就能挑中一件，所以 `save_collection` 必须拦住重名——否则
同一件藏品有两个 id，按名字读就分不清了。比较口径在两处共用 `lib/items.mjs`：

- `nameKey()`：去掉所有空白 + 忽略大小写，所以「初音未来 睡莲」与「初音未来睡莲」
  算同一个名字；
- `save_collection` 新建/改名时撞上别的藏品，就报 `errors.duplicateNameWithId`，
  让模型带那件的 `overwriteId` 去改，或者换个名字；
- `read_collection` / `add_photo` 按名字命中多件（只有手改出来的档案才会）时报
  `errors.ambiguousName` 并列 id，让调用方改用 id。

`kindDetail` 这个字段已经删掉，旧档案里残留的那一项会在下次覆盖更新时清掉。

## 整份写 vs 追加一张

`save_collection` 的 `photos` 是整份档案的一部分：只想补一张图，也得把名字、状态、
价格、时间全部重抄一遍，抄漏一项就把旧档案改坏。所以补图走 `add_photo`：

- 按 id 或 name 挑一件（id 优先；name 忽略空格和大小写，与 `read_collection` 同一套
  口径，共用 `lib/items.mjs` + `lib/lookup.mjs`）；
- 图片按「绝对路径 → `<工作区>/<path>` → `<收藏库根>/<path>` → `<收藏库根>/photos/<path>`」
  找第一个存在的普通文件（`lib/photos.mjs` 的 `requirePhotoSource`），复制进 `photos/<id>/`；
- 新条目追加到那件的 `photos` 数组末尾，`order` 接在现有最大序号之后，文件名照旧
  `NN-<部位>.<ext>`（排号、后缀嗅探、只读副本都在 `lib/photos.mjs`）；
- 其余字段一个字都不动，只更新 `updatedAt`——这是它和 `save_collection` 的分界线。

两个工具的差别只有「整份写」和「追加一条」，找图、定文件名、复制落盘走的是同一批
函数，所以同一件藏品里不会出现两种排号方式。

## 加一个工具

1. 建 `plugins/<新工具>/index.mjs`：`export const name` / `export const inject = ['tools']` /
   `export function apply(ctx, config)`，在 `apply` 里 `ctx.tools.register({...})`
   （`output` 必须给 `{ schema, render }`，`render` 返回 `ContentBlock[]`）。
2. 建它的 `prompts.mjs`：`export const prompts = { ...archivePrompts, ...photoPrompts, ... }`，
   把自己的话写在后面（会覆盖同名公用键，覆盖要在文件头写明）。用
   `createPrompt(prompts, '<目录>/prompts.mjs')` 取值。
3. 在 `agent.cordis.yml` 里加一条 row，指到 `./plugins/<新工具>/index.mjs`。
   `libraryDir` 要和别的收藏库工具一致。
4. 关掉某个工具：给它的 row 加 `disabled: true`，不用删文件。

## read_image 的路径与格式

`path` 依次按「绝对路径 → `<收藏库根>/<path>` → `<工作区>/<path>` → `<收藏库根>/photos/<path>`
找第一个存在的普通文件（候选顺序来自 `lib/photos.mjs` 的 `photoCandidates(..., { prefer: 'library' })`）。
所以下面三种写法都指到同一张图：

- `photos/20261124-221606/02-正面上半身.png`（档案里 `photos[].file` 的值，原样传）
- `20261124-221606/02-正面上半身.png`（省掉 `photos/`）
- `collection/photos/20261124-221606/02-正面上半身.png`（工作区相对路径）

消息里上传图片的绝对只读路径也认（会话里那些附件是没有扩展名的规范化副本）。找不到时，
报错会列出收藏库里现有的照片（最多 20 张，猜中的那件排最前），模型照着改就能重试。

图片格式只看文件头，不看后缀：只收 PNG/JPEG/WebP/GIF（附件服务的接受集合），别的格式在
`errors.unsupportedFormat` 里让用户先转格式。图片本体不写进工具返回值，只登记成附件引用
（`ctx.attachments.saveImage`），字节和路由缩放由附件管线负责。

## 不挂宿主的文件工具

原来靠 `@deepseek-ai/dsh-tool-fs` 的 `read_image`，再用一条 `tool-filter` 在 agent 建好之后
`ctx.tools.restrict({ deny: ['read', 'write', 'edit'] })` 遮掉另外三个工具。现在 `read_image`
是本 preset 自己的（`read-image/`），两条 row 和 `tool-filter/` 都删了：路径不用再按会话
工作区拼，形状也不再依赖「先建 agent、再遮工具」那条时序。
