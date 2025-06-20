import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { minimatch } from "minimatch";
import { FileUtils } from "./file-utils.js";
import { PathSecurity } from "./path-security.js";

export interface TraversalOptions {
  maxDepth?: number;
  includeIgnored?: boolean;
  includePatterns?: string[];
  excludePatterns?: string[];
  includeFiles?: boolean;
  includeDirectories?: boolean;
  followSymlinks?: boolean;
}

export interface TraversalResult {
  path: string;
  relativePath: string;
  isFile: boolean;
  isDirectory: boolean;
  size?: number | undefined;
  mtime?: Date | undefined;
}

/**
 * Shared directory utilities for traversal and pattern matching
 */
export class DirectoryUtils {
  /**
   * Parse filter patterns from string format
   * Supports comma-separated patterns with ! for exclusion
   */
  static parseFilterPatterns(filterString?: string): { include: string[]; exclude: string[] } {
    if (!filterString?.trim()) {
      return { include: [], exclude: [] };
    }

    const patterns = filterString
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const include: string[] = [];
    const exclude: string[] = [];

    for (const pattern of patterns) {
      if (pattern.startsWith("!")) {
        exclude.push(pattern.slice(1));
      } else {
        include.push(pattern);
      }
    }

    return { include, exclude };
  }

  /**
   * Check if a path matches any of the given patterns
   */
  static matchesPatterns(filePath: string, patterns: string[]): boolean {
    if (patterns.length === 0) return true;
    return patterns.some((pattern) => minimatch(filePath, pattern));
  }

  /**
   * Check if a path should be excluded based on patterns
   */
  static isExcluded(filePath: string, excludePatterns: string[]): boolean {
    return excludePatterns.some((pattern) => minimatch(filePath, pattern));
  }

  /**
   * Check if path is ignored by gitignore
   */
  static async isIgnored(
    filePath: string,
    basePath: string,
    includeIgnored: boolean = false
  ): Promise<boolean> {
    if (includeIgnored) return false;

    try {
      return await PathSecurity.shouldIgnoreFile(filePath, basePath);
    } catch {
      return false;
    }
  }

  /**
   * Get directory entries with basic filtering
   */
  static async getDirectoryEntries(
    dirPath: string,
    options: TraversalOptions = {}
  ): Promise<TraversalResult[]> {
    const resolvedPath = FileUtils.validateFilePath(dirPath);

    // Check if directory exists and is accessible
    const stats = await FileUtils.getFileStats(resolvedPath);
    if (!stats.isDirectory) {
      throw new Error(`Path is not a directory: ${dirPath}`);
    }

    const entries = await readdir(resolvedPath);
    const results: TraversalResult[] = [];

    for (const entry of entries) {
      const fullPath = join(resolvedPath, entry);
      const relativePath = relative(resolvedPath, fullPath);

      try {
        const entryStats = await stat(fullPath);
        const isFile = entryStats.isFile();
        const isDirectory = entryStats.isDirectory();

        // Apply basic filters
        if (options.includeFiles === false && isFile) continue;
        if (options.includeDirectories === false && isDirectory) continue;

        // Check gitignore
        if (await DirectoryUtils.isIgnored(fullPath, resolvedPath, options.includeIgnored)) {
          continue;
        }

        results.push({
          path: fullPath,
          relativePath,
          isFile,
          isDirectory,
          size: isFile ? entryStats.size : undefined,
          mtime: entryStats.mtime,
        });
      } catch (_error) {}
    }

    return results;
  }

  /**
   * Recursively traverse directory with full filtering support
   */
  static async *traverseDirectory(
    basePath: string,
    options: TraversalOptions = {}
  ): AsyncGenerator<TraversalResult> {
    const {
      maxDepth = Infinity,
      includeIgnored = false,
      includePatterns = [],
      excludePatterns = [],
      includeFiles = true,
      includeDirectories = true,
    } = options;

    const resolvedBasePath = FileUtils.validateFilePath(basePath);

    async function* traverse(
      currentPath: string,
      currentDepth: number
    ): AsyncGenerator<TraversalResult> {
      if (maxDepth !== Infinity && currentDepth > maxDepth) {
        return;
      }

      try {
        const entries = await readdir(currentPath);

        for (const entry of entries) {
          const fullPath = join(currentPath, entry);
          const relativePath = relative(resolvedBasePath, fullPath);

          try {
            const stats = await stat(fullPath);
            const isFile = stats.isFile();
            const isDirectory = stats.isDirectory();

            // Skip non-files/directories if requested
            if (!includeFiles && isFile) continue;
            if (!includeDirectories && isDirectory) continue;

            // Check gitignore
            if (await DirectoryUtils.isIgnored(fullPath, resolvedBasePath, includeIgnored)) {
              continue;
            }

            // Apply exclude patterns
            if (
              DirectoryUtils.isExcluded(relativePath, excludePatterns) ||
              DirectoryUtils.isExcluded(entry, excludePatterns)
            ) {
              continue;
            }

            // Apply include patterns
            if (includePatterns.length > 0) {
              const matchesInclude =
                DirectoryUtils.matchesPatterns(relativePath, includePatterns) ||
                DirectoryUtils.matchesPatterns(entry, includePatterns);
              if (!matchesInclude) continue;
            }

            const result: TraversalResult = {
              path: fullPath,
              relativePath,
              isFile,
              isDirectory,
              size: isFile ? stats.size : undefined,
              mtime: stats.mtime,
            };

            yield result;

            // Recurse into directories
            if (isDirectory && currentDepth < maxDepth) {
              yield* traverse(fullPath, currentDepth + 1);
            }
          } catch (_error) {}
        }
      } catch (_error) {
        // Skip directories we can't read
        return;
      }
    }

    yield* traverse(resolvedBasePath, 0);
  }

  /**
   * Find files matching patterns (similar to FindTool functionality)
   */
  static async findFiles(
    basePath: string,
    filterPatterns?: string,
    options: Omit<TraversalOptions, "includePatterns" | "excludePatterns"> = {}
  ): Promise<TraversalResult[]> {
    const { include, exclude } = DirectoryUtils.parseFilterPatterns(filterPatterns);

    const results: TraversalResult[] = [];

    for await (const entry of DirectoryUtils.traverseDirectory(basePath, {
      ...options,
      includePatterns: include,
      excludePatterns: exclude,
      includeFiles: true,
      includeDirectories: options.includeDirectories !== false,
    })) {
      results.push(entry);
    }

    return results;
  }
}
