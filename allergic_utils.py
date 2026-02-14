"""Shared utilities for the Allergic Pack node collection."""

import re


def sanitize_path(path_str):
    """Clean filesystem-unfriendly characters from a path string.

    Handles Windows drive letters, forbidden filename characters,
    control characters, redundant slashes, and trailing dots/spaces.

    Returns an empty string if the result is blank after sanitization.
    """
    if not isinstance(path_str, str):
        return str(path_str) if path_str is not None else ""

    path_str = path_str.strip()
    if (path_str.startswith('"') and path_str.endswith('"')) or \
       (path_str.startswith("'") and path_str.endswith("'")):
        path_str = path_str[1:-1]

    # Preserve Windows drive letter (e.g. "D:\")
    drive_pattern = r'^([A-Za-z]):\\?'
    drive_match = re.match(drive_pattern, path_str)
    drive_prefix = ""
    remaining_path = path_str

    if drive_match:
        drive_prefix = drive_match.group(1) + ":\\"
        remaining_path = path_str[len(drive_match.group(0)):]

    # Remove characters actually forbidden in Windows filenames
    # Only: < > " | ? * (colon handled via drive prefix, slashes are separators)
    forbidden_chars = '<>"|?*'
    sanitized = remaining_path
    for char in forbidden_chars:
        sanitized = sanitized.replace(char, '')

    # Remove control characters (0-31 and 127-159)
    sanitized = ''.join(
        char for char in sanitized
        if (ord(char) > 31 and ord(char) < 127) or ord(char) > 159
    )

    # Collapse multiple spaces
    while '  ' in sanitized:
        sanitized = sanitized.replace('  ', ' ')
    sanitized = sanitized.strip()

    # Normalize to backslashes and collapse duplicates
    sanitized = sanitized.replace('/', '\\')
    while '\\\\' in sanitized:
        sanitized = sanitized.replace('\\\\', '\\')

    # Remove trailing dots and spaces from each path component
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
