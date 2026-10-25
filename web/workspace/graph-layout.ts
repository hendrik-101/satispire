interface GraphEdge {
  from: string;
  to: string;
}

/** Bounded layer ordering; retain the original order on ties or regressions. */
export function graphLayout(ids: string[], edges: GraphEdge[]) {
  const depths = new Map<string, number>();
  function depth(id: string): number {
    const cached = depths.get(id);
    if (cached !== undefined) return cached;
    const incoming = edges.filter((edge) => edge.to === id);
    const result = incoming.length
      ? 1 + Math.max(...incoming.map((edge) => depth(edge.from)))
      : 0;
    depths.set(id, result);
    return result;
  }
  let rows = new Map<number, string[]>();
  for (const id of ids) {
    const level = depth(id);
    rows.set(level, [...(rows.get(level) ?? []), id]);
  }
  const levels = [...rows.keys()].sort((a, b) => a - b);
  const rowCount = Math.max(1, ...[...rows.values()].map((row) => row.length));
  const ordinate = (id: string) => {
    const row = rows.get(depth(id))!;
    return row.indexOf(id) + (rowCount - row.length) / 2;
  };
  // Adjacent edges use monotonic curves: reversing their endpoints makes a crossing.
  const adjacent = edges.filter(
    (edge) => depth(edge.to) === depth(edge.from) + 1,
  );
  function crossings() {
    let count = 0;
    const ordinates = new Map(ids.map((id) => [id, ordinate(id)]));
    for (let i = 0; i < adjacent.length; i++) {
      const a = adjacent[i]!;
      for (let j = i + 1; j < adjacent.length; j++) {
        const b = adjacent[j]!;
        if (
          depth(a.from) === depth(b.from) &&
          (ordinates.get(a.from)! - ordinates.get(b.from)!) *
            (ordinates.get(a.to)! - ordinates.get(b.to)!) <
            0
        )
          count++;
      }
    }
    return count;
  }
  let best = new Map(rows);
  let bestScore = crossings();
  for (let sweep = 0; sweep < 8 && bestScore > 0; sweep++) {
    const forward = sweep % 2 === 0;
    for (const level of forward ? levels : [...levels].reverse()) {
      const row = rows.get(level)!;
      const means = new Map(
        row.map((id) => {
          const neighbors = edges.flatMap((edge) =>
            forward
              ? edge.to === id
                ? [edge.from]
                : []
              : edge.from === id
                ? [edge.to]
                : [],
          );
          return [
            id,
            neighbors.length
              ? neighbors.reduce(
                  (sum, neighbor) => sum + ordinate(neighbor),
                  0,
                ) / neighbors.length
              : ordinate(id),
          ];
        }),
      );
      rows.set(
        level,
        [...row].sort((a, b) => means.get(a)! - means.get(b)!),
      );
    }
    const score = crossings();
    if (score < bestScore) {
      best = new Map(rows);
      bestScore = score;
    }
  }
  rows = best;
  return {
    depths,
    positions: new Map(
      ids.map((id) => [
        id,
        {
          x: depth(id) * 240 + 12,
          y: ordinate(id) * 116 + 12,
        },
      ]),
    ),
    width: (Math.max(0, ...levels) + 1) * 240 - 64 + 24,
    contentHeight: rowCount * 116,
  };
}
