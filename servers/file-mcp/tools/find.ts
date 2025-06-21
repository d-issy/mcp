import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { DirectoryUtils } from "../lib/directory-utils.js";
import { FindToolInputSchema, zodToJsonSchema } from "../lib/schemas.js";
import { ResultFormatter, ToolError } from "../lib/tool-utils.js";

export class FindTool {
  getName(): string {
    return "find";
  }

  getDefinition(): Tool {
    const _baseSchema = zodToJsonSchema(FindToolInputSchema);
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
          pattern: {
            type: "string",
            description:
              "File pattern to match (*.js,**/*.test.ts,!**/node_modules/**). Use ! to exclude, comma-separated",
          },
          depth: {
            type: "number",
            default: 0,
            description: "Maximum depth to recurse (default: 0 = unlimited)",
          },
          includeIgnored: {
            type: "boolean",
            default: false,
            description: "Include files ignored by .gitignore (default: false)",
          },
        },
        required: ["path"],
      },
    };
  }

  async execute(args: any): Promise<any> {
    try {
      // Validate and parse input using Zod schema
      const validatedArgs = FindToolInputSchema.parse(args);
      const { path: targetPath, depth, includeIgnored, pattern: filterPath } = validatedArgs;

      const basePath = targetPath || ".";

      // Use DirectoryUtils for file finding with all the same features
      const options: any = {
        includeIgnored,
        includeFiles: true,
        includeDirectories: true,
      };
      if (depth > 0) {
        options.maxDepth = depth;
      }
      const results = await DirectoryUtils.findFiles(basePath, filterPath, options);

      // Format results as relative paths (maintaining original behavior)
      const relativePaths = results.map((result) => {
        const path = result.relativePath;
        return result.isDirectory ? `${path}/` : path;
      });

      return ResultFormatter.createResponse(relativePaths.join("\n"));
    } catch (error) {
      // Handle Zod validation errors
      if (error instanceof Error && error.name === "ZodError") {
        throw ToolError.createValidationError("input", args, `Invalid input: ${error.message}`);
      }
      throw ToolError.wrapError("Find operation", error);
    }
  }
}
