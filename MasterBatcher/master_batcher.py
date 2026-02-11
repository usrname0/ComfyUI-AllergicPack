"""
MasterBatcher Node for ComfyUI.

Combines folder listing, batch counting, and image loading into a single node.
Accepts a multi-line list of folder paths and auto-increments through all of
them batch by batch, outputting the correct folder path with every batch.
"""

import os
import re
import math
import random

import numpy as np
import torch
from PIL import Image, ImageOps
import server


IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.tif', '.webp'}

SORT_METHODS = [
    "alphabetical",
    "alphabetical_reverse",
    "modified_newest",
    "modified_oldest",
    "created_newest",
    "created_oldest",
    "random",
]


class MasterBatcher:
    """Batched image loader that processes multiple folders sequentially.

    A single batch_index (0, 1, 2, ...) auto-increments by 1. The node
    internally maps this to the correct folder and local file offset.
    Each folder starts its batches fresh at index 0.
    """

    OUTPUT_NODE = True

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "folder_paths": ("STRING", {
                    "default": "",
                    "multiline": True,
                    "dynamicPrompts": False,
                    "tooltip": "One folder path per line",
                }),
                "batch_size": ("INT", {
                    "default": 1,
                    "min": 1,
                    "max": 1000,
                    "step": 1,
                    "tooltip": "Number of images per batch",
                }),
                "batch_index": ("INT", {
                    "default": 0,
                    "min": 0,
                    "step": 1,
                    "control_after_generate": "increment",
                    "tooltip": "Current batch index (auto-increments)",
                }),
                "reset_batch_to": ("INT", {
                    "default": 0,
                    "min": 0,
                    "step": 1,
                    "tooltip": "Value to reset batch_index to when Reset is clicked",
                }),
                "sort_method": (SORT_METHODS, {
                    "default": "alphabetical",
                    "tooltip": "How to sort files within each folder",
                }),
                "load_always": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "When True, bypasses caching to always reload images",
                }),
            }
        }

    RETURN_TYPES = ("IMAGE", "MASK", "INT", "STRING", "INT")
    RETURN_NAMES = ("images", "masks", "batch_count", "folder_path", "total_batches")
    FUNCTION = "load_batch"
    CATEGORY = "Allergic Pack"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        """Bypass caching when load_always is True."""
        if kwargs.get("load_always", True):
            return float("NaN")
        return ""

    def sanitize_path(self, path_str):
        """Clean filesystem-unfriendly characters from a path string."""
        if not isinstance(path_str, str):
            return str(path_str) if path_str is not None else ""

        path_str = path_str.strip()
        if (path_str.startswith('"') and path_str.endswith('"')) or \
           (path_str.startswith("'") and path_str.endswith("'")):
            path_str = path_str[1:-1]

        drive_pattern = r'^([A-Za-z]):\\?'
        drive_match = re.match(drive_pattern, path_str)
        drive_prefix = ""
        remaining_path = path_str

        if drive_match:
            drive_prefix = drive_match.group(1) + ":\\"
            remaining_path = path_str[len(drive_match.group(0)):]

        forbidden_chars = '<>"|?*`!@#$%^&+={}[];,~'
        sanitized = remaining_path
        for char in forbidden_chars:
            sanitized = sanitized.replace(char, '')

        sanitized = ''.join(
            char for char in sanitized
            if (ord(char) > 31 and ord(char) < 127) or ord(char) > 159
        )

        while '  ' in sanitized:
            sanitized = sanitized.replace('  ', ' ')
        sanitized = sanitized.strip()

        sanitized = sanitized.replace('/', '\\')
        while '\\\\' in sanitized:
            sanitized = sanitized.replace('\\\\', '\\')

        path_parts = sanitized.split('\\')
        cleaned_parts = []
        for part in path_parts:
            cleaned_part = part.rstrip('. ')
            if cleaned_part:
                cleaned_parts.append(cleaned_part)

        sanitized = '\\'.join(cleaned_parts)
        final_path = drive_prefix + sanitized

        if not final_path.strip():
            return ""
        return final_path

    def get_image_files(self, folder_path, sort_method):
        """List and sort image files in a folder.

        Returns a list of filenames (not full paths) matching IMAGE_EXTENSIONS.
        """
        try:
            entries = os.listdir(folder_path)
        except OSError as e:
            print(f"[MasterBatcher] Error listing folder '{folder_path}': {e}")
            return []

        image_files = []
        for entry in entries:
            ext = os.path.splitext(entry)[1].lower()
            if ext in IMAGE_EXTENSIONS:
                full_path = os.path.join(folder_path, entry)
                if os.path.isfile(full_path):
                    image_files.append(entry)

        if sort_method == "alphabetical":
            image_files.sort(key=lambda f: f.lower())
        elif sort_method == "alphabetical_reverse":
            image_files.sort(key=lambda f: f.lower(), reverse=True)
        elif sort_method == "modified_newest":
            image_files.sort(
                key=lambda f: os.path.getmtime(os.path.join(folder_path, f)),
                reverse=True,
            )
        elif sort_method == "modified_oldest":
            image_files.sort(
                key=lambda f: os.path.getmtime(os.path.join(folder_path, f)),
            )
        elif sort_method == "created_newest":
            image_files.sort(
                key=lambda f: os.path.getctime(os.path.join(folder_path, f)),
                reverse=True,
            )
        elif sort_method == "created_oldest":
            image_files.sort(
                key=lambda f: os.path.getctime(os.path.join(folder_path, f)),
            )
        elif sort_method == "random":
            random.shuffle(image_files)

        return image_files

    def build_batch_map(self, folder_paths_raw, batch_size, sort_method):
        """Parse folder paths and build a list of batch descriptors.

        Each entry maps a batch_index to its folder and the filenames to load.
        Returns list of dicts: [{"folder_path": str, "files": [str, ...]}, ...]
        """
        batch_map = []
        lines = folder_paths_raw.strip().split('\n')

        for line in lines:
            folder_path = self.sanitize_path(line)
            if not folder_path:
                continue
            if not os.path.isdir(folder_path):
                print(f"[MasterBatcher] Warning: '{folder_path}' is not a valid directory, skipping")
                continue

            image_files = self.get_image_files(folder_path, sort_method)
            if not image_files:
                print(f"[MasterBatcher] Warning: No image files found in '{folder_path}', skipping")
                continue

            num_batches = math.ceil(len(image_files) / batch_size)
            for i in range(num_batches):
                start = i * batch_size
                end = min(start + batch_size, len(image_files))
                batch_map.append({
                    "folder_path": folder_path,
                    "files": image_files[start:end],
                })

        return batch_map

    def load_batch(self, folder_paths, batch_size, batch_index, reset_batch_to,
                   sort_method, load_always):
        """Main execution: load a batch of images from the mapped folders.

        Returns IMAGE tensor (N,H,W,3), MASK tensor (N,H,W), batch_count,
        folder_path string, and total_batches count.
        """
        batch_map = self.build_batch_map(folder_paths, batch_size, sort_method)
        total_batches = len(batch_map)

        # Handle exhausted or empty case
        if batch_index >= total_batches or total_batches == 0:
            empty_image = torch.zeros(1, 1, 1, 3, dtype=torch.float32)
            empty_mask = torch.zeros(1, 1, 1, dtype=torch.float32)
            status = "DONE" if total_batches > 0 else "EMPTY"
            return {
                "ui": {
                    "batch_info": [{
                        "batch_count": 0,
                        "folder_path": status,
                        "total_batches": total_batches,
                        "batch_index": batch_index,
                    }]
                },
                "result": (empty_image, empty_mask, 0, "", total_batches),
            }

        descriptor = batch_map[batch_index]
        current_folder = descriptor["folder_path"]
        filenames = descriptor["files"]

        images = []
        masks = []
        first_size = None

        for filename in filenames:
            filepath = os.path.join(current_folder, filename)
            try:
                img = Image.open(filepath)
                img = ImageOps.exif_transpose(img)

                # Extract alpha channel before converting to RGB
                has_alpha = 'A' in img.getbands()
                if has_alpha:
                    alpha = np.array(img.getchannel('A')).astype(np.float32) / 255.0

                img_rgb = img.convert("RGB")

                # Resize to match first image dimensions
                if first_size is None:
                    first_size = img_rgb.size  # (width, height)
                elif img_rgb.size != first_size:
                    img_rgb = img_rgb.resize(first_size, Image.LANCZOS)
                    if has_alpha:
                        alpha_img = Image.fromarray((alpha * 255).astype(np.uint8))
                        alpha_img = alpha_img.resize(first_size, Image.LANCZOS)
                        alpha = np.array(alpha_img).astype(np.float32) / 255.0

                # Convert to numpy float32
                img_np = np.array(img_rgb).astype(np.float32) / 255.0
                images.append(img_np)

                # Build mask (ComfyUI convention: transparent=1, opaque=0)
                if has_alpha:
                    mask = 1.0 - alpha
                else:
                    h, w = img_np.shape[:2]
                    mask = np.zeros((h, w), dtype=np.float32)
                masks.append(mask)

            except Exception as e:
                print(f"[MasterBatcher] Warning: Failed to load '{filepath}': {e}")
                continue

        # If all files in the batch failed to load
        if not images:
            empty_image = torch.zeros(1, 1, 1, 3, dtype=torch.float32)
            empty_mask = torch.zeros(1, 1, 1, dtype=torch.float32)
            return {
                "ui": {
                    "batch_info": [{
                        "batch_count": 0,
                        "folder_path": current_folder,
                        "total_batches": total_batches,
                        "batch_index": batch_index,
                    }]
                },
                "result": (empty_image, empty_mask, 0, current_folder, total_batches),
            }

        # Stack into batch tensors
        image_batch = torch.from_numpy(np.stack(images))  # (N, H, W, 3)
        mask_batch = torch.from_numpy(np.stack(masks))    # (N, H, W)
        batch_count = len(images)

        return {
            "ui": {
                "batch_info": [{
                    "batch_count": batch_count,
                    "folder_path": current_folder,
                    "total_batches": total_batches,
                    "batch_index": batch_index,
                }]
            },
            "result": (image_batch, mask_batch, batch_count, current_folder, total_batches),
        }


# --- API Endpoint ---

@server.PromptServer.instance.routes.post("/allergic/master_batcher/calculate")
async def calculate_batches(request):
    """Calculate total batches across all folders without loading images.

    Powers the "Calculate Batches" button in the frontend.
    """
    try:
        data = await request.json()
        folder_paths_raw = data.get("folder_paths", "")
        batch_size = max(1, int(data.get("batch_size", 1)))
        sort_method = data.get("sort_method", "alphabetical")

        node = MasterBatcher()
        batch_map = node.build_batch_map(folder_paths_raw, batch_size, sort_method)

        # Build per-folder summary
        folder_batches = {}
        for descriptor in batch_map:
            fp = descriptor["folder_path"]
            if fp not in folder_batches:
                folder_batches[fp] = {
                    "folder_path": fp,
                    "file_count": 0,
                    "batch_count": 0,
                }
            folder_batches[fp]["batch_count"] += 1
            folder_batches[fp]["file_count"] += len(descriptor["files"])

        folders = list(folder_batches.values())

        return server.web.json_response({
            "success": True,
            "total_batches": len(batch_map),
            "folders": folders,
        })
    except Exception as e:
        print(f"[MasterBatcher] API error: {e}")
        return server.web.json_response({
            "success": False,
            "error": str(e),
        }, status=500)


NODE_CLASS_MAPPINGS = {
    "MasterBatcher_Allergic": MasterBatcher,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "MasterBatcher_Allergic": "Master Batcher (Allergic)",
}
