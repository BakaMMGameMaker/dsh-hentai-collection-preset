/**
 * tool-collection-list — 列出收藏库里每件藏品的名字和 id。
 *
 * 只读、无参数、只返回 `{ name, id }` 两项：模型拿它挑「要改哪一件」，
 * 或者回答「我都收藏了什么」。完整档案仍由 save_collection 写入，
 * 读取路径与报错分类都在 ../lib/archive.mjs。
 *
 * 一个工具一个目录：这里只放 list_collection 的行为，能发给模型的每一句话
 * 都在同目录的 prompts.mjs 里。公用的文本无关函数在 ../lib/。
 */
import { archivePathsOf, readArchive, workspaceOf } from '../lib/archive.mjs'
import { createPrompt, format } from '../lib/prompt.mjs'
import { prompts } from './prompts.mjs'

/** Stable Loader identity. */
export const name = 'tool-collection-list'

export const inject = ['tools']

/** 本工具的词典。改措辞只改 prompts.mjs。 */
const prompt = createPrompt(prompts, 'list-collection/prompts.mjs')

/**
 * 注册 `list_collection`。
 * @param ctx - agent scope 的 services。
 * @param config - `libraryDir`：收藏库相对工作区的目录名，必须和 save_collection 那行一致。
 */
export function apply(ctx, config) {
  ctx.tools.register({
    name: 'list_collection',
    description: prompt('list_collection.description'),
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
    output: {
      // 只有名字和 id：调用方要的就是「挑哪一件」，别把整份档案倒给模型。
      schema: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            id: { type: 'string' },
          },
          required: ['name', 'id'],
        },
      },
      render: (_args, items) => [{
        type: 'text',
        text: items.length === 0
          ? prompt('result.empty')
          : items.map((item) => format(prompt('result.line'), item)).join('\n'),
      }],
    },
    async execute(_args, exec) {
      const cwd = workspaceOf(exec)
      const { archivePath } = archivePathsOf(config, cwd)
      const library = await readArchive(archivePath, prompt)
      const listed = []
      for (const entry of library.items) {
        if (entry === null || typeof entry !== 'object') continue
        // 没有 id 的条目挑不了、也覆盖不了，列出来只会误导；手改坏的档案按这条跳过。
        const id = entry.id === undefined || entry.id === null ? '' : String(entry.id).trim()
        if (id === '') continue
        const itemName = typeof entry.name === 'string' && entry.name.trim() !== '' ? entry.name.trim() : prompt('words.nameless')
        listed.push({ name: itemName, id })
      }
      return listed
    },
  })
}
