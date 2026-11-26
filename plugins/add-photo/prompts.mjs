/**
 * add_photo 的提示词词典
 *
 * 这里只放「add_photo 自己那几句话」。会发给模型的文本有两个来源：
 *   - 本工具自己的：下面这个对象（工具总述、成功摘要、自己的报错）
 *   - 几个工具共用的：../lib/archive.prompts.mjs（id / name 的说法、挑不中藏品的
 *     报错、读档案失败、必填字段、空收藏库）和 ../lib/photos.prompts.mjs
 *     （照片字段、照片落盘报错），用 `...` 并进来
 *
 * 所以调措辞先看这句话归谁：只跟 add_photo 有关就改本文件；几个工具都这么说就改
 * lib/ 下那两本词典，改一次两边同时生效，不用对稿。
 *
 * 同目录的 index.mjs 只按 `prompt('键')` 取字符串，不内联任何中文。
 *
 * 键名就是发送位置：
 *   add_photo.description        工具总述（请求体 tools 数组里的 function.description）
 *   items.* / photos.*           公用词典并进来的字段说法与报错（见上面两本）
 *   result.*                     工具成功时返回的摘要（会进对话历史）
 *   errors.*                     抛错文本（模型看到的是 "Error: …"）
 *
 * 记法：`{名字}` 是运行时填进去的占位符，别删；其余文字原样发送。
 * 这个工具没有自己独有的参数键：id / name 与 read_collection 共用一份，
 * part / description / path 与 save_collection 共用一份。
 *
 * 改完要重新加载 preset 才生效：工具描述在注册那一刻就已经进了请求。
 */
import { archivePrompts } from '../lib/archive.prompts.mjs'
import { photoPrompts } from '../lib/photos.prompts.mjs'

export const prompts = {
  ...archivePrompts,
  ...photoPrompts,

  // ── 工具总述 ──────────────────────────────────────────────────────────────

  // add_photo.description ｜ 模型靠它判断「补图用它、不用整份 save_collection」
  'add_photo.description': `往一件已经存档的藏品里追加一张照片。id 与 name 二选一，两个都给时以 id 为准；name 忽略空格和大小写。图片复制进收藏库、只往照片清单末尾加一条，其余字段一个字都不动——补图时不必重新 save_collection 整份档案。一次只加一张，多张就多调几次。`,

  // ── 成功返回的摘要（会进对话历史）─────────────────────────────────────────

  // result.head ｜ 第一行：给哪件加了第几张、什么部位
  'result.head': `已给「{name}」加上第 {order} 张照片：{part}`,

  // result.file ｜ 这张存成了哪个文件（可原样喂 read_image）
  'result.file': `照片：{file}`,

  // result.total ｜ 这件藏品现在的照片总数与目录
  'result.total': `这件藏品现在共 {count} 张照片 → {directory}`,

  // ── 报错正文 ──────────────────────────────────────────────────────────────

  // errors.itemWithoutId ｜ 挑中的那件连 id 都没有（手改坏的档案），照片没地方放
  'errors.itemWithoutId': `藏品「{name}」在档案里没有 id，没法给它建照片目录。先用 save_collection 重新存一遍这件藏品，再补图。`,
}
