#!/usr/bin/env python3
"""
Robust AXTree dumper for Linux desktop accessibility.
Falls back gracefully when AT-SPI is not available or fails.
"""

import json
import sys
import os
import subprocess
import re

# Maximum number of children to traverse per node (prevents runaway recursion)
MAX_CHILDREN = 100
# Maximum depth of tree traversal
MAX_DEPTH = 10
# Maximum total nodes to prevent memory issues
MAX_NODES = 1000


def get_window_list():
    """Fallback: Get window list using wmctrl and xwininfo."""
    windows = []
    try:
        # Get window list with geometry
        result = subprocess.run(
            ['wmctrl', '-lG'],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            for line in result.result.strip().split('\n'):
                parts = line.split(None, 6)  # Split by whitespace, max 7 parts
                if len(parts) >= 7:
                    try:
                        win_id, desktop, x, y, width, height = parts[0], parts[1], int(parts[2]), int(parts[3]), int(parts[4]), int(parts[5])
                        title = parts[6] if len(parts) > 6 else ''
                        windows.append({
                            'name': title,
                            'role': 'window',
                            'rect': {'x': x, 'y': y, 'width': width, 'height': height},
                            'window_id': win_id,
                            'desktop': desktop
                        })
                    except (ValueError, IndexError):
                        continue
    except Exception as e:
        pass
    return windows


def get_xprop_info(window_id):
    """Get additional window properties using xprop."""
    try:
        result = subprocess.run(
            ['xprop', '-id', window_id],
            capture_output=True,
            text=True,
            timeout=2
        )
        if result.returncode == 0:
            props = {}
            # Extract WM_CLASS
            match = re.search(r'WM_CLASS\(STRING\) = "([^"]+)"', result.stdout)
            if match:
                props['wm_class'] = match.group(1)
            # Extract WM_WINDOW_ROLE
            match = re.search(r'WM_WINDOW_ROLE\(STRING\) = "([^"]+)"', result.stdout)
            if match:
                props['window_role'] = match.group(1)
            return props
    except Exception:
        pass
    return {}


def try_pyatspi():
    """Try to use pyatspi for accessibility tree."""
    try:
        import pyatspi

        node_count = [0]  # Use list for mutable closure

        def get_node_data(node, depth=0):
            if depth > MAX_DEPTH or node_count[0] >= MAX_NODES:
                return None

            try:
                node_count[0] += 1
                data = {
                    'name': node.name or '',
                    'role': node.getRoleName() or 'unknown',
                    'description': node.description or '',
                }

                # Get component geometry
                try:
                    component = node.queryComponent()
                    rect = component.getExtents(pyatspi.DESKTOP_COORDS)
                    data['rect'] = {
                        'x': max(0, rect.x),
                        'y': max(0, rect.y),
                        'width': max(0, rect.width),
                        'height': max(0, rect.height)
                    }
                except Exception:
                    pass

                # Get states
                try:
                    states = node.getState()
                    data['states'] = [pyatspi.stateToString(s) for s in states.getStates()]
                except Exception:
                    data['states'] = []

                # Get children (with limits)
                children = []
                try:
                    child_count = min(node.childCount, MAX_CHILDREN)
                    for i in range(child_count):
                        try:
                            child = node.getChildAtIndex(i)
                            if child:
                                child_data = get_node_data(child, depth + 1)
                                if child_data:
                                    children.append(child_data)
                        except Exception:
                            continue
                except Exception:
                    pass

                if children:
                    data['children'] = children

                return data
            except Exception:
                return None

        # Get desktop and traverse applications
        reg = pyatspi.Registry
        desktop = reg.getDesktop(0)

        apps = []
        for i in range(desktop.childCount):
            try:
                app = desktop.getChildAtIndex(i)
                if app and app.name:  # Only include apps with names
                    app_data = get_node_data(app)
                    if app_data:
                        apps.append(app_data)
            except Exception:
                continue

        if apps:
            return {'type': 'axtree', 'applications': apps}
        return None

    except ImportError:
        return {'error': 'pyatspi not available', 'fallback': True}
    except Exception as e:
        return {'error': str(e), 'fallback': True}


def get_x11_tree():
    """Get UI tree using X11 tools as fallback."""
    windows = get_window_list()

    if not windows:
        # Try xdotool as another fallback
        try:
            result = subprocess.run(
                ['xdotool', 'search', '--onlyvisible', '.'],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0:
                for line in result.stdout.strip().split('\n'):
                    if line.strip():
                        try:
                            win_id = line.strip()
                            # Get window geometry
                            geo_result = subprocess.run(
                                ['xdotool', 'getwindowgeometry', win_id],
                                capture_output=True,
                                text=True,
                                timeout=2
                            )
                            if geo_result.returncode == 0:
                                # Parse geometry output
                                x_match = re.search(r'Position: (\d+),(\d+)', geo_result.stdout)
                                s_match = re.search(r'Geometry: (\d+)x(\d+)', geo_result.stdout)
                                if x_match and s_match:
                                    x, y = int(x_match.group(1)), int(x_match.group(2))
                                    w, h = int(s_match.group(1)), int(s_match.group(2))
                                    # Get window name
                                    name_result = subprocess.run(
                                        ['xdotool', 'getwindowname', win_id],
                                        capture_output=True,
                                        text=True,
                                        timeout=2
                                    )
                                    name = name_result.stdout.strip() if name_result.returncode == 0 else 'Unknown'
                                    windows.append({
                                        'name': name,
                                        'role': 'window',
                                        'rect': {'x': x, 'y': y, 'width': w, 'height': h},
                                        'window_id': win_id
                                    })
                        except Exception:
                            continue
        except Exception:
            pass

    if windows:
        return {
            'type': 'x11tree',
            'applications': windows,
            'source': 'x11_fallback'
        }
    return None


def main():
    """Main entry point with multiple fallback strategies."""
    result = None

    # Try 1: AT-SPI / pyatspi (most detailed)
    result = try_pyatspi()
    if result and not result.get('fallback') and not result.get('error'):
        print(json.dumps(result, indent=2))
        return 0

    # Try 2: X11-based fallback
    result = get_x11_tree()
    if result:
        print(json.dumps(result, indent=2))
        return 0

    # Final fallback: Empty but valid structure
    print(json.dumps({
        'type': 'empty',
        'applications': [],
        'error': 'No accessibility information available',
        'message': 'Desktop environment may not support accessibility APIs'
    }, indent=2))
    return 1


if __name__ == '__main__':
    sys.exit(main())
