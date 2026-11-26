/**
 * tool-collection-add-photo — 往一件已经存档的藏品里追加一张照片。
 *
 * 为什么要单独一个工具：save_collection 的 photos 是整份档案的一部分，只想补一张图
 * 也得把名字、状态、价格、时间全部重抄一遍，抄漏一项就把旧档案改坏。这里只做一件事：
 * 按 id 或 name 挑中一件（../lib/lookup.mjs，与 read_collection 同一套），把图复制进
 * `photos/<id>/NN-<部位>.<ext>`，往 photos 数组末尾加一条，其余字段一个字都不碰，
 * 只更新 updatedAt。
 *
 *   <cwd>/collection/collection.json      总档案，只动被挑中那件的 photos / updatedAt
 *   <cwd>/collection/photos/<itemId>/     新图复制进来，序号接在现有照片后面
 *
 * 找图、序号、文件名避让、复制落盘都在 ../lib/photos.mjs，与 save_collection 共用，
 * 所以两个工具写出来的照片不会出现两种排法。这里只放 add_photo 的行为；能发给模型的
 * 每一句话在同目录的 prompts.mjs，照片字段与照片落盘的说法是公用词
 * （../lib/photos.prompts.mjs，save_collection 也并了同一本）。
 */
import { join } from 'node:path'
import { ARCHIVE_VERSION, archivePathsOf, readArchive, workspaceOf, writeArchive } from '../lib/archive.mjs'
import { itemId } from '../lib/items.mjs'
import { pickItem } from '../lib/lookup.mjs'
import { copyPhotoInto, freePhotoFilename, imageExtension, nextOrder, requirePhotoSource } from '../lib/photos.mjs'
import { createPrompt, format, requiredText } from '../lib/prompt.mjs'
import { asRecord, optionalText } from '../lib/values.mjs'
import { prompts } from './prompts.mjs'

/** Stable Loader identity. */
export const name = 'tool-collection-add-photo'

export const inject = ['tools']

/** 本工具的词典。改措辞只改 prompts.mjs（公用那几句在 ../lib/*.prompts.mjs）。 */
const prompt = createPrompt(prompts, 'add-photo/prompts.mjs')

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
        // id / name 的说法与 read_collection 是同一份（../lib/archive.prompts.mjs），
        // part / description / path 的说法与 save_collection 是同一份
        // （../lib/photos.prompts.mjs）：模型在两个工具里看到的是同一段话。
        id: { type: 'string', description: prompt('items.parameters.id') },
        name: { type: 'string', description: prompt('items.parameters.name') },
        part: { type: 'string', description: prompt('photos.parameters.part') },
        description: { type: 'string', description: prompt('photos.parameters.description') },
        path: { type: 'string', description: prompt('photos.parameters.path') },
      },
      required: ['part', 'description', 'path'],
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
      // （pickItem 也会拦这一条，这里先拦是为了让缺 key 的报错排在缺字段之前。）
      if (wantedId === null && wantedName === null) throw new Error(prompt('errors.noKey'))
      const part = requiredText(prompt, input.part, prompt('photos.labels.part'))
      const description = requiredText(prompt, input.description, prompt('photos.labels.description'))
      const given = requiredText(prompt, input.path, prompt('photos.labels.path'))

      const cwd = workspaceOf(exec)
      const { libraryRoot, archivePath } = archivePathsOf(config, cwd)
      const library = await readArchive(archivePath, prompt)

      const item = pickItem(library.items, { id: wantedId, name: wantedName }, prompt)
      const id = itemId(item)
      if (id === null) {
        throw new Error(format(prompt('errors.itemWithoutId'), { name: optionalText(item.name) ?? prompt('words.nameless') }))
      }

      const photos = Array.isArray(item.photos) ? item.photos : []
      const order = nextOrder(photos)
      const directory = join(libraryRoot, 'photos', id)
      const source = await requirePhotoSource(given, { libraryRoot, cwd, prompt })
      const extension = await imageExtension(source.path)
      const target = await freePhotoFilename({
        directory,
        order,
        part,
        extension,
        source: source.path,
        prompt,
      })
      await copyPhotoInto({ source: source.path, target: target.file, given, prompt })

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
