/** Maps a point on the page as the viewer shows it to PDF page space (PDF /Rotate is clockwise). */
export function visualToPage(vx, vy, rotation, width, height) {
    switch (rotation) {
        case 90: return [width - vy, vx];
        case 180: return [width - vx, height - vy];
        case 270: return [vy, height - vx];
        default: return [vx, vy];
    }
}
