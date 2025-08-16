// ESM-compatible nodemailer mock for Jest
jest.unstable_mockModule('nodemailer', () => ({
  createTransport: () => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'mocked' }),
  }),
}));
