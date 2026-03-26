"use client";

import { create } from "zustand";

import type { Annotation, BlueprintPage, StageTransform } from "@/types/canvas";

type CanvasStoreState = {
  pages: BlueprintPage[];
  activePageId: string | null;
  selectedAnnotationId: string | null;
  annotationIdsByPage: Record<string, string[]>;
  annotationsById: Record<string, Annotation>;
  transform: StageTransform;
  setPages: (pages: BlueprintPage[]) => void;
  setActivePageId: (pageId: string | null) => void;
  setSelectedAnnotationId: (annotationId: string | null) => void;
  setTransform: (transform: StageTransform) => void;
  setAnnotationsForPage: (pageId: string, annotations: Annotation[]) => void;
  upsertAnnotation: (annotation: Annotation) => void;
  removeAnnotation: (annotationId: string, pageId: string) => void;
  renameAnnotation: (annotationId: string, name: string) => void;
};

export const useCanvasStore = create<CanvasStoreState>((set) => ({
  pages: [],
  activePageId: null,
  selectedAnnotationId: null,
  annotationIdsByPage: {},
  annotationsById: {},
  transform: { x: 0, y: 0, scale: 1 },

  setPages: (pages) =>
    set((state) => ({
      pages,
      activePageId: state.activePageId ?? pages[0]?.id ?? null,
    })),

  setActivePageId: (activePageId) => set({ activePageId, selectedAnnotationId: null }),
  setSelectedAnnotationId: (selectedAnnotationId) => set({ selectedAnnotationId }),
  setTransform: (transform) => set({ transform }),

  setAnnotationsForPage: (pageId, annotations) =>
    set((state) => {
      const annotationIds = annotations.map((annotation) => annotation.id);
      const nextAnnotationsById = { ...state.annotationsById };

      for (const annotation of annotations) {
        nextAnnotationsById[annotation.id] = annotation;
      }

      return {
        annotationIdsByPage: {
          ...state.annotationIdsByPage,
          [pageId]: annotationIds,
        },
        annotationsById: nextAnnotationsById,
      };
    }),

  upsertAnnotation: (annotation) =>
    set((state) => {
      const pageIds = state.annotationIdsByPage[annotation.pageId] ?? [];
      const hasAnnotation = pageIds.includes(annotation.id);

      return {
        annotationsById: {
          ...state.annotationsById,
          [annotation.id]: annotation,
        },
        annotationIdsByPage: {
          ...state.annotationIdsByPage,
          [annotation.pageId]: hasAnnotation ? pageIds : [annotation.id, ...pageIds],
        },
      };
    }),

  removeAnnotation: (annotationId, pageId) =>
    set((state) => {
      const existingIds = state.annotationIdsByPage[pageId] ?? [];
      const restAnnotations = { ...state.annotationsById };
      delete restAnnotations[annotationId];

      return {
        annotationsById: restAnnotations,
        annotationIdsByPage: {
          ...state.annotationIdsByPage,
          [pageId]: existingIds.filter((id) => id !== annotationId),
        },
        selectedAnnotationId:
          state.selectedAnnotationId === annotationId ? null : state.selectedAnnotationId,
      };
    }),

  renameAnnotation: (annotationId, name) =>
    set((state) => {
      const existing = state.annotationsById[annotationId];
      if (!existing) {
        return state;
      }

      return {
        annotationsById: {
          ...state.annotationsById,
          [annotationId]: {
            ...existing,
            name,
          },
        },
      };
    }),
}));
