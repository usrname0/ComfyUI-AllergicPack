import os
import re

class FolderFileCounter:
    OUTPUT_NODE = True 

    def __init__(self):
        pass

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

    def sanitize_path(self, path_str):
        """Clean filesystem-unfriendly characters from path - completely dummy-proof"""
        if not isinstance(path_str, str):
            return str(path_str) if path_str is not None else ""
        
        # First, strip any surrounding quotes
        path_str = path_str.strip()
        if (path_str.startswith('"') and path_str.endswith('"')) or (path_str.startswith("'") and path_str.endswith("'")):
            path_str = path_str[1:-1]
        
        # Handle Windows drive letters specially to preserve colons
        drive_pattern = r'^([A-Za-z]):\\?'
        drive_match = re.match(drive_pattern, path_str)
        drive_prefix = ""
        remaining_path = path_str
        
        if drive_match:
            drive_prefix = drive_match.group(1) + ":\\"
            remaining_path = path_str[len(drive_match.group(0)):]
        
        # Define what characters are NOT allowed in Windows filenames
        # Note: colon is NOT in this list since we handle drive letters separately
        forbidden_chars = '<>"|?*`!@#$%^&+={}[];,~'
        
        # Remove forbidden characters one by one (much cleaner than regex)
        sanitized = remaining_path
        for char in forbidden_chars:
            sanitized = sanitized.replace(char, '')
        
        # Remove control characters (0-31 and 127-159)
        sanitized = ''.join(char for char in sanitized if ord(char) > 31 and ord(char) < 127 or ord(char) > 159)
        
        # Clean up multiple spaces
        while '  ' in sanitized:
            sanitized = sanitized.replace('  ', ' ')
        sanitized = sanitized.strip()
        
        # Normalize slashes to backslashes for Windows
        sanitized = sanitized.replace('/', '\\')
        # Remove multiple consecutive slashes
        while '\\\\' in sanitized:
            sanitized = sanitized.replace('\\\\', '\\')
        
        # Remove trailing dots and spaces from folder names (Windows doesn't like these)
        path_parts = sanitized.split('\\')
        cleaned_parts = []
        for part in path_parts:
            cleaned_part = part.rstrip('. ')  # Remove trailing dots and spaces
            if cleaned_part:  # Only add non-empty parts
                cleaned_parts.append(cleaned_part)
        
        sanitized = '\\'.join(cleaned_parts)
        
        # Combine drive prefix with sanitized path
        final_path = drive_prefix + sanitized
        
        # Handle edge case of empty path after sanitization
        if not final_path.strip():
            return ""
            
        return final_path

    def count_files_in_folder(self, folder_path):
        processed_path = ""
        file_count_to_display = 0 

        if not isinstance(folder_path, str):
            # print(f"[FolderFileCounter] Error: Input 'folder_path' is not a string: '{folder_path}'") # Optional server log
            actual_folder_path_output = str(folder_path) if folder_path is not None else ""
            return {"ui": {"value": [file_count_to_display]}, "result": (actual_folder_path_output, file_count_to_display)}

        # Sanitize the path first
        sanitized_path = self.sanitize_path(folder_path)
        processed_path = sanitized_path.strip()

        if not processed_path:
            # print(f"[FolderFileCounter] Error: Folder path is empty. Original: '{folder_path}'") # Optional server log
            return {"ui": {"value": [file_count_to_display]}, "result": (sanitized_path, file_count_to_display)}

        if not os.path.isdir(processed_path):
            # print(f"[FolderFileCounter] Error: Path '{processed_path}' is not a dir. Original: '{folder_path}'") # Optional server log
            return {"ui": {"value": [file_count_to_display]}, "result": (sanitized_path, file_count_to_display)}

        try:
            entries = os.listdir(processed_path)
            files = [entry for entry in entries if os.path.isfile(os.path.join(processed_path, entry))]
            current_file_count = len(files)
            file_count_to_display = current_file_count
            
            # print(f"[FolderFileCounter] Path: '{processed_path}', Files: {file_count_to_display}") # Optional server log
            return {"ui": {"value": [file_count_to_display]}, "result": (sanitized_path, file_count_to_display)}
        except OSError as e:
            # print(f"[FolderFileCounter] OS Error for '{processed_path}': {e}") # Optional server log
            return {"ui": {"value": [file_count_to_display]}, "result": (sanitized_path, file_count_to_display)}
        except Exception as e:
            # print(f"[FolderFileCounter] Unexpected error for '{folder_path}': {e}") # Optional server log
            return {"ui": {"value": [file_count_to_display]}, "result": (sanitized_path, file_count_to_display)}

NODE_CLASS_MAPPINGS = {
    "FolderFileCounter_Allergic": FolderFileCounter
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "FolderFileCounter_Allergic": "Folder File Counter (Allergic)"
}