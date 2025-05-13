import express from 'express'; //load in the necessary modules. In this case we are using express make it easier to handle HTTP requests and to start the server.
import dotenv from 'dotenv'; // another module. In this case it's to load the environment variables. Nice.
import cors from 'cors'; // This module is used to enable CORS (Cross-origin Resource Sharing) and will enable me to make requests to the server from a different domain. This allows my front end to communicate with my back end. Saucy.
import mongoose from 'mongoose'; // This module is used to connect to MongoDB. For storage of usernames e.t.c
dotenv.config();

//connect to MongoDBAtlas. This will store the data.

mongoose.connect(process.env.MONGODB_URI)
    
    .then(() => {
        console.log('Connected to MongoDB');
    })
    .catch((error) => {
        console.error('Error connecting to MongoDB:', error);
    });
const app = express();

//define the middleware. This will be used to parse the incoming requests. It allows frontend to communicate with the backend.
app.use(cors());
app.use(express.json());
app.get('/', (req, res) =>{

    res.send('Testicles');


});

const port = 3000; //set the port. This will be the port that the server will listen on. Lovely job.

app.listen(port, () => {


console.log(`Server is running on http://localhost:${port}`); //check the console to see if server is running
});

console.log('Access Key:', process.env.AWS_ACCESS_KEY_ID); //check aws has loaded properly. 