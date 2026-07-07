from __future__ import annotations

from collections import deque
from pathlib import Path

try:
    from PIL import Image
except ImportError as exc:  # pragma: no cover - developer setup guidance.
    raise SystemExit("Pillow is required. Install it with: python -m pip install pillow") from exc


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "apps" / "mobile" / "assets" / "hawker"
OUTPUT_SIZE = 512
MARGIN = 28
BLACK_THRESHOLD = 36


def is_black_edge_pixel(pixel: tuple[int, int, int, int]) -> bool:
    red, green, blue, alpha = pixel
    return alpha > 0 and red <= BLACK_THRESHOLD and green <= BLACK_THRESHOLD and blue <= BLACK_THRESHOLD


def remove_connected_black_edges(image: Image.Image) -> tuple[Image.Image, int]:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    pixels = rgba.load()
    queue: deque[tuple[int, int]] = deque()
    visited: set[tuple[int, int]] = set()

    for x in range(width):
        queue.append((x, 0))
        queue.append((x, height - 1))
    for y in range(height):
        queue.append((0, y))
        queue.append((width - 1, y))

    removed = 0
    while queue:
        x, y = queue.popleft()
        if (x, y) in visited or x < 0 or y < 0 or x >= width or y >= height:
            continue
        visited.add((x, y))
        if not is_black_edge_pixel(pixels[x, y]):
            continue

        pixels[x, y] = (0, 0, 0, 0)
        removed += 1
        queue.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    return rgba, removed


def normalize_canvas(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    bbox = rgba.getbbox()
    if bbox is None:
        return Image.new("RGBA", (OUTPUT_SIZE, OUTPUT_SIZE), (0, 0, 0, 0))

    content = rgba.crop(bbox)
    max_content_size = OUTPUT_SIZE - MARGIN * 2
    content.thumbnail((max_content_size, max_content_size), Image.Resampling.LANCZOS)

    output = Image.new("RGBA", (OUTPUT_SIZE, OUTPUT_SIZE), (0, 0, 0, 0))
    left = (OUTPUT_SIZE - content.width) // 2
    top = (OUTPUT_SIZE - content.height) // 2
    output.alpha_composite(content, (left, top))
    return output


def main() -> None:
    if not ASSET_DIR.exists():
        raise SystemExit(f"Asset directory not found: {ASSET_DIR}")

    for path in sorted(ASSET_DIR.glob("*.png")):
        with Image.open(path) as source:
            cleaned, removed = remove_connected_black_edges(source)
            normalized = normalize_canvas(cleaned)
            normalized.save(path)
            print(f"{path.name}: removed_black_edge_pixels={removed}, size={normalized.size}")


if __name__ == "__main__":
    main()
