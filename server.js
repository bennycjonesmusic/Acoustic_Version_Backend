import express from 'express'; //load in the necessary modules. In this case we are using express make it easier to handle HTTP requests and to start the server.
const app = express();

app.get('/', (req, res) =>{

    res.send('Testicles');


});

const port = 3000; //set the port. This will be the port that the server will listen on. Lovely job.

app.listen(port, () => {

console.log(`Server is running on http://localhost:${port}`); //check the console to see if server is running
});