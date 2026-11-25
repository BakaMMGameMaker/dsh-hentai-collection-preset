/**
 * 档案里一条藏品记录（`items[]` 的一项）上的查找与判重，save_collection 与
 * read_collection 共用。
 *
 * 「名字相同」的口径必须两边一致：save_collection 用它拦住重名，read_collection
 * 用它按名字找。只要有一边不同，存档时拦下的重名就会在读取时反过来撞上。
 * 口径是「去掉所有空白 + 忽略大小写」，所以「初音未来 睡莲」与
 * 「初音未来睡莲」算同一件。
 *
 * 这个文件不发任何文本：找不到、重名时说什么由调用方从自己的 prompts.mjs 取。
 */
import { optionalText } from './values.mjs'

/**
 * 名字的比较口径。
 * @param value - 档案里的 name，或调用方传进来的名字。
 * @returns 去掉所有空白并转小写后的比较键；没能给出名字时 null。
 */
export function nameKey(value) {
  const text = optionalText(value)
  return text === null ? null : text.replace(/\s+/g, '').toLowerCase()
}

/**
 * 一条记录的 id（文本化并 trim）；这类记录才能被 id 挑中。
 * @param entry - 档案里的一项。
 * @returns id 文本；没有 id、或根本不是对象时 null。
 */
export function itemId(entry) {
  if (entry === null || typeof entry !== 'object') return null
  const id = entry.id === undefined || entry.id === null ? '' : String(entry.id).trim()
  return id === '' ? null : id
}

/**
 * 按 id 找一件藏品。
 * @param items - 档案的 items 数组。
 * @param id - 要找的 id（已 trim）。
 * @returns 命中的记录，或 undefined。
 */
export function findById(items, id) {
  for (const entry of items) {
    if (itemId(entry) === id) return entry
  }
  return undefined
}

/**
 * 按比较键找所有同名藏品。正常档案最多命中一条；手改出来的重名会多于一条，
 * 取名字的那一方得自己决定是报错还是挑一条。
 * @param items - 档案的 items 数组。
 * @param key - `nameKey()` 算出来的比较键。
 * @returns 命中的记录，按档案顺序。
 */
export function findByKey(items, key) {
  if (key === null) return []
  const found = []
  for (const entry of items) {
    if (entry === null || typeof entry !== 'object') continue
    if (nameKey(entry.name) === key) found.push(entry)
  }
  return found
}
