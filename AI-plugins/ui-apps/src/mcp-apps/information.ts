import { McpFqgateFetch } from "@/adapters/mcp-app";
import { FqgateInformationService } from "@/adapters/local-api";
import InformationPreview from "@/previews/InformationPreview.vue";
import {
  FQGATE_LOOPBACK_URL,
  connectMcpApp,
  mountSharedComponent,
  readSecurity,
  showEntryError
} from "./bootstrap";

async function main(): Promise<void> {
  const runtime = await connectMcpApp("fqgate-information");
  const security = readSecurity(await runtime.waitForToolInput());
  if (!security) throw new Error("没有收到资讯查询所需的证券代码。");

  const bridge = new McpFqgateFetch(runtime);
  const service = new FqgateInformationService({
    baseUrl: FQGATE_LOOPBACK_URL,
    fetch: bridge.fetch
  });
  mountSharedComponent(InformationPreview, { service, security });
}

void main().catch(showEntryError);
