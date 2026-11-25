# plugins/ 的约定

一个工具一个目录，工具代码和它自己的提示词字典放一起；公用函数放 `lib/`。

```
plugins/
  lib/                     公用函数。不含任何会发给模型的文本，也不该出现中文
    prompt.mjs             createPrompt(字典, 文件名) + format(模板, 值)
    values.mjs             asRecord / optionalText / describe（参数兼容层）
    archive.mjs            收藏库的磁盘布局、读档案、写档案、workspaceOf
  save-collection/
    index.mjs              save_collection：工具定义 + 行为
    prompts.mjs            它自己的词典：会发给模型的每一句话
  list-collection/
    index.mjs              list_collection：只返回 list<name, id>
    prompts.mjs            它自己的词典
  read-image/
    index.mjs              read_image：path 相对收藏库根目录解析，图片经
                           ctx.attachments 登记成附件引用，再以 image 内容块返回
    prompts.mjs            它自己的词典：什么时候看、路径怎么填
```

`agent.cordis.yml` 里一个工具一条 row，直接指到 `./plugins/<目录>/index.mjs`。

## 只改措辞

改 `plugins/<工具>/prompts.mjs`，然后重新加载 preset（prompt 在工具注册那一刻就进了请求）。
代码文件里不内联中文，所以不用碰它。

## 改功能

只改 `plugins/<工具>/index.mjs`。读档案失败这类公用逻辑在 `lib/archive.mjs`，
它要用的三条文案由调用方的字典提供（`errors.readArchive`、`errors.archiveNotJson`、
`errors.archiveShape`），两个读档案的工具措辞各自独立。

## 加一个工具

1. 建 `plugins/<新工具>/index.mjs`：`export const name` / `export const inject = ['tools']` /
   `export function apply(ctx, config)`，在 `apply` 里 `ctx.tools.register({...})`
   （`output` 必须给 `{ schema, render }`，`render` 返回 `ContentBlock[]`）。
2. 建它的 `prompts.mjs`，用 `createPrompt(prompts, '<目录>/prompts.mjs')` 取值。
3. 在 `agent.cordis.yml` 里加一条 row，指到 `./plugins/<新工具>/index.mjs`。
   `libraryDir` 要和别的收藏库工具一致。
4. 关掉某个工具：给它的 row 加 `disabled: true`，不用删文件。

## read_image 的路径与格式

`path` 依次按「绝对路径 → `<收藏库根>/<path>` → `<工作区>/<path>` → `<收藏库根>/photos/<path>`」
找第一个存在的普通文件。所以下面三种写法都指到同一张图：

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
