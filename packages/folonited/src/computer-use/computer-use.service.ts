import { Injectable, Logger } from '@nestjs/common';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import { NutService } from '../nut/nut.service';
import { AccessibilityService } from './accessibility.service';
import { VisionService } from './vision.service';
import {
  ComputerAction,
  MoveMouseAction,
  TraceMouseAction,
  ClickMouseAction,
  PressMouseAction,
  DragMouseAction,
  ScrollAction,
  TypeKeysAction,
  PressKeysAction,
  TypeTextAction,
  ApplicationAction,
  Application,
  PasteTextAction,
  WriteFileAction,
  ReadFileAction,
  UiSnapshotAction,
  UiSnapshotDetail,
  InspectUiAction,
  SearchUiAction,
  DetectElementsAction,
  SetOfMarksAction,
  WaitForStabilizationAction,
  PredictActionAction,
  AnalyzeUiAction,
} from '@folonite/shared';

const UI_SNAPSHOT_DIMENSIONS: Record<UiSnapshotDetail, {
  width: number;
  height: number;
}> = {
  low: { width: 1024, height: 768 },
  high: { width: 1280, height: 960 },
};

const OCR_TEXT_LIMIT = 4000;

type OcrWorker = Awaited<ReturnType<typeof createWorker>>;

@Injectable()
export class ComputerUseService {
  private readonly logger = new Logger(ComputerUseService.name);
  private ocrWorkerPromise?: Promise<OcrWorker>;
  private ocrQueue: Promise<string | null> = Promise.resolve(null);

  constructor(
    private readonly nutService: NutService,
    private readonly accessibilityService: AccessibilityService,
    private readonly visionService: VisionService,
  ) { }

  async action(params: ComputerAction): Promise<any> {
    this.logger.log(`Executing computer action: ${params.action}`);

    switch (params.action) {
      case 'move_mouse': {
        await this.moveMouse(params);
        break;
      }
      case 'trace_mouse': {
        await this.traceMouse(params);
        break;
      }
      case 'click_mouse': {
        await this.clickMouse(params);
        break;
      }
      case 'press_mouse': {
        await this.pressMouse(params);
        break;
      }
      case 'drag_mouse': {
        await this.dragMouse(params);
        break;
      }

      case 'scroll': {
        await this.scroll(params);
        break;
      }
      case 'type_keys': {
        await this.typeKeys(params);
        break;
      }
      case 'press_keys': {
        await this.pressKeys(params);
        break;
      }
      case 'type_text': {
        await this.typeText(params);
        break;
      }
      case 'paste_text': {
        await this.pasteText(params);
        break;
      }
      case 'wait': {
        const waitParams = params;
        await this.delay(waitParams.duration);
        break;
      }
      case 'screenshot':
        return this.screenshot();

      case 'ui_snapshot':
        return this.uiSnapshot(params);

      case 'inspect_ui':
        return this.inspectUi();

      case 'search_ui':
        return this.searchUi(params);

      case 'cursor_position':
        return this.cursor_position();

      case 'application': {
        await this.application(params);
        break;
      }

      case 'write_file': {
        return this.writeFile(params);
      }

      case 'read_file': {
        return this.readFile(params);
      }

      case 'detect_elements': {
        return this.detectElements(params);
      }

      case 'set_of_marks': {
        return this.setOfMarks(params);
      }

      case 'wait_for_stabilization': {
        return this.waitForStabilization(params);
      }

      case 'predict_action': {
        return this.predictAction(params);
      }

      case 'analyze_ui': {
        return this.analyzeUi(params);
      }

      default:
        throw new Error(
          `Unsupported computer action: ${(params as any).action}`,
        );
    }
  }

  private async moveMouse(action: MoveMouseAction): Promise<void> {
    await this.nutService.mouseMoveEvent(action.coordinates);
  }

  private async traceMouse(action: TraceMouseAction): Promise<void> {
    const { path, holdKeys } = action;

    // Move to the first coordinate
    await this.nutService.mouseMoveEvent(path[0]);

    // Hold keys if provided
    if (holdKeys) {
      await this.nutService.holdKeys(holdKeys, true);
    }

    // Move to each coordinate in the path
    for (const coordinates of path) {
      await this.nutService.mouseMoveEvent(coordinates);
    }

    // Release hold keys
    if (holdKeys) {
      await this.nutService.holdKeys(holdKeys, false);
    }
  }

  private async clickMouse(action: ClickMouseAction): Promise<void> {
    const { coordinates, button, holdKeys, clickCount } = action;

    // Move to coordinates if provided
    if (coordinates) {
      await this.nutService.mouseMoveEvent(coordinates);
    }

    // Hold keys if provided
    if (holdKeys) {
      await this.nutService.holdKeys(holdKeys, true);
    }

    // Perform clicks
    if (clickCount > 1) {
      // Perform multiple clicks
      for (let i = 0; i < clickCount; i++) {
        await this.nutService.mouseClickEvent(button);
        await this.delay(150);
      }
    } else {
      // Perform a single click
      await this.nutService.mouseClickEvent(button);
    }

    // Release hold keys
    if (holdKeys) {
      await this.nutService.holdKeys(holdKeys, false);
    }
  }

  private async pressMouse(action: PressMouseAction): Promise<void> {
    const { coordinates, button, press } = action;

    // Move to coordinates if provided
    if (coordinates) {
      await this.nutService.mouseMoveEvent(coordinates);
    }

    // Perform press
    if (press === 'down') {
      await this.nutService.mouseButtonEvent(button, true);
    } else {
      await this.nutService.mouseButtonEvent(button, false);
    }
  }

  private async dragMouse(action: DragMouseAction): Promise<void> {
    const { path, button, holdKeys } = action;

    // Move to the first coordinate
    await this.nutService.mouseMoveEvent(path[0]);

    // Hold keys if provided
    if (holdKeys) {
      await this.nutService.holdKeys(holdKeys, true);
    }

    // Perform drag
    await this.nutService.mouseButtonEvent(button, true);
    for (const coordinates of path) {
      await this.nutService.mouseMoveEvent(coordinates);
    }
    await this.nutService.mouseButtonEvent(button, false);

    // Release hold keys
    if (holdKeys) {
      await this.nutService.holdKeys(holdKeys, false);
    }
  }

  private async scroll(action: ScrollAction): Promise<void> {
    const { coordinates, direction, scrollCount, holdKeys } = action;

    // Move to coordinates if provided
    if (coordinates) {
      await this.nutService.mouseMoveEvent(coordinates);
    }

    // Hold keys if provided
    if (holdKeys) {
      await this.nutService.holdKeys(holdKeys, true);
    }

    // Perform scroll
    for (let i = 0; i < scrollCount; i++) {
      await this.nutService.mouseWheelEvent(direction, 1);
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    // Release hold keys
    if (holdKeys) {
      await this.nutService.holdKeys(holdKeys, false);
    }
  }

  private async typeKeys(action: TypeKeysAction): Promise<void> {
    const { keys, delay } = action;
    await this.nutService.sendKeys(keys, delay);
  }

  private async pressKeys(action: PressKeysAction): Promise<void> {
    const { keys, press } = action;
    await this.nutService.holdKeys(keys, press === 'down');
  }

  private async typeText(action: TypeTextAction): Promise<void> {
    const { text, delay } = action;
    await this.nutService.typeText(text, delay);
  }

  private async pasteText(action: PasteTextAction): Promise<void> {
    const { text } = action;
    await this.nutService.pasteText(text);
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async screenshot(): Promise<{ image: string }> {
    this.logger.log(`Taking screenshot`);
    const buffer = await this.nutService.screendump();
    return { image: `${buffer.toString('base64')}` };
  }

  async uiSnapshot(action: UiSnapshotAction): Promise<{
    image: string;
    ocrText?: string;
    width: number;
    height: number;
    detail: UiSnapshotDetail;
  }> {
    const detail: UiSnapshotDetail = action.detail ?? 'low';
    const includeOcr = action.ocr !== false;
    this.logger.log(`Taking UI snapshot (${detail})`);

    const buffer = await this.nutService.screendump();
    const snapshot = await this.prepareSnapshot(buffer, detail);
    let ocrText: string | undefined;

    if (includeOcr) {
      try {
        const ocrBuffer = await sharp(snapshot.buffer)
          .grayscale()
          .normalize()
          .sharpen()
          .toBuffer();
        const rawText = await this.runOcr(ocrBuffer);
        ocrText = this.normalizeOcrText(rawText ?? undefined);
      } catch (error) {
        this.logger.warn(`OCR failed: ${error.message}`);
      }
    }

    return {
      image: snapshot.buffer.toString('base64'),
      ocrText,
      width: snapshot.width,
      height: snapshot.height,
      detail,
    };
  }

  private async cursor_position(): Promise<{ x: number; y: number }> {
    this.logger.log(`Getting cursor position`);
    return await this.nutService.getCursorPosition();
  }

  private async inspectUi(): Promise<any> {
    this.logger.log(`Inspecting UI State via AXTree`);

    try {
      // Clear cache to get fresh state
      this.accessibilityService.clearCache();

      // Get formatted tree for LLM consumption (more compact)
      const formattedTree = await this.accessibilityService.formatTreeForLlm(false);

      // Also get the raw tree for structured data
      const uiTree = await this.accessibilityService.getUiTree(false);

      return {
        type: 'axtree',
        tree: uiTree.tree,
        formatted: formattedTree,
        source: uiTree.source,
        timestamp: uiTree.timestamp,
      };
    } catch (error) {
      this.logger.error(`Error inspecting UI: ${error.message}`);
      // Return a valid structure that won't break searchUi
      return {
        type: 'axtree',
        tree: [],
        formatted: 'UI inspection failed: ' + error.message,
        source: 'error',
        timestamp: new Date().toISOString(),
      };
    }
  }

  private async searchUi(action: SearchUiAction): Promise<any> {
    this.logger.log(`Searching UI for: "${action.query}"${action.role ? ` (role: ${action.role})` : ''}`);

    try {
      // Clear cache for fresh search
      this.accessibilityService.clearCache();

      const result = await this.accessibilityService.searchElements(
        action.query,
        action.role,
        { maxResults: 50, useCache: false },
      );

      return {
        query: action.query,
        role: action.role,
        count: result.count,
        matches: result.matches.map((m) => ({
          name: m.name,
          role: m.role,
          rect: m.rect,
          description: m.description,
          states: m.states,
          path: m.path,
        })),
        source: result.source,
      };
    } catch (error) {
      this.logger.error(`UI search failed: ${error.message}`);
      return {
        query: action.query,
        role: action.role,
        count: 0,
        matches: [],
        error: 'Search failed',
        message: error.message,
        source: 'error',
      };
    }
  }

  private async application(action: ApplicationAction): Promise<void> {
    const execAsync = promisify(exec);

    // Helper to spawn a command and forget about it
    const spawnAndForget = (
      command: string,
      args: string[],
      options: Record<string, any> = {},
    ): void => {
      const child = spawn(command, args, {
        env: { ...process.env, DISPLAY: ':0.0' }, // ensure DISPLAY is set for GUI tools
        stdio: 'ignore',
        detached: true,
        ...options,
      });
      child.unref(); // Allow the parent process to exit independently
    };

    if (action.application === 'desktop') {
      spawnAndForget('sudo', ['-u', 'user', 'wmctrl', '-k', 'on']);
      return;
    }

    const commandMap: Record<string, string> = {
      firefox: 'firefox-esr',
      '1password': '1password',
      thunderbird: 'thunderbird',
      vscode: 'code',
      terminal: 'xfce4-terminal',
      directory: 'thunar',
    };

    const processMap: Record<Application, string> = {
      firefox: 'Navigator.firefox-esr',
      '1password': '1password.1Password',
      thunderbird: 'Mail.thunderbird',
      vscode: 'code.Code',
      terminal: 'xfce4-terminal.Xfce4-Terminal',
      directory: 'Thunar',
      desktop: 'xfdesktop.Xfdesktop',
    };

    // check if the application is already open using wmctrl -lx
    let appOpen = false;
    try {
      const { stdout } = await execAsync(
        `sudo -u user wmctrl -lx | grep ${processMap[action.application]}`,
        { timeout: 5000 }, // 5 second timeout
      );
      appOpen = stdout.trim().length > 0;
    } catch (error: any) {
      // grep returns exit code 1 when no match is found – treat as "not open"
      // Also handle timeout errors
      if (error.code !== 1 && !error.message?.includes('timeout')) {
        throw error;
      }
    }

    if (appOpen) {
      this.logger.log(`Application ${action.application} is already open`);

      // Fire and forget - activate window
      spawnAndForget('sudo', [
        '-u',
        'user',
        'wmctrl',
        '-x',
        '-a',
        processMap[action.application],
      ]);

      // Fire and forget - maximize window
      spawnAndForget('sudo', [
        '-u',
        'user',
        'wmctrl',
        '-x',
        '-r',
        processMap[action.application],
        '-b',
        'add,maximized_vert,maximized_horz',
      ]);

      return;
    }

    // application is not open, open it - fire and forget
    spawnAndForget('sudo', [
      '-u',
      'user',
      'nohup',
      commandMap[action.application],
    ]);

    this.logger.log(`Application ${action.application} launched`);

    // Just return immediately
    return;
  }

  private async prepareSnapshot(
    buffer: Buffer,
    detail: UiSnapshotDetail,
  ): Promise<{ buffer: Buffer; width: number; height: number }> {
    const { width, height } = UI_SNAPSHOT_DIMENSIONS[detail];
    const sharpInstance = sharp(buffer)
      .resize({
        width,
        height,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png({
        compressionLevel: 9,
        adaptiveFiltering: true,
        palette: true,
      });

    const metadata = await sharpInstance.metadata();
    const resizedBuffer = await sharpInstance.toBuffer();

    return {
      buffer: resizedBuffer,
      width: metadata.width ?? width,
      height: metadata.height ?? height,
    };
  }

  private async getOcrWorker(): Promise<OcrWorker> {
    if (!this.ocrWorkerPromise) {
      this.ocrWorkerPromise = (async () => {
        const worker = await createWorker('eng', 1, {
          logger: () => undefined,
        });
        return worker;
      })();
    }

    return this.ocrWorkerPromise;
  }

  private async runOcr(buffer: Buffer): Promise<string | null> {
    const task = this.ocrQueue.then(async () => {
      const worker = await this.getOcrWorker();
      const result = await worker.recognize(buffer);
      return result?.data?.text ?? null;
    });

    this.ocrQueue = task.then(() => null).catch(() => null);
    return task;
  }

  private normalizeOcrText(text?: string | null): string | undefined {
    if (!text) {
      return undefined;
    }

    const cleaned = text
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (!cleaned) {
      return undefined;
    }

    if (cleaned.length > OCR_TEXT_LIMIT) {
      return `${cleaned.slice(0, OCR_TEXT_LIMIT)}\n…(truncated)`;
    }

    return cleaned;
  }

  private async writeFile(
    action: WriteFileAction,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const execAsync = promisify(exec);

      // Decode base64 data
      const buffer = Buffer.from(action.data, 'base64');

      // Resolve path - if relative, make it relative to user's home directory
      let targetPath = action.path;
      if (!path.isAbsolute(targetPath)) {
        targetPath = path.join('/home/user/Desktop', targetPath);
      }

      // Ensure directory exists using sudo
      const dir = path.dirname(targetPath);
      try {
        await execAsync(`sudo mkdir -p "${dir}"`);
      } catch (error) {
        // Directory might already exist, which is fine
        this.logger.debug(`Directory creation: ${error.message}`);
      }

      // Write to a temporary file first
      const tempFile = `/tmp/folonite_temp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      await fs.writeFile(tempFile, buffer);

      // Move the file to the target location using sudo
      try {
        await execAsync(`sudo cp "${tempFile}" "${targetPath}"`);
        await execAsync(`sudo chown user:user "${targetPath}"`);
        await execAsync(`sudo chmod 644 "${targetPath}"`);
        // Clean up temp file
        await fs.unlink(tempFile).catch(() => { });
      } catch (error) {
        // Clean up temp file on error
        await fs.unlink(tempFile).catch(() => { });
        throw error;
      }

      this.logger.log(`File written successfully to: ${targetPath}`);
      return {
        success: true,
        message: `File written successfully to: ${targetPath}`,
      };
    } catch (error) {
      this.logger.error(`Error writing file: ${error.message}`, error.stack);
      return {
        success: false,
        message: `Error writing file: ${error.message}`,
      };
    }
  }

  private async readFile(action: ReadFileAction): Promise<{
    success: boolean;
    data?: string;
    name?: string;
    size?: number;
    mediaType?: string;
    message?: string;
  }> {
    try {
      const execAsync = promisify(exec);

      // Resolve path - if relative, make it relative to user's home directory
      let targetPath = action.path;
      if (!path.isAbsolute(targetPath)) {
        targetPath = path.join('/home/user/Desktop', targetPath);
      }

      // Copy file to temp location using sudo to read it
      const tempFile = `/tmp/folonite_read_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      try {
        // Copy the file to a temporary location we can read
        await execAsync(`sudo cp "${targetPath}" "${tempFile}"`);
        await execAsync(`sudo chmod 644 "${tempFile}"`);

        // Read file as buffer from temp location
        const buffer = await fs.readFile(tempFile);

        // Get file stats for size using sudo
        const { stdout: statOutput } = await execAsync(
          `sudo stat -c "%s" "${targetPath}"`,
        );
        const fileSize = parseInt(statOutput.trim(), 10);

        // Clean up temp file
        await fs.unlink(tempFile).catch(() => { });

        // Convert to base64
        const base64Data = buffer.toString('base64');

        // Extract filename from path
        const fileName = path.basename(targetPath);

        // Determine media type based on file extension
        const ext = path.extname(targetPath).toLowerCase().slice(1);
        const mimeTypes: Record<string, string> = {
          pdf: 'application/pdf',
          docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          doc: 'application/msword',
          txt: 'text/plain',
          html: 'text/html',
          json: 'application/json',
          xml: 'text/xml',
          csv: 'text/csv',
          rtf: 'application/rtf',
          odt: 'application/vnd.oasis.opendocument.text',
          epub: 'application/epub+zip',
          png: 'image/png',
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          webp: 'image/webp',
          gif: 'image/gif',
          svg: 'image/svg+xml',
        };

        const mediaType = mimeTypes[ext] || 'application/octet-stream';

        this.logger.log(`File read successfully from: ${targetPath}`);
        return {
          success: true,
          data: base64Data,
          name: fileName,
          size: fileSize,
          mediaType: mediaType,
        };
      } catch (error) {
        // Clean up temp file on error
        await fs.unlink(tempFile).catch(() => { });
        throw error;
      }
    } catch (error) {
      this.logger.error(`Error reading file: ${error.message}`, error.stack);
      return {
        success: false,
        message: `Error reading file: ${error.message}`,
      };
    }
  }

  // New advanced vision-based methods

  private async detectElements(_action: DetectElementsAction): Promise<any> {
    this.logger.log('Detecting UI elements with computer vision');
    try {
      const result = await this.visionService.detectElements();
      return {
        success: true,
        elementCount: result.elements.length,
        elements: result.elements,
        annotatedImage: result.annotatedImage,
      };
    } catch (error) {
      this.logger.error(`Element detection failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        elements: [],
      };
    }
  }

  private async setOfMarks(action: SetOfMarksAction): Promise<any> {
    this.logger.log(`Creating Set-of-Marks (mode: ${action.mode || 'auto'})`);
    try {
      let result;

      if (action.mode === 'axtree') {
        // Get AXTree first, then create marks
        const uiTree = await this.accessibilityService.getUiTree();
        result = await this.visionService.createSetOfMarks(uiTree);
      } else if (action.mode === 'vision') {
        // Use CV detection only
        const elements = await this.visionService.detectElements();
        result = await this.visionService.createSetOfMarks(undefined, elements.elements);
      } else {
        // Hybrid or auto: use both
        result = await this.visionService.createSetOfMarks();
      }

      if (!result) {
        throw new Error('Failed to create Set-of-Marks');
      }

      return {
        success: true,
        elementCount: result.elementCount,
        elementMap: result.elementMap,
        legend: result.legend,
        annotatedImage: result.annotatedImage,
      };
    } catch (error) {
      this.logger.error(`Set-of-Marks creation failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  private async waitForStabilization(action: WaitForStabilizationAction): Promise<any> {
    const timeout = action.timeout || 5000;
    this.logger.log(`Waiting for UI stabilization (timeout: ${timeout}ms)`);
    try {
      const result = await this.visionService.waitForStabilization(timeout);
      return {
        success: true,
        stabilized: result.stabilized,
        finalState: result.finalState,
      };
    } catch (error) {
      this.logger.error(`Wait for stabilization failed: ${error.message}`);
      return {
        success: false,
        stabilized: false,
        error: error.message,
      };
    }
  }

  private async predictAction(action: PredictActionAction): Promise<any> {
    this.logger.log(`Predicting actions for goal: ${action.goal}`);
    try {
      // Get recent history (placeholder - could be enhanced with actual history)
      const history: string[] = [];
      const predictions = await this.visionService.predictAction(action.goal, history);
      return {
        success: true,
        goal: action.goal,
        predictions: predictions,
      };
    } catch (error) {
      this.logger.error(`Action prediction failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        predictions: [],
      };
    }
  }

  private async analyzeUi(_action: AnalyzeUiAction): Promise<any> {
    this.logger.log('Performing comprehensive UI analysis');
    try {
      const analysis = await this.visionService.analyzeUiState();
      return {
        success: true,
        summary: analysis.summary,
        totalElements: analysis.elements.length,
        interactiveElements: analysis.interactiveElements.map(e => ({
          id: e.id,
          type: e.type,
          coordinates: e.center,
          text: e.text,
        })),
        textElements: analysis.textElements.map(e => ({
          text: e.text,
          bbox: e.bbox,
        })),
        setOfMarksAvailable: !!analysis.setOfMarks,
        elementMap: analysis.setOfMarks?.elementMap,
        annotatedImage: analysis.setOfMarks?.annotatedImage,
      };
    } catch (error) {
      this.logger.error(`UI analysis failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
