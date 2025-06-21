import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, relative, resolve } from "node:path";

const require = createRequire(import.meta.url);
const ignore = require("ignore");

export class PathSecurity {
  /**
   * Check if path escapes current directory
   */
  static checkDirectoryBounds(filePath: string): void {
    const resolvedPath = resolve(filePath);
    const currentDir = process.cwd();
    if (!resolvedPath.startsWith(currentDir)) {
      throw new Error(`Access outside current directory not allowed: ${filePath}`);
    }
  }

  /**
   * Check if file is dangerous (contains secrets, etc.)
   */
  static isDangerousFile(filePath: string): boolean {
    const dangerousPatterns = [
      /\.env$/,
      /\.env\./,
      /\.envrc$/,
      /\.key$/,
      /\.pem$/,
      /\.p12$/,
      /\.jks$/,
      /\.keystore$/,
      /\.crt$/,
      /\.csr$/,
      /\.pfx$/,
      /id_rsa$/,
      /id_dsa$/,
      /id_ecdsa$/,
      /id_ed25519$/,
      /\.ssh\//,
      /\.aws\//,
      /\.kube\//,
      /password/i,
      /secret/i,
      /private/i,
    ];

    return dangerousPatterns.some((pattern) => pattern.test(filePath));
  }

  /**
   * Check if file is ignored by .gitignore
   */
  static async isIgnoredByGit(filePath: string): Promise<boolean> {
    try {
      const gitignorePath = join(process.cwd(), ".gitignore");

      try {
        const gitignoreContent = await readFile(gitignorePath, "utf-8");
        const ig = ignore().add(gitignoreContent);
        const relativePath = relative(process.cwd(), filePath);
        return ig.ignores(relativePath);
      } catch {
        return false;
      }
    } catch {
      return false;
    }
  }

  /**
   * Check if file is binary
   */
  static async isBinaryFile(filePath: string): Promise<boolean> {
    try {
      const buffer = await readFile(filePath);
      const sampleSize = Math.min(1024, buffer.length);
      const sample = buffer.subarray(0, sampleSize);

      // Check for null bytes (common in binary files)
      for (let i = 0; i < sample.length; i++) {
        if (sample[i] === 0) {
          return true;
        }
      }

      // Check for high ratio of non-printable characters
      let nonPrintableCount = 0;
      for (let i = 0; i < sample.length; i++) {
        const char = sample[i];
        if (char !== undefined && char < 32 && char !== 9 && char !== 10 && char !== 13) {
          nonPrintableCount++;
        }
      }

      const nonPrintableRatio = nonPrintableCount / sample.length;
      return nonPrintableRatio > 0.3;
    } catch {
      return false;
    }
  }

  /**
   * Convenience method for shouldIgnoreFile compatibility
   */
  static async shouldIgnoreFile(filePath: string, _basePath?: string): Promise<boolean> {
    return await PathSecurity.isIgnoredByGit(filePath);
  }
}
