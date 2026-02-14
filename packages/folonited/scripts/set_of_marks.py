#!/usr/bin/env python3
"""
Set-of-Marks Visual Prompting for Desktop UI Understanding
Based on Microsoft's Set-of-Marks (SoM) technique for grounding multimodal LLMs
"""

import sys
import json
import base64
import os
from typing import List, Dict, Any, Tuple, Optional
from dataclasses import dataclass, asdict
from PIL import Image, ImageDraw, ImageFont
import colorsys
import math


@dataclass
class MarkedElement:
    """An element marked for visual prompting"""
    id: int
    label: str
    bbox: Tuple[int, int, int, int]  # x, y, width, height
    center: Tuple[int, int]
    element_type: str
    text: Optional[str] = None
    confidence: float = 1.0
    attributes: Dict[str, Any] = None


class SetOfMarks:
    """
    Implements Set-of-Marks visual prompting for desktop UI

    Creates annotated screenshots with numbered markers that help LLMs:
    1. Identify interactive elements
    2. Understand spatial relationships
    3. Select precise coordinates for actions
    """

    # Marker colors for different element types (vibrant, distinguishable)
    MARKER_COLORS = {
        'button': '#FF0000',        # Red
        'input': '#00FF00',         # Green
        'text': '#0000FF',          # Blue
        'link': '#FF00FF',          # Magenta
        'menu': '#00FFFF',          # Cyan
        'icon': '#FFFF00',          # Yellow
        'window': '#FF8000',        # Orange
        'checkbox': '#8000FF',      # Purple
        'dropdown': '#0080FF',      # Light Blue
        'default': '#808080',       # Gray
    }

    def __init__(self, marker_size: int = 20):
        self.marker_size = marker_size
        self.elements: List[MarkedElement] = []
        self.image: Optional[Image.Image] = None
        self.width: int = 0
        self.height: int = 0

    def create_marks_from_axtree(self, screenshot_path: str, axtree_data: Dict) -> Dict[str, Any]:
        """
        Create Set-of-Marks annotation from AXTree data + screenshot

        Args:
            screenshot_path: Path to screenshot image
            axtree_data: Parsed accessibility tree data

        Returns:
            Dictionary with annotated image path and element mappings
        """
        try:
            self.image = Image.open(screenshot_path).convert('RGB')
            self.width, self.height = self.image.size

            # Extract interactive elements from AXTree
            self._extract_interactive_elements(axtree_data)

            # Filter and rank elements
            self._filter_and_rank_elements()

            # Create annotated image
            annotated_image = self._annotate_image()

            # Create element mapping for LLM
            element_map = self._create_element_mapping()

            return {
                'success': True,
                'annotated_image': annotated_image,
                'element_count': len(self.elements),
                'elements': [asdict(e) for e in self.elements],
                'element_map': element_map,
                'legend': self._create_legend(),
            }

        except Exception as e:
            return {
                'success': False,
                'error': str(e),
            }

    def create_marks_from_elements(self, screenshot_path: str, elements: List[Dict]) -> Dict[str, Any]:
        """
        Create Set-of-Marks from pre-detected elements (e.g., from CV detection)

        Args:
            screenshot_path: Path to screenshot image
            elements: List of detected elements with bbox info

        Returns:
            Dictionary with annotated image and mappings
        """
        try:
            self.image = Image.open(screenshot_path).convert('RGB')
            self.width, self.height = self.image.size

            # Convert detected elements to MarkedElement
            for i, elem in enumerate(elements[:50]):  # Limit to 50 elements
                bbox = elem.get('bbox', (0, 0, 0, 0))
                if bbox[2] == 0 or bbox[3] == 0:  # Skip empty bboxes
                    continue

                marked = MarkedElement(
                    id=i + 1,
                    label=str(i + 1),
                    bbox=bbox,
                    center=(bbox[0] + bbox[2] // 2, bbox[1] + bbox[3] // 2),
                    element_type=elem.get('type', 'unknown'),
                    text=elem.get('text'),
                    confidence=elem.get('confidence', 1.0),
                    attributes=elem.get('attributes', {})
                )
                self.elements.append(marked)

            # Create annotated image
            annotated_image = self._annotate_image()

            # Create element mapping
            element_map = self._create_element_mapping()

            return {
                'success': True,
                'annotated_image': annotated_image,
                'element_count': len(self.elements),
                'elements': [asdict(e) for e in self.elements],
                'element_map': element_map,
                'legend': self._create_legend(),
            }

        except Exception as e:
            return {
                'success': False,
                'error': str(e),
            }

    def _extract_interactive_elements(self, axtree_data: Dict):
        """Extract interactive elements from AXTree"""
        interactive_roles = {
            'push button', 'button', 'link', 'text', 'entry',
            'check box', 'radio button', 'combo box', 'menu item',
            'scroll bar', 'slider', 'tab', 'toggle button',
            'menu', 'list item', 'tree item', 'table cell'
        }

        def traverse(node: Dict, depth: int = 0):
            if not isinstance(node, dict):
                return

            role = node.get('role', '').lower()
            name = node.get('name', '')
            rect = node.get('rect')

            # Check if this is an interactive element
            is_interactive = any(r in role for r in interactive_roles)
            has_valid_rect = rect and all(k in rect for k in ['x', 'y', 'width', 'height'])
            has_content = name or is_interactive

            if is_interactive and has_valid_rect and has_content:
                element = MarkedElement(
                    id=len(self.elements) + 1,
                    label=str(len(self.elements) + 1),
                    bbox=(rect['x'], rect['y'], rect['width'], rect['height']),
                    center=(rect['x'] + rect['width'] // 2, rect['y'] + rect['height'] // 2),
                    element_type=self._normalize_role(role),
                    text=name if name else None,
                    attributes={
                        'depth': depth,
                        'description': node.get('description'),
                        'states': node.get('states', []),
                    }
                )
                self.elements.append(element)

            # Traverse children
            children = node.get('children', [])
            if isinstance(children, list):
                for child in children:
                    traverse(child, depth + 1)

        # Start traversal from root
        if isinstance(axtree_data, dict):
            if 'tree' in axtree_data:
                for node in axtree_data['tree']:
                    traverse(node)
            else:
                traverse(axtree_data)

    def _normalize_role(self, role: str) -> str:
        """Normalize accessibility role to our element types"""
        role_mapping = {
            'push button': 'button',
            'button': 'button',
            'link': 'link',
            'text': 'text',
            'entry': 'input',
            'check box': 'checkbox',
            'radio button': 'radio',
            'combo box': 'dropdown',
            'menu item': 'menu',
            'menu': 'menu',
            'scroll bar': 'scrollbar',
            'tab': 'tab',
            'toggle button': 'button',
            'list item': 'text',
        }

        for key, value in role_mapping.items():
            if key in role:
                return value

        return 'default'

    def _filter_and_rank_elements(self):
        """Filter out overlapping elements and rank by importance"""
        # Remove elements that are too small
        self.elements = [e for e in self.elements
                        if e.bbox[2] >= 10 and e.bbox[3] >= 10]  # min 10x10

        # Remove elements that are too large (likely windows/containers)
        self.elements = [e for e in self.elements
                        if e.bbox[2] < self.width * 0.8 or e.bbox[3] < self.height * 0.8]

        # Sort by: interactive type > has text > size > depth
        def importance_score(e: MarkedElement) -> float:
            score = 0

            # Interactive elements get higher priority
            if e.element_type in ['button', 'input', 'link']:
                score += 100

            # Elements with text
            if e.text:
                score += 50

            # Reasonable size (not too small, not too big)
            area = e.bbox[2] * e.bbox[3]
            if 500 <= area <= 50000:
                score += 25

            # Penalty for very deep nesting
            depth = e.attributes.get('depth', 0) if e.attributes else 0
            score -= depth * 5

            return score

        self.elements.sort(key=importance_score, reverse=True)

        # Reassign IDs after sorting
        for i, elem in enumerate(self.elements):
            elem.id = i + 1
            elem.label = str(i + 1)

        # Limit to 50 most important elements
        self.elements = self.elements[:50]

        # Remove heavily overlapping elements
        self._remove_overlapping()

    def _remove_overlapping(self, iou_threshold: float = 0.7):
        """Remove elements with high overlap, keeping higher priority ones"""
        to_remove = set()

        for i, elem1 in enumerate(self.elements):
            if i in to_remove:
                continue

            for j, elem2 in enumerate(self.elements[i + 1:], start=i + 1):
                if j in to_remove:
                    continue

                iou = self._calculate_iou(elem1.bbox, elem2.bbox)
                if iou > iou_threshold:
                    # Remove the smaller one
                    area1 = elem1.bbox[2] * elem1.bbox[3]
                    area2 = elem2.bbox[2] * elem2.bbox[3]
                    if area1 < area2:
                        to_remove.add(i)
                    else:
                        to_remove.add(j)

        self.elements = [e for i, e in enumerate(self.elements) if i not in to_remove]

        # Reassign IDs
        for i, elem in enumerate(self.elements):
            elem.id = i + 1
            elem.label = str(i + 1)

    def _calculate_iou(self, bbox1: Tuple[int, int, int, int], bbox2: Tuple[int, int, int, int]) -> float:
        """Calculate Intersection over Union"""
        x1, y1, w1, h1 = bbox1
        x2, y2, w2, h2 = bbox2

        xi1 = max(x1, x2)
        yi1 = max(y1, y2)
        xi2 = min(x1 + w1, x2 + w2)
        yi2 = min(y1 + h1, y2 + h2)

        inter_area = max(0, xi2 - xi1) * max(0, yi2 - yi1)
        union_area = w1 * h1 + w2 * h2 - inter_area

        return inter_area / union_area if union_area > 0 else 0

    def _annotate_image(self) -> str:
        """Create annotated image with markers"""
        annotated = self.image.copy()
        draw = ImageDraw.Draw(annotated)

        # Try to load fonts
        try:
            font_large = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 14)
            font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 10)
        except:
            font_large = ImageFont.load_default()
            font_small = font_large

        for elem in self.elements:
            color = self.MARKER_COLORS.get(elem.element_type, self.MARKER_COLORS['default'])
            self._draw_marker(draw, elem, color, font_large, font_small)

        # Save annotated image
        output_path = f"/tmp/som_annotated_{os.getpid()}.png"
        annotated.save(output_path)

        # Convert to base64
        with open(output_path, 'rb') as f:
            base64_image = base64.b64encode(f.read()).decode('utf-8')

        return base64_image

    def _draw_marker(self, draw: ImageDraw, elem: MarkedElement, color: str,
                     font_large: ImageFont, font_small: ImageFont):
        """Draw a numbered marker for an element"""
        x, y, w, h = elem.bbox
        cx, cy = elem.center

        # Draw bounding box
        draw.rectangle([x, y, x + w, y + h], outline=color, width=2)

        # Calculate marker position (above the element if possible)
        marker_radius = self.marker_size // 2
        marker_y = y - marker_radius - 5
        if marker_y < marker_radius:  # Would be off-screen, put inside instead
            marker_y = y + marker_radius + 5

        marker_x = max(marker_radius + 5, min(cx, self.width - marker_radius - 5))

        # Draw marker circle
        draw.ellipse(
            [marker_x - marker_radius, marker_y - marker_radius,
             marker_x + marker_radius, marker_y + marker_radius],
            fill=color,
            outline='white',
            width=2
        )

        # Draw marker number
        text = elem.label
        bbox = draw.textbbox((0, 0), text, font=font_large)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]

        draw.text(
            (marker_x - text_width // 2, marker_y - text_height // 2),
            text,
            fill='white',
            font=font_large
        )

        # Draw element type label (small, below marker)
        if elem.text:
            label = elem.text[:20] + '...' if len(elem.text) > 20 else elem.text
        else:
            label = elem.element_type

        label_bbox = draw.textbbox((0, 0), label, font=font_small)
        label_width = label_bbox[2] - label_bbox[0]

        label_x = max(5, min(cx - label_width // 2, self.width - label_width - 5))
        label_y = y + h + 3

        # Draw semi-transparent background for label
        draw.rectangle(
            [label_x - 2, label_y - 1, label_x + label_width + 2, label_y + 10],
            fill=color
        )

        draw.text((label_x, label_y), label, fill='white', font=font_small)

    def _create_element_mapping(self) -> Dict[str, Any]:
        """Create a mapping of marker IDs to element info for LLM"""
        mapping = {}

        for elem in self.elements:
            mapping[elem.label] = {
                'type': elem.element_type,
                'coordinates': {
                    'x': elem.center[0],
                    'y': elem.center[1],
                    'bbox': elem.bbox,
                },
                'text': elem.text,
                'attributes': elem.attributes,
            }

        return mapping

    def _create_legend(self) -> Dict[str, str]:
        """Create a color legend for element types"""
        legend = {}
        for elem_type, color in self.MARKER_COLORS.items():
            if any(e.element_type == elem_type for e in self.elements):
                legend[elem_type] = color
        return legend


def main():
    if len(sys.argv) < 3:
        print(json.dumps({
            'error': 'Usage: set_of_marks.py <screenshot_path> <mode> [axtree_json_or_elements_json]'
        }))
        sys.exit(1)

    screenshot_path = sys.argv[1]
    mode = sys.argv[2]  # 'axtree' or 'elements'

    if not os.path.exists(screenshot_path):
        print(json.dumps({'error': f'Screenshot not found: {screenshot_path}'}))
        sys.exit(1)

    som = SetOfMarks()

    if mode == 'axtree':
        if len(sys.argv) < 4:
            print(json.dumps({'error': 'AXTree JSON required for axtree mode'}))
            sys.exit(1)

        try:
            axtree_data = json.loads(sys.argv[3])
        except json.JSONDecodeError as e:
            print(json.dumps({'error': f'Invalid AXTree JSON: {str(e)}'}))
            sys.exit(1)

        result = som.create_marks_from_axtree(screenshot_path, axtree_data)

    elif mode == 'elements':
        if len(sys.argv) < 4:
            print(json.dumps({'error': 'Elements JSON required for elements mode'}))
            sys.exit(1)

        try:
            elements = json.loads(sys.argv[3])
        except json.JSONDecodeError as e:
            print(json.dumps({'error': f'Invalid elements JSON: {str(e)}'}))
            sys.exit(1)

        result = som.create_marks_from_elements(screenshot_path, elements)

    else:
        print(json.dumps({'error': f'Unknown mode: {mode}. Use "axtree" or "elements"'}))
        sys.exit(1)

    print(json.dumps(result))


if __name__ == '__main__':
    main()
