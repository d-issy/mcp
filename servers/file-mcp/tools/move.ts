import { access, mkdir, rename, stat } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { PathSecurity } from "../lib/path-security.js";
import { ResultFormatter, ToolError } from "../lib/tool-utils.js";
import { MoveToolInputSchema } from "../lib/schemas.js";

export class MoveTool {
  getName(): string {
    return "move";
  }

  getDefinition(): Tool {
    return {
      name: "move",
      description: "Move files with safety checks and current directory restrictions",
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
    try {
      // Validate and parse input using Zod schema
      const validatedArgs = MoveToolInputSchema.parse(args);
      const { from: fromPath, to: toPath, overwrite } = validatedArgs;
      // Resolve absolute paths
      const fromResolved = resolve(fromPath);
      const toResolved = resolve(toPath);

      // Security checks
      this.validateCurrentDirectoryBounds(fromResolved, toResolved);

      if (PathSecurity.isDangerousFile(fromPath) || PathSecurity.isDangerousFile(toPath)) {
        throw new Error(
          `Security protection: Cannot operate on dangerous files (${fromPath} → ${toPath})`
        );
      }

      if (
        (await PathSecurity.isIgnoredByGit(fromResolved)) ||
        (await PathSecurity.isIgnoredByGit(toResolved))
      ) {
        throw new Error(
          `gitignore protection: Cannot operate on ignored files (${fromPath} → ${toPath})`
        );
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
          `Destination already exists: ${toPath} (${destSize}KB, modified ${destStats.mtime.toISOString().split("T")[0]}). Move operation would overwrite this file. Use overwrite=true to force overwrite or choose a different destination path.`
        );
      }

      // Ensure destination directory exists
      await this.ensureDestinationDirectory(toResolved);

      // Perform move operation
      await this.performMove(fromResolved, toResolved);

      const message = destinationExists
        ? `✅ Successfully moved (overwrote existing): ${fromPath} → ${toPath}`
        : `✅ Successfully moved: ${fromPath} → ${toPath}`;
      return ResultFormatter.createResponse(message);
    } catch (error: any) {
      // Handle Zod validation errors
      if (error instanceof Error && error.name === "ZodError") {
        throw ToolError.createValidationError("input", args, `Invalid input: ${error.message}`);
      }
      throw ToolError.wrapError("Move operation", error);
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

  private async performMove(fromPath: string, toPath: string): Promise<void> {
    try {
      await rename(fromPath, toPath);
    } catch (error: any) {
      // Handle cross-device move by copy + delete
      if (error.code === "EXDEV") {
        const { copyFile, unlink } = await import("node:fs/promises");
        await copyFile(fromPath, toPath);
        await unlink(fromPath);
      } else {
        throw error;
      }
    }
  }
}
