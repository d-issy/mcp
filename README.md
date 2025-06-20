# File MCP Server

A Model Context Protocol (MCP) server providing comprehensive file operations.

## Usage

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "file": {
      "type": "stdio",
      "command": "npx",
      "args": ["github:d-issy/mcp"]
    }
  }
}
```

No local setup required! The server will be automatically downloaded and built on first use.

### Version Control

You can specify a particular version, branch, or commit:

```json
// Latest release
"args": ["github:d-issy/mcp#v0.1.0"]

// Specific branch  
"args": ["github:d-issy/mcp#main"]

// Specific commit
"args": ["github:d-issy/mcp#abc1234"]
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