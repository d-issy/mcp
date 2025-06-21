import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { fileReadTracker } from "../lib/file-read-tracker.js";
import { FileUtils } from "../lib/file-utils.js";
import { ResultFormatter, ToolError } from "../lib/tool-utils.js";
import { ReadToolInputSchema, zodToJsonSchema } from "../lib/schemas.js";

export class ReadTool {
  getName(): string {
    return "read";
  }

  getDefinition(): Tool {
    return {
      name: "read",
      description: "Read file contents with safety checks and optional line range",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path to read",
          },
          startLine: {
            type: "number",
            default: 1,
            description: "Start line number (1-based, default: 1)",
          },
          endLine: {
            type: "number",
            description: "End line number (1-based, optional)",
          },
          maxLines: {
            type: "number",
            default: 20,
            description: "Maximum number of lines to read (default: 20)",
          },
        },
        required: ["path"],
      },
    };
  }

  async execute(args: any): Promise<any> {
    try {
      // Validate and parse input using Zod schema
      const validatedArgs = ReadToolInputSchema.parse(args);
      const { path: filePath, startLine, endLine, maxLines } = validatedArgs;

      // Use FileUtils for safe file reading with line range support
      const options: any = {
        startLine,
        maxLines,
      };
      if (endLine !== undefined) {
        options.endLine = endLine;
      }
      const { content: selectedContent, totalLines } = await FileUtils.readFileLines(
        filePath,
        options
      );

      // Calculate actual range (for display purposes)
      const actualStartLine = Math.max(1, startLine);
      const actualEndLine = endLine
        ? Math.min(endLine, totalLines)
        : Math.min(actualStartLine + maxLines - 1, totalLines);

      // Check character limit for selected content only
      const isRangeSpecified =
        args.startLine !== undefined || args.endLine !== undefined || args.maxLines !== undefined;
      const hasRangeLimit = isRangeSpecified || actualEndLine < totalLines;

      if (hasRangeLimit && selectedContent.length > 20000) {
        throw ToolError.createValidationError(
          "contentSize",
          selectedContent.length,
          "Selected range is too large. Maximum allowed: 20,000 characters. Please reduce range"
        );
      }

      // Format output (plain text, no line numbers by default)
      let formattedLines = selectedContent;
      const messages = [];

      if (actualStartLine > 1) {
        messages.push(`... above (${actualStartLine - 1} lines)`);
      }

      if (actualEndLine < totalLines) {
        const remainingLines = totalLines - actualEndLine;
        const nextStart = actualEndLine + 1;

        messages.push(`below (${remainingLines} lines) ...`);

        // Add helpful suggestions
        const suggestions = [];
        suggestions.push(`startLine=${nextStart}`);
        suggestions.push(`maxLines=<more>`);

        messages.push(`To read more: ${suggestions.join(" or ")}`);
      }

      if (messages.length > 0) {
        formattedLines = `${formattedLines}\n\n[${messages.join(" | ")}]`;
      }

      // Mark file as read for Edit Tool and Write Tool safety
      fileReadTracker.markFileAsRead(filePath);

      return ResultFormatter.createResponse(formattedLines);
    } catch (error) {
      // Handle Zod validation errors
      if (error instanceof Error && error.name === "ZodError") {
        throw ToolError.createValidationError("input", args, `Invalid input: ${error.message}`);
      }
      throw ToolError.wrapError("Read operation", error);
    }
  }
}
