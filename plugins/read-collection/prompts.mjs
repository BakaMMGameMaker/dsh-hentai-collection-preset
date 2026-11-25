/**
 * read_collection 的提示词词典
 *
 * 这里是唯一存放「read_collection 会发给模型的文本」的地方。同目录的 index.mjs
 * 只按 `prompt('键')` 取字符串，不内联任何中文，所以调措辞只改这一个文件。
 * 另外四个工具的字典在 ../save-collection/、../add-photo/、../list-collection/、../read-image/。
 *
 * 键名就是发送位置：
 *   read_collection.description        工具总述（请求体 tools 数组里的 function.description）
 *   read_collection.parameters.<字段>  该字段在 JSON Schema 里的 description
 *   result.line.*                     档案里一项字段回显成的那一行（字段名 = 人设里的说法）
 *   result.photo / photosEnvelope     照片清单：每张一个方括号条目，外面再套一层方括号
 *   errors.*                          抛错文本（模型看到的是 "Error: …"）
 *   words.* / punct.*                 夹在句子里的零碎词
 *
 * 其中三条 errors.* 是公用代码 ../lib/archive.mjs 读档案失败时取的
 * （readArchive 会带着这本字典来查）：readArchive、archiveNotJson、archiveShape。
 *
 * 记法：`{名字}` 是运行时填进去的占位符，别删；其余文字原样发送。
 *
 * 改完要重新加载 preset 才生效：工具描述在注册那一刻就已经进了请求。
 */
export const prompts = {
  // ── 工具总述 ──────────────────────────────────────────────────────────────

  // read_collection.description ｜ 模型靠它判断「读档案该用它、name/id 怎么填、拿到的是什么」
  'read_collection.description': `读一件藏品的完整档案。id 与 name 二选一，两个都给时以 id 为准；name 忽略空格和大小写。`,

  // ── 参数 ──────────────────────────────────────────────────────────────────

  // read_collection.parameters.id ｜ 用 id 读
  'read_collection.parameters.id': `藏品 id，例如 20261124-221606；不知道 id 就先调 list_collection。与 name 二选一。`,

  // read_collection.parameters.name ｜ 用名字读
  'read_collection.parameters.name': `藏品名称，例如「初音未来 睡莲」；忽略空格和大小写。与 id 二选一。`,

  // ── 档案字段回显（每行一个字段）───────────────────────────────────────────

  // result.line.name ｜ 名称
  'result.line.name': `名称：{value}`,

  // result.line.kind ｜ 类型
  'result.line.kind': `类型：{value}`,

  // result.line.status ｜ 状态
  'result.line.status': `状态：{value}`,

  // result.line.motivation ｜ 购买原因
  'result.line.motivation': `购买原因：{value}`,

  // result.line.total ｜ 总价
  'result.line.total': `总价：{value}`,

  // result.line.deposit ｜ 定金
  'result.line.deposit': `定金：{value}`,

  // result.line.balance ｜ 尾款
  'result.line.balance': `尾款：{value}`,

  // result.line.orderedAt ｜ 下单时间
  'result.line.orderedAt': `下单时间：{value}`,

  // result.line.balanceDueAt ｜ 补款时间
  'result.line.balanceDueAt': `补款时间/预计补款时间：{value}`,

  // result.line.arrivesAt ｜ 到货时间：只有到手的状态才出这一行
  'result.line.arrivesAt': `到货时间：{value}`,

  // result.line.photos ｜ 照片清单（整行的前缀）
  'result.line.photos': `照片（可用 read_image 工具查看照片）：{value}`,

  // result.line.notes ｜ 模型自己的笔记
  'result.line.notes': `你（色气美少女）的笔记：{value}`,

  // result.photo ｜ 单张照片：部位、路径（可直接喂 read_image）、用户当时的描述
  'result.photo': `[部位：{part}，路径：{file}，用户感想：{description}]`,

  // result.photosEnvelope ｜ 照片清单的外层：{items} 是逗号隔开的方括号条目
  'result.photosEnvelope': `[{items}]`,

  // result.photosNone ｜ 这件藏品还没有照片
  'result.photosNone': `[]`,

  // punct.photoSeparator ｜ 两张照片之间的分隔符
  'punct.photoSeparator': `，`,

  // punct.idSeparator ｜ 报错里列多个 id 时的分隔符
  'punct.idSeparator': `、`,

  // ── 报错正文 ──────────────────────────────────────────────────────────────

  // words.nameless ｜ 档案里 name 缺失时顶上的名字
  'words.nameless': `（未命名）`,

  // errors.noKey ｜ id 和 name 都没给
  'errors.noKey': `id 和 name 至少给一个：id 从 list_collection 拿；name 就是藏品名字（忽略空格和大小写）。`,

  // errors.unknownId ｜ id 对不上任何藏品（{known} 是现有藏品清单）
  'errors.unknownId': `没有 id 为 {wanted} 的藏品。收藏库里现有的：\n{known}`,

  // errors.unknownName ｜ 名字对不上任何藏品（{known} 是现有藏品清单）
  'errors.unknownName': `没有名字是「{wanted}」的藏品。收藏库里现有的：\n{known}`,

  // errors.ambiguousName ｜ 档案里有同名藏品：让调用方改用 id
  'errors.ambiguousName': `有 {count} 件藏品都叫「{wanted}」，分不清是哪一件：{ids}。改用 id 读。`,

  // errors.knownLine ｜ errors.unknownId / unknownName 里的一行：名字 · id
  'errors.knownLine': `  {name} · {id}`,

  // errors.knownEmpty ｜ 收藏库里一件藏品都没有
  'errors.knownEmpty': `（收藏库还是空的）`,

  // errors.readArchive ｜ 读总档案失败（非「文件不存在」）—— 公用的 lib/archive.mjs 会来取这条
  'errors.readArchive': `读取收藏库失败：{path}（{message}）`,

  // errors.archiveNotJson ｜ 总档案不是合法 JSON —— 公用的 lib/archive.mjs 会来取这条
  'errors.archiveNotJson': `收藏库文件不是合法 JSON，没法读取藏品：{path}。先修好或移走该文件再重试。`,

  // errors.archiveShape ｜ 总档案结构异常 —— 公用的 lib/archive.mjs 会来取这条
  'errors.archiveShape': `收藏库文件结构异常（缺少 items 数组），没法读取藏品：{path}`,
}

/**
 * 哪些状态没有「到货时间」这一行：还没到手的两档。
 * 判定口径要和 save_collection 的状态候选一致（见 ../save-collection/prompts.mjs
 * 的 `save_collection.parameters.status`）：只有到手了才有到货日期可写。
 */
export const noArrivalStatuses = ['待补款', '购物车']
