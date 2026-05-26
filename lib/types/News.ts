export type News = {
  id: string;
  title: string;
  summary: string;
  content: string;
  banner?: string;
  gameIds: string[];
  games?: Array<{ id: string; name: string; icon?: string; slug?: string }>;
  tags: string[];
  authorId: string;
  author?: { id: string; displayName?: string; discriminator?: string };
  likedBy: string[];
  likesCount: number;
  userHasLiked?: boolean;
  createdAt: Date;
  updatedAt: Date;
};
