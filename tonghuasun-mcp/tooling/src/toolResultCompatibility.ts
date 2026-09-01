const STRUCTURED_CONTENT_MARKER = "同花顺结构化结果(JSON)：";

type JsonObject = Record<string, unknown>;

/**
 * 部分客户端只把 MCP content 文本块交给模型，不会转发 structuredContent。
 * 此兼容层只由需要它的入口显式开启，其他客户端继续使用标准 MCP 结构化结果。
 */
export function appendStructuredContentTextFallback<T>(result: T, enabled: boolean): T {
  if (!enabled || !isJsonObject(result) || !Object.hasOwn(result, "structuredContent")) {
    return result;
  }

  const serialized = JSON.stringify(result.structuredContent);
  if (serialized === undefined) {
    return result;
  }

  const content = Array.isArray(result.content) ? result.content : [];
  const alreadyAppended = content.some(
    (block) =>
      isJsonObject(block) &&
      block.type === "text" &&
      typeof block.text === "string" &&
      block.text.startsWith(STRUCTURED_CONTENT_MARKER),
  );
  if (alreadyAppended) {
    return result;
  }

  return {
    ...result,
    content: [
      ...content,
      {
        type: "text",
        text: `${STRUCTURED_CONTENT_MARKER}\n${serialized}`,
      },
    ],
  } as T;
}

export function isStructuredContentTextCompatibilityEnabled(value: string | undefined): boolean {
  return ["1", "true", "structured-json"].includes(value?.trim().toLowerCase() ?? "");
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
