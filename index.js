import express from "express";
import axios from "axios";
import cryptoRandomString from "crypto-random-string";
import dotenv from "dotenv";
import cookieParser from "cookie-parser"
import queryString from "query-string";


// creates the express app and sets up relevant middleware
const app = express();
const port = 3000;
dotenv.config();
app.use(cookieParser());

// constants related to the application
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const redirectUri = "http://localhost:3000/callback";

// route for the home page
app.get("/",(req,res)=>{
    res.render("index.ejs");
});

// route for logging into spotify
app.get("/login",(req,res)=>{
    // redirects the user to the spotify authrization page with the appropriate params
    const state = cryptoRandomString({length: 16});
    const scope = "user-top-read";
    res.cookie("auth",state);
    console.log("the state is " + state);

    res.redirect('https://accounts.spotify.com/authorize?' +
        queryString.stringify({
          response_type: 'code',
          client_id: clientId,
          scope: scope,
          redirect_uri: redirectUri,
          state: state
        }));
});

// route called after user authorization
app.get('/callback', async (req, res) => {
    // gets the code, state and stored state from the response
    const code = req.query.code || null; 
    const state = req.query.state || null;
    const storedState = req.cookies ? req.cookies.auth : null;

    // checks if the state matches/exists
    if (state === null || state !== storedState){
        res.send("ERROR: State Mismatch");
    } else {
        // if the state matches/exists, then a request is made to exchange the authorization code for the access token
        try {
            // sends a request for the access token
            const result = await axios.post("https://accounts.spotify.com/api/token", {
                grant_type: "authorization_code",
                code: code,
                redirect_uri: redirectUri
            },{
                headers:{
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Authorization" : "Basic " + (new Buffer.from(clientId + ':' + clientSecret).toString('base64'))
                }
            });

            // saves the access token and refresh token as cookies
            res.cookie("aTok",result.data.access_token,{
                httpOnly: true,
                maxAge: 1000, // NOTE: its in milliseconds
                sameSite: true,
                secure: true
            });
            res.cookie("rTok",result.data.refresh_token,{
                httpOnly: true,
                sameSite: true,
                secure: true
            });

            // testing purposes only
            res.redirect("/cookieTest");
          } catch (error) {
            res.send("ERROR: Unable to get access token " + error.message);
          }
    }
});

// TESTING if cookies are deleted at the end of lifetime specified
app.get("/cookieTest",(req,res)=>{
    res.render("cookieTest.ejs");
});

app.get("/testCookie",(req,res)=>{
    console.log(req.cookies.aTok);
    if(req.cookies.aTok){
        console.log("cookie alive");
    } else {
        console.log("cookie dead");
    }
});
app.listen(port,() => {
    console.log(`Server is running on port ${port}`);
});

