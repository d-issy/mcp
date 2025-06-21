import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
  type CallToolRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { EditTool } from "./tools/edit.js";
import { MoveTool } from "./tools/move.js";
import { CopyTool } from "./tools/copy.js";
import { FindTool } from "./tools/find.js";
import { GrepTool } from "./tools/grep.js";
import { ReadTool } from "./tools/read.js";
import { WriteTool } from "./tools/write.js";
import { ToolError } from "./lib/tool-utils.js";

// Valid tool names for type safety
type ToolName = "find" | "read" | "grep" | "write" | "edit" | "move" | "copy";

abstract class MCPServer {
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

    this.server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      return await this.handleToolCall(request.params.name, request.params.arguments);
    });
  }

  protected abstract getTools(): Tool[];

  protected abstract handleToolCall(
    name: string,
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }>;

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`${this.name} MCP server running on stdio`);
  }
}

class FileMCPServer extends MCPServer {
  private findTool: FindTool;
  private readTool: ReadTool;
  private grepTool: GrepTool;
  private writeTool: WriteTool;
  private editTool: EditTool;
  private moveTool: MoveTool;
  private copyTool: CopyTool;

  constructor() {
    super("file-mcp", "1.0.0");
    this.findTool = new FindTool();
    this.readTool = new ReadTool();
    this.grepTool = new GrepTool();
    this.writeTool = new WriteTool();
    this.editTool = new EditTool();
    this.moveTool = new MoveTool();
    this.copyTool = new CopyTool();
  }

  protected getTools(): Tool[] {
    return [
      this.readTool.getDefinition(),
      this.findTool.getDefinition(),
      this.grepTool.getDefinition(),
      this.writeTool.getDefinition(),
      this.editTool.getDefinition(),
      this.moveTool.getDefinition(),
      this.copyTool.getDefinition(),
    ];
  }

  protected async handleToolCall(
    name: string,
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    try {
      const toolName = name as ToolName;

      switch (toolName) {
        case "read":
          return await this.readTool.execute(args);
        case "find":
          return await this.findTool.execute(args);
        case "grep":
          return await this.grepTool.execute(args);
        case "write":
          return await this.writeTool.execute(args);
        case "edit":
          return await this.editTool.execute(args);
        case "move":
          return await this.moveTool.execute(args);
        case "copy":
          return await this.copyTool.execute(args);

        default:
          throw ToolError.createValidationError(
            "toolName",
            name,
            `Unknown tool: ${name}. Available tools: ${this.getTools()
              .map((t) => t.name)
              .join(", ")}`
          );
      }
    } catch (error) {
      // Return error as proper MCP response instead of throwing
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        content: [
          {
            type: "text",
            text: `❌ Error: ${errorMessage}`,
          },
        ],
      };
    }
  }
}

const server = new FileMCPServer();
server.start().catch(console.error);
