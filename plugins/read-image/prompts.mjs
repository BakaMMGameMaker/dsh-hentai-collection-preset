/**
 * read_image 的提示词词典
 *
 * 这里是唯一存放「read_image 会发给模型的文本」的地方。同目录的 index.mjs
 * 只按 `prompt('键')` 取字符串，不内联任何中文，所以调措辞只改这一个文件。
 * 另外两个工具的字典在 ../save-collection/prompts.mjs 和 ../list-collection/prompts.mjs。
 *
 * 键名就是发送位置：
 *   read_image.description        工具总述（请求体 tools 数组里的 function.description）
 *   read_image.parameters.path    该字段在 JSON Schema 里的 description
 *   result.*                      工具成功时返回的那段说明（紧挨着图片本体）
 *   errors.*                      抛错文本（模型看到的是 "Error: …"）
 *
 * 记法：`{名字}` 是运行时填进去的占位符，别删；其余文字原样发送。
 * 工具参数表只有一个 path，所以只有一条 parameters 键。
 *
 * 改完要重新加载 preset 才生效：工具描述在注册那一刻就已经进了请求。
 */
export const prompts = {
  // ── 工具总述 ──────────────────────────────────────────────────────────────

  // read_image.description ｜ 模型靠它判断「什么时候该看、path 怎么填、一次看几张」
  'read_image.description': `看收藏室里的照片本体。path 填 read_collection 提供的照片路径，一次只看一张。只支持 PNG/JPEG/WebP/GIF。`,

  // ── 参数 ──────────────────────────────────────────────────────────────────

  // read_image.parameters.path ｜ 路径的三种写法，外加「从哪抄」
  'read_image.parameters.path': `照片路径。`,

  // ── 成功返回的说明（紧挨着图片本体进对话）──────────────────────────────

  // result.envelope ｜ 一行：看的是哪张、什么格式多大
  'result.envelope': `看到了：{path}（{mediaType}，{width}x{height} px，{bytes} 字节{scaled}）`,

  // result.scaled ｜ 原图被附件服务缩小时追加的说明
  'result.scaled': `；原图 {width}x{height} px，已缩小`,

  // ── 报错正文 ──────────────────────────────────────────────────────────────

  // errors.emptyPath ｜ path 传了空串
  'errors.emptyPath': `path 不能为空：要填 read_collection 里的照片路径`,

  // errors.notFound ｜ 按几种写法都没找到：列出找过的位置和收藏库里现有的照片，模型照着改
  'errors.notFound': `找不到这张图片：{given}\n找过这些位置：\n{tried}\n收藏库：{library}\n{known}`,

  // errors.libraryPhotos ｜ errors.notFound 里列的现有照片（每行一条）
  'errors.libraryPhotos': `收藏库里现有的照片：\n{paths}`,

  // errors.libraryEmpty ｜ 收藏库里一张照片都没有
  'errors.libraryEmpty': `收藏库里现在一张照片都没有。`,

  // errors.tooLarge ｜ 图片超过附件服务的单文件字节上限
  'errors.tooLarge': `图片太大：{path}（{bytes} 字节，上限 {limit} 字节）`,

  // errors.unsupportedFormat ｜ 文件头不是附件服务认得的四种格式
  'errors.unsupportedFormat': `认不出图片格式：{path}。只支持 PNG/JPEG/WebP/GIF，别的格式先转成这几种再存档。`,

  // errors.typeNotAccepted ｜ 附件服务的部署配置不收这种格式
  'errors.typeNotAccepted': `当前部署不接受这种图片格式：{mediaType}`,

  // errors.noAttachments ｜ 进程里没有挂附件服务（正常部署不会出现）
  'errors.noAttachments': `这个部署没有挂载图片附件服务，读不了图`,

  // errors.saveFailed ｜ 读出了字节但附件服务拒绝/存不下
  'errors.saveFailed': `图片读取失败：{path}（{message}）`,
}
