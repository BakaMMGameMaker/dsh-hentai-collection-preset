/**
 * tool-collection-list — 列出收藏库里每件藏品的名字、id 和状态。
 *
 * 只读、无参数、每件藏品一行：`名字：“…”，id：…，状态：…`。模型拿它挑
 * 「要改哪一件」，或者回答「我都收藏了什么」。完整档案仍由 save_collection 写入，
 * 读取路径与报错分类都在 ../lib/archive.mjs。
 *
 * 一个工具一个目录：这里只放 list_collection 的行为。能发给模型的每一句话在同目录的
 * prompts.mjs 里，空库与「未命名」这类公用词从 ../lib/archive.prompts.mjs 并进来。
 */
import { archivePathsOf, readArchive, workspaceOf } from '../lib/archive.mjs'
import { itemId } from '../lib/items.mjs'
import { createPrompt, format } from '../lib/prompt.mjs'
import { optionalText } from '../lib/values.mjs'
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
      // 只给「挑哪一件」要看的三项：名字、id、状态，别把整份档案倒给模型。
      schema: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            id: { type: 'string' },
            status: { type: 'string' },
          },
          required: ['name', 'id', 'status'],
        },
      },
      render: (_args, items) => [{
        type: 'text',
        text: items.length === 0
          ? prompt('words.emptyLibrary')
          : items.map((item) => format(prompt('result.line'), item)).join('\n'),
      }],
    },
    async execute(_args, exec) {
      const cwd = workspaceOf(exec)
      const { archivePath } = archivePathsOf(config, cwd)
      const library = await readArchive(archivePath, prompt)
      const listed = []
      for (const entry of library.items) {
        // 没有 id 的条目挑不了、也覆盖不了，列出来只会误导；手改坏的档案按这条跳过。
        const id = itemId(entry)
        if (id === null) continue
        const itemName = optionalText(entry.name) ?? prompt('words.nameless')
        const status = optionalText(entry.status) ?? prompt('words.noStatus')
        listed.push({ name: itemName, id, status })
      }
      return listed
    },
  })
}
