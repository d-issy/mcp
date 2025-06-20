#!/usr/bin/env node
import { MCPServer, type Tool } from "./mcp-base.ts";
import { EditTool } from "./tools/edit.ts";
import { MoveTool } from "./tools/move.ts";
import { CopyTool } from "./tools/copy.ts";
import { FindTool } from "./tools/find.ts";
import { GrepTool } from "./tools/grep.ts";
import { ReadTool } from "./tools/read.ts";
import { WriteTool } from "./tools/write.ts";

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
      this.findTool.getDefinition(),
      this.readTool.getDefinition(),
      this.grepTool.getDefinition(),
      this.writeTool.getDefinition(),
      this.editTool.getDefinition(),
      this.moveTool.getDefinition(),
      this.copyTool.getDefinition(),
    ];
  }

  protected async handleToolCall(name: string, args: any): Promise<any> {
    switch (name) {
      case "find":
        return await this.findTool.execute(args);

      case "read":
        return await this.readTool.execute(args);

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
        throw new Error(`Unknown tool: ${name}`);
    }
  }
}

export async function main() {
  const server = new FileMCPServer();
  await server.start();
}

// 直接実行された場合
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
