/**
 * 词典读取器：每个工具目录下的 prompts.mjs 都通过这里取值。
 *
 * 约定：`{名字}` 是运行时填进去的占位符，其余文字原样发给模型。
 * 这个文件本身不发任何文本，也不该出现中文——词都在各工具的字典里。
 */

/**
 * 用一本字典造一个 `prompt('点分键')`。
 * 键写错时立刻抛错，而不是返回 undefined 让 description 悄悄变空——加载期就能发现漏词。
 * @param dictionary - 工具目录下 prompts.mjs 的 `prompts` 对象。
 * @param source - 出错信息里显示的字典文件名。
 * @returns 取词典文本的函数。
 */
export function createPrompt(dictionary, source) {
  return function prompt(key) {
    const text = dictionary[key]
    if (typeof text !== 'string') throw new Error(`${source} 缺少 "${key}"`)
    return text
  }
}

/**
 * 把词典文本里的 `{名字}` 换成运行时值。
 * 词典里没声明的占位符原样留下，改错了能一眼看出来。
 * @param template - 带占位符的词典文本。
 * @param values - 占位符名字 → 值。
 * @returns 填好的文本。
 */
export function format(template, values) {
  return template.replace(/\{([a-z][a-z0-9]*)\}/gi, (whole, key) => (Object.hasOwn(values, key) ? String(values[key]) : whole))
}
