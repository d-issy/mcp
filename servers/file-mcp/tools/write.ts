import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { fileReadTracker } from "../lib/file-read-tracker.js";
import { WriteToolInputSchema } from "../lib/schemas.js";
import { ResultFormatter, ToolError, ToolValidation } from "../lib/tool-utils.js";

export class WriteTool {
  getName(): string {
    return "write";
  }

  getDefinition(): Tool {
    return {
      name: "write",
      description: "Write complete file contents (create new files or overwrite existing files)",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path to write",
          },
          content: {
            type: "string",
            description: "Complete file content to write",
          },
          createParentDir: {
            type: "boolean",
            default: false,
            description: "Create parent directories if they don't exist (default: false)",
          },
        },
        required: ["path", "content"],
      },
    };
  }

  async execute(args: any): Promise<any> {
    try {
      // Validate and parse input using Zod schema
      const validatedArgs = WriteToolInputSchema.parse(args);
      const { path: filePath, content, createParentDir } = validatedArgs;

      const resolvedPath = resolve(filePath);

      // Security validation
      await ToolValidation.validateFileAccess(resolvedPath);

      // Check if file exists and enforce read requirement for existing files
      let fileExists = false;
      try {
        await access(resolvedPath);
        fileExists = true;
      } catch {
        // File doesn't exist, which is fine for write operations
      }

      if (fileExists && !fileReadTracker.isFileRead(resolvedPath)) {
        throw ToolError.createValidationError(
          "filePath",
          filePath,
          `File must be read first. Use read(path="${filePath}") before overwriting to ensure safety`
        );
      }

      ToolValidation.validateContentSize(content, "write operation");

      // Ensure parent directory exists if needed
      await this.ensureParentDirectory(resolvedPath, createParentDir);

      // Write the file
      await writeFile(resolvedPath, content, "utf-8");

      // Mark file as read after writing (for subsequent edits)
      fileReadTracker.markFileAsRead(resolvedPath);

      // Generate result display
      const resultDisplay = await ResultFormatter.generateFilePreview(
        filePath,
        `Successfully wrote ${content.length} characters to ${filePath}`,
        undefined,
        content.length
      );

      return ResultFormatter.createResponse(resultDisplay);
    } catch (error: any) {
      // Handle Zod validation errors
      if (error instanceof Error && error.name === "ZodError") {
        throw ToolError.createValidationError("input", args, `Invalid input: ${error.message}`);
      }
      throw ToolError.wrapError("Write operation", error);
    }
  }

  private async ensureParentDirectory(filePath: string, createParentDir: boolean): Promise<void> {
    const parentDir = dirname(filePath);

    try {
      await access(parentDir);
    } catch {
      if (createParentDir) {
        await mkdir(parentDir, { recursive: true });
      } else {
        throw ToolError.createValidationError(
          "parentDir",
          parentDir,
          "Parent directory does not exist.\nTo create parent directories automatically, re-run with: createParentDir=true"
        );
      }
    }
  }
}
