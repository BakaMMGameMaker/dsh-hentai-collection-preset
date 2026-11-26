/**
 * read_collection 的提示词词典
 *
 * 这里只放「read_collection 自己那几句话」。会发给模型的文本有两个来源：
 *   - 本工具自己的：下面这个对象（工具总述、每个字段回显成的那一行、自己的报错）
 *   - 几个工具共用的：../lib/archive.prompts.mjs（id / name 的说法、挑不中藏品的
 *     报错、读档案失败、空收藏库），用 `...` 并进来
 *
 * 所以调措辞先看这句话归谁：只跟 read_collection 有关就改本文件；几个工具都这么说
 * 就改 lib/archive.prompts.mjs，改一次几个工具同时生效。
 *
 * 同目录的 index.mjs 只按 `prompt('键')` 取字符串，不内联任何中文。
 *
 * 键名就是发送位置：
 *   read_collection.description  工具总述（请求体 tools 数组里的 function.description）
 *   result.line.*               档案里一项字段回显成的那一行（字段名 = 人设里的说法）
 *   result.photo / photosEnvelope
 *                               照片清单：每张一个方括号条目，外面再套一层方括号
 *   items.* / errors.* / words.* / punct.*
 *                               公用词典并进来的（见上面那本）
 *
 * 记法：`{名字}` 是运行时填进去的占位符，别删；其余文字原样发送。
 *
 * 改完要重新加载 preset 才生效：工具描述在注册那一刻就已经进了请求。
 */
import { archivePrompts } from '../lib/archive.prompts.mjs'

export const prompts = {
  ...archivePrompts,

  // ── 工具总述 ──────────────────────────────────────────────────────────────

  // read_collection.description ｜ 模型靠它判断「读档案该用它、name/id 怎么填、拿到的是什么」
  'read_collection.description': `读一件藏品的完整档案。id 与 name 二选一，两个都给时以 id 为准；name 忽略空格和大小写。`,

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
}

/**
 * 哪些状态没有「到货时间」这一行：还没到手的两档。
 * 判定口径要和 save_collection 的状态候选一致（见 ../save-collection/prompts.mjs
 * 的 `save_collection.parameters.status`）：只有到手了才有到货日期可写。
 */
export const noArrivalStatuses = ['待补款', '购物车']
