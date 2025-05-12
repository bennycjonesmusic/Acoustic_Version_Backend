/* This is the start of my backing tracks project. I will use express to create a server which will serve
as the basis for the backend of the project. I will use AWS to store the audio files, and mangoDB to store 
usernames e.t.c. I will use CORS to effectively communicate between my front-end and back-end. Very saucy */


import express from 'express'; //load in the necessary modules. In this case we are using express make it easier to handle HTTP requests and to start the server.
import dotenv from 'dotenv' // another module. In this case it's to load the environment variables. Nice.
dotenv.config();
const app = express();

app.get('/', (req, res) =>{

    res.send('Testicles');


});

const port = 3000; //set the port. This will be the port that the server will listen on. Lovely job.

app.listen(port, () => {


console.log(`Server is running on http://localhost:${port}`); //check the console to see if server is running
});

//console.log('Access Key:', process.env.AWS_ACCESS_KEY_ID); //check aws has loaded properly. 