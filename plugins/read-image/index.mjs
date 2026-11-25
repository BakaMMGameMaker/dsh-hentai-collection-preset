/**
 * tool-collection-read-image — 让藏家看一眼收藏库里的照片。
 *
 * 和宿主包（`@deepseek-ai/dsh-tool-fs`）的 `read_image` 不一样：那边的
 * `file_path` 由 `ctx.fs` 按**会话工作区**解析，档案里 `photos/<id>/…` 这种
 * 相对收藏库根目录的写法要先补一层 `collection/` 才找得到。这里的 `path`
 * 直接相对收藏库根目录（工作区下的 `collection/`，目录布局见 ../lib/archive.mjs）
 * 解析，所以 `collection.json` 里 `photos[].file` 的值可以原样传进来：
 *
 *   read_image("photos/20261124-221606/02-正面上半身.png")
 *
 * 三种写法都认（按顺序试，第一个存在的文件胜出）：
 *   1. 绝对路径（消息里那张图给你的只读路径）
 *   2. <收藏库根>/<path>
 *   3. <工作区>/<path>                     偶尔模型会带着 collection/ 前缀抄
 *   4. <收藏库根>/photos/<path>            省掉 photos/ 前缀
 *
 * 图片本体不进工具返回值：只登记成附件引用（`ctx.attachments.saveImage`），
 * `output.render` 再把引用拼成 image 内容块。真正取字节、按当前模型路由缩放
 * 是附件管线的活，所以任何尺寸的图都只要登记一次。
 *
 * 一个工具一个目录：这里只放 read_image 的行为，能发给模型的每一句话
 * 都在同目录的 prompts.mjs 里。公用的文本无关函数在 ../lib/。
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { archivePathsOf, workspaceOf } from '../lib/archive.mjs'
import { createPrompt, format } from '../lib/prompt.mjs'
import { describe, optionalText } from '../lib/values.mjs'
import { prompts } from './prompts.mjs'

/** Stable Loader identity. */
export const name = 'tool-collection-read-image'

export const inject = ['tools']

/** 本工具的词典。改措辞只改 prompts.mjs。 */
const prompt = createPrompt(prompts, 'read-image/prompts.mjs')

/** 报错里最多列几张现有照片：够模型改对路径，又不会把一份档案倒进对话。 */
const KNOWN_PHOTO_LIMIT = 20

/**
 * 注册 `read_image`。
 * @param ctx - agent scope 的 services。
 * @param config - `libraryDir`：收藏库相对工作区的目录名，必须和另外几个工具那行一致。
 */
export function apply(ctx, config) {
  // 没有附件服务就没有 image 内容块可放，工具不出现（和宿主包 read_image 同一条件）。
  ctx.inject(['attachments'], (imageCtx) => {
    imageCtx.tools.register({
      name: 'read_image',
      description: prompt('read_image.description'),
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', description: prompt('read_image.parameters.path') },
        },
        required: ['path'],
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            // 回显给模型的路径：收藏库里的照片显示成 `photos/<id>/…`，库外的显示绝对路径。
            path: { type: 'string' },
            // 附件引用的五个字段，render 要拼回 image 内容块。
            attachmentId: { type: 'string' },
            mediaType: { type: 'string' },
            bytes: { type: 'integer' },
            width: { type: 'integer' },
            height: { type: 'integer' },
            name: { type: 'string' },
            // 附件服务把大图缩小时才有：原图尺寸，单独摊平成两个数字。
            originalWidth: { type: 'integer' },
            originalHeight: { type: 'integer' },
          },
          required: ['path', 'attachmentId', 'mediaType', 'bytes', 'width', 'height'],
        },
        render: (_args, value) => imageContent(value),
      },
      async execute(args, exec) {
        const given = optionalText(args === null || typeof args !== 'object' ? undefined : args.path)
        if (given === null) throw new Error(prompt('errors.emptyPath'))
        const cwd = workspaceOf(exec)
        const { libraryRoot } = archivePathsOf(config, cwd)
        const candidates = candidatePaths(given, libraryRoot, cwd)
        const file = await firstFile(candidates)
        if (file === undefined) throw await notFoundError(given, candidates, libraryRoot)

        const attachments = imageCtx.get('attachments')
        if (attachments === undefined) throw new Error(prompt('errors.noAttachments'))
        const limit = attachments.imageLimits.maxImageBytes
        if (file.size > limit) {
          throw new Error(format(prompt('errors.tooLarge'), { path: file.path, bytes: file.size, limit }))
        }

        const data = new Uint8Array(await readFile(file.path))
        // 按文件头认格式，不看后缀：会话里上传的图片是**没有扩展名**的规范化副本，
        // 档案里的旧照片也可能被改过名，只有字节说了算。
        const mediaType = sniffMediaType(data)
        if (mediaType === null) {
          throw new Error(format(prompt('errors.unsupportedFormat'), { path: file.path }))
        }
        if (!attachments.imageLimits.mediaTypes.includes(mediaType)) {
          throw new Error(format(prompt('errors.typeNotAccepted'), { mediaType }))
        }

        let ref
        try {
          // 名字只是展示用；附件服务会剥掉路径、按字节校验格式，并把大图缩成路由能吃的尺寸。
          ref = await attachments.saveImage({ data, mediaType, name: basename(file.path) })
        } catch (error) {
          throw new Error(format(prompt('errors.saveFailed'), { path: file.path, message: describe(error) }))
        }

        return {
          path: displayPathOf(file.path, libraryRoot),
          attachmentId: ref.attachmentId,
          mediaType: ref.mediaType,
          bytes: ref.bytes,
          width: ref.width,
          height: ref.height,
          ...(ref.name === undefined ? {} : { name: ref.name }),
          ...(ref.originalDimensions === undefined
            ? {}
            : { originalWidth: ref.originalDimensions.width, originalHeight: ref.originalDimensions.height }),
        }
      },
    })
  })
}

/**
 * 把一次成功的读取拼成两个内容块：一行说明 + 图片本体。
 * 图片块只带附件引用，字节由附件管线在组请求时取。
 * @param value - `execute` 返回的图片信息。
 * @returns 要发给模型的内容块。
 */
function imageContent(value) {
  const scaled = value.originalWidth === undefined
    ? ''
    : format(prompt('result.scaled'), { width: value.originalWidth, height: value.originalHeight })
  const envelope = format(prompt('result.envelope'), {
    path: value.path,
    mediaType: value.mediaType,
    width: value.width,
    height: value.height,
    bytes: value.bytes,
    scaled,
  })
  return [
    { type: 'text', text: envelope },
    {
      type: 'image',
      attachment: {
        attachmentId: value.attachmentId,
        mediaType: value.mediaType,
        bytes: value.bytes,
        width: value.width,
        height: value.height,
        ...(value.name === undefined ? {} : { name: value.name }),
        ...(value.originalWidth === undefined
          ? {}
          : { originalDimensions: { width: value.originalWidth, height: value.originalHeight } }),
      },
    },
  ]
}

/** 认得的四种图片格式的文件头；附件服务只收这四种。 */
function sniffMediaType(data) {
  const at = (offset, expected) => expected.every((byte, index) => data[offset + index] === byte)
  const ascii = (offset, text) => {
    for (let index = 0; index < text.length; index += 1) {
      if (data[offset + index] !== text.charCodeAt(index)) return false
    }
    return true
  }
  if (at(0, [0x89, 0x50, 0x4e, 0x47])) return 'image/png'
  if (at(0, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (ascii(0, 'GIF87a') || ascii(0, 'GIF89a')) return 'image/gif'
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp'
  return null
}

/**
 * 一种写法展开成按优先级排的候选绝对路径（去重）。
 * @param given - 模型传进来的 path。
 * @param libraryRoot - 收藏库根目录绝对路径。
 * @param cwd - 会话工作区绝对路径。
 * @returns 要依次尝试的绝对路径。
 */
function candidatePaths(given, libraryRoot, cwd) {
  if (isAbsolute(given)) return [resolve(given)]
  // Windows 上模型常把 `/` 和 `\` 混着写；这里只归一化分隔符，不碰盘符。
  const normalized = given.replace(/\\/g, '/').replace(/^\.\/+/, '')
  const candidates = [
    resolve(libraryRoot, normalized),
    resolve(cwd, normalized),
    resolve(libraryRoot, 'photos', normalized),
  ]
  return [...new Set(candidates)]
}

/**
 * 依次 stat 候选路径，返回第一个**普通文件**；都不存在时返回 undefined。
 * 目录不算命中：把「photos/<id>」当图片读是常见手误，交给 notFound 的清单去纠正。
 * @param candidates - 候选绝对路径，按优先级排好。
 * @returns 命中的路径和字节数，或 undefined。
 */
async function firstFile(candidates) {
  for (const candidate of candidates) {
    const info = await stat(candidate).catch(() => undefined)
    if (info !== undefined && info.isFile()) return { path: candidate, size: info.size }
  }
  return undefined
}

/**
 * 报错文本：模型看到的路径写法和找过的位置，外加收藏库里真实存在的照片（最多 20 张），
 * 让它下一轮直接把路径改对，不用问用户。
 * @param given - 模型传进来的 path。
 * @param candidates - 试过的绝对路径。
 * @param libraryRoot - 收藏库根目录。
 * @returns 带上下文的 Error。
 */
async function notFoundError(given, candidates, libraryRoot) {
  const known = await listPhotoPaths(libraryRoot, itemIdOf(given), KNOWN_PHOTO_LIMIT)
  const knownText = known.length === 0
    ? prompt('errors.libraryEmpty')
    : format(prompt('errors.libraryPhotos'), { paths: known.map((path) => `  ${path}`).join('\n') })
  return new Error(format(prompt('errors.notFound'), {
    given,
    tried: candidates.map((path) => `  ${path}`).join('\n'),
    library: libraryRoot,
    known: knownText,
  }))
}

/**
 * 从模型给的路径里猜「它想找哪一件」：`photos/<id>/…` 取第二段，`<id>/…` 取第一段。
 * 只用于把报错清单里这件藏品的照片排到前面，猜不出来就是 null。
 * @param given - 模型传进来的 path（相对路径）。
 * @returns 可能的藏品 id，或 null。
 */
function itemIdOf(given) {
  const parts = given.replace(/\\/g, '/').replace(/^\.\/+/, '').split('/').filter((part) => part !== '')
  if (parts.length < 2) return null
  return parts[0] === 'photos' ? parts[1] : parts[0]
}

/**
 * 列收藏库里的照片路径（相对收藏库根目录），最多 `limit` 张。
 * 猜中的那件藏品排最前面；读不了 photos/ 就返回空数组。
 * @param libraryRoot - 收藏库根目录。
 * @param hintId - 优先列的藏品 id，或 null。
 * @param limit - 最多返回几条。
 * @returns 形如 `photos/<id>/<文件名>` 的路径。
 */
async function listPhotoPaths(libraryRoot, hintId, limit) {
  const photosRoot = join(libraryRoot, 'photos')
  const directories = await childDirectories(photosRoot)
  if (hintId !== null && directories.includes(hintId)) {
    directories.splice(directories.indexOf(hintId), 1)
    directories.unshift(hintId)
  }
  const paths = []
  for (const directory of directories) {
    for (const file of await childFiles(join(photosRoot, directory))) {
      paths.push(`photos/${directory}/${file}`)
      if (paths.length >= limit) return paths
    }
  }
  return paths
}

/** 子目录名（升序）；不存在或读不了就是空数组。 */
async function childDirectories(path) {
  return (await childEntries(path)).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
}

/** 子文件名（升序）；不存在或读不了就是空数组。 */
async function childFiles(path) {
  return (await childEntries(path)).filter((entry) => entry.isFile()).map((entry) => entry.name).sort()
}

/** readdir 的容错包装：报错清单是辅助信息，不能因为它再抛一次。 */
async function childEntries(path) {
  try {
    return await readdir(path, { withFileTypes: true })
  } catch {
    return []
  }
}

/**
 * 回显给模型的路径：收藏库里的显示成 `photos/<id>/…`（和档案里 `photos[].file` 一致），
 * 库外的（比如消息里上传的只读副本）显示绝对路径。
 * @param filePath - 命中文件的绝对路径。
 * @param libraryRoot - 收藏库根目录。
 * @returns 展示用路径，Windows 分隔符统一成 `/`。
 */
function displayPathOf(filePath, libraryRoot) {
  const rel = relative(libraryRoot, filePath)
  if (rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)) return rel.split(sep).join('/')
  return filePath
}
