import os
import importlib.util
import sys
import traceback # For detailed error logging

# Get the directory of the current __init__.py file (which is AllergicPack folder)
allergic_pack_dir = os.path.dirname(os.path.abspath(__file__))
# __name__ will be the name of your pack's root folder, e.g., "ComfyUI-AllergicPack"

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

# --- THIS IS THE CRUCIAL ADDITION for JavaScript loading ---
WEB_DIRECTORY = "js" 
# ---------------------------------------------------------

print(f"[*] [{__name__}] Initializing custom nodes from: {allergic_pack_dir}")
print(f"[*] [{__name__}] Serving web content from subfolder: ./{WEB_DIRECTORY}") # Confirms web directory

# Iterate over all items (files and directories) in the AllergicPack directory
for node_folder_name in os.listdir(allergic_pack_dir):
    node_folder_path = os.path.join(allergic_pack_dir, node_folder_name)

    # Check if the item is a directory (this will be our node's specific subfolder)
    # Also, ignore the WEB_DIRECTORY folder itself and common non-node folders like .git, __pycache__
    if os.path.isdir(node_folder_path) and node_folder_name != WEB_DIRECTORY and not node_folder_name.startswith(('.', '_')):
        print(f"[*] [{__name__}] Processing subfolder: {node_folder_name}")
        
        for py_filename in os.listdir(node_folder_path):
            # Ensure we are only processing .py files and not __init__.py from the subfolder itself
            if py_filename.endswith(".py") and py_filename != "__init__.py":
                py_module_name_only = py_filename[:-3] # Remove .py extension
                module_file_full_path = os.path.join(node_folder_path, py_filename)

                try:
                    full_module_spec_name = f"{__name__}.{node_folder_name}.{py_module_name_only}"
                    spec = importlib.util.spec_from_file_location(full_module_spec_name, module_file_full_path)
                    
                    if spec and spec.loader:
                        module = importlib.util.module_from_spec(spec)
                        sys.modules[full_module_spec_name] = module # Add to sys.modules BEFORE exec_module
                        spec.loader.exec_module(module)
                        print(f"    [*] [{__name__}] Successfully imported module: {full_module_spec_name}")
                        
                        if hasattr(module, "NODE_CLASS_MAPPINGS"):
                            NODE_CLASS_MAPPINGS.update(module.NODE_CLASS_MAPPINGS)
                            print(f"        [*] Loaded NODE_CLASS_MAPPINGS from {py_module_name_only}")
                        if hasattr(module, "NODE_DISPLAY_NAME_MAPPINGS"):
                            NODE_DISPLAY_NAME_MAPPINGS.update(module.NODE_DISPLAY_NAME_MAPPINGS)
                            print(f"        [*] Loaded NODE_DISPLAY_NAME_MAPPINGS from {py_module_name_only}")
                    else:
                        print(f"    [!] [{__name__}] Warning: Could not create spec for module at {module_file_full_path}")
                except Exception as e:
                    print(f"    [!] [{__name__}] Error importing module from {module_file_full_path}: {e}")
                    traceback.print_exc()

# Ensure WEB_DIRECTORY is included in __all__ for ComfyUI to recognize it for this pack
__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']

print(f"[*] [{__name__}] Initialization complete. Total classes: {len(NODE_CLASS_MAPPINGS)}, Total display names: {len(NODE_DISPLAY_NAME_MAPPINGS)}")