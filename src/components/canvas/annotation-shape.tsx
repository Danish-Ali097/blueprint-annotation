"use client";

import { memo } from "react";
import { Circle, Group, Line, Text } from "react-konva";

import { useCanvasStore } from "@/stores/canvas-store";

type AnnotationShapeProps = {
  annotationId: string;
  isSelected: boolean;
  onSelect: (annotationId: string) => void;
};

function formatMeasurement(value: number, unit: string) {
  return `${value.toFixed(2)} ${unit}`;
}

function AnnotationShapeBase({ annotationId, isSelected, onSelect }: AnnotationShapeProps) {
  const annotation = useCanvasStore((state) => state.annotationsById[annotationId]);

  if (!annotation || annotation.points.length === 0) {
    return null;
  }

  const flatPoints = annotation.points.flatMap((point) => [point.x, point.y]);
  const firstPoint = annotation.points[0];
  const lastPoint = annotation.points[annotation.points.length - 1];
  const labelX = (firstPoint.x + lastPoint.x) / 2;
  const labelY = (firstPoint.y + lastPoint.y) / 2 - 18;

  return (
    <Group onClick={() => onSelect(annotationId)} onTap={() => onSelect(annotationId)}>
      <Line
        points={flatPoints}
        stroke={isSelected ? "#2563eb" : "#dc2626"}
        strokeWidth={isSelected ? 3 : 2}
        lineCap="round"
        lineJoin="round"
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
