import { access, copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import type { Tool } from "../mcp-base.ts";
import { PathSecurity } from "../lib/path-security.ts";
import { ResultFormatter, ToolError } from "../lib/tool-utils.ts";

export class CopyTool {
  getName(): string {
    return "copy";
  }

  getDefinition(): Tool {
    return {
      name: "copy",
      description: "Copy files with metadata preservation and safety checks",
      inputSchema: {
        type: "object",
        properties: {
          from: {
            type: "string",
            description: "Source file path (required)",
          },
          to: {
            type: "string",
            description: "Destination file path (required)",
          },
          overwrite: {
            type: "boolean",
            description: "Allow overwriting existing files (default: false)",
            default: false,
          },
        },
        required: ["from", "to"],
      },
    };
  }

  async execute(args: any): Promise<any> {
    const { from: fromPath, to: toPath, overwrite = false } = args;

    try {
      // Resolve absolute paths
      const fromResolved = resolve(fromPath);
      const toResolved = resolve(toPath);

      // Security checks
      this.validateCurrentDirectoryBounds(fromResolved, toResolved);

      if (PathSecurity.isDangerousFile(fromPath) || PathSecurity.isDangerousFile(toPath)) {
        throw new Error(`Security protection: Cannot operate on dangerous files (${fromPath} → ${toPath})`);
      }

      if (
        (await PathSecurity.isIgnoredByGit(fromResolved)) ||
        (await PathSecurity.isIgnoredByGit(toResolved))
      ) {
        throw new Error(`gitignore protection: Cannot operate on ignored files (${fromPath} → ${toPath})`);
      }

      // Check if source exists
      try {
        await access(fromResolved);
      } catch {
        throw new Error(`Source file not found: ${fromPath}`);
      }

      // Check if destination exists
      const destinationExists = await this.checkDestinationExists(toResolved);

      // Smart dryRun control
      if (destinationExists && !overwrite) {
        const destStats = await stat(toResolved);
        const destSize = Math.round((destStats.size / 1024) * 100) / 100;

        throw new Error(
          `Destination already exists: ${toPath} (${destSize}KB, modified ${destStats.mtime.toISOString().split("T")[0]}). Copy operation would overwrite this file. Use overwrite=true to force overwrite or choose a different destination path.`
        );
      }

      // Ensure destination directory exists
      await this.ensureDestinationDirectory(toResolved);

      // Perform copy operation
      await this.performCopy(fromResolved, toResolved);

      const message = destinationExists
        ? `✅ Successfully copied (overwrote existing): ${fromPath} → ${toPath}`
        : `✅ Successfully copied: ${fromPath} → ${toPath}`;
      return ResultFormatter.createResponse(message);
    } catch (error: any) {
      throw ToolError.wrapError("Copy operation", error);
    }
  }

  private validateCurrentDirectoryBounds(fromPath: string, toPath: string): void {
    const cwd = process.cwd();

    if (!fromPath.startsWith(cwd)) {
      throw new Error(`Cannot access files outside current directory: ${relative(cwd, fromPath)}`);
    }

    if (!toPath.startsWith(cwd)) {
      throw new Error(`Cannot move/copy files outside current directory: ${relative(cwd, toPath)}`);
    }
  }

  private async checkDestinationExists(destPath: string): Promise<boolean> {
    try {
      await access(destPath);
      return true;
    } catch {
      return false;
    }
  }

  private async ensureDestinationDirectory(destPath: string): Promise<void> {
    const destDir = dirname(destPath);
    try {
      await access(destDir);
    } catch {
      await mkdir(destDir, { recursive: true });
    }
  }

  private async performCopy(fromPath: string, toPath: string): Promise<void> {
    const fromStats = await stat(fromPath);

    if (fromStats.isDirectory()) {
      throw new Error("Directory copying not yet implemented. Use copy tool for single files only.");
    }

    await copyFile(fromPath, toPath);

    // Preserve timestamps and permissions (metadata preservation)
    const { utimes, chmod } = await import("node:fs/promises");
    await utimes(toPath, fromStats.atime, fromStats.mtime);
    await chmod(toPath, fromStats.mode);
  }
}