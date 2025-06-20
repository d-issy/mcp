import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";

// Re-export types for convenience
export type { Tool } from "@modelcontextprotocol/sdk/types.js";

export abstract class MCPServer {
  protected server: Server;
  protected name: string;
  protected version: string;

  constructor(name: string, version: string = "1.0.0") {
    this.name = name;
    this.version = version;
    this.server = new Server(
      {
        name,
        version,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.getTools(),
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      return await this.handleToolCall(request.params.name, request.params.arguments);
    });
  }

  protected abstract getTools(): Tool[];

  protected abstract handleToolCall(name: string, args: any): Promise<any>;

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`${this.name} MCP server running on stdio`);
  }
}
