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
  trackPrice: number;
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
