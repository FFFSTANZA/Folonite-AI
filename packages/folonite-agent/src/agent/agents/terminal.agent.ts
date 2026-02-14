import { Injectable, Logger } from '@nestjs/common';
import { AgentContext, AgentType } from './agent-orchestrator.service';

/**
 * Terminal Agent - Specialized for file operations and shell commands
 * 
 * Token-efficient design:
 * - Uses compact file listings (name, size, type only)
 * - Returns structured results, not verbose descriptions
 * - Caches file contents with hashes
 * - Batches operations when possible
 */
export interface TerminalResult {
  success: boolean;
  action: 'read' | 'write' | 'execute' | 'list' | 'search';
  path?: string;
  content?: string;
  output?: string;
  error?: string;
  files?: FileInfo[];
  metadata: {
    linesRead?: number;
    linesWritten?: number;
    bytesProcessed?: number;
    executionTime: number;
    tokenEstimate?: number;
  };
}

export interface FileInfo {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modified: string;
  isCode: boolean;
}

/**
 * Compact file content representation
 */
export interface FileContent {
  path: string;
  lines: string[];
  totalLines: number;
  startLine: number;
  hash: string; // For caching
}

@Injectable()
export class TerminalAgent {
  private readonly logger = new Logger(TerminalAgent.name);
  private readonly contentCache = new Map<string, FileContent>();

  /**
   * Execute a terminal operation based on intent
   */
  async execute(
    intent: string,
    context: AgentContext,
  ): Promise<TerminalResult> {
    const startTime = Date.now();

    // Parse intent to determine action
    const action = this.parseIntent(intent);
    
    this.logger.debug(`TerminalAgent executing: ${action.type} on ${action.path || 'N/A'}`);

    try {
      switch (action.type) {
        case 'read':
          return await this.readFile(action.path!, action.options, startTime);
        
        case 'write':
          return await this.writeFile(action.path!, action.content!, startTime);
        
        case 'list':
          return await this.listDirectory(action.path!, startTime);
        
        case 'search':
          return await this.searchFiles(action.pattern!, action.path, startTime);
        
        case 'execute':
          return await this.executeCommand(action.command!, context.currentDirectory, startTime);
        
        default:
          return {
            success: false,
            action: 'execute',
            error: `Unknown action type: ${action.type}`,
            metadata: { executionTime: Date.now() - startTime, tokenEstimate: 50 },
          };
      }
    } catch (error) {
      return {
        success: false,
        action: action.type || 'execute',
        error: error.message,
        metadata: { executionTime: Date.now() - startTime, tokenEstimate: 50 },
      };
    }
  }

  /**
   * Parse natural language intent into structured action
   */
  private parseIntent(intent: string): {
    type: 'read' | 'write' | 'list' | 'search' | 'execute';
    path?: string;
    pattern?: string;
    content?: string;
    command?: string;
    options?: { offset?: number; limit?: number };
  } {
    const lower = intent.toLowerCase();

    // Read file patterns
    if (lower.match(/read|show|display|cat|view|open.*file/)) {
      const path = this.extractPath(intent);
      return { 
        type: 'read', 
        path,
        options: this.extractLineRange(intent),
      };
    }

    // Write file patterns
    if (lower.match(/write|create|save|edit|modify|update/)) {
      const path = this.extractPath(intent);
      const content = this.extractContent(intent);
      return { type: 'write', path, content };
    }

    // List directory patterns
    if (lower.match(/list|ls|dir|show.*folder|show.*directory/)) {
      const path = this.extractPath(intent) || '.';
      return { type: 'list', path };
    }

    // Search patterns
    if (lower.match(/search|find|grep|look for/)) {
      const pattern = this.extractPattern(intent);
      const path = this.extractPath(intent);
      return { type: 'search', pattern, path };
    }

    // Default to command execution
    return { type: 'execute', command: intent };
  }

  /**
   * Read file with smart caching and pagination
   */
  private async readFile(
    filePath: string,
    options?: { offset?: number; limit?: number },
    startTime?: number,
  ): Promise<TerminalResult> {
    // Check cache first
    const cached = this.contentCache.get(filePath);
    
    // Call desktop service via HTTP
    const response = await this.callDesktopService({
      action: 'read_file',
      path: filePath,
    });

    if (!response.success) {
      return {
        success: false,
        action: 'read',
        path: filePath,
        error: response.error,
        metadata: { executionTime: Date.now() - (startTime || Date.now()), tokenEstimate: 50 },
      };
    }

    const lines = response.content.split('\n');
    const offset = options?.offset || 0;
    const limit = options?.limit || 50; // Max 50 lines at a time for token efficiency

    const selectedLines = lines.slice(offset, offset + limit);
    const tokenEstimate = Math.round(selectedLines.join('\n').length / 4) + 50;

    // Update cache
    this.contentCache.set(filePath, {
      path: filePath,
      lines: lines,
      totalLines: lines.length,
      startLine: 1,
      hash: this.simpleHash(response.content),
    });

    // Format compact output
    const formatted = this.formatFileOutput(filePath, selectedLines, offset, lines.length);

    return {
      success: true,
      action: 'read',
      path: filePath,
      content: formatted,
      metadata: {
        linesRead: selectedLines.length,
        bytesProcessed: response.content.length,
        executionTime: Date.now() - (startTime || Date.now()),
        tokenEstimate,
      },
    };
  }

  /**
   * Write file with validation
   */
  private async writeFile(
    filePath: string,
    content: string,
    startTime?: number,
  ): Promise<TerminalResult> {
    const response = await this.callDesktopService({
      action: 'write_file',
      path: filePath,
      content: content,
    });

    if (!response.success) {
      return {
        success: false,
        action: 'write',
        path: filePath,
        error: response.error,
        metadata: { executionTime: Date.now() - (startTime || Date.now()), tokenEstimate: 50 },
      };
    }

    // Invalidate cache
    this.contentCache.delete(filePath);

    const lines = content.split('\n');

    return {
      success: true,
      action: 'write',
      path: filePath,
      output: `Wrote ${lines.length} lines to ${filePath}`,
      metadata: {
        linesWritten: lines.length,
        bytesProcessed: content.length,
        executionTime: Date.now() - (startTime || Date.now()),
        tokenEstimate: Math.round(content.length / 4) + 50,
      },
    };
  }

  /**
   * List directory contents
   */
  private async listDirectory(
    dirPath: string,
    startTime?: number,
  ): Promise<TerminalResult> {
    const response = await this.callDesktopService({
      action: 'execute',
      command: `ls -la ${dirPath}`,
    });

    if (!response.success) {
      return {
        success: false,
        action: 'list',
        path: dirPath,
        error: response.error,
        metadata: { executionTime: Date.now() - (startTime || Date.now()), tokenEstimate: 50 },
      };
    }

    // Parse ls output to structured format
    const files = this.parseLsOutput(response.output, dirPath);

    // Format compact listing
    const formatted = this.formatDirectoryListing(files);

    return {
      success: true,
      action: 'list',
      path: dirPath,
      output: formatted,
      files: files.slice(0, 20), // Limit for token efficiency
      metadata: {
        executionTime: Date.now() - (startTime || Date.now()),
        tokenEstimate: Math.round(formatted.length / 4) + 50,
      },
    };
  }

  /**
   * Search files with grep
   */
  private async searchFiles(
    pattern: string,
    searchPath?: string,
    startTime?: number,
  ): Promise<TerminalResult> {
    const response = await this.callDesktopService({
      action: 'execute',
      command: `grep -r -n "${pattern}" ${searchPath || '.'} --include="*.ts" --include="*.js" --include="*.json" 2>/dev/null | head -20`,
    });

    if (!response.success) {
      return {
        success: false,
        action: 'search',
        error: response.error,
        metadata: { executionTime: Date.now() - (startTime || Date.now()), tokenEstimate: 50 },
      };
    }

    // Format results compactly
    const results = response.output
      .split('\n')
      .filter(line => line.trim())
      .slice(0, 10) // Limit for token efficiency
      .map(line => {
        const match = line.match(/^(.+):(\d+):(.+)$/);
        if (match) {
          return `${match[1]}:${match[2]}: ${match[3].substring(0, 60)}${match[3].length > 60 ? '...' : ''}`;
        }
        return line.substring(0, 80);
      })
      .join('\n');

    return {
      success: true,
      action: 'search',
      output: results || 'No matches found',
      metadata: {
        executionTime: Date.now() - (startTime || Date.now()),
        tokenEstimate: Math.round(results.length / 4) + 50,
      },
    };
  }

  /**
   * Execute shell command
   */
  private async executeCommand(
    command: string,
    cwd: string,
    startTime?: number,
  ): Promise<TerminalResult> {
    const response = await this.callDesktopService({
      action: 'execute',
      command: command,
      workingDir: cwd,
    });

    // Truncate output for token efficiency
    let output = response.output || '';
    if (output.length > 1000) {
      output = output.substring(0, 1000) + '\n... (truncated)';
    }

    return {
      success: response.success,
      action: 'execute',
      output: output,
      error: response.error,
      metadata: {
        executionTime: Date.now() - (startTime || Date.now()),
        tokenEstimate: Math.round(output.length / 4) + 50,
      },
    };
  }

  /**
   * Call the desktop service computer-use API
   */
  private async callDesktopService(payload: any): Promise<any> {
    const desktopUrl = process.env.FOLONITE_DESKTOP_URL || 'http://localhost:3002';
    
    const response = await fetch(`${desktopUrl}/computer-use/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Desktop service error: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Format file output compactly
   */
  private formatFileOutput(
    path: string,
    lines: string[],
    offset: number,
    totalLines: number,
  ): string {
    const parts: string[] = [];
    parts.push(`// ${path} (${offset + 1}-${offset + lines.length}/${totalLines})`);
    
    lines.forEach((line, i) => {
      const lineNum = (offset + i + 1).toString().padStart(4, ' ');
      parts.push(`${lineNum}| ${line}`);
    });

    if (offset + lines.length < totalLines) {
      parts.push(`// ... ${totalLines - offset - lines.length} more lines`);
    }

    return parts.join('\n');
  }

  /**
   * Format directory listing compactly
   */
  private formatDirectoryListing(files: FileInfo[]): string {
    const dirs = files.filter(f => f.type === 'directory');
    const codeFiles = files.filter(f => f.type === 'file' && f.isCode);
    const otherFiles = files.filter(f => f.type === 'file' && !f.isCode);

    const parts: string[] = [];
    
    if (dirs.length > 0) {
      parts.push(`📁 ${dirs.map(d => d.name).join(', ')}`);
    }
    if (codeFiles.length > 0) {
      parts.push(`📄 ${codeFiles.map(f => f.name).join(', ')}`);
    }
    if (otherFiles.length > 0) {
      parts.push(`📝 ${otherFiles.map(f => f.name).join(', ')}`);
    }

    return parts.join('\n');
  }

  /**
   * Parse ls -la output
   */
  private parseLsOutput(output: string, basePath: string): FileInfo[] {
    return output
      .split('\n')
      .slice(1) // Skip total line
      .filter(line => line.trim() && !line.endsWith('.') && !line.endsWith('..'))
      .map(line => {
        const parts = line.split(/\s+/);
        const type = parts[0].startsWith('d') ? 'directory' : 'file';
        const size = parseInt(parts[4]) || 0;
        const name = parts.slice(8).join(' ');
        return {
          name,
          path: `${basePath}/${name}`,
          type,
          size,
          modified: `${parts[5]} ${parts[6]} ${parts[7]}`,
          isCode: this.isCodeFile(name),
        };
      });
  }

  /**
   * Extract path from intent
   */
  private extractPath(intent: string): string | undefined {
    // Match quoted paths
    const quoted = intent.match(/["']([^"']+)["']/);
    if (quoted) return quoted[1];

    // Match paths after common keywords
    const patterns = [
      /(?:read|cat|open|view|show)\s+(?:file\s+)?(.+?)(?:\s|$)/i,
      /(?:write|save|edit)\s+(?:to\s+)?(.+?)(?:\s|$)/i,
      /(?:in|from|to|of)\s+(.+?)(?:\s|$)/i,
    ];

    for (const pattern of patterns) {
      const match = intent.match(pattern);
      if (match) return match[1].trim();
    }

    return undefined;
  }

  /**
   * Extract content from intent
   */
  private extractContent(intent: string): string | undefined {
    const match = intent.match(/(?:with content|containing|that says)\s+["'](.+)["']/i);
    return match ? match[1] : undefined;
  }

  /**
   * Extract pattern from intent
   */
  private extractPattern(intent: string): string | undefined {
    const quoted = intent.match(/["']([^"']+)["']/);
    return quoted ? quoted[1] : undefined;
  }

  /**
   * Extract line range from intent
   */
  private extractLineRange(intent: string): { offset?: number; limit?: number } {
    const match = intent.match(/(?:lines?|from)\s+(\d+)(?:\s*-\s*(\d+))?/i);
    if (match) {
      const start = parseInt(match[1]) - 1;
      const end = match[2] ? parseInt(match[2]) : undefined;
      return {
        offset: start,
        limit: end ? end - start : 50,
      };
    }
    return {};
  }

  /**
   * Simple hash for caching
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  /**
   * Check if file is a code file
   */
  private isCodeFile(name: string): boolean {
    const codeExts = ['.ts', '.tsx', '.js', '.jsx', '.json', '.py', '.rb', '.go', '.rs', '.java', '.cpp', '.c', '.h'];
    return codeExts.some(ext => name.endsWith(ext));
  }
}
