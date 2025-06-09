import os

class FolderFileCounter:
    OUTPUT_NODE = True 

    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "folder_path": ("STRING", {"default": '', "multiline": True}),
            }
        }

    RETURN_TYPES = ("STRING", "INT",)
    RETURN_NAMES = ("folder_path_out", "file_count",)
    FUNCTION = "count_files_in_folder"
    CATEGORY = "Allergic Pack" 

    def count_files_in_folder(self, folder_path):
        processed_path = ""
        file_count_to_display = 0 

        if not isinstance(folder_path, str):
            # print(f"[FolderFileCounter] Error: Input 'folder_path' is not a string: '{folder_path}'") # Optional server log
            actual_folder_path_output = str(folder_path) if folder_path is not None else ""
            return {"ui": {"value": [file_count_to_display]}, "result": (actual_folder_path_output, file_count_to_display)}

        processed_path = folder_path.strip()

        if not processed_path:
            # print(f"[FolderFileCounter] Error: Folder path is empty. Original: '{folder_path}'") # Optional server log
            return {"ui": {"value": [file_count_to_display]}, "result": (folder_path, file_count_to_display)}

        if not os.path.isdir(processed_path):
            # print(f"[FolderFileCounter] Error: Path '{processed_path}' is not a dir. Original: '{folder_path}'") # Optional server log
            return {"ui": {"value": [file_count_to_display]}, "result": (folder_path, file_count_to_display)}

        try:
            entries = os.listdir(processed_path)
            files = [entry for entry in entries if os.path.isfile(os.path.join(processed_path, entry))]
            current_file_count = len(files)
            file_count_to_display = current_file_count
            
            # print(f"[FolderFileCounter] Path: '{processed_path}', Files: {file_count_to_display}") # Optional server log
            return {"ui": {"value": [file_count_to_display]}, "result": (folder_path, file_count_to_display)}
        except OSError as e:
            # print(f"[FolderFileCounter] OS Error for '{processed_path}': {e}") # Optional server log
            return {"ui": {"value": [file_count_to_display]}, "result": (folder_path, file_count_to_display)}
        except Exception as e:
            # print(f"[FolderFileCounter] Unexpected error for '{folder_path}': {e}") # Optional server log
            return {"ui": {"value": [file_count_to_display]}, "result": (folder_path, file_count_to_display)}

NODE_CLASS_MAPPINGS = {
    "FolderFileCounter_Allergic": FolderFileCounter
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "FolderFileCounter_Allergic": "Folder File Counter (Allergic)"
}