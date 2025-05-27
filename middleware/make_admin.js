import adminsEmails from '../utils/admins.js'
import User from '../models/User.js';
//make admin after login
const makeAdmin = async (req, res, next) => {

    const user = await User.findById(req.userId);
    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }

    if (adminsEmails.includes(user.email)) {
        user.role = 'admin';
        try {
            await user.save();
            console.log(`User ${user.email} has been made an admin.`);
        } catch (err) {
            console.error('Error saving user as admin:', err);
            return res.status(500).json({ message: 'Internal server error' });
        }
    } else {
        console.log(`User ${user.email} is not in the admin list.`);
    }
    next();
}

export default makeAdmin;