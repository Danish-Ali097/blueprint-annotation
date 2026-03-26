"use client";

import { memo } from "react";
import { Circle, Group, Line, Text } from "react-konva";

import { useCanvasStore } from "@/stores/canvas-store";

type AnnotationShapeProps = {
  annotationId: string;
};

function formatMeasurement(value: number, unit: string) {
  return `${value.toFixed(2)} ${unit}`;
}

function AnnotationShapeBase({ annotationId }: AnnotationShapeProps) {
  const annotation = useCanvasStore((state) => state.annotationsById[annotationId]);
  const isSelected = useCanvasStore((state) => state.selectedAnnotationId === annotationId);
  const setSelectedAnnotationId = useCanvasStore((state) => state.setSelectedAnnotationId);

  if (!annotation || annotation.points.length === 0) {
    return null;
  }

  const flatPoints = annotation.points.flatMap((point) => [point.x, point.y]);
  const firstPoint = annotation.points[0];
  const lastPoint = annotation.points[annotation.points.length - 1];
  const labelX = (firstPoint.x + lastPoint.x) / 2;
  const labelY = (firstPoint.y + lastPoint.y) / 2 - 18;
  const isClosedShape =
    annotation.toolType === "area" || annotation.toolType === "polygon" || annotation.points.length >= 3;

  return (
    <Group
      onClick={() => setSelectedAnnotationId(annotationId)}
      onTap={() => setSelectedAnnotationId(annotationId)}
    >
      <Line
        points={flatPoints}
        stroke={isSelected ? "#2563eb" : "#dc2626"}
        strokeWidth={isSelected ? 3 : 2}
        lineCap="round"
        lineJoin="round"
        closed={isClosedShape}
        fill={isSelected ? "rgba(37, 99, 235, 0.18)" : "rgba(220, 38, 38, 0.12)"}
      />
      {annotation.points.map((point, index) => (
        <Circle
          key={`${annotationId}-${index}-${point.x}-${point.y}`}
          x={point.x}
          y={point.y}
          radius={3}
          fill={isSelected ? "#2563eb" : "#dc2626"}
        />
      ))}
      <Text
        x={labelX}
        y={labelY}
        text={`${annotation.name}: ${formatMeasurement(annotation.measurement, annotation.unit)}`}
        fontSize={12}
        fill="#0f172a"
        offsetX={0}
      />
    </Group>
  );
}

export const AnnotationShape = memo(AnnotationShapeBase);
