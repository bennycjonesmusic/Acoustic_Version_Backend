import User  from '../models/User.js';


const isAdmin = async (req, res, next) => {

    const user = await User.findById(req.userId);
    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }

    
    if (user.role === 'admin') {

        next();
        
    }else{

            return res.status(403).json({ message: "Access denied. You are not an admin." });
        }
}
 
export default isAdmin;