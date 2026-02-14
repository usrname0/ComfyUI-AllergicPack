# General Notes For Claude (work in progress)
1. Research things before guessing
2. Discuss big changes before going ahead.
3. Use docstrings
4. No emojis or unicode characters in production code.

Maybe if we're feeling fancy:
Start with writing out a dev plan (markdown) for each feature, together with uml-as-a-sketch diagrams for what you want to do.

## Project Structure

- Each node lives in its own subfolder (e.g. `IncrementorPlus/incrementor_plus.py`)
- All JS frontend extensions live in `js/` (one file per node)
- `__init__.py` at the pack root dynamically loads all node subfolders
- Shared Python utilities go in `allergic_utils.py` at the pack root (on `sys.path` via `__init__.py`)
- Shared JS utilities go in `js/allergic_utils.js` (imported by other JS files)

## Python Conventions

### Node class pattern
Every node class must define `NODE_NAME` and `DISPLAY_NAME` as class attributes, and use them in the mappings:
```python
class MyNode:
    """Docstring describing what the node does."""

    NODE_NAME = "MyNode_Allergic"
    DISPLAY_NAME = "My Node (Allergic)"
    # ...

NODE_CLASS_MAPPINGS = {MyNode.NODE_NAME: MyNode}
NODE_DISPLAY_NAME_MAPPINGS = {MyNode.NODE_NAME: MyNode.DISPLAY_NAME}
```

### Shared utilities
- Path sanitization: `from allergic_utils import sanitize_path` — do not duplicate this in node files
- When adding new shared logic, add it to `allergic_utils.py` rather than copying between nodes

## JavaScript Conventions

### Import paths
All JS files in `js/` use `"../../../scripts/app.js"` to reach ComfyUI's app module (three levels up from the `js/` folder inside the pack inside `custom_nodes`).

### Shared helpers (js/allergic_utils.js)
- `updateSlotName(node, index, newName)` — update an output slot's display name
- `setupIncrementDefault(nodeType, widgetName, afterQueuedOverride?)` — configure the "control after generate" dropdown to default to "increment" for new nodes, with optional custom afterQueued behavior. Also handles `_isFromWorkflow` detection via configure override.