/**
 * list_collection 的提示词词典
 *
 * 这里只放「list_collection 自己那几句话」。会发给模型的文本有两个来源：
 *   - 本工具自己的：下面这个对象（工具总述、每件一行、自己的零碎词）
 *   - 几个工具共用的：../lib/archive.prompts.mjs（空库、未命名、读档案失败），
 *     用 `...` 并进来
 *
 * 同目录的 index.mjs 只按 `prompt('键')` 取字符串，不内联任何中文。
 *
 * 键名就是发送位置：
 *   list_collection.description  工具总述（请求体 tools 数组里的 function.description）
 *   result.line                  工具成功时返回的文本（会进对话历史，每件藏品一行）
 *   words.noStatus               夹在句子里的零碎词
 *   words.* / errors.*           公用词典并进来的（见上面那本）
 *
 * 记法：`{名字}` 是运行时填进去的占位符，别删；其余文字原样发送。
 * 这个工具的参数表是空的，所以没有 parameters.* 键；它也不发照片摘要。
 *
 * 改完要重新加载 preset 才生效：工具描述在注册那一刻就已经进了请求。
 */
import { archivePrompts } from '../lib/archive.prompts.mjs'

export const prompts = {
  ...archivePrompts,

  // ── 工具总述 ──────────────────────────────────────────────────────────────

  // list_collection.description ｜ 模型靠它判断「什么时候该列一览、拿到 id 干什么」
  'list_collection.description': `列出收藏库里每件藏品的名字、id 和状态。调它可拿藏品 id；想看完整档案就用 read_collection 按名字或 id 读。`,

  // ── 成功返回的文本（会进对话历史）─────────────────────────────────────────

  // result.line ｜ 一件藏品一行：{name} 名字，{id} 覆盖更新时要传的 id，{status} 已拥有/待补款/购物车
  'result.line': `名字：“{name}”，id：{id}，状态：{status}`,

  // ── 夹在句子里的零碎词 ────────────────────────────────────────────────────

  // words.noStatus ｜ 档案里 status 缺失时顶上的状态
  'words.noStatus': `（未标状态）`,
}
