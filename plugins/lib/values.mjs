/**
 * 参数兼容层：模型偶尔把字符串、数组、null 传到本该是对象或文本的位置，
 * 这里统一收成安全值。全是纯函数，不抛文本、不知道自己属于哪个工具。
 */

/** 收成普通对象；数组、null、标量一律当空对象。 */
export function asRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

/** 收成非空文本；非字符串、空串、纯空白一律当「没给」。 */
export function optionalText(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/** 把任意抛出物写成一句可读的原因。 */
export function describe(error) {
  return error !== null && typeof error === 'object' && typeof error.message === 'string' ? error.message : String(error)
}
