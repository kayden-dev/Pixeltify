import express from "express";
import axios from "axios";
import cryptoRandomString from "crypto-random-string";
import dotenv from "dotenv";
import cookieParser from "cookie-parser"
import queryString from "query-string";
import bodyParser from "body-parser";
import Jimp from "jimp";

// creates the express app and sets up relevant middleware
const app = express();
const port = 3000;
dotenv.config();
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));

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
app.get("/callback", async (req, res) => {
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
                maxAge: 10,//3600000,
                sameSite: true,
                secure: true
            });
            res.cookie("rTok",result.data.refresh_token,{
                httpOnly: true,
                sameSite: true,
                secure: true
            });

            // testing the original access and refresh token
            console.log("original access token " + result.data.access_token);

            // redirects to the start endpoint
            res.redirect("/start");

          } catch (error) {
            res.send("ERROR: " + error.message);
          }
    }
});

// route for starting the game
app.get("/start", async (req,res)=>{
    // retrieves the access token if it exists
    let accessToken;
    if (!req.cookies.aTok){
        // if it doesn't exist, then resets the access token
        console.log("access token does not exist");
        accessToken = await getAccessToken(req);

        res.cookie("aTok",accessToken,{
            httpOnly: true,
            maxAge: 3600000,
            sameSite: true,
            secure: true
        });
    } else {
        accessToken = req.cookies.aTok;
    }
    console.log("received access token: " + accessToken);
    // gets the users top songs and chooses a random album
    try {
        const result1 = await axios.get(/*`https://api.spotify.com/v1/search?q=${queryString.stringify({q:"starboy the weeknd"})}&type=track`*/"https://api.spotify.com/v1/me/top/tracks?time_range=long_term&limit=50&offset=0",{
            headers:{
                "Authorization" : "Bearer " + accessToken
            }
        });
        const result2 = await axios.get(result1.data.next,{
            headers:{
                "Authorization" : "Bearer " + accessToken
            }
        });
        const result3 = await axios.get(result2.data.next,{
            headers:{
                "Authorization" : "Bearer " + accessToken
            }
        });
        const result4 = await axios.get(result3.data.next,{
            headers:{
                "Authorization" : "Bearer " + accessToken
            }
        });


        // chooses a random song and gets its album picture
        const topSongList = result1.data.items.concat(result2.data.items).concat(result3.data.items).concat(result4.data.items);
        topSongList.forEach(song=>{
            console.log(song.name);
        });
        const randomAlbumCover = topSongList[Math.floor(Math.random()*topSongList.length)].album.images[0];

        // saves the album url as a cookie
        res.cookie("img",randomAlbumCover.url);

        // initialises the number of guesses
        res.cookie("guess",0);

        // testing pixelating the image
        const pixelatedImg = await pixelateImage(randomAlbumCover,res);
        console.log(randomAlbumCover.width)
        console.log(randomAlbumCover.url);
        res.send(`<img src="${pixelatedImg}" width="200px"></img>`);

    } catch (error) {
        console.log("ERROR HERE: " + error.message);
    }
    //res.send("start page loaded");
});

// TESTING if cookies are deleted at the end of lifetime specified
// app.get("/cookieTest",(req,res)=>{
//     res.render("cookieTest.ejs");
// });

// app.get("/testCookie",(req,res)=>{
//     console.log(req.cookies.aTok);
//     if(req.cookies.aTok){
//         console.log("cookie alive");
//     } else {
//         console.log("cookie dead");
//     }
// });

app.listen(port,() => {
    console.log(`Server is running on port ${port}`);
});

// function gets the access token using the refresh token
async function getAccessToken (req) {
    // gets the refresh token through the cookie
    const refreshToken = req.cookies.rTok;
    console.log("refresh token is " + refreshToken)
    // retrieves the new access token using the refresh token
    try {
        const result = await axios.post("https://accounts.spotify.com/api/token", {
            grant_type: "refresh_token",
            refresh_token: refreshToken
        },{
            headers:{
                "Content-Type": "application/x-www-form-urlencoded",
                "Authorization" : "Basic " + (new Buffer.from(clientId + ':' + clientSecret).toString('base64'))
            }
            
        });
        // returns the new access token
        console.log("new access token: " + result.data.access_token)
        return result.data.access_token;
    } catch (error) {
        console.log("ERROR: " + error.message);
    }
}

// function pixelates an image and returns the link
async function pixelateImage (imgURL,res) {
    // NOTE: progression idea
    // image cell goes from 320 -> 160 -> 80 -> 40 -> 20
    // player gets 5 guesses per album
    try {
        // gets the image and pixelates it
        const image = await Jimp.read(imgURL);
        image.pixelate(20);

        // saves the image into a buffer and converts it to a base64 string
        const buffer = await image.getBufferAsync(Jimp.MIME_JPEG);
        const base64Image = buffer.toString("base64");

        // saves the image into a data url and returns it
        const dataURL = `data:image/jpeg;base64,${base64Image}`;
        return dataURL;
    } catch (error){
        console.log("Error processing image" + error.message);
    }
}
