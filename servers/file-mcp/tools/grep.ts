import { relative } from "node:path";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { DirectoryUtils } from "../lib/directory-utils.js";
import { FileUtils } from "../lib/file-utils.js";
import { GrepToolInputSchema } from "../lib/schemas.js";
import { ResultFormatter, TOOL_CONSTANTS, ToolError } from "../lib/tool-utils.js";

interface GrepMatch {
  lineNumber: number;
  content: string;
  isMatch: boolean;
}

export class GrepTool {
  private outputLength = 0;

  getName(): string {
    return "grep";
  }

  getDefinition(): Tool {
    return {
      name: "grep",
      description: "Search file contents using regular expressions with ripgrep-style output",
      inputSchema: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "The regular expression pattern to search for in file contents",
          },
          path: {
            type: "string",
            description: "The directory to search in. Defaults to the current working directory.",
          },
          include: {
            type: "string",
            description:
              'File pattern to include in the search (e.g. "*.js", "*.{ts,tsx}", "!**/node_modules/**")',
          },
          beforeContext: {
            type: "number",
            description: "Show NUM lines before each match",
          },
          afterContext: {
            type: "number",
            description: "Show NUM lines after each match",
          },
          context: {
            type: "number",
            description: "Show NUM lines before and after each match",
          },
          multiline: {
            type: "boolean",
            description: "Enable multiline pattern matching",
            default: false,
          },
          maxCount: {
            type: "number",
            description: "Maximum number of matches per file (default: 5)",
            default: 5,
          },
        },
        required: ["pattern"],
      },
    };
  }

  async execute(args: any): Promise<any> {
    try {
      // Validate and parse input using Zod schema
      const validatedArgs = GrepToolInputSchema.parse(args);
      const { pattern, path, include, beforeContext, afterContext, context, multiline, maxCount } =
        validatedArgs;

      // Reset output length for each execution
      this.outputLength = 0;

      // Calculate actual before/after context
      const actualBefore = context !== undefined ? context : beforeContext;
      const actualAfter = context !== undefined ? context : afterContext;

      // Path validation is handled by DirectoryUtils

      // Create regex pattern with enhanced error handling
      const regexFlags = multiline ? "gm" : "g";
      let regex: RegExp;

      try {
        regex = new RegExp(pattern, regexFlags);
      } catch (error: any) {
        throw new Error(this.createFriendlyRegexError(pattern, error.message));
      }

      let result = "";
      let totalMatches = 0;
      let filesWithMatches = 0;
      let filesSearched = 0;

      // Check if path is a single file or directory
      let filesToSearch: string[] = [];
      let results: any[] = [];
      const MAX_FILES = 20;

      try {
        const stats = await FileUtils.getFileStats(path);
        if (stats.isFile) {
          // Single file case
          filesToSearch = [path];
          filesSearched = 1;
        } else {
          throw new Error("Not a file");
        }
      } catch {
        // Not a file, treat as directory
        results = await DirectoryUtils.findFiles(path, include, {
          maxDepth: 3,
          includeIgnored: false,
          includeFiles: true,
          includeDirectories: false,
        });

        // Limit number of files to search for performance
        filesToSearch = results.slice(0, MAX_FILES).map((r) => r.path);
      }

      for (const file of filesToSearch) {
        if (filesSearched === 1 && filesToSearch.length === 1) {
          // Single file case, already counted
        } else {
          filesSearched++;
        }

        try {
          // Use FileUtils for safe file reading with built-in security checks
          const content = await FileUtils.safeReadFile(file, {
            maxSize: TOOL_CONSTANTS.OUTPUT_LIMIT,
            checkIsBinary: true,
          });

          // Search for matches
          const matches = this.searchContent(content, regex, actualBefore, actualAfter, maxCount);

          if (matches.length > 0) {
            filesWithMatches++;
            const relativePath = relative(process.cwd(), file);

            // Add file header
            const header = `${relativePath}\n`;
            result += header;
            this.addToOutput(header);

            // Add matches with context
            let displayedMatches = 0;
            let totalFileMatches = 0;

            for (const match of matches) {
              if (displayedMatches >= maxCount) {
                totalFileMatches = this.countTotalMatches(content, regex);
                break;
              }

              const line = `${match.lineNumber}${match.isMatch ? ":" : "-"}${match.content}\n`;
              result += line;
              this.addToOutput(line);

              if (match.isMatch) {
                displayedMatches++;
                totalMatches++;
              }
            }

            // Show continuation message if there are more matches
            if (totalFileMatches > maxCount) {
              const remaining = totalFileMatches - maxCount;
              const continuation = `\n... and ${remaining} more matches (showing first ${maxCount})\nUse maxCount=${Math.min(totalFileMatches, maxCount * 2)} to see more matches\n`;
              result += continuation;
              this.addToOutput(continuation);
            }

            const separator = "\n";
            result += separator;
            this.addToOutput(separator);
          }
        } catch (_error) {}
      }

      // Add summary
      let summary = "";
      if (totalMatches === 0) {
        summary = "No matches found";
      } else {
        summary = `${totalMatches} match${totalMatches === 1 ? "" : "es"} found in ${filesWithMatches} file${filesWithMatches === 1 ? "" : "s"}`;
        if (results.length > MAX_FILES) {
          summary += ` (limited to first ${MAX_FILES} files)`;
        }
      }
      summary += "\n";
      result += summary;
      this.addToOutput(summary);

      return ResultFormatter.createResponse(result);
    } catch (error: any) {
      // Handle Zod validation errors
      if (error instanceof Error && error.name === "ZodError") {
        throw ToolError.createValidationError("input", args, `Invalid input: ${error.message}`);
      }
      // If it's already our friendly regex error, don't wrap it
      if (error.message.includes("Regex pattern error:")) {
        throw error;
      }
      throw ToolError.wrapError("Grep search", error);
    }
  }

  private addToOutput(text: string): void {
    this.outputLength += text.length;
    if (this.outputLength > TOOL_CONSTANTS.OUTPUT_LIMIT) {
      throw new Error(
        `Output limit exceeded (${TOOL_CONSTANTS.OUTPUT_LIMIT.toLocaleString()} characters)\nUse more specific pattern or include filter to narrow search`
      );
    }
  }

  private searchContent(
    content: string,
    regex: RegExp,
    beforeContext: number,
    afterContext: number,
    maxCount: number
  ): GrepMatch[] {
    const lines = content.split("\n");
    const matches: GrepMatch[] = [];
    const matchedLines = new Set<number>();
    let matchCount = 0;

    // Find all matches
    for (let i = 0; i < lines.length && matchCount < maxCount; i++) {
      const line = lines[i];
      if (line !== undefined && regex.test(line)) {
        matchedLines.add(i);
        matchCount++;
      }
    }

    // Build result with context
    const processedLines = new Set<number>();

    for (const matchLine of Array.from(matchedLines).sort((a, b) => a - b)) {
      // Add before context
      for (let i = Math.max(0, matchLine - beforeContext); i < matchLine; i++) {
        if (!processedLines.has(i)) {
          const line = lines[i];
          if (line !== undefined) {
            matches.push({
              lineNumber: i + 1,
              content: line,
              isMatch: false,
            });
            processedLines.add(i);
          }
        }
      }

      // Add match line
      if (!processedLines.has(matchLine)) {
        const line = lines[matchLine];
        if (line !== undefined) {
          matches.push({
            lineNumber: matchLine + 1,
            content: line,
            isMatch: true,
          });
          processedLines.add(matchLine);
        }
      }

      // Add after context
      for (let i = matchLine + 1; i <= Math.min(lines.length - 1, matchLine + afterContext); i++) {
        if (!processedLines.has(i)) {
          const line = lines[i];
          if (line !== undefined) {
            matches.push({
              lineNumber: i + 1,
              content: line,
              isMatch: false,
            });
            processedLines.add(i);
          }
        }
      }
    }

    return matches;
  }

  private countTotalMatches(content: string, regex: RegExp): number {
    const lines = content.split("\n");
    let count = 0;

    for (const line of lines) {
      if (regex.test(line)) {
        count++;
      }
    }

    return count;
  }

  private createFriendlyRegexError(pattern: string, originalError: string): string {
    // Common regex error patterns with friendly explanations
    const errorPatterns = [
      {
        test: /nothing to repeat/i,
        detect: () => /^[+*?]/.test(pattern) || /[+*?]{2,}/.test(pattern),
        explain: (p: string) => {
          const problematicChar = p.match(/^([+*?])/)?.[1] || p.match(/([+*?])/)?.[1];
          return {
            issue: `Repetition operator '${problematicChar}' has nothing to repeat`,
            position: p.indexOf(problematicChar!),
            suggestion: `Use "\\${problematicChar}" to match literal character, or add something before ${problematicChar} to repeat`,
          };
        },
      },
      {
        test: /unterminated group|unclosed group/i,
        detect: () => this.hasUnmatchedParens(pattern),
        explain: (p: string) => {
          const openIndex = p.indexOf("(");
          return {
            issue: "Unclosed parentheses group",
            position: openIndex,
            suggestion: 'Add closing ")" or use "\\(" to match literal parenthesis',
          };
        },
      },
      {
        test: /unterminated character class/i,
        detect: () => this.hasUnmatchedBrackets(pattern),
        explain: (p: string) => {
          const openIndex = p.indexOf("[");
          return {
            issue: "Unclosed character class",
            position: openIndex,
            suggestion: 'Add closing "]" or use "\\[" to match literal bracket',
          };
        },
      },
    ];

    // Find matching error pattern
    for (const errorPattern of errorPatterns) {
      if (errorPattern.test.test(originalError) && errorPattern.detect()) {
        const explanation = errorPattern.explain(pattern);
        return this.formatRegexError(pattern, explanation);
      }
    }

    // Generic fallback
    return `Regex pattern error in "${pattern}": ${originalError}

Common fixes:
- Escape special characters: \\+ \\* \\? \\( \\) \\[ \\] \\{ \\}
- Use literal search: Consider if you need regex at all
- Check parentheses and brackets are properly closed`;
  }

  private hasUnmatchedParens(pattern: string): boolean {
    let count = 0;
    for (const char of pattern) {
      if (char === "(") count++;
      if (char === ")") count--;
      if (count < 0) return true;
    }
    return count !== 0;
  }

  private hasUnmatchedBrackets(pattern: string): boolean {
    let inClass = false;
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i] === "[" && (i === 0 || pattern[i - 1] !== "\\")) {
        inClass = true;
      }
      if (pattern[i] === "]" && (i === 0 || pattern[i - 1] !== "\\") && inClass) {
        inClass = false;
      }
    }
    return inClass;
  }

  private formatRegexError(
    pattern: string,
    explanation: { issue: string; position: number; suggestion: string }
  ): string {
    const pointer = `${" ".repeat(explanation.position)}^`;

    return `Regex pattern error:
Pattern: "${pattern}"
         ${pointer}
Error: ${explanation.issue}
Suggestion: ${explanation.suggestion}

Examples:
- Literal search: Use backslash (\\+, \\*, \\()
- Pattern search: Ensure proper syntax (.+, .*, .?)`;
  }
}
