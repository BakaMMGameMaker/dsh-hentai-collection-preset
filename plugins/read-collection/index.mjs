/**
 * tool-collection-read — 按名字或 id 读一件藏品的完整档案。
 *
 * 只读：从总档案（布局与读取在 ../lib/archive.mjs）里挑出那一件，把字段名换回
 * 人设里的中文说法（照 save_collection 的说法：名称、类型、状态……），拼成一段
 * 分行文本。照片只给路径，图片本体要看再调 read_image。
 *
 * id 与 name 二选一：两个都给时以 id 为准。name 的比较口径与 save_collection
 * 拦重名时同一套（../lib/items.mjs）——去掉空白、忽略大小写；档案里真出现两件
 * 同名（手改出来的）就报错让调用方改用 id，而不是随便挑一件。
 *
 * 一个工具一个目录：这里只放 read_collection 的行为，能发给模型的每一句话
 * 都在同目录的 prompts.mjs 里。公用的文本无关函数在 ../lib/。
 */
import { archivePathsOf, readArchive, workspaceOf } from '../lib/archive.mjs'
import { findById, findByKey, itemId, nameKey } from '../lib/items.mjs'
import { createPrompt, format } from '../lib/prompt.mjs'
import { asRecord, optionalText } from '../lib/values.mjs'
import { noArrivalStatuses, prompts } from './prompts.mjs'

/** Stable Loader identity. */
export const name = 'tool-collection-read'

export const inject = ['tools']

/** 本工具的词典。改措辞只改 prompts.mjs。 */
const prompt = createPrompt(prompts, 'read-collection/prompts.mjs')

/**
 * 注册 `read_collection`。
 * @param ctx - agent scope 的 services。
 * @param config - `libraryDir`：收藏库相对工作区的目录名，必须和另外几个工具那行一致。
 */
export function apply(ctx, config) {
  ctx.tools.register({
    name: 'read_collection',
    description: prompt('read_collection.description'),
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string', description: prompt('read_collection.parameters.id') },
        name: { type: 'string', description: prompt('read_collection.parameters.name') },
      },
    },
    output: {
      // 回给模型的是一段已经排好版的中文文本，不是档案对象：字段名与分行都在这里定死。
      schema: { type: 'string' },
      render: (_args, text) => [{ type: 'text', text }],
    },
    async execute(args, exec) {
      const input = asRecord(args)
      const wantedId = optionalText(input.id)
      const wantedName = optionalText(input.name)
      // 两个都没给就没法挑：报错让模型补一个，比回「全部藏品」或随便挑一件都好。
      if (wantedId === null && wantedName === null) throw new Error(prompt('errors.noKey'))

      const cwd = workspaceOf(exec)
      const { archivePath } = archivePathsOf(config, cwd)
      const library = await readArchive(archivePath, prompt)

      const item = wantedId !== null
        ? requireById(library.items, wantedId)
        : requireByName(library.items, wantedName)
      return describeItem(item)
    },
  })
}

/** 按 id 取一件；找不到时把现有藏品（名字 · id）列进报错，模型照着改。 */
function requireById(items, id) {
  const found = findById(items, id)
  if (found === undefined) {
    throw new Error(format(prompt('errors.unknownId'), { wanted: id, known: availableText(items) }))
  }
  return found
}

/** 按名字取一件；同名多件是手改出来的歧义，报错让调用方改用 id。 */
function requireByName(items, given) {
  const matches = findByKey(items, nameKey(given))
  if (matches.length === 0) {
    throw new Error(format(prompt('errors.unknownName'), { wanted: given, known: availableText(items) }))
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
 * 把一件藏品排成一段中文分行文本：一行一个字段，字段名回成人设里的说法；
 * 「到货时间」只在到手的状态上出现（待补款、购物车没有这一行）。
 * @param item - 档案里的一项。
 * @returns 要发给模型的文本。
 */
function describeItem(item) {
  const price = asRecord(item.price)
  const timeline = asRecord(item.timeline)
  const status = optionalText(item.status) ?? ''
  const lines = [
    lineOf('name', optionalText(item.name) ?? prompt('words.nameless')),
    lineOf('kind', optionalText(item.kind) ?? ''),
    lineOf('status', status),
    lineOf('motivation', optionalText(item.motivation) ?? ''),
    lineOf('total', amountText(price.total)),
    lineOf('deposit', amountText(price.deposit)),
    lineOf('balance', amountText(price.balance)),
    lineOf('orderedAt', optionalText(timeline.orderedAt) ?? ''),
    lineOf('balanceDueAt', optionalText(timeline.balanceDueAt) ?? ''),
  ]
  if (!noArrivalStatuses.includes(status)) {
    lines.push(lineOf('arrivesAt', optionalText(timeline.arrivesAt) ?? ''))
  }
  lines.push(lineOf('photos', photosText(item.photos)))
  lines.push(lineOf('notes', optionalText(item.notes) ?? ''))
  return lines.join('\n')
}

/**
 * 一行回显。词典里每个字段一行（result.line.<字段>），键写错会立刻在
 * createPrompt 里抛错，不会悄悄发一行空字段名出去。
 * @param field - 字段名，和词典键 result.line.<字段> 对应。
 * @param value - 该字段的值，缺失的字段传空串（行留着，只是冒号后面空着）。
 * @returns 填好值的一行。
 */
function lineOf(field, value) {
  return format(prompt(`result.line.${field}`), { value })
}

/**
 * 金额显示成原样的数字：975、1147.5、147.75。
 * 档案里没有这个金额（null）时留空，行还在。
 * @param value - price.total / deposit / balance。
 * @returns 数字文本或空串。
 */
function amountText(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed !== '' && Number.isFinite(Number(trimmed)) ? String(Number(trimmed)) : ''
  }
  return ''
}

/**
 * 照片清单排成 `[[部位：…，路径：…，用户感想：…]，[部位：…]]` 一行。
 * 路径就是档案里 `photos[].file` 的值，可以原样传给 read_image。
 * 一张都没有时是 `[]`。
 * @param entries - 档案里的 photos 数组。
 * @returns 清单文本。
 */
function photosText(entries) {
  const photos = Array.isArray(entries) ? entries : []
  if (photos.length === 0) return prompt('result.photosNone')
  const blocks = photos.map((entry) => {
    const photo = asRecord(entry)
    return format(prompt('result.photo'), {
      part: optionalText(photo.part) ?? '',
      file: optionalText(photo.file) ?? '',
      description: optionalText(photo.description) ?? '',
    })
  })
  return format(prompt('result.photosEnvelope'), { items: blocks.join(prompt('punct.photoSeparator')) })
}

/**
 * 现有藏品清单（每行「名字 · id」），失败时填进 errors.unknownId / unknownName。
 * 没有 id 的条目列不出来（改不了也读不到），跳过。
 * @param items - 档案的 items 数组。
 * @returns 清单文本；一件都列不出来时是 empty 那句。
 */
function availableText(items) {
  const lines = []
  for (const entry of items) {
    const id = itemId(entry)
    if (id === null) continue
    const name = optionalText(entry === null || typeof entry !== 'object' ? undefined : entry.name) ?? prompt('words.nameless')
    lines.push(format(prompt('errors.knownLine'), { name, id }))
  }
  return lines.length === 0 ? prompt('errors.knownEmpty') : lines.join('\n')
}
