import { Injectable, Logger } from '@nestjs/common';
import { MessageContentBlock, MessageContentType } from '@folonite/shared';

/**
 * Agent types for specialized task handling
 */
export type AgentType = 
  | 'planner'      // Breaks down complex tasks
  | 'terminal'     // File operations, shell commands, code editing
  | 'desktop'      // UI automation, screenshots, mouse/keyboard
  | 'browser'      // Web navigation, DOM extraction
  | 'code'         // Code understanding, refactoring, analysis
  | 'vision';      // Image analysis, OCR, visual understanding

/**
 * Context shared between agents - optimized for token efficiency
 */
export interface AgentContext {
  taskId: string;
  goal: string;
  history: AgentAction[];
  files: FileReference[];
  currentDirectory: string;
  browserUrl?: string;
  desktopActive?: boolean;
  lastScreenshot?: string; // base64 hash, not full image
  accumulatedKnowledge: string[]; // Key findings, token-efficient
}

/**
 * Single action performed by an agent
 */
export interface AgentAction {
  agent: AgentType;
  action: string;
  result: 'success' | 'failure' | 'partial';
  summary: string; // Token-efficient summary
  timestamp: number;
}

/**
 * File reference with metadata (not full content)
 */
export interface FileReference {
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: number;
  contentHash?: string; // For caching
}

/**
 * Task routing decision
 */
export interface RoutingDecision {
  primaryAgent: AgentType;
  supportingAgents?: AgentType[];
  reason: string;
  estimatedSteps: number;
}

/**
 * Agent capability definition
 */
interface AgentCapability {
  type: AgentType;
  description: string;
  triggers: string[]; // Keywords that trigger this agent
  tools: string[];
  avgLatency: number; // ms
  tokenEfficiency: number; // 0-1, higher is more efficient
}

/**
 * Multi-Agent Orchestrator
 * 
 * Routes tasks to specialized agents for optimal performance.
 * Minimizes token usage by only passing relevant context.
 */
@Injectable()
export class AgentOrchestrator {
  private readonly logger = new Logger(AgentOrchestrator.name);
  
  private agentCapabilities: AgentCapability[] = [
    {
      type: 'planner',
      description: 'Breaks complex tasks into steps, selects agents',
      triggers: ['plan', 'break down', 'orchestrate', 'multi-step', 'complex'],
      tools: ['delegate', 'synthesize', 'verify'],
      avgLatency: 500,
      tokenEfficiency: 0.9,
    },
    {
      type: 'terminal',
      description: 'File operations, shell commands, code editing',
      triggers: ['file', 'directory', 'folder', 'read', 'write', 'edit', 'execute', 'run', 'command', 'terminal', 'shell', 'bash', 'npm', 'git', 'ls', 'cat', 'grep'],
      tools: ['read_file', 'write_file', 'execute_command', 'list_directory', 'search_files'],
      avgLatency: 300,
      tokenEfficiency: 0.95,
    },
    {
      type: 'desktop',
      description: 'UI automation, screenshots, mouse, keyboard',
      triggers: ['click', 'type', 'screenshot', 'screen', 'desktop', 'ui', 'button', 'window', 'mouse', 'keyboard', 'scroll', 'open app', 'application'],
      tools: ['screenshot', 'click', 'type', 'scroll', 'key', 'move_mouse', 'inspect_ui', 'search_ui', 'set_of_marks'],
      avgLatency: 800,
      tokenEfficiency: 0.7, // Screenshots are expensive
    },
    {
      type: 'browser',
      description: 'Web navigation, DOM extraction, web scraping',
      triggers: ['web', 'browser', 'website', 'url', 'http', 'html', 'dom', 'navigate', 'click link', 'form', 'page'],
      tools: ['navigate', 'click_element', 'extract_text', 'fill_form', 'screenshot'],
      avgLatency: 1000,
      tokenEfficiency: 0.75,
    },
    {
      type: 'code',
      description: 'Code analysis, refactoring, understanding',
      triggers: ['code', 'function', 'class', 'refactor', 'analyze code', 'understand', 'review', 'optimize', 'debug', 'error'],
      tools: ['analyze_code', 'find_references', 'suggest_refactor'],
      avgLatency: 600,
      tokenEfficiency: 0.85,
    },
    {
      type: 'vision',
      description: 'Image analysis, visual understanding',
      triggers: ['image', 'picture', 'visual', 'look at', 'analyze image', 'ocr', 'detect', 'elements'],
      tools: ['analyze_image', 'detect_elements', 'ocr', 'set_of_marks'],
      avgLatency: 700,
      tokenEfficiency: 0.6, // Images are expensive
    },
  ];

  /**
   * Determine which agent should handle a task
   */
  routeTask(goal: string, context?: Partial<AgentContext>): RoutingDecision {
    const goalLower = goal.toLowerCase();
    
    // Score each agent based on keyword matches
    const scores = this.agentCapabilities.map(cap => {
      let score = 0;
      cap.triggers.forEach(trigger => {
        if (goalLower.includes(trigger.toLowerCase())) {
          score += 1;
        }
      });
      return { type: cap.type, score, cap };
    });

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    // If no clear match, use planner
    if (scores[0].score === 0) {
      return {
        primaryAgent: 'planner',
        reason: 'No specific agent triggered, using planner to analyze',
        estimatedSteps: 3,
      };
    }

    const primary = scores[0];
    const supporting = scores
      .slice(1, 3)
      .filter(s => s.score > 0)
      .map(s => s.type);

    return {
      primaryAgent: primary.type,
      supportingAgents: supporting.length > 0 ? supporting : undefined,
      reason: `Matched keywords for ${primary.type} agent`,
      estimatedSteps: Math.ceil(goal.length / 50), // Rough estimate
    };
  }

  /**
   * Create optimized context for a specific agent
   * Removes irrelevant information to save tokens
   */
  createAgentContext(
    agentType: AgentType,
    fullContext: AgentContext,
  ): AgentContext {
    // Base context always included
    const optimized: AgentContext = {
      taskId: fullContext.taskId,
      goal: fullContext.goal,
      history: [], // Will filter
      files: [], // Will filter
      currentDirectory: fullContext.currentDirectory,
      accumulatedKnowledge: fullContext.accumulatedKnowledge.slice(-5), // Last 5 only
    };

    // Agent-specific filtering
    switch (agentType) {
      case 'terminal':
        // Terminal agent needs file operations history
        optimized.history = fullContext.history.filter(
          h => h.agent === 'terminal' || h.agent === 'code'
        );
        optimized.files = fullContext.files.slice(-10); // Recent files
        break;

      case 'desktop':
        // Desktop agent needs UI actions and screenshot reference
        optimized.history = fullContext.history.filter(
          h => h.agent === 'desktop' || h.agent === 'vision'
        );
        optimized.desktopActive = fullContext.desktopActive;
        optimized.lastScreenshot = fullContext.lastScreenshot;
        break;

      case 'browser':
        // Browser agent needs navigation history
        optimized.history = fullContext.history.filter(
          h => h.agent === 'browser'
        );
        optimized.browserUrl = fullContext.browserUrl;
        break;

      case 'code':
        // Code agent needs code-related actions
        optimized.history = fullContext.history.filter(
          h => h.agent === 'code' || h.agent === 'terminal'
        );
        optimized.files = fullContext.files.filter(f => 
          this.isCodeFile(f.path)
        );
        break;

      case 'vision':
        // Vision agent needs minimal context
        optimized.history = fullContext.history.filter(
          h => h.agent === 'vision' || h.agent === 'desktop'
        );
        break;

      case 'planner':
        // Planner needs full context
        optimized.history = fullContext.history;
        optimized.files = fullContext.files;
        optimized.accumulatedKnowledge = fullContext.accumulatedKnowledge;
        break;
    }

    // Limit history to last 5 relevant actions
    optimized.history = optimized.history.slice(-5);

    return optimized;
  }

  /**
   * Format context as compact text for LLM
   */
  formatContextForLLM(context: AgentContext): string {
    const lines: string[] = [];
    
    lines.push(`Task: ${context.goal}`);
    lines.push(`Dir: ${context.currentDirectory}`);
    
    if (context.browserUrl) {
      lines.push(`URL: ${context.browserUrl}`);
    }
    
    if (context.files.length > 0) {
      lines.push(`Files: ${context.files.map(f => f.path.split('/').pop()).join(', ')}`);
    }
    
    if (context.accumulatedKnowledge.length > 0) {
      lines.push('Knowledge:');
      context.accumulatedKnowledge.forEach(k => {
        lines.push(`  - ${k.substring(0, 100)}${k.length > 100 ? '...' : ''}`);
      });
    }
    
    if (context.history.length > 0) {
      lines.push('Recent:');
      context.history.forEach(h => {
        lines.push(`  ${h.agent}: ${h.action} → ${h.result}`);
      });
    }

    return lines.join('\n');
  }

  /**
   * Synthesize results from multiple agents
   */
  synthesizeResults(
    originalGoal: string,
    agentResults: Array<{ agent: AgentType; result: string }>,
  ): string {
    if (agentResults.length === 1) {
      return agentResults[0].result;
    }

    // Combine results efficiently
    const parts: string[] = [];
    parts.push(`Task: ${originalGoal}`);
    parts.push('');

    agentResults.forEach(({ agent, result }) => {
      parts.push(`[${agent.toUpperCase()}]`);
      // Truncate long results
      const truncated = result.length > 300 
        ? result.substring(0, 300) + '...' 
        : result;
      parts.push(truncated);
      parts.push('');
    });

    return parts.join('\n');
  }

  /**
   * Check if a file is a code file
   */
  private isCodeFile(path: string): boolean {
    const codeExtensions = [
      '.ts', '.tsx', '.js', '.jsx', '.json',
      '.py', '.rb', '.go', '.rs', '.java',
      '.cpp', '.c', '.h', '.hpp', '.cs',
      '.php', '.swift', '.kt', '.scala',
      '.html', '.css', '.scss', '.sass',
      '.yml', '.yaml', '.toml', '.xml',
      '.sh', '.bash', '.zsh', '.fish',
      '.md', '.markdown',
    ];
    const ext = path.substring(path.lastIndexOf('.')).toLowerCase();
    return codeExtensions.includes(ext);
  }

  /**
   * Get tool recommendations for an agent
   */
  getRecommendedTools(agentType: AgentType): string[] {
    const cap = this.agentCapabilities.find(c => c.type === agentType);
    return cap?.tools || [];
  }

  /**
   * Estimate token cost for an agent operation
   */
  estimateTokenCost(agentType: AgentType, complexity: number): number {
    const cap = this.agentCapabilities.find(c => c.type === agentType);
    if (!cap) return 1000;
    
    // Base cost / efficiency factor
    return Math.round((complexity * 100) / cap.tokenEfficiency);
  }
}
