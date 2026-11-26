/**
 * 照片落盘：路径候选、部位名成文件名、按文件头定后缀、把副本放进收藏库。
 *
 * save_collection 与 add_photo 共用同一套（同一件藏品里不会出现「01-胸部.png」和
 * 「1-胸部.png」两种排法），read_image 也复用同样的路径候选，所以「照片放哪、怎么找、
 * 叫什么」只在下面定一次。
 *
 * 文本不写死在代码里：找不到图、复制失败时说什么由调用方从自己的字典取
 * （照片公用话术在 ./photos.prompts.mjs，两个存档工具都并了它）。改措辞去那本词典，
 * 别改这里；这里只保证「同样的故障，几个工具都认得」。
 */
import { chmod, copyFile, mkdir, open, stat } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, resolve } from 'node:path'
import { format } from './prompt.mjs'
import { describe } from './values.mjs'

/** 认得的图片扩展名；别的格式按 .jpg 存，只影响文件名后缀。 */
export const PHOTO_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.heic', '.avif'])

/** 同一个序号撞名时最多往后排几个后缀；正常档案不会走到这里。 */
const MAX_NAME_ATTEMPTS = 100

/**
 * 部位名 → 安全的文件名片段（保留中文，去掉路径分隔符和控制字符）。
 * @param text - 模型给的部位名，例如「正面上半身」「左腋下」。
 * @returns 文件名片段；清洗后为空时是 `photo`。
 */
export function slug(text) {
  const cleaned = text.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 24)
  return cleaned === '' ? 'photo' : cleaned
}

/**
 * 一张照片在收藏库里的文件名：`01-正面上半身.png`。
 * 序号补两位，档案里 photos[].file 与磁盘上的名字都按这个排。
 * @param order - 这张在藏品里的序号（1 起）。
 * @param part - 部位名。
 * @param extension - 以点开头的扩展名，见 imageExtension()。
 * @returns 文件名（不含目录）。
 */
export function photoFilename(order, part, extension) {
  return `${String(order).padStart(2, '0')}-${slug(part)}${extension}`
}

/**
 * 决定照片存成哪个后缀。会话里上传的图片在附件库里是**没有扩展名**的
 * 规范化副本（`attachments/v1/objects/<sha>`），光看路径会猜错格式，
 * 所以先看文件头的魔数，再看原文件后缀。
 * @param path - 源图片的绝对路径。
 * @returns 以点开头的扩展名，兜底 `.jpg`。
 */
export async function imageExtension(path) {
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

/**
 * 判断「源就是目标」。Windows 的路径不分大小写，按它的规矩比。
 * @param a - 一个绝对路径。
 * @param b - 另一个绝对路径。
 * @returns 两条路径指向同一个文件时为 true。
 */
export function samePath(a, b) {
  const left = resolve(a)
  const right = resolve(b)
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
}

/**
 * 一种写法展开成按优先级排的候选绝对路径（去重）。
 *
 * 顺序照顾的是「模型手里通常有什么」：消息里上传的图是绝对只读路径；偶尔带着
 * `collection/` 前缀抄来，那就是工作区相对路径；档案里 `photos[].file` 的值是
 * 收藏库相对路径；省掉 `photos/` 前缀的写法也认（与 read_image 一致）。
 *
 * 存档（save_collection / add_photo）先在工作区找，读图（read_image）先在收藏库根找；
 * 两种顺序只在同一个相对路径于两处都存在时才有区别。
 *
 * Windows 上模型常把 `/` 和 `\` 混着写，这里只归一化分隔符，不碰盘符。
 * @param given - 模型传进来的图片路径。
 * @param options - `libraryRoot` 收藏库根目录；`cwd` 会话工作区；`prefer` 先找哪边
 *   （`'workspace'` 或 `'library'`，默认 `'workspace'`）。
 * @returns 要依次尝试的绝对路径。
 */
export function photoCandidates(given, { libraryRoot, cwd, prefer = 'workspace' }) {
  if (isAbsolute(given)) return [resolve(given)]
  const normalized = given.replace(/\\/g, '/').replace(/^\.\/+/, '')
  const inRoots = [resolve(cwd, normalized), resolve(libraryRoot, normalized)]
  if (prefer === 'library') inRoots.reverse()
  return [...new Set([...inRoots, resolve(libraryRoot, 'photos', normalized)])]
}

/** stat 一个候选路径：不存在、读不了都当没命中。 */
async function candidateInfo(path) {
  return await stat(path).catch(() => undefined)
}

/**
 * 依次 stat 候选路径，返回第一个**普通文件**；都不存在时返回 undefined。
 * 目录不算命中：把「photos/<id>」当图片传是常见手误。
 * @param candidates - 候选绝对路径，按优先级排好。
 * @returns `{ path, size }`，或 undefined。
 */
export async function firstFile(candidates) {
  for (const candidate of candidates) {
    const info = await candidateInfo(candidate)
    if (info !== undefined && info.isFile()) return { path: candidate, size: info.size }
  }
  return undefined
}

/**
 * 找出模型真正指着的那张图：按候选顺序 stat，第一个普通文件胜出。
 *
 * 都找不到时报错，并把试过的位置列给模型，它下一轮就能把路径改对。候选路径存在但
 * 不是普通文件（目录）时单独说一句，免得模型以为是自己路径写错了。
 * @param given - 模型传进来的图片路径。
 * @param options - photoCandidates 的三个选项，外加 `prompt`（调用方字典的取值函数）。
 * @returns `{ path, size }`：命中的绝对路径与字节数。
 */
export async function requirePhotoSource(given, options) {
  const candidates = photoCandidates(given, options)
  let notFile = null
  for (const candidate of candidates) {
    const info = await candidateInfo(candidate)
    if (info === undefined) continue
    if (info.isFile()) return { path: candidate, size: info.size }
    if (notFile === null) notFile = candidate
  }
  if (notFile !== null) {
    throw new Error(format(options.prompt('photos.errors.notFile'), { given, path: notFile }))
  }
  throw new Error(format(options.prompt('photos.errors.missing'), {
    given,
    tried: candidates.map((path) => `  ${path}`).join('\n'),
  }))
}

/**
 * 照片序号接在现有照片后面；档案里的 order 缺了或乱了也至少排在最后一张之后。
 * @param photos - 那件藏品在档案里的 photos 数组。
 * @returns 这张的序号（1 起）。
 */
export function nextOrder(photos) {
  let highest = 0
  for (const entry of photos) {
    const value = entry !== null && typeof entry === 'object' ? entry.order : undefined
    if (typeof value === 'number' && Number.isFinite(value) && value > highest) highest = Math.floor(value)
  }
  return Math.max(highest, photos.length) + 1
}

/**
 * 定下这张照片在磁盘上的文件名，并返回配套的绝对路径。
 *
 * 正常情况就是 `NN-<部位>.<ext>`；只有同序号同名（手改过档案、或从别处拷了同名图）
 * 才在后面加 `-2`、`-3`。源文件恰好就是这个目标时直接返回，不必再复制。
 * @param options - `directory`（`<收藏库根>/photos/<id>`）、`order`、`part`、
 *   `extension`、`source`（源图片绝对路径）、`prompt`（调用方字典）。
 * @returns `{ filename, file }`：文件名与目标绝对路径。
 */
export async function freePhotoFilename({ directory, order, part, extension, source, prompt }) {
  const base = photoFilename(order, part, extension)
  const dot = base.lastIndexOf('.')
  const stem = base.slice(0, dot)
  const tail = base.slice(dot)
  for (let attempt = 1; attempt <= MAX_NAME_ATTEMPTS; attempt += 1) {
    const filename = attempt === 1 ? base : `${stem}-${attempt}${tail}`
    const file = join(directory, filename)
    const existing = await candidateInfo(file)
    if (existing === undefined || samePath(source, file)) return { filename, file }
  }
  throw new Error(format(prompt('photos.errors.tooManyFiles'), { directory }))
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
export async function copyIntoTarget(source, target) {
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

/**
 * 把照片放进收藏库：建目录、跳过「源就是目标」、复制失败时按字典报错。
 *
 * save_collection 与 add_photo 都走这里，所以复制这一步的行为（含 Windows 只读坑）
 * 只有一份。
 * @param options - `source` 源图片绝对路径；`target` 目标绝对路径；`given` 模型传的
 *   原话（报错里回显用）；`prompt` 调用方字典的取值函数。
 */
export async function copyPhotoInto({ source, target, given, prompt }) {
  // 更新旧档案时，模型常把 collection.json 里的照片路径原样传回来，
  // 那时源就是目标：拷自己只会白跑一趟，在 Windows 上还会直接失败。
  if (samePath(source, target)) return
  await mkdir(dirname(target), { recursive: true })
  try {
    await copyIntoTarget(source, target)
  } catch (error) {
    throw new Error(format(prompt('photos.errors.copyFailed'), { given, message: describe(error) }))
  }
}
