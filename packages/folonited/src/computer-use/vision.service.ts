import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createWorker, Worker } from 'tesseract.js';
import { NutService } from '../nut/nut.service';

const execAsync = promisify(exec);

interface DetectedElement {
  id: string;
  type: string;
  bbox: [number, number, number, number];
  confidence: number;
  text?: string;
  center: { x: number; y: number };
  attributes?: Record<string, any>;
}

interface SetOfMarksResult {
  success: boolean;
  annotatedImage: string;
  elementCount: number;
  elementMap: Record<string, {
    type: string;
    coordinates: {
      x: number;
      y: number;
      bbox: [number, number, number, number];
    };
    text?: string;
  }>;
  legend: Record<string, string>;
}

interface ActionPrediction {
  action: string;
  confidence: number;
  reason: string;
  targetElement?: string;
  coordinates?: { x: number; y: number };
}

interface StateChange {
  type: 'element_added' | 'element_removed' | 'element_moved' | 'text_changed' | 'state_changed';
  element?: DetectedElement;
  before?: any;
  after?: any;
}

@Injectable()
export class VisionService {
  private readonly logger = new Logger(VisionService.name);
  private ocrWorker: Promise<Worker> | null = null;
  private previousState: {
    elements: DetectedElement[];
    timestamp: number;
    screenshot: string;
  } | null = null;

  constructor(private readonly nutService: NutService) {}

  /**
   * Initialize OCR worker on first use
   */
  private async getOcrWorker(): Promise<Worker> {
    if (!this.ocrWorker) {
      this.ocrWorker = createWorker('eng');
    }
    return this.ocrWorker;
  }

  /**
   * Detect UI elements using computer vision
   */
  async detectElements(screenshotPath?: string): Promise<{
    elements: DetectedElement[];
    annotatedImage?: string;
  }> {
    try {
      // Take screenshot if not provided
      const imagePath = screenshotPath || await this.saveTempScreenshot();

      // Run Python element detector
      const scriptPath = path.join(process.cwd(), 'scripts/element_detector.py');
      const annotatedPath = `/tmp/elements_annotated_${Date.now()}.png`;

      const { stdout } = await execAsync(
        `python3 "${scriptPath}" "${imagePath}" "${annotatedPath}"`,
        { timeout: 30000 }
      );

      const result = JSON.parse(stdout);

      if (result.error) {
        throw new Error(result.error);
      }

      // Convert to our format
      const elements: DetectedElement[] = (result.elements || [])
        .filter((e: any) => !e.error)
        .map((e: any) => ({
          id: e.id,
          type: e.type,
          bbox: e.bbox,
          confidence: e.confidence,
          text: e.text,
          center: e.center ? { x: e.center[0], y: e.center[1] } : undefined,
          attributes: e.attributes,
        }));

      // Read annotated image
      let annotatedImage: string | undefined;
      try {
        const annotatedBuffer = await fs.readFile(annotatedPath);
        annotatedImage = annotatedBuffer.toString('base64');
        await fs.unlink(annotatedPath).catch(() => {});
      } catch {
        // Annotated image not available
      }

      // Clean up temp screenshot if we created it
      if (!screenshotPath) {
        await fs.unlink(imagePath).catch(() => {});
      }

      return { elements, annotatedImage };
    } catch (error) {
      this.logger.error(`Element detection failed: ${error.message}`);
      return { elements: [] };
    }
  }

  /**
   * Create Set-of-Marks annotation for visual prompting
   */
  async createSetOfMarks(
    axtreeData?: any,
    elements?: DetectedElement[]
  ): Promise<SetOfMarksResult | null> {
    try {
      const screenshotPath = await this.saveTempScreenshot();

      const scriptPath = path.join(process.cwd(), 'scripts/set_of_marks.py');

      let result: any;

      if (axtreeData) {
        // Use AXTree data
        const axtreeJson = JSON.stringify(axtreeData);
        const { stdout } = await execAsync(
          `python3 "${scriptPath}" "${screenshotPath}" axtree '${axtreeJson}'`,
          { timeout: 30000 }
        );
        result = JSON.parse(stdout);
      } else if (elements && elements.length > 0) {
        // Use detected elements
        const elementsJson = JSON.stringify(elements);
        const { stdout } = await execAsync(
          `python3 "${scriptPath}" "${screenshotPath}" elements '${elementsJson}'`,
          { timeout: 30000 }
        );
        result = JSON.parse(stdout);
      } else {
        // Detect elements first, then create marks
        const detected = await this.detectElements(screenshotPath);
        const elementsJson = JSON.stringify(detected.elements);
        const { stdout } = await execAsync(
          `python3 "${scriptPath}" "${screenshotPath}" elements '${elementsJson}'`,
          { timeout: 30000 }
        );
        result = JSON.parse(stdout);
      }

      await fs.unlink(screenshotPath).catch(() => {});

      if (!result.success) {
        throw new Error(result.error);
      }

      return {
        success: true,
        annotatedImage: result.annotated_image,
        elementCount: result.element_count,
        elementMap: result.element_map,
        legend: result.legend,
      };
    } catch (error) {
      this.logger.error(`Set-of-Marks creation failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Detect state changes between two screenshots
   */
  async detectStateChanges(): Promise<{
    changes: StateChange[];
    hasSignificantChange: boolean;
    summary: string;
  }> {
    const currentElements = await this.detectElements();
    const currentState = {
      elements: currentElements.elements,
      timestamp: Date.now(),
      screenshot: currentElements.annotatedImage || '',
    };

    if (!this.previousState) {
      this.previousState = currentState;
      return {
        changes: [],
        hasSignificantChange: false,
        summary: 'Initial state captured',
      };
    }

    const changes: StateChange[] = [];
    const prevElements = this.previousState.elements;
    const currElements = currentState.elements;

    // Find added elements
    for (const curr of currElements) {
      const match = prevElements.find(p =>
        this.elementDistance(p, curr) < 50 && p.type === curr.type
      );
      if (!match) {
        changes.push({
          type: 'element_added',
          element: curr,
        });
      }
    }

    // Find removed elements
    for (const prev of prevElements) {
      const match = currElements.find(c =>
        this.elementDistance(c, prev) < 50 && c.type === prev.type
      );
      if (!match) {
        changes.push({
          type: 'element_removed',
          element: prev,
        });
      }
    }

    // Find text changes
    for (const curr of currElements) {
      const match = prevElements.find(p =>
        this.elementDistance(p, curr) < 20
      );
      if (match && match.text !== curr.text) {
        changes.push({
          type: 'text_changed',
          element: curr,
          before: match.text,
          after: curr.text,
        });
      }
    }

    // Update previous state
    this.previousState = currentState;

    // Determine if change is significant
    const hasSignificantChange = changes.length > 0 &&
      changes.some(c => c.type !== 'text_changed' || c.after);

    // Generate summary
    const summary = this.summarizeChanges(changes);

    return {
      changes,
      hasSignificantChange,
      summary,
    };
  }

  /**
   * Predict next best action based on current state and goal
   */
  async predictAction(
    goal: string,
    history: string[]
  ): Promise<ActionPrediction[]> {
    const elements = await this.detectElements();

    const predictions: ActionPrediction[] = [];

    // Analyze goal and available elements to suggest actions
    const goalLower = goal.toLowerCase();

    // Look for buttons that might help achieve the goal
    for (const elem of elements.elements) {
      const text = (elem.text || '').toLowerCase();
      const type = elem.type.toLowerCase();

      // Check for submit/confirm buttons
      if (type === 'button' || type === 'button_candidate') {
        if (['submit', 'ok', 'confirm', 'save', 'continue', 'next'].some(t => text.includes(t))) {
          predictions.push({
            action: 'click',
            confidence: 0.8,
            reason: `Submit/confirm button detected: "${elem.text}"`,
            targetElement: elem.id,
            coordinates: elem.center,
          });
        }
      }

      // Check for input fields
      if (type === 'input_field' || type === 'input') {
        if (goalLower.includes('type') || goalLower.includes('enter') || goalLower.includes('fill')) {
          predictions.push({
            action: 'click_and_type',
            confidence: 0.7,
            reason: `Input field available for text entry`,
            targetElement: elem.id,
            coordinates: elem.center,
          });
        }
      }

      // Check for links
      if (type === 'link') {
        predictions.push({
          action: 'click',
          confidence: 0.6,
          reason: `Link available: "${elem.text}"`,
          targetElement: elem.id,
          coordinates: elem.center,
        });
      }
    }

    // Sort by confidence
    predictions.sort((a, b) => b.confidence - a.confidence);

    return predictions.slice(0, 5);
  }

  /**
   * Wait for UI to stabilize (no significant changes for a period)
   */
  async waitForStabilization(
    timeoutMs: number = 5000,
    stablePeriodMs: number = 500
  ): Promise<{ stabilized: boolean; finalState: any }> {
    const startTime = Date.now();
    let lastChangeTime = startTime;
    let lastState: any = null;

    while (Date.now() - startTime < timeoutMs) {
      const changes = await this.detectStateChanges();

      if (changes.hasSignificantChange) {
        lastChangeTime = Date.now();
        lastState = changes;
      }

      if (Date.now() - lastChangeTime >= stablePeriodMs) {
        return {
          stabilized: true,
          finalState: lastState,
        };
      }

      // Short delay before next check
      await new Promise(r => setTimeout(r, 100));
    }

    return {
      stabilized: false,
      finalState: lastState,
    };
  }

  /**
   * Find element by text description using fuzzy matching
   */
  async findElementByDescription(
    description: string,
    elementType?: string
  ): Promise<DetectedElement | null> {
    const elements = await this.detectElements();

    const searchTerms = description.toLowerCase().split(/\s+/);

    let bestMatch: { element: DetectedElement; score: number } | null = null;

    for (const elem of elements.elements) {
      // Filter by type if specified
      if (elementType && !elem.type.includes(elementType.toLowerCase())) {
        continue;
      }

      const text = (elem.text || '').toLowerCase();
      let score = 0;

      // Check how many search terms are included
      for (const term of searchTerms) {
        if (text.includes(term)) {
          score += 1;
        }
      }

      // Bonus for exact match
      if (text === description.toLowerCase()) {
        score += 5;
      }

      // Normalize by term count
      score = score / searchTerms.length;

      if (score > 0.5 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { element: elem, score };
      }
    }

    return bestMatch?.element || null;
  }

  /**
   * Get a comprehensive analysis of the current UI state
   */
  async analyzeUiState(): Promise<{
    elements: DetectedElement[];
    setOfMarks: SetOfMarksResult | null;
    interactiveElements: DetectedElement[];
    textElements: DetectedElement[];
    summary: string;
  }> {
    const { elements, annotatedImage } = await this.detectElements();
    const setOfMarks = await this.createSetOfMarks(undefined, elements);

    const interactiveElements = elements.filter(e =>
      ['button', 'input', 'link', 'checkbox', 'dropdown'].includes(e.type)
    );

    const textElements = elements.filter(e =>
      e.text && e.text.length > 0
    );

    // Generate summary
    const summary = this.generateStateSummary(elements, interactiveElements);

    return {
      elements,
      setOfMarks,
      interactiveElements,
      textElements,
      summary,
    };
  }

  // Private helper methods

  private async saveTempScreenshot(): Promise<string> {
    const buffer = await this.nutService.screendump();
    const tempPath = `/tmp/screenshot_${Date.now()}.png`;
    await fs.writeFile(tempPath, buffer);
    return tempPath;
  }

  private elementDistance(a: DetectedElement, b: DetectedElement): number {
    const dx = (a.center?.x || 0) - (b.center?.x || 0);
    const dy = (a.center?.y || 0) - (b.center?.y || 0);
    return Math.sqrt(dx * dx + dy * dy);
  }

  private summarizeChanges(changes: StateChange[]): string {
    if (changes.length === 0) {
      return 'No changes detected';
    }

    const added = changes.filter(c => c.type === 'element_added').length;
    const removed = changes.filter(c => c.type === 'element_removed').length;
    const textChanged = changes.filter(c => c.type === 'text_changed').length;

    const parts: string[] = [];
    if (added > 0) parts.push(`${added} element(s) added`);
    if (removed > 0) parts.push(`${removed} element(s) removed`);
    if (textChanged > 0) parts.push(`${textChanged} text change(s)`);

    return parts.join(', ');
  }

  private generateStateSummary(
    allElements: DetectedElement[],
    interactiveElements: DetectedElement[]
  ): string {
    const buttons = interactiveElements.filter(e => e.type === 'button').length;
    const inputs = interactiveElements.filter(e => e.type === 'input').length;
    const links = interactiveElements.filter(e => e.type === 'link').length;
    const checkboxes = interactiveElements.filter(e => e.type === 'checkbox').length;

    return `UI contains ${allElements.length} elements total, including ${buttons} buttons, ${inputs} input fields, ${links} links, ${checkboxes} checkboxes.`;
  }
}
