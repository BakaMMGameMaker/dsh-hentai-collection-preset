/**
 * tool-collection-save — 把一件藏品的完整档案写进本地收藏库。
 *
 * 存储是工作区里的普通文件（布局、读写、路径解析在 ../lib/archive.mjs）：
 *
 *   <cwd>/collection/collection.json     总档案，一件藏品一条记录
 *   <cwd>/collection/photos/<itemId>/    照片，重命名成 01-<部位>.<ext>
 *
 * 一个工具一个目录：这里只放 save_collection 的行为，能发给模型的每一句话
 * 都在同目录的 prompts.mjs 里。公用的文本无关函数在 ../lib/。
 */
import { chmod, copyFile, mkdir, open, stat } from 'node:fs/promises'
import { extname, isAbsolute, join, resolve } from 'node:path'
import { archivePathsOf, readArchive, workspaceOf, writeArchive, ARCHIVE_VERSION } from '../lib/archive.mjs'
import { createPrompt, format } from '../lib/prompt.mjs'
import { asRecord, optionalText } from '../lib/values.mjs'
import { prompts } from './prompts.mjs'

/** Stable Loader identity. */
export const name = 'tool-collection-save'

export const inject = ['tools']

/** 本工具的词典。改措辞只改 prompts.mjs。 */
const prompt = createPrompt(prompts, 'save-collection/prompts.mjs')

/** 认得的图片扩展名；别的格式按 .jpg 存，只影响文件名后缀。 */
const PHOTO_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.heic', '.avif'])

/** 必填文本缺失时按字典报错；label 由调用方从 labels.* 取。 */
function requiredText(value, label) {
  const text = optionalText(value)
  if (text === null) throw new Error(format(prompt('errors.requiredField'), { label }))
  return text
}

/**
 * 注册 `save_collection`。
 * @param ctx - agent scope 的 services。
 * @param config - `libraryDir`：收藏库相对工作区的目录名。
 */
export function apply(ctx, config) {
  ctx.tools.register({
    name: 'save_collection',
    description: prompt('save_collection.description'),
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string', description: prompt('save_collection.parameters.name') },
        status: { type: 'string', description: prompt('save_collection.parameters.status') },
        kind: { type: 'string', description: prompt('save_collection.parameters.kind') },
        kindDetail: { type: 'string', description: prompt('save_collection.parameters.kindDetail') },
        price: {
          type: 'object',
          additionalProperties: false,
          description: prompt('save_collection.parameters.price'),
          properties: {
            total: { type: 'number', description: prompt('save_collection.parameters.price.total') },
            deposit: { type: 'number', description: prompt('save_collection.parameters.price.deposit') },
            balance: { type: 'number', description: prompt('save_collection.parameters.price.balance') },
          },
        },
        orderedAt: { type: 'string', description: prompt('save_collection.parameters.orderedAt') },
        balanceDueAt: { type: 'string', description: prompt('save_collection.parameters.balanceDueAt') },
        arrivesAt: { type: 'string', description: prompt('save_collection.parameters.arrivesAt') },
        motivation: { type: 'string', description: prompt('save_collection.parameters.motivation') },
        photos: {
          type: 'array',
          description: prompt('save_collection.parameters.photos'),
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              part: { type: 'string', description: prompt('save_collection.parameters.photos.part') },
              description: { type: 'string', description: prompt('save_collection.parameters.photos.description') },
              path: { type: 'string', description: prompt('save_collection.parameters.photos.path') },
            },
            required: ['part', 'description', 'path'],
          },
        },
        notes: { type: 'string', description: prompt('save_collection.parameters.notes') },
        overwriteId: { type: 'string', description: prompt('save_collection.parameters.overwriteId') },
      },
      required: ['name', 'status'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          status: { type: 'string' },
          created: { type: 'boolean' },
          archive: { type: 'string' },
          photosDir: { type: 'string' },
          photoCount: { type: 'integer' },
          summary: { type: 'string' },
        },
        required: ['id', 'name', 'status', 'created', 'archive', 'photosDir', 'photoCount', 'summary'],
      },
      render: (_args, value) => [{ type: 'text', text: value.summary }],
    },
    async execute(args, exec) {
      const input = asRecord(args)
      const cwd = workspaceOf(exec)
      const { libraryRoot, archivePath } = archivePathsOf(config, cwd)
      const now = new Date()

      const itemName = requiredText(input.name, prompt('labels.name'))
      const status = requiredText(input.status, prompt('labels.status'))
      const kind = optionalText(input.kind)
      const kindDetail = optionalText(input.kindDetail)
      const notes = optionalText(input.notes)
      const motivation = optionalText(input.motivation)
      const orderedAt = optionalText(input.orderedAt)
      const balanceDueAt = optionalText(input.balanceDueAt)
      const arrivesAt = optionalText(input.arrivesAt)
      const priceInput = input.price === undefined || input.price === null ? {} : asRecord(input.price)
      // 金额一律人民币，所以不存币种字段：档案里只有三个数字。
      const price = {
        total: optionalAmount(priceInput.total, prompt('labels.price.total')),
        deposit: optionalAmount(priceInput.deposit, prompt('labels.price.deposit')),
        balance: optionalAmount(priceInput.balance, prompt('labels.price.balance')),
      }
      // 省略 photos 表示「这次不动照片」：更新一件旧档案时不该因为只改价格就丢图。
      // 传空数组才是明确地说「这件没有照片」。
      const photoInput = input.photos === undefined || input.photos === null ? null : input.photos
      if (photoInput !== null && !Array.isArray(photoInput)) throw new Error(prompt('errors.photosNotArray'))

      const library = await readArchive(archivePath, prompt)
      const existing = resolveExisting(library.items, input.overwriteId)
      const id = existing !== undefined ? existing.id : freshId(library.items, now)

      const photos = photoInput === null && existing !== undefined && Array.isArray(existing.photos)
        ? { entries: existing.photos, directory: join(libraryRoot, 'photos', id), kept: true }
        : { ...(await storePhotos({ cwd, libraryRoot, id, index: photoInput ?? [] })), kept: false }

      // 更新旧档案时按字段合并：没传的字段保留原值，免得只想改个状态就把
      // 金额、日期、心情全抹成 null。photos 也遵循同一规则。
      const provided = (key) => Object.prototype.hasOwnProperty.call(input, key) && input[key] !== undefined
      const previous = existing === undefined ? {} : existing
      const previousPrice = previous.price !== null && typeof previous.price === 'object' ? previous.price : {}
      const previousTimeline = previous.timeline !== null && typeof previous.timeline === 'object' ? previous.timeline : {}

      const patch = {
        ...(provided('kind') ? { kind } : {}),
        ...(provided('kindDetail') ? { kindDetail } : {}),
        ...(provided('motivation') ? { motivation } : {}),
        ...(provided('notes') ? { notes } : {}),
        ...(provided('orderedAt') || provided('balanceDueAt') || provided('arrivesAt')
          ? {
              timeline: {
                orderedAt: provided('orderedAt') ? orderedAt : (previousTimeline.orderedAt ?? null),
                balanceDueAt: provided('balanceDueAt') ? balanceDueAt : (previousTimeline.balanceDueAt ?? null),
                arrivesAt: provided('arrivesAt') ? arrivesAt : (previousTimeline.arrivesAt ?? null),
              },
            }
          : {}),
        // 价格每次整块写回：三个数字各自合并，顺带把旧档里遗留的多余字段
        // （早年存过 currency）清掉，不用另写一次迁移。
        price: {
          total: Object.prototype.hasOwnProperty.call(priceInput, 'total') ? price.total : (previousPrice.total ?? null),
          deposit: Object.prototype.hasOwnProperty.call(priceInput, 'deposit') ? price.deposit : (previousPrice.deposit ?? null),
          balance: Object.prototype.hasOwnProperty.call(priceInput, 'balance') ? price.balance : (previousPrice.balance ?? null),
        },
        photos: photos.entries,
      }

      const item = {
        // 新档案先落一份稳定的形状（缺的字段写 null），以后加读取工具时不用
        // 到处判断字段存不存在。顺序是 默认值 → previous → 本次必填/可选，
        // 后者覆盖前者，所以更新时 id/name/status 一定是新的。
        kind: null,
        kindDetail: null,
        motivation: null,
        notes: null,
        price: { total: null, deposit: null, balance: null },
        timeline: { orderedAt: null, balanceDueAt: null, arrivesAt: null },
        ...previous,
        id,
        name: itemName,
        status,
        ...patch,
        createdAt: existing === undefined ? now.toISOString() : (existing.createdAt ?? now.toISOString()),
        updatedAt: now.toISOString(),
      }

      const items = existing === undefined
        ? [...library.items, item]
        : library.items.map((entry) => (entry !== null && typeof entry === 'object' && entry.id === id ? item : entry))

      await writeArchive(archivePath, { ...library, version: library.version ?? ARCHIVE_VERSION, updatedAt: now.toISOString(), items })

      const photoCount = photos.entries.length
      const photoNote = photoCount === 0
        ? prompt('result.photosNone')
        : photos.kept
          ? format(prompt('result.photosKept'), { count: photoCount, directory: photos.directory })
          : format(prompt('result.photosNew'), { count: photoCount, directory: photos.directory })
      const kindLabel = item.kind === null || item.kind === undefined ? '' : `${prompt('punct.kindSeparator')}${item.kind}`
      const lines = [
        format(prompt(existing === undefined ? 'result.head' : 'result.headOverwrite'), { name: itemName, status, kind: kindLabel }),
        format(prompt('result.archive'), { path: archivePath }),
        photoNote,
        format(prompt('result.id'), { id }),
      ]

      return {
        id,
        name: itemName,
        status,
        created: existing === undefined,
        archive: archivePath,
        photosDir: photos.directory,
        photoCount,
        summary: lines.join('\n'),
      }
    },
  })
}

/** 校验 overwriteId；给了但不存在的 id 是调用错误，不是新建。 */
function resolveExisting(items, overwriteId) {
  const wanted = optionalText(overwriteId)
  if (wanted === null) return undefined
  const found = items.find((entry) => entry !== null && typeof entry === 'object' && entry.id === wanted)
  if (found !== undefined) return found
  const known = items.map((entry) => (entry !== null && typeof entry === 'object' ? String(entry.id) : '?')).join('、')
  throw new Error(format(prompt('errors.unknownId'), {
    wanted,
    known: known === '' ? prompt('words.emptyLibrary') : known,
  }))
}

/** 生成 20260601-153012 形式的 id，同秒冲突时追加序号。 */
function freshId(items, now) {
  const pad = (value) => String(value).padStart(2, '0')
  const base = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const taken = new Set(items.map((entry) => (entry !== null && typeof entry === 'object' ? entry.id : undefined)))
  if (!taken.has(base)) return base
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base}-${suffix}`
    if (!taken.has(candidate)) return candidate
  }
  throw new Error(prompt('errors.tooManyInSecond'))
}

/** 先确认每张照片都在，再复制进收藏库，最后返回写进档案的条目。 */
async function storePhotos({ cwd, libraryRoot, id, index }) {
  const entries = []
  const copies = []
  for (let position = 0; position < index.length; position += 1) {
    const photo = asRecord(index[position])
    const part = requiredText(photo.part, format(prompt('labels.photos.part'), { index: position }))
    const description = requiredText(photo.description, format(prompt('labels.photos.description'), { index: position }))
    const given = requiredText(photo.path, format(prompt('labels.photos.path'), { index: position }))
    const sourcePath = isAbsolute(given) ? given : resolve(cwd, given)
    let info
    try {
      info = await stat(sourcePath)
    } catch {
      throw new Error(format(prompt('errors.photoMissing'), { given, resolved: sourcePath }))
    }
    if (!info.isFile()) throw new Error(format(prompt('errors.photoNotFile'), { given }))
    const extension = await imageExtension(sourcePath)
    const filename = `${String(position + 1).padStart(2, '0')}-${slug(part)}${extension}`
    copies.push({ sourcePath, filename })
    entries.push({ order: position + 1, part, description, file: `photos/${id}/${filename}` })
  }

  const directory = join(libraryRoot, 'photos', id)
  if (copies.length > 0) {
    await mkdir(directory, { recursive: true })
    for (const copy of copies) {
      const target = join(directory, copy.filename)
      // 更新旧档案时，模型常把 collection.json 里的照片路径原样传回来，
      // 那时源就是目标：拷自己只会白跑一趟，在 Windows 上还会直接失败。
      if (samePath(copy.sourcePath, target)) continue
      await copyIntoTarget(copy.sourcePath, target)
    }
  }
  return { entries, directory }
}

/** 判断「源就是目标」。Windows 的路径不分大小写，按它的规矩比。 */
function samePath(a, b) {
  const left = resolve(a)
  const right = resolve(b)
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
}

/**
 * 把一张照片复制进收藏库，绕开 Windows 复制只读文件的坑。
 *
 * 附件库里的对象（`attachments/v1/objects/<sha>`）是只读的，而 `CopyFileEx`
 * 把源文件属性一起复制，所以第一次存档就把照片存成了只读；等到更新同一件藏品，
 * 目标已存在且只读，覆盖会失败，Node 报成 `EPERM: operation not permitted, copyfile`
 * （`CopyFile` 拒绝覆盖带 FILE_ATTRIBUTE_READONLY 的目标）。
 * 所以：遇到 EPERM 先去掉目标只读位再重试，复制完再把目标改回可写，
 * 免得这份档案下次更新又踩同一个坑。
 * @param source - 源图片绝对路径。
 * @param target - 收藏库里的目标绝对路径。
 */
async function copyIntoTarget(source, target) {
  try {
    await copyFile(source, target)
  } catch (error) {
    if (error === null || typeof error !== 'object' || error.code !== 'EPERM') throw error
    // 清只读失败就交给重试去报真正的错，不在这里吞掉原因。
    await chmod(target, 0o666).catch(() => {})
    await copyFile(source, target)
  }
  if (process.platform === 'win32') await chmod(target, 0o644).catch(() => {})
}

/** 部位名 → 安全的文件名片段（保留中文，去掉路径分隔符和控制字符）。 */
function slug(text) {
  const cleaned = text.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 24)
  return cleaned === '' ? 'photo' : cleaned
}

/**
 * 决定照片存成哪个后缀。会话里上传的图片在附件库里是**没有扩展名**的
 * 规范化副本（`attachments/v1/objects/<sha>`），光看路径会猜错格式，
 * 所以先看文件头的魔数，再看原文件后缀。
 * @param path - 源图片的绝对路径。
 * @returns 以点开头的扩展名，兜底 `.jpg`。
 */
async function imageExtension(path) {
  const fromName = extname(path).toLowerCase()
  const fallback = PHOTO_EXTENSIONS.has(fromName) ? fromName : '.jpg'

  let head
  try {
    const handle = await open(path, 'r')
    try {
      const buffer = new Uint8Array(16)
      const { bytesRead } = await handle.read(buffer, 0, 16, 0)
      head = buffer.subarray(0, bytesRead)
    } finally {
      await handle.close()
    }
  } catch {
    return fallback
  }

  const starts = (...bytes) => bytes.every((byte, index) => head[index] === byte)
  const ascii = (from, to) => String.fromCharCode(...head.subarray(from, to))
  if (starts(0x89, 0x50, 0x4e, 0x47)) return '.png'
  if (starts(0xff, 0xd8, 0xff)) return '.jpg'
  if (starts(0x47, 0x49, 0x46)) return '.gif'
  if (starts(0x42, 0x4d)) return '.bmp'
  if (head.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return '.webp'
  if (head.length >= 12 && ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12)
    if (brand === 'avif' || brand === 'avis') return '.avif'
    if (brand === 'heic' || brand === 'heix' || brand === 'mif1') return '.heic'
  }
  return fallback
}

/** 金额：容忍「¥300」「300元」；「暂无」之类记成 null。币种恒为人民币，不入档。 */
function optionalAmount(value, label) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(format(prompt('errors.amountNotNumber'), { label }))
    return value
  }
  if (typeof value === 'string') {
    const normalized = value.replace(/[^\d.-]/g, '')
    if (normalized === '' || normalized === '.') return null
    const parsed = Number(normalized)
    if (!Number.isFinite(parsed)) throw new Error(format(prompt('errors.amountUnreadable'), { label, value }))
    return parsed
  }
  throw new Error(format(prompt('errors.amountType'), { label }))
}
