import assert from "node:assert/strict";

import { OpenAiComponentBridge } from "../src/adapters/vendors/openai/OpenAiComponentBridge.ts";
import type { JsonObject, McpToolResult } from "../src/adapters/mcp-app/McpAppRuntime.ts";

class FakeWindow extends EventTarget {
  openai?: {
    toolInput?: unknown;
    toolOutput?: unknown;
    toolResponseMetadata?: unknown;
    callTool?: (name: string, argumentsValue: JsonObject) => Promise<unknown>;
  };
}

const initialResult = {
  content: [],
  structuredContent: { ok: true, httpStatus: 200 },
  _meta: {
    "fqgate/uiResult": {
      ok: true,
      httpStatus: 200,
      data: { code: 0, message: "操作成功", data: { flow_id: 7 } }
    }
  }
} as McpToolResult;

const scope = new FakeWindow();
let calledName = "";
let calledArguments: JsonObject = {};
scope.openai = {
  toolInput: { cache_credentials: false },
  toolOutput: { ok: true, httpStatus: 200 },
  toolResponseMetadata: { mcp_tool_result: initialResult },
  callTool: async (name, argumentsValue) => {
    calledName = name;
    calledArguments = argumentsValue;
    return initialResult;
  }
};

const bridge = new OpenAiComponentBridge(scope);
const snapshot = bridge.getSnapshot();
assert.equal(snapshot.available, true);
assert.equal(snapshot.canCallTool, true);
assert.deepEqual(snapshot.arguments, { cache_credentials: false });
assert.equal(snapshot.result?._meta?.["fqgate/uiResult"], initialResult._meta?.["fqgate/uiResult"]);

const calledResult = await bridge.callTool("fqgate_market_qr_login_poll", { flow_id: 7 });
assert.deepEqual(calledResult, initialResult);
assert.equal(calledName, "fqgate_market_qr_login_poll");
assert.deepEqual(calledArguments, { flow_id: 7 });

let notificationResult: McpToolResult | undefined;
const unsubscribe = bridge.subscribe((nextSnapshot) => {
  notificationResult = nextSnapshot.result;
});
scope.openai.toolResponseMetadata = { mcp_tool_result: initialResult };
scope.dispatchEvent(new Event("openai:set_globals"));
assert.deepEqual(notificationResult, initialResult);
unsubscribe();

scope.openai.toolResponseMetadata = undefined;
scope.openai.toolOutput = { ok: true, httpStatus: 200 };
assert.equal(
  bridge.getSnapshot().result,
  undefined,
  "只有状态的 toolOutput 不能抢先覆盖稍后到达的完整二维码结果"
);
scope.openai.toolOutput = { ok: true, httpStatus: 200, data: { code: 0 } };
assert.deepEqual(bridge.getSnapshot().result?.structuredContent, scope.openai.toolOutput);

bridge.destroy();
process.stdout.write("OpenAI 组件通信适配验收通过。\n");
