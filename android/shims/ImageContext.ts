import { createContext, createElement, useContext, type ReactNode } from 'react';

export type MobileImage = { id: string; name: string; path: string };
export type MobileImageServices = {
  images: MobileImage[];
  scope: string;
  online: boolean;
  load(source: string): Promise<Blob>;
  upload(file: File): Promise<MobileImage>;
  version(source: string): string | undefined;
};

const ImageContext = createContext<MobileImageServices | null>(null);

export function MobileImageProvider({ children, value }: { children: ReactNode; value: MobileImageServices }) {
  return createElement(ImageContext.Provider, { value }, children);
}

export function useImages() { return useContext(ImageContext); }
