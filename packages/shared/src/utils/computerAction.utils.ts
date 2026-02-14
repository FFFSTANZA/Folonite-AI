import {
  ComputerAction,
  ClickMouseAction,
  DragMouseAction,
  MoveMouseAction,
  PressKeysAction,
  PressMouseAction,
  ScrollAction,
  TraceMouseAction,
  TypeKeysAction,
  TypeTextAction,
  WaitAction,
  ScreenshotAction,
  UiSnapshotAction,
  InspectUiAction,
  SearchUiAction,
  CursorPositionAction,
  ApplicationAction,
  PasteTextAction,
  WriteFileAction,
  ReadFileAction,
  DetectElementsAction,
  SetOfMarksAction,
  WaitForStabilizationAction,
  PredictActionAction,
  AnalyzeUiAction,
} from "../types/computerAction.types";
import {
  ComputerToolUseContentBlock,
  MessageContentType,
} from "../types/messageContent.types";

/**
 * Type guard factory for computer actions
 */
function createActionTypeGuard<T extends ComputerAction>(
  actionType: T["action"]
): (obj: unknown) => obj is T {
  return (obj: unknown): obj is T => {
    if (!obj || typeof obj !== "object") {
      return false;
    }
    const action = obj as Record<string, any>;
    return action.action === actionType;
  };
}

/**
 * Type guards for all computer actions
 */
export const isMoveMouseAction =
  createActionTypeGuard<MoveMouseAction>("move_mouse");
export const isTraceMouseAction =
  createActionTypeGuard<TraceMouseAction>("trace_mouse");
export const isClickMouseAction =
  createActionTypeGuard<ClickMouseAction>("click_mouse");
export const isPressMouseAction =
  createActionTypeGuard<PressMouseAction>("press_mouse");
export const isDragMouseAction =
  createActionTypeGuard<DragMouseAction>("drag_mouse");
export const isScrollAction = createActionTypeGuard<ScrollAction>("scroll");
export const isTypeKeysAction =
  createActionTypeGuard<TypeKeysAction>("type_keys");
export const isPressKeysAction =
  createActionTypeGuard<PressKeysAction>("press_keys");
export const isTypeTextAction =
  createActionTypeGuard<TypeTextAction>("type_text");
export const isWaitAction = createActionTypeGuard<WaitAction>("wait");
export const isScreenshotAction =
  createActionTypeGuard<ScreenshotAction>("screenshot");
export const isUiSnapshotAction =
  createActionTypeGuard<UiSnapshotAction>("ui_snapshot");
export const isInspectUiAction =
  createActionTypeGuard<InspectUiAction>("inspect_ui");
export const isSearchUiAction =
  createActionTypeGuard<SearchUiAction>("search_ui");
export const isCursorPositionAction =
  createActionTypeGuard<CursorPositionAction>("cursor_position");
export const isApplicationAction =
  createActionTypeGuard<ApplicationAction>("application");
export const isDetectElementsAction =
  createActionTypeGuard<DetectElementsAction>("detect_elements");
export const isSetOfMarksAction =
  createActionTypeGuard<SetOfMarksAction>("set_of_marks");
export const isWaitForStabilizationAction =
  createActionTypeGuard<WaitForStabilizationAction>("wait_for_stabilization");
export const isPredictActionAction =
  createActionTypeGuard<PredictActionAction>("predict_action");
export const isAnalyzeUiAction =
  createActionTypeGuard<AnalyzeUiAction>("analyze_ui");

/**
 * Base converter for creating tool use blocks
 */
function createToolUseBlock(
  toolName: string,
  toolUseId: string,
  input: Record<string, any>
): ComputerToolUseContentBlock {
  return {
    type: MessageContentType.ToolUse,
    id: toolUseId,
    name: toolName as any,
    input,
  };
}

/**
 * Utility to conditionally add properties to objects
 */
function conditionallyAdd<T extends Record<string, any>>(
  obj: T,
  conditions: Array<[boolean | undefined, string, any]>
): T {
  const result: Record<string, any> = { ...obj };
  conditions.forEach(([condition, key, value]) => {
    if (condition) {
      result[key] = value;
    }
  });
  return result as T;
}

/**
 * Converters for each action type
 */
export function convertMoveMouseActionToToolUseBlock(
  action: MoveMouseAction,
  toolUseId: string
): ComputerToolUseContentBlock {
  return createToolUseBlock("computer_move_mouse", toolUseId, {
    coordinates: action.coordinates,
  });
}

export function convertTraceMouseActionToToolUseBlock(
  action: TraceMouseAction,
  toolUseId: string
): ComputerToolUseContentBlock {
  return createToolUseBlock(
    "computer_trace_mouse",
    toolUseId,
    conditionallyAdd({ path: action.path }, [
      [action.holdKeys !== undefined, "holdKeys", action.holdKeys],
    ])
  );
}

export function convertClickMouseActionToToolUseBlock(
  action: ClickMouseAction,
  toolUseId: string
): ComputerToolUseContentBlock {
  return createToolUseBlock(
    "computer_click_mouse",
    toolUseId,
    conditionallyAdd(
      {
        button: action.button,
        clickCount: action.clickCount,
      },
      [
        [action.coordinates !== undefined, "coordinates", action.coordinates],
        [action.holdKeys !== undefined, "holdKeys", action.holdKeys],
      ]
    )
  );
}

export function convertPressMouseActionToToolUseBlock(
  action: PressMouseAction,
  toolUseId: string
): ComputerToolUseContentBlock {
  return createToolUseBlock(
    "computer_press_mouse",
    toolUseId,
    conditionallyAdd(
      {
        button: action.button,
        press: action.press,
      },
      [[action.coordinates !== undefined, "coordinates", action.coordinates]]
    )
  );
}

export function convertDragMouseActionToToolUseBlock(
  action: DragMouseAction,
  toolUseId: string
): ComputerToolUseContentBlock {
  return createToolUseBlock(
    "computer_drag_mouse",
    toolUseId,
    conditionallyAdd(
      {
        path: action.path,
        button: action.button,
      },
      [[action.holdKeys !== undefined, "holdKeys", action.holdKeys]]
    )
  );
}

export function convertScrollActionToToolUseBlock(
  action: ScrollAction,
  toolUseId: string
): ComputerToolUseContentBlock {
  return createToolUseBlock(
    "computer_scroll",
    toolUseId,
    conditionallyAdd(
      {
        direction: action.direction,
        scrollCount: action.scrollCount,
      },
      [
        [action.coordinates !== undefined, "coordinates", action.coordinates],
        [action.holdKeys !== undefined, "holdKeys", action.holdKeys],
      ]
    )
  );
}

export function convertTypeKeysActionToToolUseBlock(
  action: TypeKeysAction,
  toolUseId: string
): ComputerToolUseContentBlock {
  return createToolUseBlock(
    "computer_type_keys",
    toolUseId,
    conditionallyAdd({ keys: action.keys }, [
      [typeof action.delay === "number", "delay", action.delay],
    ])
  );
}

export function convertPressKeysActionToToolUseBlock(
  action: PressKeysAction,
  toolUseId: string
): ComputerToolUseContentBlock {
  return createToolUseBlock("computer_press_keys", toolUseId, {
    keys: action.keys,
    press: action.press,
  });
}

export function convertTypeTextActionToToolUseBlock(
  action: TypeTextAction,
  toolUseId: string
): ComputerToolUseContentBlock {
  return createToolUseBlock(
    "computer_type_text",
    toolUseId,
    conditionallyAdd({ text: action.text }, [
      [typeof action.delay === "number", "delay", action.delay],
      [typeof action.sensitive === "boolean", "isSensitive", action.sensitive],
    ])
  );
}

export function convertPasteTextActionToToolUseBlock(
  action: PasteTextAction,
  toolUseId: string
): ComputerToolUseContentBlock {
  return createToolUseBlock("computer_paste_text", toolUseId, {
    text: action.text,
  });
}

export function convertWaitActionToToolUseBlock(
  action: WaitAction,
  toolUseId: string
): ComputerToolUseContentBlock {
  return createToolUseBlock("computer_wait", toolUseId, {
    duration: action.duration,
  });
}

export function convertScreenshotActionToToolUseBlock(
  action: ScreenshotAction,
  toolUseId: string
): ComputerToolUseContentBlock {
  return createToolUseBlock("computer_screenshot", toolUseId, {});
}

export function convertUiSnapshotActionToToolUseBlock(
  action: UiSnapshotAction,
  toolUseId: string
): ComputerToolUseContentBlock {
  return createToolUseBlock(
    "computer_ui_snapshot",
    toolUseId,
    conditionallyAdd(
      {},
      [
        [typeof action.detail === "string", "detail", action.detail],
        [typeof action.ocr === "boolean", "ocr", action.ocr],
      ]
    )
  );
}

export function convertInspectUiActionToToolUseBlock(
  _action: InspectUiAction,
  toolUseId: string
): ComputerToolUseContentBlock {
  return createToolUseBlock("computer_inspect_ui", toolUseId, {});
}

export function convertSearchUiActionToToolUseBlock(
  action: SearchUiAction,
  toolUseId: string
): ComputerToolUseContentBlock {
  return createToolUseBlock("computer_search_ui", toolUseId, {
    query: action.query,
    role: action.role,
  });
}

export function convertCursorPositionActionToToolUseBlock(
  action: CursorPositionAction,
  toolUseId: string
): ComputerToolUseContentBlock {
  return createToolUseBlock("computer_cursor_position", toolUseId, {});
}

export function convertApplicationActionToToolUseBlock(
  action: ApplicationAction,
  toolUseId: string
): ComputerToolUseContentBlock {
  return createToolUseBlock("computer_application", toolUseId, {
    application: action.application,
  });
}

export function convertWriteFileActionToToolUseBlock(
  action: WriteFileAction,
  toolUseId: string
): ComputerToolUseContentBlock {
  return createToolUseBlock("computer_write_file", toolUseId, {
    path: action.path,
    data: action.data,
  });
}

export function convertReadFileActionToToolUseBlock(
  action: ReadFileAction,
  toolUseId: string
): ComputerToolUseContentBlock {
  return createToolUseBlock("computer_read_file", toolUseId, {
    path: action.path,
  });
}

export function convertDetectElementsActionToToolUseBlock(
  _action: DetectElementsAction,
  toolUseId: string
): ComputerToolUseContentBlock {
  return createToolUseBlock("computer_detect_elements", toolUseId, {});
}

export function convertSetOfMarksActionToToolUseBlock(
  action: SetOfMarksAction,
  toolUseId: string
): ComputerToolUseContentBlock {
  return createToolUseBlock(
    "computer_set_of_marks",
    toolUseId,
    conditionallyAdd({}, [
      [typeof action.mode === "string", "mode", action.mode],
    ])
  );
}

export function convertWaitForStabilizationActionToToolUseBlock(
  action: WaitForStabilizationAction,
  toolUseId: string
): ComputerToolUseContentBlock {
  return createToolUseBlock(
    "computer_wait_for_stabilization",
    toolUseId,
    conditionallyAdd({}, [
      [typeof action.timeout === "number", "timeout", action.timeout],
    ])
  );
}

export function convertPredictActionActionToToolUseBlock(
  action: PredictActionAction,
  toolUseId: string
): ComputerToolUseContentBlock {
  return createToolUseBlock("computer_predict_action", toolUseId, {
    goal: action.goal,
  });
}

export function convertAnalyzeUiActionToToolUseBlock(
  _action: AnalyzeUiAction,
  toolUseId: string
): ComputerToolUseContentBlock {
  return createToolUseBlock("computer_analyze_ui", toolUseId, {});
}

/**
 * Generic converter that handles all action types
 */
export function convertComputerActionToToolUseBlock(
  action: ComputerAction,
  toolUseId: string
): ComputerToolUseContentBlock {
  switch (action.action) {
    case "move_mouse":
      return convertMoveMouseActionToToolUseBlock(action, toolUseId);
    case "trace_mouse":
      return convertTraceMouseActionToToolUseBlock(action, toolUseId);
    case "click_mouse":
      return convertClickMouseActionToToolUseBlock(action, toolUseId);
    case "press_mouse":
      return convertPressMouseActionToToolUseBlock(action, toolUseId);
    case "drag_mouse":
      return convertDragMouseActionToToolUseBlock(action, toolUseId);
    case "scroll":
      return convertScrollActionToToolUseBlock(action, toolUseId);
    case "type_keys":
      return convertTypeKeysActionToToolUseBlock(action, toolUseId);
    case "press_keys":
      return convertPressKeysActionToToolUseBlock(action, toolUseId);
    case "type_text":
      return convertTypeTextActionToToolUseBlock(action, toolUseId);
    case "paste_text":
      return convertPasteTextActionToToolUseBlock(action, toolUseId);
    case "wait":
      return convertWaitActionToToolUseBlock(action, toolUseId);
    case "screenshot":
      return convertScreenshotActionToToolUseBlock(action, toolUseId);
    case "ui_snapshot":
      return convertUiSnapshotActionToToolUseBlock(action, toolUseId);
    case "inspect_ui":
      return convertInspectUiActionToToolUseBlock(action, toolUseId);
    case "search_ui":
      return convertSearchUiActionToToolUseBlock(action, toolUseId);
    case "cursor_position":
      return convertCursorPositionActionToToolUseBlock(action, toolUseId);
    case "application":
      return convertApplicationActionToToolUseBlock(action, toolUseId);
    case "write_file":
      return convertWriteFileActionToToolUseBlock(action, toolUseId);
    case "read_file":
      return convertReadFileActionToToolUseBlock(action, toolUseId);
    case "detect_elements":
      return convertDetectElementsActionToToolUseBlock(action, toolUseId);
    case "set_of_marks":
      return convertSetOfMarksActionToToolUseBlock(action, toolUseId);
    case "wait_for_stabilization":
      return convertWaitForStabilizationActionToToolUseBlock(action, toolUseId);
    case "predict_action":
      return convertPredictActionActionToToolUseBlock(action, toolUseId);
    case "analyze_ui":
      return convertAnalyzeUiActionToToolUseBlock(action, toolUseId);
    default:
      const exhaustiveCheck: never = action;
      throw new Error(
        `Unknown action type: ${(exhaustiveCheck as any).action}`
      );
  }
}
