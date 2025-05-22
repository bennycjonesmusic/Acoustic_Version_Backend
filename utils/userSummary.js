// utils/userSummary.js
// Utility to map a list of User documents to summary objects

export function toUserSummary(users) {
  return users.map(user => ({
    id: user._id,
    username: user.username,
    avatar: user.avatar // add more fields if needed
  }));
}
