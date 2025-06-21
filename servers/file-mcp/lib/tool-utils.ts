import { readFile } from "node:fs/promises";
import { fileReadTracker } from "./file-read-tracker.js";
import { PathSecurity } from "./path-security.js";

/**
 * Common constants used across tools
 */
export const TOOL_CONSTANTS = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  OUTPUT_LIMIT: 20000, // 20K characters
  PREVIEW_LINES: 3,
} as const;

/**
 * Common validation functions for tools
 */
export class ToolValidation {
  /**
   * Validates file security and marks as read
   */
  static async validateFileAccess(filePath: string, requireRead: boolean = false): Promise<void> {
    PathSecurity.checkDirectoryBounds(filePath);

    if (PathSecurity.isDangerousFile(filePath)) {
      throw new Error(`File type not allowed for security reasons: ${filePath}`);
    }

    if (requireRead && !fileReadTracker.isFileRead(filePath)) {
      throw new Error(
        `File must be read first. Use read(path="${filePath}") before editing to ensure safety.`
      );
    }
  }

  /**
   * Validates content size
   */
  static validateContentSize(content: string, operation: string): void {
    if (content.length > TOOL_CONSTANTS.MAX_FILE_SIZE) {
      throw new Error(
        `Content too large (${content.length} characters). Maximum: ${TOOL_CONSTANTS.MAX_FILE_SIZE.toLocaleString()} characters for ${operation}`
      );
    }
  }
}

/**
 * Common result formatting functions
 */
export class ResultFormatter {
  /**
   * Creates a standard tool response
   */
  static createResponse(text: string): { content: Array<{ type: "text"; text: string }> } {
    return {
      content: [
        {
          type: "text",
          text,
        },
      ],
    };
  }

  /**
   * Generates a file preview with context
   */
  static async generateFilePreview(
    filePath: string,
    operation: string,
    lineNumber?: number,
    contentLength?: number
  ): Promise<string> {
    try {
      const content = await readFile(filePath, "utf-8");
      const lines = content.split("\n");
      const totalLines = lines.length;

      if (lineNumber && lineNumber > 0 && lineNumber <= lines.length) {
        // Show context around specific line
        const start = Math.max(0, lineNumber - 3);
        const end = Math.min(lines.length, lineNumber + 2);
        const contextLines = lines
          .slice(start, end)
          .map((line, index) => {
            const actualLineNum = start + index + 1;
            const marker = actualLineNum === lineNumber ? "→" : " ";
            return `  ${marker}${actualLineNum}: ${line}`;
          })
          .join("\n");

        return `${operation}. Updated content:\n${contextLines}`;
      } else {
        // Show file summary
        const preview = lines
          .slice(0, TOOL_CONSTANTS.PREVIEW_LINES)
          .map((line, i) => `  ${i + 1}: ${line}`)
          .join("\n");

        const sizeInfo = contentLength ? ` (${contentLength} characters)` : "";
        const suffix = totalLines > TOOL_CONSTANTS.PREVIEW_LINES ? "\n  ..." : "";

        return `${operation}. File now has ${totalLines} lines${sizeInfo}:\n${preview}${suffix}`;
      }
    } catch {
      const sizeInfo = contentLength ? ` (${contentLength} characters)` : "";
      return `${operation}${sizeInfo}.`;
    }
  }
}

/**
 * Common error handling functions
 */
export class ToolError {
  /**
   * Wraps errors with consistent formatting
   */
  static wrapError(operation: string, error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error);
    return new Error(`${operation} failed: ${message}`);
  }

  /**
   * Creates a validation error with helpful context
   */
  static createValidationError(field: string, value: any, requirement: string): Error {
    return new Error(`Invalid ${field}: ${value}. ${requirement}`);
  }
}
