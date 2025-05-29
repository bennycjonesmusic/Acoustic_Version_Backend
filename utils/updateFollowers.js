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

  if (process.env.NODE_ENV === 'test') return;
  await transporter.sendMail(mailOptions);
};


export const sendCommissionPreviewEmail = async (customerEmail, artist, commission) => {
  // Direct link to the preview file (assuming a frontend route for preview)
  const previewUrl = `${process.env.FRONTEND_URL}/commission/preview/${commission._id}`;

  const mailOptions = {
    from: `AcousticVersion <${process.env.EMAIL_USER}>`,
    to: customerEmail,
    subject: `Your commission preview from ${artist.username} is ready!`,
    html: `
      <h2>Your commission preview is ready!</h2>
      <p><strong>Artist:</strong> ${artist.username}</p>
      <p><strong>Commission:</strong> ${commission.requirements || 'Custom Backing Track'}</p>
      <p>Click below to listen to your preview and approve or request changes:</p>
      <a href="${previewUrl}">${previewUrl}</a>
      <br><br>
      <small>You will receive the full track link after you confirm you are happy with the preview.</small>
    `,
  };

  if (process.env.NODE_ENV === 'test') return;
  await transporter.sendMail(mailOptions);
};