// UI 从已有 OpenAPI 文档读取表单和可提交状态，不增加独立“能力目录”接口。
export interface Schema {
  $ref?: string
  type?: string
  description?: string
  properties?: Record<string, Schema>
  required?: string[]
  enum?: string[]
  default?: unknown
  items?: Schema
}
interface Operation {
  description?: string
  parameters?: { name: string; in: string; required?: boolean; description?: string; schema: Schema }[]
  requestBody?: { content: Record<string, { schema: Schema }> }
  responses?: Record<string, { content?: Record<string, { schema: Schema }> }>
}
interface ApiDocument { paths: Record<string, Record<string, Operation>>; components: { schemas: Record<string, Schema> } }
let documentRequest: Promise<ApiDocument> | undefined

export async function getContract(path: string, method: 'get' | 'post') {
  documentRequest ??= fetch('/openapi.json').then(async response => {
    if (!response.ok) throw new Error('接口文档加载失败')
    return response.json() as Promise<ApiDocument>
  }).catch(error => { documentRequest = undefined; throw error })
  const document = await documentRequest
  const operation = document.paths[path]?.[method]
  if (!operation) return null
  const resolve = (schema: Schema): Schema => schema.$ref
    ? document.components.schemas[schema.$ref.split('/').pop()!] ?? schema : schema
  const input = resolve(operation.requestBody?.content['application/json']?.schema ?? {})
  const success = Object.entries(operation.responses ?? {}).find(([code]) => /^2\d\d$/.test(code))
  return {
    available: !!success,
    description: operation.description,
    properties: Object.fromEntries(Object.entries(input.properties ?? {}).map(([key, value]) => [key, resolve(value)])),
    required: input.required ?? [],
    parameters: operation.parameters ?? [],
  }
}
