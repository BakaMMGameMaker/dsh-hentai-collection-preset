/**
 * add_photo 的提示词词典
 *
 * 这里是唯一存放「add_photo 会发给模型的文本」的地方。同目录的 index.mjs
 * 只按 `prompt('键')` 取字符串，不内联任何中文，所以调措辞只改这一个文件。
 * 另外几个工具的字典在 ../save-collection/、../list-collection/、
 * ../read-collection/、../read-image/。
 *
 * 键名就是发送位置：
 *   add_photo.description        工具总述（请求体 tools 数组里的 function.description）
 *   add_photo.parameters.<字段>  该字段在 JSON Schema 里的 description
 *   result.*                     工具成功时返回的摘要（会进对话历史）
 *   labels.*                     报错里指代字段用的名字
 *   errors.*                     抛错文本（模型看到的是 "Error: …"）
 *   words.* / punct.*            夹在句子里的零碎词
 *
 * 其中三条 errors.* 是公用代码 ../lib/archive.mjs 读档案失败时取的
 * （readArchive 会带着这本字典来查）：readArchive、archiveNotJson、archiveShape。
 * 报错里列现有藏品用的 knownLine / knownEmpty 与 read_collection 那本同一个口径。
 *
 * 记法：`{名字}` 是运行时填进去的占位符，别删；其余文字原样发送。
 *
 * 改完要重新加载 preset 才生效：工具描述在注册那一刻就已经进了请求。
 */
export const prompts = {
  // ── 工具总述 ──────────────────────────────────────────────────────────────

  // add_photo.description ｜ 模型靠它判断「补图用它、不用整份 save_collection」
  'add_photo.description': `往一件已经存档的藏品里追加一张照片。id 与 name 二选一，两个都给时以 id 为准；name 忽略空格和大小写。图片复制进收藏库、只往照片清单末尾加一条，其余字段一个字都不动——补图时不必重新 save_collection 整份档案。一次只加一张，多张就多调几次。`,

  // ── 参数 ──────────────────────────────────────────────────────────────────

  // add_photo.parameters.id ｜ 用 id 挑藏品
  'add_photo.parameters.id': `要加照片的藏品 id，例如 20261124-221606；不知道 id 就先调 list_collection。与 name 二选一。`,

  // add_photo.parameters.name ｜ 用名字挑藏品
  'add_photo.parameters.name': `要加照片的藏品名称，例如「初音未来 睡莲」；忽略空格和大小写。与 id 二选一。`,

  // add_photo.parameters.part ｜ 这张拍的是哪个部位
  'add_photo.parameters.part': `这张照片拍的是哪个部位。同一部位可以传多次，收藏库会排号。`,

  // add_photo.parameters.description ｜ 用户的一句话描述
  'add_photo.parameters.description': `用户或你的发情感想，不是图片内容。`,

  // add_photo.parameters.filePath ｜ 图片从哪来：抄消息里那条只读路径，别自己拼
  'add_photo.parameters.filePath': `要加的图片路径：消息里上传的图片会带一段 "Normalized copy (read-only; …): " 的只读路径，抄那串就行；工作区相对路径、绝对路径、档案里已有的 photos/<id>/… 也都认。`,

  // ── 成功返回的摘要（会进对话历史）─────────────────────────────────────────

  // result.head ｜ 第一行：给哪件加了第几张、什么部位
  'result.head': `已给「{name}」加上第 {order} 张照片：{part}`,

  // result.file ｜ 这张存成了哪个文件（可原样喂 read_image）
  'result.file': `照片：{file}`,

  // result.total ｜ 这件藏品现在的照片总数与目录
  'result.total': `这件藏品现在共 {count} 张照片 → {directory}`,

  // ── 报错里的字段名 ────────────────────────────────────────────────────────

  // labels.part ｜ 报错里指代 part
  'labels.part': `part（部位）`,

  // labels.description ｜ 报错里指代 description
  'labels.description': `description（图片描述）`,

  // labels.filePath ｜ 报错里指代 filePath
  'labels.filePath': `filePath（图片路径）`,

  // ── 报错正文 ──────────────────────────────────────────────────────────────

  // words.nameless ｜ 档案里 name 缺失时顶上的名字
  'words.nameless': `（未命名）`,

  // punct.idSeparator ｜ 报错里列多个 id 时的分隔符
  'punct.idSeparator': `、`,

  // errors.noKey ｜ id 和 name 都没给
  'errors.noKey': `id 和 name 至少给一个：id 从 list_collection 拿；name 就是藏品名字（忽略空格和大小写）。`,

  // errors.requiredField ｜ 必填字段缺失（{label} 由 labels.* 提供）
  'errors.requiredField': `缺少必填字段 {label}`,

  // errors.unknownId ｜ id 对不上任何藏品（{known} 是现有藏品清单）
  'errors.unknownId': `没有 id 为 {wanted} 的藏品。收藏库里现有的：\n{known}`,

  // errors.unknownName ｜ 名字对不上任何藏品（{known} 是现有藏品清单）
  'errors.unknownName': `没有名字是「{wanted}」的藏品。收藏库里现有的：\n{known}`,

  // errors.ambiguousName ｜ 档案里有同名藏品：让调用方改用 id
  'errors.ambiguousName': `有 {count} 件藏品都叫「{wanted}」，分不清是哪一件：{ids}。改用 id 加照片。`,

  // errors.knownLine ｜ errors.unknownId / unknownName 里的一行：名字 · id
  'errors.knownLine': `  {name} · {id}`,

  // errors.knownEmpty ｜ 收藏库里一件藏品都没有
  'errors.knownEmpty': `（收藏库还是空的）`,

  // errors.itemWithoutId ｜ 挑中的那件连 id 都没有（手改坏的档案），照片没地方放
  'errors.itemWithoutId': `藏品「{name}」在档案里没有 id，没法给它建照片目录。先用 save_collection 重新存一遍这件藏品，再补图。`,

  // errors.photoMissing ｜ 路径找不到：列出试过的位置，模型照着改
  'errors.photoMissing': `找不到这张图片：{given}\n找过这些位置：\n{tried}\n确认图片的真实路径，或让用户重新上传。`,

  // errors.photoNotFile ｜ 路径存在但不是普通文件
  'errors.photoNotFile': `图片路径不是普通文件：{given}`,

  // errors.copyFailed ｜ 复制进收藏库失败（磁盘权限之类）
  'errors.copyFailed': `图片复制进收藏库失败：{given}（{message}）`,

  // errors.tooManyFiles ｜ 同一序号下文件名占满了（正常情况不会出现）
  'errors.tooManyFiles': `照片目录里同名的文件太多，加不进去：{directory}`,

  // errors.readArchive ｜ 读总档案失败（非「文件不存在」）—— 公用的 lib/archive.mjs 会来取这条
  'errors.readArchive': `读取收藏库失败：{path}（{message}）`,

  // errors.archiveNotJson ｜ 总档案不是合法 JSON，拒绝写入以免覆盖旧档 —— 公用的 lib/archive.mjs 会来取这条
  'errors.archiveNotJson': `收藏库文件不是合法 JSON，已停止写入以免覆盖旧档案：{path}。备份并修复或移走该文件再重试。`,

  // errors.archiveShape ｜ 总档案结构异常 —— 公用的 lib/archive.mjs 会来取这条
  'errors.archiveShape': `收藏库文件结构异常（缺少 items 数组），已停止写入：{path}`,
}
