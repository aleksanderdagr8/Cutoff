import { createMcpApp } from "./app.js";
import type { McpBindings } from "./bindings.js";

const app = createMcpApp();

export default {
  async fetch(
    request: Request,
    env: McpBindings,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    return app.fetch(request, env);
  },
};
