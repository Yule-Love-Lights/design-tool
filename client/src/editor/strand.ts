import Konva from "konva";
import type { Strand } from "../api";
import { createBulb } from "./bulb";
import { createPermanentLight, PERM_DEFAULTS } from "./permanent";

export function renderStrand(
  strand: Strand,
  pxPerFoot: number,
): Konva.Group {
  const group = new Konva.Group({
    id: strand.id,
    listening: true,
    name: "strand",
  });
  group.setAttr("strandData", strand);

  if (strand.points.length < 2) return group;

  // Invisible thick line to allow selection / hit-testing.
  // Konva does NOT draw transparent strokes to the hit canvas, so we use a faint stroke
  // and rely on hitStrokeWidth to make a generous click target.
  const hit = new Konva.Line({
    points: strand.points,
    stroke: "rgba(0,0,0,0.001)",
    strokeWidth: 1,
    hitStrokeWidth: 28,
    lineCap: "round",
    lineJoin: "round",
    listening: true,
  });
  group.add(hit);

  if (strand.drawingStyle === "single") {
    placeBulb(group, strand, strand.points[0], strand.points[1], pxPerFoot, 0);
    return group;
  }

  // Walk the polyline, dropping bulbs at intervals of `spacingIn`.
  const spacingFt = strand.spacingIn / 12;
  const spacingPx = spacingFt * pxPerFoot;

  let distRemaining = 0;
  let bulbIndex = 0;

  for (let i = 0; i < strand.points.length - 2; i += 2) {
    const x1 = strand.points[i];
    const y1 = strand.points[i + 1];
    const x2 = strand.points[i + 2];
    const y2 = strand.points[i + 3];
    const segLen = Math.hypot(x2 - x1, y2 - y1);
    if (segLen === 0) continue;

    let traveled = -distRemaining;
    while (traveled <= segLen) {
      if (traveled >= 0) {
        const t = traveled / segLen;
        placeBulb(
          group,
          strand,
          x1 + (x2 - x1) * t,
          y1 + (y2 - y1) * t,
          pxPerFoot,
          bulbIndex++,
        );
      }
      traveled += spacingPx;
    }
    distRemaining = traveled - segLen;
  }

  return group;
}

function placeBulb(
  parent: Konva.Group,
  strand: Strand,
  x: number,
  y: number,
  pxPerFoot: number,
  index: number,
) {
  const palette =
    strand.colorPattern.length > 0 ? strand.colorPattern : ["warm-white"];
  const colorId = palette[index % palette.length];
  const node =
    strand.bulbType === "permanent"
      ? createPermanentLight(
          colorId,
          pxPerFoot,
          strand.beamLengthFt ?? PERM_DEFAULTS.beamLengthFt,
          strand.beamWidthFt ?? PERM_DEFAULTS.beamWidthFt,
          strand.distanceToSurfaceFt ?? PERM_DEFAULTS.distanceToSurfaceFt,
          strand.opacity ?? PERM_DEFAULTS.opacity,
          strand.showCoverage ?? PERM_DEFAULTS.showCoverage,
        )
      : createBulb(strand.bulbType, colorId, pxPerFoot);
  node.position({ x, y });
  parent.add(node);
}

export function strandLengthPx(strand: Strand): number {
  let total = 0;
  for (let i = 0; i < strand.points.length - 2; i += 2) {
    total += Math.hypot(
      strand.points[i + 2] - strand.points[i],
      strand.points[i + 3] - strand.points[i + 1],
    );
  }
  return total;
}
