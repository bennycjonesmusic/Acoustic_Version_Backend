


const isAdmin = (req, res, next) => {

    if (req.user && req.user.role === 'admin') {

        next();
        
    }else{

            return res.status(403).json({ message: "Access denied. You are not an admin." });
        }
}

export default isAdmin;