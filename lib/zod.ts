type ParseSuccess<T> = { success: true; data: T }
type ParseFailure = { success: false; error: { message: string; flatten: () => { formErrors: string[] } } }
type ParseResult<T> = ParseSuccess<T> | ParseFailure

type Parser<T> = {
  safeParse: (value: unknown) => ParseResult<T>
  optional: () => Parser<T | undefined>
}

function failure(message: string): ParseFailure {
  return { success: false, error: { message, flatten: () => ({ formErrors: [message] }) } }
}

function withOptional<T>(parse: (value: unknown) => ParseResult<T>): Parser<T> {
  return {
    safeParse: parse,
    optional() {
      return withOptional<T | undefined>((value) => {
        if (value === undefined) return { success: true, data: undefined }
        return parse(value)
      })
    },
  }
}

function string() {
  let minLength = 0
  const parser = withOptional<string>((value) => {
    if (typeof value !== "string") return failure("Expected string")
    if (value.length < minLength) return failure(`String must contain at least ${minLength} character(s)`)
    return { success: true, data: value }
  }) as Parser<string> & { min: (length: number) => ReturnType<typeof string> }

  parser.min = (length: number) => {
    minLength = length
    return parser
  }

  return parser
}

function number() {
  let minValue = -Infinity
  let maxValue = Infinity
  let mustBeInt = false
  const parser = withOptional<number>((value) => {
    if (typeof value !== "number" || Number.isNaN(value)) return failure("Expected number")
    if (mustBeInt && !Number.isInteger(value)) return failure("Expected integer")
    if (value < minValue) return failure(`Number must be greater than or equal to ${minValue}`)
    if (value > maxValue) return failure(`Number must be less than or equal to ${maxValue}`)
    return { success: true, data: value }
  }) as Parser<number> & {
    min: (value: number) => ReturnType<typeof number>
    max: (value: number) => ReturnType<typeof number>
    int: () => ReturnType<typeof number>
    positive: () => ReturnType<typeof number>
  }

  parser.min = (value: number) => {
    minValue = value
    return parser
  }

  parser.max = (value: number) => {
    maxValue = value
    return parser
  }

  parser.int = () => {
    mustBeInt = true
    return parser
  }

  parser.positive = () => {
    minValue = Math.max(minValue, Number.MIN_VALUE)
    return parser
  }

  return parser
}

function object<T extends Record<string, Parser<any>>>(shape: T) {
  type Output = { [K in keyof T]: T[K] extends Parser<infer R> ? R : never }

  return withOptional<Output>((value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return failure("Expected object")

    const result: Record<string, unknown> = {}
    for (const key of Object.keys(shape)) {
      const parsed = shape[key].safeParse((value as Record<string, unknown>)[key])
      if (!parsed.success) return failure(`${key}: ${parsed.error.message}`)
      result[key] = parsed.data
    }

    return { success: true, data: result as Output }
  })
}

function array<T>(itemParser: Parser<T>) {
  return withOptional<T[]>((value) => {
    if (!Array.isArray(value)) return failure("Expected array")

    const parsedItems: T[] = []
    for (const item of value) {
      const parsed = itemParser.safeParse(item)
      if (!parsed.success) return failure(parsed.error.message)
      parsedItems.push(parsed.data)
    }

    return { success: true, data: parsedItems }
  })
}

export const z = {
  object,
  string,
  number,
  array,
}
