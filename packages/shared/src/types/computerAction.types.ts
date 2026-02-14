export type Coordinates = { x: number; y: number };
export type Button = "left" | "right" | "middle";
export type Press = "up" | "down";
export type Application =
  | "firefox"
  | "1password"
  | "thunderbird"
  | "vscode"
  | "terminal"
  | "desktop"
  | "directory";

export type UiSnapshotDetail = "low" | "high";

// Define individual computer action types
export type MoveMouseAction = {
  action: "move_mouse";
  coordinates: Coordinates;
};

export type TraceMouseAction = {
  action: "trace_mouse";
  path: Coordinates[];
  holdKeys?: string[];
};

export type ClickMouseAction = {
  action: "click_mouse";
  coordinates?: Coordinates;
  button: Button;
  holdKeys?: string[];
  clickCount: number;
};

export type PressMouseAction = {
  action: "press_mouse";
  coordinates?: Coordinates;
  button: Button;
  press: Press;
};

export type DragMouseAction = {
  action: "drag_mouse";
  path: Coordinates[];
  button: Button;
  holdKeys?: string[];
};

export type ScrollAction = {
  action: "scroll";
  coordinates?: Coordinates;
  direction: "up" | "down" | "left" | "right";
  scrollCount: number;
  holdKeys?: string[];
};

export type TypeKeysAction = {
  action: "type_keys";
  keys: string[];
  delay?: number;
};

export type PasteTextAction = {
  action: "paste_text";
  text: string;
};

export type PressKeysAction = {
  action: "press_keys";
  keys: string[];
  press: Press;
};

export type TypeTextAction = {
  action: "type_text";
  text: string;
  delay?: number;
  sensitive?: boolean;
};

export type WaitAction = {
  action: "wait";
  duration: number;
};

export type ScreenshotAction = {
  action: "screenshot";
};

export type UiSnapshotAction = {
  action: "ui_snapshot";
  detail?: UiSnapshotDetail;
  ocr?: boolean;
};

export type InspectUiAction = {
  action: "inspect_ui";
};

export type SearchUiAction = {
  action: "search_ui";
  query: string;
  role?: string;
};

export type CursorPositionAction = {
  action: "cursor_position";
};

export type ApplicationAction = {
  action: "application";
  application: Application;
};

export type WriteFileAction = {
  action: "write_file";
  path: string;
  data: string; // Base64 encoded data
};

export type ReadFileAction = {
  action: "read_file";
  path: string;
};

export type DetectElementsAction = {
  action: "detect_elements";
};

export type SetOfMarksAction = {
  action: "set_of_marks";
  mode?: "axtree" | "vision" | "hybrid";
};

export type WaitForStabilizationAction = {
  action: "wait_for_stabilization";
  timeout?: number;
};

export type PredictActionAction = {
  action: "predict_action";
  goal: string;
};

export type AnalyzeUiAction = {
  action: "analyze_ui";
};

// Define the union type using the individual action types
export type ComputerAction =
  | MoveMouseAction
  | TraceMouseAction
  | ClickMouseAction
  | PressMouseAction
  | DragMouseAction
  | ScrollAction
  | TypeKeysAction
  | PressKeysAction
  | TypeTextAction
  | PasteTextAction
  | WaitAction
  | ScreenshotAction
  | UiSnapshotAction
  | InspectUiAction
  | SearchUiAction
  | CursorPositionAction
  | ApplicationAction
  | WriteFileAction
  | ReadFileAction
  | DetectElementsAction
  | SetOfMarksAction
  | WaitForStabilizationAction
  | PredictActionAction
  | AnalyzeUiAction;
