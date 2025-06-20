import type { Tool } from "../../../../shared/mcp-base.js";
import { fileReadTracker } from "../lib/file-read-tracker.js";
import { FileUtils } from "../lib/file-utils.js";
import { ResultFormatter, ToolError } from "../lib/tool-utils.js";

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
            description: "Start line number (1-based, default: 1)",
            default: 1,
          },
          endLine: {
            type: "number",
            description: "End line number (1-based, optional)",
          },
          maxLines: {
            type: "number",
            description: "Maximum number of lines to read (default: 20)",
            default: 20,
          },
        },
        required: ["path"],
      },
    };
  }

  async execute(args: any): Promise<any> {
    try {
      const { path: filePath, startLine = 1, endLine, maxLines = 20 } = args;

      // Validate line range
      if (endLine && startLine > endLine) {
        throw ToolError.createValidationError(
          "lineRange",
          { startLine, endLine },
          `Invalid line range: startLine (${startLine}) cannot be greater than endLine (${endLine})`
        );
      }

      // Use FileUtils for safe file reading with line range support
      const { content: selectedContent, totalLines } = await FileUtils.readFileLines(filePath, {
        startLine,
        endLine,
        maxLines,
      });

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
      throw ToolError.wrapError("Read operation", error);
    }
  }
}
