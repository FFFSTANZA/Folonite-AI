import { Injectable, Logger } from '@nestjs/common';
import { AgentContext, AgentType, RoutingDecision } from './agent-orchestrator.service';

/**
 * Task Plan - Breakdown of complex task
 */
export interface TaskPlan {
  goal: string;
  steps: PlanStep[];
  estimatedTokens: number;
  estimatedTime: number;
  parallelizable: boolean;
  verificationCriteria: string[];
}

export interface PlanStep {
  id: number;
  agent: AgentType;
  instruction: string;
  dependsOn?: number[];
  expectedOutput: string;
  verification?: string;
  maxRetries?: number;
}

/**
 * Planner Agent - Breaks down complex tasks and coordinates execution
 * 
 * Token-efficient planning:
 * - Creates minimal but complete step descriptions
 * - Reuses context between steps
 * - Adjusts plan based on intermediate results
 */
@Injectable()
export class PlannerAgent {
  private readonly logger = new Logger(PlannerAgent.name);

  /**
   * Create a task plan
   */
  async createPlan(
    goal: string,
    context: AgentContext,
  ): Promise<TaskPlan> {
    this.logger.debug(`Creating plan for: ${goal}`);

    // Analyze goal complexity
    const complexity = this.analyzeComplexity(goal);
    
    // Determine optimal sequence of agents
    const steps = this.generateSteps(goal, complexity);
    
    // Calculate estimates
    const estimatedTokens = this.estimatePlanTokens(steps);
    const estimatedTime = steps.reduce((sum, s) => sum + this.estimateStepTime(s), 0);

    return {
      goal,
      steps,
      estimatedTokens,
      estimatedTime,
      parallelizable: complexity > 3,
      verificationCriteria: this.generateVerificationCriteria(goal),
    };
  }

  /**
   * Refine plan based on intermediate results
   */
  async refinePlan(
    currentPlan: TaskPlan,
    completedSteps: number[],
    stepResults: Map<number, any>,
  ): Promise<TaskPlan> {
    this.logger.debug(`Refining plan after steps: ${completedSteps.join(', ')}`);

    // Check if any step failed or needs adjustment
    const remainingSteps = currentPlan.steps.filter(
      s => !completedSteps.includes(s.id)
    );

    // Adjust future steps based on results
    const adjustedSteps = remainingSteps.map(step => {
      // If a dependency failed, adjust this step
      const failedDeps = step.dependsOn?.filter(
        dep => {
          const result = stepResults.get(dep);
          return result && !result.success;
        }
      );

      if (failedDeps && failedDeps.length > 0) {
        return {
          ...step,
          instruction: `${step.instruction} (Note: Step ${failedDeps.join(', ')} had issues, proceed with caution)`,
        };
      }

      return step;
    });

    return {
      ...currentPlan,
      steps: [
        ...currentPlan.steps.filter(s => completedSteps.includes(s.id)),
        ...adjustedSteps,
      ],
    };
  }

  /**
   * Analyze task complexity
   */
  private analyzeComplexity(goal: string): number {
    const indicators = [
      /and\s+then|after\s+that|next/i, // Sequential operations
      /find.*and.*(edit|update|delete)/i, // Multi-step operations
      /search.*for.*in.*then/i, // Search and act
      /compare|analyze.*and.*report/i, // Analysis tasks
      /multiple|several|all.*files/i, // Batch operations
      /create.*test.*implement/i, // Full development cycle
    ];

    let complexity = 1;
    indicators.forEach(pattern => {
      if (pattern.test(goal)) complexity++;
    });

    // Check for specific agent triggers
    const agentTypes = ['terminal', 'desktop', 'browser', 'code', 'vision'];
    const uniqueAgents = new Set<string>();
    agentTypes.forEach(type => {
      if (goal.toLowerCase().includes(type)) uniqueAgents.add(type);
    });
    complexity += uniqueAgents.size;

    return Math.min(complexity, 10);
  }

  /**
   * Generate execution steps
   */
  private generateSteps(goal: string, complexity: number): PlanStep[] {
    const steps: PlanStep[] = [];
    const lower = goal.toLowerCase();

    // Pattern-based step generation
    
    // Code editing pattern
    if (lower.match(/edit|modify|update|fix.*code|refactor/)) {
      steps.push(
        {
          id: 1,
          agent: 'terminal',
          instruction: `Find files related to: ${this.extractTopic(goal)}`,
          expectedOutput: 'File paths and contents',
          verification: 'Files found and readable',
        },
        {
          id: 2,
          agent: 'code',
          instruction: `Analyze code and propose changes for: ${goal}`,
          dependsOn: [1],
          expectedOutput: 'Code analysis and proposed changes',
          verification: 'Changes are syntactically valid',
        },
        {
          id: 3,
          agent: 'terminal',
          instruction: 'Apply the proposed changes',
          dependsOn: [2],
          expectedOutput: 'Modified files',
          verification: 'Files modified successfully',
        }
      );
    }

    // Web automation pattern
    else if (lower.match(/web|browser|site|url|http/)) {
      steps.push(
        {
          id: 1,
          agent: 'browser',
          instruction: `Navigate to: ${this.extractUrl(goal) || 'relevant URL'}`,
          expectedOutput: 'Page loaded with title and key elements',
          verification: 'Page loads without errors',
        },
        {
          id: 2,
          agent: 'browser',
          instruction: `Extract: ${this.extractTopic(goal)}`,
          dependsOn: [1],
          expectedOutput: 'Extracted content',
          verification: 'Content extracted successfully',
        }
      );
    }

    // UI automation pattern
    else if (lower.match(/click|type|screen|desktop|app|window|button/)) {
      steps.push(
        {
          id: 1,
          agent: 'desktop',
          instruction: 'Take screenshot and analyze UI state',
          expectedOutput: 'UI elements and current state',
          verification: 'Screenshot captured successfully',
        },
        {
          id: 2,
          agent: 'desktop',
          instruction: goal,
          dependsOn: [1],
          expectedOutput: 'Action completed',
          verification: 'UI state changed as expected',
        }
      );
    }

    // File search pattern
    else if (lower.match(/find|search.*file|locate/)) {
      steps.push({
        id: 1,
        agent: 'terminal',
        instruction: goal,
        expectedOutput: 'Search results with file paths',
        verification: 'Files found matching criteria',
      });
    }

    // Default: Single step with appropriate agent
    else {
      const agent = this.determineAgent(goal);
      steps.push({
        id: 1,
        agent,
        instruction: goal,
        expectedOutput: 'Task completed',
        verification: 'Goal achieved',
      });
    }

    // Add verification step for complex tasks
    if (complexity > 3) {
      steps.push({
        id: steps.length + 1,
        agent: 'planner',
        instruction: `Verify completion: ${goal}`,
        dependsOn: steps.map(s => s.id),
        expectedOutput: 'Verification result',
        verification: 'All criteria met',
      });
    }

    return steps;
  }

  /**
   * Determine primary agent for a task
   */
  private determineAgent(goal: string): AgentType {
    const lower = goal.toLowerCase();
    
    if (lower.match(/file|directory|read|write|edit|command/)) return 'terminal';
    if (lower.match(/click|type|screen|desktop|ui|button/)) return 'desktop';
    if (lower.match(/web|browser|site|url|http|html/)) return 'browser';
    if (lower.match(/code|function|class|refactor/)) return 'code';
    if (lower.match(/image|visual|look|ocr/)) return 'vision';
    
    return 'terminal'; // Default
  }

  /**
   * Extract topic from goal
   */
  private extractTopic(goal: string): string {
    // Remove action words
    return goal
      .replace(/\b(edit|modify|update|fix|create|make|add|remove|delete|find|search|get|show)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 50);
  }

  /**
   * Extract URL from goal
   */
  private extractUrl(goal: string): string | undefined {
    const match = goal.match(/(https?:\/\/[^\s]+)/);
    return match?.[1];
  }

  /**
   * Estimate tokens for plan
   */
  private estimatePlanTokens(steps: PlanStep[]): number {
    return steps.reduce((sum, step) => {
      return sum + step.instruction.length / 4 + 50;
    }, 100);
  }

  /**
   * Estimate time for step
   */
  private estimateStepTime(step: PlanStep): number {
    const baseTimes: Record<AgentType, number> = {
      planner: 500,
      terminal: 300,
      desktop: 800,
      browser: 1000,
      code: 600,
      vision: 700,
    };
    return baseTimes[step.agent] || 500;
  }

  /**
   * Generate verification criteria
   */
  private generateVerificationCriteria(goal: string): string[] {
    const criteria: string[] = [];
    const lower = goal.toLowerCase();

    if (lower.includes('file')) criteria.push('File operations completed successfully');
    if (lower.includes('code')) criteria.push('Code changes are syntactically correct');
    if (lower.includes('edit')) criteria.push('Edits match the requested changes');
    if (lower.includes('search')) criteria.push('Search returned relevant results');
    if (lower.includes('click') || lower.includes('type')) criteria.push('UI actions executed successfully');

    if (criteria.length === 0) {
      criteria.push('Task completed as requested');
    }

    return criteria;
  }

  /**
   * Format plan as compact text
   */
  formatPlanCompact(plan: TaskPlan): string {
    const lines: string[] = [];
    lines.push(`Plan: ${plan.goal}`);
    lines.push(`Steps: ${plan.steps.length} | Tokens: ~${plan.estimatedTokens} | Time: ~${plan.estimatedTime}ms`);
    lines.push('');

    plan.steps.forEach(step => {
      const deps = step.dependsOn?.length ? ` [after: ${step.dependsOn.join(',')}]` : '';
      lines.push(`${step.id}. [${step.agent}] ${step.instruction.substring(0, 60)}${deps}`);
    });

    return lines.join('\n');
  }

  /**
   * Check if plan needs replanning
   */
  shouldReplan(plan: TaskPlan, stepResults: Map<number, any>): boolean {
    // Check for failures
    for (const [stepId, result] of stepResults) {
      if (!result.success) {
        // If critical step failed, replan
        const step = plan.steps.find(s => s.id === stepId);
        if (step && !step.maxRetries) {
          return true;
        }
      }
    }

    // Check if we're way over token budget
    const actualTokens = Array.from(stepResults.values())
      .reduce((sum, r) => sum + (r.metadata?.tokenEstimate || 0), 0);
    
    if (actualTokens > plan.estimatedTokens * 2) {
      return true;
    }

    return false;
  }
}
