import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import authRoutes from '../routes/auth.js';

//define the router. This will handle the routes and be used to handle requests from the frontend.
const router = express.Router();

//deal with registration first. This will handle user registrations. Post ensures that the data is sent in the body of the request.
router.post('/register', async (req, res) => {

    //try first so if there is an error, it will be caught and handled like a pro.
    try {
    const {email, password} = req.body; //destructure. this makes code cleaner rather than writing req.body.email e.t.c
    const existingUser = await User.findOne({ email });

    if (existingUser){
        return res.status(400).json({ message: "User already exists!" }); }
        //res is the response object. We will send a response back to the client. 400 means naughty request.
        
        //hash the password. encrypt it so that it is not readable in the database. Privacy innit.
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({
            email,
            password: hashedPassword,
            
        
        })

        // save the user to the database. .save is a mongoose method that saves the user to the database (mongodb).
         await newUser.save();
         res.status(201).json({ message: "User has been registered!" });
         //201 means created. This means that the user has successfully been created in the database. Wonderful.
    
} catch (error) {
    console.error('Error checking for existing user:', error);
    return res.status(500).json({ message: "Internal server error" });
    //500 means internal server error. Error on the server (response side).
}


})

//now let us deal with login. We will use post again, in order to send the data to the client.
router.post('/login', async (req, res) => {

    try {

        const {email, password} = req.body; //destructuring again. how repetitive. 
        const user = await User.findOne({email}); //find the user in the database. Will return user if found, otherwise null.
        if (!user) {

            return res.status(400).json({ message: "Invalid email or password" });
            //400 means naughty request. User not found. No cake for you.
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({message: "Invalid email or password" })
        
        
        }
        const token = jwt.sign({ id: user._id, email : user.email}, //sign the token. This will be used to authenticate the user in the future.
       //payload is the data that will be stored in the token, in this case the user id and email.
       //this is the very secret key that will be used to sign the token. Keep it secret, keep it safe.
            process.env.JWT_SECRET,
        { expiresIn: '2h' })

        res.status(200).json({token, message: "Logged in successfully!"})


    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).json({ message: "Internal server error" });
        //500 means error on the server side.
    }




});

//return the router. This will be used in the server.js file to handle the routes and to handle the requests from the front end.
export default router;

