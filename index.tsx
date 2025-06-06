import React, { useEffect, useState } from 'react';
import { TrackSummary, UserSummary, PublicAPIResponse, isPopulatedUser } from './types';

const App: React.FC = () => {
  const [tracks, setTracks] = useState<TrackSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  useEffect(() => {
    // Fetch featured tracks from your API
    fetch('/public/tracks/featured')
      .then(response => response.json())
      .then((data: TrackSummary[]) => {
        setTracks(data);
        setLoading(false);
      })
      .catch(error => {
        console.error('Error fetching tracks:', error);
        setLoading(false);
      });
  }, []);

  const renderTrackUser = (user: UserSummary | string) => {
    if (isPopulatedUser(user)) {
      // User is populated - we have full user object
      return (
        <div className="track-user">
          {user.avatar && <img src={user.avatar} alt={user.username} />}
          <span>{user.username}</span>
        </div>
      );
    } else {
      // User is not populated - we only have ObjectId string
      return <span>User ID: {user}</span>;
    }
  };

  if (loading) {
    return <div>Loading tracks...</div>;
  }

  return (
    <div className="app">
      <h1>Featured Tracks</h1>
      <div className="tracks-grid">
        {tracks.map((track) => (          <div key={track.id} className="track-card">
            <h3>{track.title}</h3>
            <p>Original Artist: {track.originalArtist}</p>
            <p>Price: ${track.customerPrice}</p>
            {renderTrackUser(track.user)}
          </div>
        ))}
      </div>
    </div>
  );
};

export default App;
