import React from "react";
import { ComputerToolUseContentBlock } from "@folonite/shared";
import { ComputerToolContentTakeOver } from "./ComputerToolContentTakeOver";
import { ComputerToolContentNormal } from "./ComputerToolContentNormal";

interface ComputerToolContentProps {
  block: ComputerToolUseContentBlock;
  isTakeOver?: boolean;
}

export function ComputerToolContent({ block, isTakeOver = false }: ComputerToolContentProps) {
  if (isTakeOver) {
    return <ComputerToolContentTakeOver block={block} />;
  }
  
  return <ComputerToolContentNormal block={block} />;
}