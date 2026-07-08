# Clock Drawing Validation Set

These PNGs were rendered by the FastAPI backend from stroke payloads submitted through the React Native / Expo app drawing screen. They are for model/demo validation only, not clinical testing.

- image_01: good clock, followed prompt
- image_02: good clock, followed prompt
- image_03: good clock, followed prompt
- image_04: good clock, followed prompt
- image_05: good clock, followed prompt
- image_06: good clock, followed prompt, compact/uneven numerals
- image_07: slightly messy number placement
- image_08: slightly messy number placement
- image_09: slightly messy number placement, crowded/uneven numerals
- image_10: slightly messy number placement with larger numerals
- image_11: wrong hand placement
- image_12: missing minute hand / wrong hand configuration
- image_13: extra hand / wrong time
- image_14: wrong hand placement / wrong time
- image_15: missing several numbers
- image_16: missing/repeated numbers
- image_17: only partial/quadrant-style number coverage
- image_18: incomplete tiny drawing
- image_19: incomplete tiny off-centre drawing

Local scoring note: the backend returned the safe `uncertain` fallback during this run because the local Python environment has a SciPy/skimage DLL import failure. The debug renderer still saved the app-submitted stroke images successfully.
