# MCP Collection - Development Guide

This document contains development information for Claude Code users working on the MCP Collection project.

## Project Overview

This is a collection of Model Context Protocol (MCP) servers. The main goal is to provide various tools and capabilities through multiple, well-organized MCP servers.

## Development Setup

### Prerequisites

- Node.js 18+
- npm

### Getting Started

```bash
# Clone the repository
git clone https://github.com/d-issy/mcp.git
cd mcp

# Install dependencies
npm install

# Build all servers
npm run build
```

### Available Scripts

#### File MCP Server
```bash
# Run file-mcp server in development mode
npm run dev:file-mcp

# Start file-mcp server in production mode
npm run start:file-mcp
```

#### General Scripts
```bash
# Build all servers
npm run build

# Clean build artifacts
npm run clean

# Run linters
npm run lint
npm run check

# Format code
npm run format
```

## Project Structure

```
/
├── servers/
│   └── file-mcp/           # File operations MCP server
│       ├── index.ts        # Main server entry point
│       ├── lib/            # Shared utilities
│       ├── tools/          # Individual MCP tools
│       └── README.md       # User documentation
├── bin/
│   └── file-mcp           # Executable wrapper script
├── dist/
│   └── servers/
│       └── file-mcp/      # Built JavaScript files
├── package.json           # Project configuration
├── tsconfig.json          # TypeScript configuration
├── README.md              # User documentation
└── CLAUDE.md              # This development guide
```

## Adding New MCP Servers

### Step-by-Step Guide

1. **Create server directory:**
   ```bash
   mkdir servers/my-new-server
   ```

2. **Create server implementation:**
   Create `servers/my-new-server/index.ts`:
   ```typescript
   import { Server } from "@modelcontextprotocol/sdk/server/index.js";
   import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
   // ... implement your server
   ```

3. **Create user documentation:**
   Create `servers/my-new-server/README.md` with:
   - Installation instructions
   - Available tools
   - Usage examples
   - No development information (keep it user-focused)

4. **Create executable script:**
   Create `bin/my-new-server`:
   ```javascript
   #!/usr/bin/env node
   import { dirname, join } from 'path';
   import { fileURLToPath } from 'url';

   const __filename = fileURLToPath(import.meta.url);
   const __dirname = dirname(__filename);
   const scriptPath = join(__dirname, '..', 'dist', 'servers', 'my-new-server', 'index.js');

   await import(scriptPath);
   ```

   Don't forget to make it executable:
   ```bash
   chmod +x bin/my-new-server
   ```

5. **Update package.json:**
   Add npm scripts:
   ```json
   {
     "scripts": {
       "dev:my-new-server": "tsx servers/my-new-server/index.ts",
       "start:my-new-server": "node dist/servers/my-new-server/index.js"
     },
     "bin": {
       "file-mcp": "bin/file-mcp",
       "my-new-server": "bin/my-new-server"
     }
   }
   ```

6. **Update TypeScript configuration if needed:**
   Currently, tsconfig.json is configured for file-mcp only. For multiple servers, consider:
   - Creating a base configuration
   - Using project references
   - Or updating include/outDir patterns

7. **Update main README.md:**
   Add your server to the Available Servers table:
   ```markdown
   | **my-new-server** | Description of your server | [📖 Documentation](./servers/my-new-server/README.md) |
   ```

### Development Guidelines

- **Security First**: All tools should include comprehensive security validations
- **Error Handling**: Provide detailed, user-friendly error messages
- **Documentation**: Keep user docs (README.md) focused on functionality only
- **Testing**: Test your server thoroughly before adding to the collection
- **Consistency**: Follow the same patterns as existing servers

## Build System

- **TypeScript**: All servers are written in TypeScript
- **ESM**: Uses ES modules (`"type": "module"`)
- **Build Output**: `dist/servers/{server-name}/`
- **Executable Scripts**: Located in `bin/` directory

## Deployment

The project uses GitHub releases for deployment:

1. **Development**: Use branch references for testing
   ```json
   "args": ["-y", "github:d-issy/mcp#main", "server-name"]
   ```

2. **Production**: Use version tags for stability
   ```json
   "args": ["-y", "github:d-issy/mcp#v0.2.0", "server-name"] <!-- x-release-please-version -->
   ```

## Common Tasks

### Adding Dependencies

```bash
# Add runtime dependency
npm install package-name

# Add development dependency  
npm install -D package-name
```

### Debugging

```bash
# Run server with debugging
npm run dev:file-mcp

# Check build output
npm run build && ls -la dist/servers/
```

### Code Quality

```bash
# Run all checks
npm run check

# Fix formatting issues
npm run format

# Fix linting issues
npm run lint:biome:fix
```

## Notes for Claude Code Users

- This project follows the servers/ directory structure for scalability
- Each MCP server is independent but shares common build tooling
- User documentation (README.md files) should focus on functionality only
- Development information belongs in this CLAUDE.md file
- Always test locally before creating pull requests
- Use the npm scripts for consistency across development environments