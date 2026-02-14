#!/usr/bin/env python3
"""
Advanced UI Element Detection using computer vision
Combines traditional CV techniques with accessibility tree for robust element detection
"""

import sys
import json
import base64
import io
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, asdict
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import subprocess
import os


@dataclass
class DetectedElement:
    """Represents a detected UI element"""
    id: str
    type: str
    bbox: Tuple[int, int, int, int]  # x, y, width, height
    confidence: float
    text: Optional[str] = None
    attributes: Dict[str, Any] = None
    center: Tuple[int, int] = None

    def __post_init__(self):
        if self.center is None and self.bbox:
            self.center = (
                self.bbox[0] + self.bbox[2] // 2,
                self.bbox[1] + self.bbox[3] // 2
            )


class UIElementDetector:
    """
    Multi-modal UI element detector combining:
    - Computer vision (contour detection, edge detection)
    - OCR text detection
    - Icon/button detection using traditional CV
    """

    # Element types we can detect
    ELEMENT_TYPES = {
        'button': {'min_area': 500, 'max_area': 50000, 'aspect_ratio': (0.2, 5)},
        'input_field': {'min_area': 800, 'max_area': 100000, 'aspect_ratio': (2, 15)},
        'checkbox': {'min_area': 100, 'max_area': 2500, 'aspect_ratio': (0.8, 1.2)},
        'icon': {'min_area': 50, 'max_area': 5000, 'aspect_ratio': (0.5, 2)},
        'text_block': {'min_area': 200, 'max_area': 500000, 'aspect_ratio': (0.1, 20)},
        'window': {'min_area': 10000, 'max_area': 2000000, 'aspect_ratio': (0.5, 2)},
    }

    def __init__(self):
        self.elements: List[DetectedElement] = []
        self.image: Optional[Image.Image] = None
        self.np_image: Optional[np.ndarray] = None

    def detect_from_screenshot(self, image_path: str) -> List[Dict[str, Any]]:
        """Main entry point: detect all elements from a screenshot"""
        try:
            self.image = Image.open(image_path).convert('RGB')
            self.np_image = np.array(self.image)

            # Run multiple detection strategies
            self._detect_by_contours()
            self._detect_text_regions()
            self._detect_clickable_regions()

            # Merge overlapping detections
            self._merge_overlapping_elements()

            # Sort by confidence
            self.elements.sort(key=lambda x: x.confidence, reverse=True)

            # Limit to top elements
            self.elements = self.elements[:100]

            return [asdict(e) for e in self.elements]

        except Exception as e:
            return [{'error': str(e)}]

    def _detect_by_contours(self):
        """Detect UI elements using contour detection"""
        try:
            import cv2

            gray = cv2.cvtColor(self.np_image, cv2.COLOR_RGB2GRAY)

            # Apply bilateral filter to reduce noise while keeping edges
            blurred = cv2.bilateralFilter(gray, 9, 75, 75)

            # Edge detection
            edges = cv2.Canny(blurred, 50, 150)

            # Dilate to connect nearby edges
            kernel = np.ones((3, 3), np.uint8)
            dilated = cv2.dilate(edges, kernel, iterations=1)

            # Find contours
            contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            height, width = self.np_image.shape[:2]

            for i, contour in enumerate(contours):
                x, y, w, h = cv2.boundingRect(contour)

                # Skip very small elements
                if w < 10 or h < 10:
                    continue

                # Skip elements at screen edges (likely window borders)
                if x == 0 or y == 0 or x + w >= width - 1 or y + h >= height - 1:
                    continue

                area = w * h
                aspect_ratio = w / h if h > 0 else 0

                # Determine element type based on geometry
                element_type = self._classify_by_geometry(area, aspect_ratio, w, h)

                if element_type:
                    confidence = self._calculate_confidence(contour, element_type)

                    element = DetectedElement(
                        id=f"cv_{i}",
                        type=element_type,
                        bbox=(x, y, w, h),
                        confidence=confidence,
                        attributes={
                            'area': area,
                            'aspect_ratio': aspect_ratio,
                            'detection_method': 'contour'
                        }
                    )
                    self.elements.append(element)

        except ImportError:
            pass  # OpenCV not available

    def _detect_text_regions(self):
        """Detect text regions using OCR"""
        try:
            import pytesseract
            from pytesseract import Output

            data = pytesseract.image_to_data(self.image, output_type=Output.DICT)

            n_boxes = len(data['text'])
            for i in range(n_boxes):
                if int(data['conf'][i]) > 30:  # Confidence threshold
                    text = data['text'][i].strip()
                    if len(text) < 2:  # Skip single characters
                        continue

                    x, y, w, h = data['left'][i], data['top'][i], data['width'][i], data['height'][i]

                    element = DetectedElement(
                        id=f"ocr_{i}",
                        type='text',
                        bbox=(x, y, w, h),
                        confidence=data['conf'][i] / 100.0,
                        text=text,
                        attributes={
                            'detection_method': 'ocr',
                            'ocr_confidence': data['conf'][i]
                        }
                    )
                    self.elements.append(element)

        except ImportError:
            pass  # pytesseract not available

    def _detect_clickable_regions(self):
        """Detect potentially clickable regions using heuristics"""
        try:
            import cv2

            # Convert to HSV for better color analysis
            hsv = cv2.cvtColor(self.np_image, cv2.COLOR_RGB2HSV)

            # Look for button-like colors (blues, grays)
            lower_blue = np.array([90, 50, 50])
            upper_blue = np.array([130, 255, 255])
            blue_mask = cv2.inRange(hsv, lower_blue, upper_blue)

            # Find contours in button-colored regions
            contours, _ = cv2.findContours(blue_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            for i, contour in enumerate(contours):
                x, y, w, h = cv2.boundingRect(contour)
                area = w * h

                if area < 500 or area > 50000:
                    continue

                element = DetectedElement(
                    id=f"color_{i}",
                    type='button_candidate',
                    bbox=(x, y, w, h),
                    confidence=0.6,
                    attributes={
                        'detection_method': 'color',
                        'area': area
                    }
                )
                self.elements.append(element)

        except ImportError:
            pass

    def _classify_by_geometry(self, area: int, aspect_ratio: float, width: int, height: int) -> Optional[str]:
        """Classify element type based on geometric properties"""
        for elem_type, criteria in self.ELEMENT_TYPES.items():
            min_area, max_area = criteria['min_area'], criteria['max_area']
            min_ar, max_ar = criteria['aspect_ratio']

            if min_area <= area <= max_area and min_ar <= aspect_ratio <= max_ar:
                # Additional checks for specific types
                if elem_type == 'checkbox':
                    if abs(width - height) > 5:  # Checkboxes should be roughly square
                        continue
                return elem_type

        return 'unknown'

    def _calculate_confidence(self, contour, element_type: str) -> float:
        """Calculate confidence score for a detection"""
        try:
            import cv2

            area = cv2.contourArea(contour)
            perimeter = cv2.arcLength(contour, True)

            if perimeter == 0:
                return 0.5

            # Circularity: 1 = perfect circle, 0 = irregular
            circularity = 4 * np.pi * area / (perimeter ** 2)

            # Base confidence
            base_conf = 0.7

            # Boost for regular shapes (likely UI elements)
            if circularity > 0.5:
                base_conf += 0.1

            # Boost for certain types
            if element_type in ['button', 'checkbox']:
                base_conf += 0.1

            return min(base_conf, 0.95)

        except:
            return 0.7

    def _merge_overlapping_elements(self, iou_threshold: float = 0.5):
        """Merge overlapping element detections using NMS-like approach"""
        if not self.elements:
            return

        # Sort by confidence
        self.elements.sort(key=lambda x: x.confidence, reverse=True)

        merged = []
        for elem in self.elements:
            should_merge = False
            for kept in merged:
                iou = self._calculate_iou(elem.bbox, kept.bbox)
                if iou > iou_threshold:
                    # Merge: keep the higher confidence one, but combine attributes
                    should_merge = True
                    break

            if not should_merge:
                merged.append(elem)

        self.elements = merged

    def _calculate_iou(self, bbox1: Tuple[int, int, int, int], bbox2: Tuple[int, int, int, int]) -> float:
        """Calculate Intersection over Union for two bounding boxes"""
        x1, y1, w1, h1 = bbox1
        x2, y2, w2, h2 = bbox2

        xi1 = max(x1, x2)
        yi1 = max(y1, y2)
        xi2 = min(x1 + w1, x2 + w2)
        yi2 = min(y1 + h1, y2 + h2)

        inter_width = max(0, xi2 - xi1)
        inter_height = max(0, yi2 - yi1)
        inter_area = inter_width * inter_height

        box1_area = w1 * h1
        box2_area = w2 * h2
        union_area = box1_area + box2_area - inter_area

        if union_area == 0:
            return 0

        return inter_area / union_area


def annotate_image(image_path: str, elements: List[Dict], output_path: str):
    """Annotate an image with detected element bounding boxes and IDs"""
    try:
        image = Image.open(image_path).convert('RGB')
        draw = ImageDraw.Draw(image)

        # Try to load a font, fallback to default
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 12)
        except:
            font = ImageFont.load_default()

        # Color map for different element types
        colors = {
            'button': '#FF6B6B',
            'input_field': '#4ECDC4',
            'checkbox': '#45B7D1',
            'text': '#96CEB4',
            'icon': '#FFEAA7',
            'window': '#DDA0DD',
            'unknown': '#808080',
            'button_candidate': '#FFB6C1',
        }

        for elem in elements:
            if 'error' in elem:
                continue

            bbox = elem.get('bbox', (0, 0, 0, 0))
            elem_type = elem.get('type', 'unknown')
            elem_id = elem.get('id', 'unknown')
            confidence = elem.get('confidence', 0)

            color = colors.get(elem_type, '#808080')

            # Draw rectangle
            draw.rectangle(
                [bbox[0], bbox[1], bbox[0] + bbox[2], bbox[1] + bbox[3]],
                outline=color,
                width=2
            )

            # Draw label
            label = f"{elem_id} ({confidence:.2f})"
            text_bbox = draw.textbbox((0, 0), label, font=font)
            text_width = text_bbox[2] - text_bbox[0]
            text_height = text_bbox[3] - text_bbox[1]

            # Draw label background
            draw.rectangle(
                [bbox[0], bbox[1] - text_height - 4, bbox[0] + text_width + 4, bbox[1]],
                fill=color
            )

            # Draw label text
            draw.text(
                (bbox[0] + 2, bbox[1] - text_height - 2),
                label,
                fill='white',
                font=font
            )

        image.save(output_path)
        return True

    except Exception as e:
        return {'error': str(e)}


def main():
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: element_detector.py <screenshot_path> [annotate_output_path]'})),
        sys.exit(1)

    image_path = sys.argv[1]
    annotate_output = sys.argv[2] if len(sys.argv) > 2 else None

    if not os.path.exists(image_path):
        print(json.dumps({'error': f'Image not found: {image_path}'})),
        sys.exit(1)

    detector = UIElementDetector()
    elements = detector.detect_from_screenshot(image_path)

    result = {
        'elements': elements,
        'count': len(elements),
        'image_path': image_path,
    }

    if annotate_output:
        annotate_result = annotate_image(image_path, elements, annotate_output)
        if isinstance(annotate_result, dict) and 'error' in annotate_result:
            result['annotate_error'] = annotate_result['error']
        else:
            result['annotated_image'] = annotate_output

    print(json.dumps(result))


if __name__ == '__main__':
    main()
