import dotenv from 'dotenv'; 
dotenv.config(); 
import nodemailer from 'nodemailer';


const transporter = nodemailer.createTransport({
  service: 'Gmail', // or use SendGrid, Outlook, etc.
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});


export const sendFollowersNewTrack = async (userEmail, artist, newTrack) => {
  // Direct link to the track detail page
  const trackUrl = `${process.env.FRONTEND_URL}/track/${newTrack._id}`;

  const mailOptions = {
    from: `AcousticVersion <${process.env.EMAIL_USER}>`,
    to: userEmail,
    subject: `New track from ${artist.username}: "${newTrack.title}"`,
    html: `
      <h2>${artist.username} just uploaded a new track!</h2>
      <p><strong>Track:</strong> ${newTrack.title}</p>
      <p>Check it out on AcousticVersion:</p>
      <a href="${trackUrl}">${trackUrl}</a>
      <br><br>
      <small>You are receiving this email because you follow ${artist.username} on AcousticVersion.</small>
    `,
  };

  await transporter.sendMail(mailOptions);
};