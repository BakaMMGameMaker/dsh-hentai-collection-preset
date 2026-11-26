/**
 * 照片公用词典
 *
 * save_collection 与 add_photo 收的是同一组照片字段（部位、描述、路径），发给模型的
 * 每一句话都该一模一样：两边措辞只要有一点差别，模型就会在参数上反复试探、你也要
 * 两边来回改。所以照片字段的 description、报错里指代字段的名字、照片落盘失败的说法，
 * 都只在下面写一份。
 *
 * 两个工具目录下的 prompts.mjs 用 `...photoPrompts` 把它并进自己的字典，改一句话就
 * 同时改了两边，不用对稿。
 *
 * 键名就是发送位置：
 *   photos.parameters.<字段>  照片字段在 JSON Schema 里的 description
 *   photos.labels.<字段>      报错里指代该字段用的名字
 *   photos.errors.*           照片落盘相关的抛错文本（模型看到的是 "Error: …"）
 *
 * 只放「两个工具说同一句话」的文本：照片数组的排序语义（省略=保留、空数组=没有）
 * 只有 save_collection 有，仍然归它自己的字典。
 *
 * 记法：`{名字}` 是运行时填进去的占位符，别删；其余文字原样发送。
 * 改完要重新加载 preset 才生效。
 */
export const photoPrompts = {
  // ── 照片字段（两个工具的 JSON Schema 共用这一份措辞）──────────────────────

  // photos.parameters.part ｜ 这张拍的是哪个部位
  'photos.parameters.part': `这张照片拍的是哪个部位。同一部位可以传多次，收藏库会按序号排。`,

  // photos.parameters.description ｜ 用户的一句话描述
  'photos.parameters.description': `用户或你的发情感想，不是图片内容。`,

  // photos.parameters.path ｜ 图片从哪来：抄消息里那条只读路径，别自己拼
  'photos.parameters.path': `图片路径：消息里上传的图片会带一段 "Normalized copy (read-only; …): " 的只读路径，抄那串就行；工作区相对路径、绝对路径、档案里已有的 photos/<id>/… 也都认。`,

  // ── 报错里的字段名 ────────────────────────────────────────────────────────

  // photos.labels.part ｜ 报错里指代 part（save_collection 会套上 photos[{index}]. 前缀）
  'photos.labels.part': `part（部位）`,

  // photos.labels.description ｜ 报错里指代 description
  'photos.labels.description': `description（图片描述）`,

  // photos.labels.path ｜ 报错里指代 path
  'photos.labels.path': `path（图片路径）`,

  // ── 照片落盘报错 ──────────────────────────────────────────────────────────

  // photos.errors.missing ｜ 几种写法都没找到：把试过的位置列给模型，它照着改
  'photos.errors.missing': `找不到这张图片：{given}\n找过这些位置：\n{tried}\n确认图片的真实路径，或让用户重新上传。`,

  // photos.errors.notFile ｜ 路径存在但不是普通文件（把 photos/<id> 当图片传是常见手误）
  'photos.errors.notFile': `图片路径不是普通文件：{path}`,

  // photos.errors.copyFailed ｜ 复制进收藏库失败（磁盘权限之类）
  'photos.errors.copyFailed': `图片复制进收藏库失败：{given}（{message}）`,

  // photos.errors.tooManyFiles ｜ 同一序号下文件名占满了（正常情况不会出现）
  'photos.errors.tooManyFiles': `照片目录里同名的文件太多，加不进去：{directory}`,
}
