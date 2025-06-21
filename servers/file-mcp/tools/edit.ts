import { access, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { type Tool } from "@modelcontextprotocol/sdk/types.js";
import { fileReadTracker } from "../lib/file-read-tracker.js";
import { PathSecurity } from "../lib/path-security.js";
import { ResultFormatter, ToolError, ToolValidation } from "../lib/tool-utils.js";

interface MatchInfo {
  index: number;
  lineNumber: number;
  startPos: number;
  endPos: number;
  contextBefore: string[];
  contextAfter: string[];
  matchedText: string;
}

interface SessionData {
  sessionId: string;
  filePath: string;
  oldString: string;
  newString: string;
  matches: MatchInfo[];
  timestamp: number;
}

export class EditTool {
  private static sessions = new Map<string, SessionData>();
  private static readonly SESSION_TIMEOUT = 5 * 60 * 1000; // 5 minutes

  private normalizeLineEndings(text: string): string {
    return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  getName(): string {
    return "edit";
  }

  getDefinition(): Tool {
    return {
      name: "edit",
      description: "Edit file contents with batch operations (requires prior read)",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path to edit",
          },
          edits: {
            type: "array",
            description: "Array of edit operations to perform in sequence",
            items: {
              type: "object",
              properties: {
                oldString: {
                  type: "string",
                  description: "String to replace (for replace operation)",
                },
                newString: {
                  type: "string",
                  description: "Replacement string (for replace operation)",
                },
                lineNumber: {
                  type: "number",
                  description: "Line number for insertion (1-based, for insert operation)",
                },
                content: {
                  type: "string",
                  description: "Content to insert (for insert operation)",
                },
                replaceAll: {
                  type: "boolean",
                  description: "Replace all occurrences (default: false)",
                  default: false,
                },
              },
            },
          },
        },
        required: ["path", "edits"],
      },
    };
  }

  async execute(args: any): Promise<any> {
    const { path: filePath, edits } = args;

    // Validate edits array
    if (!edits || !Array.isArray(edits) || edits.length === 0) {
      throw ToolError.createValidationError(
        "edits",
        edits,
        "array is required and must contain at least one operation"
      );
    }

    return await this.handleBatchEdit(filePath, edits);
  }

  private async handleReplace(
    filePath: string,
    oldString: string,
    newString: string,
    matchIndex?: number[],
    replaceAll?: boolean,
    sessionId?: string
  ): Promise<any> {
    // Same string check (like built-in Edit tool)
    if (oldString === newString) {
      throw ToolError.createValidationError(
        "replacement",
        { oldString, newString },
        "No changes to make: oldString and newString are exactly the same"
      );
    }

    // Check if file exists
    try {
      await access(filePath);
    } catch {
      throw ToolError.createValidationError("filePath", filePath, "File not found");
    }

    // Check if binary file
    if (await PathSecurity.isBinaryFile(filePath)) {
      throw ToolError.createValidationError("filePath", filePath, "Binary files are not supported");
    }

    const rawFileContent = await readFile(filePath, "utf-8");
    const fileContent = this.normalizeLineEndings(rawFileContent);

    ToolValidation.validateContentSize(fileContent, "edit operation");

    // Normalize search strings
    const normalizedOldString = this.normalizeLineEndings(oldString);
    const normalizedNewString = this.normalizeLineEndings(newString);

    // Handle session-based replacement
    if (sessionId) {
      return await this.handleSessionReplace(filePath, sessionId, matchIndex, replaceAll);
    }

    // Try flexible matching first
    const flexibleResult = await this.tryFlexibleMatch(
      fileContent,
      filePath,
      normalizedOldString,
      normalizedNewString
    );
    if (flexibleResult) {
      return flexibleResult;
    }

    // Fall back to original exact matching
    const matches = this.findMatches(fileContent, normalizedOldString);

    if (matches.length === 0) {
      const suggestions = this.findSimilarStrings(fileContent, oldString);
      let errorMessage = `No matches found for "${oldString}" in ${filePath}`;
      if (suggestions.length > 0) {
        errorMessage += `\nSimilar strings found:\n${suggestions.map((s) => `- "${s.text}" (Line ${s.line})`).join("\n")}`;
      }
      throw new Error(errorMessage);
    }

    if (matches.length === 1) {
      // Single match - replace directly
      const match = matches[0];
      if (!match) {
        throw new Error("Unexpected error: match not found");
      }
      const newContent = this.replaceAtMatch(fileContent, match, newString);
      await writeFile(filePath, newContent, "utf-8");

      // Generate result display showing the changed line
      const resultDisplay = await this.generateResultDisplay(
        filePath,
        "Successfully replaced 1 occurrence",
        match.lineNumber
      );

      return ResultFormatter.createResponse(resultDisplay);
    }

    // Multiple matches - create session
    const newSessionId = this.generateSessionId();
    const sessionData: SessionData = {
      sessionId: newSessionId,
      filePath,
      oldString,
      newString,
      matches,
      timestamp: Date.now(),
    };

    EditTool.sessions.set(newSessionId, sessionData);

    // Display matches with context
    const matchDisplay = matches
      .map((match, index) => {
        const contextLines = [
          ...match.contextBefore.map((line) => `    ${line}`),
          `→   ${match.matchedText}`,
          ...match.contextAfter.map((line) => `    ${line}`),
        ].join("\n");

        return `[${index}] Line ${match.lineNumber}:\n${contextLines}`;
      })
      .join("\n\n");

    const message = `Multiple matches found for "${oldString}" in ${filePath} (Session: ${newSessionId}):\n\n${matchDisplay}\n\nAvailable options:\n- Single/Multiple: matchIndex=[0] or matchIndex=[0,2]\n- All: replaceAll=true\n- Re-run with: edit(path="${filePath}", oldString="${oldString}", newString="${newString}", matchIndex=[0], _sessionId="${newSessionId}")`;

    return {
      content: [
        {
          type: "text",
          text: message,
        },
      ],
    };
  }

  private async handleInsert(filePath: string, content: string, lineNumber: number): Promise<any> {
    if (lineNumber < 1) {
      throw ToolError.createValidationError("lineNumber", lineNumber, "must be 1 or greater");
    }

    try {
      await access(filePath);
    } catch {
      throw ToolError.createValidationError("filePath", filePath, "File not found");
    }

    const fileContent = await readFile(filePath, "utf-8");
    const lines = fileContent.split("\n");

    if (lineNumber > lines.length + 1) {
      throw ToolError.createValidationError(
        "lineNumber",
        lineNumber,
        `Invalid line number. File has ${lines.length} lines (can insert at line ${lines.length + 1} to append)`
      );
    }

    lines.splice(lineNumber - 1, 0, content);
    const newContent = lines.join("\n");

    await writeFile(filePath, newContent, "utf-8");

    const resultDisplay = await this.generateResultDisplay(
      filePath,
      "Successfully inserted content",
      lineNumber
    );

    return {
      content: [
        {
          type: "text",
          text: resultDisplay,
        },
      ],
    };
  }

  // Add file to read tracking when read operations complete
  static markFileAsRead(filePath: string): void {
    fileReadTracker.markFileAsRead(filePath);
  }

  // [Copy all the helper methods from write.ts]
  private async generateResultDisplay(
    filePath: string,
    operation: string,
    lineNumber?: number
  ): Promise<string> {
    try {
      const content = await readFile(filePath, "utf-8");
      const lines = content.split("\n");

      if (lineNumber && lineNumber > 0 && lineNumber <= lines.length) {
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
        const totalLines = lines.length;
        const preview = lines
          .slice(0, 3)
          .map((line, i) => `  ${i + 1}: ${line}`)
          .join("\n");
        return `${operation}. File now has ${totalLines} lines:\n${preview}${totalLines > 3 ? "\n  ..." : ""}`;
      }
    } catch {
      return `${operation}.`;
    }
  }

  private cleanExpiredSessions(): void {
    const now = Date.now();
    for (const [sessionId, sessionData] of EditTool.sessions) {
      if (now - sessionData.timestamp > EditTool.SESSION_TIMEOUT) {
        EditTool.sessions.delete(sessionId);
      }
    }
  }

  private generateSessionId(): string {
    return Math.random().toString(36).substring(2, 11);
  }

  private findMatches(content: string, searchString: string): MatchInfo[] {
    const matches: MatchInfo[] = [];
    const lines = content.split("\n");
    let currentPos = 0;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex] || "";

      let searchPos = 0;
      while (true) {
        const matchPos = line.indexOf(searchString, searchPos);
        if (matchPos === -1) break;

        const contextBefore = lines.slice(Math.max(0, lineIndex - 2), lineIndex);
        const contextAfter = lines.slice(lineIndex + 1, Math.min(lines.length, lineIndex + 3));

        matches.push({
          index: matches.length,
          lineNumber: lineIndex + 1,
          startPos: currentPos + matchPos,
          endPos: currentPos + matchPos + searchString.length,
          contextBefore,
          contextAfter,
          matchedText: line,
        });

        searchPos = matchPos + 1;
      }

      currentPos += line.length + 1;
    }

    return matches;
  }

  private replaceAtMatch(content: string, match: MatchInfo, replacement: string): string {
    return content.substring(0, match.startPos) + replacement + content.substring(match.endPos);
  }

  private findSimilarStrings(
    content: string,
    target: string
  ): Array<{ text: string; line: number }> {
    const lines = content.split("\n");
    const suggestions: Array<{ text: string; line: number }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      const words = line.match(/\w+/g) || [];
      for (const word of words) {
        if (
          Math.abs(word.length - target.length) <= 2 &&
          this.calculateSimilarity(word, target) > 0.6
        ) {
          suggestions.push({ text: word, line: i + 1 });
        }
      }
    }

    return suggestions.slice(0, 3);
  }

  private calculateSimilarity(a: string, b: string): number {
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;

    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = Array(b.length + 1)
      .fill(null)
      .map(() => Array(a.length + 1).fill(0));

    for (let i = 0; i <= a.length; i++) matrix[0]![i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j]![0] = j;

    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
        const row = matrix[j]!;
        const prevRow = matrix[j - 1]!;
        row[i] = Math.min(row[i - 1]! + 1, prevRow[i]! + 1, prevRow[i - 1]! + substitutionCost);
      }
    }

    return matrix[b.length]![a.length]!;
  }

  private async tryFlexibleMatch(
    fileContent: string,
    filePath: string,
    oldString: string,
    newString: string
  ): Promise<any | null> {
    // 1. Check for complete line match first (for deletion)
    const lines = fileContent.split("\n");
    const lineIndex = lines.findIndex((line) => line === oldString);

    if (lineIndex !== -1 && newString === "") {
      // Complete line deletion - remove the line entirely
      lines.splice(lineIndex, 1);
      const newContent = lines.join("\n");
      await writeFile(filePath, newContent, "utf-8");

      const resultDisplay = await this.generateResultDisplay(
        filePath,
        "Successfully deleted 1 line (complete line match)"
      );
      return ResultFormatter.createResponse(resultDisplay);
    }

    // 2. Try exact match
    if (fileContent.includes(oldString)) {
      const newContent = fileContent.replace(oldString, newString);
      await writeFile(filePath, newContent, "utf-8");

      const resultDisplay = await this.generateResultDisplay(
        filePath,
        "Successfully replaced 1 occurrence (exact match)"
      );
      return ResultFormatter.createResponse(resultDisplay);
    }

    // 2. Try line-by-line matching with whitespace flexibility
    const oldLines = oldString.split("\n");
    const contentLines = fileContent.split("\n");

    for (let i = 0; i <= contentLines.length - oldLines.length; i++) {
      const potentialMatch = contentLines.slice(i, i + oldLines.length);

      // Compare lines with normalized whitespace
      const isMatch = oldLines.every((oldLine, j) => {
        const contentLine = potentialMatch[j];
        return oldLine.trim() === contentLine?.trim();
      });

      if (isMatch) {
        // Preserve original indentation
        const originalIndent = contentLines[i]?.match(/^\s*/)?.[0] || "";
        const newLines = newString.split("\n").map((line, j) => {
          if (j === 0) return originalIndent + line.trimStart();

          // For subsequent lines, preserve relative indentation
          const oldIndent = oldLines[j]?.match(/^\s*/)?.[0] || "";
          const newIndent = line.match(/^\s*/)?.[0] || "";

          if (oldIndent && newIndent) {
            // Calculate relative indentation
            const relativeIndent = originalIndent + newIndent.slice(oldIndent.length);
            return relativeIndent + line.trimStart();
          }

          return originalIndent + line.trimStart();
        });

        // Replace the matched lines
        const beforeLines = contentLines.slice(0, i);
        const afterLines = contentLines.slice(i + oldLines.length);
        const newContent = [...beforeLines, ...newLines, ...afterLines].join("\n");

        await writeFile(filePath, newContent, "utf-8");

        const resultDisplay = await this.generateResultDisplay(
          filePath,
          "Successfully replaced 1 occurrence (flexible match)",
          i + 1
        );
        return {
          content: [
            {
              type: "text",
              text: resultDisplay,
            },
          ],
        };
      }
    }

    return null; // No flexible match found
  }

  private async handleSessionReplace(
    filePath: string,
    sessionId: string,
    matchIndex?: number[],
    replaceAll?: boolean
  ): Promise<any> {
    const sessionData = EditTool.sessions.get(sessionId);
    if (!sessionData) {
      throw new Error(`Invalid or expired session: ${sessionId}`);
    }

    if (sessionData.filePath !== filePath) {
      throw new Error(`Session file path mismatch. Expected: ${sessionData.filePath}`);
    }

    const currentContent = await readFile(filePath, "utf-8");

    let replacementCount = 0;
    let newContent = currentContent;

    if (replaceAll) {
      newContent = newContent.replaceAll(sessionData.oldString, sessionData.newString);
      replacementCount = sessionData.matches.length;
    } else if (matchIndex && matchIndex.length > 0) {
      const sortedIndices = [...matchIndex].sort((a, b) => b - a);

      for (const index of sortedIndices) {
        if (index < 0 || index >= sessionData.matches.length) {
          throw new Error(
            `Invalid match index: ${index}. Valid range: 0-${sessionData.matches.length - 1}`
          );
        }

        const match = sessionData.matches[index];
        if (match) {
          const before = newContent.substring(0, match.startPos);
          const after = newContent.substring(match.endPos);
          newContent = before + sessionData.newString + after;
          replacementCount++;

          const lengthDiff = sessionData.newString.length - sessionData.oldString.length;
          for (let i = 0; i < sessionData.matches.length; i++) {
            const otherMatch = sessionData.matches[i];
            if (otherMatch && otherMatch.startPos > match.startPos) {
              otherMatch.startPos += lengthDiff;
              otherMatch.endPos += lengthDiff;
            }
          }
        }
      }
    } else {
      throw new Error(
        "Either replaceAll=true or matchIndex array must be specified for session replacement"
      );
    }

    await writeFile(filePath, newContent, "utf-8");

    const resultDisplay = await this.generateResultDisplay(
      filePath,
      `Successfully replaced ${replacementCount} occurrence(s)`
    );

    EditTool.sessions.delete(sessionId);

    return ResultFormatter.createResponse(resultDisplay);
  }

  private async handleBatchEdit(filePath: string, edits: any[]): Promise<any> {
    const resolvedPath = resolve(filePath);

    // Security validation
    await ToolValidation.validateFileAccess(resolvedPath, true);

    // Read file once
    const rawFileContent = await readFile(resolvedPath, "utf-8");
    let currentContent = this.normalizeLineEndings(rawFileContent);
    let totalChanges = 0;
    const results: string[] = [];

    // Apply each edit sequentially
    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i];
      const editNum = i + 1;

      try {
        const beforeContent = currentContent;

        // Determine edit type
        const isReplace = edit.oldString !== undefined && edit.newString !== undefined;
        const isInsert = edit.lineNumber !== undefined && edit.content !== undefined;

        if (!isReplace && !isInsert) {
          const editLabel = edits.length === 1 ? "❌ Invalid" : `Edit ${editNum}: ❌ Invalid`;
          results.push(
            `\n${editLabel} - must specify either (oldString+newString) or (lineNumber+content)\n`
          );
          continue;
        }

        if (isReplace && isInsert) {
          const editLabel = edits.length === 1 ? "❌ Invalid" : `Edit ${editNum}: ❌ Invalid`;
          results.push(`\n${editLabel} - cannot specify both replace and insert operations\n`);
          continue;
        }

        if (isReplace) {
          const normalizedOld = this.normalizeLineEndings(edit.oldString);
          const normalizedNew = this.normalizeLineEndings(edit.newString);

          // Check for complete line match first (for deletion)
          const lines = currentContent.split("\n");
          const lineIndex = lines.findIndex((line) => line === normalizedOld);

          if (lineIndex !== -1 && normalizedNew === "") {
            // Complete line deletion - remove the line entirely
            lines.splice(lineIndex, 1);
            currentContent = lines.join("\n");
            totalChanges++;

            const editLabel =
              edits.length === 1 ? "✅ Deleted line" : `Edit ${editNum}: ✅ Deleted line`;
            const contextDisplay = await this.generateEditContext(
              resolvedPath,
              lineIndex + 1,
              normalizedOld,
              ""
            );
            results.push(`\n${editLabel}\n\n${contextDisplay}\n`);
          }
          // Try flexible matching
          else if (currentContent.includes(normalizedOld)) {
            if (edit.replaceAll) {
              currentContent = currentContent.replaceAll(normalizedOld, normalizedNew);
              const count = (
                beforeContent.match(new RegExp(this.escapeRegex(normalizedOld), "g")) || []
              ).length;
              totalChanges += count;
              const editLabel = edits.length === 1 ? "✅ Replaced" : `Edit ${editNum}: ✅ Replaced`;
              results.push(`\n${editLabel} ${count} occurrences of "${edit.oldString}"\n`);
            } else {
              // Find line number before replacement
              const matchLine = normalizedOld.includes("\n")
                ? this.findMultilineMatch(currentContent, normalizedOld)
                : this.findLineNumber(currentContent, normalizedOld);
              currentContent = currentContent.replace(normalizedOld, normalizedNew);
              totalChanges++;

              // Generate detailed context display with diff
              const contextDisplay = await this.generateEditContext(
                resolvedPath,
                matchLine,
                normalizedOld,
                normalizedNew
              );
              const editLabel = edits.length === 1 ? "✅ Replaced" : `Edit ${editNum}: ✅ Replaced`;
              const editDisplay =
                edits.length === 1
                  ? `\n${editLabel}\n\n${contextDisplay}\n`
                  : `${editLabel} at line ${matchLine}\n\n${contextDisplay}\n`;
              results.push(editDisplay);
            }
          } else {
            const editLabel =
              edits.length === 1 ? "❌ No matches found" : `Edit ${editNum}: ❌ No matches found`;
            results.push(`\n${editLabel} for "${edit.oldString}"\n`);
          }
        } else if (isInsert) {
          // Insert operation
          const lines = currentContent.split("\n");

          if (edit.lineNumber < 1 || edit.lineNumber > lines.length + 1) {
            const editLabel =
              edits.length === 1
                ? "❌ Invalid line number"
                : `Edit ${editNum}: ❌ Invalid line number`;
            results.push(`\n${editLabel} ${edit.lineNumber} (file has ${lines.length} lines)\n`);
            continue;
          }

          lines.splice(edit.lineNumber - 1, 0, edit.content);
          currentContent = lines.join("\n");
          totalChanges++;

          // Generate detailed context display for insertion
          const contextDisplay = await this.generateEditContext(resolvedPath, edit.lineNumber);
          const editLabel = edits.length === 1 ? "✅ Inserted" : `Edit ${editNum}: ✅ Inserted`;
          results.push(`${editLabel} at line ${edit.lineNumber}\n\n${contextDisplay}\n`);
        }
      } catch (error: any) {
        const editLabel = edits.length === 1 ? "❌ Error" : `Edit ${editNum}: ❌ Error`;
        results.push(`\n${editLabel} - ${error.message}\n`);
      }
    }

    // Write file once if there were changes
    if (totalChanges > 0) {
      await writeFile(resolvedPath, currentContent, "utf-8");
    }

    // Generate summary
    const summary =
      edits.length === 1
        ? `Edit completed: ${totalChanges} change applied to ${resolvedPath}`
        : `Batch edit completed: ${totalChanges} changes applied across ${edits.length} operations to ${resolvedPath}`;
    const detailedResults = results.join("\n");

    const responseText =
      edits.length === 1
        ? `path: ${resolvedPath}\n${detailedResults}`
        : `${summary}\n\nDetails:\n${detailedResults}`;

    return ResultFormatter.createResponse(responseText);
  }

  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private findLineNumber(content: string, searchString: string): number {
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]?.includes(searchString)) {
        return i + 1; // 1-based line number
      }
    }
    return 1; // Default to line 1 if not found
  }

  private findMultilineMatch(content: string, searchString: string): number {
    // For multiline strings, find the actual starting line
    const index = content.indexOf(searchString);
    if (index === -1) return 1;

    const beforeMatch = content.substring(0, index);
    const lineNumber = beforeMatch.split("\n").length;
    return lineNumber;
  }

  private async generateEditContext(
    filePath: string,
    lineNumber: number,
    oldText?: string,
    newText?: string
  ): Promise<string> {
    try {
      const content = await readFile(filePath, "utf-8");
      const lines = content.split("\n");

      if (lineNumber > 0 && lineNumber <= lines.length) {
        const start = Math.max(0, lineNumber - 3);
        const end = Math.min(lines.length, lineNumber + 3);
        const contextLines = [];

        // Calculate max line number width for right alignment
        const maxLineNum = Math.min(lines.length, lineNumber + 3);
        const lineNumWidth = maxLineNum.toString().length;

        for (let i = start; i < end; i++) {
          const actualLineNum = i + 1;
          const line = lines[i] || "";
          const paddedLineNum = actualLineNum.toString().padStart(lineNumWidth, " ");

          if (actualLineNum === lineNumber) {
            if (oldText && newText === "") {
              // Show deletion - only old text with - marker
              contextLines.push(`${paddedLineNum}:- ${oldText}`);
            } else if (oldText && newText) {
              // Show diff for replaced content - handle multiline
              const oldLines = oldText.split("\n");
              const newLines = newText.split("\n");

              // Show old lines with - marker
              oldLines.forEach((oldLine, idx) => {
                const lineNum = (actualLineNum + idx).toString().padStart(lineNumWidth, " ");
                contextLines.push(`${lineNum}:- ${oldLine}`);
              });

              // Show new lines with + marker
              newLines.forEach((newLine, idx) => {
                const lineNum = (actualLineNum + idx).toString().padStart(lineNumWidth, " ");
                contextLines.push(`${lineNum}:+ ${newLine}`);
              });
            } else {
              // Show inserted/modified line
              contextLines.push(`${paddedLineNum}:+ ${line}`);
            }
          } else {
            // Show context lines
            contextLines.push(`${paddedLineNum}:  ${line}`);
          }
        }

        return contextLines.join("\n");
      } else {
        return `    Line ${lineNumber}: (context unavailable)`;
      }
    } catch {
      return `    Line ${lineNumber}: (error reading context)`;
    }
  }
}
