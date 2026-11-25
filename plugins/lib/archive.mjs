/**
 * 收藏库的磁盘布局与读写，save_collection 和 list_collection 共用。
 *
 *   <cwd>/<libraryDir>/collection.json        总档案，一件藏品一条记录
 *   <cwd>/<libraryDir>/photos/<itemId>/       照片
 *
 * 这个文件不发任何文本：读档案失败时用的三条消息由调用方从自己的
 * prompts.mjs 取，通过 `prompt` 参数传进来。所以改措辞去工具的字典，
 * 别改这里；这里只保证「同样的故障，两边都认得」。
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { format } from './prompt.mjs'
import { describe } from './values.mjs'

/** 没配 `libraryDir` 时收藏库落在工作区的哪个子目录。 */
export const DEFAULT_LIBRARY_DIR = 'collection'

export const ARCHIVE_FILE = 'collection.json'

export const ARCHIVE_VERSION = 1

/** exec → 工作区绝对路径；拿不到时退回 host 进程的 cwd。 */
export function workspaceOf(exec) {
  const header = exec !== null && typeof exec === 'object' && exec.agent !== undefined ? exec.agent.session?.header : undefined
  const cwd = header !== null && typeof header === 'object' ? header.cwd : undefined
  return typeof cwd === 'string' && cwd !== '' ? cwd : process.cwd()
}

/**
 * row 的 config → 收藏库的两个绝对路径。
 * @param config - 插件 row 的配置，只认 `libraryDir`。
 * @param cwd - 工作区绝对路径。
 * @returns `libraryRoot`（收藏库根目录）与 `archivePath`（总档案）。
 */
export function archivePathsOf(config, cwd) {
  const configured = config !== null && typeof config === 'object' ? config.libraryDir : undefined
  const configuredDir = typeof configured === 'string' ? configured.trim() : ''
  const dir = configuredDir === '' ? DEFAULT_LIBRARY_DIR : configuredDir
  const libraryRoot = isAbsolute(dir) ? dir : join(cwd, dir)
  return { libraryRoot, archivePath: join(libraryRoot, ARCHIVE_FILE) }
}

/**
 * 读取总档案。文件不存在是正常的「还是空的」；内容坏了则抛错，
 * 让调用方决定是拒绝写入还是拒绝列出。
 *
 * 需要调用方的字典提供三条键：
 *   errors.readArchive    读文件本身失败（ENOENT 以外的原因）
 *   errors.archiveNotJson 内容不是合法 JSON
 *   errors.archiveShape   缺 items 数组
 * @param archivePath - 总档案绝对路径。
 * @param prompt - 调用方字典的取值函数。
 * @returns 档案对象，`items` 一定存在。
 */
export async function readArchive(archivePath, prompt) {
  let raw
  try {
    raw = await readFile(archivePath, 'utf8')
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.code === 'ENOENT') {
      return { version: ARCHIVE_VERSION, items: [] }
    }
    throw new Error(format(prompt('errors.readArchive'), { path: archivePath, message: describe(error) }))
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(format(prompt('errors.archiveNotJson'), { path: archivePath }))
  }
  if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.items)) {
    throw new Error(format(prompt('errors.archiveShape'), { path: archivePath }))
  }
  return parsed
}

/** 原子替换总档案：先写临时文件再 rename。 */
export async function writeArchive(archivePath, data) {
  await mkdir(dirname(archivePath), { recursive: true })
  const temp = `${archivePath}.${process.pid}.tmp`
  await writeFile(temp, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  await rename(temp, archivePath)
}
