// TypeScript type definitions that correspond to your backend JSDoc typedefs

export interface UserSummary {
  id: string;
  username: string;
  avatar?: string;
}

export interface TrackSummary {
  id: string;
  title: string;
  user: UserSummary | string; // Can be populated UserSummary object or unpopulated ObjectId string
  originalArtist: string;
  customerPrice: number;
  averageRating?: number; // Optional rating field
  numOfRatings?: number; // Optional rating count field
  guideTrackUrl?: string; // Optional guide track URL
  youtubeGuideUrl?: string; // Optional YouTube guide URL
  backingTrackType?: string; // Type of backing track (e.g., "Acoustic Guitar", "Piano", etc.)
}

export interface PublicAPIResponse {
  message?: string;
  tracks?: TrackSummary[];
  users?: UserSummary[];
  track?: TrackSummary;
  user?: UserSummary;
  error?: string;
}

// Type guard to check if user is populated
export function isPopulatedUser(user: UserSummary | string): user is UserSummary {
  return typeof user === 'object' && user !== null && 'username' in user;
}
