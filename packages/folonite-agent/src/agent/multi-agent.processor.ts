import { Injectable, Logger } from '@nestjs/common';
import { AgentOrchestrator, AgentContext, AgentType } from './agents/agent-orchestrator.service';
import { TerminalAgent, TerminalResult } from './agents/terminal.agent';
import { DesktopAgent, DesktopResult } from './agents/desktop.agent';
import { BrowserAgent, BrowserResult } from './agents/browser.agent';
import { PlannerAgent, TaskPlan } from './agents/planner.agent';
import { MessageContentBlock, MessageContentType } from '@folonite/shared';

/**
 * Multi-Agent Processor
 * 
 * Coordinates specialized agents for optimal task execution.
 * Key features:
 * - Intelligent task routing to appropriate agent
 * - Token-efficient context management
 * - Parallel execution where possible
 * - Automatic replanning on failure
 */
export interface MultiAgentResult {
  success: boolean;
  plan: TaskPlan;
  executions: AgentExecution[];
  finalOutput: string;
  totalTokens: number;
  totalTime: number;
}

export interface AgentExecution {
  stepId: number;
  agent: AgentType;
  instruction: string;
  result: 'success' | 'failure' | 'partial';
  output: string;
  tokensUsed: number;
  executionTime: number;
  timestamp: number;
}

@Injectable()
export class MultiAgentProcessor {
  private readonly logger = new Logger(MultiAgentProcessor.name);

  constructor(
    private readonly orchestrator: AgentOrchestrator,
    private readonly terminalAgent: TerminalAgent,
    private readonly desktopAgent: DesktopAgent,
    private readonly browserAgent: BrowserAgent,
    private readonly plannerAgent: PlannerAgent,
  ) {}

  /**
   * Process a task using the multi-agent system
   */
  async processTask(
    goal: string,
    taskId: string,
    options?: {
      requirePlan?: boolean;
      maxSteps?: number;
      maxTokens?: number;
    },
  ): Promise<MultiAgentResult> {
    const startTime = Date.now();
    const maxSteps = options?.maxSteps || 10;
    const maxTokens = options?.maxTokens || 10000;

    this.logger.log(`Multi-agent processing for task: ${goal}`);

    // Initialize context
    const context: AgentContext = {
      taskId,
      goal,
      history: [],
      files: [],
      currentDirectory: '/home/user',
      accumulatedKnowledge: [],
    };

    // Check if we need planning
    const routing = this.orchestrator.routeTask(goal);
    let plan: TaskPlan;

    if (options?.requirePlan !== false && (routing.estimatedSteps > 1 || routing.supportingAgents)) {
      // Create plan
      plan = await this.plannerAgent.createPlan(goal, context);
      this.logger.log(`Created plan with ${plan.steps.length} steps`);
    } else {
      // Simple single-step plan
      plan = {
        goal,
        steps: [{
          id: 1,
          agent: routing.primaryAgent,
          instruction: goal,
          expectedOutput: 'Task completed',
        }],
        estimatedTokens: 500,
        estimatedTime: 1000,
        parallelizable: false,
        verificationCriteria: ['Task completed'],
      };
    }

    // Execute plan
    const executions: AgentExecution[] = [];
    let totalTokens = 0;
    let completedSteps = new Set<number>();
    let stepResults = new Map<number, any>();

    for (const step of plan.steps) {
      // Check dependencies
      if (step.dependsOn) {
        const depsMet = step.dependsOn.every(d => completedSteps.has(d));
        if (!depsMet) {
          this.logger.warn(`Skipping step ${step.id}: dependencies not met`);
          continue;
        }
      }

      // Check limits
      if (executions.length >= maxSteps || totalTokens >= maxTokens) {
        this.logger.warn('Reached execution limits');
        break;
      }

      // Execute step
      const execution = await this.executeStep(step, context);
      executions.push(execution);
      totalTokens += execution.tokensUsed;

      // Update context
      context.history.push({
        agent: step.agent,
        action: step.instruction,
        result: execution.result,
        summary: execution.output.substring(0, 200),
        timestamp: Date.now(),
      });

      // Track results
      completedSteps.add(step.id);
      stepResults.set(step.id, { success: execution.result === 'success', output: execution.output });

      // Check for replanning
      if (this.plannerAgent.shouldReplan(plan, stepResults)) {
        this.logger.log('Replanning due to unexpected results');
        plan = await this.plannerAgent.refinePlan(plan, Array.from(completedSteps), stepResults);
      }
    }

    // Synthesize final output
    const finalOutput = this.synthesizeOutput(goal, executions);

    return {
      success: executions.every(e => e.result === 'success'),
      plan,
      executions,
      finalOutput,
      totalTokens,
      totalTime: Date.now() - startTime,
    };
  }

  /**
   * Execute a single plan step
   */
  private async executeStep(
    step: { id: number; agent: AgentType; instruction: string },
    context: AgentContext,
  ): Promise<AgentExecution> {
    const startTime = Date.now();
    
    this.logger.debug(`Executing step ${step.id} with ${step.agent}: ${step.instruction}`);

    // Get optimized context for this agent
    const optimizedContext = this.orchestrator.createAgentContext(step.agent, context);

    let result: TerminalResult | DesktopResult | BrowserResult;
    let tokensUsed = 0;

    try {
      switch (step.agent) {
        case 'terminal':
          result = await this.terminalAgent.execute(step.instruction, optimizedContext);
          break;
        
        case 'desktop':
          result = await this.desktopAgent.execute(step.instruction, optimizedContext);
          break;
        
        case 'browser':
          result = await this.browserAgent.execute(step.instruction, optimizedContext);
          break;
        
        case 'planner':
          // Planner steps are verification/synthesis
          result = {
            success: true,
            action: 'inspect',
            uiState: undefined,
            metadata: {
              executionTime: 0,
              usedVision: false,
              tokenEstimate: 100,
            },
          };
          break;
        
        default:
          throw new Error(`Unknown agent type: ${step.agent}`);
      }

      tokensUsed = result.metadata?.tokenEstimate || 100;

      // Format output based on agent type
      const output = this.formatAgentOutput(step.agent, result);

      return {
        stepId: step.id,
        agent: step.agent,
        instruction: step.instruction,
        result: result.success ? 'success' : 'failure',
        output,
        tokensUsed,
        executionTime: Date.now() - startTime,
        timestamp: Date.now(),
      };

    } catch (error) {
      return {
        stepId: step.id,
        agent: step.agent,
        instruction: step.instruction,
        result: 'failure',
        output: `Error: ${error.message}`,
        tokensUsed: 50,
        executionTime: Date.now() - startTime,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Format agent output compactly
   */
  private formatAgentOutput(
    agent: AgentType,
    result: TerminalResult | DesktopResult | BrowserResult,
  ): string {
    const parts: string[] = [];

    if ('content' in result && result.content) {
      parts.push(result.content);
    }
    
    if ('output' in result && result.output) {
      parts.push(result.output);
    }
    
    if ('uiState' in result && result.uiState) {
      parts.push(result.uiState.summary);
      if (result.uiState.elements && result.uiState.elements.length > 0) {
        const elementSummary = result.uiState.elements
          .slice(0, 5)
          .map(e => `${e.type}${e.text ? `: ${e.text.substring(0, 20)}` : ''}`)
          .join(', ');
        parts.push(`Elements: ${elementSummary}`);
      }
    }

    if (result.error) {
      parts.push(`Error: ${result.error}`);
    }

    return parts.join('\n');
  }

  /**
   * Synthesize final output from all executions
   */
  private synthesizeOutput(goal: string, executions: AgentExecution[]): string {
    const successful = executions.filter(e => e.result === 'success');
    const failed = executions.filter(e => e.result === 'failure');

    const lines: string[] = [];
    lines.push(`Task: ${goal}`);
    lines.push(`Steps: ${successful.length}/${executions.length} succeeded`);
    lines.push('');

    if (successful.length > 0) {
      lines.push('Results:');
      successful.forEach(e => {
        const output = e.output.substring(0, 200);
        lines.push(`  [${e.agent}] ${output}${e.output.length > 200 ? '...' : ''}`);
      });
    }

    if (failed.length > 0) {
      lines.push('\nIssues:');
      failed.forEach(e => {
        lines.push(`  [${e.agent}] ${e.output.substring(0, 100)}`);
      });
    }

    return lines.join('\n');
  }

  /**
   * Quick execute - routes to appropriate agent without planning
   */
  async quickExecute(
    intent: string,
    context: Partial<AgentContext>,
  ): Promise<{ success: boolean; output: string; tokens: number }> {
    const routing = this.orchestrator.routeTask(intent);
    const fullContext: AgentContext = {
      taskId: context.taskId || 'quick',
      goal: intent,
      history: context.history || [],
      files: context.files || [],
      currentDirectory: context.currentDirectory || '/home/user',
      accumulatedKnowledge: context.accumulatedKnowledge || [],
    };

    const step = {
      id: 1,
      agent: routing.primaryAgent,
      instruction: intent,
    };

    const execution = await this.executeStep(step, fullContext);

    return {
      success: execution.result === 'success',
      output: execution.output,
      tokens: execution.tokensUsed,
    };
  }

  /**
   * Get token usage estimate for a task
   */
  estimateTokenUsage(goal: string): number {
    const routing = this.orchestrator.routeTask(goal);
    return this.orchestrator.estimateTokenCost(routing.primaryAgent, routing.estimatedSteps);
  }

  /**
   * Format result as message content blocks
   */
  formatAsMessageContent(result: MultiAgentResult): MessageContentBlock[] {
    const blocks: any[] = [];

    // Text summary
    blocks.push({
      type: MessageContentType.Text,
      text: result.finalOutput,
    });

    // Include any screenshots
    result.executions.forEach(exec => {
      if (exec.agent === 'desktop' || exec.agent === 'browser') {
        // Extract base64 image if present
        const imageMatch = exec.output.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/);
        if (imageMatch) {
          blocks.push({
            type: MessageContentType.Image,
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: imageMatch[1],
            },
          });
        }
      }
    });

    return blocks;
  }
}
