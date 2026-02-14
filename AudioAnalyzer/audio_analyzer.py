"""
AudioAnalyzer Node for ComfyUI
Loads audio from a file path, detects BPM and musical key,
and outputs both analysis results and the AUDIO data for downstream nodes.
"""

import os
import numpy as np
import torch
import server

from allergic_utils import sanitize_path

# Krumhansl-Schmuckler key profiles
# Major and minor profiles for correlating against chroma distributions
MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09,
                           2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53,
                           2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F",
                 "F#", "G", "G#", "A", "A#", "B"]


def detect_key(chroma):
    """
    Detect musical key using the Krumhansl-Schmuckler algorithm.

    Args:
        chroma: 12-element array of average chroma energy per pitch class.

    Returns:
        Tuple of (key_name, scale) e.g. ("G", "minor").
    """
    best_corr = -np.inf
    best_key = "C"
    best_scale = "major"

    for shift in range(12):
        rotated = np.roll(chroma, -shift)

        corr_major = np.corrcoef(rotated, MAJOR_PROFILE)[0, 1]
        if corr_major > best_corr:
            best_corr = corr_major
            best_key = PITCH_CLASSES[shift]
            best_scale = "major"

        corr_minor = np.corrcoef(rotated, MINOR_PROFILE)[0, 1]
        if corr_minor > best_corr:
            best_corr = corr_minor
            best_key = PITCH_CLASSES[shift]
            best_scale = "minor"

    return best_key, best_scale


def analyze_audio(audio_data, sample_rate):
    """
    Run BPM and key detection on audio data.

    Args:
        audio_data: 1D numpy array of audio samples.
        sample_rate: Sample rate in Hz.

    Returns:
        Dict with bpm, key, scale, keyscale.
    """
    import librosa

    # BPM detection
    tempo, _ = librosa.beat.beat_track(y=audio_data, sr=sample_rate)
    # tempo may be an array in some librosa versions
    if hasattr(tempo, '__len__'):
        tempo = float(tempo[0]) if len(tempo) > 0 else 120.0
    bpm = int(round(float(tempo)))

    # Key detection via chroma features
    chroma = librosa.feature.chroma_cqt(y=audio_data, sr=sample_rate)
    chroma_avg = np.mean(chroma, axis=1)  # 12-element pitch class distribution

    key, scale = detect_key(chroma_avg)

    keyscale = f"{key} {scale}"

    return {
        "bpm": bpm,
        "key": key,
        "scale": scale,
        "keyscale": keyscale,
    }


def load_audio_as_tensor(file_path):
    """
    Load an audio file using PyAV and return a ComfyUI-compatible AUDIO dict.

    Matches ComfyUI's native LoadAudio format:
    {"waveform": Tensor(batch, channels, samples), "sample_rate": int}

    Args:
        file_path: Path to the audio file.

    Returns:
        Dict with "waveform" (torch.Tensor) and "sample_rate" (int).
    """
    import av

    container = av.open(file_path)
    audio_stream = next(s for s in container.streams if s.type == "audio")

    frames = []
    for frame in container.decode(audio_stream):
        frames.append(frame.to_ndarray())

    container.close()

    # to_ndarray() returns shape (channels, samples) per frame in planar format
    audio_np = np.concatenate(frames, axis=-1)  # (channels, total_samples)

    # Convert to float32 in [-1, 1] range if integer format
    if audio_np.dtype in (np.int16, np.int32):
        max_val = np.iinfo(audio_np.dtype).max
        audio_np = audio_np.astype(np.float32) / max_val
    else:
        audio_np = audio_np.astype(np.float32)

    # Shape: (batch=1, channels, samples)
    waveform = torch.from_numpy(audio_np).unsqueeze(0)
    sample_rate = audio_stream.rate

    return {"waveform": waveform, "sample_rate": sample_rate}


class AudioAnalyzerNode:
    """Loads audio from a file, detects BPM and musical key, and outputs both
    analysis results and the AUDIO data for downstream nodes."""

    NODE_NAME = "AudioAnalyzerNode"
    DISPLAY_NAME = "Audio Analyzer (Allergic)"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "file_path": ("STRING", {"default": "", "multiline": False}),
            },
        }

    # keyscale is COMBO so it can connect to combo/dropdown inputs on other nodes
    RETURN_TYPES = ("AUDIO", "INT", "STRING", "STRING", "COMBO")
    RETURN_NAMES = ("AUDIO", "bpm", "key", "scale", "keyscale")
    FUNCTION = "analyze"
    CATEGORY = "Allergic Pack"
    OUTPUT_NODE = True

    def analyze(self, file_path):
        """
        Load audio from file_path, analyze for BPM and key, and return
        both analysis results and a ComfyUI AUDIO output.
        """
        import librosa

        cleaned_path = sanitize_path(file_path)
        if not cleaned_path or not cleaned_path.strip():
            raise ValueError("AudioAnalyzer requires a file_path.")
        if not os.path.isfile(cleaned_path):
            raise FileNotFoundError(f"Audio file not found: {cleaned_path}")

        # Analysis via librosa (needs mono numpy array)
        audio_data, sample_rate = librosa.load(cleaned_path, sr=None)
        result = analyze_audio(audio_data, sample_rate)

        # Build AUDIO output via PyAV (matches ComfyUI native format)
        audio_output = load_audio_as_tensor(cleaned_path)

        return {
            "ui": {
                "analysis_result": [result]
            },
            "result": (
                audio_output,
                result["bpm"],
                result["key"],
                result["scale"],
                result["keyscale"],
            ),
        }


# Custom API endpoint for on-demand analysis without queue execution
@server.PromptServer.instance.routes.post("/allergic/audio_analyzer/analyze")
async def analyze_audio_endpoint(request):
    """
    Direct API endpoint to analyze audio from a file path without executing a workflow.
    Called by the "Analyze" button in the JavaScript frontend.
    """
    try:
        import librosa

        data = await request.json()
        file_path = data.get("file_path", "")

        if not file_path or not file_path.strip():
            return server.web.json_response({
                "success": False,
                "error": "No file path provided.",
            }, status=400)

        cleaned_path = sanitize_path(file_path)
        if not os.path.isfile(cleaned_path):
            return server.web.json_response({
                "success": False,
                "error": f"File not found: {cleaned_path}",
            }, status=404)

        audio_data, sr = librosa.load(cleaned_path, sr=None)
        result = analyze_audio(audio_data, sr)

        return server.web.json_response({
            "success": True,
            "result": result,
        })

    except Exception as e:
        print(f"[AudioAnalyzer] API endpoint error: {e}")
        return server.web.json_response({
            "success": False,
            "error": str(e),
        }, status=500)


NODE_CLASS_MAPPINGS = {AudioAnalyzerNode.NODE_NAME: AudioAnalyzerNode}
NODE_DISPLAY_NAME_MAPPINGS = {AudioAnalyzerNode.NODE_NAME: AudioAnalyzerNode.DISPLAY_NAME}
