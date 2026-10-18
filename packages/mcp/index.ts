#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Core, Operations, Contracts, jsonSchema } from "../core/index.js";
import { options } from "../core/options.js";
const parsed = options(process.argv.slice(2));
const core = new Core(parsed.options);
await core.initialize();
const server = new Server(
  { name: "owngame", version: JSON.parse(await readFile(path.join(parsed.options.root, "package.json"), "utf8")).version },
  { capabilities: { tools: {} } },
);
const mapping = Object.fromEntries(
  Object.keys(Operations).map((op) => [
    `owngame_${op.replaceAll(".", "_")}`,
    op,
  ]),
);
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: Object.entries(mapping)
    .filter(([, op]) => Object.hasOwn(core.operations, op))
    .map(([name, op]) => ({
      name,
      description: `${op}. Local owngame operation; preserve claim_kind and freshness. Results are succeeded, failed or unknown; unknown is not a pass.`,
      inputSchema: jsonSchema(Operations[op as keyof typeof Operations]) as any,
      outputSchema: jsonSchema(Contracts.result) as any,
      annotations: {
        readOnlyHint: ![
          "project.create",
          "cocos.build",
          "run.create",
          "task.create",
          "task.execute",
          "task.cancel",
          "delivery.register",
          "assessment.record",
        ].includes(op),
        destructiveHint: false,
        openWorldHint: false,
      },
    })),
}));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const result = await core.call(
    mapping[request.params.name] ?? request.params.name,
    request.params.arguments ?? {},
  );
  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
    structuredContent: result,
    isError: result.status !== "succeeded",
  };
});
await server.connect(new StdioServerTransport());
