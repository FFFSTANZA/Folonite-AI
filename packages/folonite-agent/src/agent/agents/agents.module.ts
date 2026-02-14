import { Module } from '@nestjs/common';
import { AgentOrchestrator } from './agent-orchestrator.service';
import { TerminalAgent } from './terminal.agent';
import { DesktopAgent } from './desktop.agent';
import { BrowserAgent } from './browser.agent';
import { PlannerAgent } from './planner.agent';

/**
 * Multi-Agent Module
 * 
 * Provides specialized agents for different task types:
 * - TerminalAgent: File operations, shell commands
 * - DesktopAgent: UI automation, screenshots
 * - BrowserAgent: Web navigation, extraction
 * - PlannerAgent: Task breakdown, coordination
 * - AgentOrchestrator: Routing and context management
 */
@Module({
  providers: [
    AgentOrchestrator,
    TerminalAgent,
    DesktopAgent,
    BrowserAgent,
    PlannerAgent,
  ],
  exports: [
    AgentOrchestrator,
    TerminalAgent,
    DesktopAgent,
    BrowserAgent,
    PlannerAgent,
  ],
})
export class AgentsModule {}
