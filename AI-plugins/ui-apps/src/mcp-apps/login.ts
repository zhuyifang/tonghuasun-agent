import { McpFqgateFetch } from "@/adapters/mcp-app";
import { FqgateLoginService } from "@/adapters/local-api";
import LoginPanel from "@/components/login/LoginPanel.vue";
import {
  FQGATE_LOOPBACK_URL,
  connectMcpApp,
  mountSharedComponent,
  showEntryError
} from "./bootstrap";

async function main(): Promise<void> {
  const runtime = await connectMcpApp("fqgate-login", "fqgate_market_qr_login_begin");
  const bridge = new McpFqgateFetch(runtime);
  const service = new FqgateLoginService({
    baseUrl: FQGATE_LOOPBACK_URL,
    fetch: bridge.fetch
  });
  mountSharedComponent(LoginPanel, { service });
}

void main().catch(showEntryError);
