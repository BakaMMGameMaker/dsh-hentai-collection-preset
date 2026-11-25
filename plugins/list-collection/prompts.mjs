/**
 * list_collection 的提示词词典
 *
 * 这里是唯一存放「list_collection 会发给模型的文本」的地方。同目录的 index.mjs
 * 只按 `prompt('键')` 取字符串，不内联任何中文，所以调措辞只改这一个文件。
 * 另一个工具 save_collection 的字典在 ../save-collection/prompts.mjs。
 *
 * 键名就是发送位置：
 *   list_collection.description  工具总述（请求体 tools 数组里的 function.description）
 *   result.*                     工具成功时返回的文本（会进对话历史，每件藏品一行）
 *   words.*                      夹在句子里的零碎词
 *   errors.*                     抛错文本（模型看到的是 "Error: …"）
 *
 * 其中三条 errors.* 是公用代码 ../lib/archive.mjs 读档案失败时取的
 * （readArchive 会带着这本字典来查）：readArchive、archiveNotJson、archiveShape。
 *
 * 记法：`{名字}` 是运行时填进去的占位符，别删；其余文字原样发送。
 * 这个工具的参数表是空的，所以没有 parameters.* 键；它也不发照片摘要。
 *
 * 改完要重新加载 preset 才生效：工具描述在注册那一刻就已经进了请求。
 */
export const prompts = {
  // ── 工具总述 ──────────────────────────────────────────────────────────────

  // list_collection.description ｜ 模型靠它判断「什么时候该列一览、拿到 id 干什么」
  'list_collection.description': `列出收藏库里每件藏品的名字和 id（每行「名字 · id」，按入库顺序）。调它可拿藏品 id；想看完整档案就读 collection.json`,

  // ── 成功返回的文本（会进对话历史）─────────────────────────────────────────

  // result.empty ｜ 收藏库还没有任何藏品
  'result.empty': `（收藏库还是空的）`,

  // result.line ｜ 一件藏品一行：{name} 名字，{id} 覆盖更新时要传的 id
  'result.line': `{name} · {id}`,

  // ── 报错正文 ──────────────────────────────────────────────────────────────

  // words.nameless ｜ 档案里 name 缺失时顶上的名字
  'words.nameless': `（未命名）`,

  // errors.readArchive ｜ 读总档案失败（非「文件不存在」）—— 公用的 lib/archive.mjs 会来取这条
  'errors.readArchive': `读取收藏库失败：{path}（{message}）`,

  // errors.archiveNotJson ｜ 总档案不是合法 JSON —— 公用的 lib/archive.mjs 会来取这条
  'errors.archiveNotJson': `收藏库文件不是合法 JSON，没法列出藏品：{path}。先修好或移走该文件再重试。`,

  // errors.archiveShape ｜ 总档案结构异常 —— 公用的 lib/archive.mjs 会来取这条
  'errors.archiveShape': `收藏库文件结构异常（缺少 items 数组），没法列出藏品：{path}`,
}
