import torch
import math
from typing import Tuple, Dict, List, Any

class WanVideoVACEContextManager:
    """
    Combined VACE encoding and context window management for video interpolation.
    Ensures keyframes are positioned at context window boundaries for consistent interpolation.
    """
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "vae": ("WANVIDEOVAE",),
                "keyframes": ("IMAGE",),
                "interpolation_multiplier": ("INT", {
                    "default": 8, 
                    "min": 6, 
                    "max": 16, 
                    "step": 2,
                    "tooltip": "Number of frames between keyframes (including keyframe)"
                }),
                "context_window_size": ("INT", {
                    "default": 32, 
                    "min": 16, 
                    "max": 128, 
                    "step": 8,
                    "tooltip": "Size of each processing chunk"
                }),
                "vace_strength": ("FLOAT", {
                    "default": 1.0, 
                    "min": 0.1, 
                    "max": 2.0, 
                    "step": 0.1
                }),
            },
            "optional": {
                "overlap_frames": ("INT", {
                    "default": 2, 
                    "min": 1, 
                    "max": 8,
                    "tooltip": "Frames to overlap between context windows"
                }),
                "force_alignment": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "Force context windows to align with keyframe boundaries"
                })
            }
        }
    
    RETURN_TYPES = ("WANVIDIMAGE_EMBEDS", "CONTEXTOPTIONS", "SCHEDULE")
    RETURN_NAMES = ("vace_embeds", "context_options", "generation_schedule")
    FUNCTION = "process"
    CATEGORY = "WanVideo/Advanced"
    
    def __init__(self):
        # Import the existing VACE encode functionality
        from .nodes import WanVideoVACEEncode, WanVideoContextOptions
        self.vace_encoder = WanVideoVACEEncode()
        self.context_creator = WanVideoContextOptions()
    
    def calculate_optimal_alignment(
        self, 
        num_keyframes: int, 
        interpolation_multiplier: int, 
        context_window_size: int,
        overlap_frames: int,
        force_alignment: bool
    ) -> Dict[str, Any]:
        """
        Calculate optimal context window alignment for keyframe-based interpolation.
        
        Args:
            num_keyframes: Number of keyframes provided
            interpolation_multiplier: Frames between keyframes (6x = 5 interpolated + 1 keyframe)
            context_window_size: Desired context window size
            overlap_frames: Overlap between windows
            force_alignment: Whether to force alignment with keyframes
        
        Returns:
            Dictionary with alignment parameters
        """
        
        # Calculate total sequence length
        # For 6x interpolation: keyframe + 5 interpolated frames = 6 frames per segment
        total_frames = (num_keyframes - 1) * interpolation_multiplier + 1
        
        # Keyframe positions in the sequence
        keyframe_positions = [i * interpolation_multiplier for i in range(num_keyframes)]
        
        if force_alignment:
            # Find optimal window size that aligns with keyframe spacing
            # Want windows to start and end on keyframes when possible
            spacing = interpolation_multiplier
            
            # Find the closest multiple of spacing that's near our desired window size
            optimal_window_size = self._find_optimal_window_size(
                context_window_size, spacing, total_frames
            )
        else:
            optimal_window_size = context_window_size
        
        # Calculate window boundaries
        windows = self._calculate_window_boundaries(
            total_frames, optimal_window_size, overlap_frames, keyframe_positions
        )
        
        return {
            "total_frames": total_frames,
            "keyframe_positions": keyframe_positions,
            "interpolation_multiplier": interpolation_multiplier,
            "optimal_window_size": optimal_window_size,
            "windows": windows,
            "alignment_quality": self._assess_alignment_quality(windows, keyframe_positions)
        }
    
    def _find_optimal_window_size(self, desired_size: int, spacing: int, total_frames: int) -> int:
        """Find window size that best aligns with keyframe spacing."""
        
        # Try multiples of spacing near the desired size
        candidates = []
        for multiplier in range(1, 10):
            candidate = spacing * multiplier
            if candidate >= 16:  # Minimum reasonable window size
                score = abs(candidate - desired_size)
                candidates.append((candidate, score))
        
        # Also try the desired size itself
        candidates.append((desired_size, 0))
        
        # Choose the candidate with the best score that doesn't exceed total frames
        valid_candidates = [(size, score) for size, score in candidates if size <= total_frames]
        
        if valid_candidates:
            return min(valid_candidates, key=lambda x: x[1])[0]
        else:
            return min(desired_size, total_frames)
    
    def _calculate_window_boundaries(
        self, 
        total_frames: int, 
        window_size: int, 
        overlap: int,
        keyframe_positions: List[int]
    ) -> List[Tuple[int, int]]:
        """Calculate start and end positions for each context window."""
        
        windows = []
        start = 0
        
        while start < total_frames:
            end = min(start + window_size, total_frames)
            windows.append((start, end))
            
            if end >= total_frames:
                break
                
            # Move start position, accounting for overlap
            start = end - overlap
        
        return windows
    
    def _assess_alignment_quality(self, windows: List[Tuple[int, int]], keyframe_positions: List[int]) -> float:
        """Assess how well windows align with keyframes (0=poor, 1=perfect)."""
        
        if not windows or not keyframe_positions:
            return 0.0
        
        alignment_score = 0.0
        total_boundaries = len(windows) * 2  # start and end of each window
        
        for start, end in windows:
            # Check if window boundaries align with keyframes
            if start in keyframe_positions:
                alignment_score += 1.0
            if end in keyframe_positions:
                alignment_score += 1.0
        
        return alignment_score / total_boundaries
    
    def create_interpolation_masks(self, schedule: Dict[str, Any]) -> torch.Tensor:
        """
        Create black/white masks for keyframe/interpolation pattern.
        Black (0.0) = keyframe, White (1.0) = interpolate
        """
        
        total_frames = schedule["total_frames"]
        keyframe_positions = schedule["keyframe_positions"]
        
        # Create mask tensor: 1 for interpolation, 0 for keyframes
        masks = torch.ones(total_frames, dtype=torch.float32)
        
        # Set keyframe positions to 0 (black)
        for pos in keyframe_positions:
            if pos < total_frames:
                masks[pos] = 0.0
        
        return masks
    
    def process(
        self, 
        vae, 
        keyframes, 
        interpolation_multiplier,
        context_window_size,
        vace_strength,
        overlap_frames=2,
        force_alignment=True
    ):
        """
        Main processing function that combines VACE encoding with context management.
        """
        
        # Validate inputs
        if keyframes.shape[0] < 2:
            raise ValueError("Need at least 2 keyframes for interpolation")
        
        if interpolation_multiplier < 6:
            raise ValueError("Minimum interpolation multiplier is 6x")
        
        # Calculate optimal alignment
        schedule = self.calculate_optimal_alignment(
            num_keyframes=keyframes.shape[0],
            interpolation_multiplier=interpolation_multiplier,
            context_window_size=context_window_size,
            overlap_frames=overlap_frames,
            force_alignment=force_alignment
        )
        
        print(f"VACE Context Manager:")
        print(f"  Total frames: {schedule['total_frames']}")
        print(f"  Keyframes at: {schedule['keyframe_positions']}")
        print(f"  Optimal window size: {schedule['optimal_window_size']}")
        print(f"  Number of windows: {len(schedule['windows'])}")
        print(f"  Alignment quality: {schedule['alignment_quality']:.2f}")
        
        # Create interpolation masks
        masks = self.create_interpolation_masks(schedule)
        
        # Use existing VACE encoder to process keyframes
        # We'll encode each keyframe and create the embedding structure
        vace_embeds = self.vace_encoder.encode(
            vae=vae,
            images=keyframes,
            strength=vace_strength
        )[0]  # Get the first return value (the embeddings)
        
        # Create context options optimized for our interpolation pattern
        context_options = {
            "context_schedule": schedule["windows"],
            "window_size": schedule["optimal_window_size"],
            "overlap_frames": overlap_frames,
            "processing_mode": "keyframe_aligned",
            "total_frames": schedule["total_frames"],
            "keyframe_positions": schedule["keyframe_positions"],
            "interpolation_multiplier": interpolation_multiplier,
            "alignment_quality": schedule["alignment_quality"],
            "masks": masks  # Include our interpolation masks
        }
        
        # Add alignment warnings
        if schedule["alignment_quality"] < 0.5:
            print(f"WARNING: Poor keyframe alignment (quality: {schedule['alignment_quality']:.2f})")
            print("Consider adjusting context_window_size or interpolation_multiplier")
        
        return (vace_embeds, context_options, schedule)


# Register the node
NODE_CLASS_MAPPINGS = {
    "WanVideoVACEContextManager": WanVideoVACEContextManager
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "WanVideoVACEContextManager": "WanVideo VACE Context Manager"
}