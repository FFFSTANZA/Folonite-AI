// Multi-Agent System Exports

export { AgentsModule } from './agents.module';
export {
  AgentOrchestrator,
  AgentContext,
  AgentType,
  RoutingDecision,
  AgentAction,
  FileReference,
} from './agent-orchestrator.service';

export {
  TerminalAgent,
  TerminalResult,
  FileInfo,
  FileContent,
} from './terminal.agent';

export {
  DesktopAgent,
  DesktopResult,
  UiState,
  UiElement,
} from './desktop.agent';

export {
  BrowserAgent,
  BrowserResult,
  BrowserElement,
} from './browser.agent';

export {
  PlannerAgent,
  TaskPlan,
  PlanStep,
} from './planner.agent';
