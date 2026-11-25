/**
 * tool-collection-add-photo — 往一件已经存档的藏品里追加一张照片。
 *
 * 为什么要单独一个工具：save_collection 的 photos 是整份档案的一部分，只想补一张图
 * 也得把名字、状态、价格、时间全部重抄一遍，抄漏一项就把旧档案改坏。这里只做一件事：
 * 按 id 或 name 挑中一件（口径与 read_collection 同一套，../lib/items.mjs），
 * 把图复制进 `photos/<id>/NN-<部位>.<ext>`，往 photos 数组末尾加一条，其余字段
 * 一个字都不碰，只更新 updatedAt。
 *
 *   <cwd>/collection/collection.json      总档案，只动被挑中那件的 photos / updatedAt
 *   <cwd>/collection/photos/<itemId>/     新图复制进来，序号接在现有照片后面
 *
 * 文件名规则、后缀嗅探、Windows 只读副本这几件事和 save_collection 共用
 * ../lib/photos.mjs，两边写出来的照片不会出现两种排法。
 *
 * 一个工具一个目录：这里只放 add_photo 的行为，能发给模型的每一句话
 * 都在同目录的 prompts.mjs 里。公用的文本无关函数在 ../lib/。
 */
import { mkdir, stat } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { ARCHIVE_VERSION, archivePathsOf, readArchive, workspaceOf, writeArchive } from '../lib/archive.mjs'
import { findById, findByKey, itemId, nameKey } from '../lib/items.mjs'
import { copyIntoTarget, imageExtension, photoFilename, samePath } from '../lib/photos.mjs'
import { createPrompt, format } from '../lib/prompt.mjs'
import { asRecord, describe, optionalText } from '../lib/values.mjs'
import { prompts } from './prompts.mjs'

/** Stable Loader identity. */
export const name = 'tool-collection-add-photo'

export const inject = ['tools']

/** 本工具的词典。改措辞只改 prompts.mjs。 */
const prompt = createPrompt(prompts, 'add-photo/prompts.mjs')

/** 同一个序号撞名时最多往后排几个后缀；正常档案不会走到这里。 */
const MAX_NAME_ATTEMPTS = 100

/** 必填文本缺失时按字典报错；label 由调用方从 labels.* 取。 */
function requiredText(value, label) {
  const text = optionalText(value)
  if (text === null) throw new Error(format(prompt('errors.requiredField'), { label }))
  return text
}

/**
 * 注册 `add_photo`。
 * @param ctx - agent scope 的 services。
 * @param config - `libraryDir`：收藏库相对工作区的目录名，必须和另外几个工具那行一致。
 */
export function apply(ctx, config) {
  ctx.tools.register({
    name: 'add_photo',
    description: prompt('add_photo.description'),
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string', description: prompt('add_photo.parameters.id') },
        name: { type: 'string', description: prompt('add_photo.parameters.name') },
        part: { type: 'string', description: prompt('add_photo.parameters.part') },
        description: { type: 'string', description: prompt('add_photo.parameters.description') },
        filePath: { type: 'string', description: prompt('add_photo.parameters.filePath') },
      },
      required: ['part', 'description', 'filePath'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          part: { type: 'string' },
          order: { type: 'integer' },
          file: { type: 'string' },
          photoCount: { type: 'integer' },
          directory: { type: 'string' },
          archive: { type: 'string' },
          summary: { type: 'string' },
        },
        required: ['id', 'name', 'part', 'order', 'file', 'photoCount', 'directory', 'archive', 'summary'],
      },
      render: (_args, value) => [{ type: 'text', text: value.summary }],
    },
    async execute(args, exec) {
      const input = asRecord(args)
      const wantedId = optionalText(input.id)
      const wantedName = optionalText(input.name)
      // 挑哪一件必须说清楚：没 id 也没 name 时，挑选「最近那件」或「全部」都是猜。
      if (wantedId === null && wantedName === null) throw new Error(prompt('errors.noKey'))
      const part = requiredText(input.part, prompt('labels.part'))
      const description = requiredText(input.description, prompt('labels.description'))
      const givenPath = requiredText(input.filePath, prompt('labels.filePath'))

      const cwd = workspaceOf(exec)
      const { libraryRoot, archivePath } = archivePathsOf(config, cwd)
      const library = await readArchive(archivePath, prompt)

      const item = wantedId !== null
        ? requireById(library.items, wantedId)
        : requireByName(library.items, wantedName)
      const id = itemId(item)
      if (id === null) {
        throw new Error(format(prompt('errors.itemWithoutId'), { name: optionalText(item.name) ?? prompt('words.nameless') }))
      }

      const photos = Array.isArray(item.photos) ? item.photos : []
      const order = nextOrder(photos)
      const candidates = candidatePaths(givenPath, libraryRoot, cwd)
      const source = await firstFile(candidates)
      if (source === undefined) {
        throw new Error(format(prompt('errors.photoMissing'), {
          given: givenPath,
          tried: candidates.map((path) => `  ${path}`).join('\n'),
        }))
      }

      const extension = await imageExtension(source)
      const directory = join(libraryRoot, 'photos', id)
      const target = await freeTarget(directory, order, part, extension, source)
      if (!samePath(source, target.file)) {
        await mkdir(directory, { recursive: true })
        try {
          await copyIntoTarget(source, target.file)
        } catch (error) {
          throw new Error(format(prompt('errors.copyFailed'), { given: givenPath, message: describe(error) }))
        }
      }

      const entry = { order, part, description, file: `photos/${id}/${target.filename}` }
      const now = new Date()
      const updated = { ...item, photos: [...photos, entry], updatedAt: now.toISOString() }
      const items = library.items.map((each) => (each === item ? updated : each))
      await writeArchive(archivePath, {
        ...library,
        version: library.version ?? ARCHIVE_VERSION,
        updatedAt: now.toISOString(),
        items,
      })

      const itemName = optionalText(item.name) ?? prompt('words.nameless')
      const photoCount = photos.length + 1
      const summary = [
        format(prompt('result.head'), { name: itemName, order, part }),
        format(prompt('result.file'), { file: entry.file }),
        format(prompt('result.total'), { count: photoCount, directory }),
      ]

      return {
        id,
        name: itemName,
        part,
        order,
        file: entry.file,
        photoCount,
        directory,
        archive: archivePath,
        summary: summary.join('\n'),
      }
    },
  })
}

/** 照片序号接在现有照片后面；档案里的 order 缺了或乱了也至少排在最后一张之后。 */
function nextOrder(photos) {
  let highest = 0
  for (const entry of photos) {
    const value = entry !== null && typeof entry === 'object' ? entry.order : undefined
    if (typeof value === 'number' && Number.isFinite(value) && value > highest) highest = Math.floor(value)
  }
  return Math.max(highest, photos.length) + 1
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
 * 现有藏品清单（每行「名字 · id」），失败时填进 errors.unknownId / unknownName。
 * 没有 id 的条目列不出来（也放不了照片），跳过。
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

/**
 * 一种写法展开成按优先级排的候选绝对路径（去重）。
 *
 * 顺序照顾的是「模型手里通常有什么」：消息里上传的图是绝对只读路径；偶尔带着
 * `collection/` 前缀抄来，那就是工作区相对路径；档案里 `photos[].file` 的值是
 * 收藏库相对路径；省掉 `photos/` 前缀的写法也认（与 read_image 一致）。
 * @param given - 模型传进来的 filePath。
 * @param libraryRoot - 收藏库根目录绝对路径。
 * @param cwd - 会话工作区绝对路径。
 * @returns 要依次尝试的绝对路径。
 */
function candidatePaths(given, libraryRoot, cwd) {
  if (isAbsolute(given)) return [resolve(given)]
  // Windows 上模型常把 `/` 和 `\` 混着写；这里只归一化分隔符，不碰盘符。
  const normalized = given.replace(/\\/g, '/').replace(/^\.\/+/, '')
  const candidates = [
    resolve(cwd, normalized),
    resolve(libraryRoot, normalized),
    resolve(libraryRoot, 'photos', normalized),
  ]
  return [...new Set(candidates)]
}

/**
 * 依次 stat 候选路径，返回第一个**普通文件**；都不存在时返回 undefined。
 * 目录不算命中：把「photos/<id>」当图片传是常见手误。
 * @param candidates - 候选绝对路径，按优先级排好。
 * @returns 命中的绝对路径，或 undefined。
 */
async function firstFile(candidates) {
  for (const candidate of candidates) {
    const info = await stat(candidate).catch(() => undefined)
    if (info !== undefined && info.isFile()) return candidate
  }
  return undefined
}

/**
 * 定下这张照片在磁盘上的文件名，并返回配套的绝对路径。
 *
 * 正常情况就是 `NN-<部位>.<ext>`；只有同序号同名（手改过档案、或从别处拷了同名图）
 * 才在后面加 `-2`、`-3`。源文件恰好就是这个目标时直接返回，不必再复制。
 * @param directory - `<收藏库根>/photos/<id>`。
 * @param order - 这张的序号。
 * @param part - 部位名。
 * @param extension - 以点开头的扩展名。
 * @param source - 源图片绝对路径。
 * @returns `{ filename, file }`：文件名与目标绝对路径。
 */
async function freeTarget(directory, order, part, extension, source) {
  const base = photoFilename(order, part, extension)
  const dot = base.lastIndexOf('.')
  const stem = base.slice(0, dot)
  const tail = base.slice(dot)
  for (let attempt = 1; attempt <= MAX_NAME_ATTEMPTS; attempt += 1) {
    const filename = attempt === 1 ? base : `${stem}-${attempt}${tail}`
    const file = join(directory, filename)
    const existing = await stat(file).catch(() => undefined)
    if (existing === undefined || samePath(source, file)) return { filename, file }
  }
  throw new Error(format(prompt('errors.tooManyFiles'), { directory }))
}
