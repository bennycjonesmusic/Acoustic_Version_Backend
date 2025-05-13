import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js;'

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



    } catch (error) {

    }




} )

