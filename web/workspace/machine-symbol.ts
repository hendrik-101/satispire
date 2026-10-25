/** Normalized port positions shared by symbols and their connecting routes. */
export function symbolInputFraction(feed: number, count: number) {
  return 0.2 + ((feed + 1) * 0.6) / (count + 1);
}
export const symbolOutputFraction = 0.5;
