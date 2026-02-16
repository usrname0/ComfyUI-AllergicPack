"""
RememberMe Node for ComfyUI
Captures and displays Python environment information including packages, CUDA, and CLI args.
Features change detection and a button for immediate population without workflow execution.
"""

import torch
import importlib.metadata
import sys
from datetime import datetime
import server


class RememberMeNode:
    """Captures and displays Python environment information with change detection."""
    NODE_NAME = "RememberMeNode"
    DISPLAY_NAME = "Remember Me (Allergic)"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "hidden": {"populate_env": "POPULATE_ENV"}  # Hidden input for button callback
        }
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("environment_info",)
    FUNCTION = "capture_environment"
    CATEGORY = "Allergic Pack"
    OUTPUT_NODE = True

    @staticmethod
    def _strip_local_version(version):
        """Strip PEP 440 local version identifier (everything after '+').

        Build metadata like '+cu128torch2.9.0andhigher.post4' varies by
        install method and creates diff noise without adding useful info.
        """
        return version.split("+")[0] if version else version

    def _get_package_version(self, import_names, pypi_keywords, display_name):
        """Try to get package version by import or PyPI name."""
        if not isinstance(import_names, list):
            import_names = [import_names]
        if not isinstance(pypi_keywords, list):
            pypi_keywords = [pypi_keywords]

        # Try importing first
        for import_name in import_names:
            try:
                pkg = importlib.import_module(import_name)
                version = getattr(pkg, '__version__', None)
                if version:
                    return f"{display_name}: {self._strip_local_version(version)}"
            except (ImportError, Exception):
                continue

        # Try PyPI metadata
        try:
            for dist in importlib.metadata.distributions():
                dist_name_lower = dist.name.lower()
                for keyword in pypi_keywords:
                    if keyword.lower() in dist_name_lower:
                        return f"{display_name}: {self._strip_local_version(dist.version)}"
        except Exception:
            pass

        return f"{display_name}: Not Found"

    def _generate_environment_snapshot(self):
        """Generate human-readable environment snapshot"""
        lines = []
        
        # Timestamp
        try:
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            lines.append(f"Captured: {timestamp}")
        except Exception as e:
            lines.append(f"Timestamp Error: {e}")
        
        lines.append("")  # Blank line for readability
        
        # Python version
        lines.append(f"Python: {sys.version.split()[0]}")
        
        # PyTorch info
        try:
            pt_version = torch.__version__
            pytorch_line = f"PyTorch: {pt_version}"
            
            if torch.cuda.is_available():
                cuda_v = torch.version.cuda
                cudnn_v = torch.backends.cudnn.version()
                details = []
                if cuda_v:
                    details.append(f"CUDA {cuda_v}")
                if cudnn_v:
                    details.append(f"cuDNN {cudnn_v}")
                if details:
                    pytorch_line += f"\n  ({', '.join(details)})"
            else:
                pytorch_line += " (CUDA N/A)"
                
            lines.append(pytorch_line)
        except Exception as e:
            lines.append(f"PyTorch: Error - {str(e)[:50]}")
        
        # Key packages
        lines.append(self._get_package_version(["triton"], ["triton"], "Triton"))
        lines.append(self._get_package_version(["sage_attn", "sageattention"], ["sageattention", "sage-attn"], "Sage Attention"))
        lines.append(self._get_package_version(["xformers"], ["xformers"], "xformers"))
        
        # Command line args (if interesting)
        try:
            if len(sys.argv) > 1 and any(arg.startswith('--') for arg in sys.argv[1:]):
                lines.append("")
                lines.append("CLI Args:")
                args = sys.argv[1:]
                current_group = []
                
                for arg in args:
                    if arg.startswith("--"):
                        if current_group:
                            lines.append(f"  {' '.join(current_group)}")
                        current_group = [arg]
                    elif current_group:
                        current_group.append(arg)
                    else:
                        lines.append(f"  {arg}")
                
                if current_group:
                    lines.append(f"  {' '.join(current_group)}")
        except Exception as e:
            lines.append(f"CLI Args Error: {e}")
        
        return "\n".join(lines)

    def capture_environment(self, populate_env=None):
        """Capture current environment info and detect changes"""
        current_snapshot = self._generate_environment_snapshot()
        
        # For change detection, we'll store a simplified version without timestamp
        lines = current_snapshot.split('\n')
        snapshot_without_timestamp = '\n'.join([line for line in lines if not line.startswith('Captured:')])
        
        # Create payload for JavaScript change detection and display
        payload = {
            "current_snapshot": current_snapshot,
            "comparison_key": snapshot_without_timestamp,
            "timestamp": datetime.now().isoformat(),
            "populate_requested": populate_env is not None
        }
        
        return {
            "ui": {
                "environment_payload": [payload]
            },
            "result": (current_snapshot,)
        }

# Custom API endpoint for isolated environment collection
@server.PromptServer.instance.routes.post("/remember_me/populate")
async def populate_environment_info(request):
    """
    Direct API endpoint to collect environment info without executing workflows.
    Called by the "Populate Environment Info" button in the JavaScript frontend.
    """
    try:
        node_instance = RememberMeNode()
        result = node_instance.capture_environment(populate_env=True)
        
        # Validate result structure
        if not isinstance(result, dict) or "ui" not in result:
            raise ValueError("Invalid result structure from capture_environment")
            
        return server.web.json_response({
            "success": True,
            "ui": result["ui"],
            "result": result["result"]
        })
    except Exception as e:
        # Log error for debugging
        print(f"[RememberMe] API endpoint error: {str(e)}")
        return server.web.json_response({
            "success": False,
            "error": str(e)
        }, status=500)

NODE_CLASS_MAPPINGS = {RememberMeNode.NODE_NAME: RememberMeNode}
NODE_DISPLAY_NAME_MAPPINGS = {RememberMeNode.NODE_NAME: RememberMeNode.DISPLAY_NAME}