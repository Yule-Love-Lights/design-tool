import Konva from "konva";
import type { Yardstick } from "../api";

export function renderYardstick(ys: Yardstick, indexLabel: string, isSelected: boolean): Konva.Group {
  const group = new Konva.Group({
    x: ys.x,
    y: ys.y,
    draggable: true,
    id: ys.id,
    name: "yardstick",
  });

  const rect = new Konva.Rect({
    width: ys.width,
    height: ys.height,
    stroke: isSelected ? "#ffd11a" : "#e6b800",
    strokeWidth: 2,
    strokeScaleEnabled: false,
    dash: [8, 6],
    fill: isSelected ? "rgba(255,200,0,0.24)" : "rgba(255,200,0,0.12)",
    name: "yardstick-rect",
  });

  const label = new Konva.Label({
    x: ys.width / 2,
    y: -44,
    offsetX: 50,
    listening: false,
  });
  label.add(
    new Konva.Tag({
      fill: isSelected ? "#ffd11a" : "#e6b800",
      cornerRadius: 4,
    }),
  );
  label.add(
    new Konva.Text({
      text: `${indexLabel} · ${ys.realFeet} ft`,
      fontSize: 13,
      fontStyle: "bold",
      fill: "#0f1115",
      padding: 6,
      width: 100,
      align: "center",
    }),
  );

  group.add(rect);
  group.add(label);
  return group;
}

export function pxPerFoot(ys: Yardstick | null): number {
  if (!ys || ys.realFeet === 0) return 50; // fallback
  return ys.width / ys.realFeet;
}

export function yardstickLabel(index: number): string {
  return `Yardstick ${index + 1}`;
}
