import pyatspi
import json
import sys

def get_node_data(node):
    try:
        data = {
            "name": node.name,
            "role": node.getRoleName(),
            "description": node.description,
            "states": [pyatspi.stateToString(s) for s in node.getState().getStates()],
        }
        
        try:
            component = node.queryComponent()
            rect = component.getExtents(pyatspi.DESKTOP_COORDS)
            data["rect"] = {"x": rect.x, "y": rect.y, "width": rect.width, "height": rect.height}
        except:
            pass

        children = []
        if node.childCount < 50:
            for i in range(node.childCount):
                child = node.getChildAtIndex(i)
                if child:
                    child_data = get_node_data(child)
                    if child_data:
                        children.append(child_data)
        
        if children:
            data["children"] = children
            
        return data
    except Exception:
        return None

def main():
    try:
        reg = pyatspi.Registry
        desktop = reg.getDesktop(0)
        
        apps = []
        for i in range(desktop.childCount):
            app = desktop.getChildAtIndex(i)
            if app:
                apps.append(get_node_data(app))
        
        print(json.dumps(apps, indent=2))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
