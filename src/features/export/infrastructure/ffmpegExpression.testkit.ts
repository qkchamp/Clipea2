/**
 * Evaluates an ffmpeg expression (the ones built for `overlay`, `scale` and `geq`) in JavaScript, so
 * tests can check that the exported video follows the same numbers as the player. Only for tests.
 */
const FUNCTIONS = {
  if: (condition: number, then: number, otherwise: number): number => (condition !== 0 ? then : otherwise),
  lt: (a: number, b: number): number => (a < b ? 1 : 0),
  gt: (a: number, b: number): number => (a > b ? 1 : 0),
  gte: (a: number, b: number): number => (a >= b ? 1 : 0),
  lte: (a: number, b: number): number => (a <= b ? 1 : 0),
  clip: (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value)),
  pow: Math.pow,
  cos: Math.cos,
  mod: (a: number, b: number): number => a - b * Math.floor(a / b),
  max: Math.max,
  min: Math.min
}

export function evaluateExpression(expression: string, variables: { t?: number; T?: number }): number {
  const source = expression.replace(/\b([a-z]+)\(/g, (_match, name: string) => {
    if (!(name in FUNCTIONS)) throw new Error(`Función de ffmpeg sin equivalente en el test: ${name}`)
    return `F.${name}(`
  })
  return new Function('F', 't', 'T', 'PI', `return ${source}`)(FUNCTIONS, variables.t ?? 0, variables.T ?? 0, Math.PI) as number
}
