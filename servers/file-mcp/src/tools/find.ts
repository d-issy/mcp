import type { Tool } from "../mcp-base.js";
import { DirectoryUtils } from "../lib/directory-utils.js";
import { ResultFormatter, ToolError } from "../lib/tool-utils.js";

export class FindTool {
  getName(): string {
    return "find";
  }

  getDefinition(): Tool {
    return {
      name: "find",
      description: "Find files and directories with pattern matching and filtering",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Directory path to search (required)",
          },
          depth: {
            type: "number",
            description: "Maximum depth to recurse (default: 0 = unlimited)",
            default: 0,
          },
          includeIgnored: {
            type: "boolean",
            description: "Include files ignored by .gitignore (default: false)",
            default: false,
          },
          pattern: {
            type: "string",
            description:
              "File pattern to match (*.js,**/*.test.ts,!**/node_modules/**). Use ! to exclude, comma-separated",
          },
        },
        required: ["path"],
      },
    };
  }

  async execute(args: any): Promise<any> {
    try {
      const { path: targetPath, depth = 0, includeIgnored = false, pattern: filterPath } = args;

      const basePath = targetPath || ".";

      // Use DirectoryUtils for file finding with all the same features
      const results = await DirectoryUtils.findFiles(basePath, filterPath, {
        maxDepth: depth === 0 ? undefined : depth,
        includeIgnored,
        includeFiles: true,
        includeDirectories: true,
      });

      // Format results as relative paths (maintaining original behavior)
      const relativePaths = results.map((result) => {
        const path = result.relativePath;
        return result.isDirectory ? `${path}/` : path;
      });

      return ResultFormatter.createResponse(relativePaths.join("\n"));
    } catch (error) {
      throw ToolError.wrapError("Find operation", error);
    }
  }
}
