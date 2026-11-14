import type { MemoryInput, PhotoLocation } from "@akai/shared";
export type User = {
  id: string;
  name: string;
  username: string;
  avatar: string | null;
};
export type Photo = {
  id: string;
  position: number;
  isCover: boolean;
} & PhotoLocation;
export type Memory = MemoryInput & {
  id: string;
  authorId: string;
  author: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  photos: Photo[];
};
export type MemoryCardData = Pick<
  Memory,
  | "id"
  | "title"
  | "eventDate"
  | "description"
  | "category"
  | "author"
  | "version"
  | "deletedAt"
> & { coverId: string | null; photoCount: number; commentCount: number };
export type MemoryList = {
  items: MemoryCardData[];
  total: number;
  page: number;
  years: string[];
};
export type Settings = {
  uploadLimits: { maxFiles: number; maxImageMB: number };
  settings: {
    coupleNames: string;
    startDate: string | null;
    cover: string | null;
  };
  users: Pick<User, "id" | "name" | "avatar">[];
};
export type Comment = {
  id: string;
  body: string;
  authorId: string;
  author: string;
  avatar: string | null;
  createdAt: string;
  updatedAt: string;
};
export type Album = { category: string; count: number; coverId: string | null };
export type AlbumPhoto = {
  id: string;
  memoryId: string;
  title: string;
  eventDate: string;
};
export type Collection = {
  id: string;
  name: string;
  category: string;
  description: string;
  version: number;
  memoryCount: number;
  photoCount: number;
  coverId: string | null;
  firstDate: string | null;
  lastDate: string | null;
};
