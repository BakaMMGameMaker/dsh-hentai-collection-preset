/**
 * 照片落盘：部位名成文件名、按文件头定后缀、把副本放进收藏库。
 * save_collection 与 add_photo 共用，保证两个工具写出来的文件名、副本行为一模一样
 * （同一件藏品里不会出现「01-胸部.png」和「1-胸部.png」两种排法）。
 *
 * 这个文件不发任何文本：找不到图、复制失败时说什么由调用方从自己的
 * prompts.mjs 取。所以改措辞去工具的字典，别改这里。
 */
import { chmod, copyFile, open } from 'node:fs/promises'
import { extname, resolve } from 'node:path'

/** 认得的图片扩展名；别的格式按 .jpg 存，只影响文件名后缀。 */
export const PHOTO_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.heic', '.avif'])

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
