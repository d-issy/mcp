# File MCP Server

A comprehensive Model Context Protocol (MCP) server providing file operations with advanced safety features.

## Installation

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "file": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "github:d-issy/mcp#v0.2.0", "file-mcp"] <!-- x-release-please-version -->
    }
  }
}
```

No local setup required! The server will be automatically downloaded and built on first use.

### Version Control

You can specify a particular version, branch, or commit:

```json
// Latest release (recommended for production)
"args": ["-y", "github:d-issy/mcp#v0.1.1", "file-mcp"]

// Specific branch (for development)
"args": ["-y", "github:d-issy/mcp#main", "file-mcp"]

// Specific commit
"args": ["-y", "github:d-issy/mcp#abc1234", "file-mcp"]
```

## Available Tools

| Tool         | Description                                      | Key Features                                                                                                                        |
|--------------|--------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------|
| **`find`**   | Find files and directories with pattern matching | • Glob patterns (`*.js`, `**/*.test.ts`)<br>• Exclude patterns (`!**/node_modules/**`)<br>• Depth control and .gitignore respect |
| **`read`**   | Read file contents with safety checks            | • Line range support (`startLine`, `endLine`)<br>• Content size validation (20k char limit)<br>• Required for safe editing operations |
| **`write`**  | Write complete file contents                     | • Create new files or overwrite existing<br>• Parent directory auto-creation<br>• Requires prior read for existing files           |
| **`edit`**   | Edit files with batch operations                 | • Multiple edits in single operation<br>• String replacement and line insertion<br>• Requires prior read for safety                |
| **`grep`**   | Search file contents with regex                  | • Regular expression pattern matching<br>• Context lines around matches<br>• File pattern filtering (`*.js`, `*.{ts,tsx}`)        |
| **`move`**   | Move files with safety checks                    | • Cross-device move support<br>• Overwrite protection<br>• Current directory bounds validation                                      |
| **`copy`**   | Copy files with metadata preservation            | • Preserve timestamps and permissions<br>• Overwrite protection<br>• Auto-create destination directories                           |

All tools include comprehensive security validations and respect .gitignore files.

## Tool Details

### `find`
Find files and directories using glob patterns.

**Parameters:**
- `pattern` (string): Glob pattern to match files/directories
- `exclude` (string[], optional): Patterns to exclude from results
- `maxDepth` (number, optional): Maximum directory depth to search
- `includeHidden` (boolean, optional): Include hidden files (default: false)

**Examples:**
```javascript
// Find all TypeScript files
{ "pattern": "**/*.ts" }

// Find JavaScript files excluding node_modules
{ "pattern": "**/*.js", "exclude": ["**/node_modules/**"] }

// Find files in current directory only
{ "pattern": "*", "maxDepth": 1 }
```

### `read`
Read file contents with optional line range.

**Parameters:**
- `path` (string): File path to read
- `startLine` (number, optional): Start line number (1-based)
- `endLine` (number, optional): End line number (1-based)

**Examples:**
```javascript
// Read entire file
{ "path": "src/index.ts" }

// Read specific line range
{ "path": "package.json", "startLine": 1, "endLine": 10 }
```

### `write`
Write content to a file.

**Parameters:**
- `path` (string): File path to write
- `content` (string): Content to write

**Safety Features:**
- Requires prior read for existing files
- Automatically creates parent directories
- Content size validation

### `edit`
Perform batch edits on a file.

**Parameters:**
- `path` (string): File path to edit
- `edits` (array): Array of edit operations

**Edit Operations:**
- `{ "type": "replace", "old": "text", "new": "replacement" }`
- `{ "type": "insert", "line": 5, "content": "new line" }`

**Safety Features:**
- Requires prior read
- Atomic operations (all or nothing)
- Validates edit operations

### `grep`
Search file contents using regular expressions.

**Parameters:**
- `pattern` (string): Regular expression pattern
- `include` (string[], optional): File patterns to search
- `exclude` (string[], optional): File patterns to exclude
- `contextLines` (number, optional): Lines of context around matches

**Examples:**
```javascript
// Search for function definitions
{ "pattern": "function\\s+\\w+", "include": ["**/*.js"] }

// Search with context
{ "pattern": "TODO", "contextLines": 2 }
```

### `move`
Move files or directories.

**Parameters:**
- `source` (string): Source path
- `destination` (string): Destination path
- `overwrite` (boolean, optional): Allow overwriting (default: false)

**Safety Features:**
- Cross-device move support
- Overwrite protection
- Directory boundary validation

### `copy`
Copy files or directories.

**Parameters:**
- `source` (string): Source path
- `destination` (string): Destination path
- `overwrite` (boolean, optional): Allow overwriting (default: false)

**Features:**
- Preserves file metadata
- Recursive directory copying
- Automatic destination directory creation

## Security Features

- **Path Traversal Protection**: Prevents access outside working directory
- **.gitignore Respect**: Automatically excludes gitignored files
- **File Size Validation**: Limits file operations to reasonable sizes
- **Content Safety Checks**: Validates file content before operations
- **Directory Boundary Enforcement**: Restricts operations to current directory tree

## Error Handling

All tools provide detailed error messages and handle common scenarios:
- File not found
- Permission denied
- Invalid patterns
- Size limits exceeded
- Path security violations

## License

MIT