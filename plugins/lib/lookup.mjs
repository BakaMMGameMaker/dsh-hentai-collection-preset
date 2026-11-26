/**
 * 按 id / 名字挑中一件藏品，挑不中时按调用方字典报错。
 *
 * add_photo 与 read_collection 收的是同一种参数：id 与 name 二选一、两个都给时以 id
 * 为准、name 忽略空白和大小写（比较口径在 ./items.mjs）。所以「怎么挑、挑不中说什么」
 * 只写一份：找不到时列出现有藏品，同名多件（只有手改出来的档案才会）时报歧义并让
 * 调用方改用 id。
 *
 * 这个文件不写死任何文本：句子在 ./archive.prompts.mjs（两个工具的字典都并了它），
 * 由 `prompt` 参数取。改措辞去那本词典，别改这里。
 */
import { findById, findByKey, itemId, nameKey } from './items.mjs'
import { format } from './prompt.mjs'
import { optionalText } from './values.mjs'

/**
 * 用调用方给的 id / name 挑一件藏品：id 优先，两个都没给是调用错误。
 * @param items - 档案的 items 数组。
 * @param wanted - `{ id, name }`，可以是模型传进来的原始值（会自动收成非空文本）。
 * @param prompt - 调用方字典的取值函数。
 * @returns 命中的那条记录。
 */
export function pickItem(items, wanted, prompt) {
  const wantedId = optionalText(wanted.id)
  const wantedName = optionalText(wanted.name)
  // 两个都没给就没法挑：报错让模型补一个，比「挑最近那件」或「全部」都好。
  if (wantedId === null && wantedName === null) throw new Error(prompt('errors.noKey'))
  return wantedId !== null ? requireById(items, wantedId, prompt) : requireByName(items, wantedName, prompt)
}

/**
 * 按 id 取一件；找不到时把现有藏品（名字 · id）列进报错，模型照着改。
 * @param items - 档案的 items 数组。
 * @param id - 要挑的 id（已 trim）。
 * @param prompt - 调用方字典的取值函数。
 * @returns 命中的那条记录。
 */
export function requireById(items, id, prompt) {
  const found = findById(items, id)
  if (found === undefined) {
    throw new Error(format(prompt('errors.unknownId'), { wanted: id, known: availableText(items, prompt) }))
  }
  return found
}

/**
 * 按名字取一件；同名多件是手改出来的歧义，报错让调用方改用 id。
 * @param items - 档案的 items 数组。
 * @param given - 要挑的名字（已 trim）。
 * @param prompt - 调用方字典的取值函数。
 * @returns 命中的那条记录。
 */
export function requireByName(items, given, prompt) {
  const matches = findByKey(items, nameKey(given))
  if (matches.length === 0) {
    throw new Error(format(prompt('errors.unknownName'), { wanted: given, known: availableText(items, prompt) }))
  }
  if (matches.length > 1) {
    throw new Error(format(prompt('errors.ambiguousName'), {
      wanted: given,
      count: matches.length,
      ids: matches.map((entry) => itemId(entry) ?? '?').join(prompt('punct.idSeparator')),
    }))
  }
  return matches[0]
}

/**
 * 现有藏品清单（每行「名字 · id」），失败时填进 errors.unknownId / unknownName。
 * 没有 id 的条目列不出来（也挑不中），跳过。
 * @param items - 档案的 items 数组。
 * @param prompt - 调用方字典的取值函数。
 * @returns 清单文本；一件都列不出来时是 words.emptyLibrary 那句。
 */
export function availableText(items, prompt) {
  const lines = []
  for (const entry of items) {
    const id = itemId(entry)
    if (id === null) continue
    const name = optionalText(entry === null || typeof entry !== 'object' ? undefined : entry.name) ?? prompt('words.nameless')
    lines.push(format(prompt('errors.knownLine'), { name, id }))
  }
  return lines.length === 0 ? prompt('words.emptyLibrary') : lines.join('\n')
}
