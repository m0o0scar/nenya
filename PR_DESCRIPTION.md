I have improved the image preview quality in the screenshot editor.

**Changes:**
1.  **Removed global `image-rendering: pixelated`**: This was causing screenshots to look jagged/aliased when zoomed out or fitted to the screen (which is the default view).
    -   Modified `src/editor/editor.html`
    -   Modified `src/editor/editor.css`
2.  **Implemented Dynamic Rendering Quality**:
    -   Modified `src/editor/editor.js` to automatically switch rendering modes based on zoom level.
    -   **Zoom <= 100%**: Uses `image-rendering: auto` for smooth, high-quality interpolation (fixing the reported issue).
    -   **Zoom > 100%**: Uses `image-rendering: pixelated` to allow precise pixel-level editing when zoomed in.

This ensures that screenshots look great when you are viewing them normally, but you can still see individual pixels if you need to do detailed work.