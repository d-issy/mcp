import { access, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { PathSecurity } from "./path-security.js";

interface FileStats {
  size: number;
  isFile: boolean;
  isDirectory: boolean;
  mtime: Date;
}

/**
 * Shared file utilities for common file operations with safety checks
 */
export class FileUtils {
  /**
   * Safely resolve and validate a file path
   */
  static validateFilePath(filePath: string): string {
    PathSecurity.checkDirectoryBounds(filePath);
    return resolve(filePath);
  }

  /**
   * Check if a file exists with safety validation
   */
  static async checkFileExists(filePath: string): Promise<boolean> {
    const resolvedPath = FileUtils.validateFilePath(filePath);
    try {
      await access(resolvedPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file statistics with safety validation
   */
  static async getFileStats(filePath: string): Promise<FileStats> {
    const resolvedPath = FileUtils.validateFilePath(filePath);

    try {
      await access(resolvedPath);
    } catch {
      throw new Error(`File not found: ${filePath}`);
    }

    const stats = await stat(resolvedPath);

    return {
      size: stats.size,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      mtime: stats.mtime,
    };
  }

  /**
   * Safely read file contents with validation and size limits
   */
  static async safeReadFile(
    filePath: string,
    options: {
      encoding?: BufferEncoding;
      maxSize?: number;
      checkIsBinary?: boolean;
    } = {}
  ): Promise<string> {
    const {
      encoding = "utf-8",
      maxSize = 10 * 1024 * 1024, // 10MB default
      checkIsBinary = true,
    } = options;

    const resolvedPath = FileUtils.validateFilePath(filePath);

    // Check if file exists
    try {
      await access(resolvedPath);
    } catch {
      throw new Error(`File not found: ${filePath}`);
    }

    // Get file stats
    const stats = await stat(resolvedPath);

    if (!stats.isFile()) {
      throw new Error(`Path is not a file: ${filePath}`);
    }

    if (stats.size > maxSize) {
      throw new Error(
        `File too large (${stats.size} bytes). Maximum allowed: ${maxSize.toLocaleString()} bytes`
      );
    }

    // Check if file is binary (optional)
    if (checkIsBinary && PathSecurity.isDangerousFile(filePath)) {
      throw new Error(`File type not allowed for security reasons: ${filePath}`);
    }

    // Read file content
    const content = await readFile(resolvedPath, encoding);

    return content;
  }

  /**
   * Read file with line range support
   */
  static async readFileLines(
    filePath: string,
    options: {
      startLine?: number;
      endLine?: number;
      maxLines?: number;
    } = {}
  ): Promise<{ content: string; totalLines: number; selectedLines: string[] }> {
    const content = await FileUtils.safeReadFile(filePath);
    const lines = content.split("\n");
    const totalLines = lines.length;

    const { startLine = 1, endLine, maxLines = 20 } = options;

    const actualStartLine = Math.max(1, startLine);
    const actualEndLine = endLine
      ? Math.min(endLine, lines.length)
      : Math.min(actualStartLine + maxLines - 1, lines.length);

    const selectedLines = lines.slice(actualStartLine - 1, actualEndLine);
    const selectedContent = selectedLines.join("\n");

    return {
      content: selectedContent,
      totalLines,
      selectedLines,
    };
  }
}
