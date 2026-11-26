/**
 * 收藏库公用词典
 *
 * 四个工具都要读同一份 `collection.json`，失败时的说法、按 id / 名字挑一件藏品的话术
 * 也都是同一件事。这些句子只在这里写一份，各工具的 prompts.mjs 用
 * `...archivePrompts` 并进自己的字典，改一句就几个工具一起生效：
 *
 *   ../save-collection/prompts.mjs   另外用 save_collection.* 覆盖/补充自己的话
 *   ../add-photo/prompts.mjs
 *   ../list-collection/prompts.mjs
 *   ../read-collection/prompts.mjs
 *
 * 并进来但没用到的键不会发给模型：各工具只取自己真正说的那几句。
 *
 * 键名就是发送位置：
 *   errors.*  抛错文本（模型看到的是 "Error: …"）
 *   words.*   夹在句子里的零碎词
 *   punct.*   分隔符
 *   items.parameters.*  挑一件藏品时 id / name 两个字段的 description（两个工具共用）
 *
 * 记法：`{名字}` 是运行时填进去的占位符，别删；其余文字原样发送。
 * 改完要重新加载 preset 才生效。
 */
export const archivePrompts = {
  // ── 挑一件藏品的两个字段（add_photo、read_collection 的 JSON Schema 共用）──

  // items.parameters.id ｜ 用 id 挑
  'items.parameters.id': `藏品 id，例如 20261124-221606；不知道 id 就先调 list_collection。与 name 二选一。`,

  // items.parameters.name ｜ 用名字挑
  'items.parameters.name': `藏品名称，例如「初音未来 睡莲」；忽略空格和大小写。与 id 二选一。`,

  // ── 报错正文 ──────────────────────────────────────────────────────────────

  // errors.requiredField ｜ 必填字段缺失（{label} 由各工具的 labels.* / photos.labels.* 提供）
  'errors.requiredField': `缺少必填字段 {label}`,

  // errors.readArchive ｜ 读总档案失败（非「文件不存在」）—— 公用的 lib/archive.mjs 会来取这条
  'errors.readArchive': `读取收藏库失败：{path}（{message}）`,

  // errors.archiveNotJson ｜ 总档案不是合法 JSON —— 公用的 lib/archive.mjs 会来取这条
  'errors.archiveNotJson': `收藏库文件不是合法 JSON，无法继续：{path}。备份并修复或移走该文件再重试。`,

  // errors.archiveShape ｜ 总档案结构异常 —— 公用的 lib/archive.mjs 会来取这条
  'errors.archiveShape': `收藏库文件结构异常（缺少 items 数组），无法继续：{path}`,

  // errors.noKey ｜ id 和 name 都没给
  'errors.noKey': `id 和 name 至少给一个：id 从 list_collection 拿；name 就是藏品名字（忽略空格和大小写）。`,

  // errors.unknownId ｜ id 对不上任何藏品（{known} 是现有藏品清单）
  'errors.unknownId': `没有 id 为 {wanted} 的藏品。收藏库里现有的：\n{known}`,

  // errors.unknownName ｜ 名字对不上任何藏品（{known} 是现有藏品清单）
  'errors.unknownName': `没有名字是「{wanted}」的藏品。收藏库里现有的：\n{known}`,

  // errors.ambiguousName ｜ 档案里有同名藏品：让调用方改用 id
  'errors.ambiguousName': `有 {count} 件藏品都叫「{wanted}」，分不清是哪一件：{ids}。改用 id 重试。`,

  // errors.knownLine ｜ errors.unknownId / unknownName 里的一行：名字 · id
  'errors.knownLine': `  {name} · {id}`,

  // ── 夹在句子里的零碎词 ────────────────────────────────────────────────────

  // words.nameless ｜ 档案里 name 缺失时顶上的名字
  'words.nameless': `（未命名）`,

  // words.emptyLibrary ｜ 收藏库为空时用的那句（挑不中、列不出、没得覆盖都用它）
  'words.emptyLibrary': `（收藏库还是空的）`,

  // punct.idSeparator ｜ 报错里列多个 id 时的分隔符
  'punct.idSeparator': `、`,
}
