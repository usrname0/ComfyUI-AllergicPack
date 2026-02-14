import os

from aiohttp import web
from server import PromptServer

from allergic_utils import sanitize_path


@PromptServer.instance.routes.post("/allergic/folder_file_count")
async def folder_file_count_route(request):
    """API route to count files in a folder without running the queue."""
    data = await request.json()
    folder_path = data.get("folder_path", "")
    sanitized = sanitize_path(folder_path).strip()
    file_count = 0
    if sanitized and os.path.isdir(sanitized):
        try:
            file_count = sum(
                1 for entry in os.listdir(sanitized)
                if os.path.isfile(os.path.join(sanitized, entry))
            )
        except OSError:
            pass
    return web.json_response({"file_count": file_count})


class FolderFileCounter:
    """Counts files in a given folder path."""

    NODE_NAME = "FolderFileCounter_Allergic"
    DISPLAY_NAME = "Folder File Counter (Allergic)"
    OUTPUT_NODE = True

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "folder_path": ("STRING", {
                    "default": '', 
                    "multiline": True,
                    "dynamicPrompts": False,
                    "tooltip": "Enter folder path - filesystem-unfriendly characters will be automatically cleaned"
                }),
            }
        }

    RETURN_TYPES = ("STRING", "INT",)
    RETURN_NAMES = ("folder_path_out", "file_count",)
    FUNCTION = "count_files_in_folder"
    CATEGORY = "Allergic Pack" 

    def count_files_in_folder(self, folder_path):
        """Count the number of files in the given folder path."""
        file_count = 0

        if not isinstance(folder_path, str):
            path_out = str(folder_path) if folder_path is not None else ""
            return {"ui": {"value": [file_count]}, "result": (path_out, file_count)}

        sanitized = sanitize_path(folder_path)
        processed_path = sanitized.strip()

        if not processed_path or not os.path.isdir(processed_path):
            return {"ui": {"value": [file_count]}, "result": (sanitized, file_count)}

        try:
            file_count = sum(1 for entry in os.listdir(processed_path)
                             if os.path.isfile(os.path.join(processed_path, entry)))
        except OSError:
            pass

        return {"ui": {"value": [file_count]}, "result": (sanitized, file_count)}


NODE_CLASS_MAPPINGS = {FolderFileCounter.NODE_NAME: FolderFileCounter}
NODE_DISPLAY_NAME_MAPPINGS = {FolderFileCounter.NODE_NAME: FolderFileCounter.DISPLAY_NAME}