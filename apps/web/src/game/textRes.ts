/** Text texture scale so map labels stay sharp under DPR + camera zoom. */
export function mapTextResolution(dpr: number, userZoom = 2.2): number {
  return Math.min(3, Math.max(1, Math.ceil(dpr * Math.min(userZoom, 2.2))));
}
