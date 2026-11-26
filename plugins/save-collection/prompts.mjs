/**
 * save_collection 的提示词词典
 *
 * 这里是唯一存放「save_collection 会发给模型的文本」的地方。同目录的 index.mjs
 * 只按 `prompt('键')` 取字符串，不内联任何中文，所以调措辞只改这一个文件。
 * 另一个工具 list_collection 的字典在 ../list-collection/prompts.mjs，两个文件互不影响。
 *
 * 键名就是发送位置：
 *   save_collection.description        工具总述（请求体 tools 数组里的 function.description）
 *   save_collection.parameters.<field> 该字段在 JSON Schema 里的 description
 *   result.*                           工具成功时返回的摘要（会进对话历史）
 *   labels.*                           报错里指代字段用的名字
 *   errors.*                           抛错文本（模型看到的是 "Error: …"）
 *   words.* / punct.*                  夹在句子里的零碎词
 *
 * 其中三条 errors.* 是公用代码 ../lib/archive.mjs 读档案失败时取的
 * （readArchive 会带着这本字典来查）：readArchive、archiveNotJson、archiveShape。
 *
 * 记法：`{名字}` 是运行时填进去的占位符，别删；其余文字原样发送。
 *
 * 不在这里、也不用管的东西：
 *   - index.mjs 的 output.schema：native 模式下只用于校验，不发送
 *     （只有把 tools 切到 ptc/both，它才会渲染进 tools:sdk 段）
 *   - 两个文件里的注释、函数名、文件名：永远不发送
 *
 * 改完要重新加载 preset 才生效：工具描述在注册那一刻就已经进了请求。
 */
export const prompts = {
  // ── 工具总述 ──────────────────────────────────────────────────────────────

  // save_collection.description ｜ 模型靠它判断「要不要调这个工具、什么时候调、一次传多少」
  'save_collection.description': `把一件藏品的完整档案写进本地收藏库（工作区 collection/collection.json，照片复制到 collection/photos/<id>/）。用户确认过整份档案之后调用；一次传入全部已知信息。省略 overwriteId 是新建，传入已有 id 是覆盖更新，覆盖更新前需浏览过旧档案。名字不能和别的藏品重复：撞名时带上那件的 overwriteId 就是改它，否则要换个名字。`,

  // ── 参数 ──────────────────────────────────────────────────────────────────

  // save_collection.parameters.name ｜ 藏品名称
  'save_collection.parameters.name': `藏品名称。`,

  // save_collection.parameters.status ｜ 藏品状态
  'save_collection.parameters.status': `状态：已拥有 | 待补款 | 购物车`,

  // save_collection.parameters.kind ｜ 类型：给模型一个分类候选表
  'save_collection.parameters.kind': `类型：手办 | 立牌 | 抱枕 | 挂画 | 徽章 | 其他`,

  // save_collection.parameters.price ｜ 花销
  'save_collection.parameters.price': `藏品的开销。`,

  // save_collection.parameters.price.total ｜ 总价
  'save_collection.parameters.price.total': `总价。`,

  // save_collection.parameters.price.deposit ｜ 定金
  'save_collection.parameters.price.deposit': `定金。`,

  // save_collection.parameters.price.balance ｜ 尾款
  'save_collection.parameters.price.balance': `尾款。`,

  // save_collection.parameters.orderedAt ｜ 下单时间
  'save_collection.parameters.orderedAt': `下单时间，yyyy-mm-dd 格式。`,

  // save_collection.parameters.balanceDueAt ｜ 补尾款时间
  'save_collection.parameters.balanceDueAt': `补尾款时间或预计补款月份，yyyy-mm-dd 或 yyyy-mm 格式。`,

  // save_collection.parameters.arrivesAt ｜ 到货时间
  'save_collection.parameters.arrivesAt': `到货时间，yyyy-mm-dd 格式。`,

  // save_collection.parameters.motivation ｜ 心情：当初为什么想买
  'save_collection.parameters.motivation': `用户买的理由。`,

  // save_collection.parameters.photos ｜ 照片数组：排序口径、一张一描述，以及「省略=保留 / 空数组=没有」这条关键语义
  'save_collection.parameters.photos': `按身体部位顺序排列的照片，每张附带一句描述。更新旧档案时省略表示保留原有照片，传空数组表示这件没有照片。`,

  // save_collection.parameters.photos.part ｜ 单张照片拍的是哪个部位
  'save_collection.parameters.photos.part': `照片拍摄的部位。`,

  // save_collection.parameters.photos.description ｜ 单张照片的一句话描述
  'save_collection.parameters.photos.description': `用户或你的发情感想，不是图片内容。`,

  // save_collection.parameters.photos.path ｜ 图片路径：从哪抄这个路径，别自己拼
  'save_collection.parameters.photos.path': `上传图片的文件路径，工作区相对路径或绝对路径。`,

  // save_collection.parameters.notes ｜ 备注
  'save_collection.parameters.notes': `你自己的评价或想法，想点评或者有什么想说的可以写这里。`,

  // save_collection.parameters.overwriteId ｜ 覆盖更新：把已有 id 传进来，省略就是新建
  'save_collection.parameters.overwriteId': `要覆盖更新的已有藏品 id；新建时省略。`,

  // ── 成功返回的摘要（会进对话历史）─────────────────

  // result.head ｜ 新建成功的第一行：名字、状态、类型
  'result.head': `已存档：{name}（{status}{kind}）`,

  // result.headOverwrite ｜ 覆盖更新成功的第一行
  'result.headOverwrite': `已存档：{name}（{status}{kind}），覆盖更新了原有档案`,

  // result.archive ｜ 总档案落在哪
  'result.archive': `档案：{path}`,

  // result.photosNone ｜ 这次一张照片都没存
  'result.photosNone': `照片：这次没有照片`,

  // result.photosKept ｜ 沿用原有照片（省略 photos 时的结果）
  'result.photosKept': `照片：沿用原有 {count} 张 → {directory}`,

  // result.photosNew ｜ 这次新存进去的照片
  'result.photosNew': `照片：{count} 张 → {directory}`,

  // result.id ｜ 回显 id，模型下次覆盖更新要用
  'result.id': `id：{id}`,

  // punct.kindSeparator ｜ 摘要里状态和类型之间的分隔符（类型为空时整段不出现）
  'punct.kindSeparator': `·`,

  // ── 报错里的字段名 ────────────────────────────────────────────────────────

  // labels.name ｜ 报错里指代 name
  'labels.name': `name（藏品名字）`,

  // labels.status ｜ 报错里指代 status
  'labels.status': `status（状态）`,

  // labels.photos.part ｜ 报错里指代第几张照片的部位；{index} 从 0 开始
  'labels.photos.part': `photos[{index}].part（部位）`,

  // labels.photos.description ｜ 报错里指代第几张照片的描述
  'labels.photos.description': `photos[{index}].description（图片描述）`,

  // labels.photos.path ｜ 报错里指代第几张照片的路径
  'labels.photos.path': `photos[{index}].path（图片路径）`,

  // labels.price.total ｜ 报错里指代 price.total
  'labels.price.total': `price.total`,

  // labels.price.deposit ｜ 报错里指代 price.deposit
  'labels.price.deposit': `price.deposit`,

  // labels.price.balance ｜ 报错里指代 price.balance
  'labels.price.balance': `price.balance`,

  // ── 报错正文 ──────────────────────────────────────────────────────────────

  // errors.requiredField ｜ 必填字段缺失（{label} 由 labels.* 提供）
  'errors.requiredField': `缺少必填字段 {label}`,

  // errors.photosNotArray ｜ photos 传了非数组
  'errors.photosNotArray': `photos 必须是数组：每项含 part、description、path`,

  // errors.readArchive ｜ 读总档案失败（非「文件不存在」）—— 公用的 lib/archive.mjs 会来取这条
  'errors.readArchive': `读取收藏库失败：{path}（{message}）`,

  // errors.archiveNotJson ｜ 总档案不是合法 JSON，拒绝写入以免覆盖旧档 —— 公用的 lib/archive.mjs 会来取这条
  'errors.archiveNotJson': `收藏库文件不是合法 JSON，已停止写入以免覆盖旧档案：{path}。备份并修复或移走该文件再重试。`,

  // errors.archiveShape ｜ 总档案结构异常 —— 公用的 lib/archive.mjs 会来取这条
  'errors.archiveShape': `收藏库文件结构异常（缺少 items 数组），已停止写入：{path}`,

  // errors.photoMissing ｜ 照片路径找不到：提示模型去抄消息里那条只读路径
  'errors.photoMissing': `找不到照片文件：{given}（解析为 {resolved}）。确认图片的真实路径，或让用户重新上传。`,

  // errors.photoNotFile ｜ 路径存在但不是普通文件
  'errors.photoNotFile': `照片路径不是普通文件：{given}`,

  // errors.amountNotNumber ｜ 金额不是有限数字
  'errors.amountNotNumber': `{label} 不是有效数字`,

  // errors.amountUnreadable ｜ 金额文本解析不出数字
  'errors.amountUnreadable': `{label} 不是可识别的金额：{value}`,

  // errors.amountType ｜ 金额既不是数字也不是字符串
  'errors.amountType': `{label} 必须是数字或可识别的金额文本`,

  // errors.unknownId ｜ overwriteId 指向不存在的藏品（{known} 由 words.emptyLibrary 兜底）
  'errors.unknownId': `没有 id 为 {wanted} 的藏品，现有 id：{known}。新建一件请省略 overwriteId。`,

  // errors.duplicateName ｜ 新建时名字撞了已有藏品，但那件连 id 都没有（手改坏的档案）
  'errors.duplicateName': `已经有一件叫「{name}」的藏品，收藏库里名字不能重复，换个名字再存。`,

  // errors.duplicateNameWithId ｜ 撞了已有藏品：点明是改它（带 overwriteId）还是换名字
  'errors.duplicateNameWithId': `已经有一件叫「{name}」的藏品（id：{id}），收藏库里名字不能重复：要改那一件就带 overwriteId: {id}，新建请换个名字。`,

  // errors.tooManyInSecond ｜ 同一秒内 id 用尽
  'errors.tooManyInSecond': `同一秒内创建的藏品过多，请稍后重试`,

  // words.emptyLibrary ｜ 收藏库为空时填进 errors.unknownId 的 {known}
  'words.emptyLibrary': `（收藏库还是空的）`,
}
